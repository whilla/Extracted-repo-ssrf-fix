'use client';

import { kvGet, waitForPuter } from './puterService';
import { sanitizeApiKey } from './providerCredentialUtils';

export type ImageProvider = 'puter' | 'stability' | 'leonardo' | 'ideogram';

export interface ImageGenerationOptions {
  prompt: string;
  negativePrompt?: string;
  provider?: ImageProvider;
  width?: number;
  height?: number;
  style?: string;
  seed?: number;
  steps?: number;
  qualityTier?: 'draft' | 'premium' | 'netflix';
}

export interface GeneratedImage {
  url: string;
  provider: ImageProvider;
  width: number;
  height: number;
  seed?: number;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to data URL'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read blob data'));
    reader.readAsDataURL(blob);
  });
}

async function normalizeImageUrl(url: string): Promise<string> {
  if (!url || url.startsWith('data:')) return url;
  try {
    const response = await safeFetch(url, { method: 'GET' }, 30000);
    if (!response.ok) return url;
    const blob = await response.blob();
    if (!blob || blob.size === 0) return url;
    return await blobToDataUrl(blob);
  } catch {
    return url;
  }
}

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;
const IMAGE_PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;
const imageProviderCooldownUntil = new Map<ImageProvider, number>();

async function getProviderApiKey(provider: ImageProvider): Promise<string | null> {
  const keyAliases: Record<ImageProvider, string[]> = {
    puter: [],
    stability: ['stability_key', 'provider_stability_apiKey'],
    leonardo: ['leonardo_key', 'provider_leonardo_apiKey'],
    ideogram: ['ideogram_key', 'provider_ideogram_apiKey'],
  };

  const aliases = keyAliases[provider];
  for (const key of aliases) {
    const value = await kvGet(key);
    const sanitized = sanitizeApiKey(value ? String(value) : '');
    if (sanitized.length > 0) {
      return sanitized;
    }
  }

  return null;
}

function getAspectDescriptor(width = 1024, height = 1024): string {
  if (height > width) return 'vertical portrait composition';
  if (width > height) return 'cinematic widescreen composition';
  return 'balanced centered composition';
}

function buildEnhancedImagePrompt(options: ImageGenerationOptions): string {
  const {
    prompt,
    width = 1024,
    height = 1024,
    style,
  } = options;

  const qualityTier = options.qualityTier || 'premium';
  const styleHints = style
    ? `Visual style: ${style}.`
    : 'Visual style: grounded cinematic realism, not illustration, not fantasy concept art unless explicitly requested.';
  const qualityHint =
    qualityTier === 'netflix'
      ? 'Quality target: prestige film still, premium streaming-drama realism, luxurious production value, elite cinematography.'
      : qualityTier === 'premium'
        ? 'Quality target: premium commercial-grade realism and polished cinematic image quality.'
        : 'Quality target: clear, usable draft image quality.';
  const photographicHint =
    qualityTier === 'netflix' || qualityTier === 'premium'
      ? 'Render as a real photograph of a live-action subject, not a drawing, not a painting, not a comic panel, not concept art. Professional studio or on-location photography quality.'
      : 'Prefer realistic photographic rendering.';

  return [
    prompt.trim(),
    styleHints,
    qualityHint,
    photographicHint,
    `Composition: ${getAspectDescriptor(width, height)}, strong focal subject separation, intentional framing, natural depth of field, coherent background detail.`,
    'Lighting: physically believable light, controlled contrast, cinematic highlight rolloff, no flat studio wash unless requested.',
    'Human realism: anatomically correct hands, natural skin texture, realistic eyes, natural facial symmetry, believable fabric and material detail. Skin must look like real photographed skin, not airbrushed CGI.',
    'Image quality: high-end photography look, sharp subject detail, clean edges, no mushy textures, no posterized skin, no waxy face. True-to-life lens rendering.',
    'If the prompt describes a person or character, preserve one believable human identity and render them as a real person captured by a camera.',
    'Do not stylize the output into obvious AI art. Keep it natural, premium, and visually credible.',
  ].join(' ');
}

function buildNegativePrompt(options: ImageGenerationOptions): string {
  const merged = [
    options.negativePrompt,
    'blurry',
    'soft focus',
    'low quality',
    'low resolution',
    'distorted anatomy',
    'bad hands',
    'extra fingers',
    'extra limbs',
    'deformed face',
    'crossed eyes',
    'waxy skin',
    'plastic skin',
    'flat lighting',
    'overexposed highlights',
    'underexposed face',
    'text overlay',
    'watermark',
    'logo',
    'caption',
    'double subject',
    'duplicate person',
    'cropped head',
    'floating objects',
    'unnatural pose',
    'robotic expression',
    'cgi look',
    '3d render',
    'digital painting',
    'anime',
    'comic',
    'illustration style',
    'stylized face',
    'doll face',
    'beauty filter',
    'airbrushed skin',
    'cartoon',
    'illustration',
  ]
    .filter(Boolean)
    .join(', ');

  return merged;
}

