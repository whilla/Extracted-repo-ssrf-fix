'use client';

import type { BrandKit, ChatMediaAsset } from '@/lib/types';
import { universalChat } from './aiService';
import { loadBrandKit } from './memoryService';
import { buildMemoryContext } from './agentMemoryService';
import { initializeAgents, loadAgents, executeAgentTask, type AgentOutput } from './multiAgentService';
import { validateContent, makeGovernorDecision, recordCost } from './governorService';
import {
  generateImage as generateImageAsset,
  type ImageProvider,
} from './imageGenerationService';
import { validateImageQuality, quickValidateImage, quickValidateVideo, validateVideoQuality } from './mediaValidator';
import {
  generateVideo as generateVideoAsset,
  type VideoProvider,
} from './videoGenerationService';
import { generateSceneBreakdown, type ScenePlan } from './scenePlannerService';

type MediaKind = 'image' | 'video';

interface MediaPromptPlan {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  durationSeconds?: number;
  cameraAngle?: string;
  cameraMotion?: string;
  shotStyle?: string;
  reasoning: string;
  agentOutputs: AgentOutput[];
  scenePlan?: ScenePlan;
}

interface VideoIntentProfile {
  format: 'reel' | 'short' | 'long';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  durationSeconds: number;
}

export interface MediaGenerationResult {
  content: string;
  media: ChatMediaAsset[];
  prompt: string;
  provider: string;
}

function clampAspectRatio(input?: string): '16:9' | '9:16' | '1:1' | '4:5' {
  if (input === '9:16' || input === '1:1' || input === '4:5') return input;
  return '16:9';
}

function inferVideoIntentProfile(request: string): VideoIntentProfile {
  const lower = request.toLowerCase();

  if (/\b(reel|reels|shorts|short video|tiktok|vertical)\b/.test(lower)) {
    return {
      format: /reel/.test(lower) ? 'reel' : 'short',
      aspectRatio: '9:16',
      durationSeconds: /\b(60|one minute)\b/.test(lower) ? 60 : 20,
    };
  }

  if (/\b(long video|long-form|youtube video|episode|deep dive|explainer)\b/.test(lower)) {
    return {
      format: 'long',
      aspectRatio: '16:9',
      durationSeconds: /\b(90|120|two minutes)\b/.test(lower) ? 120 : 60,
    };
  }

  return {
    format: 'short',
    aspectRatio: '16:9',
    durationSeconds: 18,
  };
}

function wantsMaxFidelity(request: string): boolean {
  return /\b(netflix|seedance|seedance 2|ultra|highest quality|high quality|premium cinematic)\b/i.test(request);
}

function mapVideoContentType(profile: VideoIntentProfile): ScenePlan['contentType'] {
  switch (profile.format) {
    case 'reel':
      return 'reel';
    case 'long':
      return 'youtube-long';
    case 'short':
    default:
      return 'youtube-short';
  }
}

function describeScenePlan(plan: ScenePlan): string {
  return plan.scenes
    .slice(0, 8)
    .map((scene, index) =>
      `Scene ${index + 1}: ${scene.title}. ${scene.description}. ${scene.duration}s. ${scene.shotType} shot, ${scene.cameraAngle}, ${scene.lighting} lighting. ${scene.voiceover ? `VO: ${scene.voiceover}.` : ''} ${scene.dialogue ? `Dialogue: ${scene.dialogue}.` : ''} ${scene.textOverlay ? `On-screen text: ${scene.textOverlay}.` : ''}`
    )
    .join('\n');
}

