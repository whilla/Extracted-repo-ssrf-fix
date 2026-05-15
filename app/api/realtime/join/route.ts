export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { documentId } = body;

      if (!documentId) {
        return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        documentId,
        peers: 1,
        content: '',
        message: 'Document session created',
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to join document' },
        { status: 500 }
      );
    }
  }, { requireAuth: false });
}
