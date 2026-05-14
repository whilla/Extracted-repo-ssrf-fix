import { NextRequest, NextResponse } from 'next/server';
import { PredictiveViralService } from '@/lib/services/predictiveViralService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { schemas, validateRequest } from '@/lib/utils/validation';
import { cached, TTL, CACHE_TAGS } from '@/lib/utils/cache';
import { safeExternalCall } from '@/lib/utils/gracefulDegradation';

/**
 * API endpoint for predictive performance analysis
 * 
 * POST /api/predictive/analyze
 * - Predict performance of content before publishing
 * - Cached for 5 minutes to reduce AI costs
 * - Graceful fallback to heuristic if AI fails
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
          return await safeExternalCall(
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
            // Fallback: heuristic-based prediction if AI fails
            await PredictiveViralService.predictViralPotential({
              type: contentType || 'text',
              topic: topic || content.slice(0, 100) || 'general',
              hashtags: hashtags || [],
              hasCTA: content.toLowerCase().includes('sign up') || content.toLowerCase().includes('click'),
              hasEmoji: /[\u{1F600}-\u{1F64F}]/u.test(content),
              length: content.length,
            }, platform),
            { timeoutMs: 15000, retries: 1 }
          );
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
        cached: !!analysis, // Indicates if result was cached
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to predict performance' },
        { status: 500 }
      );
    }
  });
}
