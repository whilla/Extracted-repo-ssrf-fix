

import { validateContent } from './governorService';
import { isEphemeralMediaReference } from './mediaAssetPrimitives.mjs';

export interface QualityCheckInput {
  text: string;
  platform?: string;
  hook?: string;
  mixPlan?: {
    settings: {
      voiceVolume: number;
      musicVolume: number;
      fxVolume: number;
      duckingEnabled: boolean;
    };
  };
  visualPrompts?: {
    imagePrompts: string[];
    videoPrompts: string[];
  };
  characterConsistencyScore?: number | null;
  requestedModalities?: {
    image: boolean;
    video: boolean;
    voice: boolean;
    music: boolean;
  };
  deliveredMedia?: {
    imageUrl?: string;
    videoUrl?: string;
    finalVideoUrl?: string;
    voiceUrl?: string;
    musicUrl?: string;
  };
}

export interface QualityCheckResult {
  approved: boolean;
  score: number;
  reasons: string[];
}

const GENERIC_GUARD = /\b(great content|here are some ideas|you can post|consider creating)\b/i;
const HOOK_STRENGTH_GUARD = /\b(why|how|before|after|wrong|secret|until|watch|wait|stops?|never|suddenly)\b/i;
const VISUAL_QUALITY_GUARD = /\b(cinematic|realism|realistic|lighting|camera|composition|texture)\b/i;

export async function runQualityControl(input: QualityCheckInput): Promise<QualityCheckResult> {
  const reasons: string[] = [];
  if (GENERIC_GUARD.test(input.text)) {
    reasons.push('Generic phrasing detected');
  }

  const hook = (input.hook || input.text.split('\n').find((line) => line.trim()) || '').trim();
  if (!hook || hook.length < 12) {
    reasons.push('Hook is too weak or too short');
  } else if (!HOOK_STRENGTH_GUARD.test(hook)) {
    reasons.push('Hook lacks a clear tension or curiosity trigger');
  }

  if (input.characterConsistencyScore !== null && input.characterConsistencyScore !== undefined && input.characterConsistencyScore < 70) {
    reasons.push(`Character consistency too weak (${input.characterConsistencyScore}/100)`);
  }

  if (input.requestedModalities?.image && !input.visualPrompts?.imagePrompts?.length) {
    reasons.push('Image prompt package is missing');
  }

  if (input.requestedModalities?.video && !input.visualPrompts?.videoPrompts?.length) {
    reasons.push('Video prompt package is missing');
  }

  if (input.requestedModalities?.voice && !input.deliveredMedia?.voiceUrl) {
    reasons.push('Voice asset is missing');
  } else if (input.deliveredMedia?.voiceUrl && isEphemeralMediaReference(input.deliveredMedia.voiceUrl)) {
    reasons.push('Voice asset is playback-only and not durable');
  }

  if (input.requestedModalities?.music && !input.deliveredMedia?.musicUrl) {
    reasons.push('Music asset is missing');
  }

  if (
    (input.requestedModalities?.voice || input.requestedModalities?.music) &&
    (input.deliveredMedia?.imageUrl || input.deliveredMedia?.videoUrl) &&
    !input.deliveredMedia?.finalVideoUrl
  ) {
    reasons.push('Final assembled media export is missing');
  }

  if (input.visualPrompts) {
    const promptBank = [...input.visualPrompts.imagePrompts, ...input.visualPrompts.videoPrompts].join('\n');
    if (promptBank && !VISUAL_QUALITY_GUARD.test(promptBank)) {
      reasons.push('Visual prompts are missing cinematic quality controls');
    }
  }

  if (input.mixPlan) {
    const { voiceVolume, musicVolume, fxVolume, duckingEnabled } = input.mixPlan.settings;
    if (voiceVolume < 0.95) {
      reasons.push('Voice is not prioritized strongly enough in the final mix');
    }
    if (musicVolume < 0.15 || musicVolume > 0.35) {
      reasons.push('Music bed is outside the target support range');
    }
    if (fxVolume < 0.1 || fxVolume > 0.25) {
      reasons.push('FX bed is outside the target support range');
    }
    if (!duckingEnabled && input.requestedModalities?.voice && input.requestedModalities?.music) {
      reasons.push('Audio mix is missing ducking under voice');
    }
  }

  const validation = await validateContent(input.text, {
    platform: input.platform,
  });

  const govValidation = validation as { governorApproved?: boolean };
  reasons.push(...validation.issues.map((issue) => issue.message));
  const adjustedScore = Math.max(0, validation.score - reasons.length * 6);

  return {
    approved: govValidation.governorApproved && reasons.length === 0 ? true : false,
    score: adjustedScore,
    reasons,
  };
}
