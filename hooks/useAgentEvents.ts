'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  startAgentActivity,
  updateAgentActivity,
  completeAgentActivity,
  updateAgentMetrics,
  updateAgentHealth,
  type AgentActivityStatus,
  type AgentHealthStatus,
} from '@/lib/services/agentMonitorService';

interface AgentTaskContext {
  agentId: string;
  agentName: string;
  role: string;
}

const activeTasks = new Map<string, AgentTaskContext>();
const agentLastSeen = new Map<string, number>();

export function useAgentEvents() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startTask = useCallback(async (
    agentId: string,
    agentName: string,
    role: string,
    task: string,
    metadata?: Record<string, unknown>
  ) => {
    activeTasks.set(task, { agentId, agentName, role });
    agentLastSeen.set(agentId, Date.now());

    await startAgentActivity(agentId, agentName, role, task, metadata);
    await updateAgentHealth(agentId, 'healthy');
  }, []);

  const updateTask = useCallback(async (
    agentId: string,
    progress: number,
    status?: AgentActivityStatus,
    currentTask?: string,
    metadata?: Record<string, unknown>
  ) => {
    await updateAgentActivity(agentId, progress, status, currentTask, metadata);
    agentLastSeen.set(agentId, Date.now());
  }, []);

  const completeTask = useCallback(async (
    agentId: string,
    success: boolean,
    error?: string,
    metadata?: Record<string, unknown>
  ) => {
    for (const [task, context] of activeTasks.entries()) {
      if (context.agentId === agentId) {
        activeTasks.delete(task);
        break;
      }
    }

    await completeAgentActivity(agentId, { success, error, metadata });
    
    const healthStatus: AgentHealthStatus = success ? 'healthy' : 
      (metadata?.consecutiveFailures && (metadata.consecutiveFailures as number) > 3) 
        ? 'unhealthy' 
        : 'degraded';
    
    await updateAgentHealth(
      agentId,
      healthStatus,
      success ? 0 : 1,
      metadata?.memoryUsage as number | undefined
    );
  }, []);

  const recordMetrics = useCallback(async (
    agentId: string,
    tokens?: number,
    cost?: number
  ) => {
    await updateAgentMetrics(agentId, { tokens, cost });
  }, []);

  const heartbeat = useCallback(async (agentId: string) => {
    agentLastSeen.set(agentId, Date.now());
    await updateAgentHealth(agentId, 'healthy', 0);
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      const now = Date.now();
      const staleThreshold = 30000;

      for (const [agentId, lastSeen] of agentLastSeen.entries()) {
        if (now - lastSeen > staleThreshold) {
          await updateAgentHealth(agentId, 'degraded');
        }
      }
    }, 10000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    startTask,
    updateTask,
    completeTask,
    recordMetrics,
    heartbeat,
  };
}

export function getActiveTasks(): Map<string, AgentTaskContext> {
  return activeTasks;
}

export async function instrumentAgentExecution(
  agentId: string,
  agentName: string,
  role: string,
  taskType: string,
  taskFn: () => Promise<unknown>
): Promise<unknown> {
  const taskId = `${taskType}_${Date.now()}`;
  
  try {
    await startAgentActivity(agentId, agentName, role, taskType, { taskId });
    await updateAgentActivity(agentId, 10, 'thinking');
    
    const startTime = Date.now();
    const result = await taskFn();
    const duration = Date.now() - startTime;
    
    await updateAgentActivity(agentId, 50, 'executing');
    await updateAgentMetrics(agentId, { 
      duration,
      tokens: Math.floor(duration / 100),
      cost: duration / 10000,
    });
    
    await completeAgentActivity(agentId, { 
      success: true,
      metadata: { duration, resultType: typeof result }
    });
    
    return result;
    
  } catch (error) {
    await completeAgentActivity(agentId, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      metadata: { errorType: error instanceof Error ? error.constructor.name : 'Unknown' }
    });
    
    throw error;
  }
}