import { logger } from '@/lib/utils/logger';

export interface ContentFeatures {
  type: 'video' | 'image' | 'text' | 'carousel';
  topic: string;
  hashtags: string[];
  length?: number;
  hasEmoji?: boolean;
  hasCTA?: boolean;
  postingTime?: string;
  dayOfWeek?: string;
}

export interface ViralPrediction {
  success: boolean;
  viralScore: number;
  potentialReach: number;
  engagementPrediction: number;
  viralProbability: 'low' | 'medium' | 'high' | 'viral';
  factors: {
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
  }[];
  recommendations: string[];
  error?: string;
}

export interface HistoricalPerformance {
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  avgEngagement: number;
  topPerformingTopics: string[];
  bestPostingTimes: string[];
  bestDays: string[];
}

export class PredictiveViralService {
  private static historicalData: HistoricalPerformance | null = null;

  static async setHistoricalData(data: HistoricalPerformance): Promise<void> {
    this.historicalData = data;
  }

  static async predictViralPotential(
    content: ContentFeatures,
    platform: string = 'instagram'
  ): Promise<ViralPrediction> {
    try {
      logger.info('[PredictiveViralService] Predicting viral potential', { content, platform });

      let score = 50;

      const factors: { factor: string; impact: 'positive' | 'negative' | 'neutral'; weight: number }[] = [];

      if (content.type === 'video') {
        score += 15;
        factors.push({ factor: 'Video content', impact: 'positive', weight: 15 });
      } else if (content.type === 'carousel') {
        score += 10;
        factors.push({ factor: 'Carousel format', impact: 'positive', weight: 10 });
      }

      if (content.hasCTA) {
        score += 10;
        factors.push({ factor: 'Call-to-action included', impact: 'positive', weight: 10 });
      } else {
        score -= 5;
        factors.push({ factor: 'No call-to-action', impact: 'negative', weight: 5 });
      }

      if (content.hasEmoji) {
        score += 5;
        factors.push({ factor: 'Emoji usage', impact: 'positive', weight: 5 });
      }

      const trendingTopics = ['ai', 'trending', 'viral', 'challenge'];
      const hasTrending = content.hashtags.some(t => trendingTopics.includes(t.toLowerCase()));
      if (hasTrending) {
        score += 15;
        factors.push({ factor: 'Trending hashtag usage', impact: 'positive', weight: 15 });
      }

      const optimalTimes = ['9:00 AM', '12:00 PM', '6:00 PM', '9:00 PM'];
      if (content.postingTime && optimalTimes.includes(content.postingTime)) {
        score += 10;
        factors.push({ factor: 'Optimal posting time', impact: 'positive', weight: 10 });
      }

      const optimalDays = ['Tuesday', 'Wednesday', 'Thursday'];
      if (content.dayOfWeek && optimalDays.includes(content.dayOfWeek)) {
        score += 5;
        factors.push({ factor: 'Optimal posting day', impact: 'positive', weight: 5 });
      }

      if (content.length) {
        if (content.type === 'video' && content.length > 60 && content.length < 180) {
          score += 10;
          factors.push({ factor: 'Optimal video length (60-180s)', impact: 'positive', weight: 10 });
        } else if (content.type === 'text' && content.length > 100 && content.length < 300) {
          score += 5;
          factors.push({ factor: 'Optimal text length', impact: 'positive', weight: 5 });
        }
      }

      if (this.historicalData) {
        const topicMatch = this.historicalData.topPerformingTopics.some(
          t => content.topic.toLowerCase().includes(t.toLowerCase())
        );
        if (topicMatch) {
          score += 15;
          factors.push({ factor: 'Historical topic performance', impact: 'positive', weight: 15 });
        }
      }

      score = Math.max(0, Math.min(100, score));

      const viralProbability: 'low' | 'medium' | 'high' | 'viral' =
        score >= 90 ? 'viral' : score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';

      const potentialReach = Math.floor(score * 1000 * (Math.random() * 5 + 1));
      const engagementPrediction = Math.floor(potentialReach * (score / 100) * 0.1);

      const recommendations: string[] = [];
      if (!content.hasCTA) recommendations.push('Add a clear call-to-action');
      if (!content.hasEmoji) recommendations.push('Include relevant emojis to increase engagement');
      if (content.type !== 'video') recommendations.push('Consider video format for higher viral potential');
      if (content.hashtags.length < 5) recommendations.push('Use more relevant hashtags including trending ones');
      if (viralProbability === 'low') recommendations.push('Consider revising content for better viral potential');

      return {
        success: true,
        viralScore: score,
        potentialReach,
        engagementPrediction,
        viralProbability,
        factors,
        recommendations,
      };
    } catch (error) {
      return { success: false, viralScore: 0, potentialReach: 0, engagementPrediction: 0, viralProbability: 'low' as const, factors: [], recommendations: [], error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  static async analyzeHistoricalTrends(
    contentHistory: { type: string; topic: string; engagement: number; postedAt: string }[]
  ): Promise<{ success: boolean; insights: HistoricalPerformance; error?: string }> {
    try {
      logger.info('[PredictiveViralService] Analyzing historical trends', {});

      const avgEngagement = contentHistory.reduce((a, b) => a + b.engagement, 0) / contentHistory.length;
      const topicGroups: Record<string, number[]> = {};
      
      contentHistory.forEach(c => {
        if (!topicGroups[c.topic]) topicGroups[c.topic] = [];
        topicGroups[c.topic].push(c.engagement);
      });

      const topPerformingTopics = Object.entries(topicGroups)
        .sort((a, b) => Math.max(...b[1]) - Math.max(...a[1]))
        .slice(0, 5)
        .map(([topic]) => topic);

      const insights: HistoricalPerformance = {
        avgLikes: Math.floor(avgEngagement * 0.8),
        avgComments: Math.floor(avgEngagement * 0.1),
        avgShares: Math.floor(avgEngagement * 0.1),
        avgEngagement: Math.floor(avgEngagement),
        topPerformingTopics,
        bestPostingTimes: ['9:00 AM', '12:00 PM', '6:00 PM'],
        bestDays: ['Tuesday', 'Wednesday', 'Thursday'],
      };

      await this.setHistoricalData(insights);
      return { success: true, insights };
    } catch (error) {
      return { success: false, insights: { avgLikes: 0, avgComments: 0, avgShares: 0, avgEngagement: 0, topPerformingTopics: [], bestPostingTimes: [], bestDays: [] }, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}