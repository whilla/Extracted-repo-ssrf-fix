import { NextRequest, NextResponse } from 'next/server';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';
import {
  initBrainstormSession,
  generateInitialIdeas,
  refineIdea,
  exploreAngles,
  continueBrainstorm,
  finalizeBrainstormSession,
  quickBrainstorm,
  getBrainstormSession,
  getBrainstormHistory,
} from '@/lib/services/brainstormEngine';
import { kvGet } from '@/lib/services/puterService';

export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { action, topic, sessionId, ideaText, refinementQuestion, message, count, selectedIdeas, platform } = body;

      const brandKitRaw = await kvGet('brand_kit');
      const brandKit = brandKitRaw ? JSON.parse(brandKitRaw) : null;

      switch (action) {
        case 'start': {
          if (!topic) {
            return NextResponse.json({ success: false, error: 'topic is required' }, { status: 400 });
          }
          const session = initBrainstormSession(topic, brandKit);
          return NextResponse.json({ success: true, session });
        }

        case 'generate': {
          if (!sessionId) {
            return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
          }
          const ideas = await generateInitialIdeas(sessionId, count || 5);
          return NextResponse.json({ success: true, ideas });
        }

        case 'refine': {
          if (!sessionId || !ideaText || !refinementQuestion) {
            return NextResponse.json({ success: false, error: 'sessionId, ideaText, and refinementQuestion are required' }, { status: 400 });
          }
          const result = await refineIdea(sessionId, ideaText, refinementQuestion);
          return NextResponse.json({ success: true, ...result });
        }

        case 'explore': {
          if (!sessionId || !ideaText) {
            return NextResponse.json({ success: false, error: 'sessionId and ideaText are required' }, { status: 400 });
          }
          const angles = await exploreAngles(sessionId, ideaText, count || 3);
          return NextResponse.json({ success: true, angles });
        }

        case 'continue': {
          if (!sessionId || !message) {
            return NextResponse.json({ success: false, error: 'sessionId and message are required' }, { status: 400 });
          }
          const response = await continueBrainstorm(sessionId, message);
          return NextResponse.json({ success: true, response });
        }

        case 'finalize': {
          if (!sessionId || !selectedIdeas) {
            return NextResponse.json({ success: false, error: 'sessionId and selectedIdeas are required' }, { status: 400 });
          }
          await finalizeBrainstormSession(sessionId, selectedIdeas, platform || 'twitter');
          return NextResponse.json({ success: true, message: 'Ideas saved to memory' });
        }

        case 'quick': {
          if (!topic) {
            return NextResponse.json({ success: false, error: 'topic is required' }, { status: 400 });
          }
          const ideas = await quickBrainstorm(topic, brandKit, count || 5);
          return NextResponse.json({ success: true, ideas });
        }

        case 'history': {
          if (!sessionId) {
            return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
          }
          const history = getBrainstormHistory(sessionId);
          return NextResponse.json({ success: true, history });
        }

        default:
          return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
      }
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Brainstorm failed' },
        { status: 500 }
      );
    }
  });
}

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const searchParams = request.nextUrl.searchParams;
      const sessionId = searchParams.get('sessionId');

      if (!sessionId) {
        return NextResponse.json({ success: false, error: 'sessionId is required' }, { status: 400 });
      }

      const session = getBrainstormSession(sessionId);
      if (!session) {
        return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, session });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to get session' },
        { status: 500 }
      );
    }
  });
}
