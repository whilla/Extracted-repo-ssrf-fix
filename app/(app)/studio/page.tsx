'use client';

import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { StatusBadge } from '@/components/nexus/StatusBadge';
import { ContentCard } from '@/components/content/ContentCard';
import { ApprovalGate } from '@/components/content/ApprovalGate';
import { runContentPipeline, getContentSuggestions } from '@/lib/services/contentEngine';
import { toast } from 'sonner';
import { listDrafts, loadDraft } from '@/lib/services/memoryService';
import { kvGet, kvSet } from '@/lib/services/puterService';
import { useAuth } from '@/lib/context/AuthContext';
import { PLATFORMS } from '@/lib/constants/platforms';
import type { ContentDraft, Platform } from '@/lib/types';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Wand2, 
  ChevronDown,
  RefreshCw,
  FileText,
  Lightbulb
} from 'lucide-react';
import { cn } from '@/lib/utils';
import useSWR from 'swr';

type GenerationTab = 'text' | 'image' | 'full';

const STUDIO_SESSION_KEY = 'studio_session_v1';
const TODAY_STARTER_IDEAS = [
  'A behind-the-scenes post showing what you are building today and the specific problem it solves',
  'A quick myth-versus-truth post that challenges one common belief in your niche',
  'A before-and-after story showing the shift your audience wants to make',
  'A short checklist post people can save before they buy, create, or decide',
  'A founder/operator note about one lesson learned this week and how it changes the offer',
];

interface StudioSessionSnapshot {
  activeTab: GenerationTab;
  idea: string;
  selectedPlatforms: Platform[];
  includeImage: boolean;
  generatedDraftId: string | null;
  showApproval: boolean;
}

