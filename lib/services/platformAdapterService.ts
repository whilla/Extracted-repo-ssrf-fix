

import type { Platform } from '@/lib/types';

export interface PlatformAdaptedContent {
  platform: Platform;
  text: string;
  hashtags: string[];
  durationHint?: string;
}

function clampText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

const PLATFORM_LIMITS: Record<Platform, number> = {
  twitter: 280,
  instagram: 2200,
  tiktok: 2200,
  linkedin: 3000,
  facebook: 63206,
  threads: 500,
  youtube: 5000,
  pinterest: 500,
  discord: 2000,
  reddit: 40000,
  whatsapp: 4096,
  telegram: 4096,
  snapchat: 1000,
  wordpress: 30000,
  medium: 100000,
  ghost: 30000,
  substack: 30000,
  mailchimp: 50000,
  klaviyo: 50000,
  convertkit: 50000,
  general: 5000,
};

export function adaptContentForPlatform(
  text: string,
  hashtags: string[],
  platform: Platform
): PlatformAdaptedContent {
  const limit = PLATFORM_LIMITS[platform];
  const cleanText = clampText(text, limit);
  const platformHashtags = hashtags.slice(0, platform === 'twitter' ? 3 : 8);

  const durationHint =
    platform === 'tiktok' || platform === 'instagram' || platform === 'youtube'
      ? '7-25s short-form pacing with immediate hook'
      : undefined;

  return {
    platform,
    text: cleanText,
    hashtags: platformHashtags,
    durationHint,
  };
}
