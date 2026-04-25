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
import {
  Film,
  Plus,
  Play,
  Trash2,
  Edit3,
  Copy,
  Download,
  Eye,
  Camera,
  Clock,
  Lightbulb,
  Music,
  Type,
  ArrowUp,
  ArrowDown,
  Wand2,
  FileText,
  List,
  GripVertical,
  Check,
  X,
} from 'lucide-react';
import {
  loadScenePlans,
  createScenePlan,
  updateScenePlan,
  deleteScenePlan,
  generateSceneBreakdown,
  generateShotList,
  exportAsScript,
  addScene,
  updateScene,
  type ScenePlan,
  type Scene,
} from '@/lib/services/scenePlannerService';
import { kvGet, kvSet } from '@/lib/services/puterService';

const SCENES_SESSION_KEY = 'scenes_session_v1';

const DEFAULT_NEW_PLAN = {
  title: '',
  description: '',
  platform: 'instagram',
  contentType: 'reel' as ScenePlan['contentType'],
  targetDuration: 30,
};

const DEFAULT_GENERATE_INPUT = {
  concept: '',
  platform: 'instagram',
  contentType: 'reel' as ScenePlan['contentType'],
  targetDuration: 30,
  style: '',
};

interface ScenesSessionSnapshot {
  selectedPlanId: string | null;
  showCreateModal: boolean;
  showGenerateModal: boolean;
  newPlan: typeof DEFAULT_NEW_PLAN;
  generateInput: typeof DEFAULT_GENERATE_INPUT;
  editingScene: string | null;
}

