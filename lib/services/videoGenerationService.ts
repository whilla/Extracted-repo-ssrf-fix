'use client';

import { kvGet } from './puterService.ts';
import { sanitizeApiKey } from './providerCredentialUtils.ts';

export type VideoProvider = 'ltx23' | 'ltx23-open';

export interface VideoGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  provider?: VideoProvider;
  allowProviderFallback?: boolean;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  durationSeconds?: number;
  seed?: number;
  imageUrl?: string;
  cameraAngle?: string;
  cameraMotion?: string;
  shotStyle?: string;
  qualityProfile?: 'social' | 'cinematic' | 'netflix';
}

export interface GeneratedVideo {
  url: string;
  provider: VideoProvider;
  durationSeconds: number;
  aspectRatio: string;
  thumbnailUrl?: string;
}

const MAX_RETRIES = 2;
const RETRY_DELAY = 1500;
const DEFAULT_LTX_MODEL = 'fal-ai/ltx-video-v2.3';

function normalizeConfiguredValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').trim().toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '0.0.0.0' || normalized === '::1';
}

function isLoopbackEndpoint(endpoint: string): boolean {
  try {
    return isLoopbackHost(new URL(endpoint).hostname);
  } catch {
    return false;
  }
}

export function isReachableOpenLtxEndpoint(
  endpoint: string,
  appHostname = typeof window !== 'undefined' ? window.location.hostname : ''
): boolean {
  const trimmed = endpoint.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    if (!isLoopbackHost(parsed.hostname)) {
      return true;
    }

    return isLoopbackHost(appHostname);
  } catch {
    return false;
  }
}

export async function getConfiguredOpenLtxEndpoint(): Promise<string | null> {
  const configuredEndpoint = normalizeConfiguredValue(
    (await kvGet('ltx_open_endpoint')) || process.env.NEXT_PUBLIC_LTX_OPEN_ENDPOINT
  );

  if (!configuredEndpoint) {
    return null;
  }

  return isReachableOpenLtxEndpoint(configuredEndpoint) ? configuredEndpoint : null;
}

export async function hasConfiguredOpenLtxEndpoint(): Promise<boolean> {
  return Boolean(await getConfiguredOpenLtxEndpoint());
}

export function buildVideoProviderAttemptOrder(
  preferredProvider: VideoProvider,
  allowProviderFallback = true,
  openEndpointConfigured = false
): VideoProvider[] {
  if (!allowProviderFallback) {
    return [preferredProvider];
  }

  if (preferredProvider === 'ltx23-open') {
    return ['ltx23-open', 'ltx23'];
  }

  return openEndpointConfigured ? ['ltx23', 'ltx23-open'] : ['ltx23'];
}

function scoreVideoError(error: Error): number {
  const message = error.message.trim().toLowerCase();
  if (!message || message === 'failed to fetch') {
    return 0;
  }

  if (message.includes('not configured') || message.includes('reachable endpoint') || message.includes('localhost')) {
    return 3;
  }

  if (/\b(?:4|5)\d{2}\b/.test(message) || message.includes('timed out') || message.includes('did not return')) {
    return 2;
  }

  return 1;
}

export function pickMoreRelevantVideoError(currentError: Error | null, candidateError: Error): Error {
  if (!currentError) {
    return candidateError;
  }

  return scoreVideoError(candidateError) >= scoreVideoError(currentError) ? candidateError : currentError;
}

interface VideoPayloadShape {
  video?: unknown;
  video_url?: unknown;
  url?: unknown;
  src?: unknown;
  output?: VideoPayloadShape;
  result?: VideoPayloadShape;
  data?: VideoPayloadShape;
  videos?: unknown[];
  duration?: unknown;
  aspect_ratio?: unknown;
  thumbnail_url?: unknown;
}

function buildEnhancedVideoPrompt(options: VideoGenerationOptions): string {
  const {
    prompt,
    aspectRatio = '16:9',
    durationSeconds = 8,
    cameraAngle,
    cameraMotion,
    shotStyle,
    qualityProfile = 'cinematic',
  } = options;

  const formatHint =
    aspectRatio === '9:16'
      ? 'Vertical social-first framing with strong subject readability and immediate visual clarity.'
      : 'Widescreen cinematic framing with depth, spatial continuity, and layered composition.';

  return [
    prompt.trim(),
    formatHint,
    `Duration target: ${durationSeconds} seconds.`,
    `Quality target: ${
      qualityProfile === 'netflix'
        ? 'prestige-streaming cinematic realism, premium production value, natural dramatic performance, elite lighting and lens language'
        : qualityProfile === 'cinematic'
          ? 'premium cinematic realism with believable human performance'
          : 'clean social-native realism with strong clarity'
    }.`,
    cameraAngle ? `Camera angle: ${cameraAngle}.` : 'Camera angle: intentional and physically believable, avoid random viewpoint drift.',
    cameraMotion ? `Camera motion: ${cameraMotion}.` : 'Camera motion: smooth, motivated movement only, no jitter or unnatural warping.',
    shotStyle ? `Shot style: ${shotStyle}.` : 'Shot style: coherent, controlled, filmic, not slideshow-like.',
    'Temporal continuity: keep the same character identity, wardrobe, face structure, skin tone, props, and environment across the clip.',
    'Motion realism: natural body mechanics, realistic walking and hand movement, grounded physics, no rubbery limbs, no AI morphing.',
    'Lighting: believable cinematic lighting with stable exposure, practical motivated light sources, rich contrast, and no flicker.',
    'Output must feel like a directed scene, not AI-generated b-roll.',
  ].join(' ');
}

