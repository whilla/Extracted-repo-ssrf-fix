/**
 * Alert Service
 * Monitoring alerts and anomaly detection
 */

import { kvGet, kvSet } from './puterService';
import { getSystemOverview } from './agentMonitorService';
import { getServiceHealthSummary, type ServiceName } from './serviceMonitor';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  source: string;
  timestamp: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
  count: number;
}

export type AlertType =
  | 'agent_failure'
  | 'agent_unhealthy'
  | 'service_down'
  | 'service_degraded'
  | 'high_error_rate'
  | 'high_latency'
  | 'provider_failure'
  | 'publish_failure'
  | 'memory_low'
  | 'quota_exceeded';

const ALERTS_KEY = 'alerts';
const ALERT_CONFIG_KEY = 'alert_config';
const MAX_ALERTS = 100;

const defaultConfig = {
  agentFailureThreshold: 3,
  errorRateThreshold: 10,
  latencyThreshold: 5000,
  serviceHealthCheckInterval: 30000,
};

let alertCheckInterval: NodeJS.Timeout | null = null;

function generateId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadAlerts(): Promise<Alert[]> {
  const data = await kvGet(ALERTS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveAlerts(alerts: Alert[]): Promise<void> {
  await kvSet(ALERTS_KEY, JSON.stringify(alerts.slice(0, MAX_ALERTS)));
}

export async function createAlert(
  type: AlertType,
  severity: AlertSeverity,
  message: string,
  source: string,
  metadata?: Record<string, unknown>
): Promise<Alert> {
  const alerts = await loadAlerts();

  const existing = alerts.find(
    a => a.type === type && a.source === source && a.status === 'active'
  );

  if (existing) {
    existing.count++;
    existing.timestamp = new Date().toISOString();
    existing.metadata = { ...existing.metadata, ...metadata };
    await saveAlerts(alerts);
    return existing;
  }

  const alert: Alert = {
    id: generateId(),
    type,
    severity,
    status: 'active',
    message,
    source,
    timestamp: new Date().toISOString(),
    count: 1,
    metadata,
  };

  alerts.unshift(alert);
  await saveAlerts(alerts);

  return alert;
}

export async function acknowledgeAlert(
  alertId: string,
  acknowledgedBy: string
): Promise<boolean> {
  const alerts = await loadAlerts();
  const alert = alerts.find(a => a.id === alertId);

  if (!alert) return false;

  alert.status = 'acknowledged';
  alert.acknowledgedAt = new Date().toISOString();
  alert.acknowledgedBy = acknowledgedBy;

  await saveAlerts(alerts);
  return true;
}

export async function resolveAlert(alertId: string): Promise<boolean> {
  const alerts = await loadAlerts();
  const alert = alerts.find(a => a.id === alertId);

  if (!alert) return false;

  alert.status = 'resolved';
  alert.resolvedAt = new Date().toISOString();

  await saveAlerts(alerts);
  return true;
}

export async function getAlerts(
  options: {
    status?: AlertStatus;
    severity?: AlertSeverity;
    limit?: number;
  } = {}
): Promise<Alert[]> {
  const alerts = await loadAlerts();

  let filtered = alerts;

  if (options.status) {
    filtered = filtered.filter(a => a.status === options.status);
  }
  if (options.severity) {
    filtered = filtered.filter(a => a.severity === options.severity);
  }

  return filtered.slice(0, options.limit || 50);
}

export async function getActiveAlerts(): Promise<Alert[]> {
  return getAlerts({ status: 'active' });
}

export async function getAlertSummary(): Promise<{
  active: number;
  acknowledged: number;
  resolved: number;
  critical: number;
  errors: number;
  warnings: number;
}> {
  const alerts = await loadAlerts();

  return {
    active: alerts.filter(a => a.status === 'active').length,
    acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
    resolved: alerts.filter(a => a.status === 'resolved').length,
    critical: alerts.filter(a => a.severity === 'critical' && a.status === 'active').length,
    errors: alerts.filter(a => a.severity === 'error' && a.status === 'active').length,
    warnings: alerts.filter(a => a.severity === 'warning' && a.status === 'active').length,
  };
}

async function checkAgentHealth(): Promise<void> {
  try {
    const overview = await getSystemOverview();

    if (overview.unhealthyAgents > 0) {
      await createAlert(
        'agent_unhealthy',
        overview.unhealthyAgents > 2 ? 'critical' : 'error',
        `${overview.unhealthyAgents} agent(s) unhealthy`,
        'agent-monitor',
        { unhealthyCount: overview.unhealthyAgents }
      );
    }

    if (overview.averageSuccessRate < 80) {
      await createAlert(
        'high_error_rate',
        'warning',
        `Agent success rate dropped to ${overview.averageSuccessRate}%`,
        'agent-monitor',
        { successRate: overview.averageSuccessRate }
      );
    }
  } catch (e) {
    console.error('[AlertService] Agent health check failed:', e);
  }
}

async function checkServiceHealth(): Promise<void> {
  try {
    const health = await getServiceHealthSummary();

    if (health.down > 0) {
      await createAlert(
        'service_down',
        'critical',
        `${health.down} service(s) down`,
        'service-monitor',
        { downCount: health.down }
      );
    }

    if (health.degraded > 0) {
      await createAlert(
        'service_degraded',
        'warning',
        `${health.degraded} service(s) degraded`,
        'service-monitor',
        { degradedCount: health.degraded }
      );
    }

    if (health.overallErrorRate > 10) {
      await createAlert(
        'high_error_rate',
        'error',
        `System error rate at ${health.overallErrorRate}%`,
        'service-monitor',
        { errorRate: health.overallErrorRate }
      );
    }

    if (health.averageLatency > 5000) {
      await createAlert(
        'high_latency',
        'warning',
        `Average service latency: ${health.averageLatency}ms`,
        'service-monitor',
        { latency: health.averageLatency }
      );
    }
  } catch (e) {
    console.error('[AlertService] Service health check failed:', e);
  }
}

export async function runHealthChecks(): Promise<void> {
  await Promise.all([checkAgentHealth(), checkServiceHealth()]);
}

export function startAlertMonitoring(intervalMs: number = 60000): void {
  if (alertCheckInterval) {
    clearInterval(alertCheckInterval);
  }

  runHealthChecks();
  alertCheckInterval = setInterval(runHealthChecks, intervalMs);

  console.log(`[AlertService] Monitoring started with ${intervalMs}ms interval`);
}

export function stopAlertMonitoring(): void {
  if (alertCheckInterval) {
    clearInterval(alertCheckInterval);
    alertCheckInterval = null;
    console.log('[AlertService] Monitoring stopped');
  }
}

export async function clearResolvedAlerts(olderThanDays: number = 7): Promise<number> {
  const alerts = await loadAlerts();
  const cutoff = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

  const filtered = alerts.filter(
    a => a.status !== 'resolved' || new Date(a.resolvedAt!).getTime() > cutoff
  );

  const cleared = alerts.length - filtered.length;
  await saveAlerts(filtered);
  return cleared;
}