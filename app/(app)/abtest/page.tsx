'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { TestTube2 } from 'lucide-react';
import { createABTest, getABTests } from '@/lib/services/abTestService';
import type { ABTest, Platform } from '@/lib/types';

type ABTestPlatform = Extract<Platform, 'twitter' | 'instagram' | 'linkedin' | 'tiktok'>;

export default function ABTestPage() {
  useAuth();
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTest, setNewTest] = useState({
    name: '',
    description: '',
    contentA: '',
    contentB: '',
    contentC: '',
    contentD: '',
    platform: 'twitter' as ABTestPlatform,
    duration: 7,
    confidence: 95,
  });
  const [variantCount, setVariantCount] = useState(2);

  const loadTests = async () => {
    try {
      const allTests = await getABTests();
      setTests(allTests);
    } catch (error) {
      console.error('Error loading tests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadTests();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const handleCreateTest = async () => {
    if (!newTest.name || !newTest.contentA || !newTest.contentB) return;

    const allVariants = [
      { label: 'A', content: newTest.contentA },
      { label: 'B', content: newTest.contentB },
      ...(variantCount >= 3 && newTest.contentC ? [{ label: 'C', content: newTest.contentC }] : []),
      ...(variantCount >= 4 && newTest.contentD ? [{ label: 'D', content: newTest.contentD }] : []),
    ];

    try {
      const test = await createABTest({
        name: newTest.name,
        description: newTest.description,
        variants: allVariants.map(v => ({
          label: v.label,
          content: v.content,
          metrics: { impressions: 0, engagements: 0, engagement: 0, clicks: 0, shares: 0, saves: 0, comments: 0, engagementRate: 0, clickThroughRate: 0 },
        })),
        platform: newTest.platform,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + newTest.duration * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active',
      });

      setTests([...tests, test]);
      setShowCreate(false);
      setVariantCount(2);
      setNewTest({ name: '', description: '', contentA: '', contentB: '', contentC: '', contentD: '', platform: 'twitter', duration: 7, confidence: 95 });
    } catch (error) {
      console.error('Error creating test:', error);
    }
  };

  if (loading) {
    return <LoadingPulse text="Loading A/B tests..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TestTube2 className="w-8 h-8 text-[var(--nexus-cyan)]" />
            A/B Testing
          </h1>
          <p className="text-muted-foreground mt-1">Compare content performance across variants</p>
        </div>
        <NeonButton onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ New Test'}
        </NeonButton>
      </div>

      {showCreate && (
        <GlassCard className="p-6 border border-[var(--nexus-cyan)]/30">
          <h2 className="text-xl font-semibold mb-4">Create New A/B Test</h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Test name"
              value={newTest.name}
              onChange={(e) => setNewTest({ ...newTest, name: e.target.value })}
              className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border focus:border-[var(--nexus-cyan)] outline-none"
            />
            <textarea
              placeholder="Description (optional)"
              value={newTest.description}
              onChange={(e) => setNewTest({ ...newTest, description: e.target.value })}
              className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border focus:border-[var(--nexus-cyan)] outline-none min-h-20"
            />

            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-medium">Variants:</span>
              {[2, 3, 4].map(n => (
                <button key={n} onClick={() => setVariantCount(n)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${variantCount === n ? 'bg-[var(--nexus-cyan)] text-black' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}>
                  {n} variants
                </button>
              ))}
            </div>

            <div className={`grid grid-cols-${Math.min(variantCount, 2)} gap-4`} style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(variantCount, 2)}, minmax(0, 1fr))` }}>
              <div>
                <label className="text-sm font-medium mb-2 block">Variant A (Control)</label>
                <textarea placeholder="Content for variant A" value={newTest.contentA}
                  onChange={e => setNewTest(p => ({ ...p, contentA: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border focus:border-[var(--nexus-cyan)] outline-none min-h-20 text-sm" />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Variant B</label>
                <textarea placeholder="Content for variant B" value={newTest.contentB}
                  onChange={e => setNewTest(p => ({ ...p, contentB: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border focus:border-[var(--nexus-cyan)] outline-none min-h-20 text-sm" />
              </div>
            </div>

            {variantCount >= 3 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Variant C</label>
                <textarea placeholder="Content for variant C (optional)" value={newTest.contentC}
                  onChange={e => setNewTest(p => ({ ...p, contentC: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border focus:border-[var(--nexus-cyan)] outline-none min-h-16 text-sm" />
              </div>
            )}
            {variantCount >= 4 && (
              <div>
                <label className="text-sm font-medium mb-2 block">Variant D</label>
                <textarea placeholder="Content for variant D (optional)" value={newTest.contentD}
                  onChange={e => setNewTest(p => ({ ...p, contentD: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border focus:border-[var(--nexus-cyan)] outline-none min-h-16 text-sm" />
              </div>
            )}

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Platform</label>
                <select value={newTest.platform}
                  onChange={e => setNewTest({ ...newTest, platform: e.target.value as ABTestPlatform })}
                  className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border focus:border-[var(--nexus-cyan)] outline-none">
                  <option value="twitter">Twitter/X</option>
                  <option value="instagram">Instagram</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Duration (days)</label>
                <input type="number" min="1" max="30" value={newTest.duration}
                  onChange={e => setNewTest({ ...newTest, duration: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border focus:border-[var(--nexus-cyan)] outline-none" />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Confidence (%)</label>
                <input type="number" min="80" max="99" value={newTest.confidence}
                  onChange={e => setNewTest({ ...newTest, confidence: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 rounded-lg bg-muted/50 border border-border focus:border-[var(--nexus-cyan)] outline-none" />
              </div>
            </div>
            <NeonButton onClick={handleCreateTest} className="w-full">Create Test</NeonButton>
          </div>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 gap-4">
        {tests.length === 0 ? (
          <GlassCard className="p-8 text-center border border-border/50">
            <TestTube2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No A/B tests yet. Create one to compare content performance.</p>
          </GlassCard>
        ) : (
          tests.map((test) => {
            const bestVariant = [...test.variants].sort((a, b) => (b.metrics?.engagement ?? 0) - (a.metrics?.engagement ?? 0))[0];
            const totalImpressions = test.variants.reduce((s, v) => s + (v.metrics?.impressions ?? 0), 0);
            return (
            <GlassCard key={test.id} className="p-6 border border-border/50 hover:border-[var(--nexus-cyan)]/50 transition-colors">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{test.name}</h3>
                  <p className="text-sm text-muted-foreground">{test.description || 'No description provided'}</p>
                  {bestVariant && test.status === 'completed' && (
                    <p className="text-xs text-green-400 mt-1">Winner: Variant {bestVariant.label || bestVariant.name} ({((bestVariant.metrics?.engagement ?? 0) * 100).toFixed(1)}% engagement)</p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${test.status === 'active' ? 'bg-[var(--nexus-success)]/20 text-[var(--nexus-success)]' : 'bg-muted/50 text-muted-foreground'}`}>
                  {test.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {test.variants.map((variant) => {
                  const engagement = variant.metrics?.engagement ?? 0;
                  const isWinner = bestVariant && variant.label === bestVariant.label && test.status === 'completed';
                  return (
                  <div key={variant.label || variant.name} className={`p-4 rounded-lg ${isWinner ? 'bg-green-500/10 border border-green-500/30' : 'bg-muted/30'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">Variant {variant.label || variant.name}</p>
                      {isWinner && <span className="text-xs text-green-400 font-semibold">★ Winner</span>}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{variant.content}</p>
                    <div className="space-y-1 text-xs">
                      <p>Impressions: <span className="font-semibold">{variant.metrics?.impressions ?? 0}</span></p>
                      <p>Clicks: <span className="font-semibold">{variant.metrics?.clicks ?? 0}</span></p>
                      <p>Engagement: <span className="font-semibold">{(engagement * 100).toFixed(1)}%</span></p>
                      {totalImpressions > 0 && (
                        <p>CTR: <span className="font-semibold">{(((variant.metrics?.clicks ?? 0) / totalImpressions) * 100).toFixed(2)}%</span></p>
                      )}
                    </div>
                    {test.variants.length > 2 && test.status === 'active' && (
                      <div className="mt-2 w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--nexus-cyan)] rounded-full" style={{ width: `${engagement * 100}%` }} />
                      </div>
                    )}
                  </div>
                )})}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Ends: {test.endDate ? new Date(test.endDate).toLocaleDateString() : 'TBD'}</span>
                {test.variants.length > 2 && test.status === 'active' && (
                  <span className="text-nexus-cyan">{test.variants.length} variants • A/B/C/D test</span>
                )}
              </div>
            </GlassCard>
          )})
        )}
      </div>
    </div>
  );
}
