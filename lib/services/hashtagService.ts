// Hashtag Research & Generator Service
import { universalChat } from './aiService';
import { kvGet, kvSet, PATHS, listFiles, readFile } from './puterService';
import type { BrandKit, Platform } from '@/lib/types';
import type { ContentDraft } from '@/lib/types';
import { getLiveTrendContext } from './trendingService';

export interface HashtagSet {
  hashtags: string[];
  category: 'trending' | 'niche' | 'branded' | 'community';
  reach: 'high' | 'medium' | 'low';
  competition: 'high' | 'medium' | 'low';
}

export interface HashtagAnalysis {
  hashtag: string;
  estimatedReach: number;
  competition: number;
  relevanceScore: number;
  trending: boolean;
  relatedTags: string[];
}

export interface HashtagStrategy {
  primary: string[];      // 3-5 high-reach hashtags
  secondary: string[];    // 5-10 medium-reach hashtags
  niche: string[];        // 5-10 low-competition niche hashtags
  branded: string[];      // Your brand hashtags
  total: number;
  platformLimit: number;
}

export interface PlatformCopyPackage {
  platform: Platform;
  description: string;
  hashtags: string[];
  keywordFocus: string[];
}

// Platform hashtag limits
const PLATFORM_HASHTAG_LIMITS: Record<Platform, number> = {
  twitter: 3,
  instagram: 30,
  linkedin: 5,
  facebook: 10,
  tiktok: 5,
  threads: 5,
  youtube: 15,
  pinterest: 20,
  discord: 10,
  reddit: 20,
  whatsapp: 10,
  telegram: 10,
  snapchat: 5,
  wordpress: 30,
  medium: 30,
  ghost: 30,
  substack: 30,
  mailchimp: 10,
  klaviyo: 10,
  convertkit: 10,
  general: 10,
};

