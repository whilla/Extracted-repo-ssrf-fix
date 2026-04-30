/**
 * Provider Capability Matrix Service
 * Tracks provider health, capabilities, and model gating
 */

import { kvGet, kvSet, readFile, writeFile, PATHS } from './puterService';
import { pickRecommendedModel } from './providerModelSelection.mjs';
import { sanitizeApiKey } from './providerCredentialUtils';

export interface ProviderCapability {
  id: string;
  name: string;
  capabilities: {
    chat: boolean;
    vision: boolean;
    imageGeneration: boolean;
    audioGeneration: boolean;
    codeGeneration: boolean;
    functionCalling: boolean;
    streaming: boolean;
    embeddings: boolean;
  };
  models: ModelInfo[];
  rateLimits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    tokensPerDay: number;
  };
  pricing: {
    inputTokens: number;  // per 1K tokens
    outputTokens: number; // per 1K tokens
    imageGeneration?: number; // per image
  };
  status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  lastHealthCheck: string;
  requiresApiKey: boolean;
  apiKeyConfigured: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  capabilities: string[];
  recommended: boolean;
  deprecated: boolean;
  bestFor: string[];
}

export interface UsageRecord {
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: string;
  taskType: string;
}

export interface UsageBudget {
  dailyLimit: number;
  monthlyLimit: number;
  warningThreshold: number; // percentage
  hardLimit: boolean;
}

