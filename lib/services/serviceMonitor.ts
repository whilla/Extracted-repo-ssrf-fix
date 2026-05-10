/**
 * Service Monitor
 * Wraps key services to track their performance and health
 */

import { kvGet, kvSet } from './puterService';
import { logAuditEvent } from './auditService';

export type ServiceStatus = 'operational' | 'degraded' | 'down' | 'unknown';

export interface ServiceMetrics {
  serviceName: string;
  status: ServiceStatus;
  callsTotal: number;
  callsSuccess: number;
  callsFailed: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  lastCallAt: string;
  lastError?: string;
  errorRate: number;
}

export interface ServiceCallContext {
  serviceName: string;
  operation: string;
  startTime: number;
  metadata?: Record<string, unknown>;
}

const METRICS_KEY = 'service_metrics';
const LATENCY_SAMPLES_KEY = 'service_latency_samples';
const MAX_LATENCY_SAMPLES = 100;

const activeCalls = new Map<string, ServiceCallContext>();
const latencySamples = new Map<string, number[]>();

const serviceNames = [
  'aiService',
  'multiAgentService',
  'orchestrationEngine',
  'publishService',
  'videoGenerationService',
  'imageGenerationService',
  'voiceGenerationService',
  'memoryService',
  'providerCapabilityService',
] as const;

export type ServiceName = typeof serviceNames[number];

function generateCallId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `call_${crypto.randomUUID()}`;
  }
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `call_${timestamp}_${randomPart}`;
}

async function loadMetrics(): Promise<Record<string, ServiceMetrics>> {
  const data = await kvGet(METRICS_KEY);
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    console.error('[serviceMonitor] Failed to parse metrics');
    return {};
  }
}

async function saveMetrics(metrics: Record<string, ServiceMetrics>): Promise<void> {
  await kvSet(METRICS_KEY, JSON.stringify(metrics));
}

async function loadLatencySamples(): Promise<Record<string, number[]>> {
  const data = await kvGet(LATENCY_SAMPLES_KEY);
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    console.error('[serviceMonitor] Failed to parse latency samples');
    return {};
  }
}

async function saveLatencySamples(samples: Record<string, number[]>): Promise<void> {
  await kvSet(LATENCY_SAMPLES_KEY, JSON.stringify(samples));
}

function computePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil(sorted.length * percentile) - 1;
  return sorted[Math.max(0, index)] || 0;
}

export function startServiceCall(
  serviceName: ServiceName,
  operation: string,
  metadata?: Record<string, unknown>
): string {
  const callId = generateCallId();
  
  activeCalls.set(callId, {
    serviceName,
    operation,
    startTime: Date.now(),
    metadata,
  });

  return callId;
}