// Generate hashtags for content
export async function generateHashtags(
  content: string,
  platform: Platform,
  brandKit: BrandKit | null,
  options: {
    includeEmoji?: boolean;
    maxHashtags?: number;
    focusOnTrending?: boolean;
  } = {}
): Promise<HashtagStrategy> {
  const { includeEmoji = false, maxHashtags, focusOnTrending = false } = options;
  const limit = maxHashtags || PLATFORM_HASHTAG_LIMITS[platform] || 10;
  const liveTrendContext = focusOnTrending && brandKit?.niche
    ? await getLiveTrendContext(brandKit.niche, platform)
    : null;
  
  const prompt = `Generate a strategic hashtag set for this ${platform} post.

Content: "${content}"

Brand/Niche: ${brandKit?.niche || 'general'}
${focusOnTrending ? 'FOCUS: Include trending hashtags relevant to this content' : ''}
${liveTrendContext ? `Live trending keywords: ${liveTrendContext.trendingKeywords.join(', ')}
Live trend topics: ${liveTrendContext.liveTopics.join(', ')}
Suggested live hashtags: ${liveTrendContext.suggestedHashtags.join(', ')}` : ''}

Return a JSON object:
{
  "primary": ["3-5 high-reach hashtags with millions of posts"],
  "secondary": ["5-10 medium-reach hashtags with hundreds of thousands of posts"],
  "niche": ["5-10 specific niche hashtags with lower competition"],
  "branded": ["1-2 brand-specific hashtags if applicable"]
}

Rules:
- Total hashtags should not exceed ${limit}
- ${platform === 'twitter' ? 'Keep it minimal, 1-3 max' : ''}
- ${platform === 'instagram' ? 'Mix popular and niche for best reach' : ''}
- ${platform === 'linkedin' ? 'Use professional, industry-specific tags' : ''}
- Don't include the # symbol
- ${includeEmoji ? 'Can include emoji hashtags' : 'No emoji hashtags'}

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    const parsed = JSON.parse(response);
    
    // Ensure we don't exceed limit
    const allTags = [
      ...(parsed.primary || []),
      ...(parsed.secondary || []),
      ...(parsed.niche || []),
      ...(parsed.branded || []),
    ].slice(0, limit);
    
    return {
      primary: parsed.primary || [],
      secondary: parsed.secondary || [],
      niche: parsed.niche || [],
      branded: parsed.branded || [],
      total: allTags.length,
      platformLimit: limit,
    };
  } catch {
    // Fallback
    return {
      primary: [],
      secondary: [],
      niche: [],
      branded: [],
      total: 0,
      platformLimit: limit,
    };
  }
}

export async function generatePlatformCopyPackage(
  content: string,
  platform: Platform,
  brandKit: BrandKit | null
): Promise<PlatformCopyPackage> {
  const liveTrendContext = brandKit?.niche
    ? await getLiveTrendContext(brandKit.niche, platform)
    : null;
  const hashtagStrategy = await generateHashtags(content, platform, brandKit, {
    focusOnTrending: true,
  });

  const hashtagPool = [
    ...hashtagStrategy.primary,
    ...hashtagStrategy.secondary,
    ...hashtagStrategy.niche,
    ...hashtagStrategy.branded,
  ].filter(Boolean);

  const prompt = `Create the best platform-native description/caption package for ${platform}.

Base content:
"""${content}"""

Brand niche: ${brandKit?.niche || 'general'}
Target audience: ${brandKit?.targetAudience || 'general audience'}
Brand tone: ${brandKit?.tone || 'direct'}
Live trend keywords: ${liveTrendContext?.trendingKeywords.join(', ') || 'none'}
Live trend topics: ${liveTrendContext?.liveTopics.join(', ') || 'none'}
Suggested hashtags: ${hashtagPool.join(', ') || liveTrendContext?.suggestedHashtags.join(', ') || 'none'}

Return strict JSON:
{
  "description": "platform-ready caption/description",
  "hashtags": ["tag1", "tag2"],
  "keywordFocus": ["keyword1", "keyword2"]
}

Rules:
- Make it stop-scroll, human, and platform-native.
- Keep it aligned to the niche and audience.
- Use live trend keywords only when they fit naturally.
- Keep it monetizable and policy-safe.
- Hashtags must be best-fit for ${platform}, not generic filler.
- Return only JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit, model: 'gpt-4o-mini' });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return {
      platform,
      description: String(parsed.description || content).trim(),
      hashtags: Array.isArray(parsed.hashtags)
        ? parsed.hashtags.map((tag: string) => String(tag).replace(/^#/, '').trim()).filter(Boolean).slice(0, PLATFORM_HASHTAG_LIMITS[platform])
        : hashtagPool.slice(0, PLATFORM_HASHTAG_LIMITS[platform]),
      keywordFocus: Array.isArray(parsed.keywordFocus)
        ? parsed.keywordFocus.map((keyword: string) => String(keyword).trim()).filter(Boolean).slice(0, 5)
        : (liveTrendContext?.trendingKeywords || []).slice(0, 5),
    };
  } catch {
    return {
      platform,
      description: content,
      hashtags: hashtagPool.slice(0, PLATFORM_HASHTAG_LIMITS[platform]),
      keywordFocus: (liveTrendContext?.trendingKeywords || []).slice(0, 5),
    };
  }
}

