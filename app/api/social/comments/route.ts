import { NextRequest, NextResponse } from 'next/server';
import { DirectReaderService } from '@/lib/services/directReaderService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * GET /api/social/comments?platform=twitter&postId=123
 * Read comments from social platforms
 */
export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    const searchParams = request.nextUrl.searchParams;
    const platform = searchParams.get('platform');
    const postId = searchParams.get('postId');

    if (!platform || !postId) {
      return NextResponse.json(
        { success: false, error: 'platform and postId parameters required' },
        { status: 400 }
      );
    }

    try {
      const result = await DirectReaderService.readComments(platform, postId);
      
      return NextResponse.json({
        success: result.success,
        comments: result.comments,
        error: result.error,
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to read comments' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/social/comments
 * Batch read comments from multiple platforms
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    const body = await request.json();
    const { requests } = body;

    if (!Array.isArray(requests)) {
      return NextResponse.json(
        { success: false, error: 'requests array required' },
        { status: 400 }
      );
    }

    try {
      const results = await Promise.all(
        requests.map(async (req: { platform: string; postId: string }) => {
          const result = await DirectReaderService.readComments(req.platform, req.postId);
          return {
            platform: req.platform,
            postId: req.postId,
            comments: result.comments,
            success: result.success,
            error: result.error,
          };
        })
      );

      return NextResponse.json({
        success: true,
        results,
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to read comments' },
        { status: 500 }
      );
    }
  });
}