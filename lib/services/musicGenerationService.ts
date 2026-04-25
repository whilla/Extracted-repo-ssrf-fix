'use client';

import { kvGet, kvSet } from './puterService';

export type MusicProvider = 'suno' | 'musicfy' | 'dadabots' | 'jukebox' | 'amper' | 'soundraw' | 'beatoven' | 'aiva';

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

// Helper for retrying failed requests
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

// Safe fetch wrapper with timeout
async function safeFetch(url: string, options: RequestInit, timeoutMs = 60000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

interface MusicGenerationOptions {
  prompt: string;
  duration?: number;
  genre?: string;
  provider?: MusicProvider;
  style?: string;
  tempo?: number;
}

interface MusicModel {
  id: string;
  name: string;
  provider: MusicProvider;
  maxDuration: number;
  freeCredit: number;
  requiresAuth: boolean;
}

// Available music generation models
const MUSIC_MODELS: MusicModel[] = [
  // Jukebox (Meta) - Free API access
  {
    id: 'jukebox-meta',
    name: 'Meta Jukebox (Free)',
    provider: 'jukebox',
    maxDuration: 60,
    freeCredit: 20,
    requiresAuth: true,
  },
  // Amper Music (Free trial)
  {
    id: 'amper-free',
    name: 'Amper Music (Free Trial)',
    provider: 'amper',
    maxDuration: 120,
    freeCredit: 3,
    requiresAuth: true,
  },
  // SoundRaw (Free generation with watermark)
  {
    id: 'soundraw-free',
    name: 'SoundRaw (Free)',
    provider: 'soundraw',
    maxDuration: 60,
    freeCredit: 10,
    requiresAuth: true,
  },
  // Suno AI (Premium)
  {
    id: 'suno-pro',
    name: 'Suno AI (Premium)',
    provider: 'suno',
    maxDuration: 180,
    freeCredit: 0,
    requiresAuth: true,
  },
];

function unsupportedProviderError(provider: MusicProvider): Error {
  return new Error(`${provider} is not wired to a production music API in this build`);
}

/**
 * Generate music using Musicfy API (Free tier available)
 */
async function generateWithMusicfy(options: MusicGenerationOptions): Promise<string> {
  void options;
  throw unsupportedProviderError('musicfy');
}

/**
 * Generate music using Dadabots (Free, AI metal/experimental music)
 */
async function generateWithDadabots(options: MusicGenerationOptions): Promise<string> {
  void options;
  throw unsupportedProviderError('dadabots');
}

/**
 * Generate music using Meta Jukebox (requires Auth, but free API)
 */
async function generateWithJukebox(options: MusicGenerationOptions): Promise<string> {
  try {
    const apiKey = await kvGet('jukebox_key');
    if (!apiKey) {
      throw new Error('Jukebox API key not configured. Get a free key at huggingface.co');
    }

    const { prompt, duration = 60, genre = 'pop' } = options;

    // Meta Jukebox API call
    const response = await fetch('https://api-inference.huggingface.co/models/facebook/jukebox', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {
          prompt,
          duration,
          genre,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Jukebox API error: ${response.statusText}`);
    }

    const result = await response.json();
    const trackId = `jukebox_${Date.now()}`;
    await kvSet(`music_${trackId}`, JSON.stringify(result));
    
    return trackId;
  } catch (error) {
    console.error('Jukebox generation error:', error);
    throw error;
  }
}

/**
 * Generate music using Amper Music API (Free trial available)
 */
async function generateWithAmper(options: MusicGenerationOptions): Promise<string> {
  try {
    const apiKey = await kvGet('amper_key');
    if (!apiKey) {
      throw new Error('Amper Music API key not configured. Get a free trial at ampermusic.com');
    }

    const { prompt, duration = 120, genre = 'background', tempo = 120 } = options;

    const response = await fetch('https://api.ampermusic.com/api/v1/compose', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: prompt,
        duration,
        genre,
        tempo,
        mood: 'uplifting',
      }),
    });

    if (!response.ok) {
      throw new Error(`Amper API error: ${response.statusText}`);
    }

    const result = await response.json();
    const trackId = `amper_${Date.now()}`;
    await kvSet(`music_${trackId}`, JSON.stringify(result));
    
    return trackId;
  } catch (error) {
    console.error('Amper generation error:', error);
    throw error;
  }
}

/**
 * Generate music using SoundRaw (Free with watermark)
 */
async function generateWithSoundraw(options: MusicGenerationOptions): Promise<string> {
  try {
    const apiKey = await kvGet('soundraw_key');
    if (!apiKey) {
      throw new Error('SoundRaw API key not configured. Get a free key at soundraw.io');
    }

    const { prompt, duration = 60, genre = 'ambient', style = 'cinematic' } = options;

    const response = await fetch('https://api.soundraw.io/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        duration,
        genre,
        style,
        format: 'mp3',
      }),
    });

    if (!response.ok) {
      throw new Error(`SoundRaw API error: ${response.statusText}`);
    }

    const result = await response.json();
    const trackId = `soundraw_${Date.now()}`;
    await kvSet(`music_${trackId}`, JSON.stringify(result));
    
    return trackId;
  } catch (error) {
    console.error('SoundRaw generation error:', error);
    throw error;
  }
}

/**
 * Generate music using Suno AI (Premium, requires API key)
 */
async function generateWithSuno(options: MusicGenerationOptions): Promise<string> {
  const apiKey = await kvGet('suno_key');
  if (!apiKey || apiKey.length < 10) {
    throw new Error('Suno AI API key not configured. Get a key at suno.ai');
  }

  const { prompt, duration = 180, style = 'pop' } = options;

  // Validate duration
  const safeDuration = Math.min(Math.max(duration, 15), 180);

  return withRetry(async () => {
    const response = await safeFetch(
      'https://api.suno.ai/api/generate',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.substring(0, 500), // Limit prompt length
          duration: safeDuration,
          style,
        }),
      },
      60000
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Suno API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const trackId = `suno_${Date.now()}`;
    await kvSet(`music_${trackId}`, JSON.stringify(result));
    
    return trackId;
  });
}

/**
 * Main function to generate music - automatically selects best available provider
 */
export async function generateMusic(options: MusicGenerationOptions): Promise<string> {
  const { prompt, provider, duration = 30 } = options;

  // Validate inputs
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Music prompt cannot be empty');
  }

  const safeDuration = Math.min(Math.max(duration, 15), 180);
  const safeOptions = { ...options, duration: safeDuration };

  // If provider specified, use it with fallback
  if (provider) {
    try {
      switch (provider) {
        case 'musicfy':
          return await generateWithMusicfy(safeOptions);
        case 'dadabots':
          return await generateWithDadabots(safeOptions);
        case 'jukebox':
          return await generateWithJukebox(safeOptions);
        case 'amper':
          return await generateWithAmper(safeOptions);
        case 'soundraw':
          return await generateWithSoundraw(safeOptions);
        case 'suno':
          return await generateWithSuno(safeOptions);
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (error) {
      console.warn(`Provider ${provider} failed, falling back:`, error);
      // Fall through to auto-select
    }
  }

  // Auto-select best available provider with graceful fallback
  const providerAttempts: Array<{ check: () => Promise<boolean>; generate: () => Promise<string> }> = [
    { 
      check: async () => !!(await kvGet('suno_key')), 
      generate: () => generateWithSuno(safeOptions) 
    },
    { 
      check: async () => !!(await kvGet('amper_key')), 
      generate: () => generateWithAmper(safeOptions) 
    },
    { 
      check: async () => !!(await kvGet('soundraw_key')), 
      generate: () => generateWithSoundraw(safeOptions) 
    },
    { 
      check: async () => !!(await kvGet('jukebox_key')), 
      generate: () => generateWithJukebox(safeOptions) 
    },
  ];

  for (const attempt of providerAttempts) {
    try {
      if (await attempt.check()) {
        return await attempt.generate();
      }
    } catch (error) {
      console.warn('Provider attempt failed, trying next:', error);
      continue;
    }
  }

  throw new Error('No configured production music provider is available');
}

/**
 * Get available music generation models
 */
export async function getAvailableMusicModels(): Promise<MusicModel[]> {
  const available = MUSIC_MODELS.filter(m => !m.requiresAuth);

  // Check which premium providers are configured
  const sunoKey = await kvGet('suno_key');
  if (sunoKey) {
    available.push(MUSIC_MODELS.find(m => m.provider === 'suno')!);
  }

  const amperKey = await kvGet('amper_key');
  if (amperKey) {
    available.push(MUSIC_MODELS.find(m => m.provider === 'amper')!);
  }

  const soundrawKey = await kvGet('soundraw_key');
  if (soundrawKey) {
    available.push(MUSIC_MODELS.find(m => m.provider === 'soundraw')!);
  }

  const jukeboxKey = await kvGet('jukebox_key');
  if (jukeboxKey) {
    available.push(MUSIC_MODELS.find(m => m.provider === 'jukebox')!);
  }

  return available;
}

/**
 * Configure a music generation provider
 */
export async function configureMusicProvider(
  provider: MusicProvider,
  apiKey: string
): Promise<void> {
  const keyMap: Record<MusicProvider, string> = {
    'suno': 'suno_key',
    'musicfy': 'musicfy_key',
    'dadabots': 'dadabots_key',
    'jukebox': 'jukebox_key',
    'amper': 'amper_key',
    'soundraw': 'soundraw_key',
    'beatoven': 'beatoven_key',
    'aiva': 'aiva_key',
  };

  const keyName = keyMap[provider];
  if (keyName) {
    await kvSet(keyName, apiKey);
  }
}

/**
 * Get music generation status
 */
export async function getMusicStatus(trackId: string): Promise<Record<string, any> | null> {
  const data = await kvGet(`music_${trackId}`);
  return data ? JSON.parse(data) : null;
}
