// AI Service - Multi-model support with retry logic
import type { AIMessage, AIModel, BrandKit } from '@/lib/types';
import { buildSystemPrompt, IMAGE_QUALITY_PROMPT, IMAGE_NEGATIVE_PROMPT } from '@/lib/constants/prompts';
import { kvGet } from './puterService';
import { buildMemoryContext } from './agentMemoryService';
import { waitForPuter } from './puterService';

// Available models - including custom provider options
export const AVAILABLE_MODELS: AIModel[] = [
  // Puter native models (free)
  { provider: 'puter', model: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, supportsVision: true },
  { provider: 'puter', model: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, supportsVision: true },
  { provider: 'puter', model: 'claude-sonnet-4-5', name: 'Claude Sonnet', contextWindow: 200000, supportsVision: true },
  { provider: 'puter', model: 'claude-opus-4', name: 'Claude Opus', contextWindow: 200000, supportsVision: true },
  // Custom key providers
  { provider: 'gemini', model: 'gemini-1.5-pro', name: 'Gemini Pro', contextWindow: 1000000, supportsVision: true },
  { provider: 'openrouter', model: 'openrouter/auto', name: 'OpenRouter Auto', contextWindow: 128000, supportsVision: true },
  { provider: 'githubmodels', model: 'openai/gpt-4o', name: 'GitHub Models GPT-4o', contextWindow: 128000, supportsVision: false },
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
const MODEL_PRIORITY = ['gpt-4o', 'claude-sonnet-4-5', 'gpt-4o-mini'];

const PROVIDER_DEFAULT_MODELS = {
  puter: ['gpt-4o', 'claude-sonnet-4-5', 'gpt-4o-mini'],
  openrouter: ['openrouter/auto'],
  githubmodels: ['openai/gpt-4o'],
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

type RoutedProvider =
  | 'puter'
  | 'openrouter'
  | 'githubmodels'
  | 'poe'
  | 'bytez'
  | 'groq'
  | 'gemini'
  | 'deepseek'
  | 'nvidia'
  | 'together'
  | 'fireworks'
  | 'ollama';

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function normalizeChatMessages(messages: AIMessage[]): Array<{ role: string; content: string }> {
  return messages.map((message) => ({
    role: message.role,
    content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
  }));
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

async function callOpenAICompatibleChat(
  url: string,
  apiKey: string,
  messages: AIMessage[],
  model: string,
  extraHeaders?: Record<string, string>
): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: normalizeChatMessages(messages),
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || data.output?.[0]?.content?.[0]?.text || '';
}

async function getConfiguredProviders(): Promise<RoutedProvider[]> {
  const keyChecks = await Promise.all([
    kvGet('openrouter_key'),
    kvGet('github_models_key'),
    kvGet('bytez_key'),
    kvGet('poe_key'),
    kvGet('groq_key'),
    kvGet('gemini_key'),
    kvGet('deepseek_key'),
    kvGet('nvidia_key'),
    kvGet('together_key'),
    kvGet('fireworks_key'),
    kvGet('ollama_url'),
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
  ] = keyChecks;

  const configured: RoutedProvider[] = ['puter'];
  if (openrouterKey) configured.push('openrouter');
  if (githubModelsKey) configured.push('githubmodels');
  if (bytezKey) configured.push('bytez');
  if (poeKey) configured.push('poe');
  if (groqKey) configured.push('groq');
  if (geminiKey) configured.push('gemini');
  if (deepseekKey) configured.push('deepseek');
  if (nvidiaKey) configured.push('nvidia');
  if (togetherKey) configured.push('together');
  if (fireworksKey) configured.push('fireworks');
  if (ollamaUrl) configured.push('ollama');
  return configured;
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
export async function chat(
  messages: AIMessage[] | string,
  optionsOrModel: string | {
    model?: string;
    brandKit?: BrandKit | null;
    stream?: boolean;
    memoryContext?: string;
  } = {}
): Promise<string> {
  const options = typeof optionsOrModel === 'string'
    ? { model: optionsOrModel }
    : optionsOrModel;
  const { model = 'gpt-4o', brandKit = null, stream = false, memoryContext } = options;

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
      
      let fullText = '';
      for await (const chunk of response as AsyncIterable<{ text: string }>) {
        fullText += chunk.text || '';
      }
      return fullText;
    } else {
      // Non-streaming response
      const response = await window.puter.ai.chat(messageArray, { model });
      return (response as { message: { content: string } }).message.content;
    }
  }, 3, `chat(${model})`);
}

// Chat with Gemini (custom key)
export async function chatWithGemini(
  messages: AIMessage[] | string,
  options: { brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { brandKit = null, memoryContext } = options;
  
  // Get Gemini API key from storage
  const apiKey = await kvGet('gemini_key');
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();

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
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  
  const apiKey = await kvGet('groq_key');
  if (!apiKey) throw new Error('Groq API key not configured. Add it in Settings.');
  
  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();
  
  const messageArray = typeof messages === 'string' 
    ? [{ role: 'user', content: buildSystemPrompt(brandKit, undefined, memory) + '\n\n' + messages }]
    : messages;
  
  return withRetry(async () => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.replace('groq/', ''),
        messages: messageArray.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        })),
      }),
    });
    
    if (!response.ok) throw new Error(`Groq error: ${await response.text()}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }, 3, 'chatWithGroq');
}

// Chat with OpenRouter
export async function chatWithOpenRouter(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'openrouter/auto', brandKit = null, memoryContext } = options;
  
  const apiKey = await kvGet('openrouter_key');
  if (!apiKey) throw new Error('OpenRouter API key not configured. Add it in Settings.');
  
  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();
  
  const messageArray = buildMessageArray(messages, brandKit, memory);
  
  return withRetry(async () => {
    return callOpenAICompatibleChat(
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
  const apiKey = await kvGet('github_models_key');
  if (!apiKey) throw new Error('GitHub Models API key not configured. Add it in Settings.');
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  return withRetry(async () => {
    return callOpenAICompatibleChat(
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
  const apiKey = await kvGet('bytez_key');
  if (!apiKey) throw new Error('Bytez API key not configured. Add it in Settings.');
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  return withRetry(async () => {
    return callOpenAICompatibleChat(
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
  const apiKey = await kvGet('poe_key');
  if (!apiKey) throw new Error('Poe API key not configured. Add it in Settings.');
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  return withRetry(async () => {
    return callOpenAICompatibleChat(
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
  
  const apiKey = await kvGet('nvidia_key');
  if (!apiKey) throw new Error('NVIDIA API key not configured. Add it in Settings.');
  
  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();
  
  const messageArray = typeof messages === 'string' 
    ? [{ role: 'user', content: buildSystemPrompt(brandKit, undefined, memory) + '\n\n' + messages }]
    : messages;
  
  return withRetry(async () => {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.replace('nvidia/', ''),
        messages: messageArray.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        })),
      }),
    });
    
    if (!response.ok) throw new Error(`NVIDIA error: ${await response.text()}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }, 3, 'chatWithNvidia');
}

