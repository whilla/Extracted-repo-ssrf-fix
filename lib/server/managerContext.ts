// Manager Context API
// This is the ONLY object exposed to sandboxed AI-generated modules.
// It provides a safe, audited bridge to the system's core functions.

import { kvGet, kvSet } from './puterService';
import { updateAgent } from './multiAgentService';

export interface ManagerContext {
  kv: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };
  agents: {
    updateWeights: (id: string, weights: any) => Promise<void>;
    updatePerformance: (id: string, score: number) => Promise<void>;
  };
  system: {
    log: (message: string, level: 'info' | 'warn' | 'error') => void;
    timestamp: () => string;
  };
}

export function createManagerContext(): ManagerContext {
  return {
    kv: {
      get: async (key) => await kvGet(key),
      set: async (key, value) => await kvSet(key, value),
    },
    agents: {
      updateWeights: async (id, weights) => {
        await updateAgent(id, { scoringWeights: weights });
      },
      updatePerformance: async (id, score) => {
        await updateAgent(id, { performanceScore: score });
      },
    },
    system: {
      log: (message, level) => {
        console.log(`[AI-MANAGER][${level.toUpperCase()}] ${message}`);
      },
      timestamp: () => new Date().toISOString(),
    },
  };
}