// Provider definitions with capabilities
const PROVIDER_DEFINITIONS: Omit<ProviderCapability, 'status' | 'lastHealthCheck' | 'apiKeyConfigured'>[] = [
  {
    id: 'puter',
    name: 'Puter AI (Free)',
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: true,
      audioGeneration: false,
      codeGeneration: true,
      functionCalling: true,
      streaming: true,
      embeddings: false,
    },
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxOutputTokens: 16384, capabilities: ['chat', 'vision', 'code'], recommended: true, deprecated: false, bestFor: ['general', 'analysis', 'creative'] },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, maxOutputTokens: 16384, capabilities: ['chat', 'vision', 'code'], recommended: true, deprecated: false, bestFor: ['quick-tasks', 'cost-effective'] },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['chat', 'vision', 'code'], recommended: true, deprecated: false, bestFor: ['writing', 'analysis'] },
      { id: 'claude-opus-4', name: 'Claude Opus 4', contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['chat', 'vision', 'code'], recommended: false, deprecated: false, bestFor: ['complex-reasoning'] },
    ],
    rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000, tokensPerDay: 1000000 },
    pricing: { inputTokens: 0, outputTokens: 0 },
    requiresApiKey: false,
  },
  {
    id: 'groq',
    name: 'Groq',
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      audioGeneration: false,
      codeGeneration: true,
      functionCalling: true,
      streaming: true,
      embeddings: false,
    },
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', contextWindow: 128000, maxOutputTokens: 32768, capabilities: ['chat', 'code'], recommended: true, deprecated: false, bestFor: ['fast-inference', 'general'] },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', contextWindow: 32768, maxOutputTokens: 32768, capabilities: ['chat', 'code'], recommended: true, deprecated: false, bestFor: ['balanced', 'multilingual'] },
    ],
    rateLimits: { requestsPerMinute: 30, tokensPerMinute: 50000, tokensPerDay: 500000 },
    pricing: { inputTokens: 0.05, outputTokens: 0.08 },
    requiresApiKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      audioGeneration: false,
      codeGeneration: true,
      functionCalling: true,
      streaming: true,
      embeddings: true,
    },
    models: [
      { id: 'openrouter/auto', name: 'Auto Router', contextWindow: 128000, maxOutputTokens: 16384, capabilities: ['chat', 'vision', 'code'], recommended: true, deprecated: false, bestFor: ['auto-selection'] },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['chat', 'vision', 'code'], recommended: true, deprecated: false, bestFor: ['analysis', 'writing'] },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1000000, maxOutputTokens: 8192, capabilities: ['chat', 'vision', 'code'], recommended: true, deprecated: false, bestFor: ['long-context', 'multimodal'] },
    ],
    rateLimits: { requestsPerMinute: 60, tokensPerMinute: 200000, tokensPerDay: 2000000 },
    pricing: { inputTokens: 0.25, outputTokens: 0.75 },
    requiresApiKey: true,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      audioGeneration: false,
      codeGeneration: true,
      functionCalling: true,
      streaming: true,
      embeddings: true,
    },
    models: [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 1000000, maxOutputTokens: 8192, capabilities: ['chat', 'vision', 'code'], recommended: true, deprecated: false, bestFor: ['multimodal', 'long-context', 'analysis'] },
    ],
    rateLimits: { requestsPerMinute: 60, tokensPerMinute: 200000, tokensPerDay: 2000000 },
    pricing: { inputTokens: 0, outputTokens: 0 },
    requiresApiKey: true,
  },
  {
    id: 'githubmodels',
    name: 'GitHub Models',
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      audioGeneration: false,
      codeGeneration: true,
      functionCalling: true,
      streaming: true,
      embeddings: false,
    },
    models: [
      { id: 'openai/gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxOutputTokens: 16384, capabilities: ['chat', 'code'], recommended: true, deprecated: false, bestFor: ['general', 'coding'] },
    ],
    rateLimits: { requestsPerMinute: 60, tokensPerMinute: 120000, tokensPerDay: 1000000 },
    pricing: { inputTokens: 0, outputTokens: 0 },
    requiresApiKey: true,
  },
  {
    id: 'bytez',
    name: 'Bytez',
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      audioGeneration: false,
      codeGeneration: true,
      functionCalling: true,
      streaming: true,
      embeddings: false,
    },
    models: [
      { id: 'Qwen/Qwen3-4B', name: 'Qwen 3 4B', contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['chat', 'code'], recommended: true, deprecated: false, bestFor: ['fast-chat', 'general'] },
    ],
    rateLimits: { requestsPerMinute: 60, tokensPerMinute: 120000, tokensPerDay: 1000000 },
    pricing: { inputTokens: 0.2, outputTokens: 0.4 },
    requiresApiKey: true,
  },
  {
    id: 'poe',
    name: 'Poe',
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      audioGeneration: false,
      codeGeneration: true,
      functionCalling: true,
      streaming: true,
      embeddings: false,
    },
    models: [
      { id: 'Claude-Sonnet-4.6', name: 'Claude Sonnet 4.6', contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['chat', 'vision', 'code'], recommended: true, deprecated: false, bestFor: ['writing', 'analysis'] },
    ],
    rateLimits: { requestsPerMinute: 60, tokensPerMinute: 120000, tokensPerDay: 1000000 },
    pricing: { inputTokens: 0.3, outputTokens: 0.7 },
    requiresApiKey: true,
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      audioGeneration: false,
      codeGeneration: true,
      functionCalling: true,
      streaming: true,
      embeddings: true,
    },
    models: [
      { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B', contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['chat', 'code'], recommended: true, deprecated: false, bestFor: ['instruction-following'] },
    ],
    rateLimits: { requestsPerMinute: 20, tokensPerMinute: 40000, tokensPerDay: 400000 },
    pricing: { inputTokens: 0.35, outputTokens: 0.40 },
    requiresApiKey: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    capabilities: {
      chat: true,
      vision: false,
      imageGeneration: false,
      audioGeneration: false,
      codeGeneration: true,
      functionCalling: true,
      streaming: true,
      embeddings: false,
    },
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 64000, maxOutputTokens: 8192, capabilities: ['chat', 'code'], recommended: true, deprecated: false, bestFor: ['reasoning', 'code'] },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', contextWindow: 64000, maxOutputTokens: 8192, capabilities: ['code'], recommended: true, deprecated: false, bestFor: ['code-generation'] },
    ],
    rateLimits: { requestsPerMinute: 60, tokensPerMinute: 100000, tokensPerDay: 1000000 },
    pricing: { inputTokens: 0.14, outputTokens: 0.28 },
    requiresApiKey: true,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    capabilities: {
      chat: true,
      vision: true,
      imageGeneration: false,
      audioGeneration: false,
      codeGeneration: true,
      functionCalling: false,
      streaming: true,
      embeddings: true,
    },
    models: [
      { id: 'ollama/llama3.2', name: 'Llama 3.2 (Local)', contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['chat', 'code'], recommended: true, deprecated: false, bestFor: ['privacy', 'offline'] },
      { id: 'ollama/mistral', name: 'Mistral (Local)', contextWindow: 32000, maxOutputTokens: 4096, capabilities: ['chat', 'code'], recommended: true, deprecated: false, bestFor: ['fast-local'] },
      { id: 'ollama/codellama', name: 'Code Llama (Local)', contextWindow: 16000, maxOutputTokens: 4096, capabilities: ['code'], recommended: true, deprecated: false, bestFor: ['code-generation'] },
    ],
    rateLimits: { requestsPerMinute: 1000, tokensPerMinute: 1000000, tokensPerDay: 100000000 },
    pricing: { inputTokens: 0, outputTokens: 0 },
    requiresApiKey: false,
  },
];

