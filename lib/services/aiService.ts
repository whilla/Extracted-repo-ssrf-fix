// AI Service - Multi-model support with retry logic
import type { AIMessage, AIMessageContent, AIModel, BrandKit } from '@/lib/types';
import { buildSystemPrompt, IMAGE_QUALITY_PROMPT, IMAGE_NEGATIVE_PROMPT } from '@/lib/constants/prompts';
import { kvGet } from './puterService';
import { buildMemoryContext } from './agentMemoryService';
import { waitForPuter } from './puterService';
import { buildFallbackProviders, type RoutedProvider } from './providerFallback';
import { sanitizeApiKey } from './providerCredentialUtils';
import {
  dispatchProviderEvent,
  isPuterFallbackDisabled,
  resolveProviderForModel,
  setActiveChatModel,
  setPuterFallbackDisabled,
} from './providerControl';
import { providerRegistry } from './providerAdapters';
import { ToolRegistry, getToolDefinitionsPrompt } from './toolRegistry';

// Available models - including custom provider options
export const AVAILABLE_MODELS: AIModel[] = [
  // Puter native models (free) - GPT-5.5 and Claude
  { provider: 'puter', model: 'gpt-5.5', name: 'GPT-5.5 Pro (Puter)', contextWindow: 256000, supportsVision: true },
  { provider: 'puter', model: 'gpt-4o', name: 'GPT-4o (Puter)', contextWindow: 128000, supportsVision: true },
  { provider: 'puter', model: 'gpt-4o-mini', name: 'GPT-4o Mini (Puter)', contextWindow: 128000, supportsVision: true },
  { provider: 'puter', model: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', contextWindow: 200000, supportsVision: true },
  { provider: 'puter', model: 'claude-opus-4', name: 'Claude Opus 4', contextWindow: 200000, supportsVision: true },
  // GitHub Models - Full list from models.github.ai
  { provider: 'githubmodels', model: 'openai/gpt-5', name: 'GPT-5 (GitHub)', contextWindow: 256000, supportsVision: true },
  { provider: 'githubmodels', model: 'openai/gpt-4.5', name: 'GPT-4.5 (GitHub)', contextWindow: 256000, supportsVision: true },
  { provider: 'githubmodels', model: 'openai/gpt-4o', name: 'GPT-4o (GitHub)', contextWindow: 128000, supportsVision: true },
  { provider: 'githubmodels', model: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (GitHub)', contextWindow: 128000, supportsVision: true },
  { provider: 'githubmodels', model: 'anthropic/claude-3.5-sonnet', name: 'Claude Sonnet (GitHub)', contextWindow: 200000, supportsVision: true },
  { provider: 'githubmodels', model: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B (GitHub)', contextWindow: 128000, supportsVision: false },
  { provider: 'githubmodels', model: 'meta-llama/Llama-3.1-405B-Instruct', name: 'Llama 3.1 405B (GitHub)', contextWindow: 128000, supportsVision: false },
  { provider: 'githubmodels', model: 'microsoft/Phi-4-mini', name: 'Phi-4 Mini (GitHub)', contextWindow: 128000, supportsVision: false },
  { provider: 'githubmodels', model: 'deepseek/DeepSeek-V3', name: 'DeepSeek V3 (GitHub)', contextWindow: 64000, supportsVision: false },
  { provider: 'githubmodels', model: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B (GitHub)', contextWindow: 32000, supportsVision: false },
  { provider: 'githubmodels', model: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (GitHub)', contextWindow: 1000000, supportsVision: true },
  // Custom key providers
  { provider: 'gemini', model: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', contextWindow: 1000000, supportsVision: true },
  { provider: 'gemini', model: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 1000000, supportsVision: true },
  { provider: 'openrouter', model: 'openrouter/auto', name: 'OpenRouter Auto', contextWindow: 128000, supportsVision: true },
  { provider: 'bytez', model: 'Qwen/Qwen3-4B', name: 'Bytez Qwen 3 4B', contextWindow: 128000, supportsVision: false },
  { provider: 'poe', model: 'Claude-Sonnet-4.6', name: 'Poe Claude Sonnet 4.6', contextWindow: 200000, supportsVision: true },
  { provider: 'groq', model: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', contextWindow: 128000, supportsVision: false },
  { provider: 'groq', model: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Groq)', contextWindow: 32768, supportsVision: false },
  { provider: 'nvidia', model: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B (NVIDIA)', contextWindow: 128000, supportsVision: false },
  { provider: 'deepseek', model: 'deepseek-chat', name: 'DeepSeek Chat', contextWindow: 64000, supportsVision: false },
  { provider: 'together', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B (Together)', contextWindow: 128000, supportsVision: false },
  { provider: 'fireworks', model: 'accounts/fireworks/models/llama-v3p1-70b-instruct', name: 'Llama 3.1 70B (Fireworks)', contextWindow: 128000, supportsVision: false },
  { provider: 'ollama', model: 'ollama/llama3.2', name: 'Llama 3.2 (Local)', contextWindow: 128000, supportsVision: false },
];

// Default model priority chain
const MODEL_PRIORITY = ['gpt-5.5', 'gpt-4o', 'claude-sonnet-4-5'];

const PROVIDER_DEFAULT_MODELS = {
  puter: ['gpt-5.5', 'gpt-4o', 'claude-sonnet-4-5', 'gpt-4o-mini'],
  openrouter: ['openrouter/auto'],
  githubmodels: ['openai/gpt-4.5', 'openai/gpt-4o', 'openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'meta-llama/Llama-3.3-70B-Instruct', 'meta-llama/Llama-3.1-405B-Instruct', 'microsoft/Phi-4-mini', 'deepseek/DeepSeek-V3', 'mistralai/Mixtral-8x7B-Instruct-v0.1'],
  poe: ['Claude-Sonnet-4.6'],
  bytez: ['Qwen/Qwen3-4B'],
  groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
  gemini: ['gemini-1.5-pro'],
  deepseek: ['deepseek-chat'],
  nvidia: ['nvidia/llama-3.1-nemotron-70b-instruct'],
  together: ['meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'],
  fireworks: ['accounts/fireworks/models/llama-v3p1-70b-instruct'],
  ollama: ['ollama/llama3.2'],
} as const;

const PROVIDER_KEY_CANDIDATES: Record<Exclude<RoutedProvider, 'puter' | 'ollama'>, string[]> = {
  openrouter: ['openrouter_key', 'provider_openrouter_apiKey'],
  githubmodels: ['github_models_key', 'provider_githubmodels_apiKey'],
  bytez: ['bytez_key', 'provider_bytez_apiKey'],
  poe: ['poe_key', 'provider_poe_apiKey'],
  groq: ['groq_key', 'provider_groq_apiKey'],
  gemini: ['gemini_key', 'provider_gemini_apiKey'],
  deepseek: ['deepseek_key', 'provider_deepseek_apiKey'],
  nvidia: ['nvidia_key', 'provider_nvidia_apiKey'],
  together: ['together_key', 'provider_together_apiKey'],
  fireworks: ['fireworks_key', 'provider_fireworks_apiKey'],
};

const providerCooldownUntil = new Map<RoutedProvider, number>();
const providerFailureCount = new Map<RoutedProvider, number>();
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;
const FAILURE_THRESHOLD = 3; // Trip circuit after 3 consecutive failures
const SERVER_PROVIDER_CACHE_MS = 30 * 1000;

type ServerProxyProvider = Exclude<RoutedProvider, 'puter' | 'ollama'>;

let serverConfiguredProvidersCache: {
  expiresAt: number;
  providers: ServerProxyProvider[];
} | null = null;

class ServerProxyError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ServerProxyError';
    this.status = status;
  }
}

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getFirstConfiguredValue(keys: string[]): Promise<string | null> {
  for (const key of keys) {
    const value = await kvGet(key);
    const sanitized = sanitizeApiKey(value);
    if (sanitized.length > 0) {
      return sanitized;
    }
  }
  return null;
}

async function getProviderApiKey(provider: Exclude<RoutedProvider, 'puter' | 'ollama'>): Promise<string | null> {
  return getFirstConfiguredValue(PROVIDER_KEY_CANDIDATES[provider]);
}

function isServerProxyProvider(value: string): value is ServerProxyProvider {
  return value in PROVIDER_KEY_CANDIDATES;
}

async function getServerConfiguredProviders(): Promise<ServerProxyProvider[]> {
  if (typeof window === 'undefined') return [];

  const now = Date.now();
  if (serverConfiguredProvidersCache && serverConfiguredProvidersCache.expiresAt > now) {
    return serverConfiguredProvidersCache.providers;
  }

  try {
    const response = await fetch('/api/ai/providers', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!response.ok) return [];

    const data = await response.json() as {
      providers?: Array<{ id?: string; configured?: boolean }>;
    };
    const providers = (data.providers || [])
      .filter((provider) => provider.configured && provider.id && isServerProxyProvider(provider.id))
      .map((provider) => provider.id as ServerProxyProvider);

    serverConfiguredProvidersCache = {
      expiresAt: now + SERVER_PROVIDER_CACHE_MS,
      providers,
    };
    return providers;
  } catch {
    return [];
  }
}

function buildMessageArray(
  messages: AIMessage[] | string,
  brandKit: BrandKit | null,
  memory: string
): AIMessage[] {
  if (typeof messages === 'string') {
    return [
      { role: 'system', content: buildSystemPrompt(brandKit, undefined, memory) },
      { role: 'user', content: messages }
    ];
  }

  if (messages.length === 0 || messages[0].role !== 'system') {
    return [
      { role: 'system', content: buildSystemPrompt(brandKit, undefined, memory) },
      ...messages
    ];
  }

  return messages;
}

function normalizeChatMessages(messages: AIMessage[]): Array<{ role: string; content: string | AIMessageContent[] }> {
  return messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) => {
            if (part.type === 'image_url') {
              return {
                type: 'image_url',
                image_url: { url: part.image_url?.url || '' },
              };
            }
            return {
              type: 'text',
              text: part.text || '',
            };
          }),
  }));
}

async function callServerChatProxy(
  provider: ServerProxyProvider,
  messages: AIMessage[],
  model: string
): Promise<string> {
  if (typeof window === 'undefined') {
    throw new ServerProxyError(0, 'Server proxy can only be called from the browser.');
  }

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      model,
      messages: normalizeChatMessages(messages),
    }),
  });
  const data = await response.json().catch(() => ({})) as { text?: string; error?: string };

  if (!response.ok) {
    throw new ServerProxyError(response.status, data.error || `Server proxy failed for ${provider}.`);
  }

  if (!data.text?.trim()) {
    throw new ServerProxyError(502, `Server proxy returned an empty response for ${provider}.`);
  }

  return data.text;
}

