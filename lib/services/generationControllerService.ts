'use client';

import { getRecommendedModel, loadProviderCapabilities } from './providerCapabilityService';
import { hasConfiguredOpenLtxEndpoint, type VideoProvider } from './videoGenerationService';
import type { ImageProvider } from './imageGenerationService';

export interface GenerationRoute {
  textModel: string;
  imageProvider: ImageProvider;
  videoProvider: VideoProvider;
  fallbackModel: string;
}

export async function resolveGenerationRoute(): Promise<GenerationRoute> {
  const capabilities = await loadProviderCapabilities();
  const hasOpenVideo = await hasConfiguredOpenLtxEndpoint();
  const creative = getRecommendedModel('creative', capabilities);
  const analysis = getRecommendedModel('analysis', capabilities);

  const textModel = creative?.modelId || analysis?.modelId || 'gpt-4o';
  const fallbackModel = analysis?.modelId || 'gpt-4o-mini';

  const hasFalVideo = capabilities.some((provider) =>
    provider.id.includes('fal') && provider.apiKeyConfigured && provider.status !== 'offline'
  );
  const hasImageProvider = capabilities.some((provider) =>
    provider.capabilities.imageGeneration && provider.apiKeyConfigured && provider.status !== 'offline'
  );

  return {
    textModel,
    fallbackModel,
    imageProvider: hasImageProvider ? 'stability' : 'puter',
    videoProvider: hasFalVideo ? 'ltx23' : hasOpenVideo ? 'ltx23-open' : 'ltx23',
  };
}
