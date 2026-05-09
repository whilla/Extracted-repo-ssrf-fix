// Trending Topics Feed Service
import { universalChat } from './aiService';
import { kvGet, kvSet } from './puterService';
import type { BrandKit, Platform } from '@/lib/types';

export interface TrendingTopic {
  id: string;
  topic: string;
  category: 'news' | 'culture' | 'tech' | 'business' | 'entertainment' | 'sports' | 'lifestyle' | 'other';
  platforms: Platform[];
  volume: 'viral' | 'high' | 'medium' | 'rising';
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  relevanceScore: number;       // 0-100 relevance to your niche
  hashtags: string[];
  relatedTopics: string[];
  contentSuggestions: string[];
  timestamp: string;
  expiresAt: string;
}

export interface TrendingFeed {
  topics: TrendingTopic[];
  lastUpdated: string;
  niche: string;
}

export interface LiveTrendSignal {
  title: string;
  source: string;
  link?: string;
  publishedAt?: string;
}

export interface LiveTrendContext {
  niche: string;
  platform: Platform;
  trendingKeywords: string[];
  liveTopics: string[];
  headlines: LiveTrendSignal[];
  suggestedAngles: string[];
  suggestedHashtags: string[];
  generatedAt: string;
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripCdata(input: string): string {
  return input.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXmlEntities(stripCdata(match[1]).trim()) : '';
}

function parseRssItems(xml: string): LiveTrendSignal[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  return items.map(item => ({
    title: extractTag(item, 'title'),
    source: extractTag(item, 'source') || 'Google News',
    link: extractTag(item, 'link') || undefined,
    publishedAt: extractTag(item, 'pubDate') || undefined,
  })).filter(item => item.title);
}

async function fetchGoogleNewsSignals(query: string): Promise<LiveTrendSignal[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];

    const xml = await response.text();
    return parseRssItems(xml).slice(0, 12);
  } catch {
    return [];
  }
}