export async function chatWithTogether(
  messages: AIMessage[] | string,
  options: { model?: string; brandKit?: BrandKit | null; memoryContext?: string } = {}
): Promise<string> {
  const { model = 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', brandKit = null, memoryContext } = options;
  const apiKey = await kvGet('together_key');
  if (!apiKey) throw new Error('Together API key not configured. Add it in Settings.');
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  return withRetry(async () => {
    return callOpenAICompatibleChat(
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
  const apiKey = await kvGet('fireworks_key');
  if (!apiKey) throw new Error('Fireworks API key not configured. Add it in Settings.');
  const memory = memoryContext ?? await buildMemoryContext();
  const messageArray = buildMessageArray(messages, brandKit, memory);

  return withRetry(async () => {
    return callOpenAICompatibleChat(
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
  
  const apiKey = await kvGet('deepseek_key');
  if (!apiKey) throw new Error('DeepSeek API key not configured. Add it in Settings.');
  
  // Get memory context if not provided
  const memory = memoryContext ?? await buildMemoryContext();
  
  const messageArray = typeof messages === 'string' 
    ? [{ role: 'user', content: buildSystemPrompt(brandKit, undefined, memory) + '\n\n' + messages }]
    : messages;
  
  return withRetry(async () => {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messageArray.map(m => ({
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        })),
      }),
    });
    
    if (!response.ok) throw new Error(`DeepSeek error: ${await response.text()}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }, 3, 'chatWithDeepSeek');
}

// Universal chat function that handles model routing
export async function universalChat(
  messages: AIMessage[] | string,
  options: {
    model?: string;
    brandKit?: BrandKit | null;
    stream?: boolean;
  } = {}
): Promise<string> {
  const { model = 'gpt-4o' } = options;
  const configuredProviders = await getConfiguredProviders();
  const preferredConfig = AVAILABLE_MODELS.find((candidate) => candidate.model === model);
  const preferredProvider = (preferredConfig?.provider || 'puter') as RoutedProvider;
  const fallbackProviders = [
    preferredProvider,
    ...configuredProviders.filter((provider) => provider !== preferredProvider),
  ];

  const candidateModels = Array.from(new Set(
    fallbackProviders.flatMap((provider) => {
      if (provider === preferredProvider) {
        const sameProviderModels = AVAILABLE_MODELS
          .filter((entry) => entry.provider === preferredProvider)
          .map((entry) => entry.model);
        return [model, ...sameProviderModels];
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

      switch (provider) {
        case 'gemini':
          return await chatWithGemini(messages, options);
        case 'groq':
          return await chatWithGroq(messages, { ...options, model: candidateModel });
        case 'openrouter':
          return await chatWithOpenRouter(messages, { ...options, model: candidateModel });
        case 'githubmodels':
          return await chatWithGitHubModels(messages, { ...options, model: candidateModel });
        case 'bytez':
          return await chatWithBytez(messages, { ...options, model: candidateModel });
        case 'poe':
          return await chatWithPoe(messages, { ...options, model: candidateModel });
        case 'nvidia':
          return await chatWithNvidia(messages, { ...options, model: candidateModel });
        case 'together':
          return await chatWithTogether(messages, { ...options, model: candidateModel });
        case 'fireworks':
          return await chatWithFireworks(messages, { ...options, model: candidateModel });
        case 'ollama':
          return await chatWithOllama(messages, { ...options, model: candidateModel });
        case 'deepseek':
          return await chatWithDeepSeek(messages, { ...options, model: candidateModel });
        default:
          return await chat(messages, { ...options, model: candidateModel });
      }
    } catch (error) {
      lastError = error as Error;
      const errorMessage = getErrorText(error);
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
  const ready = await waitForPuter();
  if (typeof window === 'undefined' || !ready || !window.puter) {
    throw new Error('Puter not available');
  }

  const imageUrl = `data:${mimeType};base64,${imageBase64}`;
  
  const messages: AIMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        {
          type: 'text',
          text: question || `Analyze this image in detail.
If it contains text, transcribe it.
If it is a product/brand asset, extract brand details.
If it is a screenshot, describe the UI/content.
If it is a photo, describe composition, lighting, mood, subjects.
Then suggest how this could be used for social media content.`
        }
      ]
    }
  ];

  return withRetry(async () => {
    const response = await window.puter.ai.chat(messages, { model: 'gpt-4o' });
    return (response as { message: { content: string } }).message.content;
  }, 3, 'analyzeImage');
}

// Get current model based on settings
export async function getCurrentModel(): Promise<string> {
  const savedModel = await kvGet('default_model') || await kvGet('ai_model');
  if (savedModel && AVAILABLE_MODELS.some(m => m.model === savedModel)) {
    return savedModel;
  }
  return 'gpt-4o';
}

// Chat with vision (convenience wrapper for analyzeImage with custom prompt)
export async function chatWithVision(
  prompt: string,
  imageUrl: string
): Promise<string> {
  if (typeof window === 'undefined' || !window.puter) {
    throw new Error('Puter not available');
  }

  const messages: AIMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageUrl } },
        { type: 'text', text: prompt }
      ]
    }
  ];

  return withRetry(async () => {
    const response = await window.puter.ai.chat(messages, { model: 'gpt-4o' });
    return (response as { message: { content: string } }).message.content;
  }, 3, 'chatWithVision');
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