function canFallbackToBrowserProvider(error: unknown): boolean {
  return error instanceof ServerProxyError && (error.status === 0 || error.status === 404 || error.status === 501);
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

function isQuotaOrBillingError(message: string): boolean {
  const text = message.toLowerCase();
  return (
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

function isRetriableProviderError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    isQuotaOrBillingError(text) ||
    text.includes('rate') ||
    text.includes('429') ||
    text.includes('timeout') ||
    text.includes('temporar') ||
    text.includes('temporarily') ||
    text.includes('unavailable') ||
    text.includes('failed to fetch') ||
    text.includes('network') ||
    text.includes('503') ||
    text.includes('502') ||
    text.includes('500')
  );
}

function isConfigurationError(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('not configured') || text.includes('api key') || text.includes('missing');
}

function isProviderInCooldown(provider: RoutedProvider): boolean {
  const until = providerCooldownUntil.get(provider);
  if (!until) return false;
  if (Date.now() > until) {
    providerCooldownUntil.delete(provider);
    return false;
  }
  return true;
}

function applyProviderCooldown(provider: RoutedProvider, errorMessage: string): void {
  const failures = (providerFailureCount.get(provider) || 0) + 1;
  providerFailureCount.set(provider, failures);

  if (isQuotaOrBillingError(errorMessage) || failures >= FAILURE_THRESHOLD) {
    console.warn(`[CircuitBreaker] Tripping circuit for ${provider}. Failures: ${failures}. Reason: ${errorMessage}`);
    providerCooldownUntil.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
    // Reset failure count once cooldown is set
    providerFailureCount.set(provider, 0);
  }
}

type PuterChatStreamChunk = { text?: unknown };
type PuterChatResponse = { message?: { content?: unknown } };

function isAsyncIterableResponse(value: unknown): value is AsyncIterable<PuterChatStreamChunk> {
  return (
    !!value &&
    typeof value === 'object' &&
    Symbol.asyncIterator in (value as Record<PropertyKey, unknown>) &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
  );
}

function hasChatMessageResponse(value: unknown): value is { message: { content: string } } {
  if (!value || typeof value !== 'object') return false;
  const maybeMessage = (value as PuterChatResponse).message;
  return !!maybeMessage && typeof maybeMessage === 'object' && typeof maybeMessage.content === 'string';
}

async function callOpenAICompatibleChat(
  provider: ServerProxyProvider,
  url: string,
  apiKey: string | null,
  messages: AIMessage[],
  model: string,
  extraHeaders?: Record<string, string>
): Promise<string> {
  let serverProxyError: unknown = null;

  try {
    return await callServerChatProxy(provider, messages, model);
  } catch (error) {
    serverProxyError = error;
    if (isAbortError(error)) {
      throw new Error(`${provider} request timed out (30s). Try a different provider or check your connection.`);
    }
    if (!canFallbackToBrowserProvider(error) || !apiKey) {
      throw error;
    }
  }

  if (!apiKey) {
    const serverReason = serverProxyError instanceof Error ? ` Server proxy: ${serverProxyError.message}` : '';
    throw new Error(`${provider} API key not configured. Add it in Settings or configure the server provider environment key.${serverReason}`);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      // Add origin headers for server-side validation
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    },
    credentials: 'omit',
    body: JSON.stringify({
      model,
      messages: normalizeChatMessages(messages),
    }),
    signal: AbortSignal.timeout(30000), // 30 second timeout
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || data.output?.[0]?.content?.[0]?.text || '';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'AbortException' || error.name === 'TimeoutError');
}

