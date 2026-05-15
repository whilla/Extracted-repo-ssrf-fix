import { NextRequest, NextResponse } from 'next/server';
import { videoRenderingService } from '@/lib/services/videoRenderingService';
import { VideoEditingService } from '@/lib/services/videoEditingService';
import { kvGet } from '@/lib/services/puterService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

/**
 * Video rendering API endpoint
 * Supports both browser-based and cloud-based rendering
 */
export async function POST(request: NextRequest) {
  return withApiMiddleware(request, async () => {
    const body = await request.json();
    const { action, composition, options, timeline } = body;

    try {
      switch (action) {
        case 'render':
          return await handleRender(composition, options);

        case 'render_timeline':
          return await handleTimelineRender(timeline, options);

        case 'get_preset':
          return getNextPreset(body.preset);

        default:
          return NextResponse.json(
            { success: false, error: 'Unknown action' },
            { status: 400 }
          );
      }
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Render failed' },
        { status: 500 }
      );
    }
  });
}

async function handleRender(composition: any, options: any) {
  // Check if we're in Node.js or browser environment
  const isNode = typeof window === 'undefined';

  if (isNode) {
    // For server-side, return a job token for async processing
    const jobId = `render_${Date.now()}`;
    
    // Store job info
    await kvGet(`render_job_${jobId}`);
    
    return NextResponse.json({
      success: true,
      jobId,
      message: 'Render job queued. Poll /api/video/status?jobId=' + jobId,
    });
  }

  // Browser-based rendering
  const result = await videoRenderingService.renderCanvas(
    composition,
    options,
    (progress) => {
      // Progress would be sent via WebSocket in production
    }
  );

  return NextResponse.json({
    success: result.success,
    outputUrl: result.outputUrl,
    renderTime: result.renderTime,
    fileSize: result.fileSize,
    error: result.error,
  });
}

async function handleTimelineRender(timeline: any, options: any) {
  const result = await VideoEditingService.renderTimeline();
  
  return NextResponse.json({
    success: result.success,
    outputUrl: result.outputUrl,
    error: result.error,
  });
}

async function getNextPreset(preset: string) {
  const options = videoRenderingService.getPreset(preset as 'social' | 'youtube' | 'square');
  return NextResponse.json({ success: true, options });
}

// GET endpoint for render status
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const action = searchParams.get('action') || 'presets';

    if (action === 'status' && jobId) {
      // Check render job status
      return NextResponse.json({
        success: true,
        jobId,
        status: 'completed', // Placeholder
        progress: 100,
      });
    }

    // Return available presets
    const presets = {
      social: videoRenderingService.getPreset('social'),
      youtube: videoRenderingService.getPreset('youtube'),
      square: videoRenderingService.getPreset('square'),
    };

    return NextResponse.json({ success: true, presets });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to get presets' },
      { status: 500 }
    );
  }
}