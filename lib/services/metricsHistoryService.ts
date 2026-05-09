/**
 * Metrics History Service
 * Aggregates and stores historical metrics for analysis
 */

import { kvGet, kvSet } from './puterService';
import { getSystemOverview } from './agentMonitorService';
import { getServiceHealthSummary } from './serviceMonitor';

export interface MetricsSnapshot {
  timestamp: string;
  agents: {
    active: number;
    idle: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
    successRate: number;
  };
  services: {
    operational: number;
    degraded: number;
    down: number;
    totalCalls: number;
    errorRate: number;
    averageLatency: number;
  };
  system: {
    uptime: number;
    memoryUsage?: number;
    activeConnections?: number;
  };
}

export interface TimeSeriesData {
  labels: string[];
  values: number[];
}

export interface MetricsSummary {
  period: 'hour' | 'day' | 'week' | 'month';
  snapshots: MetricsSnapshot[];
  averages: {
    taskCompletionRate: number;
    serviceUptime: number;
    averageLatency: number;
    errorRate: number;
  };
  trends: {
    tasks: 'increasing' | 'decreasing' | 'stable';
    latency: 'improving' | 'degrading' | 'stable';
    errors: 'improving' | 'degrading' | 'stable';
  };
}

const HISTORY_KEY = 'metrics_history';
const SNAPSHOT_INTERVAL = 60000;
const MAX_SNAPSHOTS = 1440;

let snapshotInterval: NodeJS.Timeout | null = null;

