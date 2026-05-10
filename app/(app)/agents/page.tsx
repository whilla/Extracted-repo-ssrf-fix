'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { PageHeader } from '@/components/nexus/PageHeader';
import LoadingPulse from '@/components/nexus/LoadingPulse';
import { 
  Bot, 
  Brain, 
  Shield, 
  Zap, 
  TrendingUp, 
  Activity,
  RefreshCw,
  Settings2,
  Sparkles,
  GitBranch,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  Pause,
} from 'lucide-react';
import { loadAgents, getAgentStats, type AgentConfig } from '@/lib/services/multiAgentService';
import { getEvolutionHistory, runEvolutionCycle, type EvolutionProposal } from '@/lib/services/agentEvolutionService';
import { getGovernorDashboard, saveGovernorConfig, type GovernorConfig } from '@/lib/services/governorService';
import { getOrchestrationStatus } from '@/lib/services/orchestrationEngine';

export default function AgentsPage() {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getAgentStats>> | null>(null);
  const [evolutionHistory, setEvolutionHistory] = useState<Awaited<ReturnType<typeof getEvolutionHistory>> | null>(null);
  const [governorData, setGovernorData] = useState<Awaited<ReturnType<typeof getGovernorDashboard>> | null>(null);
  const [systemStatus, setSystemStatus] = useState<Awaited<ReturnType<typeof getOrchestrationStatus>> | null>(null);
  const [runningEvolution, setRunningEvolution] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [agentsData, statsData, evolutionData, govData, statusData] = await Promise.all([
        loadAgents(),
        getAgentStats(),
        getEvolutionHistory(),
        getGovernorDashboard(),
        getOrchestrationStatus(),
      ]);
      
      setAgents(agentsData);
      setStats(statsData);
      setEvolutionHistory(evolutionData);
      setGovernorData(govData);
      setSystemStatus(statusData);
    } catch (error) {
      console.error('Failed to load agent data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const handleRunEvolution = async () => {
    setRunningEvolution(true);
    try {
      await runEvolutionCycle();
      await loadData();
    } catch (error) {
      console.error('Evolution cycle failed:', error);
    } finally {
      setRunningEvolution(false);
    }
  };

  const handleToggleGovernor = async () => {
    if (!governorData) return;
    await saveGovernorConfig({ ...governorData.config, enabled: !governorData.config.enabled });
    await loadData();
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'critical': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  const getEvolutionStateColor = (state: AgentConfig['evolutionState']) => {
    switch (state) {
      case 'active': return 'success';
      case 'promoted': return 'success';
      case 'hybrid': return 'info';
      case 'demoted': return 'warning';
      case 'deprecated': return 'error';
      default: return 'pending';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingPulse text="Loading Agent Control Center..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Control Center"
        subtitle="Multi-agent orchestration, evolution, and governor oversight"
        icon={Brain}
        actions={
          <div className="flex gap-2">
            <NeonButton
              variant="ghost"
              size="sm"
              onClick={loadData}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </NeonButton>
            <NeonButton
              variant="primary"
              size="sm"
              onClick={handleRunEvolution}
              disabled={runningEvolution}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {runningEvolution ? 'Evolving...' : 'Run Evolution'}
            </NeonButton>
          </div>
        }
      />

      {/* System Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Agents</p>
              <p className="text-2xl font-bold">{stats?.activeAgents || 0}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Avg Performance</p>
              <p className="text-2xl font-bold">{stats?.avgPerformance || 0}%</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Activity className={`w-5 h-5 ${getHealthColor(governorData?.systemHealth || 'healthy')}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">System Health</p>
              <p className={`text-2xl font-bold capitalize ${getHealthColor(governorData?.systemHealth || 'healthy')}`}>
                {governorData?.systemHealth || 'Unknown'}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <GitBranch className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Evolution Proposals</p>
              <p className="text-2xl font-bold">{evolutionHistory?.pending || 0}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Governor Control */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <h2 className="text-xl font-bold">Governor Mode</h2>
              <p className="text-sm text-muted-foreground">System supervisor and quality control</p>
            </div>
          </div>
          <NeonButton
            variant={governorData?.config.enabled ? 'primary' : 'ghost'}
            size="sm"
            onClick={handleToggleGovernor}
          >
            {governorData?.config.enabled ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Disable
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Enable
              </>
            )}
          </NeonButton>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Quality Threshold</p>
            <p className="text-lg font-semibold">{governorData?.config.qualityThreshold}%</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Daily Cost</p>
            <p className="text-lg font-semibold">
              ${((governorData?.state.dailyCost || 0) / 100).toFixed(2)} / ${((governorData?.config.costLimitDaily || 0) / 100).toFixed(2)}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Approved Today</p>
            <p className="text-lg font-semibold text-green-400">{governorData?.state.approvedToday || 0}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground mb-1">Rejected Today</p>
            <p className="text-lg font-semibold text-red-400">{governorData?.state.rejectedToday || 0}</p>
          </div>
        </div>

        {governorData?.state.currentMode === 'failsafe' && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <div>
              <p className="font-medium text-red-400">Failsafe Mode Active</p>
              <p className="text-sm text-muted-foreground">System is operating in restricted mode</p>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Active Agents */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bot className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Active Agents</h2>
            <p className="text-sm text-muted-foreground">Specialized AI agents for content generation</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.filter(a => a.evolutionState !== 'deprecated').map((agent) => (
            <div key={agent.id} className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <h3 className="font-medium">{agent.name}</h3>
                </div>
                <StatusBadge 
                  status={getEvolutionStateColor(agent.evolutionState)} 
                  label={agent.evolutionState}
                  dot
                />
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <span className="capitalize">{agent.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Performance</span>
                  <span className={agent.performanceScore >= 80 ? 'text-green-400' : agent.performanceScore >= 60 ? 'text-yellow-400' : 'text-red-400'}>
                    {agent.performanceScore}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version</span>
                  <span>v{agent.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tasks</span>
                  <span>{agent.taskHistory.length}</span>
                </div>
              </div>

              {agent.parentAgents && agent.parentAgents.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    <GitBranch className="w-3 h-3 inline mr-1" />
                    Hybrid from {agent.parentAgents.length} parents
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Evolution History */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">Evolution History</h2>
            <p className="text-sm text-muted-foreground">Agent self-modification and improvement proposals</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="p-3 rounded-lg bg-green-500/10 text-center">
            <CheckCircle className="w-5 h-5 text-green-400 mx-auto mb-1" />
            <p className="text-lg font-semibold text-green-400">{evolutionHistory?.applied || 0}</p>
            <p className="text-xs text-muted-foreground">Applied</p>
          </div>
          <div className="p-3 rounded-lg bg-red-500/10 text-center">
            <XCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
            <p className="text-lg font-semibold text-red-400">{evolutionHistory?.rejected || 0}</p>
            <p className="text-xs text-muted-foreground">Rejected</p>
          </div>
          <div className="p-3 rounded-lg bg-yellow-500/10 text-center">
            <RefreshCw className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
            <p className="text-lg font-semibold text-yellow-400">{evolutionHistory?.pending || 0}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </div>
        </div>

        {evolutionHistory?.proposals && evolutionHistory.proposals.length > 0 ? (
          <div className="space-y-2">
            {evolutionHistory.proposals.slice(-5).reverse().map((proposal) => (
              <div 
                key={proposal.id} 
                className="p-3 rounded-lg bg-muted/20 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    proposal.status === 'applied' ? 'bg-green-400' :
                    proposal.status === 'rejected' ? 'bg-red-400' :
                    proposal.status === 'approved' ? 'bg-blue-400' :
                    'bg-yellow-400'
                  }`} />
                  <div>
                    <p className="text-sm font-medium">{proposal.proposalType.replace('_', ' ')}</p>
                    <p className="text-xs text-muted-foreground">{proposal.reasoning}</p>
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge 
                    status={
                      proposal.status === 'applied' ? 'success' :
                      proposal.status === 'rejected' ? 'error' :
                      proposal.status === 'approved' ? 'info' :
                      'pending'
                    } 
                    label={proposal.status}
                    dot
                  />
                  {proposal.testResults && (
                    <p className="text-xs text-muted-foreground mt-1">
                      +{proposal.testResults.improvement.toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-4">
            No evolution proposals yet. Run evolution cycle to generate improvements.
          </p>
        )}
      </GlassCard>
    </div>
  );
}
