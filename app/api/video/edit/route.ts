import { NextRequest, NextResponse } from 'next/server';
import { VideoEditingService } from '@/lib/services/videoEditingService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * API endpoint for video editing operations
 * 
 * POST /api/video/edit
 * - Create timeline, add tracks, and render video
 * - Supports video, audio, text, and image tracks
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const body = await request.json();
      const { action, ...params } = body;

      if (!action) {
        return NextResponse.json(
          { success: false, error: 'action is required (create, addTrack, addText, render, getTimeline)' },
          { status: 400 }
        );
      }

      switch (action) {
        case 'create': {
          const timeline = VideoEditingService.createTimeline(params.resolution);
          return NextResponse.json({ success: true, timeline });
        }

        case 'addTrack': {
          if (!params.track) {
            return NextResponse.json(
              { success: false, error: 'track object is required' },
              { status: 400 }
            );
          }
          VideoEditingService.addTrack(params.track);
          return NextResponse.json({ success: true });
        }

        case 'addText': {
          if (!params.text || params.startTime === undefined || params.endTime === undefined) {
            return NextResponse.json(
              { success: false, error: 'text, startTime, and endTime are required' },
              { status: 400 }
            );
          }
          VideoEditingService.addTextOverlay(
            params.text,
            params.startTime,
            params.endTime,
            params.style
          );
          return NextResponse.json({ success: true });
        }

        case 'addTransition': {
          if (!params.trackId1 || !params.trackId2 || !params.transition) {
            return NextResponse.json(
              { success: false, error: 'trackId1, trackId2, and transition are required' },
              { status: 400 }
            );
          }
          VideoEditingService.addTransition(
            params.trackId1,
            params.trackId2,
            params.transition
          );
          return NextResponse.json({ success: true });
        }

        case 'render': {
          const result = VideoEditingService.renderTimeline();
          return NextResponse.json(result);
        }

        case 'getTimeline': {
          const timeline = VideoEditingService.getTimeline();
          return NextResponse.json({ success: true, timeline });
        }

        default:
          return NextResponse.json(
            { success: false, error: `Unknown action: ${action}` },
            { status: 400 }
          );
      }
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Video editing operation failed' },
        { status: 500 }
      );
    }
  });
}

export async function GET(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    try {
      const timeline = VideoEditingService.getTimeline();
      return NextResponse.json({ success: true, timeline });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to get timeline' },
        { status: 500 }
      );
    }
  });
}