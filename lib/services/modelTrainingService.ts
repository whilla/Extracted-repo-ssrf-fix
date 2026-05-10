/**
 * Custom AI Model Training Service
 * Fine-tuning, embeddings, and custom model management
 */

import { kvGet, kvSet } from './puterService';
import { generateId } from './memoryService';

export type ModelType = 'text' | 'chat' | 'embedding' | 'image' | 'voice';
export type TrainingStatus = 'pending' | 'preparing' | 'training' | 'completed' | 'failed';
export type BaseModel = 'gpt-4o' | 'gpt-4o-mini' | 'claude-sonnet-4-5' | 'llama-3.1-70b' | 'custom';

export interface TrainingDataset {
  id: string;
  name: string;
  description: string;
  examples: TrainingExample[];
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingExample {
  id: string;
  input: string;
  output: string;
  metadata?: Record<string, unknown>;
}

export interface CustomModel {
  id: string;
  name: string;
  description: string;
  type: ModelType;
  baseModel: BaseModel;
  status: TrainingStatus;
  datasetId?: string;
  version: number;
  metrics?: ModelMetrics;
  config: ModelConfig;
  endpoint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelMetrics {
  accuracy?: number;
  loss?: number;
  trainingSteps?: number;
  evalScore?: number;
  latency?: number;
}

export interface ModelConfig {
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface TrainingJob {
  id: string;
  modelId: string;
  status: TrainingStatus;
  progress: number;
  currentStep?: number;
  totalSteps?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  logs?: string[];
}

export interface EmbeddingVector {
  id: string;
  modelId: string;
  text: string;
  vector: number[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const DATASETS_KEY = 'training_datasets';
const MODELS_KEY = 'custom_models';
const JOBS_KEY = 'training_jobs';
const EMBEDDINGS_KEY = 'embeddings';

function generateId(): string {
  return `model_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadDatasets(): Promise<TrainingDataset[]> {
  const data = await kvGet(DATASETS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveDatasets(datasets: TrainingDataset[]): Promise<void> {
  await kvSet(DATASETS_KEY, JSON.stringify(datasets.slice(0, 50)));
}

async function loadModels(): Promise<CustomModel[]> {
  const data = await kvGet(MODELS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveModels(models: CustomModel[]): Promise<void> {
  await kvSet(MODELS_KEY, JSON.stringify(models.slice(0, 50)));
}

export async function createDataset(
  name: string,
  description: string,
  examples: Omit<TrainingExample, 'id'>[]
): Promise<TrainingDataset> {
  const datasets = await loadDatasets();

  const fullExamples: TrainingExample[] = examples.map(e => ({
    ...e,
    id: generateId(),
  }));

  const totalTokens = fullExamples.reduce((sum, e) => 
    sum + (e.input.length + e.output.length) / 4, 0
  );

  const dataset: TrainingDataset = {
    id: generateId(),
    name,
    description,
    examples: fullExamples,
    totalTokens: Math.round(totalTokens),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  datasets.unshift(dataset);
  await saveDatasets(datasets);

  return dataset;
}

export async function addExampleToDataset(
  datasetId: string,
  example: Omit<TrainingExample, 'id'>
): Promise<boolean> {
  const datasets = await loadDatasets();
  const index = datasets.findIndex(d => d.id === datasetId);

  if (index === -1) return false;

  datasets[index].examples.push({
    ...example,
    id: generateId(),
  });
  datasets[index].updatedAt = new Date().toISOString();

  await saveDatasets(datasets);
  return true;
}

export async function getDataset(datasetId: string): Promise<TrainingDataset | null> {
  const datasets = await loadDatasets();
  return datasets.find(d => d.id === datasetId) || null;
}

export async function listDatasets(): Promise<TrainingDataset[]> {
  return loadDatasets();
}

export async function deleteDataset(datasetId: string): Promise<boolean> {
  const datasets = await loadDatasets();
  const filtered = datasets.filter(d => d.id !== datasetId);
  
  if (filtered.length === datasets.length) return false;
  
  await saveDatasets(filtered);
  return true;
}

export async function createModel(
  name: string,
  description: string,
  type: ModelType,
  baseModel: BaseModel,
  datasetId?: string,
  config?: Partial<ModelConfig>
): Promise<CustomModel> {
  const models = await loadModels();

  const defaultConfig: ModelConfig = {
    temperature: 0.7,
    maxTokens: 2048,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  };

  const model: CustomModel = {
    id: generateId(),
    name,
    description,
    type,
    baseModel,
    status: 'pending',
    datasetId,
    version: 1,
    config: { ...defaultConfig, ...config },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  models.unshift(model);
  await saveModels(models);

  return model;
}

export async function getModel(modelId: string): Promise<CustomModel | null> {
  const models = await loadModels();
  return models.find(m => m.id === modelId) || null;
}

export async function listModels(options?: {
  type?: ModelType;
  status?: TrainingStatus;
}): Promise<CustomModel[]> {
  let models = await loadModels();

  if (options?.type) {
    models = models.filter(m => m.type === options.type);
  }
  if (options?.status) {
    models = models.filter(m => m.status === options.status);
  }

  return models;
}

export async function updateModel(modelId: string, updates: Partial<CustomModel>): Promise<boolean> {
  const models = await loadModels();
  const index = models.findIndex(m => m.id === modelId);

  if (index === -1) return false;

  models[index] = {
    ...models[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveModels(models);
  return true;
}

export async function startTraining(modelId: string): Promise<TrainingJob> {
  const model = await getModel(modelId);
  if (!model) throw new Error('Model not found');

  await updateModel(modelId, { status: 'preparing' });

  const job: TrainingJob = {
    id: generateId(),
    modelId,
    status: 'preparing',
    progress: 0,
    startedAt: new Date().toISOString(),
    logs: ['Initializing training environment...'],
  };

  const jobsData = await kvGet(JOBS_KEY);
  const jobs: TrainingJob[] = jobsData ? JSON.parse(jobsData) : [];
  jobs.unshift(job);
  await kvSet(JOBS_KEY, JSON.stringify(jobs.slice(0, 50)));

  // Start real training via API instead of simulation
  startRealTraining(job.id, modelId);

  return job;
}

/**
 * Start real model training via external fine-tuning API
 * In production, this would integrate with OpenAI, Cohere, or custom fine-tuning services
 */
async function startRealTraining(jobId: string, modelId: string) {
  const model = await getModel(modelId);
  if (!model) {
    console.error(`[ModelTraining] Model ${modelId} not found`);
    return;
  }

  const dataset = model.datasetId ? await getDataset(model.datasetId) : null;

  // Determine which fine-tuning provider to use based on base model
  const provider = getFineTuningProvider(model.baseModel);
  
  try {
    // Update job status to training
    await updateJobStatus(jobId, 'training', 0);

    // Call the appropriate fine-tuning API
    const result = await callFineTuningAPI(provider, model, dataset);

    if (result.success) {
      // Training completed successfully
      await updateJobStatus(jobId, 'completed', 100, {
        completedAt: new Date().toISOString(),
        endpoint: result.endpoint,
        logs: ['Training completed successfully', `Model endpoint: ${result.endpoint}`],
      });

      await updateModel(modelId, {
        status: 'completed',
        endpoint: result.endpoint,
        metrics: result.metrics,
      });
    } else {
      // Training failed
      await updateJobStatus(jobId, 'failed', 0, {
        error: result.error,
        logs: [`Training failed: ${result.error}`],
      });

      await updateModel(modelId, { status: 'failed' });
    }
  } catch (error) {
    console.error('[ModelTraining] Training error:', error);
    await updateJobStatus(jobId, 'failed', 0, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    await updateModel(modelId, { status: 'failed' });
  }
}

function getFineTuningProvider(baseModel: BaseModel): string {
  const providers: Record<BaseModel, string> = {
    'gpt-4o': 'openai',
    'gpt-4o-mini': 'openai',
    'claude-sonnet-4-5': 'anthropic',
    'llama-3.1-70b': 'replicate',
    'custom': 'custom',
  };
  return providers[baseModel] || 'openai';
}

async function callFineTuningAPI(
  provider: string,
  model: CustomModel,
  dataset: TrainingDataset | null
): Promise<{ success: boolean; endpoint?: string; error?: string; metrics?: ModelMetrics }> {
  // This would integrate with actual fine-tuning APIs
  // For now, return a placeholder that explains what's needed
  
  switch (provider) {
    case 'openai':
      return {
        success: false,
        error: 'OpenAI fine-tuning requires additional configuration. Set OPENAI_FINE_TUNE_KEY environment variable.',
      };
    case 'anthropic':
      return {
        success: false,
        error: 'Anthropic fine-tuning not yet available. Use OpenAI or Replicate for custom model training.',
      };
    case 'replicate':
      return {
        success: false,
        error: 'Replicate fine-tuning requires REPLICATE_API_KEY and custom model setup.',
      };
    default:
      return {
        success: false,
        error: `Fine-tuning provider ${provider} not supported. Use OpenAI or Replicate.`,
      };
  }
}

async function updateJobStatus(
  jobId: string,
  status: TrainingStatus,
  progress: number,
  additionalUpdates?: Partial<TrainingJob>
) {
  const jobsData = await kvGet(JOBS_KEY);
  const jobs: TrainingJob[] = jobsData ? JSON.parse(jobsData) : [];
  const index = jobs.findIndex(j => j.id === jobId);

  if (index === -1) return;

  jobs[index] = {
    ...jobs[index],
    status,
    progress,
    ...additionalUpdates,
  };

  await kvSet(JOBS_KEY, JSON.stringify(jobs));
}

export async function getTrainingJob(jobId: string): Promise<TrainingJob | null> {
  const jobsData = await kvGet(JOBS_KEY);
  const jobs: TrainingJob[] = jobsData ? JSON.parse(jobsData) : [];
  return jobs.find(j => j.id === jobId) || null;
}

export async function getModelTrainingHistory(modelId: string): Promise<TrainingJob[]> {
  const jobsData = await kvGet(JOBS_KEY);
  const jobs: TrainingJob[] = jobsData ? JSON.parse(jobsData) : [];
  return jobs.filter(j => j.modelId === modelId);
}

export async function generateEmbedding(
  modelId: string,
  text: string,
  metadata?: Record<string, unknown>
): Promise<number[]> {
  const dimensions = 1536;
  const embedding = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
  
  const normalize = (vec: number[]) => {
    const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map(v => v / mag);
  };

  return normalize(embedding);
}

export async function searchSimilar(
  modelId: string,
  query: string,
  topK: number = 5
): Promise<{ text: string; similarity: number; metadata?: Record<string, unknown> }[]> {
  const queryEmbedding = await generateEmbedding(modelId, query);
  
  const embeddingsData = await kvGet(EMBEDDINGS_KEY);
  const embeddings: EmbeddingVector[] = embeddingsData ? JSON.parse(embeddingsData) : [];
  
  const modelEmbeddings = embeddings.filter(e => e.modelId === modelId);
  
  const similarities = modelEmbeddings.map(e => {
    const dotProduct = e.vector.reduce((sum, v, i) => sum + v * queryEmbedding[i], 0);
    return {
      text: e.text,
      similarity: dotProduct,
      metadata: e.metadata,
    };
  });

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

export async function addToIndex(
  modelId: string,
  text: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const embedding = await generateEmbedding(modelId, text);

  const embeddingsData = await kvGet(EMBEDDINGS_KEY);
  const embeddings: EmbeddingVector[] = embeddingsData ? JSON.parse(embeddingsData) : [];

  embeddings.unshift({
    id: generateId(),
    modelId,
    text,
    vector: embedding,
    metadata,
    createdAt: new Date().toISOString(),
  });

  await kvSet(EMBEDDINGS_KEY, JSON.stringify(embeddings.slice(0, 1000)));
  return true;
}

export async function deleteModel(modelId: string): Promise<boolean> {
  const models = await loadModels();
  const filtered = models.filter(m => m.id !== modelId);
  
  if (filtered.length === models.length) return false;
  
  await saveModels(filtered);
  return true;
}

export async function useCustomModel(
  modelId: string,
  prompt: string,
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const model = await getModel(modelId);
  if (!model || model.status !== 'completed') {
    throw new Error('Model not ready');
  }

  const { universalChat } = await import('./aiService');
  
  const response = await universalChat(prompt, {
    model: model.baseModel,
    temperature: options?.temperature ?? model.config.temperature,
    maxTokens: options?.maxTokens ?? model.config.maxTokens,
  });

  return response;
}

export function getDefaultModelConfig(type: ModelType): ModelConfig {
  switch (type) {
    case 'chat':
      return { temperature: 0.7, maxTokens: 2048, topP: 1 };
    case 'text':
      return { temperature: 0.5, maxTokens: 1024, topP: 0.9 };
    case 'embedding':
      return { temperature: 0, maxTokens: 0 };
    case 'image':
      return { temperature: 0.8, maxTokens: 500 };
    case 'voice':
      return { temperature: 0.3, maxTokens: 4096 };
    default:
      return { temperature: 0.7, maxTokens: 2048 };
  }
}