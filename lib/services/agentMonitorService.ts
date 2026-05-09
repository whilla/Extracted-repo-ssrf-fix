/**
 * Agent Monitor Service
 * Real-time monitoring and observability for agents
 */

import { kvGet, kvSet } from './puterService';
import { logAuditEvent, type AuditEventType } from './auditService';

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

const MONITOR_PREFIX = 'agent_monitor_';
const ACTIVITY_KEY = `${MONITOR_PREFIX}activity`;
const METRICS_KEY = `${MONITOR_PREFIX}metrics`;
const HEALTH_KEY = `${MONITOR_PREFIX}health`;
const TIMELINE_KEY = `${MONITOR_PREFIX}timeline`;

const MAX_ACTIVITY_ENTRIES = 50;
const MAX_TIMELINE_ENTRIES = 500;

function generateId(): string {
  return `mon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadJson<T>(key: string, defaultValue: T): Promise<T> {
  const data = await kvGet(key);
  return data ? JSON.parse(data) : defaultValue;
}

async function saveJson(key: string, data: unknown): Promise<void> {
  await kvSet(key, JSON.stringify(data));
}

export async function startAgentActivity(
  agentId: string,
  agentName: string,
  role: string,
  task: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  const activity: AgentActivity = {
    agentId,
    agentName,
    role,
    status: 'executing',
    startedAt: new Date().toISOString(),
    currentTask: task,
    progress: 0,
    metadata,
  };

  const activities = await loadJson<AgentActivity[]>(ACTIVITY_KEY, []);
  activities.unshift(activity);
  
  if (activities.length > MAX_ACTIVITY_ENTRIES) {
    activities.length = MAX_ACTIVITY_ENTRIES;
  }
  
  await saveJson(ACTIVITY_KEY, activities);
  
  await addTimelineEvent(agentId, 'activity_started', `Started task: ${task}`, { task, ...metadata });

  return activity.startedAt;
}

export async function updateAgentActivity(
  agentId: string,
  progress: number,
  status?: AgentActivityStatus,
  currentTask?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const activities = await loadJson<AgentActivity[]>(ACTIVITY_KEY, []);
  const index = activities.findIndex(a => a.agentId === agentId && a.status !== 'idle');
  
  if (index !== -1) {
    if (status) activities[index].status = status;
    if (typeof progress === 'number') activities[index].progress = progress;
    if (currentTask) activities[index].currentTask = currentTask;
    if (metadata) activities[index].metadata = { ...activities[index].metadata, ...metadata };
    
    await saveJson(ACTIVITY_KEY, activities);
  }
}

export async function completeAgentActivity(
  agentId: string,
  result: { success: boolean; error?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  const activities = await loadJson<AgentActivity[]>(ACTIVITY_KEY, []);
  const activity = activities.find(a => a.agentId === agentId && a.status !== 'idle');
  
  if (activity) {
    activity.status = result.success ? 'idle' : 'recovering';
    activity.progress = 100;
    
    await saveJson(ACTIVITY_KEY, activities);
    
    await addTimelineEvent(
      agentId,
      result.success ? 'activity_completed' : 'activity_failed',
      result.success ? 'Task completed successfully' : `Task failed: ${result.error}`,
      result.metadata
    );
    
    await updateAgentMetrics(agentId, {
      completed: result.success ? 1 : 0,
      failed: result.success ? 0 : 1,
      duration: Date.now() - new Date(activity.startedAt).getTime(),
    });
  }
}

async function addTimelineEvent(
  agentId: string,
  eventType: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const event: AgentTimelineEvent = {
    id: generateId(),
    agentId,
    timestamp: new Date().toISOString(),
    eventType,
    message,
    metadata,
  };

  const events = await loadJson<AgentTimelineEvent[]>(TIMELINE_KEY, []);
  events.unshift(event);
  
  if (events.length > MAX_TIMELINE_ENTRIES) {
    events.length = MAX_TIMELINE_ENTRIES;
  }
  
  await saveJson(TIMELINE_KEY, events);
}

export async function updateAgentMetrics(
  agentId: string,
  update: {
    completed?: number;
    failed?: number;
    duration?: number;
    tokens?: number;
    cost?: number;
  }
): Promise<void> {
  const metrics = await loadJson<Record<string, AgentMetrics>>(METRICS_KEY, {});
  
  if (!metrics[agentId]) {
    metrics[agentId] = {
      agentId,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageDuration: 0,
      successRate: 100,
      tokensUsed: 0,
      costIncurred: 0,
      lastActiveAt: new Date().toISOString(),
    };
  }

  const m = metrics[agentId];
  
  if (update.completed) {
    m.completedTasks += update.completed;
    m.totalTasks++;
  }
  if (update.failed) {
    m.failedTasks += update.failed;
    m.totalTasks++;
  }
  if (update.duration) {
    const prevAvg = m.averageDuration;
    m.averageDuration = Math.round((prevAvg * (m.totalTasks - 1) + update.duration) / m.totalTasks);
  }
  if (update.tokens) m.tokensUsed += update.tokens;
  if (update.cost) m.costIncurred += update.cost;
  
  m.successRate = m.totalTasks > 0 
    ? Math.round((m.completedTasks / m.totalTasks) * 100) 
    : 100;
  m.lastActiveAt = new Date().toISOString();

  await saveJson(METRICS_KEY, metrics);
}

export async function updateAgentHealth(
  agentId: string,
  status: AgentHealthStatus,
  errorCount?: number,
  memoryUsage?: number
): Promise<void> {
  const healths = await loadJson<Record<string, AgentHealth>>(HEALTH_KEY, {});
  
  if (!healths[agentId]) {
    healths[agentId] = {
      agentId,
      status: 'unknown',
      lastHeartbeat: new Date().toISOString(),
      errorCount: 0,
      consecutiveFailures: 0,
      uptime: 0,
    };
  }

  const h = healths[agentId];
  h.status = status;
  h.lastHeartbeat = new Date().toISOString();
  
  if (errorCount !== undefined) h.errorCount = errorCount;
  if (memoryUsage !== undefined) h.memoryUsage = memoryUsage;
  
  if (status === 'unhealthy') {
    h.consecutiveFailures++;
  } else {
    h.consecutiveFailures = 0;
  }

  await saveJson(HEALTH_KEY, healths);
}

export async function getAgentActivities(): Promise<AgentActivity[]> {
  return loadJson<AgentActivity[]>(ACTIVITY_KEY, []);
}

export async function getAgentMetrics(agentId?: string): Promise<AgentMetrics[] | AgentMetrics | null> {
  const metrics = await loadJson<Record<string, AgentMetrics>>(METRICS_KEY, {});
  
  if (agentId) {
    return metrics[agentId] || null;
  }
  
  return Object.values(metrics);
}

export async function getAgentHealth(agentId?: string): Promise<AgentHealth[] | AgentHealth | null> {
  const healths = await loadJson<Record<string, AgentHealth>>(HEALTH_KEY, {});
  
  if (agentId) {
    return healths[agentId] || null;
  }
  
  return Object.values(healths);
}

export async function getAgentTimeline(
  agentId?: string,
  limit: number = 50
): Promise<AgentTimelineEvent[]> {
  const events = await loadJson<AgentTimelineEvent[]>(TIMELINE_KEY, []);
  
  if (agentId) {
    return events.filter(e => e.agentId === agentId).slice(0, limit);
  }
  
  return events.slice(0, limit);
}

export async function getSystemOverview(): Promise<{
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
}> {
  const activities = await getAgentActivities();
  const healths = await getAgentHealth();
  const metrics = await getAgentMetrics();
  const timeline = await getAgentTimeline(undefined, 20);

  const healthArray = Array.isArray(healths) ? healths : Object.values(healths || {});
  const metricsArray = Array.isArray(metrics) ? metrics : Object.values(metrics || {});

  return {
    activeAgents: activities.filter(a => a.status !== 'idle').length,
    idleAgents: activities.filter(a => a.status === 'idle').length,
    healthyAgents: healthArray.filter(h => h.status === 'healthy').length,
    degradedAgents: healthArray.filter(h => h.status === 'degraded').length,
    unhealthyAgents: healthArray.filter(h => h.status === 'unhealthy').length,
    totalTasksCompleted: metricsArray.reduce((sum, m) => sum + m.completedTasks, 0),
    totalTasksFailed: metricsArray.reduce((sum, m) => sum + m.failedTasks, 0),
    averageSuccessRate: metricsArray.length > 0
      ? Math.round(metricsArray.reduce((sum, m) => sum + m.successRate, 0) / metricsArray.length)
      : 100,
    recentEvents: timeline,
    activeActivities: activities.filter(a => a.status !== 'idle'),
  };
}

export async function clearAgentMonitorData(): Promise<void> {
  await saveJson(ACTIVITY_KEY, []);
  await saveJson(METRICS_KEY, {});
  await saveJson(HEALTH_KEY, {});
  await saveJson(TIMELINE_KEY, []);
}

export async function exportAgentMonitorData(): Promise<string> {
  const [activities, metrics, healths, timeline] = await Promise.all([
    getAgentActivities(),
    getAgentMetrics(),
    getAgentHealth(),
    getAgentTimeline(undefined, 500),
  ]);

  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    activities,
    metrics,
    healths,
    timeline,
  }, null, 2);
}