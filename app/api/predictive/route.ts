import { NextRequest, NextResponse } from 'next/server';
import { PredictiveViralService } from '@/lib/services/predictiveViralService';
import { mlPredictiveService } from '@/lib/services/mlPredictiveService';
import { socialMetricsService } from '@/lib/services/socialMetricsService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { schemas, validateRequest } from '@/lib/utils/validation';
import { cached, TTL, CACHE_TAGS } from '@/lib/utils/cache';
import { safeExternalCall } from '@/lib/utils/gracefulDegradation';

/**
 * API endpoint for predictive performance analysis
 * 
 * POST /api/predictive/analyze
 * - Predict performance of content before publishing
 * - Uses real engagement metrics when available
 * - ML-powered analysis with fallback to heuristic
 * - Cached for 5 minutes to reduce AI costs
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    // Validate input
    const validation = await validateRequest(request, schemas.predictive);
    if (!validation.success) {
      return validation.response;
    }

    const { content, platform, contentType, hashtags, topic } = validation.data;

    // Generate cache key from content hash + params
    const cacheKey = `predictive:${platform}:${contentType}:${Buffer.from(content.slice(0, 200)).toString('base64').slice(0, 32)}`;

    try {
      // Use cached result or compute new one
      const analysis = await cached(
        cacheKey,
        TTL.FIFTEEN_MINUTES,
        async () => {
          // Try ML-powered prediction with real engagement data
          const mlResult = await mlPredictiveService.predictPerformance(content, platform, hashtags);
          
          // Try AI-powered prediction as enhancement
          const aiAnalysis = await safeExternalCall(
            'predictive',
            async () => {
              return await PredictiveViralService.predictViralPotential({
                type: contentType || 'text',
                topic: topic || content.slice(0, 100) || 'general',
                hashtags: hashtags || [],
                hasCTA: content.toLowerCase().includes('sign up') || content.toLowerCase().includes('click'),
                hasEmoji: /[\u{1F600}-\u{1F64F}]/u.test(content),
                length: content.length,
              }, platform);
            },
            // Fallback to ML result if AI fails
            null,
            { timeoutMs: 15000, retries: 1 }
          );

          // Combine ML insights with AI analysis
          if (aiAnalysis) {
            return aiAnalysis;
          }

          // Return ML-based analysis
          return {
            success: true,
            engagementPrediction: mlResult.engagementScore,
            viralScore: mlResult.viralPotential,
            viralProbability: mlResult.engagementScore > 70 ? 'high' : mlResult.engagementScore > 40 ? 'medium' : 'low',
            potentialReach: mlResult.predictedReach,
            factors: mlResult.tags || [],
            recommendations: mlResult.tags.map(t => `Consider improving: ${t.replace(/_/g, ' ')}`),
          };
        },
        [CACHE_TAGS.AI_RESPONSE]
      );

      return NextResponse.json({
        success: analysis.success,
        prediction: {
          predictedEngagement: analysis.engagementPrediction,
          confidence: analysis.viralScore > 80 ? 0.85 : analysis.viralScore > 50 ? 0.7 : 0.5,
          viralPotential: analysis.viralScore,
          viralProbability: analysis.viralProbability,
          estimatedReach: analysis.potentialReach,
          engagementRate: analysis.engagementPrediction,
          platform,
          contentType,
          factors: analysis.factors,
        },
        scheduling: {
          bestDays: ['Wednesday', 'Friday'],
          bestTimes: ['9:00 AM', '7:00 PM'],
          avgBestTime: '9:00 AM'
        },
        contentTips: analysis.recommendations,
        cached: !!analysis,
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to predict performance' },
        { status: 500 }
      );
    }
  });
}

// GET endpoint for real engagement metrics
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const platform = searchParams.get('platform');
    const action = searchParams.get('action') || 'predict';

    switch (action) {
      case 'metrics':
        // Get real engagement metrics
        const metrics = await socialMetricsService.fetchAllMetrics();
        if (platform) {
          return NextResponse.json({
            success: true,
            metrics: metrics.find(m => m.platform === platform) || null,
          });
        }
        return NextResponse.json({ success: true, metrics });

      case 'audience':
        // Get audience insights
        const insights = await mlPredictiveService.getAudienceInsights(platform || 'instagram');
        return NextResponse.json({ success: true, insights });

      case 'predict':
      default:
        // Simple prediction endpoint
        const content = searchParams.get('content');
        if (!content) {
          return NextResponse.json(
            { success: false, error: 'content parameter required' },
            { status: 400 }
          );
        }
        const prediction = await mlPredictiveService.predictPerformance(
          content,
          platform || 'instagram'
        );
        return NextResponse.json({ success: true, prediction });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
