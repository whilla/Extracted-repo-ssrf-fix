import { universalChat } from './aiService';
import { readFile, writeFile, PATHS, kvSet, kvGet } from './puterService';
import type { BrandKit, Platform } from '@/lib/types';

export interface Competitor {
  id: string;
  name: string;
  handles: Record<Platform, string>;
  website?: string;
  description?: string;
  addedAt: string;
  lastAnalyzed?: string;
}

export interface CompetitorAnalysis {
  competitorId: string;
  platform: Platform;
  analyzedAt: string;
  metrics: {
    estimatedFollowers: string;
    postingFrequency: string;
    avgEngagement: string;
    contentTypes: string[];
    topPerformingContent: string[];
    hashtags: string[];
    postingTimes: string[];
  };
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  contentStrategy: string;
}

export interface CompetitorComparison {
  competitors: string[];
  metrics: ComparisonMetric[];
  insights: string[];
  recommendations: string[];
}

export interface ComparisonMetric {
  metric: string;
  values: Record<string, string | number>;
  winner: string;
}

export interface SocialMetrics {
  handle: string;
  platform: Platform;
  followerCount: number | null;
  engagementRate: number | null;
  recentPostCount: number | null;
  avgLikes: number | null;
  avgComments: number | null;
  avgShares: number | null;
  fetchedAt: string;
}

export interface CompetitorPost {
  id: string;
  url: string;
  text: string;
  postedAt: string;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  mediaType: 'image' | 'video' | 'text' | 'mixed' | null;
}

export interface PostingSchedule {
  competitorId: string;
  competitorName: string;
  postsAnalyzed: number;
  bestPostingDays: string[];
  bestPostingHours: number[];
  postingFrequency: string;
  avgPostsPerWeek: number;
  timezone: string;
  dayDistribution: Record<string, number>;
  hourDistribution: Record<string, number>;
}

export interface CompetitorReport {
  generatedAt: string;
  competitors: {
    id: string;
    name: string;
    analysis: CompetitorAnalysis | null;
    metrics: SocialMetrics | null;
    schedule: PostingSchedule | null;
  }[];
  comparison: CompetitorComparison | null;
  insights: string[];
  recommendations: string[];
}

function buildPlatformApiUrl(handle: string, platform: Platform): string | null {
  const normalized = handle.replace(/^@/, '');
  switch (platform) {
    case 'twitter':
      return `https://api.twitter.com/2/users/by/username/${normalized}`;
    case 'instagram':
      return `https://graph.instagram.com/${normalized}`;
    case 'tiktok':
      return `https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,username`;
    case 'linkedin':
      return `https://api.linkedin.com/v2/organizations?q=vanityName&vanityName=${normalized}`;
    case 'youtube':
      return `https://www.googleapis.com/youtube/v3/channels?forHandle=${normalized}&part=statistics`;
    case 'facebook':
      return `https://graph.facebook.com/${normalized}`;
    case 'threads':
      return `https://graph.threads.net/v1.0/${normalized}`;
    case 'pinterest':
      return `https://api.pinterest.com/v5/user_boards/${normalized}`;
    default:
      return null;
  }
}

function buildPlatformContentUrl(handle: string, platform: Platform, limit: number): string | null {
  const normalized = handle.replace(/^@/, '');
  switch (platform) {
    case 'twitter':
      return `https://api.twitter.com/2/users/by/username/${normalized}/tweets?max_results=${Math.min(limit, 100)}&tweet.fields=created_at,public_metrics`;
    case 'instagram':
      return `https://graph.instagram.com/${normalized}/media?limit=${Math.min(limit, 50)}&fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count`;
    case 'tiktok':
      return `https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,video_description,statistics`;
    case 'youtube':
      return `https://www.googleapis.com/youtube/v3/search?forHandle=${normalized}&maxResults=${Math.min(limit, 50)}&part=snippet&type=video&order=date`;
    case 'linkedin':
      return `https://api.linkedin.com/v2/ugcPosts?q=author&author=urn:li:organization:${normalized}&count=${Math.min(limit, 50)}`;
    case 'facebook':
      return `https://graph.facebook.com/${normalized}/posts?limit=${Math.min(limit, 50)}&fields=message,created_time,likes.summary(true),comments.summary(true),shares`;
    case 'pinterest':
      return `https://api.pinterest.com/v5/pins?board_id=${normalized}&page_size=${Math.min(limit, 50)}`;
    default:
      return null;
  }
}

