/**
 * Audit Trail Service
 * Tracks all agent actions and provides run history
 */

import { readFile, writeFile, PATHS, generateId } from './puterService';

export interface AuditEvent {
  id: string;
  timestamp: string;
  eventType: AuditEventType;
  actor: 'user' | 'agent' | 'system';
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, unknown>;
  result: 'success' | 'failure' | 'pending';
  errorMessage?: string;
  duration?: number;
  metadata: {
    model?: string;
    provider?: string;
    tokenUsage?: { input: number; output: number };
    platform?: string;
  };
}

export type AuditEventType = 
  | 'content_generated'
  | 'content_edited'
  | 'content_approved'
  | 'content_rejected'
  | 'content_published'
  | 'content_scheduled'
  | 'draft_created'
  | 'draft_updated'
  | 'draft_deleted'
  | 'image_generated'
  | 'brand_kit_updated'
  | 'settings_changed'
  | 'provider_switched'
  | 'safety_check_run'
  | 'approval_requested'
  | 'agent_task_started'
  | 'agent_task_completed'
  | 'agent_error'
  | 'user_login'
  | 'user_logout'
  | 'service_call_success'
  | 'service_call_failure';

export interface AgentRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  taskType: string;
  taskDescription: string;
  events: AuditEvent[];
  result?: unknown;
  error?: string;
  metrics: {
    totalTokens: number;
    totalCost: number;
    stepsCompleted: number;
    duration?: number;
  };
}

const AUDIT_LOG_PATH = `${PATHS.settings}/audit-log.json`;
const AGENT_RUNS_PATH = `${PATHS.settings}/agent-runs.json`;
const MAX_AUDIT_ENTRIES = 1000;
const MAX_RUNS_STORED = 100;

// Log an audit event
export async function logAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
  const fullEvent: AuditEvent = {
    ...event,
    id: `evt_${generateId()}`,
    timestamp: new Date().toISOString(),
  };

  const events = await loadAuditLog();
  events.unshift(fullEvent);
  
  // Keep only recent entries
  const trimmedEvents = events.slice(0, MAX_AUDIT_ENTRIES);
  await writeFile(AUDIT_LOG_PATH, trimmedEvents);

  // Also add to current agent run if one exists
  const currentRun = await getCurrentRun();
  if (currentRun) {
    currentRun.events.push(fullEvent);
    if (fullEvent.metadata.tokenUsage) {
      currentRun.metrics.totalTokens += fullEvent.metadata.tokenUsage.input + fullEvent.metadata.tokenUsage.output;
    }
    currentRun.metrics.stepsCompleted++;
    await updateRun(currentRun);
  }

  return fullEvent;
}

// Load audit log
export async function loadAuditLog(limit = 100, offset = 0): Promise<AuditEvent[]> {
  try {
    const events = await readFile<AuditEvent[]>(AUDIT_LOG_PATH);
    return (events || []).slice(offset, offset + limit);
  } catch {
    return [];
  }
}

// Search audit log
export async function searchAuditLog(query: {
  eventType?: AuditEventType;
  actor?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
  result?: string;
}): Promise<AuditEvent[]> {
  const events = await loadAuditLog(MAX_AUDIT_ENTRIES);
  
  return events.filter(event => {
    if (query.eventType && event.eventType !== query.eventType) return false;
    if (query.actor && event.actor !== query.actor) return false;
    if (query.resource && event.resource !== query.resource) return false;
    if (query.result && event.result !== query.result) return false;
    if (query.startDate && event.timestamp < query.startDate) return false;
    if (query.endDate && event.timestamp > query.endDate) return false;
    return true;
  });
}

// Start a new agent run
export async function startAgentRun(taskType: string, taskDescription: string): Promise<AgentRun> {
  const run: AgentRun = {
    id: `run_${generateId()}`,
    startedAt: new Date().toISOString(),
    status: 'running',
    taskType,
    taskDescription,
    events: [],
    metrics: {
      totalTokens: 0,
      totalCost: 0,
      stepsCompleted: 0,
    },
  };

  // Save as current run
  await writeFile(`${PATHS.settings}/current-run.json`, run);

  // Log the start event
  await logAuditEvent({
    eventType: 'agent_task_started',
    actor: 'agent',
    action: 'start_task',
    resource: taskType,
    resourceId: run.id,
    details: { taskDescription },
    result: 'success',
    metadata: {},
  });

  return run;
}

// Get current running agent task
export async function getCurrentRun(): Promise<AgentRun | null> {
  try {
    const run = await readFile<AgentRun>(`${PATHS.settings}/current-run.json`);
    return run?.status === 'running' ? run : null;
  } catch {
    return null;
  }
}

// Update current run
async function updateRun(run: AgentRun): Promise<void> {
  await writeFile(`${PATHS.settings}/current-run.json`, run);
}

// Complete an agent run
export async function completeAgentRun(result?: unknown): Promise<AgentRun | null> {
  const run = await getCurrentRun();
  if (!run) return null;

  run.status = 'completed';
  run.completedAt = new Date().toISOString();
  run.result = result;
  run.metrics.duration = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();

  // Save to history
  const runs = await loadAgentRuns();
  runs.unshift(run);
  const trimmedRuns = runs.slice(0, MAX_RUNS_STORED);
  await writeFile(AGENT_RUNS_PATH, trimmedRuns);

  // Clear current run
  await writeFile(`${PATHS.settings}/current-run.json`, null);

  // Log completion
  await logAuditEvent({
    eventType: 'agent_task_completed',
    actor: 'agent',
    action: 'complete_task',
    resource: run.taskType,
    resourceId: run.id,
    details: { 
      duration: run.metrics.duration,
      stepsCompleted: run.metrics.stepsCompleted,
    },
    result: 'success',
    duration: run.metrics.duration,
    metadata: {},
  });

  return run;
}