export default function ScenesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<ScenePlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<ScenePlan | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [preferredSelectedPlanId, setPreferredSelectedPlanId] = useState<string | null>(null);

  // Form state
  const [newPlan, setNewPlan] = useState(DEFAULT_NEW_PLAN);

  const [generateInput, setGenerateInput] = useState(DEFAULT_GENERATE_INPUT);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const snapshot = await kvGet<ScenesSessionSnapshot>(SCENES_SESSION_KEY, true);
      if (!snapshot || cancelled) {
        setSessionReady(true);
        return;
      }

      setShowCreateModal(Boolean(snapshot.showCreateModal));
      setShowGenerateModal(Boolean(snapshot.showGenerateModal));
      setNewPlan(snapshot.newPlan ?? DEFAULT_NEW_PLAN);
      setGenerateInput(snapshot.generateInput ?? DEFAULT_GENERATE_INPUT);
      setEditingScene(snapshot.editingScene ?? null);
      setPreferredSelectedPlanId(snapshot.selectedPlanId ?? null);

      if (!cancelled) {
        setSessionReady(true);
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    void loadData(preferredSelectedPlanId);
  }, [preferredSelectedPlanId, sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;

    const snapshot: ScenesSessionSnapshot = {
      selectedPlanId: selectedPlan?.id ?? null,
      showCreateModal,
      showGenerateModal,
      newPlan,
      generateInput,
      editingScene,
    };

    void kvSet(SCENES_SESSION_KEY, JSON.stringify(snapshot));
  }, [
    editingScene,
    generateInput,
    newPlan,
    selectedPlan?.id,
    sessionReady,
    showCreateModal,
    showGenerateModal,
  ]);

  const loadData = async (preferredPlanId?: string | null) => {
    try {
      setLoading(true);
      setError(null);
      const data = await loadScenePlans();
      setPlans(data);
      const preservedSelection = preferredPlanId
        ? data.find((plan) => plan.id === preferredPlanId) ?? null
        : null;
      const currentSelection = selectedPlan
        ? data.find((plan) => plan.id === selectedPlan.id) ?? null
        : null;
      setSelectedPlan(preservedSelection ?? currentSelection ?? data[0] ?? null);
    } catch (err) {
      console.error('Failed to load scene plans:', err);
      setError('Failed to load scene plans. Please try again.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async () => {
    try {
      const plan = await createScenePlan(newPlan);
      setPlans(prev => [...prev, plan]);
      setSelectedPlan(plan);
      setShowCreateModal(false);
      setPreferredSelectedPlanId(plan.id);
      setNewPlan(DEFAULT_NEW_PLAN);
    } catch (error) {
      console.error('Failed to create plan:', error);
    }
  };

  const handleGeneratePlan = async () => {
    setGeneratingPlan(true);
    try {
      const plan = await generateSceneBreakdown(generateInput.concept, {
        platform: generateInput.platform,
        contentType: generateInput.contentType,
        targetDuration: generateInput.targetDuration,
        style: generateInput.style,
      });
      setPlans(prev => [...prev, plan]);
      setSelectedPlan(plan);
      setShowGenerateModal(false);
      setPreferredSelectedPlanId(plan.id);
      setGenerateInput(DEFAULT_GENERATE_INPUT);
    } catch (error) {
      console.error('Failed to generate plan:', error);
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!confirm('Delete this scene plan?')) return;
    await deleteScenePlan(id);
    setPlans(prev => prev.filter(p => p.id !== id));
    if (selectedPlan?.id === id) {
      const nextPlan = plans.find(p => p.id !== id) || null;
      setSelectedPlan(nextPlan);
      setPreferredSelectedPlanId(nextPlan?.id ?? null);
    }
  };

  const handleExportShotList = async () => {
    if (!selectedPlan) return;
    const shotList = await generateShotList(selectedPlan.id);
    const blob = new Blob([shotList], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shot-list-${selectedPlan.title.toLowerCase().replace(/\s+/g, '-')}.md`;
    a.click();
  };

  const handleExportScript = async () => {
    if (!selectedPlan) return;
    const script = await exportAsScript(selectedPlan.id);
    const blob = new Blob([script], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `script-${selectedPlan.title.toLowerCase().replace(/\s+/g, '-')}.md`;
    a.click();
  };

  const handleAddScene = async () => {
    if (!selectedPlan) return;
    const scene = await addScene(selectedPlan.id, {
      title: 'New Scene',
      description: '',
      duration: 5,
      shotType: 'medium',
      cameraAngle: 'eye-level',
      lighting: 'natural',
      mood: 'neutral',
      props: [],
      talent: [],
      transitions: { in: 'cut', out: 'cut' },
      notes: '',
      status: 'draft',
    });
    if (scene) {
      await loadData(selectedPlan.id);
      const updated = await loadScenePlans();
      setSelectedPlan(updated.find(p => p.id === selectedPlan.id) || null);
    }
  };

  const handleUpdateScene = async (sceneId: string, updates: Partial<Scene>) => {
    if (!selectedPlan) return;
    await updateScene(selectedPlan.id, sceneId, updates);
    await loadData(selectedPlan.id);
    const updated = await loadScenePlans();
    setSelectedPlan(updated.find(p => p.id === selectedPlan.id) || null);
  };

  const getTotalDuration = (scenes: Scene[]) => {
    return scenes.reduce((acc, s) => acc + s.duration, 0);
  };

  const getStatusColor = (status: ScenePlan['status']): 'success' | 'warning' | 'info' | 'pending' => {
    switch (status) {
      case 'published': return 'success';
      case 'post-production': return 'info';
      case 'production': return 'warning';
      default: return 'pending';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingPulse size="lg" text="Loading scene planner..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <PageHeader
        title="Scene Planner"
        description="Plan and storyboard your video content with AI assistance"
        icon={<Film className="w-8 h-8" />}
        action={
          <div className="flex gap-2">
            <NeonButton variant="secondary" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Plan
            </NeonButton>
            <NeonButton onClick={() => setShowGenerateModal(true)}>
              <Wand2 className="w-4 h-4 mr-2" />
              AI Generate
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
        {/* Plans List */}
        <div className="col-span-12 lg:col-span-3">
          <GlassCard className="p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Scene Plans</h3>
            <div className="space-y-2">
              {plans.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No scene plans yet. Create one to get started.
                </p>
              ) : (
                plans.map(plan => (
                  <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`w-full p-3 rounded-lg text-left transition-all ${
                      selectedPlan?.id === plan.id
                        ? 'bg-[var(--nexus-cyan)]/20 border border-[var(--nexus-cyan)]/30'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{plan.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">{plan.platform}</span>
                          <span className="text-xs text-muted-foreground">
                            {plan.scenes.length} scenes
                          </span>
                        </div>
                      </div>
                      <StatusBadge status={getStatusColor(plan.status)} label={plan.status} dot />
                    </div>
                  </button>
                ))
              )}
            </div>
          </GlassCard>
        </div>

        {/* Main Content */}
        <div className="col-span-12 lg:col-span-9">
          {selectedPlan ? (
            <div className="space-y-6">
              {/* Plan Header */}
              <GlassCard className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{selectedPlan.title}</h2>
                    <p className="text-muted-foreground mt-1">{selectedPlan.description}</p>
                    <div className="flex items-center gap-4 mt-4">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Film className="w-4 h-4 text-[var(--nexus-cyan)]" />
                        <span>{selectedPlan.contentType}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="w-4 h-4 text-[var(--nexus-cyan)]" />
                        <span>{getTotalDuration(selectedPlan.scenes)}s / {selectedPlan.targetDuration}s</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Camera className="w-4 h-4 text-[var(--nexus-cyan)]" />
                        <span>{selectedPlan.scenes.length} scenes</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportShotList}>
                      <List className="w-4 h-4 mr-1" />
                      Shot List
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExportScript}>
                      <FileText className="w-4 h-4 mr-1" />
                      Script
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeletePlan(selectedPlan.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Hooks and CTA */}
                {selectedPlan.hooks.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-400" />
                      Hook Options
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedPlan.hooks.map((hook, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 bg-white/5 rounded-lg text-sm border border-white/10"
                        >
                          {hook}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPlan.callToAction && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Call to Action</h4>
                    <p className="text-[var(--nexus-cyan)]">{selectedPlan.callToAction}</p>
                  </div>
                )}
              </GlassCard>

              {/* Scenes Timeline */}
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">Scenes</h3>
                  <NeonButton size="sm" onClick={handleAddScene}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Scene
                  </NeonButton>
                </div>

                <div className="space-y-4">
                  {selectedPlan.scenes.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Camera className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No scenes yet. Add scenes to build your storyboard.</p>
                    </div>
                  ) : (
                    selectedPlan.scenes.map((scene, index) => (
                      <SceneCard
                        key={scene.id}
                        scene={scene}
                        index={index}
                        isEditing={editingScene === scene.id}
                        onEdit={() => setEditingScene(scene.id)}
                        onSave={(updates) => {
                          handleUpdateScene(scene.id, updates);
                          setEditingScene(null);
                        }}
                        onCancel={() => setEditingScene(null)}
                      />
                    ))
                  )}
                </div>
              </GlassCard>

              {/* Equipment and Soundtrack */}
              <div className="grid grid-cols-2 gap-6">
                {selectedPlan.equipmentNeeded.length > 0 && (
                  <GlassCard className="p-4">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Camera className="w-4 h-4" />
                      Equipment Needed
                    </h4>
                    <ul className="space-y-1">
                      {selectedPlan.equipmentNeeded.map((item, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                          <Check className="w-3 h-3 text-green-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                )}

                {selectedPlan.soundtrack && (
                  <GlassCard className="p-4">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Music className="w-4 h-4" />
                      Soundtrack
                    </h4>
                    <div className="space-y-2 text-sm">
                      <p><span className="text-muted-foreground">Genre:</span> {selectedPlan.soundtrack.genre}</p>
                      <p><span className="text-muted-foreground">Mood:</span> {selectedPlan.soundtrack.mood}</p>
                      {selectedPlan.soundtrack.suggestions.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Suggestions:</span>
                          <ul className="mt-1 space-y-1">
                            {selectedPlan.soundtrack.suggestions.map((song, i) => (
                              <li key={i} className="text-[var(--nexus-cyan)]">{song}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                )}
              </div>
            </div>
          ) : (
            <GlassCard className="p-12 text-center">
              <Film className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold mb-2">No Plan Selected</h3>
              <p className="text-muted-foreground mb-6">
                Select a plan from the list or create a new one to get started.
              </p>
              <div className="flex gap-4 justify-center">
                <NeonButton variant="secondary" onClick={() => setShowCreateModal(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Manually
                </NeonButton>
                <NeonButton onClick={() => setShowGenerateModal(true)}>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate with AI
                </NeonButton>
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Create Scene Plan</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Title</label>
                <Input
                  value={newPlan.title}
                  onChange={(e) => setNewPlan(p => ({ ...p, title: e.target.value }))}
                  placeholder="Video title"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Description</label>
                <Textarea
                  value={newPlan.description}
                  onChange={(e) => setNewPlan(p => ({ ...p, description: e.target.value }))}
                  placeholder="What is this video about?"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Platform</label>
                  <select
                    value={newPlan.platform}
                    onChange={(e) => setNewPlan(p => ({ ...p, platform: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border rounded-lg"
                  >
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube">YouTube</option>
                    <option value="facebook">Facebook</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Content Type</label>
                  <select
                    value={newPlan.contentType}
                    onChange={(e) => setNewPlan(p => ({ ...p, contentType: e.target.value as ScenePlan['contentType'] }))}
                    className="w-full px-3 py-2 bg-background border rounded-lg"
                  >
                    <option value="reel">Reel</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube-short">YouTube Short</option>
                    <option value="youtube-long">YouTube Long</option>
                    <option value="story">Story</option>
                    <option value="ad">Ad</option>
                    <option value="tutorial">Tutorial</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Target Duration (seconds)</label>
                <Input
                  type="number"
                  value={newPlan.targetDuration}
                  onChange={(e) => setNewPlan(p => ({ ...p, targetDuration: parseInt(e.target.value) || 30 }))}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <NeonButton className="flex-1" onClick={handleCreatePlan}>
                Create Plan
              </NeonButton>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <GlassCard className="w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-[var(--nexus-cyan)]" />
              AI Scene Generator
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Video Concept</label>
                <Textarea
                  value={generateInput.concept}
                  onChange={(e) => setGenerateInput(p => ({ ...p, concept: e.target.value }))}
                  placeholder="Describe your video idea in detail..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground">Platform</label>
                  <select
                    value={generateInput.platform}
                    onChange={(e) => setGenerateInput(p => ({ ...p, platform: e.target.value }))}
                    className="w-full px-3 py-2 bg-background border rounded-lg"
                  >
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube">YouTube</option>
                    <option value="facebook">Facebook</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Content Type</label>
                  <select
                    value={generateInput.contentType}
                    onChange={(e) => setGenerateInput(p => ({ ...p, contentType: e.target.value as ScenePlan['contentType'] }))}
                    className="w-full px-3 py-2 bg-background border rounded-lg"
                  >
                    <option value="reel">Reel</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube-short">YouTube Short</option>
                    <option value="youtube-long">YouTube Long</option>
                    <option value="story">Story</option>
                    <option value="ad">Ad</option>
                    <option value="tutorial">Tutorial</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Target Duration (seconds)</label>
                <Input
                  type="number"
                  value={generateInput.targetDuration}
                  onChange={(e) => setGenerateInput(p => ({ ...p, targetDuration: parseInt(e.target.value) || 30 }))}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Style (optional)</label>
                <Input
                  value={generateInput.style}
                  onChange={(e) => setGenerateInput(p => ({ ...p, style: e.target.value }))}
                  placeholder="e.g., cinematic, fast-paced, minimal"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowGenerateModal(false)}>
                Cancel
              </Button>
              <NeonButton
                className="flex-1"
                onClick={handleGeneratePlan}
                disabled={!generateInput.concept || generatingPlan}
              >
                {generatingPlan ? (
                  <>
                    <LoadingPulse size="sm" />
                    <span className="ml-2">Generating...</span>
                  </>
                ) : (
                  'Generate Plan'
                )}
              </NeonButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

// Scene Card Component
function SceneCard({
  scene,
  index,
  isEditing,
  onEdit,
  onSave,
  onCancel,
}: {
  scene: Scene;
  index: number;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updates: Partial<Scene>) => void;
  onCancel: () => void;
}) {
  const [editData, setEditData] = useState(scene);

  useEffect(() => {
    setEditData(scene);
  }, [scene]);

  if (isEditing) {
    return (
      <GlassCard className="p-4 border border-[var(--nexus-cyan)]/30">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Title</label>
              <Input
                value={editData.title}
                onChange={(e) => setEditData(d => ({ ...d, title: e.target.value }))}
                className="h-8"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Duration (s)</label>
              <Input
                type="number"
                value={editData.duration}
                onChange={(e) => setEditData(d => ({ ...d, duration: parseInt(e.target.value) || 5 }))}
                className="h-8"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <Textarea
              value={editData.description}
              onChange={(e) => setEditData(d => ({ ...d, description: e.target.value }))}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Shot Type</label>
              <select
                value={editData.shotType}
                onChange={(e) => setEditData(d => ({ ...d, shotType: e.target.value as Scene['shotType'] }))}
                className="w-full px-2 py-1 bg-background border rounded text-sm"
              >
                <option value="wide">Wide</option>
                <option value="medium">Medium</option>
                <option value="close-up">Close-up</option>
                <option value="extreme-close-up">Extreme Close-up</option>
                <option value="establishing">Establishing</option>
                <option value="pov">POV</option>
                <option value="tracking">Tracking</option>
                <option value="aerial">Aerial</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Camera Angle</label>
              <select
                value={editData.cameraAngle}
                onChange={(e) => setEditData(d => ({ ...d, cameraAngle: e.target.value as Scene['cameraAngle'] }))}
                className="w-full px-2 py-1 bg-background border rounded text-sm"
              >
                <option value="eye-level">Eye Level</option>
                <option value="high-angle">High Angle</option>
                <option value="low-angle">Low Angle</option>
                <option value="dutch-angle">Dutch Angle</option>
                <option value="birds-eye">Bird&apos;s Eye</option>
                <option value="worms-eye">Worm&apos;s Eye</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Lighting</label>
              <select
                value={editData.lighting}
                onChange={(e) => setEditData(d => ({ ...d, lighting: e.target.value as Scene['lighting'] }))}
                className="w-full px-2 py-1 bg-background border rounded text-sm"
              >
                <option value="natural">Natural</option>
                <option value="studio">Studio</option>
                <option value="dramatic">Dramatic</option>
                <option value="soft">Soft</option>
                <option value="golden-hour">Golden Hour</option>
                <option value="blue-hour">Blue Hour</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Dialogue / Voiceover</label>
            <Textarea
              value={editData.dialogue || ''}
              onChange={(e) => setEditData(d => ({ ...d, dialogue: e.target.value }))}
              placeholder="What is said in this scene?"
              rows={2}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Text Overlay</label>
            <Input
              value={editData.textOverlay || ''}
              onChange={(e) => setEditData(d => ({ ...d, textOverlay: e.target.value }))}
              placeholder="Text shown on screen"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <NeonButton size="sm" onClick={() => onSave(editData)}>
              <Check className="w-4 h-4 mr-1" />
              Save
            </NeonButton>
          </div>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-4 hover:bg-white/5 transition-colors group">
      <div className="flex gap-4">
        <div className="flex items-center">
          <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
        </div>
        <div className="w-12 h-12 rounded-lg bg-[var(--nexus-cyan)]/20 flex items-center justify-center text-lg font-bold">
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-medium">{scene.title}</h4>
              <p className="text-sm text-muted-foreground line-clamp-1">{scene.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{scene.duration}s</span>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={onEdit}
              >
                <Edit3 className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Camera className="w-3 h-3" />
              {scene.shotType}
            </span>
            <span>{scene.cameraAngle}</span>
            <span>{scene.lighting}</span>
            {scene.textOverlay && (
              <span className="flex items-center gap-1">
                <Type className="w-3 h-3" />
                Text
              </span>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
