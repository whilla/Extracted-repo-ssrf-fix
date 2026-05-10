'use client';

import { kvGet, kvSet } from './puterService';
import { hasConfiguredSecret, sanitizeApiKey } from './providerCredentialUtils';
import { mediaAssetManager, type MediaAsset } from './mediaAssetManager';

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

export type MusicProvider = 'suno' | 'musicfy' | 'dadabots' | 'jukebox' | 'amper' | 'soundraw' | 'beatoven' | 'aiva';

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
  onProgress?: (stage: string, progress: number) => void;
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
  // Musicfy (Free tier available)
  {
    id: 'musicfy-free',
    name: 'Musicfy (Free)',
    provider: 'musicfy',
    maxDuration: 120,
    freeCredit: 15,
    requiresAuth: true,
  },
  // Dadabots (Free via HuggingFace)
  {
    id: 'dadabots-free',
    name: 'Dadabots (Free)',
    provider: 'dadabots',
    maxDuration: 30,
    freeCredit: 50,
    requiresAuth: true,
  },
  // Beatoven (Free 15 mins/mo)
  {
    id: 'beatoven-free',
    name: 'Beatoven (Free)',
    provider: 'beatoven',
    maxDuration: 120,
    freeCredit: 15,
    requiresAuth: true,
  },
  // AIVA (Free tier available)
  {
    id: 'aiva-free',
    name: 'AIVA (Free)',
    provider: 'aiva',
    maxDuration: 180,
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
  try {
    let apiKey = sanitizeApiKey(await kvGet('musicfy_key'));
    if (!apiKey) {
      apiKey = process.env.MUSICFY_API_KEY || '';
    }
    if (!apiKey) {
      throw new Error('Musicfy API key not configured. Get a free key at musicfy.ai');
    }

    const { prompt, duration = 60, style = 'pop' } = options;
    const safeDuration = Math.min(Math.max(duration, 15), 180);

    const response = await safeFetch(
      'https://api.musicfy.ai/v1/generate',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          duration: safeDuration,
          style,
        }),
      },
      60000
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Musicfy API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const trackId = `musicfy_${Date.now()}`;
    await kvSet(`music_${trackId}`, JSON.stringify(result));
    
    return trackId;
  } catch (error) {
    console.error('Musicfy generation error:', error);
    throw error;
  }
}

/**
 * Generate music using Dadabots (Free, AI metal/experimental music via HuggingFace)
 */
