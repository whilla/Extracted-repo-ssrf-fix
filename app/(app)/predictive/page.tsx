'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { toast } from 'sonner';
import {
  TrendingUp,
  Loader2,
  BarChart3,
  Clock,
  Hash,
  Target,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export default function PredictivePage() {
  const [content, setContent] = useState('');
  const [platform, setPlatform] = useState('twitter');
  const [contentType, setContentType] = useState('text');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const platforms = ['twitter', 'instagram', 'linkedin', 'tiktok', 'facebook', 'youtube'];
  const contentTypes = ['text', 'image', 'video', 'audio'];

  async function analyze() {
    if (!content.trim()) {
      toast.error('Please enter content to analyze');
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch('/api/predictive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          platform,
          contentType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setResult(data);
      toast.success('Analysis complete');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  function getScoreColor(score: number): string {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  }

  function getScoreLabel(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Predictive Analytics</h1>
        <p className="text-gray-400 mt-1">Predict content performance before publishing</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Content</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Platform</label>
                <select
                  value={platform}
                  onChange={e => setPlatform(e.target.value)}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                >
                  {platforms.map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400">Content Type</label>
                <select
                  value={contentType}
                  onChange={e => setContentType(e.target.value)}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                >
                  {contentTypes.map(t => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400">Content</label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Paste your content here..."
                  rows={6}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>
              <NeonButton
                onClick={analyze}
                disabled={analyzing}
                className="w-full"
              >
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Analyze'}
              </NeonButton>
            </div>
          </GlassCard>
        </div>

        <div className="lg:col-span-2">
          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Prediction Results</h2>

            {result ? (
              <div className="space-y-6">
                <div className="flex items-center justify-center">
                  <div className="text-center">
                    <div className={`text-6xl font-bold ${getScoreColor(result.viralScore || 0)}`}>
                      {result.viralScore || 0}
                    </div>
                    <div className="text-lg text-gray-400 mt-1">
                      {getScoreLabel(result.viralScore || 0)} Viral Score
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <Target className="h-5 w-5 mx-auto mb-1 text-blue-400" />
                    <p className="text-lg font-semibold text-white">{result.estimatedReach || 'N/A'}</p>
                    <p className="text-xs text-gray-400">Est. Reach</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <BarChart3 className="h-5 w-5 mx-auto mb-1 text-green-400" />
                    <p className="text-lg font-semibold text-white">{result.engagementRate || 'N/A'}%</p>
                    <p className="text-xs text-gray-400">Engagement Rate</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <Clock className="h-5 w-5 mx-auto mb-1 text-yellow-400" />
                    <p className="text-lg font-semibold text-white">{result.bestTimeToPost || 'N/A'}</p>
                    <p className="text-xs text-gray-400">Best Time</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <Hash className="h-5 w-5 mx-auto mb-1 text-purple-400" />
                    <p className="text-lg font-semibold text-white">{result.hashtagCount || 0}</p>
                    <p className="text-xs text-gray-400">Hashtags</p>
                  </div>
                </div>

                {result.suggestions && result.suggestions.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-white mb-2">Suggestions</h3>
                    <ul className="space-y-2">
                      {result.suggestions.map((s: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <AlertCircle className="h-4 w-4 mt-0.5 text-yellow-400 flex-shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.strengths && result.strengths.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-white mb-2">Strengths</h3>
                    <ul className="space-y-2">
                      {result.strengths.map((s: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-400 flex-shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <TrendingUp className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Enter content to predict performance</p>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
