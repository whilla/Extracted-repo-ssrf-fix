/**
 * RELIABLE JOB QUEUE SERVICE
 * Database-backed queue replacing the fragile in-memory JSON implementation.
 */

import { supabase } from '@/lib/supabase'; // Assuming supabase client is available
import type { JobStatus, JobPriority } from './types'; // Define these in a types file or locally

export interface Job<T = unknown> {
  id: string;
  job_type: string;
  payload: T;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export const jobQueueService = {
  /**
   * Enqueue a new job into the database.
   */
  async enqueueJob<T>(
    type: string,
    payload: T,
    userId: string,
    workspaceId?: string,
    options: { priority?: number; maxAttempts?: number } = {}
  ): Promise<string> {
    const { data, error } = await supabase
      .from('system_jobs')
      .insert({
        job_type: type,
        payload,
        user_id: userId,
        workspace_id: workspaceId,
        priority: options.priority ?? 2,
        max_attempts: options.maxAttempts ?? 3,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new Error(`Queue Insert Failed: ${error.message}`);
    return data.id;
  },

  /**
   * Claims the next available job using a row-level lock (SKIP LOCKED)
   * to prevent multiple workers from picking up the same job.
   */
  async claimNextJob(): Promise<Job | null> {
    // This uses a Supabase RPC or a complex query to ensure atomicity
    const { data, error } = await supabase.rpc('claim_next_job');
    
    if (error) {
      console.error('[JobQueue] Error claiming job:', error);
      return null;
    }
    return data as Job | null;
  },

  /**
   * Mark a job as completed.
   */
  async completeJob(jobId: string, result?: any): Promise<void> {
    const { error } = await supabase
      .from('system_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        payload: { ...JSON.parse(await (await supabase.from('system_jobs').select('payload').eq('id', jobId).single()).data?.payload || '{}'), result },
      })
      .eq('id', jobId);

    if (error) throw new Error(`Job Completion Failed: ${error.message}`);
  },

  /**
   * Mark a job as failed and handle retries.
   */
  async failJob(jobId: string, error: string): Promise<void> {
    const { data: job } = await supabase
      .from('system_jobs')
      .select('attempts, max_attempts')
      .eq('id', jobId)
      .single();

    if (!job) return;

    const nextStatus = job.attempts + 1 < job.max_attempts ? 'pending' : 'failed';
    
    const { error: updateError } = await supabase
      .from('system_jobs')
      .update({
        status: nextStatus,
        attempts: job.attempts + 1,
        error_message: error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateError) throw new Error(`Job Failure Update Failed: ${updateError.message}`);
  },

  /**
   * Get status of a specific job.
   */
  async getJobStatus(jobId: string): Promise<Job | null> {
    const { data, error } = await supabase
      .from('system_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) return null;
    return data as Job;
  }
};
