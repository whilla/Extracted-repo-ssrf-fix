'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { toast } from 'sonner';
import {
  Shield,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  Search,
} from 'lucide-react';

const REGIONS = [
  { id: 'us', label: 'United States' },
  { id: 'eu', label: 'European Union' },
  { id: 'de', label: 'Germany' },
  { id: 'uk', label: 'United Kingdom' },
  { id: 'cn', label: 'China' },
  { id: 'in', label: 'India' },
  { id: 'jp', label: 'Japan' },
  { id: 'br', label: 'Brazil' },
  { id: 'au', label: 'Australia' },
  { id: 'ca', label: 'Canada' },
  { id: 'kr', label: 'South Korea' },
  { id: 'global', label: 'Global' },
];

export default function CompliancePage() {
  const [content, setContent] = useState('');
  const [selectedRegions, setSelectedRegions] = useState<string[]>(['us', 'eu']);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<any>(null);

  function toggleRegion(id: string) {
    setSelectedRegions(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  }

  async function checkCompliance() {
    if (!content.trim()) {
      toast.error('Please enter content to check');
      return;
    }
    setChecking(true);
    setResult(null);
    try {
      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          regions: selectedRegions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      setResult(data);
      toast[data.compliant ? 'success' : 'warning'](
        data.compliant ? 'Content is compliant' : 'Compliance issues found'
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Check failed');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Compliance Dashboard</h1>
        <p className="text-gray-400 mt-1">Check content for regional compliance, copyright, and trademark issues</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-4">
          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Target Regions</h2>
            <div className="grid grid-cols-2 gap-2">
              {REGIONS.map(r => (
                <button
                  key={r.id}
                  onClick={() => toggleRegion(r.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-colors ${
                    selectedRegions.includes(r.id)
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <Globe className="h-3 w-3" />
                  {r.label}
                </button>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Content</h2>
            <div className="space-y-3">
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Paste content to check for compliance..."
                rows={8}
                className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none resize-none"
              />
              <NeonButton
                onClick={checkCompliance}
                disabled={checking}
                className="w-full"
              >
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check Compliance'}
              </NeonButton>
            </div>
          </GlassCard>
        </div>

        <div className="lg:col-span-2">
          <GlassCard>
            <h2 className="font-semibold text-white mb-4">Results</h2>

            {result ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-800/50">
                  {result.compliant ? (
                    <CheckCircle2 className="h-8 w-8 text-green-400" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-400" />
                  )}
                  <div>
                    <p className="font-semibold text-white">
                      {result.compliant ? 'Compliant' : 'Non-Compliant'}
                    </p>
                    <p className="text-sm text-gray-400">
                      Checked against {result.regionsChecked?.length || 0} regions
                    </p>
                  </div>
                </div>

                {result.issues && result.issues.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400" />
                      Issues Found ({result.issues.length})
                    </h3>
                    <ul className="space-y-2">
                      {result.issues.map((issue: any, i: number) => (
                        <li key={i} className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                          <XCircle className="h-4 w-4 mt-0.5 text-red-400 flex-shrink-0" />
                          <div>
                            <p className="text-sm text-white">{issue.message}</p>
                            <p className="text-xs text-gray-400">
                              Regions: {issue.regions?.join(', ') || 'All'} | Severity: {issue.severity || 'medium'}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.warnings && result.warnings.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400" />
                      Warnings ({result.warnings.length})
                    </h3>
                    <ul className="space-y-2">
                      {result.warnings.map((w: any, i: number) => (
                        <li key={i} className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                          <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-400 flex-shrink-0" />
                          <p className="text-sm text-white">{w}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.compliant && (
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-sm text-green-300">
                      No compliance issues detected for the selected regions.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                <Shield className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">Enter content and check for compliance</p>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
