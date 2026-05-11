import { createClient } from '@/lib/supabase/server';

export interface EvolutionLog {
  version: string;
  changeType: string;
  description: string;
  diff?: any;
}

export async function saveEvolutionLog(log: EvolutionLog) {
  const supabase = await createClient();
  
  const { error } = await supabase
    .from('evolution_logs')
    .insert({
      version: log.version,
      change_type: log.changeType,
      description: log.description,
      diff: log.diff,
    } as any);

  if (error) throw error;
}

export async function getEvolutionHistory() {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('evolution_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export const getEvolutionLog = getEvolutionHistory;
export const logEvolutionEvent = saveEvolutionLog;

export async function getEvolutionStats() {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('evolution_logs')
    .select('*', { count: 'exact', head: true });

  if (error) throw error;
  return { totalEvents: count || 0 };
}
