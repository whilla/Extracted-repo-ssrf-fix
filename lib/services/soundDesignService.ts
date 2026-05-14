

import type { SceneEmotion } from './emotionMappingEngine';
import type { BeatTimingPlan } from './beatTimingEngine';

export interface SoundDesignCue {
  atSecond: number;
  cue: string;
  intensity: 'low' | 'medium' | 'high';
}

export interface SoundDesignPlan {
  ambience: string[];
  cues: SoundDesignCue[];
}

export function buildSoundDesignPlan(emotion: SceneEmotion, beats: BeatTimingPlan): SoundDesignPlan {
  const ambience =
    emotion === 'fear'
      ? ['distant wind bed', 'subtle room tone flutter', 'low drone']
      : emotion === 'curiosity'
      ? ['light tonal bed', 'soft mechanical texture']
      : ['clean ambience bed', 'low-key transitions'];

  const cues = beats.markers.map((marker) => ({
    atSecond: marker.second,
    cue:
      marker.type === 'hook_spike'
        ? 'short transient hit with filtered tail'
        : marker.type === 'pause'
        ? 'half-second near-silence gap'
        : marker.type === 'loop_cut'
        ? 'hard cut with no release tail'
        : 'micro-impact accent',
    intensity: (marker.type === 'impact' || marker.type === 'hook_spike' ? 'high' : 'medium') as
      | 'high'
      | 'medium'
      | 'low',
  }));

  return { ambience, cues };
}
