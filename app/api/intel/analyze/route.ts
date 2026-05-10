import { NextRequest, NextResponse } from 'next/server';
import { competitiveIntelService } from '@/lib/services/competitiveIntelService';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'Competitor URL is required' }, { status: 400 });
    }

    // Perform the strategic audit
    const analysis = await competitiveIntelService.analyzeCompetitor(url);

    return NextResponse.json({
      success: true,
      analysis
    });
  } catch (error: any) {
    console.error('[IntelRoute] Error analyzing competitor:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'An unexpected error occurred during the audit' 
    }, { status: 500 });
  }
}