export async function endServiceCall(
  callId: string,
  result: { success: boolean; error?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  const context = activeCalls.get(callId);
  if (!context) {
    console.warn(`[serviceMonitor] endServiceCall: callId ${callId} not found in activeCalls`);
    return;
  }

  const duration = Date.now() - context.startTime;
  activeCalls.delete(callId);

  const metrics = await loadMetrics();
  const serviceName = context.serviceName;

  if (!metrics[serviceName]) {
    metrics[serviceName] = {
      serviceName,
      status: 'operational',
      callsTotal: 0,
      callsSuccess: 0,
      callsFailed: 0,
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      lastCallAt: new Date().toISOString(),
      errorRate: 0,
    };
  }

  const m = metrics[serviceName];
  m.callsTotal++;
  m.lastCallAt = new Date().toISOString();

  if (result.success) {
    m.callsSuccess++;
  } else {
    m.callsFailed++;
    m.lastError = result.error;
  }

  m.errorRate = m.callsTotal > 0 ? (m.callsFailed / m.callsTotal) * 100 : 0;

  if (m.errorRate > 20) {
    m.status = 'down';
  } else if (m.errorRate > 5) {
    m.status = 'degraded';
  } else {
    m.status = 'operational';
  }

  const samples = [...(latencySamples.get(serviceName) || []), duration].slice(-MAX_LATENCY_SAMPLES);
  latencySamples.set(serviceName, samples);

  const persistedSamples = await loadLatencySamples();
  persistedSamples[serviceName] = samples;
  await saveLatencySamples(persistedSamples);

  if (samples.length > 0) {
    const sorted = [...samples].sort((a, b) => a - b);
    m.averageLatency = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    m.p95Latency = computePercentile(sorted, 0.95);
    m.p99Latency = computePercentile(sorted, 0.99);
  }

  await saveMetrics(metrics);

  await logAuditEvent({
    eventType: result.success ? 'service_call_success' : 'service_call_failure',
    actor: 'system',
    action: `${serviceName}.${context.operation}`,
    resource: 'service',
    resourceId: serviceName,
    details: { duration, callId, ...result.metadata },
    result: result.success ? 'success' : 'failure',
    errorMessage: result.error,
    metadata: {
      duration,
      service: serviceName,
      operation: context.operation,
    },
  });
}

export function wrapServiceCall<T>(
  serviceName: ServiceName,
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const callId = startServiceCall(serviceName, operation, metadata);
  
  return fn()
    .then(async (result) => {
      await endServiceCall(callId, { success: true, metadata: { resultType: typeof result } });
      return result;
    })
    .catch(async (error) => {
      await endServiceCall(callId, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });
}

export async function getServiceMetrics(serviceName?: ServiceName): Promise<ServiceMetrics[] | ServiceMetrics | null> {
  const metrics = await loadMetrics();
  
  if (serviceName) {
    return metrics[serviceName] || null;
  }
  
  return Object.values(metrics);
}

export async function getServiceStatus(serviceName: ServiceName): Promise<ServiceStatus> {
  const metrics = await loadMetrics();
  return metrics[serviceName]?.status || 'unknown';
}

export async function getAllServiceStatuses(): Promise<Record<ServiceName, ServiceStatus>> {
  const metrics = await loadMetrics();
  
  const statuses = {} as Record<ServiceName, ServiceStatus>;
  for (const name of serviceNames) {
    statuses[name] = metrics[name]?.status || 'unknown';
  }
  
  return statuses;
}

export async function getActiveCalls(): Promise<ServiceCallContext[]> {
  return Array.from(activeCalls.values());
}

export async function getServiceHealthSummary(): Promise<{
  totalServices: number;
  operational: number;
  degraded: number;
  down: number;
  averageLatency: number;
  totalCalls: number;
  overallErrorRate: number;
}> {
  const metrics = await loadMetrics();
  const values = Object.values(metrics);

  return {
    totalServices: serviceNames.length,
    operational: values.filter(m => m.status === 'operational').length,
    degraded: values.filter(m => m.status === 'degraded').length,
    down: values.filter(m => m.status === 'down').length,
    averageLatency: values.length > 0
      ? Math.round(values.reduce((sum, m) => sum + m.averageLatency, 0) / values.length)
      : 0,
    totalCalls: values.reduce((sum, m) => sum + m.callsTotal, 0),
    overallErrorRate: values.length > 0
      ? Math.round((values.reduce((sum, m) => sum + m.callsFailed, 0) / 
          Math.max(values.reduce((sum, m) => sum + m.callsTotal, 0), 1)) * 100)
      : 0,
  };
}

export async function resetServiceMetrics(): Promise<void> {
  activeCalls.clear();
  latencySamples.clear();
  await saveMetrics({});
  await saveLatencySamples({});
}

export function instrumentService<P extends unknown[], R>(
  serviceName: ServiceName,
  operation: string
): (fn: () => Promise<R>, metadata?: Record<string, unknown>) => Promise<R> {
  return (fn, metadata) => wrapServiceCall(serviceName, operation, fn, metadata);
}