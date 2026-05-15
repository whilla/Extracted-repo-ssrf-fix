/**
 * TREND SCOUT SERVICE
 * Proactively monitors external signals to identify emerging viral trends 
 * before the user explicitly asks for them.
 * 
 * Responsibilities:
 * - Monitor platform-specific trends (X, TikTok, YT, IG)
 * - Analyze "Pattern Shifts" in high-engagement content
 * - Propose "Trend-Driven Ideas" to the user
 * - Update the LearningSystem with emerging winning patterns
 */

import { learningSystem } from '../core/LearningSystem';
import { puterService } from './puterService';
import { memoryManager } from '../core/MemoryManager';

export interface TrendSignal {
  keyword: string;
  growthRate: number; // Percentage increase in mentions
  platform: string;
  sentiment: 'positive' | 'negative' | 'curiosity';
  associatedPatterns: string[];
  confidence: number;
}

export interface TrendProposal {
  id: string;
  title: string;
  description: string;
  suggestedHook: string;
  reasoning: string;
  trendSignal: TrendSignal;
  timestamp: string;
}

export class TrendScoutService {
  private initialized = false;
  private currentTrends: TrendSignal[] = [];

  private readonly KEYS = {
    activeTrends: 'nexus_active_trends',
    scoutLog: 'nexus_scout_logs',
  };

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const savedTrends = await puterService.readFile(this.KEYS.activeTrends, true);
    if (savedTrends) this.currentTrends = (savedTrends as unknown) as TrendSignal[];
    