export async function getLiveTrendContext(
  niche: string,
  platform: Platform,
  limit = 6
): Promise<LiveTrendContext> {
  const cacheKey = `live_trends_${platform}_${niche.toLowerCase().replace(/\s+/g, '_')}`;
  const cached = await kvGet(cacheKey);

  if (cached) {
    try {
      const parsed = JSON.parse(cached) as LiveTrendContext;
      if (Date.now() - new Date(parsed.generatedAt).getTime() < 30 * 60 * 1000) {
        return parsed;
      }
    } catch (parseError) {
      console.warn('[getLiveContext] Failed to parse cached context:', parseError instanceof Error ? parseError.message : 'Unknown error');
    }
  }

  const [nicheSignals, platformSignals] = await Promise.all([
    fetchGoogleNewsSignals(`${niche} trend`),
    fetchGoogleNewsSignals(`${platform} trending ${niche}`),
  ]);

  const headlines = [...nicheSignals, ...platformSignals]
    .filter((signal, index, all) => all.findIndex(other => other.title === signal.title) === index)
    .slice(0, 15);

  if (headlines.length === 0) {
    return {
      niche,
      platform,
      trendingKeywords: [],
      liveTopics: [],
      headlines: [],
      suggestedAngles: [],
      suggestedHashtags: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const synthesisPrompt = `You are extracting live social-media trend context from current headlines.

Niche: ${niche}
Platform: ${platform}

Live headlines:
${headlines.map((headline, index) => `${index + 1}. ${headline.title} (${headline.source})`).join('\n')}

Return strict JSON:
{
  "trendingKeywords": ["keyword", "keyword"],
  "liveTopics": ["topic", "topic"],
  "suggestedAngles": ["angle", "angle"],
  "suggestedHashtags": ["hashtag", "hashtag"]
}

Rules:
- Keep everything aligned to the niche.
- Prefer stop-scroll angles that still feel native and monetizable.
- Do not force unrelated news into the niche.
- Hashtags must be platform-appropriate and concise.
- Return only the strongest ${limit} items per list.`;

  try {
    const response = await universalChat(synthesisPrompt, { model: 'gpt-4o-mini' });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    const result: LiveTrendContext = {
      niche,
      platform,
      trendingKeywords: Array.isArray(parsed.trendingKeywords) ? parsed.trendingKeywords.map((v: string) => String(v).trim()).filter(Boolean).slice(0, limit) : [],
      liveTopics: Array.isArray(parsed.liveTopics) ? parsed.liveTopics.map((v: string) => String(v).trim()).filter(Boolean).slice(0, limit) : [],
      headlines: headlines.slice(0, limit),
      suggestedAngles: Array.isArray(parsed.suggestedAngles) ? parsed.suggestedAngles.map((v: string) => String(v).trim()).filter(Boolean).slice(0, limit) : [],
      suggestedHashtags: Array.isArray(parsed.suggestedHashtags) ? parsed.suggestedHashtags.map((v: string) => String(v).replace(/^#/, '').trim()).filter(Boolean).slice(0, limit) : [],
      generatedAt: new Date().toISOString(),
    };

    await kvSet(cacheKey, JSON.stringify(result));
    return result;
  } catch {
    const fallback: LiveTrendContext = {
      niche,
      platform,
      trendingKeywords: headlines.map(item => item.title.split(/[,:-]/)[0].trim()).filter(Boolean).slice(0, limit),
      liveTopics: headlines.map(item => item.title).slice(0, limit),
      headlines: headlines.slice(0, limit),
      suggestedAngles: [],
      suggestedHashtags: [],
      generatedAt: new Date().toISOString(),
    };
    await kvSet(cacheKey, JSON.stringify(fallback));
    return fallback;
  }
}

// Get trending topics for a niche
export async function getTrendingTopics(
  niche: string,
  options: {
    platforms?: Platform[];
    limit?: number;
    forceRefresh?: boolean;
  } = {}
): Promise<TrendingTopic[]> {
  const { platforms = ['twitter', 'instagram', 'tiktok'], limit = 10, forceRefresh = false } = options;
  
  const cacheKey = `trending_${niche.toLowerCase().replace(/\s+/g, '_')}`;
  
  // Check cache (1 hour TTL)
  if (!forceRefresh) {
    const cached = await kvGet(cacheKey);
    if (cached) {
      try {
        const { topics, timestamp } = JSON.parse(cached);
        if (Date.now() - new Date(timestamp).getTime() < 3600000) {
          return topics.slice(0, limit);
        }
      } catch (parseError) {
        console.warn('[getTrendingTopics] Failed to parse cached topics:', parseError instanceof Error ? parseError.message : 'Unknown error');
      }
    }
  }
  
  const prompt = `What are the top ${limit} trending topics on social media right now that would be relevant to someone in the "${niche}" niche?

For each topic, provide:
1. The topic name
2. Category (news, culture, tech, business, entertainment, sports, lifestyle, other)
3. Which platforms it's trending on
4. Volume level (viral, high, medium, rising)
5. Overall sentiment (positive, negative, neutral, mixed)
6. How relevant it is to ${niche} (0-100)
7. Related hashtags
8. Related topics
9. 2-3 content ideas for this topic

Return JSON:
{
  "topics": [
    {
      "topic": "Topic name",
      "category": "category",
      "platforms": ["twitter", "instagram"],
      "volume": "high",
      "sentiment": "positive",
      "relevanceScore": 85,
      "hashtags": ["hashtag1", "hashtag2"],
      "relatedTopics": ["related1", "related2"],
      "contentSuggestions": ["idea1", "idea2"]
    }
  ]
}

Focus on topics that can be authentically connected to ${niche} content.
Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt);
    const parsed = JSON.parse(response);
    
    const topics: TrendingTopic[] = parsed.topics.map((t: Partial<TrendingTopic>, i: number) => ({
      id: `trend_${Date.now()}_${i}`,
      topic: t.topic || 'Unknown Topic',
      category: t.category || 'other',
      platforms: t.platforms || platforms,
      volume: t.volume || 'medium',
      sentiment: t.sentiment || 'neutral',
      relevanceScore: t.relevanceScore || 50,
      hashtags: t.hashtags || [],
      relatedTopics: t.relatedTopics || [],
      contentSuggestions: t.contentSuggestions || [],
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    }));
    
    // Cache results
    await kvSet(cacheKey, JSON.stringify({
      topics,
      timestamp: new Date().toISOString(),
    }));
    
    return topics.slice(0, limit);
  } catch {
    return [];
  }
}

// Get content suggestions for a trending topic
export async function getTopicContentIdeas(
  topic: TrendingTopic,
  brandKit: BrandKit | null,
  count: number = 5
): Promise<string[]> {
  const prompt = `Generate ${count} unique content ideas for the trending topic "${topic.topic}".

My niche: ${brandKit?.niche || 'general'}
My tone: ${brandKit?.tone || 'professional'}
Topic sentiment: ${topic.sentiment}
Related hashtags: ${topic.hashtags.join(', ')}

Create content ideas that:
1. Authentically connect my brand to this trend
2. Provide value to my audience
3. Are not tone-deaf to the topic's sentiment
4. Can be created quickly to capitalize on the trend

Return JSON array:
["idea 1", "idea 2", ...]

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return topic.contentSuggestions || [];
  }
}

// Check if a topic is still trending
export async function isTopicStillTrending(topic: string): Promise<boolean> {
  const prompt = `Is "${topic}" still trending on social media? Answer with only "yes" or "no".`;
  
  try {
    const response = await universalChat(prompt);
    return response.toLowerCase().includes('yes');
  } catch {
    return false;
  }
}

// Get topic velocity (how fast it's growing)
export async function getTopicVelocity(
  topic: string
): Promise<{ velocity: 'accelerating' | 'stable' | 'declining'; prediction: string }> {
  const prompt = `Analyze the trending velocity of "${topic}".

Return JSON:
{
  "velocity": "accelerating" or "stable" or "declining",
  "prediction": "Brief prediction about how long this will stay relevant"
}

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt);
    return JSON.parse(response);
  } catch {
    return { velocity: 'stable', prediction: 'Unable to determine' };
  }
}

// Get industry-specific trends
export async function getIndustryTrends(
  industry: string,
  timeframe: 'today' | 'this_week' | 'this_month' = 'this_week'
): Promise<TrendingTopic[]> {
  const prompt = `What are the top 5 industry-specific trends in ${industry} for ${timeframe.replace('_', ' ')}?

Focus on:
- Industry news and developments
- New technologies or methodologies
- Market movements
- Key discussions in the industry

Return JSON:
{
  "topics": [
    {
      "topic": "Trend name",
      "category": "business",
      "platforms": ["linkedin", "twitter"],
      "volume": "high",
      "sentiment": "positive",
      "relevanceScore": 90,
      "hashtags": ["relevant", "hashtags"],
      "relatedTopics": ["related"],
      "contentSuggestions": ["content idea"]
    }
  ]
}

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt);
    const parsed = JSON.parse(response);
    
    return parsed.topics.map((t: Partial<TrendingTopic>, i: number) => ({
      id: `industry_${Date.now()}_${i}`,
      ...t,
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), // 24 hours
    }));
  } catch {
    return [];
  }
}

