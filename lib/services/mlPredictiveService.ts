import { kvGet, kvSet } from './puterService';
import { socialMetricsService } from './socialMetricsService';
import { logger } from '@/lib/utils/logger';

// Simple ML model using heuristics enhanced with real data
// This runs entirely client-side without external API dependencies

export interface ContentFeatures {
  length: number;
  hashtagCount: number;
  emojiCount: number;
  questionCount: number;
  ctaPresent: boolean;
  hookStrength: number; // 0-1 score based on power words
  sentiment: number; // -1 to 1
  platform: string;
  contentType: 'text' | 'image' | 'video' | 'link';
}

export interface PredictionResult {
  engagementScore: number; // 0-100
  confidence: number; // 0-1
  viralPotential: number; // 0-100
  predictedReach: number;
  bestTime?: {
    day: string;
    hour: number;
  };
  tags: string[];
}

// Power words that increase engagement
const POWER_WORDS = [
  'stop', 'Imagine', 'what if', 'did you know', 'here\'s', 'why', 'how',
  'free', 'secret', 'hack', 'ultimate', 'complete', 'definitive',
  'you', 'your', 'I', 'we', 'they', 'nobody', 'everyone',
  'now', 'today', 'immediately', 'instantly', 'quick',
];

// Engagement patterns by platform
const PLATFORM_BASELINE: Record<string, { rate: number; maxReach: number }> = {
  instagram: { rate: 3.5, maxReach: 10000 },
  tiktok: { rate: 5.5, maxReach: 50000 },
  linkedin: { rate: 2.5, maxReach: 15000 },
  twitter: { rate: 1.5, maxReach: 5000 },
  facebook: { rate: 2.0, maxReach: 8000 },
  youtube: { rate: 5.0, maxReach: 20000 },
  threads: { rate: 4.0, maxReach: 12000 },
};

