

import type { SceneEmotion } from './emotionMappingEngine';

export interface BeatMarker {
  second: number;
  type: 'hook_spike' | 'pause' | 'impact' | 'cut' | 'loop_cut';
  note: string;
}

export interface BeatTimingPlan {
  durationSeconds: number;
  markers: BeatMarker[];
}

export function buildBeatTimingPlan(
  durationSeconds: number,
  emotion: SceneEmotion
): BeatTimingPlan {
  const safeDuration = Math.max(4, Math.min(60, Math.round(durationSeconds)));
  const firstBeat = Math.min(2, Math.max(1, Math.floor(safeDuration * 0.15)));
  const midBeat = Math.max(firstBeat + 1, Math.floor(safeDuration * 0.55));
  const preEnd = Math.max(midBeat + 1, safeDuration - 1);

  const markers: BeatMarker[] = [
    { second: 0, type: 'hook_spike', note: 'Immediate pattern interrupt with strong visual + audio cue.' },
    { second: firstBeat, type: 'impact', note: emotion === 'fear' ? 'Disturbing anomaly becomes explicit.' : 'Core value beat lands.' },
    { second: midBeat, type: 'pause', note: 'Micro-pause for tension/retention reset.' },
    { second: preEnd, type: 'impact', note: 'Escalation beat before abrupt cutoff.' },
    { second: safeDuration, type: 'loop_cut', note: 'Abrupt loop-friendly ending.' },
  ];

  return { durationSeconds: safeDuration, markers };
}
