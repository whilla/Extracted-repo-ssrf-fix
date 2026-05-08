/**
 * VIRAL ANALYTICS SERVICE
 * Transforms individual viral scores into long-term trends and intelligence
 * 
 * Responsibilities:
 * - Track score distributions across providers and agents
 * - Identify high-performing "viral windows" (time, platform)
 * - Aggregate brand-specific quality metrics
 * - Provide data for the LearningSystem to optimize prompts
 */

import { kvGet, kvSet } from '../services/puterService';
import { ViralScore } from './ViralScoringEngine';

export interface ViralTrend {
  platform: string;
  avgScore: number;
  growthRate: number;
  topPerformingHooks: string[];
  dominantEmotionalTriggers: string[];
}

export interface ProviderPerformance {
  sum: number;
  count: number;
  successCount: number;
}

export interface AgentPerformance {
  sum: number;
  count: number;
  successCount: number;
}

export interface TopContentItem {
  content: string;
  score: number;
  provider: string;
}

export interface QualityReport {
  totalAnalyses: number;
  overallAvgScore: number;
  providerPerformance: Record<string, { avgScore: number; successRate: number }>;
  agentPerformance: Record<string, { avgScore: number; successRate: number }>;
  topViralContent: TopContentItem[];
}

export class ViralAnalyticsService {
  private storageKey = 'nexus_viral_insights_v1';

  /**
   * Record a new scored output and update aggregate analytics
   */
  async recordResult(
    agentId: string, 
    providerId: string, 
    score: ViralScore, 
    content: string,
    platform: string
  ): Promise<void> {
    let success = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (!success && attempts < maxAttempts) {
      try {
        const history = await this.getHistory();
        
        history.push({
          timestamp: new Date().toISOString(),
          agentId,
          providerId,
          score: score.total,
          breakdown: score.breakdown,
          content,
          platform,
        });

        // Keep last 5000 results for trend analysis
        const trimmed = history.slice(-5000);
        await kvSet(this.storageKey, JSON.stringify(trimmed));
        success = true;
      } catch (error) {
        attempts++;
        console.error(`[ViralAnalyticsService] Attempt ${attempts} to record result failed:`, error);
        if (attempts >= maxAttempts) throw error;
        await new Promise(r => setTimeout(r, 100 * attempts));
      }
    }
  }

  /**
   * Generate a comprehensive quality report
   */
  async generateReport(): Promise<QualityReport> {
    const history = await this.getHistory();
    
    const total = history.length;
    if (total === 0) return this.createEmptyReport();

    const avgScore = history.reduce((sum, h) => sum + h.score, 0) / total;
    
    const providerPerf: Record<string, ProviderPerformance> = {};
    const agentPerf: Record<string, AgentPerformance> = {};
    const topContent: TopContentItem[] = [];

    history.forEach(h => {
      // Provider Perf
      if (!providerPerf[h.providerId]) {
        providerPerf[h.providerId] = { sum: 0, count: 0, successCount: 0 };
      }
      providerPerf[h.providerId].sum += h.score;
      providerPerf[h.providerId].count++;
      if (h.score >= 70) providerPerf[h.providerId].successCount++;

      // Agent Perf
      if (!agentPerf[h.agentId]) {
        agentPerf[h.agentId] = { sum: 0, count: 0, successCount: 0 };
      }
      agentPerf[h.agentId].sum += h.score;
      agentPerf[h.agentId].count++;
      if (h.score >= 70) agentPerf[h.agentId].successCount++;

      // Top content
      topContent.push({ content: h.content, score: h.score, provider: h.providerId });
    });

    const processedProviderPerf: Record<string, { avgScore: number; successRate: number }> = {};
    for (const id in providerPerf) {
      const p = providerPerf[id];
      processedProviderPerf[id] = {
        avgScore: Math.round(p.sum / p.count),
        successRate: Math.round((p.successCount / p.count) * 100),
      };
    }

    const processedAgentPerf: Record<string, { avgScore: number; successRate: number }> = {};
    for (const id in agentPerf) {
      const a = agentPerf[id];
      processedAgentPerf[id] = {
        avgScore: Math.round(a.sum / a.count),
        successRate: Math.round((a.successCount / a.count) * 100),
      };
    }

    return {
      totalAnalyses: total,
      overallAvgScore: Math.round(avgScore),
      providerPerformance: processedProviderPerf,
      agentPerformance: processedAgentPerf,
      topViralContent: topContent.sort((a, b) => b.score - a.score).slice(0, 10),
    };
  }

  /**
   * Extract viral trends for a specific platform
   */
  async getPlatformTrends(platform: string): Promise<ViralTrend> {
    const history = await this.getHistory();
    const platformData = history.filter(h => h.platform === platform);

    if (platformData.length === 0) {
      return {
        platform,
        avgScore: 0,
        growthRate: 0,
        topPerformingHooks: [],
        dominantEmotionalTriggers: [],
      };
    }

    const avgScore = platformData.reduce((sum, h) => sum + h.score, 0) / platformData.length;
    
    // Simple hook extraction (first line)
    const hooks = platformData
      .filter(h => h.score >= 80)
      .map(h => h.content.split('\n')[0]);

    return {
      platform,
      avgScore: Math.round(avgScore),
      growthRate: 0, // Would require time-series analysis
      topPerformingHooks: [...new Set(hooks)].slice(0, 10),
      dominantEmotionalTriggers: [], // Would require breakdown analysis
    };
  }

  private async getHistory(): Promise<any[]> {
    try {
      const data = await kvGet(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`[ViralAnalyticsService] Failed to load viral analytics history from ${this.storageKey}:`, error);
      return [];
    }
  }

  private createEmptyReport(): QualityReport {
    return {
      totalAnalyses: 0,
      overallAvgScore: 0,
      providerPerformance: {},
      agentPerformance: {},
      topViralContent: [],
    };
  }
}

export const viralAnalyticsService = new ViralAnalyticsService();
