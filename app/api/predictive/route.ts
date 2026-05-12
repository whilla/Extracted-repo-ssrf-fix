import { NextRequest, NextResponse } from 'next/server';
import { PredictiveViralService } from '@/lib/services/predictiveViralService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for predictive performance analysis
 * 
 * POST /api/predictive/analyze
 * - Predict performance of content before publishing
 * - Get engagement scores and confidence levels
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { content, platform = 'instagram', contentType = 'text', hashtags, topic } = body;

      const analysis = await PredictiveViralService.predictViralPotential({
        type: contentType as any,
        topic: topic || content?.slice(0, 100) || 'general',
        hashtags: hashtags || [],
        hasCTA: content?.toLowerCase().includes('sign up') || content?.toLowerCase().includes('click'),
        hasEmoji: /[\u{1F600}-\u{1F64F}]/u.test(content || ''),
      }, platform);

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
        contentTips: analysis.recommendations
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to predict performance' },
        { status: 500 }
      );
    }
  });
}