function isPremiumImageProvider(provider: ImageProvider): boolean {
  return provider === 'stability' || provider === 'leonardo' || provider === 'ideogram';
}

function isQuotaOrBillingError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('quota') ||
    text.includes('out of credits') ||
    text.includes('insufficient credit') ||
    text.includes('insufficient balance') ||
    text.includes('billing') ||
    text.includes('payment required') ||
    text.includes('402') ||
    text.includes('credit balance') ||
    text.includes('usage limit') ||
    text.includes('insufficient_quota')
  );
}

function isProviderInCooldown(provider: ImageProvider): boolean {
  const until = imageProviderCooldownUntil.get(provider);
  if (!until) return false;
  if (Date.now() > until) {
    imageProviderCooldownUntil.delete(provider);
    return false;
  }
  return true;
}

function applyProviderCooldown(provider: ImageProvider, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!isQuotaOrBillingError(message)) return;
  imageProviderCooldownUntil.set(provider, Date.now() + IMAGE_PROVIDER_COOLDOWN_MS);
}

async function getOrderedAvailableProviders(preferred?: ImageProvider): Promise<ImageProvider[]> {
  const [stability, leonardo, ideogram, puter] = await Promise.all([
    getProviderApiKey('stability'),
    getProviderApiKey('leonardo'),
    getProviderApiKey('ideogram'),
    canUsePuter(),
  ]);

  const available: ImageProvider[] = [];
  if (stability && !isProviderInCooldown('stability')) available.push('stability');
  if (leonardo && !isProviderInCooldown('leonardo')) available.push('leonardo');
  if (ideogram && !isProviderInCooldown('ideogram')) available.push('ideogram');
  if (puter && !isProviderInCooldown('puter')) available.push('puter');

  if (!preferred) return available;
  if (!available.includes(preferred)) return available;
  return [preferred, ...available.filter((provider) => provider !== preferred)];
}

// Helper for retrying failed requests
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

// Safe fetch wrapper with timeout
async function safeFetch(url: string, options: RequestInit, timeoutMs = 60000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate image with Puter AI (DALL-E) - Built-in, no key required
 */
async function generateWithPuter(options: ImageGenerationOptions): Promise<GeneratedImage> {
  const ready = await waitForPuter();
  if (typeof window === 'undefined' || !ready || !window.puter) {
    throw new Error('Puter not available');
  }

  const enhancedPrompt = buildEnhancedImagePrompt(options);
  const negativePrompt = buildNegativePrompt(options);
  
  return withRetry(async () => {
    const result = await window.puter.ai.txt2img(enhancedPrompt, {
      negativePrompt,
    });
    
    return {
      url: result.src,
      provider: 'puter',
      width: 1024,
      height: 1024,
    };
  });
}

async function canUsePuter(): Promise<boolean> {
  const ready = await waitForPuter();
  return typeof window !== 'undefined' && ready && !!window.puter;
}

/**
 * Generate image with Stability AI
 */
async function generateWithStability(options: ImageGenerationOptions): Promise<GeneratedImage> {
  const apiKey = await getProviderApiKey('stability');
  if (!apiKey) {
    throw new Error('Stability AI API key not configured');
  }

  const { width = 1024, height = 1024, steps = 40 } = options;
  const prompt = buildEnhancedImagePrompt(options);
  const negativePrompt = buildNegativePrompt(options);

  return withRetry(async () => {
    const response = await safeFetch(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          text_prompts: [
            { text: prompt, weight: 1 },
            ...(negativePrompt ? [{ text: negativePrompt, weight: -1 }] : []),
          ],
          cfg_scale: 8,
          width,
          height,
          steps,
          samples: 1,
        }),
      },
      60000
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Stability AI error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const base64Image = data.artifacts?.[0]?.base64;
    
    if (!base64Image) {
      throw new Error('No image returned from Stability AI');
    }

    return {
      url: `data:image/png;base64,${base64Image}`,
      provider: 'stability',
      width,
      height,
      seed: data.artifacts?.[0]?.seed,
    };
  });
}

/**
 * Generate image with Leonardo AI
 */
