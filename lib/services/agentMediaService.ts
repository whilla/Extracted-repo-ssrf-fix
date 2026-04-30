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
  platform?: string;
  messageHook?: string;
  fallbackPrompts?: {
    primary: string;
    fallback_stability: string;
    fallback_midjourney: string;
    fallback_replicate?: string;
  };
  brandFitCheck?: string;
  expectedPerformance?: string;
  cameraSpecs?: string;
  audioPlan?: string;
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

function wantsHumanStudioRealism(request: string): boolean {
  return /\b(character|portrait|human|person|man|woman|face|facial|skin|realistic person|studio photo|photoreal)\b/i.test(request);
}

function inferCameraSpecs(request: string, kind: MediaKind): {
  focalLength: '24mm' | '35mm' | '50mm' | '85mm' | '135mm';
  aperture: 'f/2.0' | 'f/2.8' | 'f/4.0' | 'f/5.6';
  frameRate?: '24fps' | '30fps' | '60fps';
  movement?: string;
} {
  const lower = request.toLowerCase();
  const focalLength = /\b135mm\b/.test(lower)
    ? '135mm'
    : /\b85mm\b/.test(lower)
    ? '85mm'
    : /\b50mm\b/.test(lower)
    ? '50mm'
    : /\b35mm\b/.test(lower)
    ? '35mm'
    : '24mm';
  const aperture = /\bf\/?5\.6\b/.test(lower)
    ? 'f/5.6'
    : /\bf\/?4(\.0)?\b/.test(lower)
    ? 'f/4.0'
    : /\bf\/?2(\.0)?\b/.test(lower)
    ? 'f/2.0'
    : 'f/2.8';
  const frameRate = kind === 'video'
    ? /\b60fps\b/.test(lower)
      ? '60fps'
      : /\b30fps\b/.test(lower)
      ? '30fps'
      : '24fps'
    : undefined;
  const movement = kind === 'video'
    ? /\b(orbit)\b/.test(lower)
      ? 'slow orbit'
      : /\b(push[- ]?in|dolly in)\b/.test(lower)
      ? 'slow push-in'
      : /\b(pull[- ]?out|dolly back)\b/.test(lower)
      ? 'dolly pull-out'
      : /\b(track|tracking)\b/.test(lower)
      ? 'stabilized tracking shot'
      : /\b(pan)\b/.test(lower)
      ? 'controlled pan'
      : 'gimbal-stabilized cinematic move'
    : undefined;

  return { focalLength, aperture, frameRate, movement };
}

function inferImagePlatform(request: string): {
  platform: 'Instagram Feed' | 'Instagram Reels' | 'Twitter/X' | 'TikTok' | 'LinkedIn' | 'YouTube Thumbnail';
  aspectRatio: '16:9' | '9:16' | '4:5';
  dimensions: string;
  optimizationNotes: string;
} {
  const lower = request.toLowerCase();
  if (/\b(reel|reels|instagram reels|ig reels)\b/.test(lower)) {
    return {
      platform: 'Instagram Reels',
      aspectRatio: '9:16',
      dimensions: '1080x1920',
      optimizationNotes: 'Vertical emphasis, dynamic energy, anticipation for motion, must work as a thumbnail in the first 3 frames.',
    };
  }
  if (/\b(tiktok)\b/.test(lower)) {
    return {
      platform: 'TikTok',
      aspectRatio: '9:16',
      dimensions: '1080x1920',
      optimizationNotes: 'Vertical trend-aware composition, punchy focal hierarchy, high thumb-stop contrast.',
    };
  }
  if (/\b(twitter|x.com| x )\b/.test(lower)) {
    return {
      platform: 'Twitter/X',
      aspectRatio: '16:9',
      dimensions: '1200x675',
      optimizationNotes: 'Readable at small sizes, bold contrast, clear focal object with space for optional headline text.',
    };
  }
  if (/\b(linkedin)\b/.test(lower)) {
    return {
      platform: 'LinkedIn',
      aspectRatio: '16:9',
      dimensions: '1200x628',
      optimizationNotes: 'Professional authority, clean hierarchy, trust-building composition for thought-leadership context.',
    };
  }
  if (/\b(youtube|thumbnail)\b/.test(lower)) {
    return {
      platform: 'YouTube Thumbnail',
      aspectRatio: '16:9',
      dimensions: '1280x720',
      optimizationNotes: 'Extreme clarity, high contrast, oversized focal subject, legible at feed preview size.',
    };
  }

  return {
    platform: 'Instagram Feed',
    aspectRatio: '4:5',
    dimensions: '1080x1350',
    optimizationNotes: 'Static scroll-stop composition with one dominant focal point and vibrant premium color grading.',
  };
}

