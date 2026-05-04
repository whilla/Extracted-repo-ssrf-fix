// Billing Service
// Manages cost tracking and provider settlement.

import { kvGet, kvSet } from './puterService';

export async function trackResourceCost(provider: string, cost: number, taskId: string) {
  const costLog = await kvGet('nexus_cost_log') || '[]';
  const logs = JSON.parse(costLog);
  logs.push({ provider, cost, taskId, timestamp: new Date().toISOString() });
  await kvSet('nexus_cost_log', JSON.stringify(logs.slice(-1000)));
}

export async function getTotalExpenditure() {
  const costLog = await kvGet('nexus_cost_log') || '[]';
  const logs = JSON.parse(costLog);
  return logs.reduce((sum: number, entry: any) => sum + entry.cost, 0);
}
