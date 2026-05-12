import { NextRequest, NextResponse } from 'next/server';
import { RegionalContentFilterService } from '@/lib/services/regionalContentFilterService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for regional content filtering details
 * 
 * POST /api/compliance/region
 * - Filter content for a specific region
 * 
 * GET /api/compliance/region
 * - Get supported regions with restrictions
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { content, region } = body;

      if (!content || !region) {
        return NextResponse.json(
          { success: false, error: 'content and region are required' },
          { status: 400 }
        );
      }

      const result = await RegionalContentFilterService.checkRegion(region);

      return NextResponse.json({
        success: true,
        ...result,
        contentLength: content.length
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to check region' },
        { status: 500 }
      );
    }
  });
}

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const regions = await RegionalContentFilterService.getSupportedRegions();
      
      const filters = await Promise.all(regions.map(async r => {
        const check = await RegionalContentFilterService.checkRegion(r);
        return { region: r, ...check };
      }));

      return NextResponse.json({
        success: true,
        regions: filters
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to get regions' },
        { status: 500 }
      );
    }
  });
}
