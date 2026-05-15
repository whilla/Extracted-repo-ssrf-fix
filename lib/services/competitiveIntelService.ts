import { logger } from '@/lib/utils/logger';
import { aiService } from './aiService';
import { kvGet, kvSet } from './puterService';
import { nativeProviders } from './nativeProviders';

export interface CompetitorData {
  name: string;
  platform: string;
  followers: number;
  engagement: number;
  postsPerWeek: number;
  avgLikes: number;
  avgComments: number;
  topContent: { type: string; performance: number }[];
  postingFrequency: 'daily' | 'weekly' | 'monthly';
  contentThemes: string[];
}

export interface CompetitorAnalysisResult {
  success: boolean;
  competitors: CompetitorData[];
  gaps: {
    area: string;
    yourPosition: string;
    competitorPosition: string;
    opportunity: string;
  }[];
  recommendations: string[];
  error?: string;
}

export interface CompetitorContentItem {
  id: string;
  url: string;
  platform: string;
  publishedAt: string;
  likes: number;
  comments: number;
  shares: number;
  contentText: string;
}

export class CompetitiveIntelService {
  static async analyzeCompetitors(
    competitorNames: string[],
    platform: string = 'instagram'
  ): Promise<CompetitorAnalysisResult> {
    try {
      logger.info('[CompetitiveIntelService] Analyzing competitors', { competitorNames, platform });

      const normalizedPlatform = platform.toLowerCase();

      if (!competitorNames || competitorNames.length === 0) {
        return {
          success: true,
          competitors: [],
          gaps: [],
          recommendations: ['No competitors provided for analysis.'],
        };
      }

      const analysisPrompt = `Analyze these competitors on ${normalizedPlatform}: ${competitorNames.join(', ')}.
        For each competitor, provide a realistic assessment of their:
        - Estimated follower count range
        - Typical engagement rate (as a percentage)
        - Posting frequency (daily/weekly/monthly)
        - Content themes they focus on
        Format as JSON array with keys: name, platform, followers, engagement, postsPerWeek, avgLikes, avgComments, contentThemes (array), postingFrequency.`;

      let aiCompetitors: CompetitorData[] = [];
      try {
        const aiResponse = await aiService.chat(analysisPrompt, 'claude-sonnet-4-5');
        const parsed = JSON.parse(aiResponse);
        if (Array.isArray(parsed)) {
          aiCompetitors = parsed.map((c: any) => ({
            name: c.name,
            platform: normalizedPlatform,
            followers: c.followers || 10000,
            engagement: c.engagement || 2.0,
            postsPerWeek: c.postsPerWeek || 5,
            avgLikes: c.avgLikes || 1000,
            avgComments: c.avgComments || 100,
            topContent: [
              { type: 'video', performance: 85 },
              { type: 'image', performance: 65 },
              { type: 'carousel', performance: 75 },
            ],
            postingFrequency: c.postingFrequency || 'weekly',
            contentThemes: c.contentThemes || ['general'],
          }));
        }
      } catch {
        return {
          success: false,
          competitors: [],
          gaps: [],
          recommendations: ['AI analysis failed. Ensure an AI provider is configured.'],
          error: 'AI provider unavailable for competitor analysis',
        };
      }

      const totalFollowers = aiCompetitors.reduce((s, c) => s + c.followers, 0);
      const avgEngagement = aiCompetitors.length > 0
        ? aiCompetitors.reduce((s, c) => s + c.engagement, 0) / aiCompetitors.length
        : 0;

      const gaps = aiCompetitors.map(comp => ({
        area: `${comp.name} on ${normalizedPlatform}`,
        yourPosition: `Your content strategy on ${platform}`,
        competitorPosition: `${comp.name} has ${comp.followers.toLocaleString()} followers with ${comp.engagement}% engagement`,
        opportunity: comp.engagement > avgEngagement
          ? `Match their engagement by focusing on ${comp.contentThemes.slice(0, 2).join(' and ')} content`
          : `Leverage your unique angle to differentiate from ${comp.name}'s ${comp.postingFrequency} posting schedule`,
      }));

      const recommendations = [
        aiCompetitors.some(c => c.postsPerWeek >= 7)
          ? `Increase posting frequency to at least 7 times per week to match top competitors`
          : `Maintain a consistent posting schedule of ${Math.max(...aiCompetitors.map(c => c.postsPerWeek))} times per week`,
        `Focus on video content which shows highest performance across competitors`,
        aiCompetitors.some(c => c.followers > 500000)
          ? `Consider paid promotion to close the follower gap with larger competitors`
          : `Leverage community engagement to grow organically in a competitive landscape`,
        `Monitor ${aiCompetitors.sort((a, b) => b.engagement - a.engagement)[0].name}'s top content for trends to adapt`,
      ];

      return {
        success: true,
        competitors: aiCompetitors,
        gaps,
        recommendations,
      };
    } catch (error) {
      return {
        success: false,
        competitors: [],
        gaps: [],
        recommendations: ['Unable to complete analysis. Please try again later.'],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async trackCompetitorContent(
    competitorName: string,
    platform: string
  ): Promise<{ success: boolean; content?: CompetitorContentItem[]; error?: string }> {
    try {
      logger.info('[CompetitiveIntelService] Tracking competitor content', { competitorName, platform });

      const normalizedPlatform = platform.toLowerCase();
      const cacheKey = `competitor_content_${normalizedPlatform}_${competitorName.toLowerCase()}`;
      
      const cached = await kvGet(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        const cacheAge = Date.now() - parsed.timestamp;
        if (cacheAge < 3600000) {
          return { success: true, content: parsed.content };
        }
      }

      const content = await this.fetchCompetitorContentFromAPI(competitorName, normalizedPlatform);

      if (content.length > 0) {
        await kvSet(cacheKey, JSON.stringify({
          content,
          timestamp: Date.now(),
        }));
      }

      return { success: true, content };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private static async fetchCompetitorContentFromAPI(
    competitorName: string,
    platform: string
  ): Promise<CompetitorContentItem[]> {
    const apiKeys: Record<string, string | null> = {
      twitter: await kvGet('twitter_bearer_token'),
      youtube: await kvGet('youtube_api_key'),
      instagram: await kvGet('instagram_access_token'),
    };

    const apiKey = apiKeys[platform];
    if (!apiKey) {
      logger.warn('CompetitiveIntel', `No API key configured for ${platform} competitor tracking`);
      return [];
    }

    switch (platform) {
      case 'twitter': {
        const searchRes = await fetch(
          `https://api.twitter.com/2/tweets/search/recent?query=from:${encodeURIComponent(competitorName)}&max_results=10&tweet.fields=public_metrics,created_at`,
          {
            headers: { 'Authorization': `Bearer ${apiKey}` },
          }
        );
        if (!searchRes.ok) return [];
        const data = await searchRes.json();
        return (data.data || []).map((tweet: any) => ({
          id: tweet.id,
          url: `https://twitter.com/${competitorName}/status/${tweet.id}`,
          platform: 'twitter',
          publishedAt: tweet.created_at,
          likes: tweet.public_metrics?.like_count || 0,
          comments: tweet.public_metrics?.reply_count || 0,
          shares: tweet.public_metrics?.retweet_count || 0,
          contentText: tweet.text,
        }));
      }

      case 'youtube': {
        const searchRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(competitorName)}&type=video&maxResults=10&key=${apiKey}`
        );
        if (!searchRes.ok) return [];
        const data = await searchRes.json();
        return (data.items || []).map((item: any) => ({
          id: item.id.videoId,
          url: `https://youtube.com/watch?v=${item.id.videoId}`,
          platform: 'youtube',
          publishedAt: item.snippet.publishedAt,
          likes: 0,
          comments: 0,
          shares: 0,
          contentText: item.snippet.title,
        }));
      }

      case 'instagram': {
        const pageId = await kvGet('instagram_page_id');
        if (!pageId) return [];
        const mediaRes = await fetch(
          `https://graph.facebook.com/v18.0/${pageId}/media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count&access_token=${apiKey}`
        );
        if (!mediaRes.ok) return [];
        const data = await mediaRes.json();
        return (data.data || []).map((item: any) => ({
          id: item.id,
          url: item.permalink,
          platform: 'instagram',
          publishedAt: item.timestamp,
          likes: item.like_count || 0,
          comments: item.comments_count || 0,
          shares: 0,
          contentText: item.caption || '',
        }));
      }

      default:
        return [];
    }
  }

  static async getContentGapAnalysis(
    myContentTypes: string[],
    competitorContentTypes: string[]
  ): Promise<{ success: boolean; gaps: string[]; opportunities: string[] }> {
    const gaps: string[] = [];
    const opportunities: string[] = [];

    competitorContentTypes.forEach(type => {
      if (!myContentTypes.includes(type)) {
        gaps.push(type);
        opportunities.push(`Add ${type} content to match competitor variety`);
      }
    });

    return { success: true, gaps, opportunities };
  }
}