async function generateWithLeonardo(options: ImageGenerationOptions): Promise<GeneratedImage> {
  const apiKey = await getProviderApiKey('leonardo');
  if (!apiKey) {
    throw new Error('Leonardo AI API key not configured');
  }

  const { width = 1024, height = 1024 } = options;
  const prompt = buildEnhancedImagePrompt(options);
  const negativePrompt = buildNegativePrompt(options);

  return withRetry(async () => {
    // Create generation
    const createResponse = await safeFetch(
      'https://cloud.leonardo.ai/api/rest/v1/generations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          prompt,
          negative_prompt: negativePrompt,
          width,
          height,
          num_images: 1,
          modelId: '6bef9f1b-29cb-40c7-b9df-32b51c1f67d3', // Leonardo Creative
          presetStyle: 'PHOTOGRAPHY',
        }),
      },
      60000
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text().catch(() => createResponse.statusText);
      throw new Error(`Leonardo AI error (${createResponse.status}): ${errorText}`);
    }

    const createData = await createResponse.json();
    const generationId = createData.sdGenerationJob?.generationId;
    
    if (!generationId) {
      throw new Error('Failed to start Leonardo generation');
    }

    // Poll for completion (max 60 seconds)
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await safeFetch(
        `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
        {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        },
        30000
      );

      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        const images = statusData.generations_by_pk?.generated_images;
        
        if (images && images.length > 0) {
          const normalizedUrl = await normalizeImageUrl(images[0].url);
          return {
            url: normalizedUrl,
            provider: 'leonardo',
            width,
            height,
          };
        }
      }
    }

    throw new Error('Leonardo AI generation timed out');
  });
}

/**
 * Generate image with Ideogram
 */
async function generateWithIdeogram(options: ImageGenerationOptions): Promise<GeneratedImage> {
  const apiKey = await getProviderApiKey('ideogram');
  if (!apiKey) {
    throw new Error('Ideogram API key not configured');
  }

  const { style = 'AUTO' } = options;
  const prompt = buildEnhancedImagePrompt(options);
  const negativePrompt = buildNegativePrompt(options);

  return withRetry(async () => {
    const response = await safeFetch(
      'https://api.ideogram.ai/generate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': apiKey,
        },
        body: JSON.stringify({
          image_request: {
            prompt,
            negative_prompt: negativePrompt,
            aspect_ratio: 'ASPECT_1_1',
            model: 'V_2',
            style_type: style,
          },
        }),
      },
      60000
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Ideogram error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;
    
    if (!imageUrl) {
      throw new Error('No image returned from Ideogram');
    }
    const normalizedUrl = await normalizeImageUrl(imageUrl);

    return {
      url: normalizedUrl,
      provider: 'ideogram',
      width: 1024,
      height: 1024,
      seed: data.data?.[0]?.seed,
    };
  });
}

/**
 * Main function to generate images - auto-selects best available provider
 */
export async function generateImage(options: ImageGenerationOptions): Promise<GeneratedImage> {
  const { prompt, provider, qualityTier = 'premium' } = options;

  // Validate input
  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Image prompt cannot be empty');
  }

  // Clean prompt
  const cleanOptions = {
    ...options,
    prompt: prompt.trim().substring(0, 1000), // Limit prompt length
  };

  const providerMap: Record<ImageProvider, () => Promise<GeneratedImage>> = {
    puter: () => generateWithPuter(cleanOptions),
    stability: () => generateWithStability(cleanOptions),
    leonardo: () => generateWithLeonardo(cleanOptions),
    ideogram: () => generateWithIdeogram(cleanOptions),
  };
  const providerAttempts = await getOrderedAvailableProviders(provider);
  const filteredProviders = qualityTier === 'netflix'
    ? providerAttempts.filter(isPremiumImageProvider)
    : providerAttempts;

  for (const candidate of filteredProviders) {
    try {
      return await providerMap[candidate]();
    } catch (error) {
      applyProviderCooldown(candidate, error);
      console.warn(`Image provider ${candidate} failed, trying next`, error);
    }
  }

  if (qualityTier === 'netflix') {
    throw new Error('Netflix-grade image mode requires a configured premium provider. Add Stability, Leonardo, or Ideogram in Settings.');
  }

  throw new Error('No reachable image provider is available right now. Check provider status/credits and retry, or switch provider.');
}

/**
 * Generate multiple image variations
 */
export async function generateImageVariations(
  prompt: string,
  count = 4,
  provider?: ImageProvider
): Promise<GeneratedImage[]> {
  const images: GeneratedImage[] = [];
  const variations = [
    prompt,
    `${prompt}, cinematic lighting`,
    `${prompt}, minimalist style`,
    `${prompt}, vibrant colors`,
  ];

  for (let i = 0; i < Math.min(count, variations.length); i++) {
    try {
      const image = await generateImage({ prompt: variations[i], provider });
      images.push(image);
    } catch (error) {
      console.warn(`Failed to generate variation ${i + 1}:`, error);
    }
  }

  return images;
}

/**
 * Get available image providers
 */
export async function getAvailableProviders(): Promise<ImageProvider[]> {
  const providers: ImageProvider[] = [];

  const [stability, leonardo, ideogram] = await Promise.all([
    getProviderApiKey('stability'),
    getProviderApiKey('leonardo'),
    getProviderApiKey('ideogram'),
  ]);

  if (await canUsePuter()) providers.push('puter');
  if (stability) providers.push('stability');
  if (leonardo) providers.push('leonardo');
  if (ideogram) providers.push('ideogram');

  return providers;
}
