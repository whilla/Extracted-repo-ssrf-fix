// Plan Storage Service
// Persists orchestration plans and their results for CEO oversight.

import { kvGet, kvSet } from './puterService';
import { generateId } from './memoryService';
import type { OrchestrationPlan, AgentOutput } from './multiAgentService';

export interface PersistedPlan extends OrchestrationPlan {
  results: AgentOutput[];
  finalCombinedOutput?: string;
  startTime: string;
  endTime?: string;
  status: OrchestrationPlan['status'];
}

const PLANS_STORAGE_KEY = 'nexus_orchestration_plans';

export async function savePlan(plan: OrchestrationPlan, outputs: AgentOutput[], combined?: string, startTime?: string): Promise<void> {
  const plans = await getAllPlans();
  
  const updatedPlan: PersistedPlan = {
    ...plan,
    results: outputs,
    finalCombinedOutput: combined,
    startTime: startTime || new Date().toISOString(),
    endTime: new Date().toISOString(),
  };

  const index = plans.findIndex(p => p.id === plan.id);
  if (index >= 0) {
    plans[index] = updatedPlan;
  } else {
    plans.unshift(updatedPlan);
  }

  // Keep last 100 plans
  await kvSet(PLANS_STORAGE_KEY, JSON.stringify(plans.slice(0, 100)));
}

export async function getAllPlans(): Promise<PersistedPlan[]> {
  try {
    const data = await kvGet(PLANS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function getPlanById(id: string): Promise<PersistedPlan | null> {
  const plans = await getAllPlans();
  return plans.find(p => p.id === id) || null;
}