// Get platform-specific trending topics
export async function getPlatformTrends(
  platform: Platform,
  niche?: string
): Promise<TrendingTopic[]> {
  const prompt = `What are the top 10 trending topics specifically on ${platform} right now?
${niche ? `Filter for topics relevant to: ${niche}` : ''}

Return JSON:
{
  "topics": [
    {
      "topic": "Topic name",
      "category": "category",
      "platforms": ["${platform}"],
      "volume": "viral|high|medium|rising",
      "sentiment": "positive|negative|neutral|mixed",
      "relevanceScore": 50-100,
      "hashtags": ["hashtags"],
      "relatedTopics": ["related"],
      "contentSuggestions": ["ideas"]
    }
  ]
}

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt);
    const parsed = JSON.parse(response);
    
    return parsed.topics.map((t: Partial<TrendingTopic>, i: number) => ({
      id: `platform_${platform}_${Date.now()}_${i}`,
      ...t,
      platforms: [platform],
      timestamp: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }));
  } catch {
    return [];
  }
}

// Save a topic for later
export async function saveTopic(topic: TrendingTopic): Promise<void> {
  const saved = await getSavedTopics();
  if (!saved.find(t => t.topic === topic.topic)) {
    saved.push(topic);
    await kvSet('saved_trends', JSON.stringify(saved));
  }
}

export async function getSavedTopics(): Promise<TrendingTopic[]> {
  const data = await kvGet('saved_trends');
  if (data) {
    try {
      return JSON.parse(data);
    } catch (parseError) {
      console.warn('[getSavedTopics] Failed to parse saved topics:', parseError instanceof Error ? parseError.message : 'Unknown error');
    }
  }
  return [];
}

export async function removeSavedTopic(topicId: string): Promise<void> {
  const saved = await getSavedTopics();
  const filtered = saved.filter(t => t.id !== topicId);
  await kvSet('saved_trends', JSON.stringify(filtered));
}

// Check relevance of a trend to your brand
export async function checkTrendRelevance(
  topic: string,
  brandKit: BrandKit | null
): Promise<{ relevant: boolean; score: number; reason: string; angle: string }> {
  const prompt = `Evaluate if "${topic}" is relevant for a brand in the "${brandKit?.niche || 'general'}" niche.

Return JSON:
{
  "relevant": true/false,
  "score": 0-100,
  "reason": "Why this is or isn't relevant",
  "angle": "If relevant, what angle should they take?"
}

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return {
      relevant: false,
      score: 0,
      reason: 'Unable to analyze',
      angle: '',
    };
  }
}
