// Voice Service - ElevenLabs + Web Speech API fallback
import { kvGet } from './puterService';
import { sanitizeApiKey } from './providerCredentialUtils';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

// ElevenLabs voice IDs (popular voices)
export const ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', description: 'American, warm' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', description: 'American, strong' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', description: 'American, soft' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', description: 'American, well-rounded' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', description: 'American, clear' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', description: 'American, deep' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', description: 'American, crisp' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', description: 'American, deep' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', description: 'American, raspy' },
];

// Check if ElevenLabs is configured
export async function isElevenLabsConfigured(): Promise<boolean> {
  const key = sanitizeApiKey(await kvGet('elevenlabs_key'));
  return key.length > 10;
}

// Get available voices
export async function getAvailableVoices(): Promise<Array<{ id: string; name: string; description: string }>> {
  const hasElevenlabs = await isElevenLabsConfigured();
  
  if (hasElevenlabs) {
    try {
      const key = sanitizeApiKey(await kvGet('elevenlabs_key'));
      const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
        headers: { 'xi-api-key': key! },
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.voices.map((v: { voice_id: string; name: string; labels?: { description?: string } }) => ({
          id: v.voice_id,
          name: v.name,
          description: v.labels?.description || 'Custom voice',
        }));
      }
    } catch {
      // Fall through to defaults
    }
    return ELEVENLABS_VOICES;
  }
  
  // Web Speech API voices
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return new Promise(resolve => {
      const getVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          resolve(
            voices.slice(0, 10).map(v => ({
              id: v.name,
              name: v.name,
              description: v.lang,
            }))
          );
        }
      };
      
      getVoices();
      window.speechSynthesis.onvoiceschanged = getVoices;
      
      // Timeout fallback
      setTimeout(() => resolve([{ id: 'default', name: 'System Default', description: 'Browser default voice' }]), 1000);
    });
  }
  
  return [{ id: 'default', name: 'System Default', description: 'Browser default voice' }];
}

// Generate speech with ElevenLabs
async function generateElevenLabsSpeech(
  text: string,
  options: {
    voiceId?: string;
    stability?: number;
    similarityBoost?: number;
  } = {}
): Promise<Blob> {
  const key = sanitizeApiKey(await kvGet('elevenlabs_key'));
  if (!key) {
    throw new Error('ElevenLabs API key not configured');
  }

  const { voiceId = '21m00Tcm4TlvDq8ikWAM', stability = 0.5, similarityBoost = 0.75 } = options;

  // Process text for better speech (handle markers)
  const processedText = text
    .replace(/\[pause\]/gi, '...')
    .replace(/\[emphasis\]/gi, '')
    .trim();

  const response = await fetch(`${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: processedText,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs API error: ${error}`);
  }

  return response.blob();
}

// Browser speech can preview audio live, but it cannot produce a trustworthy downloadable file.
function previewWebSpeechSynthesis(
  text: string,
  options: {
    voiceId?: string;
    rate?: number;
    pitch?: number;
  } = {}
): Promise<never> {
  return new Promise((_, reject) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      reject(new Error('Web Speech API not supported'));
      return;
    }

    const { voiceId, rate = 1, pitch = 1 } = options;

    // Process text for better speech
    const processedText = text
      .replace(/\[pause\]/gi, ', ')
      .replace(/\[emphasis\]/gi, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(processedText);
    utterance.rate = rate;
    utterance.pitch = pitch;

    // Set voice if specified
    if (voiceId) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.name === voiceId);
      if (voice) {
        utterance.voice = voice;
      }
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    reject(new Error('Browser speech preview is available, but downloadable audio requires a configured voice provider.'));
  });
}

// Main text-to-speech function with automatic fallback
export async function textToSpeech(
  text: string,
  options: {
    voiceId?: string;
    rate?: number;
    pitch?: number;
    stability?: number;
    similarityBoost?: number;
    preferElevenlabs?: boolean;
  } = {}
): Promise<{ blob: Blob; provider: 'elevenlabs' | 'webspeech' }> {
  const { preferElevenlabs = true, ...restOptions } = options;
  
  // Try ElevenLabs first if configured and preferred
  if (preferElevenlabs) {
    const hasElevenlabs = await isElevenLabsConfigured();
    if (hasElevenlabs) {
      try {
        const blob = await generateElevenLabsSpeech(text, restOptions);
        return { blob, provider: 'elevenlabs' };
      } catch (error) {
        console.warn('ElevenLabs failed, falling back to Web Speech:', error);
      }
    }
  }
  
  await previewWebSpeechSynthesis(text, restOptions);
  throw new Error('Browser speech preview is available, but downloadable audio requires a configured voice provider.');
}

export async function synthesizeVoice(
  text: string,
  options: {
    voiceId?: string;
    rate?: number;
    pitch?: number;
    stability?: number;
    similarityBoost?: number;
    preferElevenlabs?: boolean;
  } = {}
): Promise<string> {
  const { blob } = await textToSpeech(text, options);
  return URL.createObjectURL(blob);
}

// Preview speech (plays directly without returning blob)
export function previewSpeech(
  text: string,
  options: {
    voiceId?: string;
    rate?: number;
    pitch?: number;
  } = {}
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('Speech synthesis not available');
    return;
  }

  const { voiceId, rate = 1, pitch = 1 } = options;
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const processedText = text
    .replace(/\[pause\]/gi, ', ')
    .replace(/\[emphasis\]/gi, '')
    .trim();

  const utterance = new SpeechSynthesisUtterance(processedText);
  utterance.rate = rate;
  utterance.pitch = pitch;

  if (voiceId && voiceId !== 'default') {
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => v.name === voiceId);
    if (voice) {
      utterance.voice = voice;
    }
  }

  window.speechSynthesis.speak(utterance);
}

// Stop speech preview
export function stopSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