async function buildMediaPrompt(
  request: string,
  kind: MediaKind,
  preferredModel?: string
): Promise<MediaPromptPlan> {
  await initializeAgents();
  const brandKit = await loadBrandKit();
  const memoryContext = await buildMemoryContext();
  const agents = await loadAgents();

  const visualAgent = agents.find(a => a.role === 'visual' && a.evolutionState !== 'deprecated');
  const strategistAgent = agents.find(a => a.role === 'strategist' && a.evolutionState !== 'deprecated');
  const videoIntent = kind === 'video' ? inferVideoIntentProfile(request) : null;
  const maxFidelity = kind === 'video' && wantsMaxFidelity(request);
  const scenePlan =
    kind === 'video' && videoIntent
      ? await generateSceneBreakdown(request, {
          platform: videoIntent.aspectRatio === '9:16' ? 'instagram' : 'youtube',
          contentType: mapVideoContentType(videoIntent),
          targetDuration: videoIntent.durationSeconds,
          style: maxFidelity
            ? 'prestige streaming realism, premium production design, natural performance, controlled cinematic camera language'
            : 'cinematic realism, premium streaming quality, natural performance',
        }).catch(() => null)
      : null;

  const aiProvider = async (prompt: string): Promise<string> =>
    universalChat(prompt, { model: preferredModel || 'gpt-4o', brandKit });

  const context = {
    brandContext: brandKit ? JSON.stringify(brandKit) : '',
    memoryContext,
    format: kind,
    platform: kind === 'video' ? 'video' : 'image',
    recentPerformance: 'Media requests should return finished assets, not a concept summary.',
  };

  const agentOutputs = (
    await Promise.all(
      [visualAgent, strategistAgent]
        .filter(Boolean)
        .map(agent => executeAgentTask(agent!, request, context, aiProvider))
    )
  ).filter(output => output.content.trim().length > 0);

  const synthesisPrompt = `You are the Nexus media governor.

User request:
${request}

Media type: ${kind}
Brand context: ${brandKit ? JSON.stringify(brandKit) : 'none'}
Memory context: ${memoryContext || 'none'}

Specialist outputs:
${agentOutputs.map(output => `[${output.agentRole}] ${output.content}`).join('\n\n') || 'No specialist output available.'}
${scenePlan ? `Storyboard plan:\n${describeScenePlan(scenePlan)}` : 'No storyboard plan available.'}

Build a production-ready ${kind} generation plan that can be sent directly to a media model.
- Do not return a concept pitch.
- Do not ask for confirmation.
- The prompt must target final asset generation.
- The negative prompt should aggressively avoid low quality, distorted anatomy, watermarks, text overlays, and extra limbs.
- For video, optimize for motion, shot continuity, and the requested runtime format.
- For video, use the storyboard plan to maintain scene continuity, character consistency, and clear progression from shot to shot.
- For video, default to premium cinematic output with natural human performance, controlled camera language, realistic lighting, and no robotic or AI-looking motion.
- For video, respect the requested format:
  - reel/shorts/tiktok => vertical 9:16 social-first pacing
  - long-form/youtube/explainer => 16:9 with longer narrative continuity
- For video, target this inferred format: ${videoIntent ? `${videoIntent.format}, ${videoIntent.aspectRatio}, ${videoIntent.durationSeconds}s` : 'n/a'}
- For video, if user requests Netflix/Seedance/high-quality output, prioritize prestige-grade realism, coherent character continuity, and physically plausible camera/lighting.
- Generated outputs must stay brand-safe, monetizable, and avoid platform policy violations, unsafe claims, spam language, and generic AI phrasing.

Return strict JSON:
{
  "prompt": "final prompt",
  "negativePrompt": "negative prompt",
  "aspectRatio": "16:9 | 9:16 | 1:1 | 4:5",
  "durationSeconds": 5,
  "cameraAngle": "eye-level",
  "cameraMotion": "slow push-in",
  "shotStyle": "cinematic close-up",
  "reasoning": "one short sentence"
}`;

  const synthesis = await universalChat(synthesisPrompt, {
    model: preferredModel || 'gpt-4o',
    brandKit,
  });

  const jsonMatch = synthesis.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to build a media generation plan');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const prompt = String(parsed.prompt || '').trim();
  if (!prompt) {
    throw new Error('Media prompt plan was empty');
  }

  const validation = await validateContent(prompt, {
    isRegeneration: false,
  });
  const governorDecision = await makeGovernorDecision(validation, {
    currentModel: preferredModel || 'gpt-4o',
    regenerationCount: 0,
  });

  if (!governorDecision.approved) {
    throw new Error(governorDecision.reason || 'Governor rejected the media prompt plan');
  }

  return {
    prompt,
    negativePrompt: String(parsed.negativePrompt || '').trim() || undefined,
    aspectRatio: clampAspectRatio(parsed.aspectRatio || videoIntent?.aspectRatio),
    durationSeconds:
      kind === 'video' && maxFidelity
        ? Math.max(Number(parsed.durationSeconds) || videoIntent?.durationSeconds || 8, 8)
        : Number(parsed.durationSeconds) || videoIntent?.durationSeconds || 5,
    cameraAngle: String(parsed.cameraAngle || '').trim() || undefined,
    cameraMotion: String(parsed.cameraMotion || '').trim() || undefined,
    shotStyle: String(parsed.shotStyle || '').trim() || undefined,
    reasoning: String(parsed.reasoning || '').trim() || 'Prompt synthesized by the media agent system.',
    agentOutputs,
    scenePlan: scenePlan || undefined,
  };
}

