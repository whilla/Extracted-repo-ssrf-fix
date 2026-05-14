'use client';

import { useState, useEffect } from 'react';
import { GlassCard } from '@/components/nexus/GlassCard';
import { NeonButton } from '@/components/nexus/NeonButton';
import { LoadingPulse } from '@/components/nexus/LoadingPulse';
import { Brain, FlaskConical, Download, RotateCcw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { toast } from 'sonner';

interface TrainingJob {
  id: string;
  name: string;
  status: 'queued' | 'training' | 'completed' | 'failed';
  model: string;
  progress: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export default function FineTuningPage() {
  useAuth();
  const [jobName, setJobName] = useState('');
  const [baseModel, setBaseModel] = useState('mistral-7b');
  const [dataset, setDataset] = useState('');
  const [hyperParams, setHyperParams] = useState({ epochs: 3, lr: '2e-4', batchSize: 4 });
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    try {
      const res = await fetch('/api/training');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setJobs(data.jobs || []);
        }
      }
    } catch (error) {
      console.error('Failed to load jobs:', error);
    }
  };

  const handleCreateJob = async () => {
    if (!jobName || !dataset) { toast.error('Job name and dataset required'); return; }
    
    setLoading(true);
    try {
      // Parse JSONL data
      const lines = dataset.trim().split('\n');
      const trainingData = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { prompt: '', completion: line };
        }
      }).filter(d => d.prompt || d.input);

      const res = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelType: baseModel.includes('diffusion') || baseModel.includes('sd') ? 'diffusion' : 'llm',
          baseModel,
          trainingData,
          epochs: hyperParams.epochs,
          batchSize: hyperParams.batchSize,
          learningRate: parseFloat(hyperParams.lr),
        }),
      });

      const data = await res.json();
      if (data.success) {
        toast.success('LoRA job created');
        setJobName('');
        setDataset('');
        loadJobs();
      } else {
        toast.error(data.error || 'Failed to create job');
      }
    } catch (error) {
      toast.error('Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-bg-primary via-bg-primary to-violet-900/20 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <FlaskConical className="w-8 h-8 text-nexus-cyan" /> Model Fine-Tuning
          </h1>
          <p className="text-gray-400">Train LoRA adapters on your brand data for custom models</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <GlassCard className="p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold text-white mb-4">Create LoRA Job</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-1">Job Name</label>
                <input className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={jobName} onChange={e => setJobName(e.target.value)} placeholder="e.g. my-brand-voice-lora" />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Base Model</label>
                <select className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" value={baseModel} onChange={e => setBaseModel(e.target.value)}>
                  <option value="mistral-7b">Mistral 7B</option>
                  <option value="llama-3.1-8b">Llama 3.1 8B</option>
                  <option value="llama-2-7b-chat">Llama 2 7B Chat</option>
                  <option value="stable-diffusion-xl">Stable Diffusion XL</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">Training Data (JSONL)</label>
                <textarea className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm h-24" value={dataset} onChange={e => setDataset(e.target.value)} placeholder='{"prompt": "...", "completion": "..."}\n{"prompt": "...", "completion": "..."}' />
              </div>
              <details className="text-sm">
                <summary className="text-nexus-cyan cursor-pointer mb-2">Hyperparameters</summary>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block">Epochs</label>
                    <input type="number" className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" value={hyperParams.epochs} onChange={e => setHyperParams(p => ({ ...p, epochs: +e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block">Learning Rate</label>
                    <input className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" value={hyperParams.lr} onChange={e => setHyperParams(p => ({ ...p, lr: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block">Batch Size</label>
                    <input type="number" className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-white text-xs" value={hyperParams.batchSize} onChange={e => setHyperParams(p => ({ ...p, batchSize: +e.target.value }))} />
                  </div>
                </div>
              </details>
              <NeonButton onClick={handleCreateJob} disabled={loading}>
                {loading ? <LoadingPulse size="sm" /> : <Brain className="w-4 h-4" />}
                {loading ? 'Creating...' : 'Create LoRA Job'}
              </NeonButton>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">How It Works</h3>
            <div className="space-y-3 text-sm text-gray-400">
              <p><strong className="text-white">1.</strong> Choose a base model</p>
              <p><strong className="text-white">2.</strong> Upload your training data (JSONL or CSV)</p>
              <p><strong className="text-white">3.</strong> Configure hyperparameters</p>
              <p><strong className="text-white">4.</strong> Train on Replicate or HuggingFace</p>
              <p><strong className="text-white">5.</strong> Download your LoRA adapter</p>
              <p className="text-xs text-gray-500 mt-4">Requires Replicate API key or HuggingFace token configured in Settings.</p>
            </div>
          </GlassCard>
        </div>

        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Training Jobs</h3>
          {jobs.length === 0 ? (
            <p className="text-sm text-gray-500">No training jobs yet. Create one above.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <div key={job.id} className="flex items-center justify-between p-3 bg-black/30 rounded-lg border border-white/5">
                  <div>
                    <p className="text-white text-sm font-medium">{job.name}</p>
                    <p className="text-xs text-gray-500">{job.model} • {job.id}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {job.status === 'training' ? (
                      <>
                        <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-nexus-cyan rounded-full" style={{ width: `${job.progress}%` }} />
                        </div>
                        <LoadingPulse size="sm" />
                      </>
                    ) : job.status === 'completed' ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <NeonButton size="sm"><Download className="w-3 h-3" /> Download</NeonButton>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400" />
                        <NeonButton size="sm"><RotateCcw className="w-3 h-3" /> Retry</NeonButton>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