export default function ContentStudioPage() {
  const { brandKit } = useAuth();
  const [activeTab, setActiveTab] = useState<GenerationTab>('full');
  const [idea, setIdea] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(['twitter', 'instagram']);
  const [includeImage, setIncludeImage] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ stage: string; progress: number } | null>(null);
  const [generatedDraft, setGeneratedDraft] = useState<ContentDraft | null>(null);
  const [showApproval, setShowApproval] = useState(false);
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  // Fetch drafts
  const { data: drafts, mutate: mutateDrafts } = useSWR('drafts', listDrafts);

  // Fetch content suggestions
  const { data: suggestions, mutate: mutateSuggestions } = useSWR(
    brandKit ? 'suggestions' : null,
    () => getContentSuggestions(5)
  );
  const displayedSuggestions = (suggestions && suggestions.length > 0 ? suggestions : TODAY_STARTER_IDEAS).slice(0, 5);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      const snapshot = await kvGet<StudioSessionSnapshot>(STUDIO_SESSION_KEY, true);
      if (!snapshot || cancelled) {
        setSessionReady(true);
        return;
      }

      setActiveTab(snapshot.activeTab ?? 'full');
      setIdea(snapshot.idea ?? '');
      setSelectedPlatforms(snapshot.selectedPlatforms?.length ? snapshot.selectedPlatforms : ['twitter', 'instagram']);
      setIncludeImage(snapshot.includeImage ?? true);
      setShowApproval(Boolean(snapshot.showApproval && snapshot.generatedDraftId));

      if (snapshot.generatedDraftId) {
        const draft = await loadDraft(snapshot.generatedDraftId);
        if (!cancelled && draft) {
          setGeneratedDraft(draft);
        }
      }

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

    const snapshot: StudioSessionSnapshot = {
      activeTab,
      idea,
      selectedPlatforms,
      includeImage,
      generatedDraftId: generatedDraft?.id ?? null,
      showApproval,
    };

    void kvSet(STUDIO_SESSION_KEY, JSON.stringify(snapshot));
  }, [activeTab, generatedDraft?.id, idea, includeImage, selectedPlatforms, sessionReady, showApproval]);

  const handleGenerate = async () => {
    if (!idea.trim()) return;

    setIsGenerating(true);
    setGenerationProgress({ stage: 'Starting...', progress: 0 });
    setGeneratedDraft(null);

    try {
      const draft = await runContentPipeline(
        {
          idea: idea.trim(),
          platforms: selectedPlatforms,
          includeImage: activeTab !== 'text' && includeImage,
        },
        (stage, progress) => {
          setGenerationProgress({ stage, progress });
        }
      );

      setGeneratedDraft(draft);
      setShowApproval(true);
      mutateDrafts();
    } catch (error) {
      console.error('Generation error:', error);
      toast.error(`Generation failed: ${(error as Error).message}`);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setIdea(suggestion);
  };

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms(
      selectedPlatforms.includes(platform)
        ? selectedPlatforms.filter((p) => p !== platform)
        : [...selectedPlatforms, platform]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Content Studio</h1>
          <p className="text-muted-foreground">Generate AI-powered content for your social media</p>
        </div>
      </div>

      {/* Generation Panel */}
      <GlassCard variant="elevated" padding="lg">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('full')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
              activeTab === 'full'
                ? 'bg-gradient-to-r from-[var(--nexus-cyan)]/20 to-[var(--nexus-violet)]/20 text-foreground border border-[var(--nexus-cyan)]/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Wand2 className="w-4 h-4" />
            Full Post
          </button>
          <button
            onClick={() => setActiveTab('text')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
              activeTab === 'text'
                ? 'bg-gradient-to-r from-[var(--nexus-cyan)]/20 to-[var(--nexus-violet)]/20 text-foreground border border-[var(--nexus-cyan)]/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <FileText className="w-4 h-4" />
            Text Only
          </button>
          <button
            onClick={() => setActiveTab('image')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg transition-all',
              activeTab === 'image'
                ? 'bg-gradient-to-r from-[var(--nexus-cyan)]/20 to-[var(--nexus-violet)]/20 text-foreground border border-[var(--nexus-cyan)]/50'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <ImageIcon className="w-4 h-4" />
            Image Only
          </button>
        </div>

        {/* Idea Input */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">What do you want to create?</label>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="Enter your content idea, topic, or concept..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-input border border-border focus:border-[var(--nexus-cyan)] focus:outline-none focus:ring-1 focus:ring-[var(--nexus-cyan)] resize-none"
            />
          </div>

          {/* Suggestions */}
          {displayedSuggestions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4 text-[var(--nexus-warning)]" />
                <span className="text-sm text-muted-foreground">Posting ideas</span>
                {brandKit && (
                  <button
                    onClick={() => mutateSuggestions()}
                    className="p-1 rounded hover:bg-muted/50"
                    aria-label="Refresh suggestions"
                  >
                    <RefreshCw className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {displayedSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-left"
                  >
                    {suggestion.length > 50 ? suggestion.substring(0, 50) + '...' : suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Options Row */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Platform Selector */}
            <div className="relative">
              <button
                onClick={() => setShowPlatformDropdown(!showPlatformDropdown)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:border-muted-foreground transition-colors"
              >
                <span className="text-sm">
                  {selectedPlatforms.length === 0
                    ? 'Select platforms'
                    : `${selectedPlatforms.length} platform${selectedPlatforms.length > 1 ? 's' : ''}`}
                </span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {showPlatformDropdown && (
                <div className="absolute top-full left-0 mt-2 w-56 glass-card rounded-lg p-2 z-10">
                  {Object.values(PLATFORMS).map((platform) => (
                    <button
                      key={platform.id}
                      onClick={() => togglePlatform(platform.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                        selectedPlatforms.includes(platform.id)
                          ? 'bg-[var(--nexus-cyan)]/10 text-foreground'
                          : 'hover:bg-muted/50 text-muted-foreground'
                      )}
                    >
                      <span className={cn('font-medium text-sm', `platform-${platform.id}`)}>
                        {platform.name}
                      </span>
                      {selectedPlatforms.includes(platform.id) && (
                        <span className="ml-auto text-[var(--nexus-cyan)]">&#10003;</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Include Image Toggle */}
            {activeTab === 'full' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeImage}
                  onChange={(e) => setIncludeImage(e.target.checked)}
                  className="w-4 h-4 rounded border-border bg-input text-[var(--nexus-cyan)] focus:ring-[var(--nexus-cyan)]"
                />
                <span className="text-sm">Include AI image</span>
              </label>
            )}
          </div>

          {/* Generate Button */}
          <NeonButton
            onClick={handleGenerate}
            disabled={!idea.trim() || selectedPlatforms.length === 0 || isGenerating}
            loading={isGenerating}
            icon={<Sparkles className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            {isGenerating ? generationProgress?.stage || 'Generating...' : 'Generate Content'}
          </NeonButton>

          {/* Progress */}
          {isGenerating && generationProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{generationProgress.stage}</span>
                <span className="text-[var(--nexus-cyan)]">{generationProgress.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[var(--nexus-cyan)] to-[var(--nexus-violet)] transition-all duration-300"
                  style={{ width: `${generationProgress.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Generated Content / Approval Gate */}
      {generatedDraft && showApproval && (
        <ApprovalGate
          draft={generatedDraft}
          onApprove={() => {
            setShowApproval(false);
            setGeneratedDraft(null);
            setIdea('');
            mutateDrafts();
          }}
          onEdit={(draft) => {
            setGeneratedDraft(draft);
          }}
          onReject={() => {
            setShowApproval(false);
            setGeneratedDraft(null);
          }}
        />
      )}

      {/* Drafts List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Drafts</h2>
          <StatusBadge status="info" label={`${drafts?.length || 0} drafts`} />
        </div>

        {drafts && drafts.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {drafts.slice(0, 6).map((draft) => (
              <ContentCard
                key={draft.id}
                draft={draft}
                onUpdate={() => mutateDrafts()}
              />
            ))}
          </div>
        ) : (
          <GlassCard className="text-center py-12">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">No drafts yet. Generate your first content above!</p>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
