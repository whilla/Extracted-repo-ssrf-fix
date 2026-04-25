import type { BrandKit, Platform } from '@/lib/types';
import type { PlatformCopyPackage } from './hashtagService';

interface OfflineGenerationOptions {
  idea: string;
  platforms: Platform[];
  format?: 'post' | 'thread' | 'carousel' | 'story';
  customInstructions?: string;
}

interface OfflineGeneratedContent {
  text: string;
  variations: string[];
  hashtags: string[];
  platformPackages: PlatformCopyPackage[];
}

const CTA_BY_PLATFORM: Record<Platform, string> = {
  twitter: 'Reply with your take if you want part two.',
  instagram: 'Save this and send it to someone who needs it.',
  tiktok: 'Comment if you want the next part.',
  linkedin: 'Comment "guide" if you want a deeper breakdown.',
  facebook: 'Share this with someone who would use it today.',
  threads: 'Reply if you want the unfiltered version.',
  youtube: 'Subscribe if you want the next breakdown.',
  pinterest: 'Save this so you can come back to it later.',
};

const STOP_SCROLL_HOOKS = [
  'Most people get this wrong about %TOPIC%.',
  'Before you post about %TOPIC%, read this.',
  'The real reason %TOPIC% underperforms is not what you think.',
  'If %TOPIC% feels stuck, this is usually the hidden problem.',
  'Nobody talks about this part of %TOPIC%, but they should.',
  'This one shift can change how %TOPIC% performs.',
];

function seedFromText(value: string): number {
  let seed = 0;
  for (let index = 0; index < value.length; index++) {
    seed = (seed + value.charCodeAt(index) * (index + 1)) % 2147483647;
  }
  return seed || 1;
}

function pick<T>(values: T[], seed: number, offset = 0): T {
  return values[(seed + offset) % values.length];
}

function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function uniqueWords(value: string, limit = 5): string[] {
  const seen = new Set<string>();
  const words: string[] = [];

  for (const word of normalizeWords(value)) {
    if (seen.has(word)) continue;
    seen.add(word);
    words.push(word);
    if (words.length >= limit) break;
  }

  return words;
}

function buildStopScrollHook(topic: string, seed: number): string {
  return pick(STOP_SCROLL_HOOKS, seed).replace('%TOPIC%', topic);
}

function buildValueBlock(topic: string, brand?: BrandKit | null): string {
  const audience = brand?.targetAudience || brand?.audience || 'your audience';
  const niche = brand?.niche || 'your niche';

  return [
    `Here is the angle that usually lands harder with ${audience}:`,
    `1. Lead with one sharp problem inside ${niche}.`,
    `2. Give one practical shift people can apply immediately.`,
    `3. Make the outcome specific enough that it feels real, not generic.`,
    `4. Keep the language direct and useful.`,
    `Use this topic as the spine: ${topic}.`,
  ].join('\n');
}

function buildHashtags(topic: string, brand?: BrandKit | null): string[] {
  const baseWords = uniqueWords(`${topic} ${brand?.niche || ''}`, 6);
  return baseWords.map((word) => `#${word.replace(/\s+/g, '')}`);
}

function buildPlatformPackage(
  platform: Platform,
  topic: string,
  hook: string,
  hashtags: string[],
  brand?: BrandKit | null
): PlatformCopyPackage {
  const keywordFocus = uniqueWords(`${topic} ${brand?.niche || ''}`, 3);
  const description = [
    hook,
    '',
    `Focus on one concrete insight about ${topic} and give the audience an immediate next move.`,
    CTA_BY_PLATFORM[platform],
  ].join('\n');

  return {
    platform,
    description,
    hashtags: hashtags.slice(0, platform === 'linkedin' ? 3 : 6),
    keywordFocus,
  };
}

export function isOfflineMode(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function generateOfflineContent(
  options: OfflineGenerationOptions,
  brand?: BrandKit | null
): OfflineGeneratedContent {
  const primaryPlatform = options.platforms[0] || 'twitter';
  const seed = seedFromText(`${options.idea}|${primaryPlatform}|${options.customInstructions || ''}`);
  const topic = options.idea.trim() || brand?.niche || 'content strategy';
  const hook = buildStopScrollHook(topic, seed);
  const alternateHooks = [
    buildStopScrollHook(topic, seed + 1),
    buildStopScrollHook(topic, seed + 2),
    buildStopScrollHook(topic, seed + 3),
  ];
  const hashtags = buildHashtags(topic, brand);
  const text = [
    hook,
    '',
    buildValueBlock(topic, brand),
    '',
    CTA_BY_PLATFORM[primaryPlatform],
  ].join('\n');

  return {
    text,
    variations: alternateHooks.map((altHook, index) => [
      altHook,
      '',
      `Angle ${index + 1}: frame ${topic} through a sharper curiosity gap and give one direct takeaway.`,
      CTA_BY_PLATFORM[primaryPlatform],
    ].join('\n')),
    hashtags,
    platformPackages: options.platforms.map((platform) => buildPlatformPackage(platform, topic, hook, hashtags, brand)),
  };
}
