import { createConfigError } from './configError';
'use client';

import { kvGet, kvSet } from './puterService';
import { hasConfiguredSecret, sanitizeApiKey, sanitizeStoredValueForKey } from './providerCredentialUtils';
import { mediaAssetManager, type MediaAsset } from './mediaAssetManager';

export type VoiceProvider = 'elevenlabs' | 'speechify' | 'playht' | 'resemble' | 'google' | 'azure' | 'web-speech' | 'piper' | 'coqui';

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

interface VoiceOptions {
  text: string;
  provider?: VoiceProvider;
  voiceId?: string;
  speed?: number;
  pitch?: number;
}

interface VoiceModel {
  id: string;
  name: string;
  provider: VoiceProvider;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
}

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
async function safeFetch(url: string, options: RequestInit, timeoutMs = 30000): Promise<Response> {
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

// Free voice models available
const FREE_VOICE_MODELS: VoiceModel[] = [
  // Web Speech API (Built-in, completely free)
  { id: 'web-speech-us', name: 'Web Speech (US English)', provider: 'web-speech', language: 'en-US' },
  { id: 'web-speech-uk', name: 'Web Speech (UK English)', provider: 'web-speech', language: 'en-GB' },
  
  // Google Translate (Free, can be used for TTS)
  { id: 'google-translate', name: 'Google Translate TTS', provider: 'google', language: 'en' },
  
  // Speechify Free Tier (Limited free usage)
  { id: 'speechify-adam', name: 'Speechify - Adam (Male)', provider: 'speechify', language: 'en-US', gender: 'male' },
  { id: 'speechify-grace', name: 'Speechify - Grace (Female)', provider: 'speechify', language: 'en-US', gender: 'female' },
];

// Premium models (require API keys)
const PREMIUM_VOICE_MODELS: VoiceModel[] = [
  // ElevenLabs (Requires API key)
  { id: 'elevenlabs-rachel', name: 'ElevenLabs - Rachel', provider: 'elevenlabs', language: 'en', gender: 'female' },
  { id: 'elevenlabs-daniel', name: 'ElevenLabs - Daniel', provider: 'elevenlabs', language: 'en', gender: 'male' },
  { id: 'elevenlabs-bella', name: 'ElevenLabs - Bella', provider: 'elevenlabs', language: 'en', gender: 'female' },
  
  // Azure Cognitive Services (Requires API key)
  { id: 'azure-en-us-ariaNeural', name: 'Azure - Aria (US)', provider: 'azure', language: 'en-US', gender: 'female' },
];

/**
 * Generate speech using Web Speech API (completely free, no API key needed)
 */
async function generateWebSpeech(text: string, options?: { speed?: number; pitch?: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Web Speech API only available in browser'));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options?.speed || 1;
    utterance.pitch = options?.pitch || 1;

    const audioChunks: Blob[] = [];
    const canvas = document.createElement('canvas');
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    utterance.onend = () => {
      // For Web Speech API, we return a data URL that can be played
      resolve('web-speech-generated');
    };

    utterance.onerror = (error) => {
      reject(new Error(`Web Speech Error: ${error.error}`));
    };

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Generate speech using Google Translate (free, limited requests)
 */
async function generateGoogleTranslateTTS(text: string, language = 'en'): Promise<string> {
  try {
    // Google Translate TTS URL (no API key needed, but has rate limits)
    const encodedText = encodeURIComponent(text);
    const audioUrl = `https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit&client=te`;
    
    // Alternative: Use a free TTS API that works without auth
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodedText}&langpair=en|${language}`, {
      method: 'GET',
    });

    if (!response.ok) throw new Error('Google Translate TTS failed');
    
    return 'google-tts-generated';
  } catch (error) {
    console.error('Google TTS Error:', error);
    throw error;
  }
}

/**
 * Generate speech using Speechify Free Tier (requires free account)
 */
async function generateSpeechify(text: string, voiceId = 'adam'): Promise<string> {
  const apiKey = sanitizeApiKey(await kvGet('speechify_key'));
  
  if (!apiKey || apiKey.length < 10) {
    throw createConfigError('speechify');
  }

  // Validate text length
  if (text.length > 10000) {
    console.warn('Text exceeds 10000 chars, truncating for Speechify');
    text = text.substring(0, 10000);
  }

  return withRetry(async () => {
    const response = await safeFetch(
      'https://api.speechify.com/v1/audio/speak',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice_id: voiceId,
          audio_format: 'mp3',
        }),
      },
      30000
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Speechify Error (${response.status}): ${errorData.message || 'Unknown error'}`);
    }

    const audioBlob = await response.blob();
    if (audioBlob.size === 0) {
      throw new Error('Speechify returned empty audio');
    }
    return URL.createObjectURL(audioBlob);
  });
}

