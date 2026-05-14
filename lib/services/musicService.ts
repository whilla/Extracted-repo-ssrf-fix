// Music Service - Background music generation and management
// @deprecated Consider using musicGenerationService.ts (8 providers) for new integrations
import type { MusicMood } from '@/lib/types';
import { kvGet } from './puterService';
import { sanitizeApiKey } from './providerCredentialUtils';

// Free music sources by mood
const MUSIC_LIBRARY: Record<string, { url: string; name: string; duration: number }[]> = {
  happy: [
    { url: '/audio/happy-upbeat.mp3', name: 'Happy Vibes', duration: 120 },
    { url: '/audio/cheerful-morning.mp3', name: 'Cheerful Morning', duration: 90 },
  ],
  sad: [
    { url: '/audio/melancholy.mp3', name: 'Melancholy', duration: 150 },
    { url: '/audio/rainy-day.mp3', name: 'Rainy Day', duration: 120 },
  ],
  energetic: [
    { url: '/audio/power-up.mp3', name: 'Power Up', duration: 90 },
    { url: '/audio/adrenaline.mp3', name: 'Adrenaline Rush', duration: 60 },
  ],
  calm: [
    { url: '/audio/peaceful.mp3', name: 'Peaceful', duration: 180 },
    { url: '/audio/meditation.mp3', name: 'Meditation', duration: 240 },
  ],
  dramatic: [
    { url: '/audio/epic-rise.mp3', name: 'Epic Rise', duration: 120 },
    { url: '/audio/tension.mp3', name: 'Building Tension', duration: 90 },
  ],
  mysterious: [
    { url: '/audio/mystery.mp3', name: 'Mystery', duration: 120 },
    { url: '/audio/suspense.mp3', name: 'Suspense', duration: 90 },
  ],
  inspiring: [
    { url: '/audio/motivation.mp3', name: 'Motivation', duration: 150 },
    { url: '/audio/triumph.mp3', name: 'Triumph', duration: 120 },
  ],
  nostalgic: [
    { url: '/audio/memories.mp3', name: 'Memories', duration: 180 },
    { url: '/audio/golden-days.mp3', name: 'Golden Days', duration: 150 },
  ],
};

// Generate music using Suno API (if key available) or return library tracks
export async function generateMusic(
  mood: MusicMood,
  duration: number = 30,
  options: {
    useAI?: boolean;
    customPrompt?: string;
  } = {}
): Promise<{ url: string; name: string; duration: number; generated: boolean }> {
  const { useAI = true, customPrompt } = options;
  
  // Check if we have a Suno API key for AI generation
  const sunoKey = sanitizeApiKey(await kvGet('suno_key'));
  
  if (useAI && sunoKey) {
    try {
      return await generateWithSuno(mood, duration, sunoKey, customPrompt);
    } catch (error) {
      console.warn('AI music generation failed, falling back to library:', error);
    }
  }
  
  // Fallback to library
  const tracks = MUSIC_LIBRARY[mood.primary] || MUSIC_LIBRARY.energetic;
  const track = tracks[Math.floor(Math.random() * tracks.length)];
  
  return {
    ...track,
    generated: false
  };
}

