// Music Engine - AI-powered background music generation based on content
import { kvGet } from './puterService';
import { sanitizeApiKey } from './providerCredentialUtils';

// ============================================
// MUSIC MOOD ANALYSIS
// ============================================

export interface MusicMood {
  primary: 'happy' | 'sad' | 'energetic' | 'calm' | 'dramatic' | 'mysterious' | 'inspiring' | 'nostalgic';
  secondary?: string;
  tempo: 'slow' | 'medium' | 'fast';
  energy: number; // 0-100
  genre: string;
  instruments: string[];
  keywords: string[];
}

export interface GeneratedMusic {
  url: string;
  mood: MusicMood;
  duration: number;
  source: 'mubert' | 'suno' | 'elevenlabs' | 'browser' | 'preset';
}

// Analyze content to determine appropriate music mood
export async function analyzeMusicMood(content: string): Promise<MusicMood> {
  const lower = (content || '').toLowerCase();
  
  // Enhanced mood patterns with weights
  const moodPatterns: Array<[MusicMood['primary'], RegExp, number]> = [
    ['energetic', /\b(energy|hype|fast|launch|viral|bold|exciting|power|move|action|success|growth)\b/g, 3],
    ['dramatic', /\b(dramatic|cinematic|epic|stakes|tension|storm|battle|reveal|intense|critical|urgent)\b/g, 4],
    ['mysterious', /\b(mystery|mysterious|secret|unknown|shadow|hidden|strange|suspense|curiosity)\b/g, 2],
    ['calm', /\b(calm|soft|peace|gentle|slow|relax|quiet|ambient|zen|minimal)\b/g, 2],
    ['sad', /\b(sad|loss|lonely|grief|melancholy|heartbreak|struggle|pain)\b/g, 3],
    ['nostalgic', /\b(memory|nostalgia|past|remember|childhood|vintage|legacy|history)\b/g, 2],
    ['happy', /\b(happy|joy|bright|celebrate|fun|smile|positive|laugh)\b/g, 3],
    ['inspiring', /\b(inspire|hope|growth|brand|future|build|dream|create|transform|vision|victory)\b/g, 4],
  ];
  
  const moodScores: Array<[MusicMood['primary'], number]> = moodPatterns.map(([mood, pattern, weight]) => [mood, (lower.match(pattern) || []).length * weight]);

  const [primary, score] = moodScores.sort((a, b) => b[1] - a[1])[0] || ['inspiring', 0];
  const energetic = primary === 'energetic' || primary === 'dramatic';
  const tempo: MusicMood['tempo'] = energetic ? 'fast' : primary === 'calm' || primary === 'sad' || primary === 'nostalgic' ? 'slow' : 'medium';
  const energy = Math.max(35, Math.min(90, (energetic ? 78 : tempo === 'slow' ? 42 : 60) + Math.min(score, 4) * 4));

  return {
    primary,
    secondary: primary === 'dramatic' ? 'cinematic' : primary === 'energetic' ? 'driving' : primary === 'calm' ? 'warm' : 'uplifting',
    tempo,
    energy,
    genre: primary === 'dramatic' ? 'cinematic hybrid' : primary === 'energetic' ? 'modern electronic' : 'ambient electronic',
    instruments: primary === 'dramatic' ? ['strings', 'hybrid percussion'] : primary === 'calm' ? ['piano', 'soft synth'] : ['synth', 'piano', 'drums'],
    keywords: [primary, tempo, 'brand-safe', 'background', 'perfect-match'],
  };
}

// ============================================
// MUBERT API INTEGRATION
// ============================================

interface MubertResponse {
  data?: {
    tasks?: Array<{
      download_link?: string;
    }>;
  };
}

