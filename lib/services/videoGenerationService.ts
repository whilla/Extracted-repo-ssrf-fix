'use client';

import { kvGet, kvSet } from './puterService';
import { sanitizeApiKey } from './providerCredentialUtils';
import { createConfigError } from './configError';
import { mediaAssetManager, type MediaAsset } from './mediaAssetManager';
import { enhanceVideoPrompt } from './promptEnhancer';

export type VideoProvider = 'ltx23' | 'ltx23-open' | 'runway' | 'pika' | 'stablevideo';

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
  onProgress?: (stage: string, progress: number) => void;
}

export interface GeneratedVideo {
  url: string;
  provider: VideoProvider;
  durationSeconds: number;
  aspectRatio: string;
  thumbnailUrl?: string;
}

const MAX_RETRIES = 0;
const RETRY_DELAY = 1500;
export const DEFAULT_LTX_MODEL = 'fal-ai/ltx-2.3/text-to-video/fast';
const LTX_PROVIDER_TIMEOUT_MS = 240_000;
const LTX_POLL_INTERVAL_MS = 2500;
const LTX_STANDARD_DURATIONS = [6, 8, 10] as const;
const LTX_FAST_DURATIONS = [6, 8, 10, 12, 14, 16, 18, 20] as const;

function normalizeConfiguredValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeLtxEndpointSlug(endpoint: string): string {
  const normalized = normalizeConfiguredValue(endpoint);
  if (!normalized || normalized === 'fal-ai/ltx-video-v2.3') {
    return DEFAULT_LTX_MODEL;
  }
  return normalized;
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

  const fallbackChain: VideoProvider[] = ['ltx23', 'runway', 'pika', 'stablevideo'];
  if (openEndpointConfigured) {
    fallbackChain.unshift('ltx23-open');
  }

  if (preferredProvider === 'ltx23-open' && openEndpointConfigured) {
    return ['ltx23-open', ...fallbackChain.filter(p => p !== 'ltx23')];
  }

  return [preferredProvider, ...fallbackChain.filter(p => p !== preferredProvider)];
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

function nearestAllowedDuration(durationSeconds: number, allowed: readonly number[]): number {
  return allowed.reduce((best, candidate) =>
    Math.abs(candidate - durationSeconds) < Math.abs(best - durationSeconds) ? candidate : best
  );
}

export function normalizeLtxAspectRatio(aspectRatio: VideoGenerationOptions['aspectRatio'] = '16:9'): '16:9' | '9:16' {
  return aspectRatio === '16:9' ? '16:9' : '9:16';
}

export function normalizeLtxDuration(durationSeconds = 8, endpoint = DEFAULT_LTX_MODEL): number {
  const rounded = Math.round(Number.isFinite(durationSeconds) ? durationSeconds : 8);
  const allowed = endpoint.includes('/fast') ? LTX_FAST_DURATIONS : LTX_STANDARD_DURATIONS;
  return nearestAllowedDuration(Math.min(Math.max(rounded, allowed[0]), allowed[allowed.length - 1]), allowed);
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

export function buildLtxRequestPayload(
  options: VideoGenerationOptions,
  endpoint = DEFAULT_LTX_MODEL
): Record<string, unknown> {
  const prompt = buildEnhancedVideoPrompt(options);
  const negativePrompt = buildEnhancedVideoNegativePrompt(options);
  const normalizedAspectRatio = normalizeLtxAspectRatio(options.aspectRatio);
  const normalizedDuration = normalizeLtxDuration(options.durationSeconds, endpoint);
  const qualityProfile = options.qualityProfile || 'cinematic';

  return {
    prompt: negativePrompt
      ? `${prompt} Avoid: ${negativePrompt}.`
      : prompt,
    aspect_ratio: normalizedAspectRatio,
    duration: normalizedDuration,
    resolution: qualityProfile === 'netflix' ? '1080p' : '720p',
    fps: 24,
    generate_audio: true,
    ...(typeof options.seed === 'number' ? { seed: options.seed } : {}),
    ...(options.imageUrl ? { image_url: options.imageUrl } : {}),
  };
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

async function safeFetch(url: string, options: RequestInit, timeoutMs = 60000): Promise<Response> {
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

async function fetchFalResult(resultUrl: string, apiKey: string): Promise<GeneratedVideo> {
  const response = await safeFetch(resultUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Key ${apiKey}`,
    },
  }, 30000);

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`LTX result fetch failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const parsed = extractVideoPayload(data);
  if (parsed) return parsed;

  throw new Error('LTX provider completed but did not return a playable video URL');
}

async function pollFalJob(statusUrl: string, apiKey: string, responseUrl?: string): Promise<GeneratedVideo> {
  const startedAt = Date.now();
  let resultUrl = responseUrl;
  while (Date.now() - startedAt < LTX_PROVIDER_TIMEOUT_MS) {
    await sleep(LTX_POLL_INTERVAL_MS);

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
    const immediateResult = extractVideoPayload(data);
    if (immediateResult) return immediateResult;

    const status = String(data?.status || data?.state || '').toUpperCase();
    resultUrl =
      resultUrl ||
      (typeof data?.response_url === 'string' ? data.response_url : undefined) ||
      (typeof data?.responseUrl === 'string' ? data.responseUrl : undefined);

    if (status.includes('COMPLETED') || status.includes('SUCCESS')) {
      const parsed = extractVideoPayload(data);
      if (parsed) return parsed;
      if (resultUrl) return fetchFalResult(resultUrl, apiKey);
    }

    if (status.includes('FAILED') || status.includes('ERROR')) {
      throw new Error(data?.error || data?.message || 'LTX generation failed');
    }
  }

  throw new Error(`LTX generation timed out after ${Math.round(LTX_PROVIDER_TIMEOUT_MS / 60_000)} minutes. Check the provider job/credits, then retry or switch video provider.`);
}

/**
 * Generate video with Runway Gen-3 API
 * API: https://docs.runwayml.com/
 */
async function generateWithRunway(options: VideoGenerationOptions): Promise<GeneratedVideo> {
  const apiKey = sanitizeApiKey(await kvGet('runway_key'));
  if (!apiKey) {
    throw createConfigError('runway');
  }

  const { prompt, durationSeconds = 10, aspectRatio = '16:9', imageUrl } = options;

  // Runway Gen-3 API uses a job-based workflow
  // Step 1: Create a video generation task
  const createResponse = await safeFetch('https://api.runwayml.com/v1/video generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify({
      model: 'gen-3',
      prompt: buildEnhancedVideoPrompt(options),
      duration: Math.min(Math.max(durationSeconds, 4), 30),
      ratio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '1:1' ? '1:1' : '16:9',
      ...(imageUrl ? { image_url: imageUrl } : {}),
    }),
  }, 60000);

  if (!createResponse.ok) {
    const errorText = await createResponse.text().catch(() => createResponse.statusText);
    throw new Error(`Runway API error (${createResponse.status}): ${errorText}`);
  }

  const createData = await createResponse.json();
  const taskId = createData.id;

  if (!taskId) {
    throw new Error('Runway did not return a task ID');
  }

  // Step 2: Poll for completion (max 2 minutes)
  const startTime = Date.now();
  while (Date.now() - startTime < LTX_PROVIDER_TIMEOUT_MS) {
    await sleep(LTX_POLL_INTERVAL_MS);

    const statusResponse = await safeFetch(`https://api.runwayml.com/v1/video_generations/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
    }, 30000);

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text().catch(() => statusResponse.statusText);
      throw new Error(`Runway status check failed (${statusResponse.status}): ${errorText}`);
    }

    const statusData = await statusResponse.json();
    const status = String(statusData.status || '').toLowerCase();

    if (status === 'completed' || status === 'succeeded') {
      const videoUrl = statusData.videoUrl || statusData.outputUrl || statusData.url;
      if (!videoUrl) {
        throw new Error('Runway completed but did not return a video URL');
      }
      return {
        url: videoUrl,
        provider: 'runway',
        durationSeconds: statusData.duration || durationSeconds,
        aspectRatio: statusData.ratio || aspectRatio,
        thumbnailUrl: statusData.thumbnailUrl,
      };
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(statusData.error || statusData.message || 'Runway generation failed');
    }
  }

  throw new Error(`Runway generation timed out after ${Math.round(LTX_PROVIDER_TIMEOUT_MS / 60_000)} minutes`);
}

/**
 * Generate video with Pika Labs API
 * API: https://docs.pika.art/
 */
async function generateWithPika(options: VideoGenerationOptions): Promise<GeneratedVideo> {
  const apiKey = sanitizeApiKey(await kvGet('pika_key'));
  if (!apiKey) {
    throw createConfigError('pika');
  }

  const { prompt, durationSeconds = 3, aspectRatio = '16:9', imageUrl } = options;

  // Pika API v2 - Create video generation
  const createResponse = await safeFetch('https://api.pika.art/v2/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: buildEnhancedVideoPrompt(options),
      duration: Math.min(Math.max(durationSeconds, 1), 10),
      aspect_ratio: aspectRatio,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    }),
  }, 60000);

  if (!createResponse.ok) {
    const errorText = await createResponse.text().catch(() => createResponse.statusText);
    throw new Error(`Pika API error (${createResponse.status}): ${errorText}`);
  }

  const createData = await createResponse.json();
  const taskId = createData.id;

  if (!taskId) {
    throw new Error('Pika did not return a task ID');
  }

  // Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < LTX_PROVIDER_TIMEOUT_MS) {
    await sleep(LTX_POLL_INTERVAL_MS);

    const statusResponse = await safeFetch(`https://api.pika.art/v2/generation/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }, 30000);

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text().catch(() => statusResponse.statusText);
      throw new Error(`Pika status check failed (${statusResponse.status}): ${errorText}`);
    }

    const statusData = await statusResponse.json();
    const status = String(statusData.status || '').toLowerCase();

    if (status === 'completed' || status === 'done') {
      const videoUrl = statusData.video_url || statusData.url || statusData.output?.url;
      if (!videoUrl) {
        throw new Error('Pika completed but did not return a video URL');
      }
      return {
        url: videoUrl,
        provider: 'pika',
        durationSeconds: statusData.duration || durationSeconds,
        aspectRatio: statusData.aspect_ratio || aspectRatio,
        thumbnailUrl: statusData.thumbnail_url,
      };
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(statusData.error || statusData.message || 'Pika generation failed');
    }
  }

  throw new Error(`Pika generation timed out after ${Math.round(LTX_PROVIDER_TIMEOUT_MS / 60_000)} minutes`);
}

/**
 * Generate video with Stability AI Video API
 * API: https://platform.stability.ai/docs/api/spec-video
 */
async function generateWithStableVideo(options: VideoGenerationOptions): Promise<GeneratedVideo> {
  const apiKey = sanitizeApiKey(await kvGet('stability_key'));
  if (!apiKey) {
    throw createConfigError('stability');
  }

  const { prompt, durationSeconds = 5, aspectRatio = '16:9', imageUrl } = options;

  // Stability Video API v2 - Generate video
  const createResponse = await safeFetch('https://api.stability.ai/v2/generation/video', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: buildEnhancedVideoPrompt(options),
      duration: Math.min(Math.max(durationSeconds, 2), 15),
      aspect_ratio: aspectRatio,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    }),
  }, 60000);

  if (!createResponse.ok) {
    const errorText = await createResponse.text().catch(() => createResponse.statusText);
    throw new Error(`Stability AI API error (${createResponse.status}): ${errorText}`);
  }

  const createData = await createResponse.json();
  const taskId = createData.id;

  if (!taskId) {
    throw new Error('Stability AI did not return a task ID');
  }

  // Poll for completion
  const startTime = Date.now();
  while (Date.now() - startTime < LTX_PROVIDER_TIMEOUT_MS) {
    await sleep(LTX_POLL_INTERVAL_MS);

    const statusResponse = await safeFetch(`https://api.stability.ai/v2/generation/video/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    }, 30000);

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text().catch(() => statusResponse.statusText);
      throw new Error(`Stability AI status check failed (${statusResponse.status}): ${errorText}`);
    }

    const statusData = await statusResponse.json();
    const status = String(statusData.status || '').toLowerCase();

    if (status === 'completed' || status === 'succeeded') {
      const videoUrl = statusData.video_url || statusData.url || statusData.output?.video_url;
      if (!videoUrl) {
        throw new Error('Stability AI completed but did not return a video URL');
      }
      return {
        url: videoUrl,
        provider: 'stablevideo',
        durationSeconds: statusData.duration || durationSeconds,
        aspectRatio: statusData.aspect_ratio || aspectRatio,
        thumbnailUrl: statusData.thumbnail_url,
      };
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(statusData.error || statusData.message || 'Stability AI generation failed');
    }
  }

  throw new Error(`Stability AI generation timed out after ${Math.round(LTX_PROVIDER_TIMEOUT_MS / 60_000)} minutes`);
}

async function generateWithLtx23(options: VideoGenerationOptions): Promise<GeneratedVideo> {
  let apiKey = sanitizeApiKey((await kvGet('fal_key')) || (await kvGet('ltx_key')));
  if (!apiKey) {
    apiKey = process.env.LTX_API_KEY || process.env.FAL_API_KEY || '';
  }
  if (!apiKey) {
    throw createConfigError('ltx');
  }

  const configuredEndpoint = await kvGet('ltx_endpoint') || process.env.NEXT_PUBLIC_LTX_ENDPOINT;
  const rawEndpoint = normalizeLtxEndpointSlug(configuredEndpoint || DEFAULT_LTX_MODEL);
  const endpoint = normalizeFalEndpoint(rawEndpoint);
  const requestPayload = buildLtxRequestPayload(options, rawEndpoint);

  return withRetry(async () => {
    const response = await safeFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKey}`,
      },
      body: JSON.stringify(requestPayload),
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
    const responseUrl =
      data?.response_url ||
      data?.responseUrl ||
      data?.urls?.result ||
      data?.urls?.response;

    if (statusUrl) {
      return pollFalJob(statusUrl, apiKey, responseUrl);
    }

    if (responseUrl) {
      return fetchFalResult(responseUrl, apiKey);
    }

    throw new Error('LTX provider did not return a playable video URL');
  });
}

