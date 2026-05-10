// Media Generation Service
// Bridges the Visual Director's briefs to actual AI media providers.

import { generateImage as generateImageWithAI, type ImageGenerationOptions } from './imageGenerationService';
import { generateVideo as generateVideoWithAI, type VideoGenerationOptions } from './videoGenerationService';

export interface MediaResult {
  url: string;
  provider: string;
  timestamp: string;
  width?: number;
  height?: number;
  duration?: number;
  error?: string;
}

export async function generateImage(brief: string, provider: string = 'dalle-3'): Promise<MediaResult> {
  console.log(`[MediaService] Generating image via ${provider} with brief: ${brief.substring(0, 50)}...`);
  
  try {
    const options: ImageGenerationOptions = {
      prompt: brief,
      provider: provider as ImageGenerationOptions['provider'],
      width: 1024,
      height: 1024,
      qualityTier: 'premium',
    };
    
    const result = await generateImageWithAI(options);
    
    return {
      url: result.url,
      provider: result.provider,
      width: result.width,
      height: result.height,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[MediaService] Image generation failed:', error);
    return {
      url: '',
      provider,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Image generation failed',
    };
  }
}

export async function generateVideo(brief: string, provider: string = 'ltx23'): Promise<MediaResult> {
  console.log(`[MediaService] Generating video via ${provider} with brief: ${brief.substring(0, 50)}...`);
  
  try {
    const options: VideoGenerationOptions = {
      prompt: brief,
      provider: provider as VideoGenerationOptions['provider'],
      durationSeconds: 8,
      aspectRatio: '16:9',
      qualityProfile: 'cinematic',
    };
    
    const result = await generateVideoWithAI(options);
    
    return {
      url: result.url,
      provider: result.provider,
      duration: result.durationSeconds,
      aspectRatio: result.aspectRatio,
      thumbnailUrl: result.thumbnailUrl,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[MediaService] Video generation failed:', error);
    return {
      url: '',
      provider,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Video generation failed',
    };
  }
}