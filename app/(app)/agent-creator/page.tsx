'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { PageHeader } from '@/components/nexus/PageHeader';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Bot,
  Plus,
  Wand2,
  Code2,
  Brain,
  Zap,
  Settings2,
  Play,
  Trash2,
  Edit3,
  Copy,
  GitBranch,
  History,
  Shield,
  Sparkles,
  Terminal,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  PenTool,
} from 'lucide-react';
import {
  loadCreatedAgents,
  createAgentFromBlueprint,
  generateAgentWithGodMode,
  deleteCreatedAgent,
  getAgentTemplates,
  proposeSelfModification,
  applySelfModification,
  agentWriteCode,
  agentEditCode,
  type CreatedAgent,
  type AgentBlueprint,
  type AgentCodeModule,
  type SelfModificationEntry,
} from '@/lib/services/agentCreatorService';
import type { AgentCapability } from '@/lib/services/multiAgentService';

const CAPABILITIES: { value: AgentCapability; label: string }[] = [
  { value: 'text_generation', label: 'Text Generation' },
  { value: 'hook_creation', label: 'Hook Creation' },
  { value: 'strategy_planning', label: 'Strategy Planning' },
  { value: 'content_optimization', label: 'Content Optimization' },
  { value: 'quality_critique', label: 'Quality Critique' },
  { value: 'visual_description', label: 'Visual Description' },
  { value: 'hashtag_research', label: 'Hashtag Research' },
  { value: 'engagement_prediction', label: 'Engagement Prediction' },
  { value: 'multi_task', label: 'Multi-Task' },
];

