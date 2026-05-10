'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { PageHeader } from '@/components/nexus/PageHeader';
import { toast } from 'sonner';
import { 
  useNexus, 
  useNexusAutomation, 
  useNexusAgents,
  type AgentInfo 
} from '@/hooks/useNexus';
import { 
  Zap, 
  Brain, 
  Activity, 
  Shield, 
  Clock, 
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  Settings,
  Sparkles,
  Upload,
  File,
  X,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { fileProcessor, type ProcessedFile } from '@/lib/services/fileProcessor';
import type { NexusResult } from '@/lib/core';
import type { GovernorValidation } from '@/lib/core/GovernorSystem';
import { loadProviderCapabilities, type ProviderCapability } from '@/lib/services/providerCapabilityService';

export default function NexusAIDashboard() {
  const router = useRouter();
  const {
    isInitialized,
    isGenerating,
    lastResult,
    error,
    systemStatus,
    automationStats,
    generate,
    refreshStatus,
  } = useNexus();

  const { agents, loading: agentsLoading, refresh: refreshAgents } = useNexusAgents();
  const automation = useNexusAutomation();

  const [userInput, setUserInput] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('twitter');
  const [governorLogs, setGovernorLogs] = useState<GovernorLogEntry[]>([]);
  const [generationHistory, setGenerationHistory] = useState<HistoryEntry[]>([]);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    generator: true,
    agents: true,
    providers: true,
    governor: true,
    history: true,
  });
  const [uploadedFiles, setUploadedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [providerHealth, setProviderHealth] = useState<ProviderCapability[]>([]);

  const refreshProviderHealth = useCallback(async () => {
    try {
      const capabilities = await loadProviderCapabilities();
      setProviderHealth(capabilities);
    } catch {
      setProviderHealth([]);
    }
  }, []);

  // Refresh data periodically
  useEffect(() => {
    void refreshProviderHealth();
    const interval = setInterval(() => {
      refreshStatus();
      refreshAgents();
      void refreshProviderHealth();
    }, 10000);
    return () => clearInterval(interval);
  }, [refreshStatus, refreshAgents, refreshProviderHealth]);

  // Handle generation
  const handleQuickDiscovery = async (type: 'trends' | 'location') => {
    if (isGenerating) return;
    try {
      if (type === 'trends') {
        const res = await fetch(`/api/discovery/trends?query=${encodeURIComponent(userInput || 'AI Trends')}`);
        const data = await res.json();
        if (data.trends && data.trends.length > 0) {
          const trend = data.trends[0];
          setUserInput(prev => `${prev}\n\n[Trending News]: ${trend.title} - ${trend.text}`);
          toast.success('Latest trend injected!');
        } else {
          toast.error('No trends found');
        }
      } else {
        const res = await fetch(`/api/discovery/location`);
        const data = await res.json();
        if (data && data.city) {
          setUserInput(prev => `${prev}\n\n[Target Location]: ${data.city}, ${data.country_name}`);
          toast.success('Location context injected!');
        } else {
          toast.error('Could not detect location');
        }
      }
    } catch (error) {
      toast.error('Discovery failed');
    }
  };

  const handleGenerate = async () => {
    if (!userInput.trim()) return;

    const result = await generate({
      userInput: userInput.trim(),
      taskType: 'full',
      platform: selectedPlatform,
    });

    // Add to history
    setGenerationHistory(prev => [{
      id: Date.now().toString(),
      content: result.output || '',
      score: result.score,
      platform: selectedPlatform,
      timestamp: new Date().toISOString(),
      success: result.success,
    }, ...prev].slice(0, 20));

    // Add to governor logs
    if (result.governorValidation) {
      setGovernorLogs(prev => [{
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        approved: result.governorValidation.approved,
        score: result.governorValidation.score,
        feedback: result.governorValidation.feedback,
        issues: result.governorValidation.issues.map(i => i.message),
      }, ...prev].slice(0, 50));
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingFile(true);
    try {
      const results = await fileProcessor.processFiles(Array.from(files));
      const processedFiles = results.map(r => r.file);
      setUploadedFiles(prev => [...prev, ...processedFiles]);
      
      // Add file context to user input
      const fileContext = results
        .filter(r => r.file.extractedText || r.file.summary)
        .map(r => {
          const content = r.file.extractedText || r.file.summary || '';
          return `[File: ${r.file.name}]\n${content.substring(0, 2000)}`;
        })
        .join('\n\n');
      
      if (fileContext) {
        setUserInput(prev => {
          if (prev.trim()) {
            return `${prev}\n\n--- Attached File Content ---\n${fileContext}`;
          }
          return `Create content based on this file:\n\n${fileContext}`;
        });
      }
    } catch (err) {
      console.error('[v0] File processing error:', err);
    } finally {
      setIsProcessingFile(false);
      // Reset input
      event.target.value = '';
    }
  };

  // Remove uploaded file
  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-[#080B14] flex items-center justify-center">
        <div className="text-center">
          <LoadingPulse />
          <p className="text-gray-400 mt-4">Initializing NEXUS AI System...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080B14] p-4 md:p-6 lg:p-8">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-cyan-400" />
              NEXUS AI
            </h1>
            <p className="text-gray-400 mt-1">Multi-Agent Content Generation System</p>
          </div>
          
          {/* System Status Badge */}
          <div className="flex items-center gap-4">
            <StatusBadge 
              status={systemStatus?.initialized ? 'online' : 'offline'}
              label={`${systemStatus?.agentCount || 0} Agents`}
            />
            <StatusBadge 
              status={automation.state.isRunning ? 'active' : 'inactive'}
              label="Automation"
            />
            <NeonButton 
              variant="ghost" 
              size="sm"
              onClick={() => { refreshStatus(); refreshAgents(); }}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </NeonButton>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Generator & History */}
          <div className="lg:col-span-2 space-y-6">
            {/* Generator Panel */}
            <CollapsiblePanel
              title="Content Generator"
              icon={<Zap className="h-5 w-5 text-cyan-400" />}
              expanded={expandedSections.generator}
              onToggle={() => toggleSection('generator')}
            >
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    Your content idea or topic
                  </label>
<textarea
  value={userInput}
  onChange={(e) => setUserInput(e.target.value)}
  placeholder="Enter your content idea, topic, or request..."
  className="w-full h-32 bg-black/40 border border-gray-700/50 rounded-lg p-4 text-white placeholder:text-gray-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 resize-none"
  />
  
  {/* Discovery Controls */}
  <div className="flex flex-wrap gap-2 mt-2">
    <NeonButton
      variant="ghost"
      size="sm"
      onClick={() => handleQuickDiscovery('trends')}
      disabled={isGenerating}
      icon={<TrendingUp className="h-4 w-4" />}
    >
      Inject Trends
    </NeonButton>
    <NeonButton
      variant="ghost"
      size="sm"
      onClick={() => handleQuickDiscovery('location')}
      disabled={isGenerating}
      icon={<MapPin className="h-4 w-4" />}
    >
      Inject Location
    </NeonButton>
    <NeonButton
      variant="ghost"
      size="sm"
      onClick={() => router.push('/discovery')}
      icon={<ExternalLink className="h-4 w-4" />}
    >
      Discovery Hub
    </NeonButton>
  </div>

  {/* File Upload */}
  <div className="flex items-center gap-3 mt-2">
    <NeonButton
      variant="ghost"
      size="sm"
      onClick={() => handleQuickDiscovery('trends')}
      disabled={isGenerating}
      icon={<TrendingUp className="h-4 w-4" />}
    >
      Inject Trends
    </NeonButton>
    <NeonButton
      variant="ghost"
      size="sm"
      onClick={() => handleQuickDiscovery('location')}
      disabled={isGenerating}
      icon={<MapPin className="h-4 w-4" />}
    >
      Inject Location
    </NeonButton>
    <NeonButton
      variant="ghost"
      size="sm"
      onClick={() => router.push('/discovery')}
      icon={<ExternalLink className="h-4 w-4" />}
    >
      Open Discovery
    </NeonButton>
  </div>
  
  <div className="flex items-center gap-3 mt-2">
    <label className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700/50 rounded-lg cursor-pointer transition-colors">
      <Upload className="h-4 w-4 text-cyan-400" />
      <span className="text-sm text-gray-300">
        {isProcessingFile ? 'Processing...' : 'Attach File'}
      </span>
      <input
        type="file"
        className="hidden"
        accept={fileProcessor.getAcceptString()}
        onChange={handleFileUpload}
        disabled={isProcessingFile}
        multiple
      />
    </label>
    <span className="text-xs text-gray-500">PDF, HTML, Code, Images, Documents</span>
  </div>

  {/* Uploaded Files */}
  {uploadedFiles.length > 0 && (
    <div className="flex flex-wrap gap-2 mt-2">
      {uploadedFiles.map(file => (
        <div key={file.id} className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <File className="h-4 w-4 text-cyan-400" />
          <span className="text-sm text-cyan-300 max-w-[150px] truncate">{file.name}</span>
          <button
            onClick={() => removeFile(file.id)}
            className="text-gray-400 hover:text-red-400 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )}
  </div>
  
  <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">
                      Platform
                    </label>
                    <select
                      value={selectedPlatform}
                      onChange={(e) => setSelectedPlatform(e.target.value)}
                      className="bg-black/40 border border-gray-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500/50"
                    >
                      <option value="twitter">Twitter/X</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="instagram">Instagram</option>
                      <option value="threads">Threads</option>
                      <option value="tiktok">TikTok</option>
                    </select>
                  </div>

                  <div className="flex-1" />

                  <NeonButton
                    variant="primary"
                    size="lg"
                    onClick={handleGenerate}
                    loading={isGenerating}
                    disabled={!userInput.trim()}
                    icon={<Brain className="h-5 w-5" />}
                  >
                    {isGenerating ? 'Generating...' : 'Generate with NEXUS'}
                  </NeonButton>
                </div>

                {/* Result Display */}
                {lastResult && (
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">Generated Content</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${
                          lastResult.success ? 'text-green-400' : 'text-red-400'
                        }`}>
                          Score: {lastResult.score}
                        </span>
                        <NeonButton
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(lastResult.output || '')}
                          icon={<Copy className="h-4 w-4" />}
                        >
                          Copy
                        </NeonButton>
                      </div>
                    </div>
                    
                    <div className="bg-black/60 border border-gray-700/50 rounded-lg p-4">
                      <p className="text-white whitespace-pre-wrap">{lastResult.output || 'No content generated'}</p>
                    </div>

                    {/* Metadata */}
                    <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                      <span>Provider: {lastResult.provider}</span>
                      <span>Agent: {lastResult.selectedAgent.split('_')[0]}</span>
                      <span>Duration: {lastResult.metadata.totalDuration}ms</span>
                      <span>Regenerations: {lastResult.metadata.regenerations}</span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <p className="text-red-400">{error}</p>
                  </div>
                )}
              </div>
            </CollapsiblePanel>

            {/* History Panel */}
            <CollapsiblePanel
              title="Generation History"
              icon={<Clock className="h-5 w-5 text-violet-400" />}
              expanded={expandedSections.history}
              onToggle={() => toggleSection('history')}
              badge={generationHistory.length}
            >
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {generationHistory.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No generation history yet</p>
                ) : (
                  generationHistory.map(entry => (
                    <HistoryItem key={entry.id} entry={entry} onCopy={copyToClipboard} />
                  ))
                )}
              </div>
            </CollapsiblePanel>
          </div>

          {/* Right Column - Agents, Providers, Governor */}
          <div className="space-y-6">
            {/* Automation Toggle */}
            <GlassCard className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-semibold">Automation</h3>
                  <p className="text-sm text-gray-400">
                    {automation.state.isRunning 
                      ? `Next run: ${automation.state.nextRun ? new Date(automation.state.nextRun).toLocaleTimeString() : 'Soon'}`
                      : 'Paused'}
                  </p>
                </div>
                <NeonButton
                  variant={automation.state.isRunning ? 'danger' : 'primary'}
                  size="sm"
                  onClick={automation.toggle}
                  icon={automation.state.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                >
                  {automation.state.isRunning ? 'Stop' : 'Start'}
                </NeonButton>
              </div>
              
              {automation.state.pausedReason && (
                <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-sm text-yellow-400">
                  Paused: {automation.state.pausedReason}
                </div>
              )}
            </GlassCard>

            {/* Agent Activity Panel */}
            <CollapsiblePanel
              title="Agent Activity"
              icon={<Brain className="h-5 w-5 text-cyan-400" />}
              expanded={expandedSections.agents}
              onToggle={() => toggleSection('agents')}
              badge={agents.length}
            >
              <div className="space-y-3">
                {agentsLoading ? (
                  <LoadingPulse />
                ) : agents.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No agents initialized</p>
                ) : (
                  agents.map(agent => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))
                )}
              </div>
            </CollapsiblePanel>

            {/* Provider Status Panel */}
            <CollapsiblePanel
              title="Provider Status"
              icon={<Activity className="h-5 w-5 text-green-400" />}
              expanded={expandedSections.providers}
              onToggle={() => toggleSection('providers')}
            >
              <div className="space-y-2">
                {providerHealth.length === 0 ? (
                  <p className="text-gray-500 text-center py-3">No provider status available</p>
                ) : (
                  providerHealth.map((provider) => (
                    <ProviderStatus
                      key={provider.id}
                      name={provider.name}
                      status={provider.status}
                    />
                  ))
                )}
              </div>
            </CollapsiblePanel>

            {/* Governor Logs Panel */}
            <CollapsiblePanel
              title="Governor Logs"
              icon={<Shield className="h-5 w-5 text-yellow-400" />}
              expanded={expandedSections.governor}
              onToggle={() => toggleSection('governor')}
              badge={governorLogs.length}
            >
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {governorLogs.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No validations yet</p>
                ) : (
                  governorLogs.map(log => (
                    <GovernorLogItem key={log.id} log={log} />
                  ))
                )}
              </div>
            </CollapsiblePanel>
          </div>
        </div>

        {/* Bottom Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Requests"
            value={systemStatus?.totalRequests || 0}
            icon={<Zap className="h-5 w-5 text-cyan-400" />}
          />
          <StatCard
            label="Success Rate"
            value={`${systemStatus?.successRate?.toFixed(1) || 100}%`}
            icon={<TrendingUp className="h-5 w-5 text-green-400" />}
          />
          <StatCard
            label="Automation Runs"
            value={automation.state.totalRuns}
            icon={<Activity className="h-5 w-5 text-violet-400" />}
          />
          <StatCard
            label="This Hour"
            value={automation.state.generationsThisHour}
            icon={<Clock className="h-5 w-5 text-yellow-400" />}
            subtext={`/ ${automation.config.maxGenerationsPerHour} max`}
          />
        </div>
      </div>
    </div>
  );
}

// ==================== SUB-COMPONENTS ====================

interface CollapsiblePanelProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  badge?: number;
  children: React.ReactNode;
}

function CollapsiblePanel({ title, icon, expanded, onToggle, badge, children }: CollapsiblePanelProps) {
  return (
    <GlassCard padding="none">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {badge !== undefined && badge > 0 && (
            <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">
              {badge}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-700/50">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </GlassCard>
  );
}

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'active' | 'inactive';
  label: string;
}

function StatusBadge({ status, label }: StatusBadgeProps) {
  const colors = {
    online: 'bg-green-500/20 text-green-400 border-green-500/30',
    offline: 'bg-red-500/20 text-red-400 border-red-500/30',
    active: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    inactive: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const dots = {
    online: 'bg-green-400',
    offline: 'bg-red-400',
    active: 'bg-cyan-400 animate-pulse',
    inactive: 'bg-gray-400',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${colors[status]}`}>
      <span className={`w-2 h-2 rounded-full ${dots[status]}`} />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

interface AgentCardProps {
  agent: AgentInfo;
}

function AgentCard({ agent }: AgentCardProps) {
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
  const brainStateLabel = (agent.brainState || 'idle').replace('_', ' ');

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
          <p className="text-xs text-gray-400">v{agent.evolutionVersion} • {agent.role}</p>
          <p className="text-[11px] text-gray-500">
            {brainStateLabel} • heartbeat {heartbeatLabel}
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

interface ProviderStatusProps {
  name: string;
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  latency?: number;
}

function ProviderStatus({ name, status, latency }: ProviderStatusProps) {
  const statusColors = {
    healthy: 'text-green-400',
    degraded: 'text-yellow-400',
    offline: 'text-red-400',
    unknown: 'text-gray-400',
  };

  return (
    <div className="flex items-center justify-between p-2 bg-black/30 rounded-lg">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${
          status === 'healthy' ? 'bg-green-400' :
          status === 'degraded' ? 'bg-yellow-400' : status === 'offline' ? 'bg-red-400' : 'bg-gray-400'
        }`} />
        <span className="text-sm text-gray-300">{name}</span>
      </div>
      <div className="flex items-center gap-2">
        {latency && <span className="text-xs text-gray-500">{latency}ms</span>}
        <span className={`text-xs font-medium ${statusColors[status]}`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
      </div>
    </div>
  );
}

interface GovernorLogEntry {
  id: string;
  timestamp: string;
  approved: boolean;
  score: number;
  feedback: string;
  issues: string[];
}

function GovernorLogItem({ log }: { log: GovernorLogEntry }) {
  return (
    <div className={`p-2 rounded-lg border ${
      log.approved 
        ? 'bg-green-500/5 border-green-500/20' 
        : 'bg-red-500/5 border-red-500/20'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {log.approved ? (
            <CheckCircle className="h-4 w-4 text-green-400" />
          ) : (
            <XCircle className="h-4 w-4 text-red-400" />
          )}
          <span className={`text-sm font-medium ${log.approved ? 'text-green-400' : 'text-red-400'}`}>
            {log.approved ? 'Approved' : 'Rejected'}
          </span>
        </div>
        <span className="text-xs text-gray-500">
          Score: {log.score}
        </span>
      </div>
      <p className="text-xs text-gray-400 truncate">{log.feedback}</p>
      <p className="text-xs text-gray-500 mt-1">
        {new Date(log.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}

interface HistoryEntry {
  id: string;
  content: string;
  score: number;
  platform: string;
  timestamp: string;
  success: boolean;
}

function HistoryItem({ entry, onCopy }: { entry: HistoryEntry; onCopy: (text: string) => void }) {
  return (
    <div className={`p-3 bg-black/40 rounded-lg border ${
      entry.success ? 'border-gray-700/30' : 'border-red-500/20'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 bg-gray-700/50 rounded text-gray-300">
            {entry.platform}
          </span>
          <span className={`text-sm font-medium ${
            entry.score >= 70 ? 'text-green-400' : 
            entry.score >= 50 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {entry.score}
          </span>
        </div>
        <button
          onClick={() => onCopy(entry.content)}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
      <p className="text-sm text-gray-300 line-clamp-2">{entry.content || 'Empty content'}</p>
      <p className="text-xs text-gray-500 mt-2">
        {new Date(entry.timestamp).toLocaleString()}
      </p>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtext?: string;
}

function StatCard({ label, value, icon, subtext }: StatCardProps) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        {icon}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {subtext && <span className="text-xs text-gray-500">{subtext}</span>}
      </div>
    </GlassCard>
  );
}
