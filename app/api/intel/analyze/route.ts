import { NextRequest, NextResponse } from 'next/server';
import { CompetitiveIntelService } from '@/lib/services/competitiveIntelService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

export async function POST(req: NextRequest) {
  return withApiMiddleware(req, async () => {
    try {
      const { url, competitorNames, type = 'analyze' } = await req.json();

      if (!url && !competitorNames) {
        return NextResponse.json({ error: 'Competitor URL or competitorNames required' }, { status: 400 });
      }

      let analysis;
      if (url) {
        analysis = {
          url: url,
          message: 'URL-based analysis queued. Full results require competitor names for deep analysis.',
          competitorNames: competitorNames || [],
        };
      } else if (competitorNames && competitorNames.length > 0) {
        const result = await CompetitiveIntelService.analyzeCompetitors(competitorNames, 'instagram');
        analysis = result;
      } else {
        return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        analysis
      });
    } catch (error: any) {
      console.error('[IntelRoute] Error analyzing competitor:', error);
      return NextResponse.json({ 
        success: false, 
        error: error.message || 'An unexpected error occurred during the analysis' 
      }, { status: 500 });
    }
  });
}