// Load all provider capabilities with current status
export async function loadProviderCapabilities(): Promise<ProviderCapability[]> {
  const capabilities: ProviderCapability[] = [];

  for (const provider of PROVIDER_DEFINITIONS) {
    const apiKeyConfigured = await checkApiKeyConfigured(provider.id);
    const status = await getProviderStatus(provider.id);

    capabilities.push({
      ...provider,
      apiKeyConfigured,
      status: status.status,
      lastHealthCheck: status.lastCheck,
    });
  }

  return capabilities;
}

// Check if API key is configured for provider
async function checkApiKeyConfigured(providerId: string): Promise<boolean> {
  const keyMap: Record<string, string> = {
    groq: 'groq_key',
    openrouter: 'openrouter_key',
    githubmodels: 'github_models_key',
    bytez: 'bytez_key',
    poe: 'poe_key',
    nvidia: 'nvidia_key',
    deepseek: 'deepseek_key',
    gemini: 'gemini_key',
    together: 'together_key',
    fireworks: 'fireworks_key',
  };

  const keyName = keyMap[providerId];
  if (!keyName) return true; // No key required

  const key = sanitizeApiKey(await kvGet(keyName));
  return key.length > 0;
}

// Get provider health status
async function getProviderStatus(providerId: string): Promise<{ status: ProviderCapability['status']; lastCheck: string }> {
  try {
    const statusData = await kvGet(`provider_status_${providerId}`);
    if (statusData) {
      return JSON.parse(statusData);
    }
  } catch {}

  return { status: 'unknown', lastCheck: new Date().toISOString() };
}