export async function generateAgentImage(
  request: string,
  options: {
    preferredModel?: string;
    provider?: ImageProvider;
  } = {}
): Promise<MediaGenerationResult> {
  const maxFidelity = wantsMaxFidelity(request);
  const useFastPath = !maxFidelity;
  let plan = useFastPath
    ? {
        prompt: request.trim(),
        negativePrompt: undefined,
        aspectRatio: clampAspectRatio(/\b(9:16|vertical|reel|shorts|tiktok)\b/i.test(request) ? '9:16' : '16:9'),
        reasoning: 'Fast-path prompt routing for lower latency image generation.',
        agentOutputs: [],
      }
    : await buildMediaPrompt(request, 'image', options.preferredModel);
  const generationStrategies: Array<{
    provider?: ImageProvider;
    qualityTier: 'netflix' | 'premium';
    minQualityScore: number;
  }> = options.provider
    ? [
        { provider: options.provider, qualityTier: 'netflix', minQualityScore: 78 },
        { provider: undefined, qualityTier: 'netflix', minQualityScore: 78 },
        { provider: undefined, qualityTier: 'premium', minQualityScore: 72 },
      ]
    : [
        { provider: undefined, qualityTier: 'netflix', minQualityScore: 78 },
        { provider: undefined, qualityTier: 'premium', minQualityScore: 72 },
      ];

  let result: Awaited<ReturnType<typeof generateImageAsset>> | null = null;
  let lastError: Error | null = null;
  let usedMinQualityScore = 78;
  const maxGenerationAttempts = useFastPath ? 1 : 2;

  for (let generationAttempt = 0; generationAttempt < maxGenerationAttempts && !result; generationAttempt++) {
    for (const strategy of generationStrategies) {
      try {
        result = await generateImageAsset({
          prompt: plan.prompt,
          negativePrompt: plan.negativePrompt,
          provider: strategy.provider,
          qualityTier: strategy.qualityTier,
          width: plan.aspectRatio === '9:16' ? 1024 : 1024,
          height: plan.aspectRatio === '9:16' ? 1792 : 1024,
        });
        usedMinQualityScore = strategy.minQualityScore;
        break;
      } catch (error) {
        lastError = error as Error;
        console.warn(
          `Agent image generation failed on ${strategy.provider || 'auto'} (${strategy.qualityTier}), retrying with fallback`,
          lastError
        );
      }
    }

    if (!result) {
      continue;
    }

    const quickValidation = quickValidateImage(result.url);
    if (!quickValidation.valid) {
      lastError = new Error(quickValidation.reason || 'Generated image was invalid');
      result = null;
    } else if (!useFastPath) {
      const quality = await validateImageQuality(result.url);
      if (!quality.passed || (quality.score || 0) < usedMinQualityScore) {
        lastError = new Error(quality.reason || 'Generated image failed quality validation');
        result = null;
      }
    }

    if (!result && generationAttempt === 0) {
      plan = {
        ...plan,
        prompt: `${plan.prompt} Improve subject realism, facial structure, hand anatomy, lighting contrast, and premium cinematic clarity. Avoid any artificial or game-engine look.`,
        negativePrompt: `${plan.negativePrompt || ''}, malformed hands, weak face detail, flat lighting, plastic skin, amateur composition`,
      };
    }
  }

  if (!result) {
    throw lastError || new Error('Image generation failed across providers');
  }

  await recordCost({
    provider: result.provider,
    model: 'image-generation',
    tokens: plan.prompt.length,
    cost: 1,
    taskType: 'image_generation',
  });

  return {
    content: `Generated an image with ${result.provider}.\n\nPrompt used: ${plan.prompt}`,
    media: [
      {
        type: 'image',
        url: result.url,
        provider: result.provider,
        prompt: plan.prompt,
      },
    ],
    prompt: plan.prompt,
    provider: result.provider,
  };
}

