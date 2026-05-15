export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import { z } from 'zod';
import { sentimentService } from '@/lib/services/sentimentService';
import { kvGet } from '@/lib/services/puterService';
import { DirectReaderService } from '@/lib/services/directReaderService';

const SentimentRequestSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
});

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const result = SentimentRequestSchema.safeParse(body);

      if (!result.success) {
        return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
      }

      const { postId } = result.data;

      const cached = await kvGet(`sentiment_${postId}`);
      if (cached) {
        return NextResponse.json({
          status: 'success',
          data: JSON.parse(cached),
          cached: true
        });
      }

      const comments = await fetchCommentsForPost(postId);

      if (!comments || comments.length === 0) {
        return NextResponse.json({
          error: 'No comments found for this post to analyze sentiment.'
        }, { status: 404 });
      }

      const report = await sentimentService.analyzeComments(postId, comments);

      return NextResponse.json({
        status: 'success',
        data: report,
        cached: false
      });

    } catch (error) {
      console.error('[api/analytics/sentiment] Error:', error);
      return NextResponse.json({
        error: 'Sentiment analysis failed.'
      }, { status: 500 });
    }
  });
}

async function fetchCommentsForPost(postId: string): Promise<string[]> {
  let platform = 'twitter';
  if (postId.startsWith('yt')) platform = 'youtube';
  if (postId.startsWith('li')) platform = 'linkedin';
  if (postId.startsWith('fb')) platform = 'facebook';

  const result = await DirectReaderService.readComments(platform, postId);

  if (!result.success) {
    return [];
  }

  return result.comments.map(c => c.text);
}

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    return NextResponse.json({
      status: 'ready',
      capabilities: [
        'Emotion detection',
        'Intent classification',
        'Strategic insight generation',
        'Batch comment processing'
      ]
    });
  });
}