// Health check a provider
export async function healthCheckProvider(providerId: string): Promise<ProviderCapability['status']> {
  const provider = PROVIDER_DEFINITIONS.find(p => p.id === providerId);
  if (!provider) return 'offline';

  let status: ProviderCapability['status'] = 'healthy';

  // Check if key is configured for providers that need it
  if (provider.requiresApiKey) {
    const keyConfigured = await checkApiKeyConfigured(providerId);
    if (!keyConfigured) {
      status = 'offline';
    }
  }

  // For Ollama, check if local server is running
  if (providerId === 'ollama') {
    try {
      const ollamaUrl = await kvGet('ollama_url') || 'http://localhost:11434';
      const response = await fetch(`${ollamaUrl}/api/tags`, { 
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      status = response.ok ? 'healthy' : 'offline';
    } catch {
      status = 'offline';
    }
  }

  // Save status
  await kvSet(`provider_status_${providerId}`, JSON.stringify({
    status,
    lastCheck: new Date().toISOString(),
  }));

  return status;
}

// Health check all providers
export async function healthCheckAllProviders(): Promise<Record<string, ProviderCapability['status']>> {
  const results: Record<string, ProviderCapability['status']> = {};

  for (const provider of PROVIDER_DEFINITIONS) {
    results[provider.id] = await healthCheckProvider(provider.id);
  }

  return results;
}

// Get recommended model for task type
export function getRecommendedModel(
  taskType: 'chat' | 'vision' | 'code' | 'creative' | 'analysis' | 'fast',
  providers: ProviderCapability[]
): { providerId: string; modelId: string } | null {
  return pickRecommendedModel(taskType, providers);
}

// Track usage
export async function trackUsage(
  providerId: string,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  taskType: string
): Promise<void> {
  const provider = PROVIDER_DEFINITIONS.find(p => p.id === providerId);
  if (!provider) return;

  const cost = (inputTokens / 1000) * provider.pricing.inputTokens +
               (outputTokens / 1000) * provider.pricing.outputTokens;

  const record: UsageRecord = {
    providerId,
    modelId,
    inputTokens,
    outputTokens,
    cost,
    timestamp: new Date().toISOString(),
    taskType,
  };

  // Append to usage log
  const today = new Date().toISOString().split('T')[0];
  const usageKey = `usage_${today}`;
  const existingData = await kvGet(usageKey);
  const records: UsageRecord[] = existingData ? JSON.parse(existingData) : [];
  records.push(record);
  await kvSet(usageKey, JSON.stringify(records));

  // Update daily totals
  const dailyTotalKey = `usage_total_${today}`;
  const existingTotal = await kvGet(dailyTotalKey);
  const total = existingTotal ? parseFloat(existingTotal) : 0;
  await kvSet(dailyTotalKey, String(total + cost));
}

// Get usage for date range
export async function getUsageStats(startDate: string, endDate: string): Promise<{
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  byProvider: Record<string, { cost: number; requests: number }>;
  byTaskType: Record<string, number>;
}> {
  const stats = {
    totalCost: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    byProvider: {} as Record<string, { cost: number; requests: number }>,
    byTaskType: {} as Record<string, number>,
  };

  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    const usageKey = `usage_${dateStr}`;
    const data = await kvGet(usageKey);

    if (data) {
      const records: UsageRecord[] = JSON.parse(data);
      for (const record of records) {
        stats.totalCost += record.cost;
        stats.totalInputTokens += record.inputTokens;
        stats.totalOutputTokens += record.outputTokens;

        if (!stats.byProvider[record.providerId]) {
          stats.byProvider[record.providerId] = { cost: 0, requests: 0 };
        }
        stats.byProvider[record.providerId].cost += record.cost;
        stats.byProvider[record.providerId].requests += 1;

        stats.byTaskType[record.taskType] = (stats.byTaskType[record.taskType] || 0) + 1;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return stats;
}

// Load usage budget
export async function loadUsageBudget(): Promise<UsageBudget> {
  try {
    const budget = await readFile<UsageBudget>(`${PATHS.settings}/usage-budget.json`);
    return budget || { dailyLimit: 10, monthlyLimit: 100, warningThreshold: 80, hardLimit: false };
  } catch {
    return { dailyLimit: 10, monthlyLimit: 100, warningThreshold: 80, hardLimit: false };
  }
}

// Save usage budget
export async function saveUsageBudget(budget: UsageBudget): Promise<boolean> {
  return writeFile(`${PATHS.settings}/usage-budget.json`, budget);
}

// Check if within budget
export async function checkBudget(): Promise<{
  withinDailyLimit: boolean;
  withinMonthlyLimit: boolean;
  dailyUsage: number;
  monthlyUsage: number;
  dailyLimit: number;
  monthlyLimit: number;
  warningTriggered: boolean;
}> {
  const budget = await loadUsageBudget();
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.substring(0, 7) + '-01';

  const dailyTotal = await kvGet(`usage_total_${today}`);
  const dailyUsage = dailyTotal ? parseFloat(dailyTotal) : 0;

  // Calculate monthly usage
  let monthlyUsage = 0;
  const current = new Date(monthStart);
  const now = new Date();
  while (current <= now) {
    const dateStr = current.toISOString().split('T')[0];
    const dayTotal = await kvGet(`usage_total_${dateStr}`);
    if (dayTotal) monthlyUsage += parseFloat(dayTotal);
    current.setDate(current.getDate() + 1);
  }

  return {
    withinDailyLimit: dailyUsage < budget.dailyLimit,
    withinMonthlyLimit: monthlyUsage < budget.monthlyLimit,
    dailyUsage,
    monthlyUsage,
    dailyLimit: budget.dailyLimit,
    monthlyLimit: budget.monthlyLimit,
    warningTriggered: (dailyUsage / budget.dailyLimit) * 100 >= budget.warningThreshold ||
                      (monthlyUsage / budget.monthlyLimit) * 100 >= budget.warningThreshold,
  };
}
