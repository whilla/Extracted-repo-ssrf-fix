'use client';

import { kvGet } from './puterService';

export type VideoProvider = 'ltx23' | 'ltx23-open';

export interface VideoGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  provider?: VideoProvider;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  durationSeconds?: number;
  seed?: number;
  imageUrl?: string;
  cameraAngle?: string;
  cameraMotion?: string;
  shotStyle?: string;
  qualityProfile?: 'social' | 'cinematic';
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
const DEFAULT_LTX_OPEN_ENDPOINT = 'http://127.0.0.1:8000/generate';

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

function extractVideoPayload(data: any): GeneratedVideo | null {
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

  const url = typeof first === 'string' ? first : first.url || first.video_url || first.src;
  if (!url) return null;

  return {
    url,
    provider: 'ltx23',
    durationSeconds: Number(
      data?.duration ||
      data?.output?.duration ||
      data?.result?.duration ||
      first.duration ||
      5
    ),
    aspectRatio:
      data?.aspect_ratio ||
      data?.output?.aspect_ratio ||
      data?.result?.aspect_ratio ||
      '16:9',
    thumbnailUrl:
      data?.thumbnail_url ||
      data?.output?.thumbnail_url ||
      data?.result?.thumbnail_url ||
      first.thumbnail_url,
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
  const apiKey = await kvGet('fal_key') || await kvGet('ltx_key');
  if (!apiKey) {
    throw new Error('LTX video provider is not configured. Add a Fal/LTX API key in Settings.');
  }

  const configuredEndpoint = await kvGet('ltx_endpoint') || process.env.NEXT_PUBLIC_LTX_ENDPOINT;
  const endpoint = normalizeFalEndpoint(configuredEndpoint || DEFAULT_LTX_MODEL);
  const {
    prompt,
    negativePrompt,
    aspectRatio = '16:9',
    durationSeconds = 5,
    seed,
    imageUrl,
    cameraAngle,
    cameraMotion,
    shotStyle,
    qualityProfile = 'cinematic',
  } = options;

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
  const configuredEndpoint =
    await kvGet('ltx_open_endpoint') || process.env.NEXT_PUBLIC_LTX_OPEN_ENDPOINT;
  const endpoint = String(configuredEndpoint || DEFAULT_LTX_OPEN_ENDPOINT).trim();

  const {
    prompt,
    negativePrompt,
    aspectRatio = '16:9',
    durationSeconds = 5,
    seed,
    imageUrl,
    cameraAngle,
    cameraMotion,
    shotStyle,
    qualityProfile = 'cinematic',
  } = options;

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
    durationSeconds: Math.min(Math.max(options.durationSeconds || 5, 3), 120),
  };

  const attempts: VideoProvider[] = cleanOptions.provider === 'ltx23-open'
    ? ['ltx23-open', 'ltx23']
    : ['ltx23', 'ltx23-open'];

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
      lastError = error as Error;
      console.warn(`Video generation failed on ${provider}, trying fallback`, lastError);
    }
  }

  throw lastError || new Error('All video providers failed');
}