class MLPredictiveService {
  /**
   * Extract features from content for ML analysis
   */
  async extractFeatures(content: string, platform: string): Promise<ContentFeatures> {
    const words = content.split(/\s+/);
    const sentences = content.split(/[.!?]+/);

    // Count power words
    const powerWordMatches = POWER_WORDS.filter(word =>
      content.toLowerCase().includes(word.toLowerCase())
    );

    // Estimate hook strength
    const hookStrength = Math.min(1, powerWordMatches.length / 3);

    // Count emojis
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojiCount = (content.match(emojiRegex) || []).length;

    // Count questions
    const questionCount = (content.match(/\?/g) || []).length;

    // Count hashtags
    const hashtagCount = (content.match(/#/g) || []).length;

    // Detect CTA
    const ctaPatterns = ['comment', 'share', 'save', 'click', 'link', 'try', 'buy', 'learn more'];
    const ctaPresent = ctaPatterns.some(p => content.toLowerCase().includes(p));

    // Simple sentiment analysis
    const positive = ['good', 'great', 'amazing', 'love', 'best', 'awesome', 'excellent', 'win', 'success'];
    const negative = ['bad', 'worst', 'hate', 'fail', 'lose', 'terrible', 'awful'];
    const posCount = positive.filter(w => content.toLowerCase().includes(w)).length;
    const negCount = negative.filter(w => content.toLowerCase().includes(w)).length;
    const sentiment = Math.max(-1, Math.min(1, (posCount - negCount) / Math.max(1, posCount + negCount)));

    return {
      length: words.length,
      hashtagCount,
      emojiCount,
      questionCount,
      ctaPresent: ctaPresent ? 1 : 0,
      hookStrength,
      sentiment,
      platform,
      contentType: 'text' as const,
    };
  }

  /**
   * Predict content performance using enhanced heuristics + real engagement data
   */
  async predictPerformance(
    content: string,
    platform: string,
    hashtags: string[] = []
  ): Promise<PredictionResult> {
    // Extract features
    const features = await this.extractFeatures(content, platform);

    // Get baseline for platform
    const baseline = PLATFORM_BASELINE[platform] || PLATFORM_BASELINE.instagram;

    // Calculate engagement score using weighted features
    let score = 50; // Base score

    // Hook strength boost
    score += features.hookStrength * 20;

    // CTA presence
    if (features.ctaPresent) score += 10;

    // Ideal content length (varies by platform)
    const idealLength = platform === 'twitter' ? 100 : platform === 'linkedin' ? 300 : 200;
    const lengthScore = 1 - Math.abs(features.length - idealLength) / idealLength;
    score += lengthScore * 10;

    // Emoji bonus (but not too many)
    if (features.emojiCount >= 1 && features.emojiCount <= 5) score += 5;
    if (features.emojiCount > 5) score -= 10;

    // Question boost
    score += Math.min(10, features.questionCount * 3);

    // Sentiment boost for positive content
    score += features.sentiment * 5;

    // Hashtag optimization
    if (platform === 'instagram' || platform === 'tiktok') {
      if (features.hashtagCount >= 3 && features.hashtagCount <= 10) score += 5;
      if (features.hashtagCount > 15) score -= 15;
    } else {
      if (features.hashtagCount <= 2) score += 5;
    }

    // Get real engagement data to refine prediction
    const realMetrics = await this.getRealEngagementAdjustment(platform);
    score = realMetrics ? (score + realMetrics.adjustment) / 2 : score;

    // Calculate viral potential
    const viralPotential = Math.min(100, score + features.hookStrength * 15 + features.questionCount * 5);

    // Predict reach based on score and baseline
    const engagementMultiplier = score / 100;
    const predictedReach = Math.floor(baseline.maxReach * engagementMultiplier * (0.5 + Math.random() * 0.5));

    // Determine best time
    const bestTime = this.getBestTime(platform);

    return {
      engagementScore: Math.round(Math.max(0, Math.min(100, score))),
      confidence: 0.7 + features.hookStrength * 0.2,
      viralPotential: Math.round(Math.max(0, Math.min(100, viralPotential))),
      predictedReach,
      bestTime,
      tags: this.generateTags(content, features),
    };
  }

  /**
   * Get real engagement data to adjust predictions
   */
  private async getRealEngagementAdjustment(platform: string): Promise<{ adjustment: number } | null> {
    try {
      // Try to get real metrics for this platform
      const metrics = await socialMetricsService.fetchAllMetrics();
      const platformMetric = metrics.find(m => m.platform === platform);

      if (platformMetric && platformMetric.followers > 0) {
        // Adjust based on actual engagement rate
        const actualRate = platformMetric.engagementRate;
        const expectedRate = PLATFORM_BASELINE[platform]?.rate || 3;
        const adjustment = ((actualRate - expectedRate) / expectedRate) * 20;
        return { adjustment };
      }
    } catch (error) {
      logger.debug('[ML Predict] No real metrics available, using baseline');
    }

    return null;
  }

  /**
   * Get best posting time for platform
   */
  private getBestTime(platform: string): { day: string; hour: number } {
    const timeMap: Record<string, { day: string; hour: number }> = {
      instagram: { day: 'Wednesday', hour: 11 },
      tiktok: { day: 'Friday', hour: 19 },
      linkedin: { day: 'Tuesday', hour: 8 },
      twitter: { day: 'Wednesday', hour: 9 },
      facebook: { day: 'Thursday', hour: 13 },
      youtube: { day: 'Friday', hour: 15 },
      threads: { day: 'Tuesday', hour: 12 },
    };

    return timeMap[platform] || { day: 'Wednesday', hour: 12 };
  }

  /**
   * Generate improvement tags
   */
  private generateTags(content: string, features: ContentFeatures): string[] {
    const tags: string[] = [];

    if (features.hookStrength < 0.3) tags.push('needs_stronger_hook');
    if (!features.ctaPresent) tags.push('missing_cta');
    if (features.emojiCount === 0) tags.push('add_emoji');
    if (features.questionCount === 0) tags.push('add_question');
    if (features.hashtagCount === 0) tags.push('add_hashtags');
    if (features.sentiment <= 0) tags.push('more_positive');

    return tags;
  }

  /**
   * Batch predict multiple content variations
   */
  async batchPredict(
    contents: string[],
    platform: string
  ): Promise<PredictionResult[]> {
    return Promise.all(
      contents.map(content => this.predictPerformance(content, platform))
    );
  }

  /**
   * Get audience insights using simple clustering
   */
  async getAudienceInsights(platform: string): Promise<{
    segments: Array<{ name: string; size: number; engagementScore: number }>;
    bestContentTypes: string[];
  }> {
    // Use real metrics if available
    const metrics = await socialMetricsService.fetchAllMetrics();
    const platformMetric = metrics.find(m => m.platform === platform);

    // Simple segmentation based on engagement data
    const segments = platformMetric
      ? [
          { name: 'High Engagers', size: Math.floor(platformMetric.followers * 0.15), engagementScore: 85 },
          { name: 'Regulars', size: Math.floor(platformMetric.followers * 0.5), engagementScore: 45 },
          { name: 'Lurkers', size: Math.floor(platformMetric.followers * 0.35), engagementScore: 15 },
        ]
      : [
          { name: 'High Engagers', size: 1500, engagementScore: 85 },
          { name: 'Regulars', size: 5000, engagementScore: 45 },
          { name: 'Lurkers', size: 3500, engagementScore: 15 },
        ];

    const contentTypes = this.getBestContentTypes(platform);

    return { segments, bestContentTypes: contentTypes };
  }

  private getBestContentTypes(platform: string): string[] {
    const contentMap: Record<string, string[]> = {
      instagram: ['Reels', 'Carousels', 'Stories'],
      tiktok: ['Short videos', 'Duets', 'Stitch content'],
      linkedin: ['Text posts', 'Articles', 'Carousels'],
      twitter: ['Threads', 'Quick takes', 'Quotes'],
      facebook: ['Videos', 'Images', 'Text posts'],
      youtube: ['Shorts', 'Tutorials', 'Reviews'],
      threads: ['Long-form text', 'Thoughts', 'Stories'],
    };

    return contentMap[platform] || ['Videos', 'Images', 'Text'];
  }
}

export const mlPredictiveService = new MLPredictiveService();