export async function fetchCompetitorSocialMetrics(handle: string, platform: Platform): Promise<SocialMetrics> {
  const apiUrl = buildPlatformApiUrl(handle, platform);

  if (!apiUrl) {
    return {
      handle,
      platform,
      followerCount: null,
      engagementRate: null,
      recentPostCount: null,
      avgLikes: null,
      avgComments: null,
      avgShares: null,
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const apiKey = await kvGet<string>('api_key_' + platform, false);
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();

    let followerCount: number | null = null;
    let recentPostCount: number | null = null;

    switch (platform) {
      case 'twitter':
        followerCount = data.data?.public_metrics?.followers_count ?? null;
        recentPostCount = data.data?.public_metrics?.tweet_count ?? null;
        break;
      case 'instagram':
        followerCount = data.followers_count ?? null;
        recentPostCount = data.media_count ?? null;
        break;
      case 'youtube':
        followerCount = data.items?.[0]?.statistics?.subscriberCount ?? null;
        recentPostCount = data.items?.[0]?.statistics?.videoCount ?? null;
        break;
      case 'facebook':
        followerCount = data.followers ?? data.likes ?? null;
        break;
      case 'linkedin':
        followerCount = data.elements?.[0]?.followerCount ?? null;
        break;
      case 'tiktok':
        followerCount = data.data?.user?.follower_count ?? null;
        break;
      case 'pinterest':
        followerCount = data.items?.length ?? null;
        break;
      case 'threads':
        followerCount = data.followers_count ?? null;
        break;
    }

    return {
      handle,
      platform,
      followerCount,
      engagementRate: null,
      recentPostCount,
      avgLikes: null,
      avgComments: null,
      avgShares: null,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return {
      handle,
      platform,
      followerCount: null,
      engagementRate: null,
      recentPostCount: null,
      avgLikes: null,
      avgComments: null,
      avgShares: null,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export async function fetchCompetitorContent(handle: string, platform: Platform, limit: number = 20): Promise<CompetitorPost[]> {
  const contentUrl = buildPlatformContentUrl(handle, platform, limit);

  if (!contentUrl) {
    return [];
  }

  try {
    const apiKey = await kvGet<string>('api_key_' + platform, false);
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(contentUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Content API request failed: ${response.status}`);
    }

    const data = await response.json();
    const posts: CompetitorPost[] = [];

    switch (platform) {
      case 'twitter': {
        const tweets = data.data ?? [];
        for (const tweet of tweets) {
          posts.push({
            id: tweet.id,
            url: `https://twitter.com/${handle.replace(/^@/, '')}/status/${tweet.id}`,
            text: tweet.text ?? '',
            postedAt: tweet.created_at ?? '',
            likes: tweet.public_metrics?.like_count ?? null,
            comments: tweet.public_metrics?.reply_count ?? null,
            shares: tweet.public_metrics?.retweet_count ?? null,
            mediaType: tweet.attachments ? 'mixed' : 'text',
          });
        }
        break;
      }
      case 'instagram': {
        const media = data.data ?? [];
        for (const item of media) {
          posts.push({
            id: item.id,
            url: item.permalink ?? '',
            text: item.caption ?? '',
            postedAt: item.timestamp ?? '',
            likes: item.like_count ?? null,
            comments: item.comments_count ?? null,
            shares: null,
            mediaType: item.media_type === 'IMAGE' ? 'image' : item.media_type === 'VIDEO' ? 'video' : item.media_type === 'CAROUSEL_ALBUM' ? 'mixed' : 'text',
          });
        }
        break;
      }
      case 'youtube': {
        const items = data.items ?? [];
        for (const item of items) {
          posts.push({
            id: item.id?.videoId ?? item.id ?? '',
            url: `https://youtube.com/watch?v=${item.id?.videoId ?? item.id}`,
            text: item.snippet?.title ?? '',
            postedAt: item.snippet?.publishedAt ?? '',
            likes: item.statistics?.likeCount ?? null,
            comments: item.statistics?.commentCount ?? null,
            shares: null,
            mediaType: 'video',
          });
        }
        break;
      }
      case 'facebook': {
        const fbPosts = data.data ?? [];
        for (const post of fbPosts) {
          posts.push({
            id: post.id,
            url: `https://facebook.com/${post.id}`,
            text: post.message ?? '',
            postedAt: post.created_time ?? '',
            likes: post.likes?.summary?.total_count ?? null,
            comments: post.comments?.summary?.total_count ?? null,
            shares: post.shares?.count ?? null,
            mediaType: post.attachments ? 'mixed' : 'text',
          });
        }
        break;
      }
      case 'tiktok': {
        const videos = data.data?.videos ?? [];
        for (const video of videos) {
          posts.push({
            id: video.id,
            url: `https://tiktok.com/@${handle.replace(/^@/, '')}/video/${video.id}`,
            text: video.video_description ?? '',
            postedAt: video.create_time ?? '',
            likes: video.statistics?.digg_count ?? null,
            comments: video.statistics?.comment_count ?? null,
            shares: video.statistics?.share_count ?? null,
            mediaType: 'video',
          });
        }
        break;
      }
      case 'linkedin': {
        const ugcPosts = data.elements ?? [];
        for (const ugcPost of ugcPosts) {
          posts.push({
            id: ugcPost.id,
            url: ugcPost.url ?? '',
            text: ugcPost.text ?? '',
            postedAt: ugcPost.created?.time ?? '',
            likes: ugcPost.likeCount ?? null,
            comments: ugcPost.commentCount ?? null,
            shares: null,
            mediaType: ugcPost.media ? 'mixed' : 'text',
          });
        }
        break;
      }
      case 'pinterest': {
        const pins = data.items ?? [];
        for (const pin of pins) {
          posts.push({
            id: pin.id,
            url: pin.link ?? '',
            text: pin.title ?? pin.description ?? '',
            postedAt: pin.created_at ?? '',
            likes: null,
            comments: null,
            shares: null,
            mediaType: pin.media?.media_type === 'video' ? 'video' : 'image',
          });
        }
        break;
      }
    }

    return posts.slice(0, limit);
  } catch {
    return [];
  }
}

export async function addCompetitor(competitor: Omit<Competitor, 'id' | 'addedAt'>): Promise<Competitor> {
  const newCompetitor: Competitor = {
    ...competitor,
    id: `competitor_${Date.now()}`,
    addedAt: new Date().toISOString(),
  };

  const competitors = await getCompetitors();
  competitors.push(newCompetitor);
  await writeFile(`${PATHS.analytics}/competitors.json`, competitors);

  return newCompetitor;
}

export async function getCompetitors(): Promise<Competitor[]> {
  const data = await readFile<Competitor[]>(`${PATHS.analytics}/competitors.json`, true);
  return data || [];
}

export async function getCompetitor(id: string): Promise<Competitor | null> {
  const competitors = await getCompetitors();
  return competitors.find(c => c.id === id) || null;
}

export async function updateCompetitor(id: string, updates: Partial<Competitor>): Promise<void> {
  const competitors = await getCompetitors();
  const index = competitors.findIndex(c => c.id === id);

  if (index >= 0) {
    competitors[index] = { ...competitors[index], ...updates };
    await writeFile(`${PATHS.analytics}/competitors.json`, competitors);
  }
}

export async function deleteCompetitor(id: string): Promise<void> {
  const competitors = await getCompetitors();
  const filtered = competitors.filter(c => c.id !== id);
  await writeFile(`${PATHS.analytics}/competitors.json`, filtered);
}

export async function analyzeCompetitor(
  competitor: Competitor,
  platform: Platform,
  brandKit: BrandKit | null
): Promise<CompetitorAnalysis> {
  const handle = competitor.handles[platform];

  const prompt = `Analyze this competitor's ${platform} strategy:

Competitor: ${competitor.name}
Handle: @${handle || 'unknown'}
Website: ${competitor.website || 'N/A'}
Description: ${competitor.description || 'N/A'}

Provide a comprehensive analysis. Return JSON:
{
  "metrics": {
    "estimatedFollowers": "estimated follower count range",
    "postingFrequency": "how often they post",
    "avgEngagement": "estimated engagement rate",
    "contentTypes": ["types of content they post"],
    "topPerformingContent": ["description of their best content"],
    "hashtags": ["commonly used hashtags"],
    "postingTimes": ["typical posting times"]
  },
  "strengths": ["what they do well"],
  "weaknesses": ["areas they could improve"],
  "opportunities": ["gaps you could exploit"],
  "contentStrategy": "summary of their overall strategy"
}

Be specific and actionable. Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    const parsed = JSON.parse(response);

    await updateCompetitor(competitor.id, { lastAnalyzed: new Date().toISOString() });

    return {
      competitorId: competitor.id,
      platform,
      analyzedAt: new Date().toISOString(),
      ...parsed,
    };
  } catch {
    return {
      competitorId: competitor.id,
      platform,
      analyzedAt: new Date().toISOString(),
      metrics: {
        estimatedFollowers: 'Unknown',
        postingFrequency: 'Unknown',
        avgEngagement: 'Unknown',
        contentTypes: [],
        topPerformingContent: [],
        hashtags: [],
        postingTimes: [],
      },
      strengths: [],
      weaknesses: [],
      opportunities: [],
      contentStrategy: 'Analysis failed',
    };
  }
}

export async function analyzeCompetitorWithRealData(
  competitorId: string,
  platform: Platform,
  brandKit: BrandKit | null
): Promise<CompetitorAnalysis & { realMetrics: SocialMetrics; recentPosts: CompetitorPost[] }> {
  const competitor = await getCompetitor(competitorId);
  if (!competitor) {
    throw new Error('Competitor not found');
  }

  const handle = competitor.handles[platform];

  const [realMetrics, recentPosts, aiAnalysis] = await Promise.all([
    fetchCompetitorSocialMetrics(handle, platform),
    fetchCompetitorContent(handle, platform, 20),
    analyzeCompetitor(competitor, platform, brandKit),
  ]);

  const totalLikes = recentPosts.reduce((sum, p) => sum + (p.likes ?? 0), 0);
  const totalComments = recentPosts.reduce((sum, p) => sum + (p.comments ?? 0), 0);
  const totalShares = recentPosts.reduce((sum, p) => sum + (p.shares ?? 0), 0);
  const postCount = recentPosts.length;

  const enrichedMetrics: CompetitorAnalysis['metrics'] = {
    estimatedFollowers: realMetrics.followerCount ? realMetrics.followerCount.toLocaleString() : aiAnalysis.metrics.estimatedFollowers,
    postingFrequency: aiAnalysis.metrics.postingFrequency,
    avgEngagement: realMetrics.followerCount && realMetrics.followerCount > 0
      ? (((totalLikes + totalComments + totalShares) / realMetrics.followerCount) * 100).toFixed(2) + '%'
      : aiAnalysis.metrics.avgEngagement,
    contentTypes: [...new Set(recentPosts.map(p => p.mediaType ?? 'text').filter(Boolean))],
    topPerformingContent: recentPosts
      .sort((a, b) => ((b.likes ?? 0) + (b.comments ?? 0) + (b.shares ?? 0)) - ((a.likes ?? 0) + (a.comments ?? 0) + (a.shares ?? 0)))
      .slice(0, 3)
      .map(p => p.text.slice(0, 100)),
    hashtags: aiAnalysis.metrics.hashtags,
    postingTimes: aiAnalysis.metrics.postingTimes,
  };

  const analysisWithRealData: CompetitorAnalysis & { realMetrics: SocialMetrics; recentPosts: CompetitorPost[] } = {
    ...aiAnalysis,
    metrics: enrichedMetrics,
    realMetrics,
    recentPosts,
  };

  await writeFile(
    `${PATHS.analytics}/competitor_cache_${competitorId}_${platform}.json`,
    { metrics: realMetrics, posts: recentPosts, cachedAt: new Date().toISOString() }
  );

  return analysisWithRealData;
}

export async function trackCompetitorPostingSchedule(competitorId: string): Promise<PostingSchedule | null> {
  const competitor = await getCompetitor(competitorId);
  if (!competitor) {
    return null;
  }

  const allPosts: CompetitorPost[] = [];

  for (const platform of Object.keys(competitor.handles) as Platform[]) {
    const handle = competitor.handles[platform];
    if (!handle) continue;

    const cached = await readFile<{ posts: CompetitorPost[] }>(
      `${PATHS.analytics}/competitor_cache_${competitorId}_${platform}.json`,
      true
    );

    if (cached?.posts && cached.posts.length > 0) {
      allPosts.push(...cached.posts);
    } else {
      const freshPosts = await fetchCompetitorContent(handle, platform, 50);
      if (freshPosts.length > 0) {
        allPosts.push(...freshPosts);
        await writeFile(
          `${PATHS.analytics}/competitor_cache_${competitorId}_${platform}.json`,
          { metrics: null, posts: freshPosts, cachedAt: new Date().toISOString() }
        );
      }
    }
  }

  if (allPosts.length === 0) {
    return null;
  }

  const dayDistribution: Record<string, number> = {
    Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0,
  };
  const hourDistribution: Record<string, number> = {};
  for (let h = 0; h < 24; h++) {
    hourDistribution[h.toString()] = 0;
  }

  const timestamps: Date[] = [];

  for (const post of allPosts) {
    let postDate: Date | null = null;
    try {
      postDate = new Date(post.postedAt);
      if (isNaN(postDate.getTime())) {
        postDate = null;
      }
    } catch {
      postDate = null;
    }

    if (!postDate) continue;

    timestamps.push(postDate);
    const dayName = postDate.toLocaleDateString('en-US', { weekday: 'long' });
    const hour = postDate.getHours();

    if (dayName in dayDistribution) {
      dayDistribution[dayName]++;
    }
    hourDistribution[hour.toString()]++;
  }

  if (timestamps.length === 0) {
    return null;
  }

  timestamps.sort((a, b) => a.getTime() - b.getTime());
  const earliest = timestamps[0];
  const latest = timestamps[timestamps.length - 1];
  const daysSpan = Math.max(1, (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24));
  const avgPostsPerWeek = (timestamps.length / daysSpan) * 7;

  const sortedDays = Object.entries(dayDistribution)
    .sort(([, a], [, b]) => b - a)
    .map(([day]) => day);

  const bestDays = sortedDays.slice(0, 3);

  const sortedHours = Object.entries(hourDistribution)
    .sort(([, a], [, b]) => b - a)
    .map(([hour]) => parseInt(hour, 10));

  const bestHours = sortedHours.slice(0, 5);

  let postingFrequency: string;
  if (avgPostsPerWeek >= 5) {
    postingFrequency = 'Daily';
  } else if (avgPostsPerWeek >= 2) {
    postingFrequency = 'Several times per week';
  } else if (avgPostsPerWeek >= 1) {
    postingFrequency = 'Weekly';
  } else {
    postingFrequency = 'Less than weekly';
  }

  const schedule: PostingSchedule = {
    competitorId,
    competitorName: competitor.name,
    postsAnalyzed: timestamps.length,
    bestPostingDays: bestDays,
    bestPostingHours: bestHours,
    postingFrequency,
    avgPostsPerWeek: Math.round(avgPostsPerWeek * 100) / 100,
    timezone: 'UTC',
    dayDistribution,
    hourDistribution,
  };

  await writeFile(
    `${PATHS.analytics}/competitor_schedule_${competitorId}.json`,
    schedule
  );

  return schedule;
}

export async function generateCompetitorReport(
  competitorIds: string[],
  platform: Platform,
  brandKit: BrandKit | null
): Promise<CompetitorReport> {
  const competitors = await getCompetitors();
  const selected = competitors.filter(c => competitorIds.includes(c.id));

  if (selected.length === 0) {
    throw new Error('No competitors found');
  }

  const competitorData = await Promise.all(
    selected.map(async (competitor) => {
      let analysis: CompetitorAnalysis | null = null;
      let metrics: SocialMetrics | null = null;
      let schedule: PostingSchedule | null = null;

      try {
        const handle = competitor.handles[platform];
        if (handle) {
          [metrics] = await Promise.all([
            fetchCompetitorSocialMetrics(handle, platform),
          ]);

          const content = await fetchCompetitorContent(handle, platform, 20);
          if (content.length > 0) {
            await writeFile(
              `${PATHS.analytics}/competitor_cache_${competitor.id}_${platform}.json`,
              { metrics, posts: content, cachedAt: new Date().toISOString() }
            );
          }
        }

        analysis = await analyzeCompetitor(competitor, platform, brandKit);
        schedule = await trackCompetitorPostingSchedule(competitor.id);
      } catch {
        // Continue with partial data
      }

      return {
        id: competitor.id,
        name: competitor.name,
        analysis,
        metrics,
        schedule,
      };
    })
  );

  let comparison: CompetitorComparison | null = null;
  const insights: string[] = [];
  const recommendations: string[] = [];

  if (selected.length >= 2) {
    try {
      comparison = await compareCompetitors(competitorIds, platform, brandKit);
    } catch {
      comparison = null;
    }
  }

  const followerCounts = competitorData
    .filter(d => d.metrics?.followerCount !== null)
    .map(d => ({ name: d.name, followers: d.metrics!.followerCount! }));

  if (followerCounts.length > 0) {
    const leader = followerCounts.reduce((a, b) => a.followers > b.followers ? a : b);
    insights.push(`${leader.name} has the largest audience with ${leader.followers.toLocaleString()} followers`);
  }

  const postingFreqs = competitorData
    .filter(d => d.schedule !== null)
    .map(d => ({ name: d.name, avgPosts: d.schedule!.avgPostsPerWeek }));

  if (postingFreqs.length > 0) {
    const mostActive = postingFreqs.reduce((a, b) => a.avgPosts > b.avgPosts ? a : b);
    insights.push(`${mostActive.name} posts most frequently at ${mostActive.avgPosts.toFixed(1)} posts per week`);
  }

  const commonWeaknesses = competitorData
    .filter(d => d.analysis?.weaknesses)
    .flatMap(d => d.analysis!.weaknesses);

  const weaknessMap: Record<string, number> = {};
  for (const w of commonWeaknesses) {
    weaknessMap[w] = (weaknessMap[w] || 0) + 1;
  }

  const topWeaknesses = Object.entries(weaknessMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([w]) => w);

  if (topWeaknesses.length > 0) {
    recommendations.push(`Opportunity: Competitors commonly struggle with ${topWeaknesses.join(', ')}`);
  }

  const contentTypes = competitorData
    .filter(d => d.analysis?.metrics.contentTypes)
    .flatMap(d => d.analysis!.metrics.contentTypes);

  const typeMap: Record<string, number> = {};
  for (const t of contentTypes) {
    typeMap[t] = (typeMap[t] || 0) + 1;
  }

  const dominantType = Object.entries(typeMap).sort(([, a], [, b]) => b - a)[0];
  if (dominantType) {
    recommendations.push(`Consider differentiating by using more ${dominantType[0] === contentTypes.find(t => t === dominantType[0]) ? 'diverse content formats' : dominantType[0] + ' content'}`);
  }

  const report: CompetitorReport = {
    generatedAt: new Date().toISOString(),
    competitors: competitorData,
    comparison,
    insights,
    recommendations,
  };

  await writeFile(
    `${PATHS.analytics}/competitor_report_${Date.now()}.json`,
    report
  );

  return report;
}

export async function compareCompetitors(
  competitorIds: string[],
  platform: Platform,
  brandKit: BrandKit | null
): Promise<CompetitorComparison> {
  const competitors = await getCompetitors();
  const selected = competitors.filter(c => competitorIds.includes(c.id));

  if (selected.length < 2) {
    throw new Error('Need at least 2 competitors to compare');
  }

  const competitorNames = selected.map(c => c.name).join(', ');
  const handles = selected.map(c => `${c.name}: @${c.handles[platform] || 'N/A'}`).join('\n');

  const prompt = `Compare these competitors on ${platform}:

${handles}

My brand: ${brandKit?.niche || 'general business'}

Return JSON:
{
  "metrics": [
    {
      "metric": "Metric name",
      "values": { "Competitor1": "value", "Competitor2": "value" },
      "winner": "Name of the winner"
    }
  ],
  "insights": ["key insight about the competitive landscape"],
  "recommendations": ["what I should do differently based on this analysis"]
}

Compare on: posting frequency, engagement style, content quality, audience interaction, brand consistency.
Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    const parsed = JSON.parse(response);

    return {
      competitors: selected.map(c => c.name),
      ...parsed,
    };
  } catch {
    return {
      competitors: selected.map(c => c.name),
      metrics: [],
      insights: ['Comparison analysis failed'],
      recommendations: ['Try analyzing competitors individually'],
    };
  }
}

