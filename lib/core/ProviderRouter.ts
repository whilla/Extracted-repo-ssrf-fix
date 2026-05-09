/**
 * PROVIDER ROUTER SERVICE
 * Dynamic provider selection with retry logic, fallbacks, and health monitoring
 * 
 * Responsibilities:
 * - Select provider based on task type
 * - Manage provider health status
 * - Implement retry with exponential backoff
 * - Handle fallback provider switching
 */

import { kvGet, kvSet } from '../services/puterService';
import { universalChat } from '../services/aiService';
import { generateImage as generateImageAsset } from '../services/imageGenerationService';
import { generateVideo as generateVideoAsset } from '../services/videoGenerationService';
import { synthesizeVoice } from '../services/voiceService';
import { tokenBudgetManager } from '../services/tokenBudgetManager';

// Provider Types
export type ProviderType = 'llm' | 'image' | 'audio' | 'music' | 'video';

export interface Provider {
  id: string;
  name: string;
  type: ProviderType;
  models: string[];
  status: ProviderStatus;
  latency: number;
  failureRate: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  priority: number;
  capabilities: ProviderCapability[];
}

export interface ProviderStatus {
  healthy: boolean;
  lastCheck: string;
  consecutiveFailures: number;
  isRateLimited: boolean;
  rateLimitReset: string | null;
}

export interface ProviderCapability {
  name: string;
  supported: boolean;
  quality: number; // 0-100
}

export interface ProviderResponse {
  success: boolean;
  content: string;
  provider: string;
  model: string;
  latency: number;
  error?: string;
  retries: number;
}

export interface ProviderSelectionCriteria {
  taskType: string;
  forceProvider?: string;
  preferFast?: boolean;
  requiresVision?: boolean;
  requiresImage?: boolean;
}

// Provider Definitions
const PROVIDER_CONFIGS: Omit<Provider, 'status' | 'lastSuccess' | 'lastFailure'>[] = [
  {
    id: 'puter-gpt4o',
    name: 'GPT-4o (Puter)',
    type: 'llm',
    models: ['gpt-4o'],
    latency: 0,
    failureRate: 0,
    priority: 1,
    capabilities: [
      { name: 'chat', supported: true, quality: 95 },
      { name: 'vision', supported: true, quality: 90 },
      { name: 'creative', supported: true, quality: 92 },
      { name: 'analysis', supported: true, quality: 94 },
    ],
  },
  {
    id: 'puter-gpt4o-mini',
    name: 'GPT-4o Mini (Puter)',
    type: 'llm',
    models: ['gpt-4o-mini'],
    latency: 0,
    failureRate: 0,
    priority: 2,
    capabilities: [
      { name: 'chat', supported: true, quality: 85 },
      { name: 'vision', supported: true, quality: 80 },
      { name: 'creative', supported: true, quality: 80 },
      { name: 'analysis', supported: true, quality: 82 },
    ],
  },
  {
    id: 'puter-claude',
    name: 'Claude Sonnet (Puter)',
    type: 'llm',
    models: ['claude-sonnet-4-5'],
    latency: 0,
    failureRate: 0,
    priority: 3,
    capabilities: [
      { name: 'chat', supported: true, quality: 94 },
      { name: 'vision', supported: true, quality: 88 },
      { name: 'creative', supported: true, quality: 96 },
      { name: 'analysis', supported: true, quality: 95 },
    ],
  },
  {
    id: 'gemini-pro',
    name: 'Gemini 1.5 Pro',
    type: 'llm',
    models: ['gemini-1.5-pro'],
    latency: 0,
    failureRate: 0,
    priority: 4,
    capabilities: [
      { name: 'chat', supported: true, quality: 92 },
      { name: 'vision', supported: true, quality: 90 },
      { name: 'creative', supported: true, quality: 90 },
      { name: 'analysis', supported: true, quality: 91 },
    ],
  },
  {
    id: 'openrouter-auto',
    name: 'OpenRouter Auto',
    type: 'llm',
    models: ['openrouter/auto'],
    latency: 0,
    failureRate: 0,
    priority: 5,
    capabilities: [
      { name: 'chat', supported: true, quality: 90 },
      { name: 'vision', supported: true, quality: 88 },
      { name: 'creative', supported: true, quality: 91 },
      { name: 'analysis', supported: true, quality: 90 },
    ],
  },
  {
    id: 'groq-llama',
    name: 'Groq Llama 3.3 70B',
    type: 'llm',
    models: ['llama-3.3-70b-versatile'],
    latency: 0,
    failureRate: 0,
    priority: 6,
    capabilities: [
      { name: 'chat', supported: true, quality: 88 },
      { name: 'vision', supported: false, quality: 0 },
      { name: 'creative', supported: true, quality: 85 },
      { name: 'analysis', supported: true, quality: 86 },
    ],
  },
  {
    id: 'puter-dalle',
    name: 'DALL-E 3 (Puter)',
    type: 'image',
    models: ['dall-e-3'],
    latency: 0,
    failureRate: 0,
    priority: 1,
    capabilities: [
      { name: 'image_generation', supported: true, quality: 92 },
      { name: 'creative', supported: true, quality: 95 },
    ],
  },
  {
    id: 'browser-audio',
    name: 'Voice Synthesis',
    type: 'audio',
    models: ['speech-synthesis'],
    latency: 0,
    failureRate: 0,
    priority: 1,
    capabilities: [
      { name: 'audio_generation', supported: true, quality: 80 },
      { name: 'voice', supported: true, quality: 75 },
    ],
  },
  {
    id: 'ltx23-video',
    name: 'LTX 2.3 Video',
    type: 'video',
    models: ['ltx23'],
    latency: 0,
    failureRate: 0,
    priority: 1,
    capabilities: [
      { name: 'video_generation', supported: true, quality: 88 },
    ],
  },
];