async function getConfiguredProviders(): Promise<RoutedProvider[]> {
  const keyChecks = await Promise.all([
    getProviderApiKey('openrouter'),
    getProviderApiKey('githubmodels'),
    getProviderApiKey('bytez'),
    getProviderApiKey('poe'),
    getProviderApiKey('groq'),
    getProviderApiKey('gemini'),
    getProviderApiKey('deepseek'),
    getProviderApiKey('nvidia'),
    getProviderApiKey('together'),
    getProviderApiKey('fireworks'),
    kvGet('ollama_url'),
    getServerConfiguredProviders(),
  ]);

  const [
    openrouterKey,
    githubModelsKey,
    bytezKey,
    poeKey,
    groqKey,
    geminiKey,
    deepseekKey,
    nvidiaKey,
    togetherKey,
    fireworksKey,
    ollamaUrl,
    serverConfiguredProviders,
  ] = keyChecks;

  const configured = new Set<RoutedProvider>(['puter', ...serverConfiguredProviders]);
  if (openrouterKey) configured.add('openrouter');
  if (githubModelsKey) configured.add('githubmodels');
  if (bytezKey) configured.add('bytez');
  if (poeKey) configured.add('poe');
  if (groqKey) configured.add('groq');
  if (geminiKey) configured.add('gemini');
  if (deepseekKey) configured.add('deepseek');
  if (nvidiaKey) configured.add('nvidia');
  if (togetherKey) configured.add('together');
  if (fireworksKey) configured.add('fireworks');
  if (ollamaUrl) configured.add('ollama');
  return Array.from(configured);
}