export async function getCompetitorInspiration(
  competitorId: string,
  platform: Platform,
  contentType: string,
  brandKit: BrandKit | null
): Promise<string[]> {
  const competitor = await getCompetitor(competitorId);
  if (!competitor) return [];

  const prompt = `Based on what typically works for competitors like "${competitor.name}" on ${platform}, generate 5 content ideas for ${contentType} content.

My brand: ${brandKit?.niche || 'general'}
My tone: ${brandKit?.tone || 'professional'}

The ideas should be inspired by competitor strategies but original and tailored to my brand.

Return JSON array:
["idea 1", "idea 2", ...]

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return [];
  }
}

export interface TrackedContent {
  id: string;
  competitorId: string;
  platform: Platform;
  contentUrl?: string;
  contentText: string;
  metrics?: {
    likes: number;
    comments: number;
    shares: number;
  };
  notes?: string;
  trackedAt: string;
}

export async function trackCompetitorContent(
  content: Omit<TrackedContent, 'id' | 'trackedAt'>
): Promise<TrackedContent> {
  const tracked = await getTrackedContent();

  const newContent: TrackedContent = {
    ...content,
    id: `tracked_${Date.now()}`,
    trackedAt: new Date().toISOString(),
  };

  tracked.push(newContent);
  await writeFile(`${PATHS.analytics}/tracked_content.json`, tracked);

  return newContent;
}

export async function getTrackedContent(competitorId?: string): Promise<TrackedContent[]> {
  const data = await readFile<TrackedContent[]>(`${PATHS.analytics}/tracked_content.json`, true);
  const content = data || [];

  if (competitorId) {
    return content.filter(c => c.competitorId === competitorId);
  }

  return content;
}

export async function generatePositioning(
  brandKit: BrandKit | null
): Promise<{ statement: string; differentiators: string[]; targetAudience: string }> {
  const competitors = await getCompetitors();
  const competitorNames = competitors.map(c => c.name).join(', ');

  const prompt = `Create a competitive positioning statement for my brand.

My brand: ${brandKit?.niche || 'general business'}
My tone: ${brandKit?.tone || 'professional'}
Competitors: ${competitorNames || 'general market competitors'}

Return JSON:
{
  "statement": "Unlike [competitors], we [unique value proposition] for [target audience] who want [desired outcome]",
  "differentiators": ["3-5 key differentiators"],
  "targetAudience": "specific target audience description"
}

Return ONLY valid JSON.`;

  try {
    const response = await universalChat(prompt, { brandKit });
    return JSON.parse(response);
  } catch {
    return {
      statement: 'We provide unique value to our customers.',
      differentiators: [],
      targetAudience: 'Our target customers',
    };
  }
}