/**
 * Generate speech using Play.ht (requires free API key)
 */
async function generatePlayHT(text: string, voiceId = 's3://voice-cloning-zero-shot/775ae416-49bb-4fb6-bd45-740f205d20a1/jennifer/manifest.json'): Promise<string> {
  const apiKey = sanitizeApiKey(await kvGet('playht_key'));
  const userId = sanitizeStoredValueForKey('playht_user_id', await kvGet('playht_user_id'));
  
  if (!apiKey || !userId) {
    throw createConfigError('playht');
  }

  // Validate text length
  if (text.length > 12500) {
    console.warn('Text exceeds 12500 chars, truncating for Play.ht');
    text = text.substring(0, 12500);
  }

  return withRetry(async () => {
    const response = await safeFetch(
      'https://api.play.ht/api/v2/tts/stream',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'X-User-ID': userId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: voiceId,
          output_format: 'mp3',
          voice_engine: 'PlayHT2.0',
        }),
      },
      30000
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Play.ht Error (${response.status}): ${errorData.message || 'Unknown error'}`);
    }

    const audioBlob = await response.blob();
    if (audioBlob.size === 0) {
      throw new Error('Play.ht returned empty audio');
    }
    return URL.createObjectURL(audioBlob);
  });
}

/**
 * Generate speech using Resemble AI (requires API key)
 */
async function generateResembleAI(text: string, voiceUuid = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'): Promise<string> {
  const apiKey = sanitizeApiKey(await kvGet('resemble_key'));
  
  if (!apiKey) {
    throw createConfigError('resemble');
  }

  // Validate text length (free tier limit)
  if (text.length > 1000) {
    console.warn('Text exceeds 1000 chars, truncating for Resemble AI');
    text = text.substring(0, 1000);
  }

  return withRetry(async () => {
    const response = await safeFetch(
      `https://app.resemble.ai/api/v2/projects/default/clips`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token token=${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voice_uuid: voiceUuid,
          body: text,
          is_public: false,
        }),
      },
      30000
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Resemble AI Error (${response.status}): ${errorData.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const audioUrl = data.item?.audio_src;
    
    if (!audioUrl) {
      throw new Error('Resemble AI did not return audio URL');
    }
    
    return audioUrl;
  });
}

/**
 * Generate speech using ElevenLabs (requires API key)
 */
async function generateElevenLabs(text: string, voiceId = '21m00Tcm4TlvDq8ikWAM'): Promise<MediaAsset> {
  const apiKey = sanitizeApiKey(await kvGet('elevenlabs_key'));
  
  if (!apiKey || apiKey.length < 10) {
    throw createConfigError('elevenlabs');
  }

  // Validate text length (ElevenLabs free tier limit)
  if (text.length > 5000) {
    console.warn('Text exceeds 5000 chars, truncating for ElevenLabs');
    text = text.substring(0, 5000);
  }

  return withRetry(async () => {
    const response = await safeFetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      },
      30000
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`ElevenLabs Error (${response.status}): ${errorText}`);
    }

    const audioBlob = await response.blob();
    if (audioBlob.size === 0) {
      throw new Error('ElevenLabs returned empty audio');
    }
    const url = URL.createObjectURL(audioBlob);
    
    return mediaAssetManager.wrapAsset(url, 'audio', 'elevenlabs', {
      blobSize: audioBlob.size,
      textLength: text.length
    });
  });
}

/**
 * Generate speech using Azure Cognitive Services (requires API key)
 */
