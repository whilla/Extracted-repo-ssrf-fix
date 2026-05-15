import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { searchTrends, searchCompetitors } from '@/lib/services/serpStackService';

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const searchParams = request.nextUrl.searchParams;
      const action = searchParams.get('action') || 'search';
      const query = searchParams.get('query') || searchParams.get('q');
      const country = searchParams.get('country') || undefined;
      const language = searchParams.get('language') || undefined;
      const maxResults = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

      if (!query) {
        return NextResponse.json(
          { success: false, error: 'query parameter is required' },
          { status: 400 }
        );
      }

      let result;
      if (action === 'competitors') {
        result = await searchCompetitors(query, { country });
      } else {
        result = await searchTrends(query, { country, language, maxResults });
      }

      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Search failed' },
        { status: 500 }
      );
    }
  });
}
