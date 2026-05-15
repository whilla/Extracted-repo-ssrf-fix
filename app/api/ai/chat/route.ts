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
import { schemas, validateRequest } from '@/lib/utils/validation';
import { cached, TTL, CACHE_TAGS } from '@/lib/utils/cache';
import { safeExternalCall } from '@/lib/utils/gracefulDegradation';
import { chatWithBrain } from '@/lib/services/nexusBrain';
import { kvGet } from '@/lib/services/puterService';
import { quickBrainstorm } from '@/lib/services/brainstormEngine';
import { viralScoringEngine } from '@/lib/core/ViralScoringEngine';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  const validation = await validateRequest(request, schemas.chat);
  if (!validation.success) {
    return validation.response;
  }

  const { messages, model, stream, temperature, maxTokens } = validation.data;

  const userId = request.headers.get('x-user-id') || 'anonymous';
  const rateLimit = await RateLimiter.checkLimit(userId);
  if (!rateLimit.allowed) {
    return jsonError('Too many requests. Please slow down.', 429);
  }

  const provider = model ? model.split('/')[0] || 'openrouter' : 'openrouter';
  const actualModel = model || 'openai/gpt-4o';

  if (!isServerChatProvider(provider)) {
    return jsonError('Unsupported provider.', 400);
  }

  if (actualModel.trim().length === 0) {
    return jsonError('A model is required.', 400);
  }

  let normalizedMessages;
  try {
    normalizedMessages = normalizeProxyMessages(messages);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Invalid messages.', 400);
  }

  const apiKey = getServerProviderApiKey(provider);

  // ── FALLBACK: Use built-in NexusBrain when no external AI key is available ──
  if (!apiKey) {
    let brandKit = null;
    try {
      const raw = await kvGet('brand_kit');
      brandKit = raw ? JSON.parse(raw) : null;
    } catch {
      // Brand kit optional; brain works without it
    }

    try {
      const result = await chatWithBrain(
        normalizedMessages,
        brandKit
      );

      // ── Brainstorm: If user is asking for ideas, augment with brainstorm engine ──
      const lastMessage = normalizedMessages[normalizedMessages.length - 1];
      const lastMessageText = typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : lastMessage?.content?.map(p => p.type === 'text' ? p.text : '').join('') || '';
      const isIdeationRequest = /brainstorm|idea|suggest|generate.*content|give me/i.test(lastMessageText);
      let brainstormIdeas: string[] = [];
      if (isIdeationRequest && lastMessageText) {
        try {
          const topic = lastMessageText.replace(/brainstorm|suggest|give me|ideas? for?/gi, '').trim().slice(0, 100);
          brainstormIdeas = await quickBrainstorm(topic, brandKit, 5);
        } catch {
          // Brainstorm is optional enhancement
        }
      }

      // ── Viral Scoring: If response contains content, score it ──
      let viralScore = null;
      if (result.text && result.text.length > 20) {
        try {
          viralScore = await viralScoringEngine.score(result.text);
        } catch {
          // Scoring is optional
        }
      }

      return NextResponse.json({
        text: result.text,
        intent: result.intent,
        confidence: result.confidence,
        suggestedActions: result.suggestedActions,
        brainstorm_ideas: brainstormIdeas,
        viral_score: viralScore,
        provider: 'nexus-brain',
        model: 'nexus-brain-v1',
        note: 'Powered by NexusBrain — a built-in, rule-based content engine that works without external AI keys.',
      });
    } catch (brainError) {
      return jsonError(
        brainError instanceof Error ? brainError.message : 'NexusBrain engine failed.',
        500
      );
    }
  }

  const config = getProviderProxyConfig(provider);
  const origin = request.headers.get('origin') || request.nextUrl.origin;

  const cacheKey = `chat:${provider}:${actualModel}:${Buffer.from(JSON.stringify(normalizedMessages)).toString('base64').slice(0, 64)}`;

  try {
    const result = await cached(
      cacheKey,
      TTL.FIVE_MINUTES,
      async () => {
        return await safeExternalCall(
          'ai_chat',
          async () => {
            const endpoint =
              config.kind === 'gemini'
                ? `${config.endpoint}/${encodeURIComponent(actualModel)}:generateContent`
                : config.endpoint;
            const payload =
              config.kind === 'gemini'
                ? buildGeminiPayload(normalizedMessages)
                : buildOpenAICompatiblePayload(actualModel, normalizedMessages);
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(config.kind === 'gemini' ? { 'x-goog-api-key': apiKey } : {}),
                ...(config.kind === 'openai-compatible' ? { Authorization: `Bearer ${apiKey}` } : {}),
                ...(provider === 'openrouter' ? { 'HTTP-Referer': origin, 'X-Title': 'NexusAI' } : {}),
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
              throw new Error(providerError || `${provider} request failed.`);
            }

            const text = extractProviderText(data);
            if (!text.trim()) {
              throw new Error(`${provider} returned an empty response.`);
            }

            return { text };
          },
          { text: 'AI service is currently unavailable. Please try again later.' },
          { timeoutMs: 30000, retries: 1 }
        );
      },
      [CACHE_TAGS.AI_RESPONSE]
    );

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Provider proxy request failed.', 502);
  }
}

async function scoreAndEnhanceResponse(text: string): Promise<{ viral_score: any; improved_text: string | null }> {
  try {
    const score = await viralScoringEngine.score(text);
    if (score.total < 55 && score.improvements.length > 0) {
      return { viral_score: score, improved_text: null };
    }
    return { viral_score: score, improved_text: null };
  } catch {
    return { viral_score: null, improved_text: null };
  }
}
