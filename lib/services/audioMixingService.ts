'use client';

import type { SoundDesignPlan } from './soundDesignService';

export interface AudioMixSettings {
  voiceVolume: number;
  musicVolume: number;
  fxVolume: number;
  duckingEnabled: boolean;
  reverbAmount: number;
  silenceGaps: Array<{ atSecond: number; durationMs: number }>;
  normalizationTarget: number; // Target LUFS or peak level to avoid distortion
  limitingEnabled: boolean;
}

export interface AudioMixPlan {
  settings: AudioMixSettings;
  notes: string[];
  previewInstructions: string;
  automationConfig: {
    voiceRange: [number, number];
    musicRange: [number, number];
    fxRange: [number, number];
  };
}

export function buildAudioMixPlan(soundDesign: SoundDesignPlan): AudioMixPlan {
  const silenceGaps = soundDesign.cues
    .filter((cue) => cue.cue.includes('silence'))
    .map((cue) => ({ atSecond: cue.atSecond, durationMs: 420 }));

  return {
    settings: {
      voiceVolume: 1.0,
      musicVolume: 0.2,
      fxVolume: 0.15,
      duckingEnabled: true,
      reverbAmount: 0.12,
      silenceGaps,
      normalizationTarget: -1.0, // Prevent clipping by capping at -1dB
      limitingEnabled: true,
    },
    notes: [
      'VOICE PRIORITY: Voice locked at 100% (normalized).',
      'UNDERSCORE: Music balanced at 20% to ensure clarity.',
      'ACCENTS: FX restricted to 15% to avoid spikes.',
      'DISTORTION CONTROL: Peak limiter enabled at -1.0dB.',
      'DUCKING: Dynamic sidechaining active (Music drops during Voice).',
    ],
    previewInstructions:
      'Render a high-fidelity, voice-forward mix. Ensure no clipping on FX peaks. Music should feel like a supporting layer, never competing with the speaker.',
    automationConfig: {
      voiceRange: [0.9, 1.0],
      musicRange: [0.15, 0.3],
      fxRange: [0.1, 0.2],
    },
  };
}
