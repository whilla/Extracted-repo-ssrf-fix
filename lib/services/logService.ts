// Lazy-load supabase to avoid build-time errors when env vars are missing
let supabaseClient: any = null;

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
  if (!supabaseClient) {
    const { createClient } = require('@supabase/supabase-js');
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

export class logService {
  private static get supabase() {
    return getSupabaseClient();
  }

  private static requireSupabase(method: string) {
    const supabase = this.supabase;
    if (!supabase) {
      throw new Error(`[logService.${method}] Supabase not configured`);
    }
    return supabase;
  }

  /**
   * Log a new action event in the agent's timeline
   */
  static async logEvent(event: Omit<ActionLog, 'id' | 'created_at'>) {
    const supabase = this.requireSupabase('logEvent');
    
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
    const supabase = this.requireSupabase('getRecentLogs');
    
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
    const supabase = this.requireSupabase('clearLogs');
    
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
