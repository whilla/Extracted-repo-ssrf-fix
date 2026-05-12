import { NextRequest, NextResponse } from 'next/server';
import { AudienceBehaviorService } from '@/lib/services/audienceBehaviorService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for audience behavior analysis and engagement prediction
 * 
 * POST /api/audience
 * - Analyze audience across platforms
 * - Get engagement insights and recommendations
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { platform = 'instagram' } = body;

      const result = await AudienceBehaviorService.analyzeAudience(platform);

      return NextResponse.json({
        success: result.success,
        segments: result.segments,
        insights: result.insights,
        recommendations: result.recommendations
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to analyze audience' },
        { status: 500 }
      );
    }
  });
}

/**
 * GET /api/audience/segments/:segmentId
 * - Get recommendations for a specific segment
 */
export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const segmentId = searchParams.get('segmentId');

      if (!segmentId) {
        return NextResponse.json(
          { success: false, error: 'segmentId is required' },
          { status: 400 }
        );
      }

      const result = await AudienceBehaviorService.getContentRecommendations(segmentId);

      return NextResponse.json({
        success: result.success,
        recommendations: result.recommendations
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to get recommendations' },
        { status: 500 }
      );
    }
  });
}
