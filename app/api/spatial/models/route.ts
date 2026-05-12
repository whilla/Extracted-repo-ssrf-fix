import { NextRequest, NextResponse } from 'next/server';
import { SpatialContentService } from '@/lib/services/spatialContentService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for 3D model generation
 * 
 * POST /api/spatial/models
 * - Generate 3D models from text prompts
 * - Support various styles and output formats
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { prompt, style = 'realistic', outputFormat = 'glb' } = body;

      if (!prompt) {
        return NextResponse.json(
          { success: false, error: 'prompt is required' },
          { status: 400 }
        );
      }

      const result = await SpatialContentService.generate3DModel({
        prompt,
        style,
        outputFormat
      });

      return NextResponse.json({
        success: result.success,
        modelUrl: result.modelUrl,
        thumbnailUrl: result.thumbnailUrl
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to generate 3D model' },
        { status: 500 }
      );
    }
  });
}
