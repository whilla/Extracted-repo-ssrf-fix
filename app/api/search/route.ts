import { NextRequest, NextResponse } from 'next/server';
import { SearchService } from '@/lib/services/searchService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const { query, limit } = await request.json();
      if (!query || typeof query !== 'string') {
        return NextResponse.json({ success: false, error: 'query string is required' }, { status: 400 });
      }
      const result = await SearchService.search(query, limit || 20);
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Search failed' },
        { status: 500 }
      );
    }
  });
}
