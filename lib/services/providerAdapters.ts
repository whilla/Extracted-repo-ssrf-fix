// AI Provider Adapter Pattern implementation
import type { AIMessage, AIModel, BrandKit } from '@/lib/types';
import { universalChat, chatWithPuter } from './aiService';

export interface AIProviderAdapter {
  id: string;
  chat(messages: AIMessage[], options: AdapterOptions): Promise<string>;
  supportsVision: boolean;
}

export interface AdapterOptions {
  model: string;
  brandKit?: BrandKit | null;
  memoryContext?: string;
}

/**
 * PuterProvider handles the native Puter.ai integration
 */
export class PuterProvider implements AIProviderAdapter {
  id = 'puter';
  supportsVision = true;
  async chat(messages: AIMessage[], options: AdapterOptions): Promise<string> {
    return chatWithPuter(messages, { 
      model: options.model, 
      brandKit: options.brandKit, 
      memoryContext: options.memoryContext 
    });
  }
}

/**
 * GenericProvider handles all OpenAI-compatible and proxied providers
 */
export class GenericProvider implements AIProviderAdapter {
  constructor(public id: string) {}
  supportsVision = false; // Determined by model in actual config

  async chat(messages: AIMessage[], options: AdapterOptions): Promise<string> {
    return universalChat(messages, { 
      model: options.model, 
      brandKit: options.brandKit 
    });
  }
}

/**
 * ProviderRegistry manages the lifecycle of AI adapters
 */
export class ProviderRegistry {
  private adapters = new Map<string, AIProviderAdapter>();

  constructor() {
    this.registerDefaultAdapters();
  }

  private registerDefaultAdapters() {
    this.adapters.set('puter', new PuterProvider());
    // Other providers use the GenericProvider as they are currently routed through universalChat
    const genericProviders = ['gemini', 'groq', 'openrouter', 'githubmodels', 'bytez', 'poe', 'nvidia', 'together', 'fireworks', 'ollama', 'deepseek'];
    genericProviders.forEach(id => this.adapters.set(id, new GenericProvider(id)));
  }

  getAdapter(providerId: string): AIProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw new Error(`No adapter registered for provider: ${providerId}`);
    return adapter;
  }
}

export const providerRegistry = new ProviderRegistry();