    this.initialized = true;
    console.log('[TrendScout] Initialized and monitoring signals...');
  }

  /**
   * The primary "Scouting" loop.
   * Fetches real trend data from multiple sources.
   */
  async scanForTrends(): Promise<TrendSignal[]> {
    if (!this.initialized) await this.initialize();

    console.log('[TrendScout] Scanning for emerging viral patterns...');

    const signals: TrendSignal[] = [];

    // Try to fetch from Google Trends API (requires API key)
    const googleTrendsKey = await (puterService as any).kvGet('google_trends_api_key');
    if (googleTrendsKey) {
      try {
        const response = await fetch(`https://trends.googleapis.com/v1beta/trends?hl=en-US&tz=-120&key=${googleTrendsKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeRange: 'today 12-m',
            category: 'technology',
            granularTimeRange: {
              startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              endTime: new Date().toISOString()
            }
          })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.default?.trendingArticleSearches) {
            data.default.trendingArticleSearches.forEach((item: any) => {
              signals.push({
                keyword: item.title.query,
                growthRate: item.articles[0]?.traffic || 100,
                platform: 'google',
                sentiment: 'curiosity',
                associatedPatterns: ['news', 'trending'],
                confidence: 0.85,
              });
            });
          }
        }
      } catch (error) {
        console.warn('[TrendScout] Google Trends fetch failed:', error);
      }
    }

    // Analyze recent high-performing content from social metrics
    try {
      const { socialMetricsService } = await import('./socialMetricsService');
      const metrics = await socialMetricsService.fetchAllMetrics();
      
      // Extract trending topics from high engagement posts
      for (const m of metrics) {
        if (m.engagementRate > 5) {
          signals.push({
            keyword: `${m.platform} trending`,
            growthRate: m.engagementRate * 10,
            platform: m.platform,
            sentiment: 'positive',
            associatedPatterns: ['viral_content', 'high_engagement'],
            confidence: 0.9,
          });
        }
      }
    } catch (error) {
      console.warn('[TrendScout] Social metrics analysis failed:', error);
    }

    // Fetch Twitter/X trending topics
    const twitterBearer = await (puterService as any).kvGet('twitter_bearer_token');
    if (twitterBearer && signals.length < 5) {
      try {
        const response = await fetch('https://api.twitter.com/1.1/trends/place.json?id=1', {
          headers: { 'Authorization': `Bearer ${twitterBearer}` }
        });
        if (response.ok) {
          const data = await response.json();
          data[0]?.trends?.slice(0, 3).forEach((t: any) => {
            if (!signals.some(s => s.keyword === t.name)) {
              signals.push({
                keyword: t.name,
                growthRate: t.tweet_volume || 100,
                platform: 'x',
                sentiment: 'curiosity',
                associatedPatterns: ['hashtag', 'viral'],
                confidence: 0.8,
              });
            }
          });
        }
      } catch (error) {
        console.warn('[TrendScout] Twitter trends fetch failed:', error);
      }
    }

    // Analyze published content for emerging patterns
    try {
      const publishedFiles = await puterService.listFiles(puterService.PATHS.published);
      const recentPosts: string[] = [];
      
      for (const file of publishedFiles.slice(0, 10)) {
        if (file.is_dir) continue;
        const content = await puterService.readFile(`${puterService.PATHS.published}/${file.name}`, true);
        if (content && (content as any).text) {
          recentPosts.push((content as any).text as string);
        }
      }

      // Extract common keywords from recent high-performing content
      const keywordFreq: Record<string, number> = {};
      recentPosts.forEach(text => {
        const words = text.toLowerCase().match(/\b[a-z]{4,15}\b/g) || [];
        words.forEach(word => {
          if (!['this', 'that', 'with', 'from', 'your', 'what', 'when', 'which'].includes(word)) {
            keywordFreq[word] = (keywordFreq[word] || 0) + 1;
          }
        });
      });

      // Add trending keywords from content
      Object.entries(keywordFreq)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .forEach(([word, freq]) => {
          if (!signals.some(s => s.keyword === word)) {
            signals.push({
              keyword: word,
              growthRate: freq * 50,
              platform: 'content_analysis',
              sentiment: 'curiosity',
              associatedPatterns: ['trending_topic', 'content_driven'],
              confidence: Math.min(0.95, freq / 10),
            });
          }
        });
    } catch (error) {
      console.warn('[TrendScout] Content analysis failed:', error);
    }

    // Deduplicate and sort by confidence
    const uniqueSignals = signals
      .filter((s, i, arr) => arr.findIndex(x => x.keyword === s.keyword) === i)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);

    this.currentTrends = uniqueSignals;
    await puterService.writeFile(this.KEYS.activeTrends, uniqueSignals);
    
    // Feed these trends into the LearningSystem as a "Future Bias"
    for (const signal of uniqueSignals) {
      await learningSystem.recordSuccess({
        agentId: 'trend_scout',
        content: `Trend signal detected: ${signal.keyword} on ${signal.platform}`,
        success: true,
        reasoning: `High growth rate (${signal.growthRate}%) indicated by external signals.`,
        metadata: { signal },
        viralScore: { total: 90 },
      } as any, { userInput: 'Trend Scout', taskType: 'strategy' } as any);
    }

    return uniqueSignals;
  }

  /**
   * Brainstorm high-impact content ideas based on current trends.
   */
  async brainstormTrendIdeas(): Promise<TrendProposal[]> {
    if (!this.initialized) await this.initialize();

    const brand = await (memoryManager as any).getBrandMemory();
    const proposals: TrendProposal[] = [];

    for (const trend of this.currentTrends) {
      const proposal: TrendProposal = {
        id: `trend_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: `Leveraging ${trend.keyword}`,
        description: `The trend "${trend.keyword}" is exploding on ${trend.platform} with ${trend.growthRate}% growth.`,
        suggestedHook: `Stop ignoring ${trend.keyword}. Here is why it's changing everything.`,
        reasoning: `Aligns with brand niche ${brand?.brandKit?.niche} and uses ${trend.sentiment} sentiment.`,
        trendSignal: trend,
        timestamp: new Date().toISOString(),
      };
      proposals.push(proposal);
    }

    return proposals;
  }

  async __clearTrends(): Promise<void> {
    this.currentTrends = [];
    await puterService.writeFile(this.KEYS.activeTrends, []);
  }
}

export const trendScoutService = new TrendScoutService();