async function generateWithOpenLtx23(options: VideoGenerationOptions): Promise<GeneratedVideo> {
  const rawConfiguredEndpoint = normalizeConfiguredValue(
    (await kvGet('ltx_open_endpoint')) || process.env.NEXT_PUBLIC_LTX_OPEN_ENDPOINT
  );

  if (!rawConfiguredEndpoint) {
    throw createConfigError('ltx_open');
  }

  if (!isReachableOpenLtxEndpoint(rawConfiguredEndpoint)) {
    if (isLoopbackEndpoint(rawConfiguredEndpoint)) {
      throw new Error('LTX 2.3 Open points at localhost. Run the app locally or save a reachable HTTPS endpoint in Settings.');
    }

    throw createConfigError('ltx_open');
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

export async function generateVideo(options: VideoGenerationOptions): Promise<MediaAsset> {
  const prompt = options.prompt?.trim();
  if (!prompt) {
    throw new Error('Video prompt cannot be empty');
  }

  const cleanOptions: VideoGenerationOptions = {
    ...options,
    prompt: enhanceVideoPrompt(prompt).substring(0, 1500),
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

  const totalProviders = attempts.length;

  for (let i = 0; i < attempts.length; i++) {
    const provider = attempts[i];
    try {
      let videoResult: GeneratedVideo;
      const isFallback = i > 0;
      
      // Report progress at start of each provider attempt
      options.onProgress?.(isFallback ? `Fallback: Trying ${provider}...` : `Generating video with ${provider}...`, Math.round((i / totalProviders) * 90) + 5);
      
      switch (provider) {
        case 'ltx23-open':
          videoResult = await generateWithOpenLtx23({ ...cleanOptions, provider });
          break;
        case 'runway':
          videoResult = await generateWithRunway({ ...cleanOptions, provider });
          break;
        case 'pika':
          videoResult = await generateWithPika({ ...cleanOptions, provider });
          break;
        case 'stablevideo':
          videoResult = await generateWithStableVideo({ ...cleanOptions, provider });
          break;
        case 'ltx23':
        default:
          videoResult = await generateWithLtx23({ ...cleanOptions, provider });
          break;
      }
      
      options.onProgress?.(`${provider} completed!`, 100);
      
      return mediaAssetManager.wrapAsset(videoResult.url, 'video', provider, {
        duration: videoResult.durationSeconds,
        aspectRatio: videoResult.aspectRatio,
        thumbnailUrl: videoResult.thumbnailUrl
      });
    } catch (error) {
      lastError = pickMoreRelevantVideoError(lastError, error as Error);
      console.warn(`Video generation failed on ${provider}, trying fallback`, lastError);
      options.onProgress?.(`${provider} failed, trying next provider...`, Math.round((i / totalProviders) * 90) + 10);
    }
  }

  options.onProgress?.('All video providers failed', 0);
  throw lastError || new Error('All video providers failed');
}
