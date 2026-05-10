import { aiService } from './aiService';
import { analyticsService } from './analyticsService';
import { analyticsIngestionService } from './analyticsIngestionService';
import { BrandKit } from '@/lib/types';
import { logger } from '@/lib/utils/logger';

export interface AnalyticsData {
  topContent: any[];
  pillarPerformance: Record<string, number>;
  engagementRates: Record<string, number>;
  retentionRates?: Record<string, number>;
  audienceDemographics?: Record<string, any>;
}

/**
 * MarketingInsightsService
 * Transforms raw analytics and engagement data into a high-level marketing strategy.
 * Bridges the gap between performance metrics and AI-driven content planning.
 */
export class MarketingInsightsService {
  /**
   * Synthesizes analytics data into a strategic report.
   * This is the "Deep Analytics" part that translates numbers into "What to do next".
   */
  async generateStrategicReport(brandKit: BrandKit): Promise<{
    summary: string;
    winningPatterns: string[];
    criticalGaps: string[];
    recommendations: string[];
    confidenceScore: number;
  }> {
    try {
      // 1. Fetch current analytics state
      const rawData = await analyticsService.fetchAnalytics(''); // Key handled internally by service
      
      // 2. Analyze winning content patterns
      const winningPatterns = await this.analyzeWinningPatterns(rawData.topContent);
      
      // 3. Identify gaps based on brand pillars vs actual performance
      const criticalGaps = await this.identifyContentGaps(brandKit, rawData.pillarPerformance);
      
      // 4. Generate final recommendations using AI
      const recommendations = await this.generateAIRecommendations(brandKit, rawData, winningPatterns, criticalGaps);

      return {
        summary: `Overall performance is trending ${this.calculateTrend(rawData.engagementRates)}, with ${winningPatterns.length} primary growth levers identified.`,
        winningPatterns,
        criticalGaps,
        recommendations,
        confidenceScore: this.calculateConfidence(rawData),
      };
    } catch (error) {
      logger.error('[MarketingInsightsService] Report generation failed:', error);
      throw error;
    }
  }

  private async analyzeWinningPatterns(topContent: any[]): Promise<string[]> {
    if (!topContent || topContent.length === 0) return ['Insufficient data to determine patterns.'];
    
    const prompt = `Analyze these top performing posts and identify the "Viral Genome" (hooks, pacing, emotional triggers, and structure).
    Content: ${JSON.stringify(topContent)}`;
    
    const response = await aiService.chat(prompt, 'claude-sonnet-4-5');
    return response.split(/\r?\n/).filter(line => line.trim().startsWith('•') || line.trim().startsWith('-'));
  }

  private async identifyContentGaps(brandKit: BrandKit, pillarPerformance: Record<string, number>): Promise<string[]> {
    const pillars = brandKit.contentPillars || [];
    const gaps = [];
    
    for (const pillar of pillars) {
      const perf = pillarPerformance[pillar] || 0;
      if (perf === 0) {
        gaps.push(`Pillar [${pillar}] is completely unrepresented in published content.`);
      } else if (perf < 2) {
        gaps.push(`Pillar [${pillar}] is under-represented (only ${perf} posts).`);
      }
    }
    
    return gaps.length > 0 ? gaps : ['No significant content gaps identified based on brand pillars.'];
  }

  private async generateAIRecommendations(
    brandKit: BrandKit, 
    data: any, 
    patterns: string[], 
    gaps: string[]
  ): Promise<string[]> {
    const prompt = `
      Based on the following data, provide 3 high-impact strategic pivots for the brand ${brandKit.brandName}.
      
      Winning Patterns: ${patterns.join(', ')}
      Critical Gaps: ${gaps.join(', ')}
      Current Engagement Rates: ${JSON.stringify(data.engagementRates)}
      
      Recommendations must be specific, actionable, and aligned with the tone: ${brandKit.tone}.
      Format as: [Pivot Name] -> [Actionable Step] -> [Expected Outcome]
    `;
    
    const response = await aiService.chat(prompt, 'claude-sonnet-4-5');
    return response.split(/\r?\n/).filter(line => line.trim().length > 0);
  }

  private calculateTrend(rates: Record<string, number>): string {
    const values = Object.values(rates);
    if (values.length === 0) return 'stable';
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return avg > 2 ? 'strong' : avg > 0.5 ? 'growing' : 'flat';
  }

  private calculateConfidence(data: any): number {
    const sampleSize = (data.topContent || []).length;
    return Math.min(100, Math.max(10, sampleSize * 10));
  }
}

export const marketingInsightsService = new MarketingInsightsService();