export async function generateAgentVideo(
  request: string,
  options: {
    preferredModel?: string;
    provider?: VideoProvider;
  } = {}
): Promise<MediaGenerationResult> {
  const maxFidelity = wantsMaxFidelity(request);
  const minQualityScore = maxFidelity ? 88 : 82;
  let plan = await buildMediaPrompt(request, 'video', options.preferredModel);
  const providerAttempts: VideoProvider[] = options.provider
    ? [options.provider, options.provider === 'ltx23' ? 'ltx23-open' : 'ltx23']
    : ['ltx23', 'ltx23-open'];

  let result: Awaited<ReturnType<typeof generateVideoAsset>> | null = null;
  let lastError: Error | null = null;

  for (let generationAttempt = 0; generationAttempt < 2 && !result; generationAttempt++) {
    for (const provider of providerAttempts) {
      try {
        result = await generateVideoAsset({
          prompt: plan.prompt,
          negativePrompt: plan.negativePrompt,
          provider,
          aspectRatio: plan.aspectRatio,
          durationSeconds: plan.durationSeconds,
          cameraAngle: plan.cameraAngle,
          cameraMotion: plan.cameraMotion,
          shotStyle: plan.shotStyle,
          qualityProfile: 'netflix',
        });
        break;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Agent video generation failed on ${provider}, retrying with fallback`, lastError);
      }
    }

    if (!result) {
      continue;
    }

    const quickValidation = quickValidateVideo(result.url, plan.prompt, result.thumbnailUrl);
    if (!quickValidation.valid) {
      lastError = new Error(quickValidation.reason || 'Generated video was invalid');
      result = null;
    } else {
      const quality = await validateVideoQuality({
        videoUrl: result.url,
        prompt: plan.prompt,
        thumbnailUrl: result.thumbnailUrl,
      });
      if (!quality.passed || (quality.score || 0) < minQualityScore) {
        lastError = new Error(quality.reason || 'Generated video failed quality validation');
        result = null;
      }
    }

    if (!result && generationAttempt === 0) {
      const storyboardStrength = plan.scenePlan
        ? ` Preserve this storyboard continuity exactly:\n${describeScenePlan(plan.scenePlan)}`
        : '';
      plan = {
        ...plan,
        prompt: `${plan.prompt} Improve temporal consistency, preserve face identity, keep wardrobe and props locked, maintain premium motion realism, and eliminate any AI-looking jitter or morphing. Use realistic lensing, motivated lighting, and grounded scene blocking.${storyboardStrength}`,
        negativePrompt: `${plan.negativePrompt || ''}, face drift, identity drift, frame flicker, bad motion interpolation, slideshow pacing, warped limbs, plastic skin, over-sharpened edges, synthetic CGI look`,
      };
    }
  }

  if (!result) {
    throw lastError || new Error('Video generation failed across providers');
  }

  await recordCost({
    provider: result.provider,
    model: 'video-generation',
    tokens: plan.prompt.length,
    cost: 3,
    taskType: 'video_generation',
  });

  return {
    content: `Generated a video with ${result.provider}.\n\nPrompt used: ${plan.prompt}`,
    media: [
      {
        type: 'video',
        url: result.url,
        provider: result.provider,
        prompt: plan.prompt,
        thumbnailUrl: result.thumbnailUrl,
      },
    ],
    prompt: plan.prompt,
    provider: result.provider,
  };
}
