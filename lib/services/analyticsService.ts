import type { ContentDraft, Platform } from '@/lib/types';
import { aiService } from './aiService';
import { PATHS, readFile, writeFile, listFiles } from './puterService';

export interface AnalyticsData {
  engagementRates: { [platform: string]: number };
  topContent: Array<{ id: string; engagement: number; platform: string }>;
  followerGrowth: Array<{ date: string; count: number }>;
  topHashtags: Array<{ tag: string; uses: number }>;
  postingTimes: { [time: string]: number };
  pillarPerformance: { [pillar: string]: number };
}

const ANALYTICS_PATH = `${PATHS.analytics}/data.json`;

function createEmptyAnalytics(): AnalyticsData {
  return {
    engagementRates: {},
    topContent: [],
    followerGrowth: [],
    topHashtags: [],
    postingTimes: {},
    pillarPerformance: {},
  };
}

function normalizeAnalytics(data: Partial<AnalyticsData> | null): AnalyticsData {
  return {
    ...createEmptyAnalytics(),
    ...(data || {}),
    engagementRates: data?.engagementRates || {},
    topContent: data?.topContent || [],
    followerGrowth: data?.followerGrowth || [],
    topHashtags: data?.topHashtags || [],
    postingTimes: data?.postingTimes || {},
    pillarPerformance: data?.pillarPerformance || {},
  };
}

function extractHashtags(text: string): string[] {
  return Array.from(
    new Set(
      (text.match(/#([\p{L}\p{N}_]+)/gu) || [])
        .map(tag => tag.slice(1).toLowerCase())
        .filter(Boolean)
    )
  );
}

function getLatestDraftText(draft: ContentDraft): string {
  return draft.versions[draft.currentVersion]?.text
    || draft.versions[draft.versions.length - 1]?.text
    || '';
}

async function loadPublishedDrafts(): Promise<ContentDraft[]> {
  const files = await listFiles(PATHS.published);
  const drafts = await Promise.all(
    files
      .filter(file => file.name.endsWith('.json') && !file.is_dir)
      .map(file => readFile<ContentDraft>(`${PATHS.published}/${file.name}`, true))
  );

  return drafts.filter((draft): draft is ContentDraft => Boolean(draft));
}

function deriveAnalyticsFromPublishedContent(drafts: ContentDraft[]): Partial<AnalyticsData> {
  if (drafts.length === 0) {
    return createEmptyAnalytics();
  }

  const postingTimes: Record<string, number> = {};
  const hashtagCounts = new Map<string, number>();
  const platformScores = new Map<Platform, { total: number; count: number }>();
  const followerGrowthByDate = new Map<string, number>();
  const topContent: Array<{ id: string; engagement: number; platform: string }> = [];

  for (const draft of drafts) {
    const timestamp = draft.publishedAt || draft.updated || draft.created;
    const publishedDate = new Date(timestamp);
    const hourKey = `${publishedDate.getHours().toString().padStart(2, '0')}:00`;
    postingTimes[hourKey] = (postingTimes[hourKey] || 0) + 1;

    const dayKey = publishedDate.toISOString().slice(0, 10);
    followerGrowthByDate.set(dayKey, (followerGrowthByDate.get(dayKey) || 0) + 1);

    const text = getLatestDraftText(draft);
    const hashtags = extractHashtags(text);
    for (const hashtag of hashtags) {
      hashtagCounts.set(hashtag, (hashtagCounts.get(hashtag) || 0) + 1);
    }

    const engagementScore = Math.max(
      draft.platforms.length * 20
      + hashtags.length * 8
      + Math.min(text.length, 280) / 10,
      1
    );

    for (const platform of draft.platforms) {
      const score = platformScores.get(platform) || { total: 0, count: 0 };
      score.total += engagementScore;
      score.count += 1;
      platformScores.set(platform, score);
      topContent.push({
        id: `${draft.id}:${platform}`,
        engagement: Math.round(engagementScore),
        platform,
      });
    }
  }

  const engagementRates = Object.fromEntries(
    Array.from(platformScores.entries()).map(([platform, score]) => [
      platform,
      Number((score.total / score.count / 20).toFixed(1)),
    ])
  );

  const followerGrowth = Array.from(followerGrowthByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const topHashtags = Array.from(hashtagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, uses]) => ({ tag, uses }));

  return {
    engagementRates,
    postingTimes,
    followerGrowth,
    topHashtags,
    topContent: topContent.sort((a, b) => b.engagement - a.engagement).slice(0, 10),
  };
}

class AnalyticsService {
  async fetchAnalytics(ayrshareKey: string): Promise<AnalyticsData> {
    void ayrshareKey;
    try {
      const [storedAnalytics, publishedDrafts] = await Promise.all([
        readFile<AnalyticsData>(ANALYTICS_PATH, true),
        loadPublishedDrafts(),
      ]);

      const analytics = {
        ...normalizeAnalytics(storedAnalytics),
        ...deriveAnalyticsFromPublishedContent(publishedDrafts),
      };

      await writeFile(ANALYTICS_PATH, JSON.stringify(analytics, null, 2));
      return analytics;
    } catch (error) {
      console.error('[v0] Analytics fetch error:', error);
      return createEmptyAnalytics();
    }
  }

  async generateInsights(analyticsData: AnalyticsData, brandContext: any): Promise<string> {
    try {
      const prompt = `
        Based on this social media performance data, provide 2-3 key insights and recommendations.
        Keep it under 100 words.

        Engagement Rates: ${JSON.stringify(analyticsData.engagementRates)}
        Best performing times: ${Object.entries(analyticsData.postingTimes)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([time]) => time)
          .join(', ')}
        Brand: ${brandContext.brandName}

        Focus on actionable insights the user can apply immediately.
      `;

      const response = await aiService.chat(prompt, 'claude-sonnet-4-5');
      return response;
    } catch (error) {
      console.error('[v0] Insights generation error:', error);
      return 'Unable to generate insights at this time.';
    }
  }

  async updateAnalytics(postData: any): Promise<void> {
    try {
      const analytics = normalizeAnalytics(await readFile<AnalyticsData>(ANALYTICS_PATH, true));

      // Update posting times heatmap
      const publishedAt = postData.scheduledAt || postData.publishedAt || new Date().toISOString();
      const hour = new Date(publishedAt).getHours();
      const hourKey = `${hour.toString().padStart(2, '0')}:00`;
      analytics.postingTimes[hourKey] = (analytics.postingTimes[hourKey] || 0) + 1;

      const text = typeof postData.text === 'string' ? postData.text : '';
      for (const hashtag of extractHashtags(text)) {
        const existing = analytics.topHashtags.find(entry => entry.tag === hashtag);
        if (existing) {
          existing.uses += 1;
        } else {
          analytics.topHashtags.push({ tag: hashtag, uses: 1 });
        }
      }

      analytics.topHashtags.sort((a, b) => b.uses - a.uses);
      analytics.topHashtags = analytics.topHashtags.slice(0, 10);

      await writeFile(ANALYTICS_PATH, JSON.stringify(analytics, null, 2));
    } catch (error) {
      console.error('[v0] Analytics update error:', error);
    }
  }
}

export const analyticsService = new AnalyticsService();

export async function fetchAnalytics(ayrshareKey: string): Promise<AnalyticsData> {
  return analyticsService.fetchAnalytics(ayrshareKey);
}

export async function generateInsights(analyticsData: AnalyticsData, brandContext: any): Promise<string> {
  return analyticsService.generateInsights(analyticsData, brandContext);
}