export async function generateMubertMusic(
  mood: MusicMood,
  duration = 30
): Promise<string | null> {
  const apiKey = sanitizeApiKey(await kvGet('mubert_key'));
  if (!apiKey) return null;

  try {
    // Mubert text-to-music API
    const prompt = `${mood.primary} ${mood.secondary || ''} ${mood.genre} music, ${mood.tempo} tempo, ${mood.keywords.join(', ')}`;
    
    const response = await fetch('https://api.mubert.com/v2/TTMRecordTrack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'TTMRecordTrack',
        params: {
          pat: apiKey,
          prompt,
          duration,
          format: 'mp3',
        },
      }),
    });

    if (!response.ok) return null;
    
    const data = await response.json() as MubertResponse;
    return data.data?.tasks?.[0]?.download_link || null;
  } catch (error) {
    console.error('Mubert generation failed:', error);
    return null;
  }
}

// ============================================
// SUNO API INTEGRATION
// ============================================

export async function generateSunoMusic(
  mood: MusicMood,
  lyrics?: string
): Promise<string | null> {
  const apiKey = sanitizeApiKey(await kvGet('suno_key'));
  if (!apiKey) return null;

  try {
    const prompt = `${mood.primary} ${mood.genre} song, ${mood.tempo} tempo, ${mood.instruments.join(', ')}`;
    
    // Suno API endpoint (simplified - actual API may differ)
    const response = await fetch('https://api.suno.ai/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        lyrics: lyrics || '',
        duration: 30,
      }),
    });

    if (!response.ok) return null;
    
    const data = await response.json();
    return data.audio_url || null;
  } catch (error) {
    console.error('Suno generation failed:', error);
    return null;
  }
}

// ============================================
// BROWSER-BASED MUSIC GENERATION
// ============================================

export class BrowserMusicGenerator {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isPlaying = false;
  private oscillators: OscillatorNode[] = [];
  private scheduledNotes: number[] = [];

  // Musical scales for different moods
  private scales: Record<string, number[]> = {
    happy: [0, 2, 4, 5, 7, 9, 11], // Major
    sad: [0, 2, 3, 5, 7, 8, 10], // Minor
    energetic: [0, 2, 4, 5, 7, 9, 11], // Major
    calm: [0, 2, 4, 7, 9], // Pentatonic
    dramatic: [0, 1, 4, 5, 7, 8, 11], // Harmonic minor
    mysterious: [0, 1, 3, 5, 6, 8, 10], // Locrian
    inspiring: [0, 2, 4, 5, 7, 9, 11], // Major
    nostalgic: [0, 2, 3, 5, 7, 8, 10], // Minor
  };

  // Chord progressions for different moods
  private progressions: Record<string, number[][]> = {
    happy: [[0, 4, 7], [5, 9, 0], [7, 11, 2], [5, 9, 0]],
    sad: [[0, 3, 7], [5, 8, 0], [3, 7, 10], [7, 10, 2]],
    energetic: [[0, 4, 7], [2, 5, 9], [4, 7, 11], [5, 9, 0]],
    calm: [[0, 4, 7], [7, 11, 2], [0, 4, 7], [5, 9, 0]],
    dramatic: [[0, 3, 7], [5, 8, 0], [7, 10, 2], [3, 7, 10]],
    mysterious: [[0, 3, 6], [5, 8, 11], [3, 6, 9], [0, 3, 6]],
    inspiring: [[0, 4, 7], [5, 9, 0], [2, 5, 9], [7, 11, 2]],
    nostalgic: [[0, 3, 7], [3, 7, 10], [5, 8, 0], [0, 3, 7]],
  };