function buildEnhancedVideoNegativePrompt(options: VideoGenerationOptions): string {
  return [
    options.negativePrompt,
    'low quality',
    'blurry',
    'flicker',
    'frame inconsistency',
    'identity drift',
    'face morphing',
    'rubbery limbs',
    'bad hands',
    'extra fingers',
    'extra limbs',
    'warped anatomy',
    'stiff motion',
    'robotic motion',
    'unnatural eye movement',
    'jittery camera',
    'random zoom',
    'slideshow feel',
    'overprocessed skin',
    'cgi look',
    'cartoon look',
    'text overlay',
    'watermark',
    'logo',
  ]
    .filter(Boolean)
    .join(', ');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      await sleep(delay);
      return withRetry(fn, retries - 1, Math.round(delay * 1.5));
    }
    throw error;
  }
}

async function safeFetch(url: string, options: RequestInit, timeoutMs = 120000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeFalEndpoint(endpoint: string): string {
  if (/^https?:\/\//.test(endpoint)) return endpoint;
  return `https://queue.fal.run/${endpoint.replace(/^\/+/, '')}`;
}

function extractVideoPayload(data: VideoPayloadShape | null | undefined): GeneratedVideo | null {
  const candidates = [
    data?.video,
    data?.video_url,
    data?.url,
    data?.output?.video,
    data?.output?.url,
    data?.result?.video,
    data?.result?.url,
    data?.data?.video,
    data?.data?.url,
    Array.isArray(data?.videos) ? data.videos[0] : null,
    Array.isArray(data?.data?.videos) ? data.data.videos[0] : null,
  ].filter(Boolean);

  const first = candidates[0];
  if (!first) return null;

  let url: string | null = null;
  let firstDuration: number | undefined;
  let firstThumbnail: string | undefined;

  if (typeof first === 'string') {
    url = first;
  } else if (typeof first === 'object' && first !== null) {
    const firstNode = first as VideoPayloadShape;
    const nestedUrl = [firstNode.url, firstNode.video_url, firstNode.src].find(
      candidate => typeof candidate === 'string'
    );
    url = typeof nestedUrl === 'string' ? nestedUrl : null;
    firstDuration = typeof firstNode.duration === 'number' ? firstNode.duration : undefined;
    firstThumbnail =
      typeof firstNode.thumbnail_url === 'string' ? firstNode.thumbnail_url : undefined;
  }

  if (!url) return null;

  const rawAspectRatio =
    data?.aspect_ratio ||
    data?.output?.aspect_ratio ||
    data?.result?.aspect_ratio;
  const aspectRatio = typeof rawAspectRatio === 'string' ? rawAspectRatio : '16:9';

  const rawThumbnail =
    data?.thumbnail_url ||
    data?.output?.thumbnail_url ||
    data?.result?.thumbnail_url ||
    firstThumbnail;
  const thumbnailUrl = typeof rawThumbnail === 'string' ? rawThumbnail : undefined;

  return {
    url,
    provider: 'ltx23',
    durationSeconds: Number(
      data?.duration ||
      data?.output?.duration ||
      data?.result?.duration ||
      firstDuration ||
      5
    ),
    aspectRatio,
    thumbnailUrl,
  };
}

async function pollFalJob(statusUrl: string, apiKey: string): Promise<GeneratedVideo> {
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(2000);

    const response = await safeFetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Key ${apiKey}`,
      },
    }, 30000);

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`LTX status check failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const status = String(data?.status || data?.state || '').toUpperCase();

    if (status.includes('COMPLETED') || status.includes('SUCCESS')) {
      const parsed = extractVideoPayload(data);
      if (parsed) return parsed;
    }

    if (status.includes('FAILED') || status.includes('ERROR')) {
      throw new Error(data?.error || data?.message || 'LTX generation failed');
    }
  }

  throw new Error('LTX generation timed out');
}

async function generateWithLtx23(options: VideoGenerationOptions): Promise<GeneratedVideo> {
  const apiKey = sanitizeApiKey((await kvGet('fal_key')) || (await kvGet('ltx_key')));
  if (!apiKey) {
    throw new Error('LTX video provider is not configured. Add a Fal/LTX API key in Settings.');
  }

  const configuredEndpoint = await kvGet('ltx_endpoint') || process.env.NEXT_PUBLIC_LTX_ENDPOINT;
  const endpoint = normalizeFalEndpoint(configuredEndpoint || DEFAULT_LTX_MODEL);
  const {
    aspectRatio = '16:9',
    durationSeconds = 8,
    seed,
    imageUrl,
    cameraAngle,
    cameraMotion,
    shotStyle,
    qualityProfile = 'cinematic',
  } = options;
  const prompt = buildEnhancedVideoPrompt(options);
  const negativePrompt = buildEnhancedVideoNegativePrompt(options);

  return withRetry(async () => {
    const response = await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        negative_prompt: negativePrompt,
        aspect_ratio: aspectRatio,
        duration: durationSeconds,
        seed,
        image_url: imageUrl,
        camera_angle: cameraAngle,
        camera_motion: cameraMotion,
        shot_style: shotStyle,
        quality_profile: qualityProfile,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`LTX video error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const direct = extractVideoPayload(data);
    if (direct) return direct;

    const statusUrl =
      data?.status_url ||
      data?.response_url ||
      data?.statusUrl ||
      data?.urls?.get;

    if (statusUrl) {
      return pollFalJob(statusUrl, apiKey);
    }

    throw new Error('LTX provider did not return a playable video URL');
  });
}

async function generateWithOpenLtx23(options: VideoGenerationOptions): Promise<GeneratedVideo> {
  const rawConfiguredEndpoint = normalizeConfiguredValue(
    (await kvGet('ltx_open_endpoint')) || process.env.NEXT_PUBLIC_LTX_OPEN_ENDPOINT
  );

  if (!rawConfiguredEndpoint) {
    throw new Error('LTX 2.3 Open is not configured. Add a reachable endpoint in Settings.');
  }

  if (!isReachableOpenLtxEndpoint(rawConfiguredEndpoint)) {
    if (isLoopbackEndpoint(rawConfiguredEndpoint)) {
      throw new Error('LTX 2.3 Open points at localhost. Run the app locally or save a reachable HTTPS endpoint in Settings.');
    }

    throw new Error('LTX 2.3 Open is not configured with a reachable endpoint. Update it in Settings.');
  }

  const endpoint = rawConfiguredEndpoint;

  const {
    aspectRatio = '16:9',
    durationSeconds = 8,
    seed,
    imageUrl,
    cameraAngle,
    cameraMotion,
    shotStyle,
    qualityProfile = 'cinematic',
  } = options;
  const prompt = buildEnhancedVideoPrompt(options);
  const negativePrompt = buildEnhancedVideoNegativePrompt(options);

  return withRetry(async () => {
    const response = await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        negative_prompt: negativePrompt,
        aspect_ratio: aspectRatio,
        duration: durationSeconds,
        seed,
        image_url: imageUrl,
        camera_angle: cameraAngle,
        camera_motion: cameraMotion,
        shot_style: shotStyle,
        quality_profile: qualityProfile,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Open LTX video error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const parsed = extractVideoPayload(data);
    if (!parsed) {
      throw new Error('Open LTX provider did not return a playable video URL');
    }

    return {
      ...parsed,
      provider: 'ltx23-open',
    };
  });
}

export async function generateVideo(options: VideoGenerationOptions): Promise<GeneratedVideo> {
  const prompt = options.prompt?.trim();
  if (!prompt) {
    throw new Error('Video prompt cannot be empty');
  }

  const cleanOptions: VideoGenerationOptions = {
    ...options,
    prompt: prompt.substring(0, 1500),
    provider: options.provider || 'ltx23',
    durationSeconds: Math.min(Math.max(options.durationSeconds || 8, 4), 120),
  };

  const openEndpointConfigured = await hasConfiguredOpenLtxEndpoint();
  const attempts = buildVideoProviderAttemptOrder(
    cleanOptions.provider || 'ltx23',
    cleanOptions.allowProviderFallback !== false,
    openEndpointConfigured
  );

  let lastError: Error | null = null;

  for (const provider of attempts) {
    try {
      switch (provider) {
        case 'ltx23-open':
          return await generateWithOpenLtx23({ ...cleanOptions, provider });
        case 'ltx23':
        default:
          return await generateWithLtx23({ ...cleanOptions, provider });
      }
    } catch (error) {
      lastError = pickMoreRelevantVideoError(lastError, error as Error);
      console.warn(`Video generation failed on ${provider}, trying fallback`, lastError);
    }
  }

  throw lastError || new Error('All video providers failed');
}
