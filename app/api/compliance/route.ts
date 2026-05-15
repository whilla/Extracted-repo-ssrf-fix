import { NextRequest, NextResponse } from 'next/server';
import { RegionalContentFilterService } from '@/lib/services/regionalContentFilterService';
import { copyrightComplianceService } from '@/lib/services/copyrightComplianceService';
import { geoIPService } from '@/lib/services/geoIPService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { schemas, validateRequest } from '@/lib/utils/validation';

/**
 * API endpoint for content compliance and regional filtering
 * 
 * POST /api/compliance
 * - Filter content for regional compliance
 * - Check for blocked topics, words, and restrictions
 * - Auto-detect region via GeoIP if not specified
 * - Validated input with Zod schemas
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    const validation = await validateRequest(request, schemas.compliance);
    if (!validation.success) {
      return validation.response;
    }

    let { content, regions, action, autoDetect } = validation.data;

    // Auto-detect region if requested or no region specified
    if (autoDetect || !regions || regions.length === 0) {
      try {
        const detectedRegion = await geoIPService.detectRegion(request);
        regions = [detectedRegion];
      } catch {
        regions = ['us']; // Fallback
      }
    }

    try {
      switch (action) {
        case 'verify_copyright':
          // Check for copyright/trademark issues
          const verification = await copyrightComplianceService.verifyContent(content);
          return NextResponse.json({
            success: verification.isChecked,
            issues: verification.issues,
            confidence: verification.confidence,
          });

        case 'check_fair_use':
          const fairUse = await copyrightComplianceService.checkFairUse(
            content,
            validation.data.purpose || 'commercial'
          );
          return NextResponse.json({
            success: true,
            isFairUse: fairUse.isFairUse,
            score: fairUse.score,
            factors: fairUse.factors,
          });

        case 'generate_alternatives':
          const alternatives = await copyrightComplianceService.generateAlternatives(content);
          return NextResponse.json({
            success: true,
            alternatives,
          });

        default:
          // Regional filtering
          const result = await RegionalContentFilterService.filterContent(content, regions);

          return NextResponse.json({
            success: result.success,
            isAllowed: result.isAllowed,
            modifications: result.modifications,
            regions: result.regions,
            contentWarnings: result.contentWarnings
          });
      }
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
 * - ?detect=true to auto-detect user's region
 */
export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const searchParams = request.nextUrl.searchParams;
      const detect = searchParams.get('detect') === 'true';

      if (detect) {
        // Auto-detect user's region
        const region = await geoIPService.detectRegion(request);
        return NextResponse.json({
          success: true,
          detectedRegion: region,
        });
      }

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