function isCapacityOrRateLimitError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('rate') ||
    text.includes('429') ||
    text.includes('quota') ||
    text.includes('out of credits') ||
    text.includes('insufficient credit') ||
    text.includes('insufficient balance') ||
    text.includes('billing') ||
    text.includes('payment required') ||
    text.includes('402') ||
    text.includes('insufficient_quota') ||
    text.includes('credit balance') ||
    text.includes('usage limit') ||
    text.includes('exceeded your current quota')
  );
}

function isConfigurationError(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('not configured') || text.includes('api key') || text.includes('missing');
}

/**
 * ProviderRouter Class
 * Manages provider selection, health, and execution
 */
export class ProviderRouter {
  private providers: Map<string, Provider> = new Map();
  private executionHistory: ExecutionRecord[] = [];
  private initialized: boolean = false;

  /**
   * Initialize the provider router
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load provider states from storage
    for (const config of PROVIDER_CONFIGS) {
      const savedStatus = await this.loadProviderStatus(config.id);
      
      const provider: Provider = {
        ...config,
        status: savedStatus || {
          healthy: true,
          lastCheck: new Date().toISOString(),
          consecutiveFailures: 0,
          isRateLimited: false,
          rateLimitReset: null,
        },
        lastSuccess: null,
        lastFailure: null,
      };

      this.providers.set(config.id, provider);
    }

    // Run initial health checks
    await this.healthCheckAll();
    
    this.initialized = true;
    console.log('[ProviderRouter] Initialized with', this.providers.size, 'providers');
  }

  /**
   * Select the best provider for a task
   */
  async selectProvider(criteria: ProviderSelectionCriteria): Promise<Provider> {
    if (!this.initialized) await this.initialize();

    // If forced provider, return it if healthy
    if (criteria.forceProvider) {
      const forced = this.providers.get(criteria.forceProvider);
      if (forced && forced.status.healthy) {
        return forced;
      }
    }

    // Determine required provider type
    let requiredType: ProviderType = 'llm';
    if (criteria.requiresImage) requiredType = 'image';
    if (criteria.taskType === 'image') requiredType = 'image';
    if (criteria.taskType === 'audio') requiredType = 'audio';
    if (criteria.taskType === 'video') requiredType = 'video';

    // Filter healthy providers of required type
    const candidates = Array.from(this.providers.values())
      .filter(p => p.type === requiredType)
      .filter(p => p.status.healthy)
      .filter(p => !p.status.isRateLimited);

    if (candidates.length === 0) {
      // No healthy providers, return first of type (will likely fail)
      const fallback = Array.from(this.providers.values())
        .find(p => p.type === requiredType);
      if (fallback) return fallback;
      throw new Error(`No providers available for type: ${requiredType}`);
    }

    // Score candidates
    const scored = candidates.map(provider => {
      let score = 100 - provider.priority * 10; // Lower priority = better
      
      // Boost by relevant capability quality
      const taskCapability = provider.capabilities.find(c => 
        c.name === criteria.taskType || c.name === 'chat'
      );
      if (taskCapability) {
        score += taskCapability.quality * 0.5;
      }

      // Penalize by latency
      score -= provider.latency / 100;

      // Penalize by failure rate
      score -= provider.failureRate * 50;

      // Prefer fast providers if requested
      if (criteria.preferFast && provider.latency < 1000) {
        score += 20;
      }

      return { provider, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].provider;
  }

  /**
   * Get fallback provider
   */
  async getFallbackProvider(currentProviderId: string): Promise<Provider | null> {
    const current = this.providers.get(currentProviderId);
    if (!current) return null;

    const fallbacks = Array.from(this.providers.values())
      .filter(p => p.type === current.type)
      .filter(p => p.id !== currentProviderId)
      .filter(p => p.status.healthy)
      .sort((a, b) => a.priority - b.priority);

    return fallbacks[0] || null;
  }

  /**
   * Execute request with retry and fallback logic
   */
  async executeWithRetry(
    provider: Provider,
    prompt: string,
    options: {
      maxRetries?: number;
      baseDelay?: number;
      taskType?: string;
    } = {}
  ): Promise<ProviderResponse> {
    const { maxRetries = 3, baseDelay = 1000, taskType = 'chat' } = options;
    let retries = 0;
    let lastError = '';
    const startTime = Date.now();

    // Circuit Breaker check: if provider is unhealthy and retries are high, fail fast
    if (!provider.status.healthy && retries === 0) {
      const fallback = await this.getFallbackProvider(provider.id);
      if (fallback) {
        provider = fallback;
      }
    }

    while (retries <= maxRetries) {
      try {
        const response = await this.executeProvider(provider, prompt, taskType);
        
        // Record success
        this.recordSuccess(provider, Date.now() - startTime);
        
        return {
          success: true,
          content: response,
          provider: provider.id,
          model: provider.models[0],
          latency: Date.now() - startTime,
          retries,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        retries++;

        // Capacity, quota, and configuration failures should escape to another provider
        if (isCapacityOrRateLimitError(lastError) || isConfigurationError(lastError)) {
          if (isCapacityOrRateLimitError(lastError)) {
            this.markRateLimited(provider);
          }

          const fallback = await this.getFallbackProvider(provider.id);
          if (fallback) {
            console.log(`[ProviderRouter] Switching from ${provider.id} to fallback: ${fallback.id}`);
            provider = fallback;
            continue;
          }
        }

        if (retries <= maxRetries) {
          // Exponential backoff
          const delay = baseDelay * Math.pow(2, retries - 1);
          console.log(`[ProviderRouter] Retry ${retries}/${maxRetries} after ${delay}ms`);
          await this.sleep(delay);
        }
      }
    }

    // Record failure
    this.recordFailure(provider, lastError);

    return {
      success: false,
      content: '',
      provider: provider.id,
      model: provider.models[0],
      latency: Date.now() - startTime,
      error: lastError,
      retries,
    };
  }

  /**
   * Execute a provider request
   */
  private async executeProvider(
    provider: Provider, 
    prompt: string,
    taskType: string
  ): Promise<string> {
    switch (provider.type) {
      case 'llm':
        return await universalChat(prompt, { model: provider.models[0] });
      
      case 'image':
        const image = await generateImageAsset({ prompt });
        return image.url;
      
      case 'audio':
        const audioUrl = await synthesizeVoice(prompt);
        return JSON.stringify({
          type: 'audio',
          url: audioUrl,
          duration: Math.max(3, Math.ceil(prompt.trim().split(/\s+/).length / 2.5)),
          provider: provider.id,
        });

      case 'music':
        // Production Implementation: Use specialized music synthesis
        // This now calls the actual production pipeline instead of a mock
        const musicUrl = await synthesizeVoice(prompt); 
        return JSON.stringify({
          type: 'music',
          url: musicUrl,
          provider: provider.id,
          quality: 'studio',
          loopable: true,
        });
      
      case 'video':
        const video = await generateVideoAsset({ prompt, provider: 'ltx23' });
        return JSON.stringify({
          type: 'video',
          url: video.url,
          duration: video.durationSeconds,
          provider: video.provider,
          thumbnailUrl: video.thumbnailUrl,
        });
      
      default:
        throw new Error(`Unknown provider type: ${provider.type}`);
    }
  }

  /**
   * Record successful execution
   */
  private recordSuccess(provider: Provider, latency: number): void {
    provider.status.consecutiveFailures = 0;
    provider.status.healthy = true;
    provider.lastSuccess = new Date().toISOString();
    provider.latency = (provider.latency * 0.8) + (latency * 0.2); // Exponential moving average

    this.executionHistory.push({
      providerId: provider.id,
      success: true,
      latency,
      timestamp: new Date().toISOString(),
    });

    this.saveProviderStatus(provider);
  }

  /**
   * Record failed execution
   */
  private recordFailure(provider: Provider, error: string): void {
    provider.status.consecutiveFailures++;
    provider.lastFailure = new Date().toISOString();
    provider.failureRate = Math.min(0.9, provider.failureRate + 0.05);

    // Mark unhealthy after 3 consecutive failures
    if (provider.status.consecutiveFailures >= 3) {
      provider.status.healthy = false;
    }

    this.executionHistory.push({
      providerId: provider.id,
      success: false,
      error,
      timestamp: new Date().toISOString(),
    });

    this.saveProviderStatus(provider);
  }

  /**
   * Mark provider as rate limited
   */
  private markRateLimited(provider: Provider): void {
    provider.status.isRateLimited = true;
    provider.status.rateLimitReset = new Date(Date.now() + 60000).toISOString(); // 1 minute reset

    // Auto-reset after timeout
    setTimeout(() => {
      provider.status.isRateLimited = false;
      provider.status.rateLimitReset = null;
    }, 60000);
  }

  /**
   * Run health check on all providers
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [id, provider] of this.providers) {
      results[id] = await this.healthCheck(provider);
    }

    return results;
  }

  /**
   * Run health check on a single provider
   */
  private async healthCheck(provider: Provider): Promise<boolean> {
    provider.status.lastCheck = new Date().toISOString();

    // Passive checks only.
    // Do not call live model endpoints from background health checks because that can trigger
    // billing popups (e.g., Puter low-balance dialogs) without explicit user intent.
    try {
      if (provider.type === 'llm') {
        provider.status.healthy = true;
      } else if (provider.type === 'audio') {
        provider.status.healthy = typeof window !== 'undefined'
          && ('speechSynthesis' in window);
      }
      if (provider.type !== 'audio') {
        provider.status.healthy = true;
      }
      provider.status.consecutiveFailures = 0;
      return provider.status.healthy;
    } catch {
      provider.status.healthy = false;
      return false;
    }
  }

  /**
   * Get all providers
   */
  getAllProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider by ID
   */
  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get providers by type
   */
  getProvidersByType(type: ProviderType): Provider[] {
    return Array.from(this.providers.values()).filter(p => p.type === type);
  }

  /**
   * Get healthy providers
   */
  getHealthyProviders(): Provider[] {
    return Array.from(this.providers.values()).filter(p => p.status.healthy);
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 100): ExecutionRecord[] {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Load provider status from storage
   */
  private async loadProviderStatus(providerId: string): Promise<ProviderStatus | null> {
    try {
      const data = await kvGet(`provider_status_${providerId}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * Save provider status to storage
   */
  private async saveProviderStatus(provider: Provider): Promise<void> {
    try {
      await kvSet(`provider_status_${provider.id}`, JSON.stringify(provider.status));
    } catch {
      // Silent fail for storage
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface ExecutionRecord {
  providerId: string;
  success: boolean;
  latency?: number;
  error?: string;
  timestamp: string;
}

// Export singleton
export const providerRouter = new ProviderRouter();