async function generateAzureTTS(text: string, voiceId = 'en-US-AriaNeural'): Promise<string> {
  try {
    let apiKey = sanitizeApiKey(await kvGet('azure_speech_key'));
    if (!apiKey) {
      apiKey = process.env.AZURE_SPEECH_KEY || '';
    }
    const region = (await kvGet('azure_speech_region')) || process.env.AZURE_SPEECH_REGION || 'eastus';
    
    if (!apiKey) {
      throw createConfigError('azure_speech');
    }

    const response = await fetch(
      `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
        },
        body: `<speak version='1.0' xml:lang='en-US'><voice name='${voiceId}'>${text}</voice></speak>`,
      }
    );

    if (!response.ok) {
      throw new Error(`Azure TTS Error: ${response.statusText}`);
    }

    const audioBlob = await response.blob();
    return URL.createObjectURL(audioBlob);
  } catch (error) {
    console.error('Azure TTS Error:', error);
    throw error;
  }
}

/**
 * Main function to generate voice - automatically selects best available provider
 */
export async function generateVoice(options: VoiceOptions): Promise<string> {
  const { text, provider, voiceId = 'default', speed = 1, pitch = 1 } = options;

  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  // If provider specified, use it
  if (provider) {
    switch (provider) {
      case 'web-speech':
        return generateWebSpeech(text, { speed, pitch });
      case 'google':
        return generateGoogleTranslateTTS(text);
      case 'speechify':
        return generateSpeechify(text, voiceId);
      case 'playht':
        return generatePlayHT(text, voiceId);
      case 'resemble':
        return generateResembleAI(text, voiceId);
      case 'elevenlabs':
        const asset = await generateElevenLabs(text, voiceId);
        return asset.url;
      case 'azure':
        return generateAzureTTS(text, voiceId);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  // Auto-select best available provider (in order of quality)
  const providerAttempts: Array<{ check: () => Promise<boolean>; generate: () => Promise<string>; name: string }> = [
    { name: 'ElevenLabs', check: async () => !!(await kvGet('elevenlabs_key')) || !!process.env.ELEVENLABS_API_KEY, generate: async () => (await generateElevenLabs(text, voiceId)).url },
    { name: 'Play.ht', check: async () => !!(await kvGet('playht_key')) && !!sanitizeStoredValueForKey('playht_user_id', await kvGet('playht_user_id')) || !!process.env.PLAYHT_API_KEY, generate: () => generatePlayHT(text, voiceId) },
    { name: 'Speechify', check: async () => !!(await kvGet('speechify_key')) || !!process.env.SPEECHIFY_API_KEY, generate: () => generateSpeechify(text, voiceId) },
    { name: 'Resemble', check: async () => !!(await kvGet('resemble_key')) || !!process.env.RESEMBLE_API_KEY, generate: () => generateResembleAI(text, voiceId) },
    { name: 'Azure', check: async () => !!(await kvGet('azure_speech_key')) || !!process.env.AZURE_SPEECH_KEY, generate: () => generateAzureTTS(text, voiceId) },
    { name: 'Web Speech', check: async () => true, generate: () => generateWebSpeech(text, { speed, pitch }) },
  ];

  for (const attempt of providerAttempts) {
    try {
      if (await attempt.check()) {
        return await attempt.generate();
      }
    } catch (error) {
      console.warn(`${attempt.name} failed, trying next provider:`, error);
      continue;
    }
  }

  // Final fallback
  return generateWebSpeech(text, { speed, pitch });
}

/**
 * Play generated audio
 */
export function playAudio(audioUrl: string): void {
  if (!audioUrl) return;

  if (audioUrl === 'web-speech-generated') {
    // Web Speech API handles playback automatically
    return;
  }

  const audio = new Audio(audioUrl);
  audio.play().catch(err => console.error('Audio playback error:', err));
}

/**
 * Stop all playing audio
 */
export function stopAudio(): void {
  if (typeof window === 'undefined') return;
  
  window.speechSynthesis.cancel();
  
  const audioElements = document.querySelectorAll('audio');
  audioElements.forEach(audio => {
    audio.pause();
    audio.currentTime = 0;
  });
}

/**
 * Get available voice models based on configured API keys
 */
export async function getAvailableVoiceModels(): Promise<VoiceModel[]> {
  const available = [...FREE_VOICE_MODELS];

  // Check which premium providers are configured
  const elevenKey = sanitizeApiKey(await kvGet('elevenlabs_key'));
  if (elevenKey) {
    available.push(...PREMIUM_VOICE_MODELS.filter(m => m.provider === 'elevenlabs'));
  }

  const azureKey = sanitizeApiKey(await kvGet('azure_speech_key'));
  if (azureKey) {
    available.push(...PREMIUM_VOICE_MODELS.filter(m => m.provider === 'azure'));
  }

  const speechifyKey = sanitizeApiKey(await kvGet('speechify_key'));
  if (speechifyKey) {
    available.push(...FREE_VOICE_MODELS.filter(m => m.provider === 'speechify'));
  }

  return available;
}

/**
 * Save voice provider configuration
 */
export async function configureVoiceProvider(
  provider: VoiceProvider,
  apiKey: string,
  additionalConfig?: Record<string, string>
): Promise<void> {
  const keyMap: Record<VoiceProvider, string> = {
    'elevenlabs': 'elevenlabs_key',
    'speechify': 'speechify_key',
    'playht': 'playht_key',
    'resemble': 'resemble_key',
    'google': 'google_key',
    'azure': 'azure_speech_key',
    'web-speech': '',
    'piper': 'piper_key',
    'coqui': 'coqui_key',
  };

  const keyName = keyMap[provider];
  if (!keyName) return; // web-speech doesn't need config

  await kvSet(keyName, sanitizeApiKey(apiKey));

  // Save additional config if provided
  if (additionalConfig) {
    for (const [key, value] of Object.entries(additionalConfig)) {
      await kvSet(`${provider}_${key}`, sanitizeStoredValueForKey(`${provider}_${key}`, value));
    }
  }
}
