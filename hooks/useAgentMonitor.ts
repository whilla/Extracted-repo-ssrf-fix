'use client';

import { useState, useEffect, useCallback } from 'react';

export type AgentActivityStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'recovering';
export type AgentHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface AgentActivity {
  agentId: string;
  agentName: string;
  role: string;
  status: AgentActivityStatus;
  startedAt: string;
  currentTask?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentMetrics {
  agentId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageDuration: number;
  successRate: number;
  tokensUsed: number;
  costIncurred: number;
  lastActiveAt: string;
}

export interface AgentHealth {
  agentId: string;
  status: AgentHealthStatus;
  lastHeartbeat: string;
  errorCount: number;
  consecutiveFailures: number;
  memoryUsage?: number;
  uptime: number;
}

export interface AgentTimelineEvent {
  id: string;
  agentId: string;
  timestamp: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SystemOverview {
  activeAgents: number;
  idleAgents: number;
  healthyAgents: number;
  degradedAgents: number;
  unhealthyAgents: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  averageSuccessRate: number;
  recentEvents: AgentTimelineEvent[];
  activeActivities: AgentActivity[];
}

interface UseAgentMonitorOptions {
  refreshInterval?: number;
  enabled?: boolean;
}

export function useAgentMonitor(options: UseAgentMonitorOptions = {}) {
  const { refreshInterval = 5000, enabled = true } = options;

  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [metrics, setMetrics] = useState<AgentMetrics[]>([]);
  const [health, setHealth] = useState<AgentHealth[]>([]);
  const [timeline, setTimeline] = useState<AgentTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor?type=overview');
      const json = await res.json();
      if (json.data) {
        setOverview(json.data);
        setActivities(json.data.activeActivities || []);
      }
    } catch (e) {
      console.error('[useAgentMonitor] Fetch overview error:', e);
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor?type=metrics');
      const json = await res.json();
      if (json.data) {
        setMetrics(Array.isArray(json.data) ? json.data : []);
      }
    } catch (e) {
      console.error('[useAgentMonitor] Fetch metrics error:', e);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor?type=health');
      const json = await res.json();
      if (json.data) {
        setHealth(Array.isArray(json.data) ? json.data : []);
      }
    } catch (e) {
      console.error('[useAgentMonitor] Fetch health error:', e);
    }
  }, []);

  const fetchTimeline = useCallback(async (limit = 50) => {
    try {
      const res = await fetch(`/api/monitor?type=timeline&limit=${limit}`);
      const json = await res.json();
      if (json.data) {
        setTimeline(json.data);
      }
    } catch (e) {
      console.error('[useAgentMonitor] Fetch timeline error:', e);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([
        fetchOverview(),
        fetchMetrics(),
        fetchHealth(),
        fetchTimeline(),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch monitoring data');
    } finally {
      setLoading(false);
    }
  }, [fetchOverview, fetchMetrics, fetchHealth, fetchTimeline]);

  useEffect(() => {
    if (!enabled) return;

    refresh();

    const interval = setInterval(refresh, refreshInterval);

    return () => clearInterval(interval);
  }, [enabled, refreshInterval, refresh]);

  const getAgentById = useCallback((agentId: string) => {
    return {
      activity: activities.find(a => a.agentId === agentId),
      metrics: metrics.find(m => m.agentId === agentId),
      health: health.find(h => h.agentId === agentId),
      timeline: timeline.filter(t => t.agentId === agentId),
    };
  }, [activities, metrics, health, timeline]);

  const getSystemHealthStatus = useCallback((): 'healthy' | 'degraded' | 'critical' => {
    if (!overview) return 'healthy';
    if (overview.unhealthyAgents > 0) return 'critical';
    if (overview.degradedAgents > 0) return 'degraded';
    return 'healthy';
  }, [overview]);

  const exportData = useCallback(async () => {
    const res = await fetch('/api/monitor?type=export');
    const json = await res.json();
    return json.data;
  }, []);

  const clearData = useCallback(async () => {
    await fetch('/api/monitor', { method: 'DELETE' });
    await refresh();
  }, [refresh]);

  return {
    overview,
    activities,
    metrics,
    health,
    timeline,
    loading,
    error,
    refresh,
    getAgentById,
    getSystemHealthStatus,
    exportData,
    clearData,
  };
}

export function useAgentActivity(agentId: string) {
  const { activities, metrics, health, timeline, loading, error, refresh } = useAgentMonitor({
    refreshInterval: 3000,
    enabled: !!agentId,
  });

  const agentActivities = activities.filter(a => a.agentId === agentId);
  const agentMetrics = metrics.find(m => m.agentId === agentId);
  const agentHealth = health.find(h => h.agentId === agentId);
  const agentTimeline = timeline.filter(t => t.agentId === agentId);

  return {
    activity: agentActivities[0] || null,
    metrics: agentMetrics,
    health: agentHealth,
    timeline: agentTimeline,
    loading,
    error,
    refresh,
  };
}