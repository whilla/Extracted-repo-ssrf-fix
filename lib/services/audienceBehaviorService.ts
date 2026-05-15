import { logger } from '@/lib/utils/logger';
import { aiService } from './aiService';
import { kvGet, kvSet, PATHS, readFile, writeFile, listFiles } from './puterService';
import type { ContentDraft } from '@/lib/types';

export interface AudienceSegment {
  id: string;
  name: string;
  size: number;
  demographics: {
    ageRange?: string;
    gender?: string;
    location?: string;
  };
  interests: string[];
  engagementPatterns: {
    preferredContentTypes: string[];
    bestTimes: string[];
    avgEngagement: number;
  };
  behaviorScore: number;
}

export interface BehaviorMappingResult {
  success: boolean;
  segments: AudienceSegment[];
  insights: {
    mostEngagedSegment: string;
    bestContentForSegment: Record<string, string>;
    optimalPostingSchedule: Record<string, string>;
    churnRisk: string[];
  };
  recommendations: string[];
  error?: string;
}

const AUDIENCE_DATA_PATH = `${PATHS.analytics}/audience_data.json`;

interface AudienceDataPoint {
  timestamp: string;
  platform: string;
  contentType: string;
  topic: string;
  engagement: number;
  impressions: number;
}

export class AudienceBehaviorService {
  static async analyzeAudience(
    platform: string = 'instagram'
  ): Promise<BehaviorMappingResult> {
    try {
      logger.info('[AudienceBehaviorService] Analyzing audience behavior', { platform });

      const publishedContent = await this.loadPublishedContent();
      const dataPoints = await this.loadAudienceDataPoints();

      const segments = this.deriveSegmentsFromData(publishedContent, dataPoints, platform);

      const insights = this.calculateInsights(segments, dataPoints);

      const recommendations = await this.generateRecommendations(segments, insights, platform);

      return { success: true, segments, insights, recommendations };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error', segments: [], insights: {} as any, recommendations: [] };
    }
  }

  private static async loadPublishedContent(): Promise<ContentDraft[]> {
    try {
      const files = await listFiles(PATHS.published);
      const drafts = await Promise.all(
        files
          .filter(f => f.name.endsWith('.json') && !f.is_dir)
          .map(f => readFile<ContentDraft>(`${PATHS.published}/${f.name}`, true))
      );
      return drafts.filter((d): d is ContentDraft => Boolean(d));
    } catch {
      return [];
    }
  }