  async initialize() {
    if (this.audioContext) return;
    this.audioContext = new AudioContext();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.audioContext.destination);
  }

  private midiToFreq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  private createPadSound(freq: number, duration: number, startTime: number) {
    if (!this.audioContext || !this.masterGain) return;

    const osc1 = this.audioContext.createOscillator();
    const osc2 = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.value = freq;
    osc2.frequency.value = freq * 1.002; // Slight detune

    filter.type = 'lowpass';
    filter.frequency.value = 2000;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.2, startTime + 0.1);
    gain.gain.setValueAtTime(0.2, startTime + duration - 0.2);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(filter);
    filter.connect(this.masterGain);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration);
    osc2.stop(startTime + duration);

    this.oscillators.push(osc1, osc2);
  }

  private createArpeggio(notes: number[], tempo: number, startTime: number, duration: number) {
    if (!this.audioContext || !this.masterGain) return;

    const noteLength = 60 / tempo / 2;
    let currentTime = startTime;
    let noteIndex = 0;

    while (currentTime < startTime + duration) {
      const note = notes[noteIndex % notes.length];
      const freq = this.midiToFreq(60 + note);

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.1, currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, currentTime + noteLength * 0.8);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(currentTime);
      osc.stop(currentTime + noteLength);

      this.oscillators.push(osc);
      currentTime += noteLength;
      noteIndex++;
    }
  }

  async generateMusic(mood: MusicMood, duration = 30): Promise<Blob> {
    await this.initialize();
    if (!this.audioContext) throw new Error('Audio context not available');

    const scale = this.scales[mood.primary] || this.scales.calm;
    const progression = this.progressions[mood.primary] || this.progressions.calm;
    const tempo = mood.tempo === 'slow' ? 80 : mood.tempo === 'fast' ? 140 : 110;

    const chordDuration = (60 / tempo) * 4;
    let currentTime = this.audioContext.currentTime;

    // Schedule chords and arpeggios
    for (let i = 0; i < Math.ceil(duration / chordDuration); i++) {
      const chord = progression[i % progression.length];
      
      // Pad chords
      chord.forEach(note => {
        this.createPadSound(this.midiToFreq(48 + note), chordDuration, currentTime);
      });

      // Arpeggios for energetic/fast moods
      if (mood.energy > 50 || mood.tempo === 'fast') {
        this.createArpeggio(scale, tempo, currentTime, chordDuration);
      }

      currentTime += chordDuration;
    }

    // Record the audio
    const dest = this.audioContext.createMediaStreamDestination();
    this.masterGain?.connect(dest);

    const mediaRecorder = new MediaRecorder(dest.stream);
    const chunks: BlobPart[] = [];

    return new Promise((resolve) => {
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        resolve(new Blob(chunks, { type: 'audio/webm' }));
      };

      mediaRecorder.start();
      setTimeout(() => {
        mediaRecorder.stop();
        this.stop();
      }, duration * 1000);
    });
  }

  // Play generated ambient music in real-time
  async playAmbient(mood: MusicMood) {
    await this.initialize();
    if (!this.audioContext || !this.masterGain || this.isPlaying) return;

    this.isPlaying = true;
    const scale = this.scales[mood.primary] || this.scales.calm;
    const progression = this.progressions[mood.primary] || this.progressions.calm;
    const tempo = mood.tempo === 'slow' ? 80 : mood.tempo === 'fast' ? 140 : 110;
    const chordDuration = (60 / tempo) * 4;

    let chordIndex = 0;

    const playNextChord = () => {
      if (!this.isPlaying || !this.audioContext) return;

      const chord = progression[chordIndex % progression.length];
      const currentTime = this.audioContext.currentTime;

      // Play pad
      chord.forEach(note => {
        this.createPadSound(this.midiToFreq(48 + note), chordDuration, currentTime);
      });

      // Arpeggios
      if (mood.energy > 50) {
        this.createArpeggio(scale, tempo, currentTime, chordDuration);
      }

      chordIndex++;
      const timeoutId = window.setTimeout(playNextChord, chordDuration * 1000);
      this.scheduledNotes.push(timeoutId);
    };

    playNextChord();
  }

  stop() {
    this.isPlaying = false;
    this.scheduledNotes.forEach(id => clearTimeout(id));
    this.scheduledNotes = [];
    this.oscillators.forEach(osc => {
      try { osc.stop(); } catch { /* already stopped */ }
    });
    this.oscillators = [];
  }

  setVolume(volume: number) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }
}

// ============================================
// PRESET ROYALTY-FREE MUSIC
// ============================================

