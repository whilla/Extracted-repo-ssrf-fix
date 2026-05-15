'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { toast } from 'sonner';
import {
  Gamepad2,
  ListChecks,
  BarChart3,
  Calculator,
  Image,
  Loader2,
  Copy,
  Eye,
  Download,
} from 'lucide-react';

const INTERACTIVE_TYPES = [
  { id: 'quiz', label: 'Quiz', icon: ListChecks, description: 'Multiple choice or true/false quiz' },
  { id: 'poll', label: 'Poll', icon: BarChart3, description: 'Single or multi-choice voting poll' },
  { id: 'calculator', label: 'Calculator', icon: Calculator, description: 'Interactive calculation tool' },
  { id: 'infographic', label: 'Infographic', icon: Image, description: 'Data-driven visual content' },
  { id: 'minigame', label: 'Mini-Game', icon: Gamepad2, description: 'Simple browser-based game' },
];

export default function InteractivePage() {
  const [type, setType] = useState('quiz');
  const [topic, setTopic] = useState('');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function generate() {
    if (!topic.trim()) {
      toast.error('Please enter a topic');
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch('/api/interactive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          topic,
          prompt: prompt || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setResult(data.html || data.content || JSON.stringify(data, null, 2));
      toast.success('Interactive content generated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard() {
    if (!result) return;
    navigator.clipboard.writeText(result);
    toast.success('Copied to clipboard');
  }

  function preview() {
    if (!result) return;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(result);
      win.document.close();
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Interactive Content Builder</h1>
        <p className="text-gray-400 mt-1">Create quizzes, polls, calculators, infographics, and mini-games</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Content Type</h2>
            <div className="grid grid-cols-2 gap-2">
              {INTERACTIVE_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                      type === t.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs text-white">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Configuration</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g., JavaScript fundamentals"
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">Custom Prompt (optional)</label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Additional instructions..."
                  rows={3}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>
              <NeonButton
                onClick={generate}
                disabled={generating}
                className="w-full"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}
              </NeonButton>
            </div>
          </GlassCard>
        </div>

        <div className="lg:col-span-2">
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white">Output</h2>
              {result && (
                <div className="flex gap-2">
                  <NeonButton size="sm" variant="secondary" onClick={copyToClipboard}>
                    <Copy className="h-4 w-4" />
                  </NeonButton>
                  <NeonButton size="sm" variant="secondary" onClick={preview}>
                    <Eye className="h-4 w-4" />
                  </NeonButton>
                  <NeonButton size="sm" variant="secondary" onClick={download}>
                    <Download className="h-4 w-4" />
                  </NeonButton>
                </div>
              )}
            </div>

            {result ? (
              <div className="bg-gray-900/50 rounded-lg p-4 overflow-auto max-h-[600px]">
                <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                  {result}
                </pre>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Gamepad2 className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Configure and generate interactive content</p>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