export default function AgentCreatorPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<CreatedAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<CreatedAgent | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'code' | 'evolution' | 'test'>('overview');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGodModeModal, setShowGodModeModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // God Mode form
  const [godModeForm, setGodModeForm] = useState({
    description: '',
    useCase: '',
    complexity: 'moderate' as 'simple' | 'moderate' | 'advanced' | 'expert',
    selfModification: true,
  });

  // Manual creation form
  const [manualForm, setManualForm] = useState<Partial<AgentBlueprint>>({
    name: '',
    description: '',
    role: 'writer',
    capabilities: ['text_generation'],
    promptTemplate: '',
    selfModificationLevel: 'limited',
    godModeEnabled: false,
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadCreatedAgents();
      setAgents(data);
      if (data.length > 0 && !selectedAgent) {
        setSelectedAgent(data[0]);
      }
    } catch (err) {
      console.error('Failed to load agents:', err);
      setError('Failed to load agents. Please try again.');
      setAgents([]);
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

  const handleCreateWithGodMode = async () => {
    if (!godModeForm.description || !godModeForm.useCase) return;
    
    setCreating(true);
    try {
      const agent = await generateAgentWithGodMode(godModeForm.description, {
        useCase: godModeForm.useCase,
        complexity: godModeForm.complexity,
        selfModification: godModeForm.selfModification,
      });
      setAgents(prev => [...prev, agent]);
      setSelectedAgent(agent);
      setShowGodModeModal(false);
      setGodModeForm({
        description: '',
        useCase: '',
        complexity: 'moderate',
        selfModification: true,
      });
    } catch (error) {
      console.error('God mode creation failed:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateManual = async () => {
    if (!manualForm.name || !manualForm.promptTemplate) return;
    
    setCreating(true);
    try {
      const blueprint: AgentBlueprint = {
        name: manualForm.name || 'Custom Agent',
        description: manualForm.description || '',
        role: manualForm.role || 'writer',
        personality: {
          tone: 'professional',
          style: 'concise',
          traits: [],
          vocabulary: [],
          avoidPhrases: [],
          exampleOutputs: [],
        },
        capabilities: manualForm.capabilities || ['text_generation'],
        customCapabilities: [],
        promptTemplate: manualForm.promptTemplate || '',
        systemInstructions: '',
        codeModules: [],
        scoringWeights: {
          creativity: 0.25,
          relevance: 0.25,
          engagement: 0.25,
          brandAlignment: 0.25,
          customMetrics: {},
        },
        triggers: [],
        constraints: [],
        godModeEnabled: manualForm.godModeEnabled || false,
        selfModificationLevel: manualForm.selfModificationLevel || 'limited',
      };
      
      const agent = await createAgentFromBlueprint(blueprint);
      setAgents(prev => [...prev, agent]);
      setSelectedAgent(agent);
      setShowCreateModal(false);
    } catch (error) {
      console.error('Manual creation failed:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleUseTemplate = (template: Partial<AgentBlueprint>) => {
    setManualForm({
      ...manualForm,
      ...template,
      promptTemplate: `You are ${template.name}. ${template.description || ''}\n\nYour role is to...`,
    });
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    
    await deleteCreatedAgent(id);
    setAgents(prev => prev.filter(a => a.id !== id));
    if (selectedAgent?.id === id) {
      setSelectedAgent(agents.find(a => a.id !== id) || null);
    }
  };

  const handleProposeSelfMod = async () => {
    if (!selectedAgent) return;
    
    const modification = await proposeSelfModification(selectedAgent.id, {
      recentPerformance: selectedAgent.taskHistory.slice(-10).map(t => t.score),
      failedTasks: selectedAgent.taskHistory.filter(t => t.score < 0.5).map(t => t.input).slice(-5),
      userFeedback: [],
    });
    
    if (modification) {
      await loadData();
      const updated = await loadCreatedAgents();
      setSelectedAgent(updated.find(a => a.id === selectedAgent.id) || null);
    }
  };

  const handleApplySelfMod = async (modId: string) => {
    if (!selectedAgent) return;
    
    const success = await applySelfModification(selectedAgent.id, modId);
    if (success) {
      await loadData();
      const updated = await loadCreatedAgents();
      setSelectedAgent(updated.find(a => a.id === selectedAgent.id) || null);
    }
  };

  const handleAgentWriteCode = async () => {
    if (!selectedAgent) return;
    
    const purpose = prompt('What should this code module do?');
    if (!purpose) return;
    
    const codeModule = await agentWriteCode(selectedAgent.id, {
      purpose,
      inputType: 'string',
      outputType: 'string',
      constraints: [],
    });
    
    if (codeModule) {
      await loadData();
      const updated = await loadCreatedAgents();
      setSelectedAgent(updated.find(a => a.id === selectedAgent.id) || null);
    }
  };

  const templates = getAgentTemplates();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingPulse size="lg" text="Loading Agent Creator..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <PageHeader
        title="Agent Creator"
        description="Create, configure, and deploy custom AI agents with self-modification capabilities"
        icon={<Bot className="w-8 h-8" />}
        action={
          <div className="flex gap-2">
            <NeonButton variant="secondary" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Manual Create
            </NeonButton>
            <NeonButton onClick={() => setShowGodModeModal(true)}>
              <Wand2 className="w-4 h-4 mr-2" />
              God Mode
            </NeonButton>
          </div>
        }
      />

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/20 border border-destructive/50 text-destructive">
          <p className="font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-12 gap-6 mt-6">
        {/* Agents List */}
        <div className="col-span-12 lg:col-span-3">
          <GlassCard className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Your Agents</h3>
            <div className="space-y-2">
              {agents.length === 0 ? (
                <div className="text-center py-8">
                  <Bot className="w-10 h-10 mx-auto text-muted-foreground opacity-50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No agents created yet
                  </p>
                </div>
              ) : (
                agents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className={`w-full p-3 rounded-lg text-left transition-all ${
                      selectedAgent?.id === agent.id
                        ? 'bg-[var(--nexus-cyan)]/20 border border-[var(--nexus-cyan)]/30'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)] flex items-center justify-center">
                        <Bot className="w-5 h-5 text-background" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{agent.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{agent.role}</span>
                          {agent.blueprint.godModeEnabled && (
                            <Zap className="w-3 h-3 text-yellow-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </GlassCard>
        </div>

        {/* Main Content */}
        <div className="col-span-12 lg:col-span-9">
          {selectedAgent ? (
            <div className="space-y-6">
              {/* Agent Header */}
              <GlassCard className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[var(--nexus-cyan)] to-[var(--nexus-violet)] flex items-center justify-center">
                      <Bot className="w-8 h-8 text-background" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold">{selectedAgent.name}</h2>
                        {selectedAgent.blueprint.godModeEnabled && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded-full flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            God Mode
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-1">{selectedAgent.blueprint.description}</p>
                      <div className="flex items-center gap-4 mt-3">
                        <StatusBadge status={"info" as any} label={selectedAgent.role} />
                        <span className="text-sm text-muted-foreground">
                          v{selectedAgent.version}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Self-mod: {selectedAgent.blueprint.selfModificationLevel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Play className="w-4 h-4 mr-1" />
                      Test
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteAgent(selectedAgent.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10">
                  <div>
                    <p className="text-sm text-muted-foreground">Performance</p>
                    <p className="text-2xl font-bold text-[var(--nexus-cyan)]">
                      {Math.round(selectedAgent.performanceScore * 100)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tasks Completed</p>
                    <p className="text-2xl font-bold">{selectedAgent.taskHistory.length}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Self-Modifications</p>
                    <p className="text-2xl font-bold">{selectedAgent.godModeStats.totalModifications}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                    <p className="text-2xl font-bold text-green-400">
                      {selectedAgent.godModeStats.totalModifications > 0
                        ? Math.round(
                            (selectedAgent.godModeStats.successfulModifications /
                              selectedAgent.godModeStats.totalModifications) *
                              100
                          )
                        : 0}%
                    </p>
                  </div>
                </div>
              </GlassCard>

              {/* Tabs */}
              <div className="flex gap-2">
                {[
                  { id: 'overview', label: 'Overview', icon: Eye },
                  { id: 'code', label: 'Code Modules', icon: Code2 },
                  { id: 'evolution', label: 'Self-Evolution', icon: GitBranch },
                  { id: 'test', label: 'Test Agent', icon: Play },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
                      activeTab === tab.id
                        ? 'bg-[var(--nexus-cyan)]/20 text-[var(--nexus-cyan)] border border-[var(--nexus-cyan)]/30'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === 'overview' && (
                <div className="grid grid-cols-2 gap-6">
                  {/* Capabilities */}
                  <GlassCard className="p-4">
                    <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[var(--nexus-cyan)]" />
                      Capabilities
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedAgent.capabilities.map(cap => (
                        <span
                          key={cap}
                          className="px-2 py-1 text-xs bg-white/10 rounded"
                        >
                          {cap.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </GlassCard>

                  {/* Scoring Weights */}
                  <GlassCard className="p-4">
                    <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-[var(--nexus-cyan)]" />
                      Scoring Weights
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(selectedAgent.scoringWeights).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm capitalize">{key}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[var(--nexus-cyan)]"
                                style={{ width: `${value * 100}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-8">
                              {Math.round(value * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassCard>

                  {/* Prompt Template */}
                  <GlassCard className="p-4 col-span-2">
                    <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-[var(--nexus-cyan)]" />
                      Prompt Template
                    </h4>
                    <pre className="text-sm text-muted-foreground bg-black/30 p-4 rounded-lg overflow-auto max-h-48">
                      {selectedAgent.promptTemplate}
                    </pre>
                  </GlassCard>

                  {/* Personality */}
                  {selectedAgent.blueprint.personality && (
                    <GlassCard className="p-4 col-span-2">
                      <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-[var(--nexus-cyan)]" />
                        Personality
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Tone</p>
                          <p className="text-sm">{selectedAgent.blueprint.personality.tone}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Style</p>
                          <p className="text-sm">{selectedAgent.blueprint.personality.style}</p>
                        </div>
                        {selectedAgent.blueprint.personality.traits.length > 0 && (
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground mb-2">Traits</p>
                            <div className="flex flex-wrap gap-2">
                              {selectedAgent.blueprint.personality.traits.map((trait, i) => (
                                <span key={i} className="px-2 py-1 text-xs bg-white/10 rounded">
                                  {trait}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </GlassCard>
                  )}
                </div>
              )}

              {activeTab === 'code' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Code Modules</h3>
                    {selectedAgent.blueprint.selfModificationLevel === 'full' && (
                      <NeonButton size="sm" onClick={handleAgentWriteCode}>
                        <PenTool className="w-4 h-4 mr-2" />
                        Agent Write Code
                      </NeonButton>
                    )}
                  </div>

                  {selectedAgent.codeModules.length === 0 ? (
                    <GlassCard className="p-8 text-center">
                      <Code2 className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                      <p className="text-muted-foreground">No code modules yet</p>
                      {selectedAgent.blueprint.selfModificationLevel === 'full' && (
                        <p className="text-sm text-muted-foreground mt-2">
                          This agent can write its own code. Click the button above to have it create a module.
                        </p>
                      )}
                    </GlassCard>
                  ) : (
                    selectedAgent.codeModules.map(codeModule => (
                      <CodeModuleCard
                        key={codeModule.id}
                        codeModule={codeModule}
                        agentId={selectedAgent.id}
                        canEdit={selectedAgent.blueprint.selfModificationLevel === 'full'}
                        onRefresh={loadData}
                      />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'evolution' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Self-Evolution Log</h3>
                    {selectedAgent.blueprint.selfModificationLevel !== 'none' && (
                      <NeonButton size="sm" onClick={handleProposeSelfMod}>
                        <Brain className="w-4 h-4 mr-2" />
                        Propose Evolution
                      </NeonButton>
                    )}
                  </div>

                  {selectedAgent.selfModificationLog.length === 0 ? (
                    <GlassCard className="p-8 text-center">
                      <GitBranch className="w-12 h-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                      <p className="text-muted-foreground">No evolution history yet</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        This agent will propose improvements based on performance analysis.
                      </p>
                    </GlassCard>
                  ) : (
                    selectedAgent.selfModificationLog.map(mod => (
                      <EvolutionCard
                        key={mod.id}
                        modification={mod}
                        onApply={() => handleApplySelfMod(mod.id)}
                      />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'test' && (
                <AgentTestPanel agent={selectedAgent} />
              )}
            </div>
          ) : (
            <GlassCard className="p-12 text-center">
              <Bot className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Agent Selected</h3>
              <p className="text-muted-foreground mb-6">
                Create a new agent or select one from the list.
              </p>
              <div className="flex gap-4 justify-center">
                <NeonButton variant="secondary" onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Manual Create
                </NeonButton>
                <NeonButton onClick={() => setShowGodModeModal(true)}>
                  <Wand2 className="w-4 h-4 mr-2" />
                  God Mode
                </NeonButton>
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* God Mode Modal */}
      {showGodModeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">God Mode Agent Creator</h3>
                <p className="text-sm text-muted-foreground">
                  Describe your agent and let AI build it
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Agent Description</label>
                <Textarea
                  value={godModeForm.description}
                  onChange={(e) => setGodModeForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe what this agent should do, its personality, and capabilities..."
                  rows={4}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Use Case</label>
                <Input
                  value={godModeForm.useCase}
                  onChange={(e) => setGodModeForm(f => ({ ...f, useCase: e.target.value }))}
                  placeholder="e.g., Writing viral Twitter threads, Creating YouTube scripts..."
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Complexity Level</label>
                <select
                  value={godModeForm.complexity}
                  onChange={(e) => setGodModeForm(f => ({
                    ...f,
                    complexity: e.target.value as typeof godModeForm.complexity,
                  }))}
                  className="w-full px-3 py-2 bg-background border rounded-lg"
                >
                  <option value="simple">Simple - Basic capabilities</option>
                  <option value="moderate">Moderate - Standard features</option>
                  <option value="advanced">Advanced - Extended capabilities</option>
                  <option value="expert">Expert - Full power with code modules</option>
                </select>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div>
                  <p className="font-medium">Enable Self-Modification</p>
                  <p className="text-xs text-muted-foreground">
                    Allow agent to improve its own code and prompts
                  </p>
                </div>
                <Switch
                  checked={godModeForm.selfModification}
                  onCheckedChange={(checked) => setGodModeForm(f => ({ ...f, selfModification: checked }))}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowGodModeModal(false)}>
                Cancel
              </Button>
              <NeonButton
                className="flex-1"
                onClick={handleCreateWithGodMode}
                disabled={!godModeForm.description || !godModeForm.useCase || creating}
              >
                {creating ? (
                  <>
                    <LoadingPulse size="sm" />
                    <span className="ml-2">Creating...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Create Agent
                  </>
                )}
              </NeonButton>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Manual Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-6">Create Agent Manually</h3>

            {/* Templates */}
            <div className="mb-6">
              <label className="text-sm text-muted-foreground mb-2 block">Quick Templates</label>
              <div className="flex flex-wrap gap-2">
                {templates.map((template, i) => (
                  <button
                    key={i}
                    onClick={() => handleUseTemplate(template)}
                    className="px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Agent Name</label>
                  <Input
                    value={manualForm.name}
                    onChange={(e) => setManualForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="My Custom Agent"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Role</label>
                  <select
                    value={manualForm.role}
                    onChange={(e) => setManualForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border rounded-lg"
                  >
                    <option value="writer">Writer</option>
                    <option value="hook">Hook Creator</option>
                    <option value="strategist">Strategist</option>
                    <option value="optimizer">Optimizer</option>
                    <option value="critic">Critic</option>
                    <option value="visual">Visual</option>
                    <option value="hashtag">Hashtag</option>
                    <option value="engagement">Engagement</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Description</label>
                <Textarea
                  value={manualForm.description}
                  onChange={(e) => setManualForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What does this agent do?"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Capabilities</label>
                <div className="flex flex-wrap gap-2">
                  {CAPABILITIES.map(cap => (
                    <button
                      key={cap.value}
                      onClick={() => {
                        const caps = manualForm.capabilities || [];
                        if (caps.includes(cap.value)) {
                          setManualForm(f => ({ ...f, capabilities: caps.filter(c => c !== cap.value) }));
                        } else {
                          setManualForm(f => ({ ...f, capabilities: [...caps, cap.value] }));
                        }
                      }}
                      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                        manualForm.capabilities?.includes(cap.value)
                          ? 'bg-[var(--nexus-cyan)]/20 border border-[var(--nexus-cyan)]/30'
                          : 'bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      {cap.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Prompt Template</label>
                <Textarea
                  value={manualForm.promptTemplate}
                  onChange={(e) => setManualForm(f => ({ ...f, promptTemplate: e.target.value }))}
                  placeholder="You are [Agent Name]. Your job is to..."
                  rows={6}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Self-Modification Level</label>
                  <select
                    value={manualForm.selfModificationLevel}
                    onChange={(e) => setManualForm(f => ({
                      ...f,
                      selfModificationLevel: e.target.value as AgentBlueprint['selfModificationLevel'],
                    }))}
                    className="w-full px-3 py-2 bg-background border rounded-lg"
                  >
                    <option value="none">None - Fixed behavior</option>
                    <option value="limited">Limited - Minor tweaks only</option>
                    <option value="moderate">Moderate - Prompts & weights</option>
                    <option value="full">Full - Can write code</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                  <Switch
                    checked={manualForm.godModeEnabled}
                    onCheckedChange={(checked) => setManualForm(f => ({ ...f, godModeEnabled: checked }))}
                  />
                  <div>
                    <p className="font-medium text-sm">God Mode</p>
                    <p className="text-xs text-muted-foreground">Full AI capabilities</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <NeonButton
                className="flex-1"
                onClick={handleCreateManual}
                disabled={!manualForm.name || !manualForm.promptTemplate || creating}
              >
                {creating ? (
                  <>
                    <LoadingPulse size="sm" />
                    <span className="ml-2">Creating...</span>
                  </>
                ) : (
                  'Create Agent'
                )}
              </NeonButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

// Code Module Card Component
function CodeModuleCard({
  codeModule,
  agentId,
  canEdit,
  onRefresh,
}: {
  codeModule: AgentCodeModule;
  agentId: string;
  canEdit: boolean;
  onRefresh: () => void;
}) {
  const [showCode, setShowCode] = useState(false);

  const handleEdit = async () => {
    const issue = prompt('What issue needs to be fixed?');
    if (!issue) return;
    
    const improvement = prompt('What improvement should be made?');
    if (!improvement) return;
    
    await agentEditCode(agentId, codeModule.id, { issue, improvement });
    onRefresh();
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[var(--nexus-cyan)]" />
            <h4 className="font-medium">{codeModule.name}</h4>
            <span className="text-xs text-muted-foreground">v{codeModule.version}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{codeModule.description}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>{codeModule.language}</span>
            <span>Modified by {codeModule.modifiedBy}</span>
            <span>{new Date(codeModule.lastModified).toLocaleDateString()}</span>
          </div>
          {codeModule.filePath && (
            <p className="mt-2 text-xs text-muted-foreground break-all">
              Stored at {codeModule.filePath}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowCode(!showCode)}>
            {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={handleEdit}>
              <Edit3 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      {showCode && (
        <pre className="mt-4 p-4 bg-black/30 rounded-lg text-sm overflow-auto max-h-64">
          {codeModule.code}
        </pre>
      )}
    </GlassCard>
  );
}

// Evolution Card Component
function EvolutionCard({
  modification,
  onApply,
}: {
  modification: SelfModificationEntry;
  onApply: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {modification.approved ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : modification.impact === 'negative' ? (
            <XCircle className="w-5 h-5 text-red-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          )}
          <div>
            <p className="font-medium capitalize">{modification.type} Modification</p>
            <p className="text-sm text-muted-foreground">
              {new Date(modification.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowDetails(!showDetails)}>
            {showDetails ? 'Hide' : 'Details'}
          </Button>
          {!modification.approved && modification.impact !== 'negative' && (
            <NeonButton size="sm" onClick={onApply}>
              Apply
            </NeonButton>
          )}
        </div>
      </div>
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Reasoning</p>
            <p className="text-sm">{modification.reasoning}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Before</p>
              <pre className="text-xs bg-black/30 p-2 rounded mt-1 overflow-auto max-h-24">
                {modification.before.substring(0, 200)}...
              </pre>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">After</p>
              <pre className="text-xs bg-black/30 p-2 rounded mt-1 overflow-auto max-h-24">
                {modification.after.substring(0, 200)}...
              </pre>
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// Agent Test Panel
function AgentTestPanel({ agent }: { agent: CreatedAgent }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    if (!input.trim()) return;
    
    setTesting(true);
    try {
      // Simulate agent test
      const { chat } = await import('@/lib/services/aiService');
      const response = await chat([
        { role: 'system', content: agent.promptTemplate },
        { role: 'user', content: input },
      ], { model: 'gpt-4o' });
      setOutput(response);
    } catch (error) {
      setOutput('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-semibold mb-4">Test Agent</h3>
      <div className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground">Input</label>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter a test prompt..."
            rows={4}
          />
        </div>
        <NeonButton onClick={handleTest} disabled={!input.trim() || testing}>
          {testing ? (
            <>
              <LoadingPulse size="sm" />
              <span className="ml-2">Testing...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Run Test
            </>
          )}
        </NeonButton>
        {output && (
          <div>
            <label className="text-sm text-muted-foreground">Output</label>
            <div className="p-4 bg-black/30 rounded-lg mt-2">
              <pre className="whitespace-pre-wrap text-sm">{output}</pre>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