async function generateWithDadabots(options: MusicGenerationOptions): Promise<string> {
  try {
    let apiKey = sanitizeApiKey(await kvGet('dadabots_key'));
    if (!apiKey) {
      apiKey = process.env.HUGGINGFACE_API_KEY || '';
    }
    if (!apiKey) {
      throw new Error('HuggingFace API key not configured for Dadabots. Get a free key at huggingface.co');
    }

    const { prompt, duration = 30, genre = 'metal' } = options;

    // Dadabots uses a specific model on HuggingFace
    const response = await safeFetch(
      'https://api-inference.huggingface.co/models/facebook/musicgen-stereo',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            duration: Math.min(duration, 30),
            temperature: 0.9,
          },
        }),
      },
      120000
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Dadabots API error (${response.status}): ${errorText}`);
    }

    const result = await response.arrayBuffer();
    const trackId = `dadabots_${Date.now()}`;
    await kvSet(`music_${trackId}`, JSON.stringify({ 
      audioData: 'base64-encoded-audio', 
      format: 'wav',
      provider: 'dadabots' 
    }));
    
    return trackId;
  } catch (error) {
    console.error('Dadabots generation error:', error);
    throw error;
  }
}

/**
 * Generate music using Meta Jukebox (requires Auth, but free API)
 */
async function generateWithJukebox(options: MusicGenerationOptions): Promise<string> {
  try {
    const apiKey = sanitizeApiKey(await kvGet('jukebox_key'));
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
    const apiKey = sanitizeApiKey(await kvGet('amper_key'));
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
    const apiKey = sanitizeApiKey(await kvGet('soundraw_key'));
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
 * Generate music using Beatoven AI (Free tier available - 15 mins/mo)
 */
async function generateWithBeatoven(options: MusicGenerationOptions): Promise<string> {
  try {
    let apiKey = sanitizeApiKey(await kvGet('beatoven_key'));
    if (!apiKey) {
      apiKey = process.env.BEATOVEN_API_KEY || '';
    }
    if (!apiKey) {
      throw new Error('Beatoven API key not configured. Get a free key at beatoven.ai');
    }

    const { prompt, duration = 60, genre = 'cinematic' } = options;
    const safeDuration = Math.min(Math.max(duration, 15), 120);

    const response = await safeFetch(
      'https://api.beatoven.ai/api/v1/compose',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: prompt,
          duration: safeDuration,
          genre,
          mood: 'neutral',
        }),
      },
      60000
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Beatoven API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const trackId = `beatoven_${Date.now()}`;
    await kvSet(`music_${trackId}`, JSON.stringify(result));
    
    return trackId;
  } catch (error) {
    console.error('Beatoven generation error:', error);
    throw error;
  }
}

/**
 * Generate music using AIVA (Free tier available)
 */
async function generateWithAIVA(options: MusicGenerationOptions): Promise<string> {
  try {
    let apiKey = sanitizeApiKey(await kvGet('aiva_key'));
    if (!apiKey) {
      apiKey = process.env.AIVA_API_KEY || '';
    }
    if (!apiKey) {
      throw new Error('AIVA API key not configured. Get a free key at aiva.ai');
    }

    const { prompt, duration = 60, genre = 'cinematic', style = 'orchestral' } = options;
    const safeDuration = Math.min(Math.max(duration, 15), 180);

    const response = await safeFetch(
      'https://api.aiva.ai/v1/generate',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          duration: safeDuration,
          genre,
          style,
          temperature: 0.8,
        }),
      },
      60000
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`AIVA API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const trackId = `aiva_${Date.now()}`;
    await kvSet(`music_${trackId}`, JSON.stringify(result));
    
    return trackId;
  } catch (error) {
    console.error('AIVA generation error:', error);
    throw error;
  }
}

/**
 * Generate music using Suno AI (Premium, requires API key)
 */
