import { NextRequest, NextResponse } from 'next/server';
import { CompetitiveIntelService } from '@/lib/services/competitiveIntelService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for competitive intelligence analysis
 * 
 * POST /api/intel/competitive
 * - Analyze competitors and identify gaps
 * - Get content recommendations
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { competitorNames, platform = 'instagram', type = 'analyze' } = body;

      if (!competitorNames || !competitorNames.length) {
        return NextResponse.json(
          { success: false, error: 'competitorNames array is required' },
          { status: 400 }
        );
      }

      let result;
      switch (type) {
        case 'analyze':
          result = await CompetitiveIntelService.analyzeCompetitors(competitorNames, platform);
          break;
        case 'track':
          if (competitorNames.length !== 1) {
            return NextResponse.json(
              { success: false, error: 'track requires exactly one competitor name' },
              { status: 400 }
            );
          }
          result = await CompetitiveIntelService.trackCompetitorContent(competitorNames[0], platform);
          break;
        case 'gap_analysis':
          result = await CompetitiveIntelService.getContentGapAnalysis(
            body.myContentTypes || [],
            body.competitorContentTypes || []
          );
          break;
        default:
          return NextResponse.json(
            { success: false, error: 'Invalid intel type' },
            { status: 400 }
          );
      }

      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to perform competitive analysis' },
        { status: 500 }
      );
    }
  });
}
