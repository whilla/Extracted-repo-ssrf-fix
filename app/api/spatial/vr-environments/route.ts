import { NextRequest, NextResponse } from 'next/server';
import { SpatialContentService } from '@/lib/services/spatialContentService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for VR environment generation
 * 
 * POST /api/spatial/vr-environments
 * - Generate immersive VR environments
 * - Support various scene types and lighting
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { sceneType = 'room', lighting = 'day', interactiveElements } = body;

      const result = await SpatialContentService.generateVREnvironment({
        sceneType,
        lighting,
        interactiveElements: interactiveElements || []
      });

      return NextResponse.json({
        success: result.success,
        modelUrl: result.modelUrl,
        thumbnailUrl: result.thumbnailUrl
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to generate VR environment' },
        { status: 500 }
      );
    }
  });
}
