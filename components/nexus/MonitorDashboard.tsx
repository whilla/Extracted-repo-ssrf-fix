'use client';

import { useState, useEffect } from 'react';
import { 
  Monitor, AlertTriangle, Activity, Server, 
  Clock, TrendingUp, TrendingDown, Minus,
  CheckCircle, XCircle, AlertCircle, RefreshCw
} from 'lucide-react';

interface AlertSummary {
  active: number;
  acknowledged: number;
  resolved: number;
  critical: number;
  errors: number;
  warnings: number;
}

interface ServiceSummary {
  totalServices: number;
  operational: number;
  degraded: number;
  down: number;
  averageLatency: number;
  totalCalls: number;
  overallErrorRate: number;
}

interface MetricsData {
  period: string;
  averages: {
    taskCompletionRate: number;
    serviceUptime: number;
    averageLatency: number;
    errorRate: number;
  };
  trends: {
    tasks: string;
    latency: string;
    errors: string;
  };
}

export function MonitorDashboard() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts' | 'services' | 'metrics'>('overview');
  const [alertSummary, setAlertSummary] = useState<AlertSummary | null>(null);
  const [serviceSummary, setServiceSummary] = useState<ServiceSummary | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [systemRes, alertsRes, servicesRes, metricsRes] = await Promise.all([
        fetch('/api/monitor/system'),
        fetch('/api/monitor/system?type=alerts'),
        fetch('/api/monitor/system?type=services'),
        fetch('/api/monitor/system?type=history'),
      ]);

      if (!systemRes.ok || !alertsRes.ok || !servicesRes.ok || !metricsRes.ok) {
        throw new Error('Failed to fetch monitoring data');
      }

      const systemData = await systemRes.json();
      const alertsData = await alertsRes.json();
      const servicesData = await servicesRes.json();
      const metricsData = await metricsRes.json();

      setAlertSummary(alertsData.summary);
      setServiceSummary(servicesData.summary);
      setMetrics(metricsData.history);
      setLastUpdate(new Date().toISOString());
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[MonitorDashboard] Fetch error:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const getTrendIcon = (trend: string) => {
    if (trend === 'increasing' || trend === 'degrading') return <TrendingUp className="w-4 h-4 text-red-500" />;
    if (trend === 'decreasing' || trend === 'improving') return <TrendingDown className="w-4 h-4 text-green-500" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-500';
      case 'error': return 'text-orange-500';
      case 'warning': return 'text-yellow-500';
      default: return 'text-blue-500';
    }
  };

  if (loading && !alertSummary) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Monitor className="w-5 h-5" />
          System Monitor
        </h2>
        <div className="text-xs text-muted-foreground">
          Last update: {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : 'N/A'}
        </div>
      </div>

      <div className="flex gap-2 border-b pb-2">
        {(['overview', 'alerts', 'services', 'metrics'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
              activeTab === tab 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <AlertTriangle className="w-4 h-4" />
              Active Alerts
            </div>
            <div className="text-2xl font-bold">{alertSummary?.active || 0}</div>
            {alertSummary?.critical > 0 && (
              <div className="text-xs text-red-500">{alertSummary.critical} critical</div>
            )}
          </div>

          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Server className="w-4 h-4" />
              Services
            </div>
            <div className="text-2xl font-bold">
              {serviceSummary?.operational || 0}/{serviceSummary?.totalServices || 0}
            </div>
            <div className="text-xs text-muted-foreground">operational</div>
          </div>

          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Activity className="w-4 h-4" />
              Task Success
            </div>
            <div className="text-2xl font-bold">{metrics?.averages.taskCompletionRate != null ? `${metrics.averages.taskCompletionRate}%` : 'N/A'}</div>
            {metrics?.trends.tasks && getTrendIcon(metrics.trends.tasks)}
          </div>

          <div className="p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="w-4 h-4" />
              Avg Latency
            </div>
            <div className="text-2xl font-bold">{metrics?.averages.averageLatency || 0}ms</div>
            {metrics?.trends.latency && getTrendIcon(metrics.trends.latency)}
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1">
              <XCircle className="w-4 h-4 text-red-500" />
              <span>{alertSummary?.critical || 0} critical</span>
            </div>
            <div className="flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <span>{alertSummary?.errors || 0} errors</span>
            </div>
            <div className="flex items-center gap-1">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span>{alertSummary?.warnings || 0} warnings</span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            View alerts at <code>/api/monitor/system?type=alerts</code>
          </div>
        </div>
      )}

      {activeTab === 'services' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 rounded bg-green-500/10 text-green-500">
              <CheckCircle className="w-4 h-4 mb-1" />
              <div className="text-lg font-bold">{serviceSummary?.operational || 0}</div>
              <div className="text-xs">Operational</div>
            </div>
            <div className="p-3 rounded bg-yellow-500/10 text-yellow-500">
              <AlertTriangle className="w-4 h-4 mb-1" />
              <div className="text-lg font-bold">{serviceSummary?.degraded || 0}</div>
              <div className="text-xs">Degraded</div>
            </div>
            <div className="p-3 rounded bg-red-500/10 text-red-500">
              <XCircle className="w-4 h-4 mb-1" />
              <div className="text-lg font-bold">{serviceSummary?.down || 0}</div>
              <div className="text-xs">Down</div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            <div>Total calls: {serviceSummary?.totalCalls || 0}</div>
            <div>Error rate: {serviceSummary?.overallErrorRate || 0}%</div>
          </div>
        </div>
      )}

      {activeTab === 'metrics' && metrics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Task Completion</div>
              <div className="text-xl font-bold">{metrics.averages.taskCompletionRate}%</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Service Uptime</div>
              <div className="text-xl font-bold">{metrics.averages.serviceUptime}%</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Avg Latency</div>
              <div className="text-xl font-bold">{metrics.averages.averageLatency}ms</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Error Rate</div>
              <div className="text-xl font-bold">{metrics.averages.errorRate}%</div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Trends</h4>
            <div className="flex gap-4 text-sm">
              <span>Tasks: {metrics.trends.tasks} {getTrendIcon(metrics.trends.tasks)}</span>
              <span>Latency: {metrics.trends.latency} {getTrendIcon(metrics.trends.latency)}</span>
              <span>Errors: {metrics.trends.errors} {getTrendIcon(metrics.trends.errors)}</span>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={fetchData}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <RefreshCw className="w-4 h-4" />
        Refresh
      </button>
    </div>
  );
}