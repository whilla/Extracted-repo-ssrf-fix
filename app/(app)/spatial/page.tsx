'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { toast } from 'sonner';
import {
  Cuboid,
  Glasses,
  MonitorPlay,
  Loader2,
  Copy,
  Download,
  Eye,
} from 'lucide-react';

const SPATIAL_TYPES = [
  { id: 'model', label: '3D Model', icon: Cuboid, description: 'Generate a 3D model scene' },
  { id: 'ar-filter', label: 'AR Filter', icon: Glasses, description: 'Augmented reality filter' },
  { id: 'vr-environment', label: 'VR Environment', icon: MonitorPlay, description: 'Virtual reality scene' },
];

export default function SpatialPage() {
  const [type, setType] = useState('model');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function generate() {
    if (!description.trim()) {
      toast.error('Please describe what to generate');
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const endpoint = type === 'model'
        ? '/api/spatial/models'
        : type === 'ar-filter'
        ? '/api/spatial/ar-filters'
        : '/api/spatial/vr-environments';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setResult(data.html || data.content || JSON.stringify(data, null, 2));
      toast.success(`${type} generated`);
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
    a.download = `spatial-${type}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">3D / AR / VR Creator</h1>
        <p className="text-gray-400 mt-1">Generate Three.js scenes, AR filters, and VR environments</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Content Type</h2>
            <div className="space-y-2">
              {SPATIAL_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setType(t.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      type === t.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <div className="text-left">
                      <span className="text-sm text-white block">{t.label}</span>
                      <span className="text-xs text-gray-400">{t.description}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Description</h2>
            <div className="space-y-3">
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe the 3D scene, AR filter, or VR environment..."
                rows={5}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none resize-none"
              />
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
                <Cuboid className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Describe and generate spatial content</p>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
