'use client';

import { useAgentMonitor } from '@/hooks/useAgentMonitor';
import { Activity, Brain, CheckCircle, AlertTriangle, XCircle, Clock, Zap, Gauge } from 'lucide-react';

interface MonitorStatusProps {
  compact?: boolean;
}

export function MonitorStatus({ compact = false }: MonitorStatusProps) {
  const { overview, loading, error, getSystemHealthStatus, refresh } = useAgentMonitor({
    refreshInterval: 5000,
  });

  if (loading && !overview) {
    return <div className="text-muted-foreground">Loading...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <XCircle className="w-4 h-4" />
        <span>Error: {error}</span>
      </div>
    );
  }

  const healthStatus = getSystemHealthStatus();

  const statusColors = {
    healthy: 'text-green-500',
    degraded: 'text-yellow-500',
    critical: 'text-red-500',
  };

  const statusIcons = {
    healthy: <CheckCircle className="w-4 h-4 text-green-500" />,
    degraded: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
    critical: <XCircle className="w-4 h-4 text-red-500" />,
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {statusIcons[healthStatus]}
        <span className={statusColors[healthStatus]}>
          {overview?.activeAgents || 0} active
        </span>
        {overview && (
          <span className="text-muted-foreground text-sm">
            ({overview.averageSuccessRate}% success)
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusIcons[healthStatus]}
          <span className={`font-medium ${statusColors[healthStatus]}`}>
            System {healthStatus}
          </span>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Brain className="w-4 h-4" />
            Active Agents
          </div>
          <div className="text-2xl font-bold">{overview?.activeAgents || 0}</div>
        </div>

        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            Idle Agents
          </div>
          <div className="text-2xl font-bold">{overview?.idleAgents || 0}</div>
        </div>

        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="w-4 h-4" />
            Success Rate
          </div>
          <div className="text-2xl font-bold">{overview?.averageSuccessRate || 100}%</div>
        </div>

        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Gauge className="w-4 h-4" />
            Tasks Today
          </div>
          <div className="text-2xl font-bold">
            {(overview?.totalTasksCompleted || 0) + (overview?.totalTasksFailed || 0)}
          </div>
        </div>
      </div>

      {overview?.activeActivities && overview.activeActivities.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Active Tasks
          </h4>
          <div className="space-y-2">
            {overview.activeActivities.slice(0, 5).map((activity) => (
              <div
                key={activity.agentId}
                className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3 text-blue-500" />
                  <span className="font-medium">{activity.agentName}</span>
                  <span className="text-muted-foreground">- {activity.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {activity.currentTask}
                  </span>
                  {activity.progress !== undefined && (
                    <span className="text-xs bg-blue-500/20 text-blue-500 px-2 py-0.5 rounded">
                      {activity.progress}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {overview?.healthyAgents !== undefined && (
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-500" />
            {overview.healthyAgents} healthy
          </span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-yellow-500" />
            {overview.degradedAgents} degraded
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="w-3 h-3 text-red-500" />
            {overview.unhealthyAgents} unhealthy
          </span>
        </div>
      )}
    </div>
  );
}