/**
 * System Monitoring API
 * Comprehensive system health, alerts, and metrics
 */

import { NextResponse } from 'next/server';
import { runHealthChecks, getAlerts, getAlertSummary, acknowledgeAlert, resolveAlert, startAlertMonitoring } from '@/lib/services/alertService';
import { getServiceHealthSummary, getAllServiceStatuses, getServiceMetrics } from '@/lib/services/serviceMonitor';
import { getMetricsSummary, captureSnapshot, getTimeSeriesData, exportMetricsHistory, startMetricsCollection } from '@/lib/services/metricsHistoryService';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    switch (type) {
      case 'summary':
      case 'alerts':
        const summary = await getAlertSummary();
        const alerts = await getAlerts({ limit: 20 });
        return NextResponse.json({ summary, alerts, timestamp: new Date().toISOString() });

      case 'alert-detail':
        const alertId = searchParams.get('alertId');
        if (!alertId) {
          return NextResponse.json({ error: 'alertId required' }, { status: 400 });
        }
        const allAlerts = await getAlerts({ limit: 100 });
        const alert = allAlerts.find(a => a.id === alertId);
        return NextResponse.json({ alert: alert || null });

      case 'services':
        const serviceSummary = await getServiceHealthSummary();
        const serviceStatuses = await getAllServiceStatuses();
        const serviceMetrics = await getServiceMetrics();
        return NextResponse.json({ 
          summary: serviceSummary, 
          statuses: serviceStatuses,
          metrics: serviceMetrics,
          timestamp: new Date().toISOString() 
        });

      case 'history':
        const period = (searchParams.get('period') || 'hour') as 'hour' | 'day' | 'week' | 'month';
        const history = await getMetricsSummary(period);
        return NextResponse.json({ history, timestamp: new Date().toISOString() });

      case 'timeseries':
        const field = (searchParams.get('field') || 'tasks') as 'tasks' | 'successRate' | 'latency' | 'errorRate';
        const sinceParam = searchParams.get('since');
        const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60 * 60 * 1000);
        const snapshots = await getMetricsHistory(since);
        const timeseries = getTimeSeriesData(snapshots, field);
        return NextResponse.json({ timeseries, timestamp: new Date().toISOString() });

      case 'export':
        const exportSince = searchParams.get('since') ? new Date(searchParams.get('since')!) : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const exportUntil = searchParams.get('until') ? new Date(searchParams.get('until')!) : new Date();
        const exportData = await exportMetricsHistory(exportSince, exportUntil);
        return NextResponse.json({ data: exportData, timestamp: new Date().toISOString() });

      case 'snapshot':
        const snapshot = await captureSnapshot();
        return NextResponse.json({ snapshot, timestamp: new Date().toISOString() });

      default:
        const [alertSummary, serviceHealth, metrics] = await Promise.all([
          getAlertSummary(),
          getServiceHealthSummary(),
          getMetricsSummary('hour'),
        ]);

        return NextResponse.json({
          alerts: alertSummary,
          services: serviceHealth,
          metrics,
          timestamp: new Date().toISOString(),
        });
    }
  } catch (error) {
    console.error('[api/monitor/system] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'System monitoring error' },
      { status: 500 }
    );
  }
}

async function getMetricsHistory(since: Date): Promise<import('@/lib/services/metricsHistoryService').MetricsSnapshot[]> {
  const { kvGet } = await import('@/lib/services/puterService');
  const HISTORY_KEY = 'metrics_history';
  const data = await kvGet(HISTORY_KEY);
  const all = data ? JSON.parse(data) : [];
  return all.filter((s: { timestamp: string }) => new Date(s.timestamp).getTime() >= since.getTime());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'run-checks':
        await runHealthChecks();
        return NextResponse.json({ success: true, message: 'Health checks completed' });

      case 'acknowledge':
        if (!body.alertId || !body.acknowledgedBy) {
          return NextResponse.json({ error: 'alertId and acknowledgedBy required' }, { status: 400 });
        }
        await acknowledgeAlert(body.alertId, body.acknowledgedBy);
        return NextResponse.json({ success: true, message: 'Alert acknowledged' });

      case 'resolve':
        if (!body.alertId) {
          return NextResponse.json({ error: 'alertId required' }, { status: 400 });
        }
        await resolveAlert(body.alertId);
        return NextResponse.json({ success: true, message: 'Alert resolved' });

      case 'start-monitoring':
        startAlertMonitoring(60000);
        startMetricsCollection(60000);
        return NextResponse.json({ success: true, message: 'Monitoring started' });

      case 'stop-monitoring':
        const { stopAlertMonitoring } = await import('@/lib/services/alertService');
        const { stopMetricsCollection } = await import('@/lib/services/metricsHistoryService');
        stopAlertMonitoring();
        stopMetricsCollection();
        return NextResponse.json({ success: true, message: 'Monitoring stopped' });

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    );
  }
}