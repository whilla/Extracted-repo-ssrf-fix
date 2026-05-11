// System Activation Controller
// The "Master Switch" for full system autonomy.

import { initializeOrchestrationSystem, orchestrate } from './orchestrationEngine';
import { loadAgents } from './multiAgentService';
import { kvGet, kvSet } from './puterService';
import { logEvolutionEvent } from './evolutionLogService';

export async function activateFullSystem(northStarGoal: string) {
  console.log('🚀 INITIALIZING FULL SYSTEM ACTIVATION...');
  
  // 1. Boot the Orchestration Engine
  await initializeOrchestrationSystem();
  
  // 2. Set the Sovereign Goal
  await kvSet('nexus_north_star', JSON.stringify({
    goal: northStarGoal,
    activatedAt: new Date().toISOString(),
    status: 'active',
  }));
  
  // 3. Enable Autopilot Mode
  await kvSet('nexus_autopilot_state', JSON.stringify({
    isRunning: true,
    lastRun: new Date().toISOString(),
    currentObjective: northStarGoal,
  }));
  
  // 4. Trigger Initial Evolution Scan
  await logEvolutionEvent({
    version: '1.0.0',
    changeType: 'config_change',
    description: 'FULL SYSTEM ACTIVATION: Autopilot Mode Engaged',
    diff: { reasoning: `Initiating autonomous operations towards goal: ${northStarGoal}` },
  });

  console.log('✅ SYSTEM ACTIVATED. Manager is now operational.');
  
  return {
    status: 'activated',
    goal: northStarGoal,
    timestamp: new Date().toISOString(),
  };
}
