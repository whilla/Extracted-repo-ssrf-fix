'use client';

import { Brain, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { AgentInfo } from '@/hooks/useNexus';

export interface AgentCardProps {
  agent: AgentInfo;
}

export function AgentCard({ agent }: AgentCardProps) {
  const trendIcon = {
    improving: <TrendingUp className="h-4 w-4 text-green-400" />,
    declining: <TrendingDown className="h-4 w-4 text-red-400" />,
    stable: <Minus className="h-4 w-4 text-gray-400" />,
  };

  const heartbeatTime = agent.heartbeatAt ? new Date(agent.heartbeatAt).getTime() : Number.NaN;
  const heartbeatAgeMs = Number.isFinite(heartbeatTime) ? Date.now() - heartbeatTime : Number.POSITIVE_INFINITY;
  const heartbeatHealthy = Number.isFinite(heartbeatAgeMs) && heartbeatAgeMs < 120_000;
  const heartbeatLabel = !Number.isFinite(heartbeatAgeMs)
    ? 'waiting'
    : heartbeatAgeMs < 60_000
      ? `${Math.max(1, Math.floor(heartbeatAgeMs / 1000))}s ago`
      : `${Math.max(1, Math.floor(heartbeatAgeMs / 60_000))}m ago`;
  const brainStateLabel = (agent.brainState || 'idle').replace(/_/g, ' ');

  const roleColors: Record<string, string> = {
    strategist: 'text-violet-400',
    writer: 'text-cyan-400',
    hook: 'text-yellow-400',
    critic: 'text-red-400',
  };

  return (
    <div className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-gray-700/30">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center ${roleColors[agent.role] || 'text-gray-400'}`}>
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <p className="text-white font-medium">{agent.name}</p>
          <p className="text-xs text-gray-400">v{agent.evolutionVersion} &bull; {agent.role}</p>
          <p className="text-[11px] text-gray-500">
            {brainStateLabel} &bull; heartbeat {heartbeatLabel}
          </p>
          {agent.lastDecision && (
            <p className="text-[11px] text-gray-500 max-w-[220px] truncate">{agent.lastDecision}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${heartbeatHealthy ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}
          title={heartbeatHealthy ? 'Agent heartbeat healthy' : 'Heartbeat stale'}
        />
        <div className="text-right">
          <p className="text-white font-semibold">{agent.performanceScore}</p>
          <p className="text-xs text-gray-400">score</p>
        </div>
        {trendIcon[agent.trend as keyof typeof trendIcon]}
      </div>
    </div>
  );
}