export const PRESET_MUSIC: Record<string, { url: string; mood: MusicMood['primary']; duration: number }[]> = {
  happy: [
    { url: '/audio/presets/happy-upbeat.mp3', mood: 'happy', duration: 30 },
    { url: '/audio/presets/happy-pop.mp3', mood: 'happy', duration: 45 },
  ],
  energetic: [
    { url: '/audio/presets/energetic-edm.mp3', mood: 'energetic', duration: 30 },
    { url: '/audio/presets/energetic-rock.mp3', mood: 'energetic', duration: 45 },
  ],
  calm: [
    { url: '/audio/presets/calm-ambient.mp3', mood: 'calm', duration: 60 },
    { url: '/audio/presets/calm-piano.mp3', mood: 'calm', duration: 45 },
  ],
  inspiring: [
    { url: '/audio/presets/inspiring-cinematic.mp3', mood: 'inspiring', duration: 45 },
    { url: '/audio/presets/inspiring-orchestra.mp3', mood: 'inspiring', duration: 60 },
  ],
  dramatic: [
    { url: '/audio/presets/dramatic-epic.mp3', mood: 'dramatic', duration: 30 },
    { url: '/audio/presets/dramatic-tension.mp3', mood: 'dramatic', duration: 45 },
  ],
  sad: [
    { url: '/audio/presets/sad-piano.mp3', mood: 'sad', duration: 45 },
    { url: '/audio/presets/sad-strings.mp3', mood: 'sad', duration: 60 },
  ],
  mysterious: [
    { url: '/audio/presets/mysterious-ambient.mp3', mood: 'mysterious', duration: 30 },
  ],
  nostalgic: [
    { url: '/audio/presets/nostalgic-lofi.mp3', mood: 'nostalgic', duration: 45 },
  ],
};

// ============================================
// UNIFIED MUSIC GENERATION
// ============================================

async function pickReachablePreset(mood: MusicMood): Promise<{ url: string; mood: MusicMood['primary']; duration: number } | null> {
  const presets = PRESET_MUSIC[mood.primary] || [];
  for (const preset of presets) {
    try {
      if (typeof fetch !== 'function') continue;
      const response = await fetch(preset.url, { method: 'HEAD' });
      if (response.ok) {
        return preset;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function generateBackgroundMusic(
  content: string,
  options: {
    preferredSource?: 'mubert' | 'suno' | 'browser' | 'preset';
    duration?: number;
  } = {}
): Promise<GeneratedMusic | null> {
  const { preferredSource, duration = 30 } = options;

  // Analyze content mood
  const mood = await analyzeMusicMood(content);

  // Try preferred source first
  if (preferredSource) {
    switch (preferredSource) {
      case 'mubert': {
        const url = await generateMubertMusic(mood, duration);
        if (url) return { url, mood, duration, source: 'mubert' };
        break;
      }
      case 'suno': {
        const url = await generateSunoMusic(mood);
        if (url) return { url, mood, duration, source: 'suno' };
        break;
      }
      case 'preset': {
        const preset = await pickReachablePreset(mood);
        if (preset) {
          return { url: preset.url, mood, duration: preset.duration, source: 'preset' };
        }
        break;
      }
      case 'browser': {
        // Browser generation returns a blob, not a URL
        // The component will handle this differently
        return { url: 'browser-generated', mood, duration, source: 'browser' };
      }
    }
  }

  // Fallback chain: Mubert -> Suno -> Preset -> Browser
  const mubertUrl = await generateMubertMusic(mood, duration);
  if (mubertUrl) return { url: mubertUrl, mood, duration, source: 'mubert' };

  const sunoUrl = await generateSunoMusic(mood);
  if (sunoUrl) return { url: sunoUrl, mood, duration, source: 'suno' };

  // Use only reachable preset assets so the agent never returns dead audio links.
  const preset = await pickReachablePreset(mood);
  if (preset) {
    return { url: preset.url, mood, duration: preset.duration, source: 'preset' };
  }

  // Fallback to browser generation
  return { url: 'browser-generated', mood, duration, source: 'browser' };
}

// Singleton instance for real-time playback
let browserMusicGenerator: BrowserMusicGenerator | null = null;

export function getBrowserMusicGenerator(): BrowserMusicGenerator {
  if (!browserMusicGenerator) {
    browserMusicGenerator = new BrowserMusicGenerator();
  }
  return browserMusicGenerator;
}
