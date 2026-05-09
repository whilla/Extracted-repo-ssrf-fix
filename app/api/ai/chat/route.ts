export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import {
  buildGeminiPayload,
  buildOpenAICompatiblePayload,
  extractProviderText,
  getProviderProxyConfig,
  getServerProviderApiKey,
  isServerChatProvider,
  normalizeProxyMessages,
} from '@/lib/server/aiProviderProxy';
import { RateLimiter } from '@/lib/services/rateLimiter';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body.', 400);
  }

  // Security: Implementation of Rate Limiting
  const userId = request.headers.get('x-user-id') || 'anonymous';
  const rateLimit = await RateLimiter.checkLimit(userId);
  if (!rateLimit.allowed) {
    return jsonError('Too many requests. Please slow down.', 429);
  }

  const provider = body.provider;
  const model = body.model;
  const messages = body.messages;

  if (typeof provider !== 'string' || !isServerChatProvider(provider)) {
    return jsonError('Unsupported provider.', 400);
  }

  if (typeof model !== 'string' || model.trim().length === 0) {
    return jsonError('A model is required.', 400);
  }

  let normalizedMessages;
  try {
    normalizedMessages = normalizeProxyMessages(messages);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Invalid messages.', 400);
  }

  const apiKey = getServerProviderApiKey(provider);
  if (!apiKey) {
    return jsonError(`Server provider key not configured for ${provider}.`, 501);
  }

  const config = getProviderProxyConfig(provider);
  const origin = request.headers.get('origin') || request.nextUrl.origin;

  try {
    const endpoint =
      config.kind === 'gemini'
        ? `${config.endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
        : config.endpoint;
    const payload =
      config.kind === 'gemini'
        ? buildGeminiPayload(normalizedMessages)
        : buildOpenAICompatiblePayload(model, normalizedMessages);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.kind === 'openai-compatible' ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(body.provider === 'openrouter' ? { 'HTTP-Referer': origin, 'X-Title': 'NexusAI' } : {}),
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(async () => ({ error: await response.text().catch(() => '') }));
    if (!response.ok) {
      const providerError = typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
        ? data.message
        : JSON.stringify(data);
      return jsonError(providerError || `${body.provider} request failed.`, 502);
    }

    const text = extractProviderText(data);
    if (!text.trim()) {
      return jsonError(`${body.provider} returned an empty response.`, 502);
    }

    return NextResponse.json({ text });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Provider proxy request failed.', 502);
  }
}
