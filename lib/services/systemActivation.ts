// System Activation Controller
// The "Master Switch" for full system autonomy.

import { initializeOrchestrationSystem, orchestrate } from './orchestrationEngine';
import { loadAgents } from './multiAgentService';
import { kvGet, kvSet } from './puterService';
import { logEvolutionEvent } from './evolutionLogService';
import { automationEngine } from '@/lib/core/AutomationEngine';

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
  
  // 3. Initialize agents
  try {
    await loadAgents();
  } catch (error) {
    console.warn('[Activation] Agent loading warning:', error);
  }

  // 4. Start Automation Engine
  try {
    await automationEngine.initialize();
    await automationEngine.start();
    console.log('[Activation] Automation engine started successfully.');
  } catch (error) {
    console.warn('[Activation] Automation engine start warning:', error);
  }
  
  // 5. Enable Autopilot Mode
  await kvSet('nexus_autopilot_state', JSON.stringify({
    isRunning: true,
    lastRun: new Date().toISOString(),
    currentObjective: northStarGoal,
  }));
  
  // 6. Trigger Initial Evolution Scan
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
