

import type { Platform } from '@/lib/types';
import { generateContent } from './contentEngine';
import { generateAgentImage, generateAgentVideo } from './agentMediaService';
import { generateBackgroundMusic, getBrowserMusicGenerator } from './musicEngine';
import { generateVoice } from './voiceGenerationService';
import { analyzeNiche, type BrandProfile } from './nicheAnalyzerService';
import { persistBrandProfile, saveCharacterLock } from './brandMemoryAgentService';
import {
  createCharacterLock,
  enforceCharacterLock,
  scoreCharacterConsistency,
  type CharacterIdentity,
} from './characterLockAgentService';
import { buildStoryContent } from './storyEngineService';
import { directScenes } from './sceneDirectorService';
import { mapEmotionFromScene } from './emotionMappingEngine';
import { buildBeatTimingPlan } from './beatTimingEngine';
import { buildSoundDesignPlan } from './soundDesignService';
import { buildAudioMixPlan } from './audioMixingService';
import { amplifyHook } from './hookAmplifierService';
import { buildVisualPromptPackage } from './visualPromptEngineService';
import { optimizeForPlatforms } from './platformOptimizerService';
import { runQualityControl } from './qualityControlAgentService';
import { resolveGenerationRoute } from './generationControllerService';
import { enqueuePostJob } from './postQueueService';
import { assembleFinalMedia } from './finalMediaAssemblyService';
import { persistBlobMediaAsset, persistMediaReference } from './mediaAssetPersistenceService';
import { isEphemeralMediaReference, shouldAssembleFinalMedia } from './mediaAssetPrimitives.mjs';

const DEFAULT_PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube'];

export interface UniversalPipelineRequest {
  prompt: string;
  generationId?: string;
  niche?: string;
  tone?: string;
  goal?: string;
  platforms?: Platform[];
  includeImage?: boolean;
  includeVideo?: boolean;
  includeVoice?: boolean;
  includeMusic?: boolean;
  enqueueForPosting?: boolean;
  onProgress?: (message: string, task?: string) => void | Promise<void>;
}

export interface UniversalPipelineResult {
  executionPlan: string[];
  brandProfile: BrandProfile;
  identity: string;
  rules: string[];
  structure: string;
  content: {
    hook: string;
    script: string;
    variations: string[];
    hashtags: string[];
  };
  visualPrompts: {
    imagePrompts: string[];
    videoPrompts: string[];
  };
  platformPackages: ReturnType<typeof optimizeForPlatforms>['packages'];
  audio: {
    voiceUrl?: string;
    musicUrl?: string;
    mixPlan: ReturnType<typeof buildAudioMixPlan>;
  };
  media: {
    imageUrl?: string;
    videoUrl?: string;
    finalVideoUrl?: string;
  };
  criticVerdict: {
    approved: boolean;
    score: number;
    reasons: string[];
  };
  warnings: string[];
  queueIds: string[];
}

function buildIdentity(profile: BrandProfile, character: CharacterIdentity | null): string {
  if (profile.contentType === 'story' && character) {
    return `Story identity centered on ${character.name} with strict character lock and loop-based suspense progression.`;
  }
  if (profile.contentType === 'business') {
    return `Authority identity for ${profile.niche}: direct, proof-oriented, conversion-aware communication.`;
  }
  if (profile.contentType === 'education') {
    return `Educator identity for ${profile.niche}: clarity-first, practical, structured explanation style.`;
  }
  return `Creator persona for ${profile.niche}: ${profile.tone}, emotionally engaging, retention-focused delivery.`;
}

