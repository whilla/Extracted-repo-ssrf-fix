import { createClient } from '@supabase/supabase-js';

export interface ActionLog {
  id?: string;
  agent_id: string;
  plan_id?: string;
  step_id?: string;
  status: 'thinking' | 'acting' | 'completed' | 'failed' | 'waiting';
  message: string;
  metadata?: Record<string, any>;
  created_at?: string;
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key);
}

export class logService {
  private static _supabase: ReturnType<typeof createClient> | null = null;

  private static get supabase() {
    if (!this._supabase) {
      this._supabase = getSupabaseClient();
    }
    return this._supabase;
  }

  /**
   * Log a new action event in the agent's timeline
   */
  static async logEvent(event: Omit<ActionLog, 'id' | 'created_at'>) {
    const supabase = this.supabase;
    if (!supabase) {
      console.log('[logService] Supabase not configured, skipping log');
      return true;
    }
    
    const { error } = await supabase
      .from('agent_action_logs')
      .insert(event);

    if (error) {
      console.error('[logService] Error logging event:', error);
      throw error;
    }

    return true;
  }

  /**
   * Retrieve the most recent logs for an agent to populate the timeline
   */
  static async getRecentLogs(agentId: string, limit = 50) {
    const supabase = this.supabase;
    if (!supabase) {
      return [];
    }
    
    const { data, error } = await supabase
      .from('agent_action_logs')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[logService] Error fetching logs:', error);
      throw error;
    }

    return data;
  }

  /**
   * Clear logs for an agent (e.g. when a new plan starts)
   */
  static async clearLogs(agentId: string) {
    const supabase = this.supabase;
    if (!supabase) {
      return true;
    }
    
    const { error } = await supabase
      .from('agent_action_logs')
      .delete()
      .eq('agent_id', agentId);

    if (error) {
      console.error('[logService] Error clearing logs:', error);
      throw error;
    }

    return true;
  }
}
