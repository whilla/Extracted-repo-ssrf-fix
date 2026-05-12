import { NextRequest, NextResponse } from 'next/server';
import { SpatialContentService } from '@/lib/services/spatialContentService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for AR filter generation
 * 
 * POST /api/spatial/ar-filters
 * - Generate AR filters for social platforms
 * - Support face, hand, body, and world tracking
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { effectName, trigger = 'face', intensity = 1, anchors } = body;

      if (!effectName) {
        return NextResponse.json(
          { success: false, error: 'effectName is required' },
          { status: 400 }
        );
      }

      const result = await SpatialContentService.generateARFilter({
        effectName,
        trigger,
        intensity,
        anchors: anchors || []
      });

      return NextResponse.json({
        success: result.success,
        modelUrl: result.modelUrl,
        thumbnailUrl: result.thumbnailUrl
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to generate AR filter' },
        { status: 500 }
      );
    }
  });
}