function buildRuleSet(profile: BrandProfile): string[] {
  const baseRules = [
    'No generic phrasing or filler.',
    'First 3 seconds must create curiosity or tension.',
    'Every output must match the niche and audience intent.',
    'Keep tone natural, direct, and human.',
  ];

  if (profile.contentType === 'story') {
    return [
      ...baseRules,
      'Mystery over explanation.',
      'Scene-based progression with loop-friendly ending.',
      'Include one anomaly or tension spike per major beat.',
    ];
  }
  if (profile.contentType === 'education') {
    return [
      ...baseRules,
      'Clarity first, then depth.',
      'Use structured steps with concrete takeaways.',
      'Avoid ambiguity and vague advice.',
    ];
  }
  if (profile.contentType === 'entertainment') {
    return [
      ...baseRules,
      'Fast hooks and frequent pattern interrupts.',
      'Escalate energy every major beat.',
      'End on replay trigger.',
    ];
  }

  return [...baseRules, 'Balance narrative engagement with practical value.'];
}

const PIPELINE_MEDIA_TIMEOUT_MS = {
  image: 120_000,
  video: 240_000,
  voice: 120_000,
  music: 120_000,
  finalMix: 120_000,
} as const;

function withPipelineTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} did not finish within ${Math.round(timeoutMs / 60_000)} minutes.`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

async function emitProgress(request: UniversalPipelineRequest, message: string, task?: string): Promise<void> {
  if (!request.onProgress) return;
  await request.onProgress(message, task);
}

function formatProviderError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!message.trim()) return fallback;
  if (/signal is aborted|aborted without reason|aborterror/i.test(message)) {
    return `${fallback} The provider request was aborted before returning a playable asset.`;
  }
  return message;
}

function buildStructure(profile: BrandProfile): string {
  if (profile.contentType === 'story') return 'Scene -> Escalation -> Cliffhanger Loop';
  if (profile.contentType === 'education') return 'Hook -> Value -> Takeaway -> CTA';
  return 'Hook -> Retention Beat -> Loop/CTA';
}

function ensureHookLead(text: string, hook: string): string {
  const trimmedText = text.trim();
  const trimmedHook = hook.trim();

  if (!trimmedText) return trimmedHook;
  if (!trimmedHook) return trimmedText;

  const firstLine = trimmedText.split('\n').map((line) => line.trim()).find(Boolean) || '';
  if (firstLine.toLowerCase() === trimmedHook.toLowerCase()) {
    return trimmedText;
  }

  return `${trimmedHook}\n\n${trimmedText}`;
}

async function normalizeMediaAssetUrl(
  rawUrl: string | undefined,
  options: {
    kind: 'image' | 'video' | 'audio';
    generationId?: string;
    mimeTypeHint?: string;
    label: string;
    warnings: string[];
  }
): Promise<string | undefined> {
  if (!rawUrl) return undefined;

  try {
    const persisted = await persistMediaReference(rawUrl, {
      kind: options.kind,
      generationId: options.generationId,
      mimeTypeHint: options.mimeTypeHint,
    });

    if (persisted?.url) {
      return persisted.url;
    }

    options.warnings.push(`${options.label} asset could not be persisted as a durable file.`);
  } catch (error) {
    options.warnings.push(
      `${options.label} asset persistence failed: ${error instanceof Error ? error.message : 'Unknown persistence error'}`
    );
  }

  return rawUrl;
}

export async function runUniversalContentPipeline(
  request: UniversalPipelineRequest
): Promise<UniversalPipelineResult> {
  const pipelineRunId = `pipeline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const platforms = request.platforms?.length ? request.platforms : DEFAULT_PLATFORMS;
  const brandProfile = await analyzeNiche({
    request: request.prompt,
    niche: request.niche,
    tone: request.tone,
    goal: request.goal,
  });

  const character = brandProfile.contentType === 'story' ? createCharacterLock(request.prompt) : null;
  if (character) {
    await saveCharacterLock({
      name: character.name,
      faceSignature: character.faceSignature,
      clothingSignature: character.clothingSignature,
      physicalTraits: character.physicalTraits,
      identityVector: character.identityVector,
      referenceDescriptor: character.referenceDescriptor,
    });
  }

  await persistBrandProfile(brandProfile);

  const identity = buildIdentity(brandProfile, character);
  const rules = buildRuleSet(brandProfile);
  const structure = buildStructure(brandProfile);

  const story = await buildStoryContent(request.prompt, brandProfile);
  const amplifiedHook = amplifyHook(story.hook);
  const lockedScript = character ? enforceCharacterLock(story.script, character) : story.script;
  const warnings: string[] = [];
  let characterConsistencyScore: number | null = null;
  if (character) {
    characterConsistencyScore = scoreCharacterConsistency(lockedScript, character);
    if (characterConsistencyScore < 70) {
      warnings.push(`Character consistency is weak (${characterConsistencyScore}/100). Regeneration or tighter brief is recommended.`);
    }
  }

  let generated: Awaited<ReturnType<typeof generateContent>>;

  try {
    generated = await generateContent({
      idea: `${amplifiedHook.hook}\n\n${lockedScript}`,
      platforms,
      customInstructions: `Apply identity: ${identity}\nRules:\n- ${rules.join('\n- ')}\nStructure: ${structure}`,
    });
  } catch (error) {
    warnings.push(
      `Text generation fallback used: ${error instanceof Error ? error.message : 'Unknown generation error'}`
    );
    generated = {
      text: `${amplifiedHook.hook}\n\n${lockedScript}`.trim(),
      variations: [],
      hashtags: [],
      platformPackages: [],
    };
  }

  const finalScript = ensureHookLead(generated.text, amplifiedHook.hook);

  const scenes = directScenes(finalScript);
  const emotion = mapEmotionFromScene(scenes.map((scene) => scene.description).join('\n'));
  const beatPlan = buildBeatTimingPlan(12, emotion.emotion);
  const soundDesign = buildSoundDesignPlan(emotion.emotion, beatPlan);
  const mixPlan = buildAudioMixPlan(soundDesign);

  const visualPromptSource = buildVisualPromptPackage(
    scenes,
    brandProfile.styleTags,
    character
      ? `${character.name}, ${character.faceSignature}, ${character.clothingSignature}, identity-anchor-${character.identityVector.join('-')}`
      : undefined
  );

  const route = await resolveGenerationRoute();
  let imageUrl: string | undefined;
  let videoUrl: string | undefined;
  let finalVideoUrl: string | undefined;

  if (request.includeImage !== false && visualPromptSource.imagePrompts[0]) {
    try {
      await emitProgress(
        request,
        `Let me call the image generation agent first using ${route.imageProvider}.`,
        'Calling image generation agent...'
      );
      const imageResult = await withPipelineTimeout(
        generateAgentImage(visualPromptSource.imagePrompts[0], {
          preferredModel: route.textModel,
          provider: route.imageProvider,
        }),
        PIPELINE_MEDIA_TIMEOUT_MS.image,
        'Pipeline image generation'
      );
      imageUrl = await normalizeMediaAssetUrl(imageResult.media[0]?.url, {
        kind: 'image',
        generationId: request.generationId || '',
        label: 'Image',
        warnings,
      });
      if (!imageUrl) {
        warnings.push('Image generation returned no asset URL.');
      } else {
        await emitProgress(request, 'The image generation agent returned an image asset.', 'Image asset ready...');
      }
    } catch (error) {
      const message = formatProviderError(error, 'Image generation failed.');
      warnings.push(`Image generation failed: ${message}`);
      await emitProgress(
        request,
        `The image generation agent failed: ${message}`,
        'Image generation failed...'
      );
    }
  }

  if (request.includeVideo !== false && visualPromptSource.videoPrompts[0]) {
    try {
      await emitProgress(
        request,
        `Let me call the video generation agent using ${route.videoProvider}. I will stop waiting if the provider stalls too long.`,
        'Calling video generation agent...'
      );
      const videoResult = await withPipelineTimeout(
        generateAgentVideo(visualPromptSource.videoPrompts[0], {
          preferredModel: route.textModel,
          provider: route.videoProvider,
        }),
        PIPELINE_MEDIA_TIMEOUT_MS.video,
        'Pipeline video generation'
      );
      videoUrl = await normalizeMediaAssetUrl(videoResult.media[0]?.url, {
        kind: 'video',
        generationId: request.generationId || '',
        label: 'Video',
        warnings,
      });
      if (!videoUrl) {
        warnings.push('Video generation returned no asset URL.');
      } else {
        await emitProgress(request, 'The video generation agent returned a playable video asset.', 'Video asset ready...');
      }
    } catch (error) {
      const message = formatProviderError(error, 'Video generation failed.');
      warnings.push(`Video generation failed: ${message}`);
      await emitProgress(
        request,
        `The video generation agent failed: ${message}`,
        'Video generation failed...'
      );
    }
  }

  let voiceUrl: string | undefined;
  if (request.includeVoice !== false) {
    try {
      await emitProgress(request, 'I am calling the ElevenLabs voice generation agent for the narration track.', 'Calling ElevenLabs voice agent...');
      const voice = await withPipelineTimeout(
        generateVoice({
          text: finalScript,
          provider: 'elevenlabs',
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          speed: emotion.pacing === 'slow' ? 0.88 : emotion.pacing === 'fast' ? 1.08 : 1,
        }),
        PIPELINE_MEDIA_TIMEOUT_MS.voice,
        'Pipeline voice generation'
      );
      voiceUrl = await normalizeMediaAssetUrl(typeof voice === 'string' ? voice : undefined, {
        kind: 'audio',
        generationId: request.generationId || '',
        mimeTypeHint: 'audio/mpeg',
        label: 'Voice',
        warnings,
      });
      if (voiceUrl && isEphemeralMediaReference(voiceUrl)) {
        warnings.push('Voice generation is playback-only in the current provider path. Configure a hosted TTS provider for durable voice assets.');
      }
      if (!voiceUrl) {
        warnings.push('Voice generation returned no reusable audio asset.');
      } else {
        await emitProgress(request, 'The voice generation agent returned a playable narration asset.', 'Voice asset ready...');
      }
    } catch (error) {
      const message = formatProviderError(error, 'Voice generation failed.');
      warnings.push(`Voice generation failed: ${message}`);
      voiceUrl = undefined;
      await emitProgress(
        request,
        `The ElevenLabs voice generation agent failed: ${message}`,
        'Voice generation failed...'
      );
    }
  }

  let musicUrl: string | undefined;
  if (request.includeMusic !== false) {
    try {
      await emitProgress(request, 'I am calling the music generation agent for the soundtrack layer.', 'Calling music generation agent...');
      const music = await withPipelineTimeout(
        generateBackgroundMusic(finalScript, { duration: beatPlan.durationSeconds }),
        PIPELINE_MEDIA_TIMEOUT_MS.music,
        'Pipeline music generation'
      );
      if (music?.url === 'browser-generated') {
        try {
          await emitProgress(request, 'The music layer needs local rendering. I am turning it into a playable audio file now.', 'Rendering music asset...');
          const blob = await withPipelineTimeout(
            getBrowserMusicGenerator().generateMusic(music.mood, music.duration || beatPlan.durationSeconds),
            PIPELINE_MEDIA_TIMEOUT_MS.music,
            'Pipeline browser music rendering'
          );
          const persisted = await persistBlobMediaAsset(blob, {
            kind: 'audio',
        generationId: request.generationId || '',
            fileExtension: 'webm',
          });
          musicUrl = persisted?.url;
          if (!musicUrl) {
            warnings.push('Browser-generated music could not be persisted as a durable asset.');
          } else {
            await emitProgress(request, 'The music generation agent returned a playable soundtrack asset.', 'Music asset ready...');
          }
        } catch (error) {
          warnings.push(`Browser music persistence failed: ${error instanceof Error ? error.message : 'Unknown browser music error'}`);
        }
      } else {
        musicUrl = await normalizeMediaAssetUrl(music?.url, {
          kind: 'audio',
          generationId: request.generationId || '',
          mimeTypeHint: 'audio/mpeg',
          label: 'Music',
          warnings,
        });
        if (musicUrl) {
          await emitProgress(request, 'The music generation agent returned a playable soundtrack asset.', 'Music asset ready...');
        }
      }
      if (!musicUrl) {
        warnings.push('Music generation returned no asset URL.');
      }
    } catch (error) {
      const message = formatProviderError(error, 'Music generation failed.');
      warnings.push(`Music generation failed: ${message}`);
      await emitProgress(
        request,
        `The music generation agent failed: ${message}`,
        'Music generation failed...'
      );
    }
  }

  if (shouldAssembleFinalMedia({ imageUrl, videoUrl, voiceUrl, musicUrl })) {
    await emitProgress(request, 'Visual and audio layers are ready. I am calling the final mix/export step now.', 'Assembling final media...');
    const assembly = await withPipelineTimeout(
      assembleFinalMedia({
        imageUrl,
        videoUrl,
        voiceUrl,
        musicUrl,
        mixPlan,
        durationSeconds: beatPlan.durationSeconds,
        generationId: request.generationId || '',
      }),
      PIPELINE_MEDIA_TIMEOUT_MS.finalMix,
      'Final media assembly'
    );

    if (assembly.asset?.url) {
      finalVideoUrl = assembly.asset.url;
      await emitProgress(request, 'The final mix/export step returned a finished video asset.', 'Final video ready...');
    }

    warnings.push(...assembly.warnings);
    if (!finalVideoUrl && (voiceUrl || musicUrl)) {
      warnings.push('Final media assembly did not produce a durable export.');
    }
  }

  const platformOptimized = optimizeForPlatforms(finalScript, generated.hashtags, platforms);
  const quality = await runQualityControl({
    text: finalScript,
    platform: platforms[0],
    hook: amplifiedHook.hook,
    mixPlan,
    visualPrompts: visualPromptSource,
    characterConsistencyScore,
    requestedModalities: {
      image: request.includeImage !== false,
      video: request.includeVideo !== false,
      voice: request.includeVoice !== false,
      music: request.includeMusic !== false,
    },
    deliveredMedia: {
      imageUrl,
      videoUrl,
      finalVideoUrl,
      voiceUrl,
      musicUrl,
    },
  });

  const queueIds: string[] = [];
  if (request.enqueueForPosting) {
    for (const pkg of platformOptimized.packages) {
      const job = await enqueuePostJob({
        text: `${pkg.text}\n\n${pkg.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')}`.trim(),
        platforms: [pkg.platform],
        mediaUrl: finalVideoUrl || videoUrl || imageUrl,
        generationId: request.generationId || '',
        pipelineRunId,
        niche: brandProfile.niche,
        hook: amplifiedHook.hook,
      });
      queueIds.push(job.id);
    }
  }

  const allReasons = [...quality.reasons, ...warnings];
  const adjustedScore = Math.max(0, quality.score - warnings.length * 6);

  return {
    executionPlan: [
      'Analyze niche, audience intent, tone, and style signals',
      'Lock brand identity, character continuity, and execution rules',
      'Generate hook, script, story beats, and directed scenes',
      'Build cinematic image/video prompts and select fallback-ready generation routes',
      'Generate voice, music, sound-design timing, and a voice-forward mix plan when requested',
      'Assemble a final export when visual and audio layers are available, then optimize per platform and run quality control',
    ],
    brandProfile,
    identity,
    rules,
    structure,
    content: {
      hook: amplifiedHook.hook,
      script: finalScript,
      variations: generated.variations,
      hashtags: generated.hashtags,
    },
    visualPrompts: visualPromptSource,
    platformPackages: platformOptimized.packages,
    audio: {
      voiceUrl,
      musicUrl,
      mixPlan,
    },
    media: {
      imageUrl,
      videoUrl,
      finalVideoUrl,
    },
    criticVerdict: {
      approved: quality.approved && warnings.length === 0,
      score: adjustedScore,
      reasons: allReasons,
    },
    warnings,
    queueIds,
  };
}
