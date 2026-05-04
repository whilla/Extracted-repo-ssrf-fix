// Evolution Tracking Service
// Records and retrieves the Manager's autonomous decisions and system changes.

import { kvGet, kvSet } from './puterService';
import { generateId } from './memoryService';

export interface EvolutionEvent {
  id: string;
  timestamp: string;
  type: 'module_deploy' | 'weight_update' | 'agent_promotion' | 'rollback' | 'config_change';
  description: string;
  impact: 'positive' | 'neutral' | 'negative' | 'unknown';
  details: {
    agentId?: string;
    moduleId?: string;
    before?: any;
    after?: any;
    reasoning: string;
  };
  scoreDelta?: number;
}

const EVOLUTION_LOG_KEY = 'nexus_evolution_log';

export async function logEvolutionEvent(
  type: EvolutionEvent['type'],
  description: string,
  details: EvolutionEvent['details'],
  impact: EvolutionEvent['impact'] = 'unknown',
  scoreDelta?: number
): Promise<string> {
  const id = generateId();
  const event: EvolutionEvent = {
    id,
    timestamp: new Date().toISOString(),
    type,
    description,
    impact,
    details,
    scoreDelta,
  };

  const log = await getEvolutionLog();
  log.unshift(event); // Newest first
  
  // Keep last 1000 events
  const prunedLog = log.slice(0, 1000);
  await saveEvolutionLog(prunedLog);
  
  return id;
}

export async function getEvolutionLog(): Promise<EvolutionEvent[]> {
  try {
    const data = await kvGet(EVOLUTION_LOG_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function getEvolutionStats() {
  const log = await getEvolutionLog();
  return {
    totalChanges: log.length,
    positiveChanges: log.filter(e => e.impact === 'positive').length,
    rollbacks: log.filter(e => e.type === 'rollback').length,
    latestChange: log[0] || null,
  };
}

async function saveEvolutionLog(log: EvolutionEvent[]): Promise<void> {
  await kvSet(EVOLUTION_LOG_KEY, JSON.stringify(log));
}