function isWeakImageBrief(request: string): boolean {
  const normalized = request.trim().toLowerCase();
  if (normalized.length < 24) return true;
  if (/^(make|create|generate)\s+(an?\s+)?image[.!?]*$/.test(normalized)) return true;
  const hasConcreteSubject = /\b(person|character|product|dashboard|scene|poster|cover|portrait|studio|campaign|thumbnail|brand)\b/.test(normalized);
  return !hasConcreteSubject;
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
  const imageIntent = kind === 'image' ? inferImagePlatform(request) : null;
  const cameraSpecs = inferCameraSpecs(request, kind);
  const maxFidelity = kind === 'video' && wantsMaxFidelity(request);
  const humanStudioRealism = kind === 'image' && wantsHumanStudioRealism(request);
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
- For image, enforce NexusAI brand DNA: dark futuristic, sleek high-tech but human, with cyan (#00F5FF) and violet (#BF5FFF) integrated naturally in lighting/accent elements.
- For image, output a stop-scroll composition tailored to the target platform and dimensions.
- For image, avoid cartoon, illustration, game-art, and synthetic plastic skin aesthetics.
- For image, if the subject is a human/character/portrait, enforce natural live-action studio realism, accurate anatomy, realistic skin texture, and true-to-camera lens behavior.
- Apply premium camera specs: ${cameraSpecs.focalLength}, ${cameraSpecs.aperture}${cameraSpecs.frameRate ? `, ${cameraSpecs.frameRate}` : ''}${cameraSpecs.movement ? `, movement: ${cameraSpecs.movement}` : ''}.
- Apply cinematic color science: rich blacks, lifted shadows, controlled highlight rolloff, cool shadow tones with warm accents, and natural skin tones.
- For video, optimize for motion, shot continuity, and the requested runtime format.
- For video, use the storyboard plan to maintain scene continuity, character consistency, and clear progression from shot to shot.
- For video, default to premium cinematic output with natural human performance, controlled camera language, realistic lighting, and no robotic or AI-looking motion.
- For video, respect the requested format:
  - reel/shorts/tiktok => vertical 9:16 social-first pacing
  - long-form/youtube/explainer => 16:9 with longer narrative continuity
- For video, target this inferred format: ${videoIntent ? `${videoIntent.format}, ${videoIntent.aspectRatio}, ${videoIntent.durationSeconds}s` : 'n/a'}
- For video, if user requests Netflix/Seedance/high-quality output, prioritize prestige-grade realism, coherent character continuity, and physically plausible camera/lighting.
- Generated outputs must stay brand-safe, monetizable, and avoid platform policy violations, unsafe claims, spam language, and generic AI phrasing.
${kind === 'video' ? '- Include explicit audio guidance: voice-forward mix, subtle underscore, clean transition SFX, avoid clipping and muddy low-end.' : ''}
${imageIntent ? `- For image, target platform: ${imageIntent.platform}, ${imageIntent.dimensions}, ratio ${imageIntent.aspectRatio}. ${imageIntent.optimizationNotes}` : ''}
${humanStudioRealism ? '- For image, force an editorial studio photography result and explicitly reject stylized/cartoon outputs.' : ''}

Return strict JSON:
{
  "prompt": "final prompt",
  "negativePrompt": "negative prompt",
  "aspectRatio": "16:9 | 9:16 | 1:1 | 4:5",
  "durationSeconds": 5,
  "cameraAngle": "eye-level",
  "cameraMotion": "slow push-in",
  "shotStyle": "cinematic close-up",
  "reasoning": "one short sentence",
  "platform": "Instagram Feed",
  "messageHook": "2-second takeaway",
  "fallbackPrompts": {
    "primary": "provider-agnostic production prompt",
    "fallback_stability": "technical prompt for SDXL/Stability",
    "fallback_midjourney": "creative prompt for Midjourney with --ar",
    "fallback_replicate": "simpler focused prompt for Replicate"
  },
  "brandFitCheck": "one line about NexusAI visual alignment",
  "expectedPerformance": "one line about why it should perform on the target platform",
  "cameraSpecs": "camera package summary",
  "audioPlan": "audio mix summary for video, optional for image"
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
    aspectRatio: clampAspectRatio(parsed.aspectRatio || videoIntent?.aspectRatio || imageIntent?.aspectRatio),
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
    platform: String(parsed.platform || imageIntent?.platform || '').trim() || undefined,
    messageHook: String(parsed.messageHook || '').trim() || undefined,
    fallbackPrompts:
      parsed.fallbackPrompts &&
      typeof parsed.fallbackPrompts === 'object' &&
      typeof parsed.fallbackPrompts.primary === 'string' &&
      typeof parsed.fallbackPrompts.fallback_stability === 'string' &&
      typeof parsed.fallbackPrompts.fallback_midjourney === 'string'
        ? {
            primary: String(parsed.fallbackPrompts.primary),
            fallback_stability: String(parsed.fallbackPrompts.fallback_stability),
            fallback_midjourney: String(parsed.fallbackPrompts.fallback_midjourney),
            fallback_replicate:
              typeof parsed.fallbackPrompts.fallback_replicate === 'string'
                ? String(parsed.fallbackPrompts.fallback_replicate)
                : undefined,
          }
        : undefined,
    brandFitCheck: String(parsed.brandFitCheck || '').trim() || undefined,
    expectedPerformance: String(parsed.expectedPerformance || '').trim() || undefined,
    cameraSpecs: String(parsed.cameraSpecs || '').trim() || undefined,
    audioPlan: String(parsed.audioPlan || '').trim() || undefined,
  };
}

export async function generateAgentImage(
  request: string,
  options: {
    preferredModel?: string;
    provider?: ImageProvider;
  } = {}
): Promise<MediaGenerationResult> {
  const weakBrief = isWeakImageBrief(request);
  const effectiveRequest = weakBrief
    ? `${request.trim()} Create a premium, platform-ready image with one clear focal subject, natural realism, strong contrast, and a stop-scroll hook.`
    : request;
  const maxFidelity = wantsMaxFidelity(request);
  const humanStudioRealism = wantsHumanStudioRealism(request);
  const useFastPath = !maxFidelity;
  const inferredImageIntent = inferImagePlatform(effectiveRequest);
  let plan = useFastPath
    ? {
        prompt: humanStudioRealism
          ? `${effectiveRequest.trim()} Render as a natural live-action studio portrait photo for ${inferredImageIntent.platform} ${inferredImageIntent.dimensions}. Real human skin texture, realistic face proportions, natural lighting, premium editorial photography, 85mm lens look, high-end DSLR quality, sharp focus, cinematic but realistic color grade. Integrate subtle cyan (#00F5FF) and violet (#BF5FFF) accents over a dark modern background. Not illustration, not cartoon, not CGI. ${inferredImageIntent.optimizationNotes}`
          : `${effectiveRequest.trim()} ${inferredImageIntent.optimizationNotes} Integrate NexusAI brand accents: cyan (#00F5FF), violet (#BF5FFF), dark premium backdrop. Camera: ${inferCameraSpecs(effectiveRequest, 'image').focalLength}, ${inferCameraSpecs(effectiveRequest, 'image').aperture}, professional editorial lensing.`,
        negativePrompt: humanStudioRealism
          ? 'cartoon, anime, illustration, painting, cgi, doll face, plastic skin, stylized face, game art, comic style, extra fingers, distorted hands, deformed anatomy, lowres, blurry, watermark'
          : undefined,
        aspectRatio: inferredImageIntent.aspectRatio,
        reasoning: 'Fast-path prompt routing for lower latency image generation.',
        agentOutputs: [],
        platform: inferredImageIntent.platform,
        messageHook: 'Premium visual that communicates the idea instantly and stops the scroll.',
        fallbackPrompts: {
          primary: effectiveRequest.trim(),
          fallback_stability: `${effectiveRequest.trim()}, photorealistic, professional editorial, dark futuristic environment, cyan and violet accent lighting, highly detailed, no text, no watermark`,
          fallback_midjourney: `${effectiveRequest.trim()}, ultra realistic editorial photography, dark futuristic, cyan and violet accents, dramatic lighting, sharp focus --ar ${inferredImageIntent.aspectRatio === '9:16' ? '9:16' : inferredImageIntent.aspectRatio === '4:5' ? '4:5' : '16:9'} --stylize 100`,
          fallback_replicate: `${effectiveRequest.trim()}, realistic photo, dark premium background, cyan violet highlights, sharp focus`,
        },
        brandFitCheck: 'Dark futuristic palette with cyan/violet accents and premium human-real output.',
        expectedPerformance: `${inferredImageIntent.platform}-optimized composition built for fast comprehension and high stop-scroll potential.`,
        cameraSpecs: `${inferCameraSpecs(effectiveRequest, 'image').focalLength}, ${inferCameraSpecs(effectiveRequest, 'image').aperture}, shallow depth cinematic portrait package.`,
      }
    : await buildMediaPrompt(effectiveRequest, 'image', options.preferredModel);
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
  const maxGenerationAttempts = useFastPath && !humanStudioRealism ? 1 : 2;

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
        prompt: `${plan.prompt} Improve subject realism, facial structure, hand anatomy, skin micro-texture, and premium studio-light fidelity. Render as a real photographed human with natural lens characteristics. Avoid any artificial, animated, or game-engine look.`,
        negativePrompt: `${plan.negativePrompt || ''}, malformed hands, weak face detail, flat lighting, plastic skin, amateur composition, cartoon, anime, illustration, cgi, doll-like face`,
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
    content: `Platform: ${plan.platform || inferredImageIntent.platform}
Message Hook: ${plan.messageHook || 'Immediate visual payoff with clear subject and high-contrast focal point.'}
Primary Prompt: ${plan.prompt}
Fallback Prompts: ${JSON.stringify(
      plan.fallbackPrompts || {
        primary: plan.prompt,
        fallback_stability: `${plan.prompt} photorealistic, high detail, realistic lighting, no text, no watermark`,
        fallback_midjourney: `${plan.prompt} --ar ${plan.aspectRatio === '9:16' ? '9:16' : plan.aspectRatio === '4:5' ? '4:5' : '16:9'}`,
      }
    )}
Brand Fit Check: ${plan.brandFitCheck || 'Aligned to NexusAI dark futuristic aesthetic with cyan/violet accent language.'}
Expected Performance: ${plan.expectedPerformance || 'Composed for quick feed readability, strong focal hierarchy, and social save/share potential.'}
Camera Specs: ${plan.cameraSpecs || '50mm-85mm portrait package, shallow depth of field, cinematic color grade.'}

Generated image provider: ${result.provider}`,
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
          allowProviderFallback: false,
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
    content: `Platform: ${plan.aspectRatio === '9:16' ? 'Reels/TikTok/Shorts' : 'YouTube/Long-form'}
Message Hook: ${plan.messageHook || 'Cinematic narrative with immediate visual hook and clean payoff.'}
Primary Prompt: ${plan.prompt}
Fallback Prompts: ${JSON.stringify(
      plan.fallbackPrompts || {
        primary: plan.prompt,
        fallback_stability: `${plan.prompt} cinematic realism, stable motion, natural human performance`,
        fallback_midjourney: `${plan.prompt} cinematic frame references --ar ${plan.aspectRatio === '9:16' ? '9:16' : '16:9'}`,
      }
    )}
Brand Fit Check: ${plan.brandFitCheck || 'Dark futurist visual language with cyan/violet brand accents and human-centered realism.'}
Expected Performance: ${plan.expectedPerformance || 'Optimized pacing and camera continuity for retention and replay value.'}
Camera Specs: ${plan.cameraSpecs || `${plan.cameraAngle || 'eye-level'}, ${plan.cameraMotion || 'controlled movement'}, ${plan.shotStyle || 'cinematic framing'}, 24fps intent`}
Audio Plan: ${plan.audioPlan || 'Voice-forward mix with subtle cinematic underscore and clean transition effects.'}

Generated video provider: ${result.provider}`,
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