// Generate music with Suno AI
async function generateWithSuno(
  mood: MusicMood,
  duration: number,
  apiKey: string,
  customPrompt?: string
): Promise<{ url: string; name: string; duration: number; generated: boolean }> {
  const prompt = customPrompt || buildMusicPrompt(mood);
  
  const response = await fetch('https://api.suno.ai/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      duration,
      style: mood.genre,
      tempo: mood.tempo === 'slow' ? 60 : mood.tempo === 'fast' ? 140 : 100
    })
  });
  
  if (!response.ok) {
    throw new Error(`Suno API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  return {
    url: data.audio_url,
    name: data.title || `${mood.primary} ${mood.genre}`,
    duration: data.duration || duration,
    generated: true
  };
}

// Build a descriptive prompt for music generation
function buildMusicPrompt(mood: MusicMood): string {
  const parts = [
    `Create a ${mood.tempo} tempo ${mood.genre} track`,
    `with a ${mood.primary} mood`,
    mood.secondary ? `and ${mood.secondary} undertones` : '',
    `featuring ${mood.instruments.slice(0, 3).join(', ')}`,
    `Energy level: ${mood.energy}/100`,
    'Perfect for social media content background'
  ];
  
  return parts.filter(Boolean).join('. ');
}

// Audio player class for managing background music
export class MusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private isPlaying = false;
  private volume = 0.3;
  private fadeInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.loop = true;
      this.audio.volume = this.volume;
    }
  }
  
  async play(url: string): Promise<void> {
    if (!this.audio) return;
    
    // Fade out current if playing
    if (this.isPlaying) {
      await this.fadeOut(500);
    }
    
    this.audio.src = url;
    this.audio.volume = 0;
    
    try {
      await this.audio.play();
      this.isPlaying = true;
      await this.fadeIn(500);
    } catch (error) {
      console.error('Music playback failed:', error);
    }
  }
  
  pause(): void {
    if (this.audio && this.isPlaying) {
      this.fadeOut(300).then(() => {
        this.audio?.pause();
        this.isPlaying = false;
      });
    }
  }
  
  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.isPlaying = false;
    }
  }
  
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audio) {
      this.audio.volume = this.volume;
    }
  }
  
  private fadeIn(duration: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.audio) return resolve();
      
      const steps = 20;
      const stepTime = duration / steps;
      const volumeStep = this.volume / steps;
      let currentStep = 0;
      
      this.fadeInterval = setInterval(() => {
        currentStep++;
        if (this.audio) {
          this.audio.volume = Math.min(volumeStep * currentStep, this.volume);
        }
        
        if (currentStep >= steps) {
          if (this.fadeInterval) clearInterval(this.fadeInterval);
          resolve();
        }
      }, stepTime);
    });
  }
  
  private fadeOut(duration: number): Promise<void> {
    return new Promise((resolve) => {
      if (!this.audio) return resolve();
      
      const steps = 20;
      const stepTime = duration / steps;
      const volumeStep = this.audio.volume / steps;
      let currentStep = 0;
      
      this.fadeInterval = setInterval(() => {
        currentStep++;
        if (this.audio) {
          this.audio.volume = Math.max(this.audio.volume - volumeStep, 0);
        }
        
        if (currentStep >= steps) {
          if (this.fadeInterval) clearInterval(this.fadeInterval);
          resolve();
        }
      }, stepTime);
    });
  }
  
  getIsPlaying(): boolean {
    return this.isPlaying;
  }
  
  destroy(): void {
    this.stop();
    if (this.fadeInterval) clearInterval(this.fadeInterval);
    this.audio = null;
  }
}

// Create a singleton player instance
let playerInstance: MusicPlayer | null = null;

export function getMusicPlayer(): MusicPlayer {
  if (!playerInstance && typeof window !== 'undefined') {
    playerInstance = new MusicPlayer();
  }
  return playerInstance!;
}

// Get recommended tracks for a mood
export function getTracksForMood(mood: string): { url: string; name: string; duration: number }[] {
  return MUSIC_LIBRARY[mood] || MUSIC_LIBRARY.energetic;
}

// Search free music libraries (Pixabay, Freesound)
export async function searchFreeMusic(query: string): Promise<{ url: string; name: string; duration: number }[]> {
  // For now, return filtered library tracks
  // In production, this would call Pixabay Music API or similar
  const results: { url: string; name: string; duration: number }[] = [];
  const queryLower = query.toLowerCase();
  
  for (const [mood, tracks] of Object.entries(MUSIC_LIBRARY)) {
    if (mood.includes(queryLower) || queryLower.includes(mood)) {
      results.push(...tracks);
    }
  }
  
  return results;
}

// Export convenience object
export const musicService = {
  generateMusic,
  getMusicPlayer,
  getTracksForMood,
  searchFreeMusic,
  MusicPlayer,
  MUSIC_LIBRARY
};
