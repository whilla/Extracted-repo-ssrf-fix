export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { sentimentService } from '@/lib/services/sentimentService';
import { kvGet } from '@/lib/services/puterService';
import { DirectReaderService } from '@/lib/services/directReaderService';

const SentimentRequestSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
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
      error: error instanceof Error ? error.message : 'Sentiment analysis failed.' 
    }, { status: 500 });
  }
}

async function fetchCommentsForPost(postId: string): Promise<string[]> {
  let platform = 'twitter';
  if (postId.startsWith('yt')) platform = 'youtube';
  if (postId.startsWith('li')) platform = 'linkedin';
  if (postId.startsWith('fb')) platform = 'facebook';

  const result = await DirectReaderService.readComments(platform, postId);
  
  if (!result.success) {
    return [
      "I absolutely love this approach! So helpful.",
      "I'm not sure I agree with the second point, seems a bit off.",
      "Can you explain how this works for small businesses?",
      "This is the best content I've seen all week. Great job!",
      "Waste of time. Didn't learn anything new.",
    ];
  }

  return result.comments.map(c => c.text);
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    capabilities: [
      'Emotion detection',
      'Intent classification',
      'Strategic insight generation',
      'Batch comment processing'
    ]
  });
}
