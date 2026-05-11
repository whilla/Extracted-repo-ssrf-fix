'use client';

/**
 * NEXUS AI HOOK
 * React hook for interacting with the NEXUS AI system
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  nexusCore, 
  type NexusRequest, 
  type NexusResult 
} from '@/lib/core';
import { automationEngine, type AutomationStats } from '@/lib/core/AutomationEngine';
import type { BaseAgent } from '@/lib/agents';

export interface UseNexusState {
  isInitialized: boolean;
  isGenerating: boolean;
  lastResult: NexusResult | null;
  error: string | null;
  agents: AgentInfo[];
  automationStats: AutomationStats | null;
  systemStatus: SystemStatus | null;
}

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  performanceScore: number;
  trend: string;
  evolutionVersion: number;
  heartbeatAt: string | null;
  brainState: 'idle' | 'thinking' | 'executing' | 'recovering' | 'healthy' | 'degraded';
  lastDecision: string | null;
}

export interface SystemStatus {
  isInitialized: boolean;
  activeAgents: number;
  totalRequests: number;
  totalSuccesses: number;
  lastError: string | null;
}

export interface UseNexusReturn extends UseNexusState {
  // Generation
  generate: (request: NexusRequest) => Promise<NexusResult>;
  quickGenerate: (input: string, platform?: string) => Promise<NexusResult>;
  
  // Automation
  toggleAutomation: () => Promise<boolean>;
  isAutomationRunning: boolean;
  
  // System
  refreshStatus: () => Promise<void>;
  getAgents: () => AgentInfo[];
}

/**
 * useNexus Hook
 * Main hook for interacting with NEXUS AI
 */
export function useNexus(): UseNexusReturn {
  const [state, setState] = useState<UseNexusState>({
    isInitialized: false,
    isGenerating: false,
    lastResult: null,
    error: null,
    agents: [],
    automationStats: null,
    systemStatus: null,
  });

  const initializingRef = useRef(false);

  // Initialize system on mount
  useEffect(() => {
    const init = async () => {
      if (initializingRef.current) return;
      initializingRef.current = true;

      try {
        await nexusCore.initialize();
        await automationEngine.initialize();

        const agents = nexusCore.getAgents().map((agent) => {
          const stats = agent.getStats();
          return {
            id: stats.id,
            name: stats.name,
            role: stats.role,
            performanceScore: stats.performanceScore,
            trend: stats.trend,
            evolutionVersion: stats.evolutionVersion,
            heartbeatAt: stats.heartbeatAt,
            brainState: stats.brainState,
            lastDecision: stats.lastDecision,
          };
        });

        const status = nexusCore.getStatus();
        const autoStats = automationEngine.getStats();

        setState(prev => ({
          ...prev,
          isInitialized: true,
          agents,
          systemStatus: status,
          automationStats: autoStats,
        }));
      } catch (error) {
        console.error('[useNexus] Initialization error:', error);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to initialize',
        }));
      }
    };

    init();
  }, []);

  // Generate content
  const generate = useCallback(async (request: NexusRequest): Promise<NexusResult> => {
    setState(prev => ({ ...prev, isGenerating: true, error: null }));

    try {
      const result = await nexusCore.execute(request);

      // Update agents after generation (they may have self-optimized)
      const agents = nexusCore.getAgents().map((agent) => {
        const stats = agent.getStats();
        return {
          id: stats.id,
          name: stats.name,
          role: stats.role,
          performanceScore: stats.performanceScore,
          trend: stats.trend,
          evolutionVersion: stats.evolutionVersion,
          heartbeatAt: stats.heartbeatAt,
          brainState: stats.brainState,
          lastDecision: stats.lastDecision,
        };
      });

      setState(prev => ({
        ...prev,
        isGenerating: false,
        lastResult: result,
        agents,
        systemStatus: nexusCore.getStatus(),
      }));

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Generation failed';
      
      setState(prev => ({
        ...prev,
        isGenerating: false,
        error: errorMessage,
      }));

      // Return error result
      return {
        success: false,
        output: '',
        score: 0,
        suite: {
          champion: { text: '', assets: [], version: 0 },
          challengers: [],
        },
        allOutputs: [],
        selectedAgent: '',
        provider: 'none',
        governorValidation: {
          approved: false,
          score: 0,
          issues: [{ type: 'error', severity: 'critical', message: errorMessage }],
          feedback: errorMessage,
        },
        memoryContext: { brandMemory: null, contentHistory: [], performanceLogs: [], agentLogs: [] },
        metadata: {
          totalDuration: 0,
          agentsSpawned: 0,
          agentsSucceeded: 0,
          providersAttempted: [],
          regenerations: 0,
          learningUpdated: false,
        },
      };
    }
  }, []);

  // Quick generate (simplified)
  const quickGenerate = useCallback(async (
    input: string, 
    platform = 'twitter'
  ): Promise<NexusResult> => {
    return generate({
      userInput: input,
      taskType: 'content',
      platform,
    });
  }, [generate]);

  // Toggle automation
  const toggleAutomation = useCallback(async (): Promise<boolean> => {
    const isRunning = await automationEngine.toggle();
    
    setState(prev => ({
      ...prev,
      automationStats: automationEngine.getStats(),
    }));

    return isRunning;
  }, []);

  // Refresh status
  const refreshStatus = useCallback(async () => {
    const agents = nexusCore.getAgents().map((agent) => {
      const stats = agent.getStats();
      return {
        id: stats.id,
        name: stats.name,
        role: stats.role,
        performanceScore: stats.performanceScore,
        trend: stats.trend,
        evolutionVersion: stats.evolutionVersion,
        heartbeatAt: stats.heartbeatAt,
        brainState: stats.brainState,
        lastDecision: stats.lastDecision,
      };
    });

    setState(prev => ({
      ...prev,
      agents,
      systemStatus: nexusCore.getStatus(),
      automationStats: automationEngine.getStats(),
    }));
  }, []);

  // Get agents
  const getAgents = useCallback((): AgentInfo[] => {
    return state.agents;
  }, [state.agents]);

  return {
    ...state,
    generate,
    quickGenerate,
    toggleAutomation,
    isAutomationRunning: state.automationStats?.isRunning || false,
    refreshStatus,
    getAgents,
  };
}