// Research a specific hashtag
export async function researchHashtag(
  hashtag: string,
  brandKit: BrandKit | null
): Promise<HashtagAnalysis> {
  const prompt = `Analyze this hashtag: #${hashtag}

Return a JSON object:
{
  "hashtag": "${hashtag}",
  "estimatedReach": number (estimated posts using this tag, e.g., 1000000),
  "competition": number (1-100, how competitive),
  "relevanceScore": number (1-100, relevance for brand),
  "trending": boolean (is it currently trending?),
  "relatedTags": ["5 related hashtags without #"]
}

Brand context: ${brandKit?.niche || 'general'}

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return {
      hashtag,
      estimatedReach: 0,
      competition: 50,
      relevanceScore: 50,
      trending: false,
      relatedTags: [],
    };
  }
}

// Get trending hashtags for a niche
export async function getTrendingHashtags(
  niche: string,
  platform: Platform
): Promise<string[]> {
  const cacheKey = `trending_${platform}_${niche.toLowerCase().replace(/\s+/g, '_')}`;
  const cached = await kvGet(cacheKey);
  
  // Cache for 1 hour
  if (cached) {
    try {
      const { hashtags, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 3600000) {
        return hashtags;
      }
    } catch (parseError) {
      console.warn('[getTrendingHashtags] Failed to parse cached hashtags:', parseError instanceof Error ? parseError.message : 'Unknown error');
    }
  }
  
  const prompt = `What are the top 20 trending hashtags on ${platform} right now for the "${niche}" niche?

Return ONLY a JSON array of hashtags without the # symbol:
["hashtag1", "hashtag2", ...]`;

  try {
    const response = await universalChat(prompt);
    const hashtags = JSON.parse(response);
    
    // Cache the result
    await kvSet(cacheKey, JSON.stringify({
      hashtags,
      timestamp: Date.now(),
    }));
    
    return hashtags;
  } catch {
    return [];
  }
}

// Get hashtag suggestions based on content
export async function getHashtagSuggestions(
  partialTag: string,
  context: string,
  brandKit: BrandKit | null
): Promise<string[]> {
  const prompt = `Suggest 10 hashtag completions starting with "${partialTag}".

Context: ${context}
Brand: ${brandKit?.niche || 'general'}

Return ONLY a JSON array of complete hashtags without #:
["${partialTag}example1", "${partialTag}example2", ...]`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return [];
  }
}

export async function getHashtagPerformance(
  hashtags: string[]
): Promise<Record<string, { impressions: number; engagement: number; trend: 'up' | 'down' | 'stable' }>> {
  const normalizedTags = hashtags.map(tag => tag.replace(/^#/, '').toLowerCase()).filter(Boolean);
  const result: Record<string, { impressions: number; engagement: number; trend: 'up' | 'down' | 'stable' }> = {};

  const files = await listFiles(PATHS.published);
  const drafts = await Promise.all(
    files
      .filter(file => file.name.endsWith('.json') && !file.is_dir)
      .map(file => readFile<ContentDraft>(`${PATHS.published}/${file.name}`, true))
  );

  const publishedDrafts = drafts.filter((draft): draft is ContentDraft => Boolean(draft));
  const now = Date.now();
  const recentCutoff = now - 14 * 24 * 60 * 60 * 1000;
  const previousCutoff = now - 28 * 24 * 60 * 60 * 1000;

  for (const tag of normalizedTags) {
    let totalMentions = 0;
    let recentMentions = 0;
    let previousMentions = 0;
    let totalPlatforms = 0;
    let totalLength = 0;

    for (const draft of publishedDrafts) {
      const text = draft.versions[draft.currentVersion]?.text
        || draft.versions[draft.versions.length - 1]?.text
        || '';
      const tagRegex = new RegExp(`(^|\\s)#${tag}(?=\\b)`, 'i');
      if (!tagRegex.test(text)) {
        continue;
      }

      totalMentions += 1;
      totalPlatforms += draft.platforms.length;
      totalLength += text.length;

      const timestamp = new Date(draft.publishedAt || draft.updated || draft.created).getTime();
      if (timestamp >= recentCutoff) {
        recentMentions += 1;
      } else if (timestamp >= previousCutoff) {
        previousMentions += 1;
      }
    }

    const impressions = totalMentions === 0
      ? 0
      : Math.round(totalMentions * 750 + totalPlatforms * 180 + totalLength * 0.4);
    const engagement = totalMentions === 0
      ? 0
      : Math.round(totalMentions * 45 + totalPlatforms * 12);
    const trend: 'up' | 'down' | 'stable' =
      recentMentions > previousMentions ? 'up' :
      recentMentions < previousMentions ? 'down' :
      'stable';

    result[tag] = { impressions, engagement, trend };
  }

  return result;
}

// Save favorite hashtag sets
export async function saveFavoriteHashtags(name: string, hashtags: string[]): Promise<void> {
  const favorites = await getFavoriteHashtags();
  favorites[name] = hashtags;
  await kvSet('favorite_hashtags', JSON.stringify(favorites));
}

export async function getFavoriteHashtags(): Promise<Record<string, string[]>> {
  const data = await kvGet('favorite_hashtags');
  if (data) {
    try {
      return JSON.parse(data);
    } catch (parseError) {
      console.warn('[getFavoriteHashtags] Failed to parse favorite hashtags:', parseError instanceof Error ? parseError.message : 'Unknown error');
    }
  }
  return {};
}

// Format hashtags for a specific platform
export function formatHashtags(hashtags: string[], platform: Platform): string {
  const limit = PLATFORM_HASHTAG_LIMITS[platform] || 10;
  const limited = hashtags.slice(0, limit);
  
  switch (platform) {
    case 'twitter':
      return limited.map(t => `#${t}`).join(' ');
    case 'instagram':
      return '\n.\n.\n.\n' + limited.map(t => `#${t}`).join(' ');
    case 'linkedin':
      return '\n\n' + limited.map(t => `#${t}`).join(' ');
    default:
      return limited.map(t => `#${t}`).join(' ');
  }
}
