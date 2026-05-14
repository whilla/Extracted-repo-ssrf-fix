import { NextRequest, NextResponse } from 'next/server';
import { RegionalContentFilterService } from '@/lib/services/regionalContentFilterService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { schemas, validateRequest } from '@/lib/utils/validation';

/**
 * API endpoint for content compliance and regional filtering
 * 
 * POST /api/compliance
 * - Filter content for regional compliance
 * - Check for blocked topics, words, and restrictions
 * - Validated input with Zod schemas
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    const validation = await validateRequest(request, schemas.compliance);
    if (!validation.success) {
      return validation.response;
    }

    const { content, regions } = validation.data;

    try {
      const result = await RegionalContentFilterService.filterContent(content, regions);

      return NextResponse.json({
        success: result.success,
        isAllowed: result.isAllowed,
        modifications: result.modifications,
        regions: result.regions,
        contentWarnings: result.contentWarnings
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to filter content' },
        { status: 500 }
      );
    }
  });
}

/**
 * GET /api/compliance
 * - Get list of supported regions
 */
export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const regions = await RegionalContentFilterService.getSupportedRegions();
      
      const results = await Promise.allSettled(regions.map(async (r: string) => {
        const check = await RegionalContentFilterService.checkRegion(r as any);
        return { region: r, ...check };
      }));

      const filters = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);

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