/**
 * useNexusGeneration Hook
 * Simplified hook for just content generation
 */
export function useNexusGeneration() {
  const { generate, quickGenerate, isGenerating, lastResult, error } = useNexus();
  
  return {
    generate,
    quickGenerate,
    isGenerating,
    lastResult,
    error,
  };
}

/**
 * useNexusAutomation Hook
 * Hook for automation control
 */
export function useNexusAutomation() {
  const [config, setConfig] = useState(automationEngine.getConfig());
  const [state, setState] = useState(automationEngine.getState());
  const [outputs, setOutputs] = useState(automationEngine.getOutputs({ limit: 20 }));

  const refresh = useCallback(() => {
    setConfig(automationEngine.getConfig());
    setState(automationEngine.getState());
    setOutputs(automationEngine.getOutputs({ limit: 20 }));
  }, []);

  // Poll for updates when running
  useEffect(() => {
    if (!state.isRunning) return;

    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [state.isRunning, refresh]);

  const toggle = useCallback(async () => {
    await automationEngine.toggle();
    refresh();
  }, [refresh]);

  const updateConfig = useCallback(async (updates: Partial<typeof config>) => {
    await automationEngine.updateConfig(updates);
    refresh();
  }, [refresh]);

  const approveOutput = useCallback(async (id: string) => {
    await automationEngine.approveOutput(id);
    refresh();
  }, [refresh]);

  const rejectOutput = useCallback(async (id: string) => {
    await automationEngine.rejectOutput(id);
    refresh();
  }, [refresh]);

  return {
    config,
    state,
    outputs,
    toggle,
    updateConfig,
    approveOutput,
    rejectOutput,
    refresh,
  };
}

/**
 * useNexusAgents Hook
 * Hook for monitoring agents
 */
export function useNexusAgents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    try {
      const agentList = nexusCore.getAgents().map((agent) => {
        const stats = agent.getStats();
        return {
          id: stats.id,
          name: stats.name,
          role: stats.role,
          performanceScore: stats.performanceScore,
          trend: stats.trend,
          evolutionVersion: stats.evolutionVersion,
          heartbeatAt: stats.heartbeatAt,
          brainState: stats.brainState,
          lastDecision: stats.lastDecision,
        };
      });
      setAgents(agentList);
    } catch {
      setAgents([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await nexusCore.initialize();
        refresh();
      } catch {
        setLoading(false);
      }
    };
    init();
  }, [refresh]);

  return {
    agents,
    loading,
    refresh,
  };
}

export default useNexus;
