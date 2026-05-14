export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { kvGet, kvSet } from '@/lib/services/puterService';

const BRAND_KIT_KEY = 'brand_kit';

export async function GET() {
  try {
    const brandKit = await kvGet(BRAND_KIT_KEY);
    return NextResponse.json({
      brandKit: brandKit ? JSON.parse(brandKit) : null,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load brand' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();

      if (!body.niche) {
        return NextResponse.json({ error: 'Niche is required' }, { status: 400 });
      }

      const brandKit = {
        niche: body.niche,
        brandName: body.brandName || body.niche,
        targetAudience: body.targetAudience || body.audience || '',
        tone: body.tone || 'professional',
        characterLock: body.characterLock || body.character || '',
        styleRules: body.styleRules || body.writingStyle || body.style || '',
        contentPillars: body.contentPillars || body.pillars || [],
        bannedTopics: body.bannedTopics || [],
        platformPreferences: body.platformPreferences || {},
        examples: body.examples || [],
        voiceGuidelines: body.voiceGuidelines || '',
        hashtags: body.hashtags || [],
        ctaStyles: body.ctaStyles || [],
        postingFrequency: body.postingFrequency || {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await kvSet(BRAND_KIT_KEY, JSON.stringify(brandKit));

      return NextResponse.json({
        success: true,
        brandKit,
        message: 'Brand context saved! I will now use this for all responses.',
      });
    } catch (error) {
      console.error('[BrandContext] Error:', error);
      return NextResponse.json({ error: 'Failed to save brand' }, { status: 500 });
    }
  });
}

export async function DELETE(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      await kvSet(BRAND_KIT_KEY, '');
      return NextResponse.json({ success: true, message: 'Brand context cleared' });
    } catch (error) {
      return NextResponse.json({ error: 'Failed to clear brand' }, { status: 500 });
    }
  });
}