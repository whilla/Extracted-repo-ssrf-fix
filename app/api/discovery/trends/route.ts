export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { fetchTrendingNews } from '@/lib/services/mediaStackService';
import { searchTrends } from '@/lib/services/serpStackService';

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || 'AI trends';
    const country = searchParams.get('country') || 'us';

    try {
      const [news, search] = await Promise.all([
        fetchTrendingNews({ keywords: query, countries: [country], limit: 10 }),
        searchTrends(query, { country }),
      ]);

      return NextResponse.json({
        trends: news,
        search: search,
      });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  });
}
