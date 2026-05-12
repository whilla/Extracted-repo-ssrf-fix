import { NextRequest, NextResponse } from 'next/server';
import { nativeProviders } from '@/lib/services/nativeProviders';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for Shopify integration
 * 
 * POST /api/ecommerce/shopify
 * - Publish content to Shopify products
 * - Create or update products
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { content, title, productId } = body;

      if (!content || !title) {
        return NextResponse.json(
          { success: false, error: 'content and title are required' },
          { status: 400 }
        );
      }

      const result = await nativeProviders.publishShopify(content, title, productId);

      return NextResponse.json({
        success: result.success,
        postId: result.postId,
        url: result.url
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to publish to Shopify' },
        { status: 500 }
      );
    }
  });
}