async function loadHistory(): Promise<MetricsSnapshot[]> {
  const data = await kvGet(HISTORY_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveHistory(history: MetricsSnapshot[]): Promise<void> {
  if (history.length > MAX_SNAPSHOTS) {
    history = history.slice(-MAX_SNAPSHOTS);
  }
  await kvSet(HISTORY_KEY, JSON.stringify(history));
}

export async function captureSnapshot(): Promise<MetricsSnapshot> {
  const [agentOverview, serviceHealth] = await Promise.all([
    getSystemOverview(),
    getServiceHealthSummary(),
  ]);

  const snapshot: MetricsSnapshot = {
    timestamp: new Date().toISOString(),
    agents: {
      active: agentOverview.activeAgents,
      idle: agentOverview.idleAgents,
      healthy: agentOverview.healthyAgents,
      degraded: agentOverview.degradedAgents,
      unhealthy: agentOverview.unhealthyAgents,
      totalTasksCompleted: agentOverview.totalTasksCompleted,
      totalTasksFailed: agentOverview.totalTasksFailed,
      successRate: agentOverview.averageSuccessRate,
    },
    services: {
      operational: serviceHealth.operational,
      degraded: serviceHealth.degraded,
      down: serviceHealth.down,
      totalCalls: serviceHealth.totalCalls,
      errorRate: serviceHealth.overallErrorRate,
      averageLatency: serviceHealth.averageLatency,
    },
    system: {
      uptime: process.uptime?.() || 0,
    },
  };

  const history = await loadHistory();
  history.push(snapshot);
  await saveHistory(history);

  return snapshot;
}

export async function getSnapshots(
  since: Date,
  until: Date = new Date()
): Promise<MetricsSnapshot[]> {
  const history = await loadHistory();
  
  return history.filter(s => {
    const time = new Date(s.timestamp).getTime();
    return time >= since.getTime() && time <= until.getTime();
  });
}

export async function getMetricsSummary(period: 'hour' | 'day' | 'week' | 'month'): Promise<MetricsSummary> {
  const now = new Date();
  const periodMs = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  };

  const since = new Date(now.getTime() - periodMs[period]);
  const snapshots = await getSnapshots(since, now);

  if (snapshots.length === 0) {
    return {
      period,
      snapshots: [],
      averages: {
        taskCompletionRate: 100,
        serviceUptime: 100,
        averageLatency: 0,
        errorRate: 0,
      },
      trends: {
        tasks: 'stable',
        latency: 'stable',
        errors: 'stable',
      },
    };
  }

  const taskTotal = snapshots.reduce((sum, s) => sum + s.agents.totalTasksCompleted + s.agents.totalTasksFailed, 0);
  const taskCompleted = snapshots.reduce((sum, s) => sum + s.agents.totalTasksCompleted, 0);
  const serviceUptime = snapshots.reduce((sum, s) => {
    const total = s.services.operational + s.services.degraded + s.services.down;
    return total > 0 ? sum + ((s.services.operational / total) * 100) : sum;
  }, 0);
  const avgLatency = snapshots.reduce((sum, s) => sum + s.services.averageLatency, 0) / snapshots.length;
  const errorRate = snapshots.reduce((sum, s) => sum + s.services.errorRate, 0) / snapshots.length;

  const taskCompletionRate = taskTotal > 0 ? Math.round((taskCompleted / taskTotal) * 100) : 100;
  const avgServiceUptime = snapshots.length > 0 ? Math.round(serviceUptime / snapshots.length) : 100;

  const firstQuarter = snapshots.slice(0, Math.floor(snapshots.length / 4));
  const lastQuarter = snapshots.slice(-Math.floor(snapshots.length / 4));

  const firstTasks = firstQuarter.reduce((sum, s) => sum + s.agents.totalTasksCompleted, 0);
  const lastTasks = lastQuarter.reduce((sum, s) => sum + s.agents.totalTasksCompleted, 0);
  const firstLatency = firstQuarter.reduce((sum, s) => sum + s.services.averageLatency, 0) / Math.max(firstQuarter.length, 1);
  const lastLatency = lastQuarter.reduce((sum, s) => sum + s.services.averageLatency, 0) / Math.max(lastQuarter.length, 1);
  const firstErrors = firstQuarter.reduce((sum, s) => sum + s.services.errorRate, 0) / Math.max(firstQuarter.length, 1);
  const lastErrors = lastQuarter.reduce((sum, s) => sum + s.services.errorRate, 0) / Math.max(lastQuarter.length, 1);

  const tasksTrend = lastTasks > firstTasks * 1.1 ? 'increasing' : lastTasks < firstTasks * 0.9 ? 'decreasing' : 'stable';
  const latencyTrend = lastLatency < firstLatency * 0.9 ? 'improving' : lastLatency > firstLatency * 1.1 ? 'degrading' : 'stable';
  const errorsTrend = lastErrors < firstErrors * 0.9 ? 'improving' : lastErrors > firstErrors * 1.1 ? 'degrading' : 'stable';

  return {
    period,
    snapshots,
    averages: {
      taskCompletionRate,
      serviceUptime: avgServiceUptime,
      averageLatency: Math.round(avgLatency),
      errorRate: Math.round(errorRate * 100) / 100,
    },
    trends: {
      tasks: tasksTrend as 'increasing' | 'decreasing' | 'stable',
      latency: latencyTrend as 'improving' | 'degrading' | 'stable',
      errors: errorsTrend as 'improving' | 'degrading' | 'stable',
    },
  };
}

export function getTimeSeriesData(
  snapshots: MetricsSnapshot[],
  field: 'tasks' | 'successRate' | 'latency' | 'errorRate'
): TimeSeriesData {
  const labels: string[] = [];
  const values: number[] = [];

  for (const snapshot of snapshots) {
    const date = new Date(snapshot.timestamp);
    labels.push(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    switch (field) {
      case 'tasks':
        values.push(snapshot.agents.totalTasksCompleted + snapshot.agents.totalTasksFailed);
        break;
      case 'successRate':
        values.push(snapshot.agents.successRate);
        break;
      case 'latency':
        values.push(snapshot.services.averageLatency);
        break;
      case 'errorRate':
        values.push(snapshot.services.errorRate);
        break;
    }
  }

  return { labels, values };
}

export function startMetricsCollection(intervalMs: number = SNAPSHOT_INTERVAL): void {
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
  }

  captureSnapshot();
  snapshotInterval = setInterval(captureSnapshot, intervalMs);

  console.log(`[MetricsHistory] Collection started with ${intervalMs}ms interval`);
}

export function stopMetricsCollection(): void {
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
    console.log('[MetricsHistory] Collection stopped');
  }
}

export async function clearHistory(): Promise<void> {
  await saveHistory([]);
}

export async function exportMetricsHistory(
  since: Date,
  until: Date = new Date()
): Promise<string> {
  const snapshots = await getSnapshots(since, until);
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    period: { since: since.toISOString(), until: until.toISOString() },
    snapshots,
  }, null, 2);
}