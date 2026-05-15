import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { jobQueueService } from './jobQueueService';

export interface JobProgress {
  percent: number;
  message: string;
}

export interface EnqueueOptions {
  priority?: number;
  maxAttempts?: number;
}

export interface JobResult<T = unknown> {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: JobProgress;
  result?: T;
  error?: string;
}

export async function enqueueJob<T>(
  type: string,
  payload: T,
  userId: string,
  workspaceId?: string,
  options: EnqueueOptions = {}
): Promise<string> {
  return jobQueueService.enqueueJob(type, payload, userId, workspaceId, {
    priority: options.priority,
    maxAttempts: options.maxAttempts,
  });
}

export async function updateJobProgress(
  jobId: string,
  progress: JobProgress
): Promise<void> {
  const supabase = await getSupabaseAdminClient();
  const { error } = await (supabase as any)
    .from('system_jobs')
    .update({ progress, updated_at: new Date().toISOString() } as any)
    .eq('id', jobId);
  if (error) {
    console.error('[executeWithQueue] Failed to update job progress:', error);
  }
}

export async function getJobStatus(jobId: string): Promise<JobResult | null> {
  const job = await jobQueueService.getJobStatus(jobId);
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    progress: (job as any).progress || undefined,
    result: (job as any).result || undefined,
    error: job.error_message || undefined,
  };
}

export async function waitForJob<T = unknown>(
  jobId: string,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<JobResult<T>> {
  const { intervalMs = 1000, timeoutMs = 120000 } = options;

  if (typeof intervalMs !== 'number' || intervalMs <= 0) {
    throw new Error('waitForJob: intervalMs must be a positive number');
  }
  if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
    throw new Error('waitForJob: timeoutMs must be a positive number');
  }

  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await getJobStatus(jobId);
    if (!result) throw new Error(`Job ${jobId} not found`);
    if (result.status === 'completed' || result.status === 'failed') {
      return result as JobResult<T>;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`);
}