async function generateWithSuno(options: MusicGenerationOptions): Promise<string> {
  let apiKey = sanitizeApiKey(await kvGet('suno_key'));
  if (!apiKey) {
    apiKey = process.env.SUNO_API_KEY || '';
  }
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
      options.onProgress?.(`Generating music with ${provider}...`, 5);
      switch (provider) {
        case 'musicfy':
          const result1 = await generateWithMusicfy(safeOptions);
          options.onProgress?.(`${provider} completed!`, 100);
          return result1;
        case 'dadabots':
          const result2 = await generateWithDadabots(safeOptions);
          options.onProgress?.(`${provider} completed!`, 100);
          return result2;
        case 'jukebox':
          const result3 = await generateWithJukebox(safeOptions);
          options.onProgress?.(`${provider} completed!`, 100);
          return result3;
        case 'amper':
          const result4 = await generateWithAmper(safeOptions);
          options.onProgress?.(`${provider} completed!`, 100);
          return result4;
        case 'soundraw':
          const result5 = await generateWithSoundraw(safeOptions);
          options.onProgress?.(`${provider} completed!`, 100);
          return result5;
        case 'beatoven':
          const result6 = await generateWithBeatoven(safeOptions);
          options.onProgress?.(`${provider} completed!`, 100);
          return result6;
        case 'aiva':
          const result7 = await generateWithAIVA(safeOptions);
          options.onProgress?.(`${provider} completed!`, 100);
          return result7;
        case 'suno':
          const result8 = await generateWithSuno(safeOptions);
          options.onProgress?.(`${provider} completed!`, 100);
          return result8;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (error) {
      console.warn(`Provider ${provider} failed, falling back:`, error);
      options.onProgress?.(`${provider} failed, trying fallback providers...`, 20);
      // Fall through to auto-select
    }
  }

  // Auto-select best available provider with graceful fallback
  const providerAttempts: Array<{ provider: MusicProvider; check: () => Promise<boolean>; generate: () => Promise<string> }> = [
    { 
      provider: 'suno',
      check: async () => !!(await kvGet('suno_key')) || !!process.env.SUNO_API_KEY,
      generate: () => generateWithSuno(safeOptions) 
    },
    { 
      provider: 'amper',
      check: async () => !!(await kvGet('amper_key')) || !!process.env.AMPER_API_KEY,
      generate: () => generateWithAmper(safeOptions) 
    },
    { 
      provider: 'soundraw',
      check: async () => !!(await kvGet('soundraw_key')) || !!process.env.SOUNDRAW_API_KEY,
      generate: () => generateWithSoundraw(safeOptions) 
    },
    { 
      provider: 'jukebox',
      check: async () => !!(await kvGet('jukebox_key')) || !!process.env.HUGGINGFACE_API_KEY,
      generate: () => generateWithJukebox(safeOptions) 
    },
    { 
      provider: 'beatoven',
      check: async () => !!(await kvGet('beatoven_key')) || !!process.env.BEATOVEN_API_KEY,
      generate: () => generateWithBeatoven(safeOptions) 
    },
    { 
      provider: 'aiva',
      check: async () => !!(await kvGet('aiva_key')) || !!process.env.AIVA_API_KEY,
      generate: () => generateWithAIVA(safeOptions) 
    },
    { 
      provider: 'musicfy',
      check: async () => !!(await kvGet('musicfy_key')) || !!process.env.MUSICFY_API_KEY,
      generate: () => generateWithMusicfy(safeOptions) 
    },
    { 
      provider: 'dadabots',
      check: async () => !!(await kvGet('dadabots_key')) || !!process.env.HUGGINGFACE_API_KEY,
      generate: () => generateWithDadabots(safeOptions) 
    },
  ];

  for (let i = 0; i < providerAttempts.length; i++) {
    const attempt = providerAttempts[i];
    try {
      if (await attempt.check()) {
        options.onProgress?.(`Generating music with ${attempt.provider}...`, Math.round((i / providerAttempts.length) * 90) + 5);
        const result = await attempt.generate();
        options.onProgress?.(`${attempt.provider} completed!`, 100);
        return result;
      }
    } catch (error) {
      console.warn('Provider attempt failed, trying next:', error);
      options.onProgress?.(`${attempt.provider} failed, trying next...`, Math.round((i / providerAttempts.length) * 90) + 10);
      continue;
    }
  }

  options.onProgress?.('No configured production music provider is available', 0);
  throw new Error('No configured production music provider is available');
}

/**
 * Get available music generation models
 */
export async function getAvailableMusicModels(): Promise<MusicModel[]> {
  const available = MUSIC_MODELS.filter(m => !m.requiresAuth);

  // Check which premium providers are configured
  const sunoKey = sanitizeApiKey(await kvGet('suno_key'));
  if (sunoKey) {
    available.push(MUSIC_MODELS.find(m => m.provider === 'suno')!);
  }

  const amperKey = sanitizeApiKey(await kvGet('amper_key'));
  if (amperKey) {
    available.push(MUSIC_MODELS.find(m => m.provider === 'amper')!);
  }

  const soundrawKey = sanitizeApiKey(await kvGet('soundraw_key'));
  if (soundrawKey) {
    available.push(MUSIC_MODELS.find(m => m.provider === 'soundraw')!);
  }

  const jukeboxKey = sanitizeApiKey(await kvGet('jukebox_key'));
  if (jukeboxKey) {
    available.push(MUSIC_MODELS.find(m => m.provider === 'jukebox')!);
  }

  const beatovenKey = sanitizeApiKey(await kvGet('beatoven_key'));
  if (beatovenKey) {
    available.push({
      id: 'beatoven-free',
      name: 'Beatoven AI (Free tier)',
      provider: 'beatoven',
      maxDuration: 120,
      freeCredit: 15,
      requiresAuth: true,
    });
  }

  const aivaKey = sanitizeApiKey(await kvGet('aiva_key'));
  if (aivaKey) {
    available.push({
      id: 'aiva-free',
      name: 'AIVA (Free tier)',
      provider: 'aiva',
      maxDuration: 180,
      freeCredit: 3,
      requiresAuth: true,
    });
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
    await kvSet(keyName, sanitizeApiKey(apiKey));
  }
}

/**
 * Get music generation status
 */
export async function getMusicStatus(trackId: string): Promise<Record<string, any> | null> {
  const data = await kvGet(`music_${trackId}`);
  return data ? JSON.parse(data) : null;
}
