/**
 * GENERATION PERSISTENCE SERVICE
 * Implements the "AI Generation Persistence" pattern
 * 
 * Responsibilities:
 * - Persist every LLM generation result
 * - Track token usage and costs
 * - Provide addressable IDs for every generation
 * - Handle storage of generated media URLs
 */

import { supabaseServer } from './supabase/server';
import { nanoid } from 'nanoid';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerationRecord {
  id: string;
  userId: string;
  workspaceId?: string;
  model: string;
  prompt: string;
  result?: string;
  mediaUrls?: string[];
  tokenUsage?: TokenUsage;
  estimatedCostCents?: number;
  status: 'pending' | 'streaming' | 'complete' | 'error';
  taskType?: string;
  platform?: string;
}

export class GenerationPersistenceService {
  /**
   * Create a pending record before generation starts
   */
  async createPendingGeneration(userId: string, workspaceId: string, model: string, prompt: string, taskType?: string, platform?: string): Promise<string> {
    const id = nanoid();
    
    const { error } = await supabaseServer.from('generations').insert({
      id,
      user_id: userId,
      workspace_id: workspaceId,
      model,
      prompt,
      status: 'pending',
      task_type: taskType,
      platform,
    });

    if (error) {
      console.error('[GenerationPersistenceService] Failed to create pending record:', error);
      throw error;
    }

    return id;
  }

  /**
   * Update a generation record with the final result and metadata
   */
  async completeGeneration(
    id: string, 
    result: string, 
    tokenUsage: TokenUsage, 
    costCents: number, 
    mediaUrls: string[] = []
  ): Promise<void> {
    const { data, error } = await supabaseServer
      .from('generations')
      .update({
        result,
        token_usage: tokenUsage,
        estimated_cost_cents: costCents,
        media_urls: mediaUrls,
        status: 'complete',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select();

    if (error) {
      console.error('[GenerationPersistenceService] Failed to complete record:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error(`Generation record with id ${id} not found`);
    }
  }

  /**
   * Mark a generation as failed
   */
  async markAsFailed(id: string, error: string): Promise<void> {
    const { error: updateError } = await supabaseServer
      .from('generations')
      .update({
        status: 'error',
        error_message: error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) {
      console.error('[GenerationPersistenceService] Failed to mark as failed:', updateError);
      throw updateError;
    }
  }

  /**
   * Retrieve a specific generation by ID
   */
  async getGeneration(id: string): Promise<GenerationRecord | null> {
    const { data, error } = await supabaseServer
      .from('generations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      workspaceId: data.workspace_id,
      model: data.model,
      prompt: data.prompt,
      result: data.result,
      mediaUrls: data.media_urls || [],
      tokenUsage: data.token_usage,
      estimatedCostCents: data.estimated_cost_cents,
      status: data.status,
      taskType: data.task_type,
      platform: data.platform,
    };
  }

  /**
   * Get recent generations for a user
   */
  async getUserGenerations(userId: string, limit = 20): Promise<GenerationRecord[]> {
    const { data, error } = await supabaseServer
      .from('generations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    if (!data) return [];

    return data.map(row => ({
      id: row.id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      model: row.model,
      prompt: row.prompt,
      result: row.result,
      mediaUrls: row.media_urls || [],
      tokenUsage: row.token_usage,
      estimatedCostCents: row.estimated_cost_cents,
      status: row.status,
      taskType: row.task_type,
      platform: row.platform,
    }));
  }
}

export const generationPersistenceService = new GenerationPersistenceService();