  private static async loadAudienceDataPoints(): Promise<AudienceDataPoint[]> {
    try {
      const data = await readFile<AudienceDataPoint[]>(AUDIENCE_DATA_PATH, true);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  static async recordEngagement(dataPoint: AudienceDataPoint): Promise<void> {
    const points = await this.loadAudienceDataPoints();
    points.push(dataPoint);
    const trimmed = points.slice(-10000);
    await writeFile(AUDIENCE_DATA_PATH, JSON.stringify(trimmed));
  }

  private static deriveSegmentsFromData(
    drafts: ContentDraft[],
    dataPoints: AudienceDataPoint[],
    platform: string
  ): AudienceSegment[] {
    if (drafts.length === 0 && dataPoints.length === 0) {
      return [];
    }

    const topicClusters = new Map<string, { count: number; engagements: number[]; platforms: Set<string> }>();
    const contentTypes = new Map<string, number>();
    const postingHourCounts = new Map<number, number>();

    for (const draft of drafts) {
      const text = draft.versions?.[draft.currentVersion || 0]?.text || '';
      const tags = draft.tags || [];
      const platforms = draft.platforms || [];

      for (const tag of tags) {
        const existing = topicClusters.get(tag) || { count: 0, engagements: [], platforms: new Set() };
        existing.count++;
        platforms.forEach(p => existing.platforms.add(p));
        topicClusters.set(tag, existing);
      }

      const contentType = draft.contentType || 'text';
      contentTypes.set(contentType, (contentTypes.get(contentType) || 0) + 1);

      if (draft.publishedAt) {
        const hour = new Date(draft.publishedAt).getHours();
        postingHourCounts.set(hour, (postingHourCounts.get(hour) || 0) + 1);
      }
    }

    for (const dp of dataPoints) {
      if (dp.platform !== platform) continue;
      const existing = topicClusters.get(dp.topic) || { count: 0, engagements: [], platforms: new Set([platform]) };
      existing.engagements.push(dp.engagement);
      topicClusters.set(dp.topic, existing);
    }

    const segments: AudienceSegment[] = [];
    let segId = 0;
    const sortedClusters = Array.from(topicClusters.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6);

    for (const [topic, data] of sortedClusters) {
      segId++;
      const avgEngagement = data.engagements.length > 0
        ? Math.round((data.engagements.reduce((a, b) => a + b, 0) / data.engagements.length) * 10) / 10
        : 0;

      const bestHours = Array.from(postingHourCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([h]) => `${h > 12 ? h - 12 : h || 12}:00 ${h >= 12 ? 'PM' : 'AM'}`);

      segments.push({
        id: `seg_${segId}`,
        name: `${topic.charAt(0).toUpperCase() + topic.slice(1)} Audience`,
        size: data.count * 1000,
        demographics: {
          ageRange: '25-44',
          location: 'Global',
        },
        interests: [topic, ...Array.from(data.platforms).slice(0, 3)],
        engagementPatterns: {
          preferredContentTypes: Array.from(contentTypes.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([t]) => t),
          bestTimes: bestHours.length > 0 ? bestHours : [],
          avgEngagement,
        },
        behaviorScore: Math.min(99, Math.round(avgEngagement * 20)),
      });
    }

    return segments;
  }

  private static calculateInsights(
    segments: AudienceSegment[],
    dataPoints: AudienceDataPoint[]
  ): BehaviorMappingResult['insights'] {
    if (segments.length === 0) {
      return {
        mostEngagedSegment: 'N/A',
        bestContentForSegment: {},
        optimalPostingSchedule: {},
        churnRisk: [],
      };
    }

    const mostEngaged = segments.reduce((best, curr) =>
      curr.engagementPatterns.avgEngagement > best.engagementPatterns.avgEngagement ? curr : best
    );

    const bestContentForSegment: Record<string, string> = {};
    const optimalPostingSchedule: Record<string, string> = {};

    for (const seg of segments) {
      const types = seg.engagementPatterns.preferredContentTypes;
      bestContentForSegment[seg.name] = types.length > 0
        ? `${types[0].charAt(0).toUpperCase() + types[0].slice(1)}-focused content with ${seg.interests[0] || 'engaging'} themes`
        : 'Engaging visual content';

      const times = seg.engagementPatterns.bestTimes;
      const days = ['Mon', 'Wed', 'Fri'];
      optimalPostingSchedule[seg.name] = times.length > 0
        ? days.map((d, i) => `${d} ${times[i % times.length]}`).join(', ')
        : 'No optimal times derived yet';
    }

    const avgEngagement = segments.reduce((s, seg) => s + seg.engagementPatterns.avgEngagement, 0) / segments.length;
    const churnRisk = segments
      .filter(seg => seg.engagementPatterns.avgEngagement < avgEngagement * 0.5)
      .map(seg => seg.name);

    return {
      mostEngagedSegment: mostEngaged.name,
      bestContentForSegment,
      optimalPostingSchedule,
      churnRisk,
    };
  }

  private static async generateRecommendations(
    segments: AudienceSegment[],
    insights: BehaviorMappingResult['insights'],
    platform: string
  ): Promise<string[]> {
    const recommendations: string[] = [];

    if (segments.length === 0) {
      recommendations.push('Publish diverse content types to begin building audience segments');
      return recommendations;
    }

    recommendations.push(`Create segment-specific content for your ${segments.length} identified audience segments`);
    
    if (segments.length > 1) {
      recommendations.push(`Prioritize "${insights.mostEngagedSegment}" with higher-frequency posting`);
    }

    recommendations.push(`Schedule posts according to optimal times derived from ${platform} engagement data`);

    if (insights.churnRisk.length > 0) {
      recommendations.push(`Develop re-engagement campaigns for at-risk segments: ${insights.churnRisk.join(', ')}`);
    }

    try {
      const aiResponse = await aiService.chat(
        `Based on audience segments for ${platform}:
Segments: ${segments.map(s => `${s.name} (engagement: ${s.engagementPatterns.avgEngagement})`).join(', ')}

Generate 3 actionable content strategy recommendations. Return as JSON array of strings.`,
        { model: 'gpt-4o-mini' }
      );
      const parsed = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
      if (Array.isArray(parsed)) {
        recommendations.push(...parsed.slice(0, 3));
      }
    } catch {
      // AI enhancement optional
    }

    return recommendations;
  }

  static async predictSegmentEngagement(
    segmentId: string,
    contentType: string,
    topic: string
  ): Promise<{ success: boolean; predictedEngagement: number; confidence: number }> {
    try {
      logger.info('[AudienceBehaviorService] Predicting segment engagement', { segmentId, contentType, topic });

      try {
        const response = await aiService.chat(
          `Predict engagement rate (0-10 scale) and confidence (0-1) for:
Segment: ${segmentId}
Content type: ${contentType}
Topic: ${topic}

Return ONLY valid JSON: { "predictedEngagement": number, "confidence": number }`,
          { model: 'gpt-4o-mini' }
        );

        const parsed = JSON.parse(response.replace(/```json|```/g, '').trim());
        return {
          success: true,
          predictedEngagement: Math.max(0, Math.min(10, parsed.predictedEngagement || 3)),
          confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        };
      } catch {
        return {
          success: false,
          predictedEngagement: 0,
          confidence: 0,
        };
      }
    } catch (error) {
      return { success: false, predictedEngagement: 0, confidence: 0 };
    }
  }

  static async getContentRecommendations(
    segmentId: string
  ): Promise<{ success: boolean; recommendations: string[] }> {
    try {
      const response = await aiService.chat(
        `Generate 3 content recommendations for audience segment ${segmentId}. Return as JSON array of strings.`,
        { model: 'gpt-4o-mini' }
      );
      const parsed = JSON.parse(response.replace(/```json|```/g, '').trim());
      if (Array.isArray(parsed)) {
        return { success: true, recommendations: parsed.slice(0, 3) };
      }
      return { success: true, recommendations: [] };
    } catch {
      return { success: false, recommendations: [] };
    }
  }
}
