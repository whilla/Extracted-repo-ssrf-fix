import { NextRequest, NextResponse } from 'next/server';
import { nativeProviders } from '@/lib/services/nativeProviders';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { schemas, validateRequest } from '@/lib/utils/validation';
import { withIdempotency, generateIdempotencyKey } from '@/lib/utils/idempotency';
import { logAudit, AUDIT_ACTIONS, AUDIT_RESOURCES } from '@/lib/utils/audit';

/**
 * API endpoint for Shopify integration
 * 
 * POST /api/ecommerce/shopify
 * - Publish content to Shopify products
 * - Create or update products
 * - Idempotent: safe to retry
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async (context) => {
    // Validate input
    const validation = await validateRequest(request, schemas.shopify);
    if (!validation.success) {
      return validation.response;
    }

    const { content, title, productId } = validation.data;

    // Generate idempotency key from request data + user
    const idempotencyKey = generateIdempotencyKey({
      userId: context.userId,
      content: content.slice(0, 100),
      title,
      productId,
    });

    try {
      const result = await withIdempotency(
        idempotencyKey,
        async () => {
          return await nativeProviders.publishShopify(content, title, productId);
        },
        { onDuplicate: 'return_cached' }
      );

      // Log audit event
      if (context.userId) {
        await logAudit({
          userId: context.userId,
          action: AUDIT_ACTIONS.CONTENT_PUBLISHED,
          resourceType: AUDIT_RESOURCES.CONTENT,
          resourceId: result.postId || 'unknown',
          metadata: {
            platform: 'shopify',
            productId,
            success: result.success,
          },
        });
      }

      return NextResponse.json({
        success: result.success,
        postId: result.postId,
        url: result.url,
        idempotencyKey,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish to Shopify';
      return NextResponse.json(
        { success: false, error: errorMessage, idempotencyKey },
        { status: 500 }
      );
    }
  });
}
