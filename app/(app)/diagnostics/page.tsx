'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { 
  runFullDiagnostics, 
  type FullDiagnostics,
  type DiagnosticResult 
} from '@/lib/services/diagnosticsService';
import { 
  loadProviderCapabilities, 
  healthCheckAllProviders,
  checkBudget,
  type ProviderCapability 
} from '@/lib/services/providerCapabilityService';
import { runMonitorAndRetry } from '@/lib/services/monitorRetryService';
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  Zap,
  Server,
  DollarSign,
  Activity,
  Wifi,
  WifiOff,
} from 'lucide-react';

export default function DiagnosticsPage() {
  const [diagnostics, setDiagnostics] = useState<FullDiagnostics | null>(null);
  const [providers, setProviders] = useState<ProviderCapability[]>([]);
  const [budget, setBudget] = useState<Awaited<ReturnType<typeof checkBudget>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [runningWorkers, setRunningWorkers] = useState(false);
  const [workerResult, setWorkerResult] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [diagData, providerData, budgetData] = await Promise.all([
        runFullDiagnostics(),
        loadProviderCapabilities(),
        checkBudget(),
      ]);
      setDiagnostics(diagData);
      setProviders(providerData);
      setBudget(budgetData);
    } catch (error) {
      console.error('Error loading diagnostics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await healthCheckAllProviders();
    await loadData();
    setRefreshing(false);
  };

  const handleRunWorkers = async () => {
    setRunningWorkers(true);
    setWorkerResult(null);
    try {
      const report = await runMonitorAndRetry(10);
      setWorkerResult(
        `Processed ${report.worker.processed} queued jobs, posted ${report.worker.posted}, failed ${report.worker.failed}. Analytics checked ${report.analytics.checked}.`
      );
      await loadData();
    } catch (error) {
      setWorkerResult(error instanceof Error ? error.message : 'Worker run failed.');
    } finally {
      setRunningWorkers(false);
    }
  };

  const getStatusIcon = (status: DiagnosticResult['status'] | 'unknown') => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="w-5 h-5 text-green-400" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'offline':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'unconfigured':
        return <WifiOff className="w-5 h-5 text-gray-400" />;
      default:
        return <Activity className="w-5 h-5 text-gray-400" />;
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy':
        return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'degraded':
        return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'critical':
        return 'text-red-400 bg-red-400/10 border-red-400/20';
      default:
        return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Running diagnostics...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">System Diagnostics</h1>
          <p className="text-muted-foreground">Monitor connections and system health</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <NeonButton
            onClick={handleRefresh}
            loading={refreshing}
            icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </NeonButton>
          <NeonButton
            onClick={handleRunWorkers}
            loading={runningWorkers}
            disabled={runningWorkers}
            variant="outline"
            icon={<Zap className="w-4 h-4" />}
          >
            Run Posting Workers
          </NeonButton>
        </div>
      </div>

      {workerResult && (
        <GlassCard className="p-4 mb-6 border border-[var(--nexus-cyan)]/30">
          <p className="text-sm text-muted-foreground">{workerResult}</p>
        </GlassCard>
      )}

      {/* Overall Health */}
      {diagnostics && (
        <GlassCard className="p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full border ${getHealthColor(diagnostics.overallHealth)}`}>
                {diagnostics.overallHealth === 'healthy' ? (
                  <Wifi className="w-6 h-6" />
                ) : diagnostics.overallHealth === 'critical' ? (
                  <WifiOff className="w-6 h-6" />
                ) : (
                  <Activity className="w-6 h-6" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  System {diagnostics.overallHealth.charAt(0).toUpperCase() + diagnostics.overallHealth.slice(1)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Last checked: {new Date(diagnostics.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-foreground">
                {diagnostics.services.filter(s => s.status === 'healthy').length}/{diagnostics.services.length}
              </div>
              <div className="text-xs text-muted-foreground">Services Online</div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Service Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {diagnostics?.services.map(service => (
          <GlassCard key={service.service} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(service.status)}
                <span className="font-medium text-foreground">{service.service}</span>
              </div>
              {service.latency !== undefined && service.latency > 0 && (
                <span className="text-xs text-muted-foreground">{service.latency}ms</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{service.message}</p>
            {service.details && Object.keys(service.details).length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                {Object.entries(service.details).slice(0, 3).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{key}:</span>
                    <span className="text-foreground">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        ))}
      </div>

      {/* Provider Capabilities */}
      <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
        <Server className="w-5 h-5" />
        AI Provider Status
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {providers.map(provider => (
          <GlassCard key={provider.id} className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(provider.status)}
                <span className="font-medium text-foreground">{provider.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {provider.requiresApiKey && (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    provider.apiKeyConfigured 
                      ? 'bg-green-400/10 text-green-400' 
                      : 'bg-yellow-400/10 text-yellow-400'
                  }`}>
                    {provider.apiKeyConfigured ? 'Configured' : 'Needs Key'}
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex flex-wrap gap-1 mb-2">
              {provider.capabilities.chat && (
                <span className="text-xs px-1.5 py-0.5 bg-muted rounded">Chat</span>
              )}
              {provider.capabilities.vision && (
                <span className="text-xs px-1.5 py-0.5 bg-muted rounded">Vision</span>
              )}
              {provider.capabilities.imageGeneration && (
                <span className="text-xs px-1.5 py-0.5 bg-muted rounded">Images</span>
              )}
              {provider.capabilities.codeGeneration && (
                <span className="text-xs px-1.5 py-0.5 bg-muted rounded">Code</span>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              {provider.models.length} models available
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Usage Budget */}
      {budget && (
        <>
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Usage & Budget
          </h2>
          <GlassCard className="p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Daily Usage</span>
                  <span className={`text-sm font-medium ${
                    budget.withinDailyLimit ? 'text-green-400' : 'text-red-400'
                  }`}>
                    ${budget.dailyUsage.toFixed(2)} / ${budget.dailyLimit}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      budget.withinDailyLimit ? 'bg-green-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.min(100, (budget.dailyUsage / budget.dailyLimit) * 100)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Monthly Usage</span>
                  <span className={`text-sm font-medium ${
                    budget.withinMonthlyLimit ? 'text-green-400' : 'text-red-400'
                  }`}>
                    ${budget.monthlyUsage.toFixed(2)} / ${budget.monthlyLimit}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      budget.withinMonthlyLimit ? 'bg-green-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.min(100, (budget.monthlyUsage / budget.monthlyLimit) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {budget.warningTriggered && (
              <div className="mt-4 p-3 bg-yellow-400/10 border border-yellow-400/20 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="text-sm text-yellow-400">
                  Approaching usage limit. Consider upgrading or reducing usage.
                </span>
              </div>
            )}
          </GlassCard>
        </>
      )}

      {/* Recommendations */}
      {diagnostics?.recommendations && diagnostics.recommendations.length > 0 && (
        <>
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Recommendations
          </h2>
          <GlassCard className="p-4">
            <ul className="space-y-2">
              {diagnostics.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                  <span className="text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        </>
      )}
    </div>
  );
}
