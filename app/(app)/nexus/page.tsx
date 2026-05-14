'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { CollapsiblePanel } from '@/components/nexus/CollapsiblePanel';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { AgentCard } from '@/components/nexus/AgentCard';
import { ProviderStatusBadge } from '@/components/nexus/ProviderStatusBadge';
import { GovernorLogItem } from '@/components/nexus/GovernorLogItem';
import type { GovernorLogEntry } from '@/components/nexus/GovernorLogItem';
import { HistoryItem } from '@/components/nexus/HistoryItem';
import type { HistoryEntry } from '@/components/nexus/HistoryItem';
import { StatCard } from '@/components/nexus/StatCard';
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
  Play,
  Pause,
  RefreshCw,
  Copy,
  Sparkles,
  Upload,
  File,
  X,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { fileProcessor, type ProcessedFile } from '@/lib/services/fileProcessor';
import { loadProviderCapabilities, type ProviderCapability } from '@/lib/services/providerCapabilityService';

export default function NexusAIDashboard() {
  const router = useRouter();
  const {
    isInitialized,
    isGenerating,
    lastResult,
    error,
    systemStatus,
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

  useEffect(() => {
    void refreshProviderHealth();
    const interval = setInterval(() => {
      refreshStatus();
      refreshAgents();
      void refreshProviderHealth();
    }, 10000);
    return () => clearInterval(interval);
  }, [refreshStatus, refreshAgents, refreshProviderHealth]);

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
    } catch {
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

    setGenerationHistory(prev => [{
      id: Date.now().toString(),
      content: result.output || '',
      score: result.score,
      platform: selectedPlatform,
      timestamp: new Date().toISOString(),
      success: result.success,
    }, ...prev].slice(0, 20));

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessingFile(true);
    try {
      const results = await fileProcessor.processFiles(Array.from(files));
      const processedFiles = results.map(r => r.file);
      setUploadedFiles(prev => [...prev, ...processedFiles]);

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
      event.target.value = '';
    }
  };

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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center gap-3">
              <Sparkles className="h-8 w-8 text-cyan-400" />
              NEXUS AI
            </h1>
            <p className="text-gray-400 mt-1">Multi-Agent Content Generation System</p>
          </div>

          <div className="flex items-center gap-4">
            <StatusBadge
              status={systemStatus?.isInitialized ? 'online' : 'offline'}
              label={`${systemStatus?.activeAgents || 0} Agents`}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
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

                {lastResult && (
                  <div className="mt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">Generated Content</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${lastResult.success ? 'text-green-400' : 'text-red-400'}`}>
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

                    <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                      <span>Provider: {lastResult.provider}</span>
                      <span>Agent: {lastResult.selectedAgent?.split('_')[0] || 'Unknown'}</span>
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

          <div className="space-y-6">
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
                    <ProviderStatusBadge
                      key={provider.id}
                      name={provider.name}
                      status={provider.status}
                    />
                  ))
                )}
              </div>
            </CollapsiblePanel>

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Requests"
            value={systemStatus?.totalRequests || 0}
            icon={<Zap className="h-5 w-5 text-cyan-400" />}
          />
          <StatCard
            label="Success Rate"
            value={`${systemStatus && systemStatus.totalRequests > 0 ? ((systemStatus.totalSuccesses / systemStatus.totalRequests) * 100).toFixed(1) : 100}%`}
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