// Fail an agent run
export async function failAgentRun(error: string): Promise<AgentRun | null> {
  const run = await getCurrentRun();
  if (!run) return null;

  run.status = 'failed';
  run.completedAt = new Date().toISOString();
  run.error = error;
  run.metrics.duration = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();

  // Save to history
  const runs = await loadAgentRuns();
  runs.unshift(run);
  const trimmedRuns = runs.slice(0, MAX_RUNS_STORED);
  await writeFile(AGENT_RUNS_PATH, trimmedRuns);

  // Clear current run
  await writeFile(`${PATHS.settings}/current-run.json`, null);

  // Log failure
  await logAuditEvent({
    eventType: 'agent_error',
    actor: 'agent',
    action: 'task_failed',
    resource: run.taskType,
    resourceId: run.id,
    details: { error },
    result: 'failure',
    errorMessage: error,
    duration: run.metrics.duration,
    metadata: {},
  });

  return run;
}

// Cancel an agent run
export async function cancelAgentRun(): Promise<AgentRun | null> {
  const run = await getCurrentRun();
  if (!run) return null;

  run.status = 'cancelled';
  run.completedAt = new Date().toISOString();
  run.metrics.duration = new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime();

  // Save to history
  const runs = await loadAgentRuns();
  runs.unshift(run);
  const trimmedRuns = runs.slice(0, MAX_RUNS_STORED);
  await writeFile(AGENT_RUNS_PATH, trimmedRuns);

  // Clear current run
  await writeFile(`${PATHS.settings}/current-run.json`, null);

  return run;
}

// Load agent run history
export async function loadAgentRuns(limit = 50): Promise<AgentRun[]> {
  try {
    const runs = await readFile<AgentRun[]>(AGENT_RUNS_PATH);
    return (runs || []).slice(0, limit);
  } catch {
    return [];
  }
}

// Get a specific run by ID
export async function getAgentRun(runId: string): Promise<AgentRun | null> {
  const runs = await loadAgentRuns(MAX_RUNS_STORED);
  return runs.find(r => r.id === runId) || null;
}

// Get run statistics
export async function getRunStatistics(days = 30): Promise<{
  totalRuns: number;
  successRate: number;
  averageDuration: number;
  totalTokens: number;
  runsByType: Record<string, number>;
  runsByDay: Record<string, number>;
}> {
  const runs = await loadAgentRuns(MAX_RUNS_STORED);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const recentRuns = runs.filter(r => new Date(r.startedAt) >= cutoffDate);
  const completedRuns = recentRuns.filter(r => r.status === 'completed');

  const stats = {
    totalRuns: recentRuns.length,
    successRate: recentRuns.length > 0 ? (completedRuns.length / recentRuns.length) * 100 : 0,
    averageDuration: 0,
    totalTokens: 0,
    runsByType: {} as Record<string, number>,
    runsByDay: {} as Record<string, number>,
  };

  let totalDuration = 0;
  for (const run of recentRuns) {
    if (run.metrics.duration) totalDuration += run.metrics.duration;
    stats.totalTokens += run.metrics.totalTokens;
    stats.runsByType[run.taskType] = (stats.runsByType[run.taskType] || 0) + 1;

    const day = run.startedAt.split('T')[0];
    stats.runsByDay[day] = (stats.runsByDay[day] || 0) + 1;
  }

  if (recentRuns.length > 0) {
    stats.averageDuration = totalDuration / recentRuns.length;
  }

  return stats;
}

// Convenience functions for common audit events
export const audit = {
  contentGenerated: (contentId: string, model: string, provider: string, tokens: { input: number; output: number }) =>
    logAuditEvent({
      eventType: 'content_generated',
      actor: 'agent',
      action: 'generate',
      resource: 'content',
      resourceId: contentId,
      details: {},
      result: 'success',
      metadata: { model, provider, tokenUsage: tokens },
    }),

  contentApproved: (contentId: string, notes?: string) =>
    logAuditEvent({
      eventType: 'content_approved',
      actor: 'user',
      action: 'approve',
      resource: 'content',
      resourceId: contentId,
      details: { notes },
      result: 'success',
      metadata: {},
    }),

  contentRejected: (contentId: string, reason: string) =>
    logAuditEvent({
      eventType: 'content_rejected',
      actor: 'user',
      action: 'reject',
      resource: 'content',
      resourceId: contentId,
      details: { reason },
      result: 'success',
      metadata: {},
    }),

  contentPublished: (contentId: string, platform: string) =>
    logAuditEvent({
      eventType: 'content_published',
      actor: 'system',
      action: 'publish',
      resource: 'content',
      resourceId: contentId,
      details: {},
      result: 'success',
      metadata: { platform },
    }),

  safetyCheckRun: (contentId: string, passed: boolean, score: number) =>
    logAuditEvent({
      eventType: 'safety_check_run',
      actor: 'system',
      action: 'safety_check',
      resource: 'content',
      resourceId: contentId,
      details: { passed, score },
      result: passed ? 'success' : 'failure',
      metadata: {},
    }),

  providerSwitched: (from: string, to: string) =>
    logAuditEvent({
      eventType: 'provider_switched',
      actor: 'user',
      action: 'switch_provider',
      resource: 'provider',
      details: { from, to },
      result: 'success',
      metadata: { provider: to },
    }),

  imageGenerated: (imageId: string, model: string) =>
    logAuditEvent({
      eventType: 'image_generated',
      actor: 'agent',
      action: 'generate',
      resource: 'image',
      resourceId: imageId,
      details: {},
      result: 'success',
      metadata: { model },
    }),
};