// Retry with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  context = 'AI call'
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const message = lastError?.message || '';
      
      // Check if it's a rate limit error
      if (message.includes('rate') || message.includes('429') || message.includes('quota')) {
        if (i < maxRetries - 1) {
          const delay = 1000 * Math.pow(2, i); // 1s, 2s, 4s
          console.warn(`${context} rate limited, retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
      }
      
      // For other errors, throw immediately
      throw lastError;
    }
  }
  
  throw lastError;
}

// Chat with AI (Puter native)
export async function chatWithPuter(
  messages: AIMessage[] | string,
  optionsOrModel: string | {
    model?: string;
    brandKit?: BrandKit | null;
    stream?: boolean;
    memoryContext?: string;
    onChunk?: (text: string) => void;
  } = {}
): Promise<string> {
  const options = typeof optionsOrModel === 'string'
    ? { model: optionsOrModel }
    : optionsOrModel;
  const { model = 'gpt-5.5', brandKit = null, stream = false, memoryContext, onChunk } = options;

  const ready = await waitForPuter();
  if (typeof window === 'undefined' || !ready || !window.puter) {
    throw new Error('Puter not available');
  }

  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();

  // Build messages array
  let messageArray: AIMessage[];
  
  if (typeof messages === 'string') {
    messageArray = [
      { role: 'system', content: buildSystemPrompt(brandKit, undefined, memory) },
      { role: 'user', content: messages }
    ];
  } else {
    // Prepend system prompt if not present
    if (messages.length === 0 || messages[0].role !== 'system') {
      messageArray = [
        { role: 'system', content: buildSystemPrompt(brandKit, undefined, memory) },
        ...messages
      ];
    } else {
      messageArray = messages;
    }
  }

  return withRetry(async () => {
    if (stream) {
      // Streaming response
      const response = await window.puter.ai.chat(messageArray, { model, stream: true });
      
      // BUG FIX #4: Add proper error handling for streaming
      if (!response) {
        throw new Error(`[streamChatFromPuter] Empty response from model ${model}`);
      }
      
      if (!isAsyncIterableResponse(response)) {
        throw new Error(`[streamChatFromPuter] Response is not iterable. Expected async iterable, got ${typeof response}`);
      }
      
      let fullText = '';
      let chunkCount = 0;
      
      try {
        for await (const chunk of response) {
          if (!chunk) {
            console.warn('[streamChatFromPuter] Received null/undefined chunk');
            continue;
          }
          
          if (typeof chunk !== 'object') {
            console.warn(`[streamChatFromPuter] Received non-object chunk: ${typeof chunk}`);
            continue;
          }
          
          const text = typeof chunk.text === 'string' ? chunk.text : '';
          if (typeof text !== 'string') {
            console.warn(`[streamChatFromPuter] Chunk text is not string: ${typeof text}`);
            continue;
          }
          
          fullText += text;
          chunkCount++;
          if (onChunk && text) {
            onChunk(text);
          }
        }
      } catch (streamError) {
        if (fullText.length === 0) {
          throw new Error(`[streamChatFromPuter] Stream failed before any content: ${streamError}`);
        }
        console.warn(`[streamChatFromPuter] Stream interrupted after ${chunkCount} chunks and ${fullText.length} chars:`, streamError);
        const truncationNote = '\n\n[... response truncated due to streaming error]';
        fullText += truncationNote;
        if (onChunk) {
          onChunk(truncationNote);
        }
      }
      
      if (fullText.length === 0) {
        throw new Error(`[streamChatFromPuter] Stream produced no content (${chunkCount} chunks received)`);
      }
      
      return fullText;
    } else {
      // Non-streaming response
      // BUG FIX #2: Add runtime validation for response structure
      const response = await window.puter.ai.chat(messageArray, { model });
      
      if (!response || typeof response !== 'object') {
        throw new Error(`[chatWithPuter] Invalid response type from model ${model}: expected object, got ${typeof response}`);
      }
      
      if (!hasChatMessageResponse(response)) {
        throw new Error(`[chatWithPuter] Invalid response structure from model ${model}: missing message object. Got keys: ${Object.keys(response).join(', ')}`);
      }

      return response.message.content;
    }
  }, 3, `chatWithPuter(${model})`);
}

// Chat with Gemini (custom key)
export async function chatWithGemini(
  messages: AIMessage[] | string,
  options: { brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { brandKit = null, memoryContext } = options;
  
  // Get Gemini API key from storage
  const apiKey = await getProviderApiKey('gemini');

  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  // Build request body
  let contents: { role: string; parts: { text: string }[] }[];
  
  if (typeof messages === 'string') {
    contents = [
      { role: 'user', parts: [{ text: buildSystemPrompt(brandKit, undefined, memory) + '\n\n' + messages }] }
    ];
  } else {
    contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
      }));
    
    // Prepend system prompt to first user message
    const systemPrompt = messages.find(m => m.role === 'system');
    if (systemPrompt && contents.length > 0) {
      const systemContent = typeof systemPrompt.content === 'string' 
        ? systemPrompt.content 
        : JSON.stringify(systemPrompt.content);
      contents[0].parts[0].text = systemContent + '\n\n' + contents[0].parts[0].text;
    }
  }

  return withRetry(async () => {
    try {
      return await callServerChatProxy('gemini', messageArray, 'gemini-1.5-pro');
    } catch (error) {
      if (!canFallbackToBrowserProvider(error) || !apiKey) {
        throw error;
      }
    }

    if (!apiKey) {
      throw new Error('Gemini API key not configured. Add it in Settings or configure GEMINI_API_KEY on the server.');
    }

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({ contents })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${error}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }, 3, 'chatWithGemini');
}

// Chat with Groq
export async function chatWithGroq(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'llama-3.3-70b-versatile', brandKit = null, memoryContext } = options;
  
  const apiKey = await getProviderApiKey('groq');
  
  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();
  
  const messageArray = buildMessageArray(messages, brandKit, memory);
  
  return withRetry(async () => {
    return callOpenAICompatibleChat(
      'groq',
      'https://api.groq.com/openai/v1/chat/completions',
      apiKey,
      messageArray,
      model.replace('groq/', '')
    );
  }, 3, 'chatWithGroq');
}

// Chat with OpenRouter
export async function chatWithOpenRouter(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'openrouter/auto', brandKit = null, memoryContext } = options;
  
  const apiKey = await getProviderApiKey('openrouter');
  
  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();
  
  const messageArray = buildMessageArray(messages, brandKit, memory);
  
  return withRetry(async () => {
    return callOpenAICompatibleChat(
      'openrouter',
      'https://openrouter.ai/api/v1/chat/completions',
      apiKey,
      messageArray,
      model.replace('openrouter/', ''),
      {
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
      }
    );
  }, 3, 'chatWithOpenRouter');
}

export async function chatWithGitHubModels(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'openai/gpt-4o', brandKit = null, memoryContext } = options;
  const apiKey = await getProviderApiKey('githubmodels');
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  return withRetry(async () => {
    return callOpenAICompatibleChat(
      'githubmodels',
      'https://models.github.ai/inference/chat/completions',
      apiKey,
      messageArray,
      model
    );
  }, 3, 'chatWithGitHubModels');
}

export async function chatWithBytez(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'Qwen/Qwen3-4B', brandKit = null, memoryContext } = options;
  const apiKey = await getProviderApiKey('bytez');
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  return withRetry(async () => {
    return callOpenAICompatibleChat(
      'bytez',
      'https://api.bytez.com/v1/chat/completions',
      apiKey,
      messageArray,
      model
    );
  }, 3, 'chatWithBytez');
}

export async function chatWithPoe(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'Claude-Sonnet-4.6', brandKit = null, memoryContext } = options;
  const apiKey = await getProviderApiKey('poe');
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  return withRetry(async () => {
    return callOpenAICompatibleChat(
      'poe',
      'https://api.poe.com/v1/chat/completions',
      apiKey,
      messageArray,
      model
    );
  }, 3, 'chatWithPoe');
}

// Chat with NVIDIA NIM
export async function chatWithNvidia(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'nvidia/llama-3.1-nemotron-70b-instruct', brandKit = null, memoryContext } = options;
  
  const apiKey = await getProviderApiKey('nvidia');
  
  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();
  
  const messageArray = buildMessageArray(messages, brandKit, memory);
  
  return withRetry(async () => {
    return callOpenAICompatibleChat(
      'nvidia',
      'https://integrate.api.nvidia.com/v1/chat/completions',
      apiKey,
      messageArray,
      model.replace('nvidia/', '')
    );
  }, 3, 'chatWithNvidia');
}

export async function chatWithTogether(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', brandKit = null, memoryContext } = options;
  const apiKey = await getProviderApiKey('together');
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  return withRetry(async () => {
    return callOpenAICompatibleChat(
      'together',
      'https://api.together.xyz/v1/chat/completions',
      apiKey,
      messageArray,
      model
    );
  }, 3, 'chatWithTogether');
}

export async function chatWithFireworks(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'accounts/fireworks/models/llama-v3p1-70b-instruct', brandKit = null, memoryContext } = options;
  const apiKey = await getProviderApiKey('fireworks');
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  return withRetry(async () => {
    return callOpenAICompatibleChat(
      'fireworks',
      'https://api.fireworks.ai/inference/v1/chat/completions',
      apiKey,
      messageArray,
      model
    );
  }, 3, 'chatWithFireworks');
}

// Chat with Ollama (local)
export async function chatWithOllama(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'llama3.2', brandKit = null, memoryContext } = options;
  
  const baseUrl = await kvGet('ollama_url') || 'http://localhost:11434';
  
  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();
  
  const messageArray = typeof messages === 'string' 
    ? [{ role: 'user', content: buildSystemPrompt(brandKit, undefined, memory) + '\n\n' + messages }]
    : messages;
  
  return withRetry(async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.replace('ollama/', ''),
        messages: messageArray.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        })),
        stream: false,
      }),
    });
    
    if (!response.ok) throw new Error(`Ollama error: ${await response.text()}`);
    const data = await response.json();
    return data.message?.content || '';
  }, 3, 'chatWithOllama');
}

// Chat with DeepSeek
export async function chatWithDeepSeek(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'deepseek-chat', brandKit = null, memoryContext } = options;
  
  const apiKey = await getProviderApiKey('deepseek');
  
  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();
  
  const messageArray = buildMessageArray(messages, brandKit, memory);
  
  return withRetry(async () => {
    return callOpenAICompatibleChat(
      'deepseek',
      'https://api.deepseek.com/chat/completions',
      apiKey,
      messageArray,
      model
    );
  }, 3, 'chatWithDeepSeek');
}

// Universal chat function that handles model routing
export async function universalChat(
  messages: AIMessage[] | string,
  options: {
    model?: string;
    brandKit?: BrandKit | null;
    stream?: boolean;
    avoidPuter?: boolean;
    onChunk?: (text: string) => void;
  } = {}
): Promise<string> {
  const { model = 'gpt-5.5', avoidPuter = false, onChunk } = options;
  
  // 1. Tool Loop Implementation
  let currentMessages = typeof messages === 'string' ? messages : [...messages];
  let iteration = 0;
  const MAX_ITERATIONS = 5;

  // Inject Tool Definitions into System Prompt if not present
  const toolPrompt = `\n\nAVAILABLE TOOLS:\n${getToolDefinitionsPrompt()}\n\nIf you need real-time info, use: TOOL_CALL: { "tool": "tool_name", "params": { "key": "value" } }`;
  
  while (iteration < MAX_ITERATIONS) {
    // Inject tool prompt for the first message if it's a string or system message
    const messagesWithTools = typeof currentMessages === 'string' 
      ? `${currentMessages}\n\n${toolPrompt}` 
      : [...currentMessages];

    if (Array.isArray(messagesWithTools) && messagesWithTools.length > 0 && messagesWithTools[0].role === 'system') {
      messagesWithTools[0] = { ...messagesWithTools[0], content: messagesWithTools[0].content + toolPrompt };
    }

    const response = await _universalChatCore(messagesWithTools, options);
    
    // Check for TOOL_CALL pattern
    const toolMatch = response.match(/TOOL_CALL:\s*({.*?})/s);
    if (toolMatch) {
      try {
        const call = JSON.parse(toolMatch[1]);
        const tool = ToolRegistry[call.tool];
        if (!tool) throw new Error(`Unknown tool: ${call.tool}`);
        
        const result = await tool.execute(call.params);
        const toolResponse = result.success 
          ? `TOOL_RESULT: ${result.content}` 
          : `TOOL_ERROR: ${result.error}`;
        
        // Append tool result to conversation and loop
        if (typeof currentMessages === 'string') {
          currentMessages = [
            { role: 'user', content: currentMessages },
            { role: 'assistant', content: response },
            { role: 'system', content: toolResponse }
          ];
        } else {
          currentMessages.push({ role: 'assistant', content: response });
          currentMessages.push({ role: 'system', content: toolResponse });
        }
        
        iteration++;
        continue;
      } catch (e) {
        if (typeof currentMessages === 'string') {
          currentMessages = [
            { role: 'user', content: currentMessages },
            { role: 'assistant', content: response },
            { role: 'system', content: `Tool Error: ${e instanceof Error ? e.message : 'Invalid tool call'}` }
          ];
        } else {
          currentMessages.push({ role: 'assistant', content: response });
          currentMessages.push({ role: 'system', content: `Tool Error: ${e instanceof Error ? e.message : 'Invalid tool call'}` });
        }
        iteration++;
      }
    }
    
    return response;
  }

  return `Failed to resolve after ${MAX_ITERATIONS} iterations. Last response: ${currentMessages}`;
}

/**
 * Core logic for universalChat, extracted to allow recursion.
 */
async function _universalChatCore(
  messages: AIMessage[] | string,
  options: {
    model?: string;
    brandKit?: BrandKit | null;
    stream?: boolean;
    avoidPuter?: boolean;
    onChunk?: (text: string) => void;
  } = {}
): Promise<string> {
  const { model = 'gpt-5.5', avoidPuter = false, onChunk } = options;
  const configuredProviders = await getConfiguredProviders();
  const allowedProviders = avoidPuter
    ? configuredProviders.filter((provider) => provider !== 'puter')
    : configuredProviders;
  const preferredConfig = AVAILABLE_MODELS.find((candidate) => candidate.model === model);
  const preferredProvider = (preferredConfig?.provider || 'puter') as RoutedProvider;
  const routedPreferredProvider =
    avoidPuter && preferredProvider === 'puter'
      ? allowedProviders[0] || preferredProvider
      : preferredProvider;
  const routedModel =
    avoidPuter && preferredProvider === 'puter'
      ? PROVIDER_DEFAULT_MODELS[routedPreferredProvider]?.[0] || model
      : model;

  if (avoidPuter && allowedProviders.length === 0) {
    throw new Error('No non-Puter AI provider is configured for this task.');
  }

  const disablePuterFallback = await isPuterFallbackDisabled();
  const fallbackProviders = buildFallbackProviders(routedPreferredProvider, allowedProviders, {
    disablePuterFallback: disablePuterFallback || avoidPuter,
  });

  const candidateModels = Array.from(new Set(
    fallbackProviders.flatMap((provider) => {
      if (provider === routedPreferredProvider) {
        const sameProviderModels = AVAILABLE_MODELS
          .filter((entry) => entry.provider === routedPreferredProvider)
          .map((entry) => entry.model);
        return [routedModel, ...sameProviderModels];
      }

      const providerDefaults = PROVIDER_DEFAULT_MODELS[provider];
      return providerDefaults ? [...providerDefaults] : [];
    })
  ));

  let lastError: Error | null = null;

  for (const candidateModel of candidateModels) {
    try {
      const modelConfig = AVAILABLE_MODELS.find(m => m.model === candidateModel);
      const provider = modelConfig?.provider || 'puter';
      if (isProviderInCooldown(provider)) {
        continue;
      }

      switch (provider) {
        case 'gemini':
          {
            const content = await chatWithGemini(messages, options);
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        case 'groq':
          {
            const content = await chatWithGroq(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        case 'openrouter':
          {
            const content = await chatWithOpenRouter(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        case 'githubmodels':
          {
            const content = await chatWithGitHubModels(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        case 'bytez':
          {
            const content = await chatWithBytez(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        case 'poe':
          {
            const content = await chatWithPoe(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        case 'nvidia':
          {
            const content = await chatWithNvidia(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        case 'together':
          {
            const content = await chatWithTogether(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        case 'fireworks':
          {
            const content = await chatWithFireworks(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        case 'ollama':
          {
            const content = await chatWithOllama(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        case 'deepseek':
          {
            const content = await chatWithDeepSeek(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
        default:
          {
            const content = await chatWithPuter(messages, { ...options, model: candidateModel });
            if (provider !== preferredProvider) {
              dispatchProviderEvent({
                type: 'provider_switched',
                from: preferredProvider,
                to: provider,
                model: candidateModel,
                message: `Switched chat provider from ${preferredProvider} to ${provider}.`,
              });
            }
            return content;
          }
      }
    } catch (error) {
      lastError = error as Error;
      const errorMessage = getErrorText(error);
      const failedModelConfig = AVAILABLE_MODELS.find((entry) => entry.model === candidateModel);
      const failedProvider = (failedModelConfig?.provider || 'puter') as RoutedProvider;
      applyProviderCooldown(failedProvider, errorMessage);
      if (failedProvider === 'puter' && isQuotaOrBillingError(errorMessage)) {
        const replacementProvider = preferredProvider === 'puter'
          ? fallbackProviders.find((provider) => provider !== 'puter' && !isProviderInCooldown(provider))
          : null;
        const replacementModel = replacementProvider
          ? PROVIDER_DEFAULT_MODELS[replacementProvider]?.[0]
          : null;
        const canSwitchFromPuter = preferredProvider === 'puter' && !!replacementModel;
        const shouldDisableFallback = !disablePuterFallback && (preferredProvider !== 'puter' || canSwitchFromPuter);
        const shouldNotifyPuterCredit = preferredProvider === 'puter' || !disablePuterFallback;

        if (shouldDisableFallback) {
          await setPuterFallbackDisabled(true);
        }

        if (replacementModel) {
          await setActiveChatModel(replacementModel);
        }

        if (shouldNotifyPuterCredit) {
          dispatchProviderEvent({
            type: 'puter_credit_exhausted',
            provider: 'puter',
            model: candidateModel,
            message: canSwitchFromPuter
              ? `Puter hit a credits or quota limit. Chat is switching to ${replacementProvider} and Puter fallback has been disabled.`
              : preferredProvider === 'puter'
              ? 'Puter hit a credits or quota limit and no alternate chat provider is configured. Add another provider to keep chat available when Puter is out of credits.'
              : 'Puter hit a credits or quota limit. Puter fallback has been disabled so chat can stay on your selected provider.',
          });
        }
      }
      if (isConfigurationError(errorMessage)) {
        console.warn(`universalChat skipped ${candidateModel}: ${errorMessage}`);
        continue;
      }
      if (isRetriableProviderError(errorMessage)) {
        console.warn(`universalChat failed on ${candidateModel}, trying fallback provider/model`, lastError);
        continue;
      }
      console.warn(`universalChat failed on ${candidateModel}, trying next available option`, lastError);
    }
  }

  throw lastError || new Error('All AI model attempts failed');
}

// Primary chat entrypoint: use provider failover by default.
// Keep native Puter streaming support when stream=true is explicitly requested.
export async function chat(
  messages: AIMessage[] | string,
  optionsOrModel: string | {
    model?: string;
    brandKit?: BrandKit | null;
    stream?: boolean;
    memoryContext?: string;
    avoidPuter?: boolean;
  } = {}
): Promise<string> {
  const options = typeof optionsOrModel === 'string'
    ? { model: optionsOrModel }
    : optionsOrModel;

  if (options.stream) {
    if (options.avoidPuter) {
      throw new Error('Streaming chat requires Puter and cannot run with avoidPuter enabled.');
    }
    return chatWithPuter(messages, options);
  }

  return universalChat(messages, options);
}

// Generate image with DALL-E 3
export async function generateImage(
  prompt: string,
  options: {
    enhancePrompt?: boolean;
    negativePrompt?: string;
  } = {}
): Promise<string> {
  const { enhancePrompt = true, negativePrompt } = options;
  
  const ready = await waitForPuter();
  if (typeof window === 'undefined' || !ready || !window.puter) {
    throw new Error('Puter not available');
  }

  const fullPrompt = enhancePrompt
    ? `${prompt}, ${IMAGE_QUALITY_PROMPT}`
    : prompt;

  const negative = negativePrompt || IMAGE_NEGATIVE_PROMPT;

  return withRetry(async () => {
    const result = await window.puter.ai.txt2img(fullPrompt, {
      negativePrompt: negative
    });
    return result.src;
  }, 3, 'generateImage');
}

// Generate multiple prompt variations
export async function generatePromptVariations(
  idea: string,
  count = 3,
  brandKit?: BrandKit | null
): Promise<string[]> {
  const prompt = `Generate ${count} different creative image prompts for DALL-E 3 based on this idea:
"${idea}"

Each prompt should:
1. Be highly detailed and specific
2. Describe lighting, composition, camera angle, and mood
3. Include style references (photography style, color palette)
4. Be optimized for social media visual appeal
${brandKit ? `5. Match the brand tone: ${brandKit.tone}` : ''}

Return ONLY the prompts, one per line, numbered 1-${count}. No explanations.`;

  const response = await chat(prompt, { brandKit });
  
  // Parse numbered prompts
  const lines = response.split('\n').filter(line => line.trim());
  const prompts: string[] = [];
  
  for (const line of lines) {
    const match = line.match(/^\d+[\.\)]\s*(.+)/);
    if (match) {
      prompts.push(match[1].trim());
    }
  }
  
  return prompts.slice(0, count);
}

// Analyze image (vision)
export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  question?: string
): Promise<string> {
  const imageUrl = `data:${mimeType};base64,${imageBase64}`;
  const prompt = question || `Analyze this image in detail.
If it contains text, transcribe it.
If it is a product/brand asset, extract brand details.
If it is a screenshot, describe the UI/content.
If it is a photo, describe composition, lighting, mood, subjects.
Then suggest how this could be used for social media content.`;
  return chatWithVision(prompt, imageUrl);
}

// Get current model based on settings
export async function getCurrentModel(): Promise<string> {
  const savedModel = await kvGet('default_model') || await kvGet('ai_model');
  if (savedModel && AVAILABLE_MODELS.some(m => m.model === savedModel)) {
    return savedModel;
  }
  return 'gpt-5.5';
}

// Chat with vision (convenience wrapper for analyzeImage with custom prompt)
export async function chatWithVision(
  prompt: string,
  imageUrl: string
): Promise<string> {
  const model = await getCurrentModel();
  const provider = resolveProviderForModel(model, AVAILABLE_MODELS);

  const messages: AIMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt }
      ]
    }
  ];

  try {
    return await universalChat(messages, { model });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (provider !== 'puter') {
      throw new Error(
        `Vision analysis failed on ${provider} (${model}). Configure a vision-capable provider/model or switch chat to Puter for OCR. ${reason}`
      );
    }
    throw error;
  }
}

// Try models in priority order until one works
export async function chatWithFallback(
  messages: AIMessage[] | string,
  options: { brandKit?: BrandKit | null } = {}
): Promise<string> {
  let lastError: Error | null = null;
  
  for (const model of MODEL_PRIORITY) {
    try {
      return await chat(messages, { ...options, model });
    } catch (error) {
      lastError = error as Error;
      console.warn(`Model ${model} failed, trying next...`);
    }
  }
  
  throw lastError || new Error('All models failed');
}

// Export all functions as aiService object for convenience
export const aiService = {
  chat,
  chatWithGemini,
  chatWithGroq,
  chatWithOpenRouter,
  chatWithGitHubModels,
  chatWithBytez,
  chatWithPoe,
  chatWithNvidia,
  chatWithTogether,
  chatWithFireworks,
  chatWithOllama,
  chatWithDeepSeek,
  universalChat,
  chatWithVision,
  chatWithFallback,
  generateImage,
  generatePromptVariations,
  analyzeImage,
  getCurrentModel,
  AVAILABLE_MODELS,
};
