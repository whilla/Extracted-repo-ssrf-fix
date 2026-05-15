'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { toast } from 'sonner';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Loader2,
  Copy,
  Download,
  Upload,
} from 'lucide-react';

const CHART_TYPES = [
  { id: 'bar', label: 'Bar Chart', icon: BarChart3 },
  { id: 'line', label: 'Line Chart', icon: TrendingUp },
  { id: 'pie', label: 'Pie Chart', icon: PieChart },
];

export default function DataVizPage() {
  const [csvData, setCsvData] = useState('');
  const [chartType, setChartType] = useState('bar');
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [html, setHtml] = useState<string | null>(null);

  async function generate() {
    if (!csvData.trim()) {
      toast.error('Please enter CSV data');
      return;
    }
    setGenerating(true);
    setHtml(null);
    try {
      const res = await fetch('/api/data/visualization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv: csvData,
          chartType,
          title: title || 'Data Visualization',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setHtml(data.html || data.content || JSON.stringify(data, null, 2));
      toast.success('Chart generated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  function loadSample() {
    setCsvData(`Month,Revenue,Expenses,Profit
January,12000,8000,4000
February,15000,9000,6000
March,11000,7500,3500
April,18000,10000,8000
May,22000,12000,10000
June,19000,11000,8000`);
    setTitle('Monthly Financial Overview');
  }

  function copyToClipboard() {
    if (!html) return;
    navigator.clipboard.writeText(html);
    toast.success('Copied to clipboard');
  }

  function preview() {
    if (!html) return;
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  function download() {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chart-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Data Visualization Builder</h1>
        <p className="text-gray-400 mt-1">Upload CSV data and generate interactive charts</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Chart Type</h2>
            <div className="grid grid-cols-3 gap-2">
              {CHART_TYPES.map(t => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setChartType(t.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                      chartType === t.id
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
            <h2 className="font-semibold text-white mb-4">CSV Data</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Chart Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="My Chart"
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400">CSV Data</label>
                <textarea
                  value={csvData}
                  onChange={e => setCsvData(e.target.value)}
                  placeholder="header1,header2\nvalue1,value2"
                  rows={8}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>
              <div className="flex gap-2">
                <NeonButton size="sm" variant="secondary" onClick={loadSample} className="flex-1">
                  <Upload className="h-4 w-4 mr-1" /> Sample
                </NeonButton>
              </div>
              <NeonButton
                onClick={generate}
                disabled={generating}
                className="w-full"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate Chart'}
              </NeonButton>
            </div>
          </GlassCard>
        </div>

        <div className="lg:col-span-2">
          <GlassCard>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white">Preview</h2>
              {html && (
                <div className="flex gap-2">
                  <NeonButton size="sm" variant="secondary" onClick={copyToClipboard}>
                    <Copy className="h-4 w-4" />
                  </NeonButton>
                  <NeonButton size="sm" variant="secondary" onClick={preview}>
                    Preview
                  </NeonButton>
                  <NeonButton size="sm" variant="secondary" onClick={download}>
                    <Download className="h-4 w-4" />
                  </NeonButton>
                </div>
              )}
            </div>

            {html ? (
              <div className="bg-white rounded-lg overflow-auto max-h-[600px]">
                <iframe
                  srcDoc={html}
                  className="w-full h-[600px] border-0"
                  title="Chart Preview"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <BarChart3 className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Enter CSV data and generate a chart</p>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
