'use client';

import { kvGet, waitForPuter } from './puterService';

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
}

export interface GeneratedImage {
  url: string;
  provider: ImageProvider;
  width: number;
  height: number;
  seed?: number;
}

// Retry configuration
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

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

  const { prompt, negativePrompt } = options;
  
  const enhancedPrompt = `${prompt}, high quality, detailed, professional`;
  
  return withRetry(async () => {
    const result = await window.puter.ai.txt2img(enhancedPrompt, {
      negativePrompt: negativePrompt || 'blurry, low quality, distorted, watermark, text',
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
  const apiKey = await kvGet('stability_key');
  if (!apiKey) {
    throw new Error('Stability AI API key not configured');
  }

  const { prompt, negativePrompt, width = 1024, height = 1024, steps = 30 } = options;

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
          cfg_scale: 7,
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
  const apiKey = await kvGet('leonardo_key');
  if (!apiKey) {
    throw new Error('Leonardo AI API key not configured');
  }

  const { prompt, negativePrompt, width = 1024, height = 1024 } = options;

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
          presetStyle: 'DYNAMIC',
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
          return {
            url: images[0].url,
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
  const apiKey = await kvGet('ideogram_key');
  if (!apiKey) {
    throw new Error('Ideogram API key not configured');
  }

  const { prompt, negativePrompt, style = 'AUTO' } = options;

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

    return {
      url: imageUrl,
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
  const { prompt, provider } = options;

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

  // If provider specified, use only that provider.
  if (provider) {
    if (!providerMap[provider]) {
      throw new Error(`Unsupported image provider: ${provider}`);
    }
    return providerMap[provider]();
  }

  // Auto-select best available configured provider with real fallback.
  const providerAttempts: Array<{ check: () => Promise<boolean>; generate: () => Promise<GeneratedImage> }> = [
    { 
      check: async () => !!(await kvGet('stability_key')), 
      generate: () => generateWithStability(cleanOptions) 
    },
    { 
      check: async () => !!(await kvGet('leonardo_key')), 
      generate: () => generateWithLeonardo(cleanOptions) 
    },
    { 
      check: async () => !!(await kvGet('ideogram_key')), 
      generate: () => generateWithIdeogram(cleanOptions) 
    },
    { 
      check: async () => canUsePuter(),
      generate: () => generateWithPuter(cleanOptions) 
    },
  ];

  for (const attempt of providerAttempts) {
    try {
      if (await attempt.check()) {
        return await attempt.generate();
      }
    } catch (error) {
      console.warn('Provider attempt failed, trying next:', error);
      continue;
    }
  }

  throw new Error('No configured image provider is available. Add Stability, Leonardo, Ideogram, or enable Puter AI in this environment.');
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
    kvGet('stability_key'),
    kvGet('leonardo_key'),
    kvGet('ideogram_key'),
  ]);

  if (await canUsePuter()) providers.push('puter');
  if (stability) providers.push('stability');
  if (leonardo) providers.push('leonardo');
  if (ideogram) providers.push('ideogram');

  return providers;
}
