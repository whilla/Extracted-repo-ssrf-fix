

export type SceneEmotion =
  | 'tension'
  | 'curiosity'
  | 'fear'
  | 'inspiration'
  | 'confidence'
  | 'urgency'
  | 'calm';

export interface EmotionMap {
  emotion: SceneEmotion;
  visualStyle: string;
  audioStyle: string;
  pacing: 'slow' | 'medium' | 'fast';
}

export function mapEmotionFromScene(sceneText: string): EmotionMap {
  const lower = sceneText.toLowerCase();

  if (/\b(horror|disturb|anomaly|shadow|glitch|blood|whisper)\b/.test(lower)) {
    return {
      emotion: 'fear',
      visualStyle: 'high contrast, motivated practical lighting, unsettling negative space',
      audioStyle: 'low-frequency rumble, sparse ambience, controlled transient spikes',
      pacing: 'slow',
    };
  }
  if (/\b(secret|mystery|unknown|reveal|what if)\b/.test(lower)) {
    return {
      emotion: 'curiosity',
      visualStyle: 'selective framing, partial reveals, occlusion-driven composition',
      audioStyle: 'soft pulse, filtered textures, restrained melodic motion',
      pacing: 'medium',
    };
  }
  if (/\b(launch|offer|limited|urgent|now)\b/.test(lower)) {
    return {
      emotion: 'urgency',
      visualStyle: 'fast cut rhythm, tight close-ups, directional movement',
      audioStyle: 'driving percussion, short risers, emphatic downbeats',
      pacing: 'fast',
    };
  }

  return {
    emotion: 'confidence',
    visualStyle: 'clean cinematic realism, readable composition, deliberate camera language',
    audioStyle: 'voice-forward mix, subtle underscore, balanced ambience',
    pacing: 'medium',
  };
}
