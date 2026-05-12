import { NextRequest, NextResponse } from 'next/server';
import { nativeProviders } from '@/lib/services/nativeProviders';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for Etsy integration
 * 
 * POST /api/ecommerce/etsy
 * - Publish content to Etsy listings
 * - Create product listings
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { content, title, category } = body;

      if (!content || !title) {
        return NextResponse.json(
          { success: false, error: 'content and title are required' },
          { status: 400 }
        );
      }

      const result = await nativeProviders.publishEtsy(content, title, category);

      return NextResponse.json({
        success: result.success,
        postId: result.postId,
        url: result.url
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to publish to Etsy' },
        { status: 500 }
      );
    }
  });
}
