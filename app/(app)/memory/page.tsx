'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/nexus/PageHeader';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import {
  loadAgentMemory,
  saveAgentMemory,
  clearAgentMemory,
  type AgentMemory,
  type ContentIdea,
} from '@/lib/services/agentMemoryService';
import { Brain, Save, RefreshCw, Trash2 } from 'lucide-react';

const EMPTY_MEMORY: AgentMemory = {
  niche: '',
  nicheDetails: [],
  targetAudience: '',
  audienceInsights: [],
  targetPlatforms: [],
  monetizationGoals: [],
  contentIdeas: [],
  contentPillars: [],
  contentThemes: [],
  preferredTone: '',
  writingStyle: '',
  avoidTopics: [],
  preferredHashtags: [],
  userFacts: [],
  businessGoals: [],
  competitors: [],
  conversationSummaries: [],
  lastUpdated: new Date().toISOString(),
};

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
}

function joinLines(values: string[]): string {
  return values.join('\n');
}

function mergeContentIdeas(lines: string[], existingIdeas: ContentIdea[]): ContentIdea[] {
  return splitLines(lines.join('\n')).map((idea) => {
    const existing = existingIdeas.find(item => item.idea.toLowerCase() === idea.toLowerCase());
    return {
      id: existing?.id || `manual-${idea.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || Date.now()}`,
      idea,
      category: existing?.category || 'manual',
      platform: existing?.platform,
      status: existing?.status || 'new',
      createdAt: existing?.createdAt || new Date().toISOString(),
      usedAt: existing?.usedAt,
    };
  });
}

export default function MemoryPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memory, setMemory] = useState<AgentMemory>(EMPTY_MEMORY);
  const [status, setStatus] = useState<string>('');

  const loadMemory = async () => {
    setLoading(true);
    try {
      const data = await loadAgentMemory();
      setMemory(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemory();
  }, []);

  const updateField = <K extends keyof AgentMemory>(key: K, value: AgentMemory[K]) => {
    setMemory(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      await saveAgentMemory(memory);
      setStatus('Memory saved');
      await loadMemory();
    } catch {
      setStatus('Failed to save memory');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Clear all persistent agent memory?')) return;
    setSaving(true);
    try {
      await clearAgentMemory();
      setMemory(EMPTY_MEMORY);
      setStatus('Memory cleared');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingPulse text="Loading memory..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Memory"
        subtitle="Inspect and lock the persistent context used across chat sessions and model switches"
        icon={Brain}
        actions={
          <div className="flex gap-2">
            <NeonButton variant="ghost" size="sm" onClick={loadMemory}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </NeonButton>
            <NeonButton size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Memory'}
            </NeonButton>
          </div>
        }
      />

      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Last updated</p>
            <p className="font-medium">{new Date(memory.lastUpdated).toLocaleString()}</p>
          </div>
          <div className="text-sm text-muted-foreground">{status}</div>
          <NeonButton variant="danger" size="sm" onClick={handleReset} disabled={saving}>
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Memory
          </NeonButton>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <GlassCard className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Core Positioning</h2>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Primary niche</label>
            <input
              value={memory.niche}
              onChange={(e) => updateField('niche', e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border"
              placeholder="Primary niche"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Niche details</label>
            <textarea
              value={joinLines(memory.nicheDetails)}
              onChange={(e) => updateField('nicheDetails', splitLines(e.target.value))}
              rows={5}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="One per line"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Target audience</label>
            <input
              value={memory.targetAudience}
              onChange={(e) => updateField('targetAudience', e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border"
              placeholder="Target audience"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Audience insights</label>
            <textarea
              value={joinLines(memory.audienceInsights)}
              onChange={(e) => updateField('audienceInsights', splitLines(e.target.value))}
              rows={5}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="One per line"
            />
          </div>
        </GlassCard>

        <GlassCard className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Platform and Monetization</h2>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Target platforms</label>
            <textarea
              value={joinLines(memory.targetPlatforms)}
              onChange={(e) => updateField('targetPlatforms', splitLines(e.target.value))}
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="instagram&#10;tiktok&#10;youtube"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Monetization goals</label>
            <textarea
              value={joinLines(memory.monetizationGoals)}
              onChange={(e) => updateField('monetizationGoals', splitLines(e.target.value))}
              rows={5}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="One per line"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Business goals</label>
            <textarea
              value={joinLines(memory.businessGoals)}
              onChange={(e) => updateField('businessGoals', splitLines(e.target.value))}
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="One per line"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Competitors</label>
            <textarea
              value={joinLines(memory.competitors)}
              onChange={(e) => updateField('competitors', splitLines(e.target.value))}
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="One competitor per line"
            />
          </div>
        </GlassCard>

        <GlassCard className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Content Direction</h2>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Content pillars</label>
            <textarea
              value={joinLines(memory.contentPillars)}
              onChange={(e) => updateField('contentPillars', splitLines(e.target.value))}
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="One per line"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Content themes</label>
            <textarea
              value={joinLines(memory.contentThemes)}
              onChange={(e) => updateField('contentThemes', splitLines(e.target.value))}
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="One per line"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Saved content ideas</label>
            <textarea
              value={joinLines(memory.contentIdeas.map(idea => idea.idea))}
              onChange={(e) =>
                updateField('contentIdeas', mergeContentIdeas(splitLines(e.target.value), memory.contentIdeas))
              }
              rows={10}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="One idea per line"
            />
          </div>
        </GlassCard>

        <GlassCard className="p-6 space-y-4">
          <h2 className="text-lg font-semibold">Style and Guardrails</h2>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Preferred tone</label>
            <input
              value={memory.preferredTone}
              onChange={(e) => updateField('preferredTone', e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border"
              placeholder="Tone"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Writing style</label>
            <input
              value={memory.writingStyle}
              onChange={(e) => updateField('writingStyle', e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border"
              placeholder="Writing style"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Avoid topics</label>
            <textarea
              value={joinLines(memory.avoidTopics)}
              onChange={(e) => updateField('avoidTopics', splitLines(e.target.value))}
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="One per line"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-2">Preferred hashtags</label>
            <textarea
              value={joinLines(memory.preferredHashtags)}
              onChange={(e) => updateField('preferredHashtags', splitLines(e.target.value))}
              rows={4}
              className="w-full px-4 py-3 rounded-lg bg-background/50 border border-border resize-none"
              placeholder="One per line"
            />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
