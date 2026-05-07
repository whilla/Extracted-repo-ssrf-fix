'use client';

import type { Platform } from '@/lib/types';
import { generateId } from './memoryService';
import { supabase } from '@/lib/supabase/client';
import type { QueuedPostJob } from '@/lib/types';

export async function enqueuePostJob(input: {
  text: string;
  platforms: Platform[];
  mediaUrl?: string;
  generationId?: string;
  pipelineRunId?: string;
  niche?: string;
  hook?: string;
  scheduledAt?: string;
}): Promise<QueuedPostJob> {
  if (!supabase) throw new Error('Supabase client not initialized');

  const now = new Date().toISOString();
  const job: QueuedPostJob = {
    id: generateId(),
    text: input.text,
    platforms: input.platforms,
    mediaUrl: input.mediaUrl,
    generationId: input.generationId,
    pipelineRunId: input.pipelineRunId,
    niche: input.niche,
    hook: input.hook,
    scheduledAt: input.scheduledAt,
    status: 'queued',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };

  const { error } = await supabase
    .from('posts_queue')
    .insert([job]);

  if (error) throw error;
  return job;
}

export async function loadQueuedPostJobs(): Promise<QueuedPostJob[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('posts_queue')
    .select('*')
    .order('createdAt', { ascending: true });

  if (error) {
    console.error('[PostQueueService] Failed to load jobs:', error);
    return [];
  }

  return data || [];
}

export async function updateQueuedPostJob(jobId: string, updates: Partial<QueuedPostJob>): Promise<void> {
  if (!supabase) throw new Error('Supabase client not initialized');

  const { error } = await supabase
    .from('posts_queue')
    .update({ ...updates, updatedAt: new Date().toISOString() })
    .eq('id', jobId);

  if (error) throw error;
}

export async function removeQueuedPostJob(jobId: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('posts_queue')
    .delete()
    .eq('id', jobId);

  return !error;
}
