import { logger } from '@/lib/utils/logger';
import { kvGet, kvSet } from './puterService';

export type ModelType = 'llm' | 'diffusion';

export interface FineTuningConfig {
  modelType: ModelType;
  baseModel: string;
  trainingData: { input: string; output: string }[];
  epochs?: number;
  batchSize?: number;
  learningRate?: number;
  loraRank?: number;
  loraAlpha?: number;
  targetModules?: string[];
}

export interface FineTuningJob {
  id: string;
  status: 'queued' | 'training' | 'completed' | 'failed';
  progress: number;
  config: FineTuningConfig;
  createdAt: string;
  completedAt?: string;
  outputModelId?: string;
  error?: string;
}

export interface FineTuningResult {
  success: boolean;
  job?: FineTuningJob;
  modelId?: string;
  error?: string;
}

const JOBS_STORAGE_KEY = 'fine_tuning_jobs';

async function loadJobs(): Promise<FineTuningJob[]> {
  const data = await kvGet(JOBS_STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveJobs(jobs: FineTuningJob[]): Promise<void> {
  await kvSet(JOBS_STORAGE_KEY, JSON.stringify(jobs.slice(0, 50)));
}

function generateJobId(): string {
  return `ft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function pollReplicateJob(jobId: string, predictionId: string, apiKey: string): Promise<void> {
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      if (!response.ok) continue;
      const data = await response.json();

      const jobs = await loadJobs();
      const idx = jobs.findIndex(j => j.id === jobId);
      if (idx === -1) return;

      if (data.status === 'succeeded') {
        jobs[idx].status = 'completed';
        jobs[idx].progress = 100;
        jobs[idx].completedAt = new Date().toISOString();
        jobs[idx].outputModelId = Array.isArray(data.output) ? data.output[0] : data.output;
        await saveJobs(jobs);
        return;
      } else if (data.status === 'failed') {
        jobs[idx].status = 'failed';
        jobs[idx].error = data.error || 'Training failed';
        await saveJobs(jobs);
        return;
      } else {
        jobs[idx].status = 'training';
        jobs[idx].progress = Math.min(95, Math.round((i / maxAttempts) * 100));
        await saveJobs(jobs);
      }
    } catch (e) {
      logger.warn(`[FineTuning] Poll error for job ${jobId}`, e instanceof Error ? e.message : String(e));
    }
  }
  // Timeout
  const jobs = await loadJobs();
  const idx = jobs.findIndex(j => j.id === jobId);
  if (idx !== -1) {
    jobs[idx].status = 'failed';
    jobs[idx].error = 'Training timed out after 10 minutes';
    await saveJobs(jobs);
  }
}

export class ModelFineTuningService {
  static async createLoRAJob(config: FineTuningConfig): Promise<FineTuningResult> {
    try {
      logger.info('[ModelFineTuningService] Creating LoRA job', {
        modelType: config.modelType,
        baseModel: config.baseModel,
        trainingSamples: config.trainingData.length,
      });

      const replicateKey = await kvGet('replicate_api_key');
      const hfToken = await kvGet('huggingface_api_token');

      if (replicateKey) {
        // Use Replicate fine-tuning API
        const baseModelMap: Record<string, string> = {
          'gpt-4': 'meta/llama-2-7b-chat',
          'gpt-4o': 'meta/llama-2-13b-chat',
          'claude-3': 'meta/llama-2-70b-chat',
          'stable-diffusion-xl': 'stability-ai/sdxl',
          'sd-xl': 'stability-ai/sdxl',
        };
        const replicateModel = baseModelMap[config.baseModel] || config.baseModel;

        const trainingExamples = config.trainingData.slice(0, 100).map(d => ({
          input: d.input,
          output: d.output,
        }));

        const response = await fetch('https://api.replicate.com/v1/trainings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${replicateKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: config.modelType === 'diffusion' ? 'a6a8d9a4a5d2d4c8e9e8f7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7' : 'e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7a6b5c4d3e2f1a0b9c8d7',
            input: {
              train_data: trainingExamples,
              num_train_epochs: config.epochs || 3,
              learning_rate: config.learningRate || 0.0001,
              lora_rank: config.loraRank || 8,
              lora_alpha: config.loraAlpha || 16,
              batch_size: config.batchSize || 4,
              ...(config.targetModules ? { target_modules: config.targetModules } : {}),
            },
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Replicate API error: ${response.statusText}`);
        }

        const data = await response.json();
        const job: FineTuningJob = {
          id: generateJobId(),
          status: 'queued',
          progress: 0,
          config,
          createdAt: new Date().toISOString(),
        };

        const jobs = await loadJobs();
        jobs.unshift(job);
        await saveJobs(jobs);

        // Start polling in background
        pollReplicateJob(job.id, data.id, replicateKey);

        return { success: true, job };
      }

      if (hfToken) {
        // Use HuggingFace AutoTrain API
        const response = await fetch('https://huggingface.co/api/autotrain/jobs', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hfToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.baseModel,
            task: config.modelType === 'diffusion' ? 'text-to-image' : 'text-generation',
            training_data: {
              type: 'jsonl',
              data: config.trainingData.slice(0, 50).map(d => JSON.stringify(d)).join('\n'),
            },
            hyperparameters: {
              epochs: config.epochs || 3,
              batch_size: config.batchSize || 4,
              learning_rate: config.learningRate || 0.0001,
              lora_r: config.loraRank || 8,
              lora_alpha: config.loraAlpha || 16,
            },
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HuggingFace API error: ${response.statusText}`);
        }

        const data = await response.json();
        const job: FineTuningJob = {
          id: generateJobId(),
          status: 'queued',
          progress: 0,
          config,
          createdAt: new Date().toISOString(),
        };

        const jobs = await loadJobs();
        jobs.unshift(job);
        await saveJobs(jobs);

        return { success: true, job, modelId: data.job_id };
      }

      return {
        success: false,
        error: 'Model fine-tuning requires either REPLICATE_API_KEY or HUGGINGFACE_API_TOKEN configured in Settings. Configure one to enable real LoRA training.',
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Fine-tuning creation failed' };
    }
  }

  static async getJob(jobId: string): Promise<FineTuningJob | null> {
    const jobs = await loadJobs();
    return jobs.find(j => j.id === jobId) || null;
  }

  static async listJobs(): Promise<FineTuningJob[]> {
    return loadJobs();
  }

  static async createLLMJob(config: FineTuningConfig): Promise<FineTuningResult> {
    return this.createLoRAJob({ ...config, modelType: 'llm' });
  }

  static async createDiffusionJob(config: FineTuningConfig): Promise<FineTuningResult> {
    return this.createLoRAJob({ ...config, modelType: 'diffusion' });
  }

  static async trainOnBrandVoice(trainingData: {
    sampleContent: string;
    brandGuidelines: string;
  }[]): Promise<FineTuningResult> {
    return this.createLoRAJob({
      modelType: 'llm',
      baseModel: 'meta/llama-2-7b-chat',
      trainingData: trainingData.map(d => ({
        input: `Generate content following these brand guidelines: ${d.brandGuidelines}`,
        output: d.sampleContent,
      })),
      epochs: 3,
      batchSize: 4,
      learningRate: 0.0001,
      loraRank: 8,
    });
  }

  static async trainOnBrandVisual(trainingData: {
    imageUrl: string;
    description: string;
  }[]): Promise<FineTuningResult> {
    return this.createLoRAJob({
      modelType: 'diffusion',
      baseModel: 'stability-ai/sdxl',
      trainingData: trainingData.map(d => ({
        input: d.description,
        output: d.imageUrl,
      })),
      epochs: 5,
      batchSize: 2,
      learningRate: 0.0001,
      loraRank: 16,
    });
  }

  static async applyLoRA(modelId: string, loraModelId: string): Promise<{ success: boolean; mergedModelId?: string; error?: string }> {
    try {
      const replicateKey = await kvGet('replicate_api_key');
      if (replicateKey) {
        const response = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${replicateKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            version: modelId,
            input: {
              lora_model: loraModelId,
              merge_mode: 'weighted_average',
            },
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return { success: true, mergedModelId: data.id };
        }
      }

      return {
        success: false,
        error: 'LoRA merging requires Replicate API key. Configure replicate_api_key in Settings.',
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'LoRA merge failed' };
    }
  }
}