

import type { Platform } from '@/lib/types';
import { adaptContentForPlatform, type PlatformAdaptedContent } from './platformAdapterService';

export interface PlatformOptimizationResult {
  packages: PlatformAdaptedContent[];
  notes: string[];
}

export function optimizeForPlatforms(
  text: string,
  hashtags: string[],
  platforms: Platform[]
): PlatformOptimizationResult {
  const uniquePlatforms = Array.from(new Set(platforms));
  const packages = uniquePlatforms.map((platform) => adaptContentForPlatform(text, hashtags, platform));

  const notes = uniquePlatforms.map((platform) =>
    platform === 'tiktok' || platform === 'instagram' || platform === 'youtube'
      ? `${platform}: prioritize first-2-second visual hook and loop-safe ending.`
      : `${platform}: keep copy crisp and high-signal with one clear CTA.`
  );

  return { packages, notes };
}
