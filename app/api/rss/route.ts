import { NextRequest, NextResponse } from 'next/server';
import { generatePostsRSSFeed } from '@/lib/services/rssService';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const platform = searchParams.get('platform');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  // In production, fetch actual posts from database
  // For now, return empty feed
  const posts: Array<{
    title: string;
    content: string;
    url: string;
    publishedAt: string;
    author?: string;
    platform?: string;
  }> = [];

  const config = platform ? { title: `${platform} Posts - NexusAI` } : {};
  const feed = await generatePostsRSSFeed(posts.slice(0, limit), config);

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
