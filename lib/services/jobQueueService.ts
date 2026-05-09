/**
 * Job Queue Service
 * Simple in-memory job queue with persistence
 * For production, use BullMQ or similar
 */

import { kvGet, kvSet } from './puterService';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'retrying';
export type JobPriority = 'low' | 'normal' | 'high' | 'critical';

export interface Job<T = unknown> {
  id: string;
  type: string;
  payload: T;
  status: JobStatus;
  priority: JobPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  result?: unknown;
}

interface QueueState {
  jobs: Record<string, Job>;
  pendingIds: string[];
}

const QUEUE_STATE_KEY = 'nexus_job_queue';
const MAX_QUEUE_SIZE = 1000;

function generateId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadQueue(): Promise<QueueState> {
  const data = await kvGet(QUEUE_STATE_KEY);
  if (data) {
    return JSON.parse(data);
  }
  return { jobs: {}, pendingIds: [] };
}

async function saveQueue(state: QueueState): Promise<void> {
  await kvSet(QUEUE_STATE_KEY, JSON.stringify(state));
}

export async function enqueueJob<T>(
  type: string,
  payload: T,
  options: { priority?: JobPriority; maxAttempts?: number } = {}
): Promise<string> {
  const state = await loadQueue();
  
  const id = generateId();
  const now = new Date().toISOString();
  
  const job: Job<T> = {
    id,
    type,
    payload,
    status: 'pending',
    priority: options.priority || 'normal',
    attempts: 0,
    maxAttempts: options.maxAttempts || 3,
    createdAt: now,
  };
  
  state.jobs[id] = job as Job;
  
  const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
  const insertIndex = state.pendingIds.findIndex(existingId => {
    const existing = state.jobs[existingId];
    return priorityOrder[job.priority] <= priorityOrder[existing.priority];
  });
  
  if (insertIndex === -1) {
    state.pendingIds.push(id);
  } else {
    state.pendingIds.splice(insertIndex, 0, id);
  }
  
  if (state.pendingIds.length > MAX_QUEUE_SIZE) {
    const removed = state.pendingIds.shift();
    if (removed) {
      delete state.jobs[removed];
    }
  }
  
  await saveQueue(state);
  
  processJob(job).catch(console.error);
  
  return id;
}

async function processJob(job: Job): Promise<void> {
  const state = await loadQueue();
  
  if (!state.jobs[job.id]) return;
  
  job.status = 'processing';
  job.startedAt = new Date().toISOString();
  state.jobs[job.id] = job;
  await saveQueue(state);
  
  try {
    const handler = jobHandlers[job.type];
    
    if (!handler) {
      throw new Error(`No handler for job type: ${job.type}`);
    }
    
    const result = await handler(job.payload);
    
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.result = result;
    
  } catch (error) {
    job.attempts++;
    job.error = error instanceof Error ? error.message : String(error);
    
    if (job.attempts < job.maxAttempts) {
      job.status = 'retrying';
      setTimeout(() => processJob(job), Math.pow(2, job.attempts) * 1000);
    } else {
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
    }
  }
  
  state.jobs[job.id] = job;
  await saveQueue(state);
}

const jobHandlers: Record<string, (payload: unknown) => Promise<unknown>> = {
  'media:generate': async (payload) => {
    console.log('[JobQueue] Processing media generation:', payload);
    return { success: true };
  },
  'publish:schedule': async (payload) => {
    console.log('[JobQueue] Processing scheduled publish:', payload);
    return { success: true };
  },
  'content:analyze': async (payload) => {
    console.log('[JobQueue] Processing content analysis:', payload);
    return { success: true };
  },
};

export async function getJobStatus(jobId: string): Promise<Job | null> {
  const state = await loadQueue();
  return state.jobs[jobId] || null;
}

export async function getQueuedJobs(): Promise<Job[]> {
  const state = await loadQueue();
  return state.pendingIds.map(id => state.jobs[id]).filter(Boolean);
}

export async function cancelJob(jobId: string): Promise<boolean> {
  const state = await loadQueue();
  
  if (!state.jobs[jobId]) return false;
  
  if (state.jobs[jobId].status === 'pending') {
    state.jobs[jobId].status = 'failed';
    state.jobs[jobId].completedAt = new Date().toISOString();
    state.pendingIds = state.pendingIds.filter(id => id !== jobId);
    await saveQueue(state);
    return true;
  }
  
  return false;
}

export async function clearCompletedJobs(olderThanDays: number = 7): Promise<number> {
  const state = await loadQueue();
  const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
  
  let cleared = 0;
  for (const [id, job] of Object.entries(state.jobs)) {
    if (job.status === 'completed' && new Date(job.completedAt!).getTime() < cutoff) {
      delete state.jobs[id];
      cleared++;
    }
  }
  
  await saveQueue(state);
  return cleared;
}