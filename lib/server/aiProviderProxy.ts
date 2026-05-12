import type { AIMessageContent } from '@/lib/types';
import { OPENROUTER_URL, GITHUB_MODELS_URL, BYTEZ_URL, POE_URL, GROQ_URL, DEEPSEEK_URL, NVIDIA_URL, TOGETHER_URL, FIREWORKS_URL } from '@/lib/constants/api';

export const SERVER_CHAT_PROVIDERS = [
  'openrouter',
  'githubmodels',
  'bytez',
  'poe',
  'groq',
  'gemini',
  'deepseek',
  'nvidia',
  'together',
  'fireworks',
] as const;

export type ServerChatProvider = (typeof SERVER_CHAT_PROVIDERS)[number];

export interface ProxyChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AIMessageContent[];
}

interface ProviderProxyConfig {
  endpoint: string;
  envKeys: string[];
  headers?: Record<string, string>;
  kind: 'openai-compatible' | 'gemini';
}

const PROVIDER_CONFIGS: Record<ServerChatProvider, ProviderProxyConfig> = {
  openrouter: {
    endpoint: `${OPENROUTER_URL}/api/v1/chat/completions`,
    envKeys: ['OPENROUTER_API_KEY', 'OPENROUTER_KEY'],
    kind: 'openai-compatible',
  },
  githubmodels: {
    endpoint: `${GITHUB_MODELS_URL}/inference/chat/completions`,
    envKeys: ['GITHUB_MODELS_API_KEY', 'GITHUB_MODELS_TOKEN', 'GITHUB_TOKEN'],
    kind: 'openai-compatible',
  },
  bytez: {
    endpoint: `${BYTEZ_URL}/v1/chat/completions`,
    envKeys: ['BYTEZ_API_KEY'],
    kind: 'openai-compatible',
  },
  poe: {
    endpoint: `${POE_URL}/v1/chat/completions`,
    envKeys: ['POE_API_KEY'],
    kind: 'openai-compatible',
  },
  groq: {
    endpoint: `${GROQ_URL}/openai/v1/chat/completions`,
    envKeys: ['GROQ_API_KEY'],
    kind: 'openai-compatible',
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY'],
    kind: 'gemini',
  },
  deepseek: {
    endpoint: `${DEEPSEEK_URL}/chat/completions`,
    envKeys: ['DEEPSEEK_API_KEY'],
    kind: 'openai-compatible',
  },
  nvidia: {
    endpoint: `${NVIDIA_URL}/v1/chat/completions`,
    envKeys: ['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY'],
    kind: 'openai-compatible',
  },
  together: {
    endpoint: `${TOGETHER_URL}/v1/chat/completions`,
    envKeys: ['TOGETHER_API_KEY'],
    kind: 'openai-compatible',
  },
  fireworks: {
    endpoint: `${FIREWORKS_URL}/inference/v1/chat/completions`,
    envKeys: ['FIREWORKS_API_KEY'],
    kind: 'openai-compatible',
  },
};

export function isServerChatProvider(value: string): value is ServerChatProvider {
  return SERVER_CHAT_PROVIDERS.includes(value as ServerChatProvider);
}

function sanitizeServerSecret(value: string | undefined): string {
  return (value || '').trim().replace(/[\r\n\u200B-\u200D\uFEFF]+/g, '');
}

export function getServerProviderApiKey(
  provider: ServerChatProvider,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const config = PROVIDER_CONFIGS[provider];
  for (const key of config.envKeys) {
    const value = sanitizeServerSecret(env[key]);
    if (value) return value;
  }
  return null;
}

export function getServerConfiguredProviderIds(
  env: NodeJS.ProcessEnv = process.env
): ServerChatProvider[] {
  return SERVER_CHAT_PROVIDERS.filter((provider) => Boolean(getServerProviderApiKey(provider, env)));
}

export function getServerProviderStatus(env: NodeJS.ProcessEnv = process.env) {
  return SERVER_CHAT_PROVIDERS.map((provider) => ({
    id: provider,
    configured: Boolean(getServerProviderApiKey(provider, env)),
    envKeys: PROVIDER_CONFIGS[provider].envKeys,
  }));
}

export function normalizeProxyMessages(messages: unknown): ProxyChatMessage[] {
  if (!Array.isArray(messages)) {
    throw new Error('messages must be an array.');
  }

  const normalized = messages
    .map((message): ProxyChatMessage | null => {
      if (!message || typeof message !== 'object') return null;
      const candidate = message as { role?: unknown; content?: unknown };
      if (candidate.role !== 'system' && candidate.role !== 'user' && candidate.role !== 'assistant') {
        return null;
      }

      if (typeof candidate.content === 'string') {
        return {
          role: candidate.role,
          content: candidate.content.slice(0, 120_000),
        };
      }

      if (Array.isArray(candidate.content)) {
        return {
          role: candidate.role,
          content: candidate.content as AIMessageContent[],
        };
      }

      return null;
    })
    .filter((message): message is ProxyChatMessage => Boolean(message));

  if (normalized.length === 0) {
    throw new Error('At least one valid chat message is required.');
  }

  return normalized;
}

function normalizeMessageContent(content: string | AIMessageContent[]) {
  if (typeof content === 'string') return content;

  return content.map((part) => {
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
  });
}

export function buildOpenAICompatiblePayload(model: string, messages: ProxyChatMessage[]) {
  return {
    model,
    messages: messages.map((message) => ({
      role: message.role,
      content: normalizeMessageContent(message.content),
    })),
  };
}

export function buildGeminiPayload(messages: ProxyChatMessage[]) {
  const system = messages.find((message) => message.role === 'system');
  const nonSystem = messages.filter((message) => message.role !== 'system');
  const sourceMessages = nonSystem.length > 0 ? nonSystem : messages;

  const contents = sourceMessages.map((message, index) => {
    const text = typeof message.content === 'string'
      ? message.content
      : message.content.map((part) => part.type === 'text' ? part.text || '' : part.image_url?.url || '').join('\n');
    const prefix = index === 0 && system && typeof system.content === 'string'
      ? `${system.content}\n\n`
      : '';

    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: `${prefix}${text}` }],
    };
  });

  return { contents };
}

export function extractProviderText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const payload = data as {
    choices?: Array<{ message?: { content?: string } }>;
    output?: Array<{ content?: Array<{ text?: string }> }>;
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    message?: { content?: string };
    text?: string;
  };

  return (
    payload.choices?.[0]?.message?.content ||
    payload.output?.[0]?.content?.[0]?.text ||
    payload.candidates?.[0]?.content?.parts?.[0]?.text ||
    payload.message?.content ||
    payload.text ||
    ''
  );
}

export function getProviderProxyConfig(provider: ServerChatProvider): ProviderProxyConfig {
  return PROVIDER_CONFIGS[provider];
}
