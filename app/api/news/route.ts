import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { fetchTrendingNews, fetchNewsByTopic, fetchTrendingTopics } from '@/lib/services/mediaStackService';

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const searchParams = request.nextUrl.searchParams;
      const action = searchParams.get('action') || 'trending';
      const topic = searchParams.get('topic') || searchParams.get('q') || undefined;
      const countries = searchParams.get('countries')?.split(',');
      const categories = searchParams.get('categories')?.split(',');
      const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;

      let result;
      switch (action) {
        case 'topic':
          if (!topic) {
            return NextResponse.json(
              { success: false, error: 'topic parameter is required' },
              { status: 400 }
            );
          }
          result = await fetchNewsByTopic(topic, { limit, countries });
          break;

        case 'trending':
          result = await fetchTrendingTopics({ categories, limit });
          break;

        default:
          result = await fetchTrendingNews({
            keywords: topic,
            countries,
            categories,
            limit,
            sort: 'published_desc',
          });
      }

      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to fetch news' },
        { status: 500 }
      );
    }
  });
}
