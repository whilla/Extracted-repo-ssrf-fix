'use client';

import { sentimentService, SentimentReport } from './sentimentService';
import { repurposingService } from './repurposingService';
import { kvGet, kvSet } from './puterService';

export interface TriggerConfig {
  sentimentThreshold: number; // e.g., 0.7 for "Very Positive"
  volumeThreshold: number;    // e.g., 50 comments to consider it a "spike"
  cooldownPeriod: number;     // ms to prevent duplicate triggers for same post
}

export const intelligenceTriggerService = {
  config: {
    sentimentThreshold: 0.6,
    volumeThreshold: 20,
    cooldownPeriod: 24 * 60 * 60 * 1000, // 24 hours
  },

  /**
   * Evaluates a sentiment report to see if it should trigger an amplification campaign.
   */
  async evaluateAndTrigger(report: SentimentReport): Promise<{ triggered: boolean; reason?: string }> {
    const { postId, overallSentiment, sampleCount } = report;

    // 1. Check Cooldown: Avoid spamming campaigns for the same post
    const lastTriggered = await kvGet(`trigger_cooldown_${postId}`);
    if (lastTriggered && (Date.now() - parseInt(lastTriggered)) < this.config.cooldownPeriod) {
      return { triggered: false, reason: 'Post is in cooldown period' };
    }

    // 2. Sentiment Check: Is the mood overwhelmingly positive/exciting?
    const isPositive = overallSentiment.score >= this.config.sentimentThreshold;
    const isExciting = overallSentiment.emotions.excitement > 0.5;

    // 3. Volume Check: Is there enough data to justify a "trend"?
    const hasVolume = sampleCount >= this.config.volumeThreshold;

    if ((isPositive || isExciting) && hasVolume) {
      console.log(`[IntelligenceTrigger] VIRAL MOMENTUM DETECTED for ${postId}. Triggering amplification...`);
      
      // Execute the amplification pipeline
      await this.triggerAmplification(postId, report);
      
      // Set cooldown
      await kvSet(`trigger_cooldown_${postId}`, Date.now().toString());
      
      return { 
        triggered: true, 
        reason: `Viral momentum detected: Score ${overallSentiment.score.toFixed(2)}, Volume ${sampleCount}` 
      };
    }

    return { triggered: false, reason: 'Thresholds not met' };
  },

  /**
   * Automatically repurposes the high-performing content.
   */
  async triggerAmplification(postId: string, report: SentimentReport): Promise<void> {
    try {
      // In a real scenario, we would fetch the actual post text using directReaderService
      // For now, we use the core message distilled from the sentiment report
      const masterContent = `[VIRAL POST ${postId}] Analysis: ${report.overallSentiment.label}. 
      Key Insights: ${report.actionableInsights.join(' ')}`;

      const platforms = ['Twitter', 'LinkedIn', 'TikTok', 'Instagram', 'Facebook'];
      
      const campaign = await repurposingService.repurpose({
        masterContent,
        platforms,
        toneAdjustment: 'Amplify the winning energy of the original post. Double down on the excitement.'
      });

      // Save this "Momentum Campaign" as a draft for the user
      await kvSet(`momentum_campaign_${postId}`, JSON.stringify({
        originalPostId: postId,
        campaign,
        triggeredAt: new Date().toISOString(),
        status: 'draft'
      }));

      console.log(`[IntelligenceTrigger] Momentum campaign drafted for ${postId}`);
    } catch (error) {
      console.error('[IntelligenceTrigger] Amplification failed:', error);
    }
  }
};
