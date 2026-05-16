import { NextRequest, NextResponse } from 'next/server';
import { videoRenderingService } from '@/lib/services/videoRenderingService';
import { VideoEditingService } from '@/lib/services/videoEditingService';
import { kvGet, kvSet } from '@/lib/services/puterService';
import { withApiMiddleware } from '@/lib/utils/apiMiddleware';

interface RenderJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  outputUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  composition?: any;
  timeline?: any;
  options?: any;
}

const activeJobs = new Map<string, RenderJob>();

async function createJob(composition: any, timeline: any, options: any): Promise<RenderJob> {
  const jobId = `render_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const job: RenderJob = {
    id: jobId,
    status: 'pending',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    composition,
    timeline,
    options,
  };
  activeJobs.set(jobId, job);
  await kvSet(`render_job_${jobId}`, JSON.stringify(job));
  return job;
}

async function updateJob(jobId: string, updates: Partial<RenderJob>): Promise<void> {
  const job = activeJobs.get(jobId);
  if (!job) return;
  Object.assign(job, updates, { updatedAt: Date.now() });
  activeJobs.set(jobId, job);
  await kvSet(`render_job_${jobId}`, JSON.stringify(job));
}

async function getJob(jobId: string): Promise<RenderJob | null> {
  const cached = activeJobs.get(jobId);
  if (cached) return cached;

  const stored = await kvGet(`render_job_${jobId}`);
  if (stored) {
    try {
      const job = JSON.parse(stored);
      activeJobs.set(jobId, job);
      return job;
    } catch {
      return null;
    }
  }
  return null;
}

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
  const isNode = typeof window === 'undefined';

  if (isNode) {
    const job = await createJob(composition, null, options);

    setImmediate(async () => {
      await updateJob(job.id, { status: 'processing', progress: 0 });
      try {
        const result = await videoRenderingService.renderCanvas(
          composition,
          options,
          (progress) => {
            updateJob(job.id, { progress }).catch(() => {});
          }
        );

        if (result.success) {
          await updateJob(job.id, {
            status: 'completed',
            progress: 100,
            outputUrl: result.outputUrl,
          });
        } else {
          await updateJob(job.id, {
            status: 'failed',
            error: result.error || 'Render failed',
          });
        }
      } catch (error) {
        await updateJob(job.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown render error',
        });
      }
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Render job queued. Poll /api/video?action=status&jobId=' + job.id,
    });
  }

  const job = await createJob(composition, null, options);
  await updateJob(job.id, { status: 'processing' });

  const result = await videoRenderingService.renderCanvas(
    composition,
    options,
    (progress) => {
      updateJob(job.id, { progress }).catch(() => {});
    }
  );

  if (result.success) {
    await updateJob(job.id, { status: 'completed', progress: 100, outputUrl: result.outputUrl });
  } else {
    await updateJob(job.id, { status: 'failed', error: result.error });
  }

  return NextResponse.json({
    success: result.success,
    jobId: job.id,
    outputUrl: result.outputUrl,
    renderTime: result.renderTime,
    fileSize: result.fileSize,
    error: result.error,
  });
}

async function handleTimelineRender(timeline: any, options: any) {
  if (!timeline || !timeline.tracks || timeline.tracks.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Timeline must have at least one track' },
      { status: 400 }
    );
  }

  VideoEditingService.createTimeline(timeline.resolution || { width: 1920, height: 1080 });

  for (const track of timeline.tracks) {
    VideoEditingService.addTrack(track);
  }

  if (timeline.transitions) {
    for (const [key, transition] of Object.entries(timeline.transitions)) {
      const [trackId1, trackId2] = key.split('-');
      VideoEditingService.addTransition(trackId1, trackId2, transition as any);
    }
  }

  const isNode = typeof window === 'undefined';
  if (isNode) {
    const job = await createJob(null, timeline, options);

    setImmediate(async () => {
      await updateJob(job.id, { status: 'processing', progress: 0 });
      try {
        const result = await VideoEditingService.renderTimeline((progress) => {
          updateJob(job.id, { progress }).catch(() => {});
        });

        if (result.success) {
          await updateJob(job.id, { status: 'completed', progress: 100, outputUrl: result.outputUrl });
        } else {
          await updateJob(job.id, { status: 'failed', error: result.error });
        }
      } catch (error) {
        await updateJob(job.id, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown timeline render error',
        });
      }
    });

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: 'Timeline render job queued. Poll /api/video?action=status&jobId=' + job.id,
    });
  }

  const job = await createJob(null, timeline, options);
  await updateJob(job.id, { status: 'processing' });

  const result = await VideoEditingService.renderTimeline((progress) => {
    updateJob(job.id, { progress }).catch(() => {});
  });

  if (result.success) {
    await updateJob(job.id, { status: 'completed', progress: 100, outputUrl: result.outputUrl });
  } else {
    await updateJob(job.id, { status: 'failed', error: result.error });
  }

  return NextResponse.json({
    success: result.success,
    jobId: job.id,
    outputUrl: result.outputUrl,
    error: result.error,
  });
}

async function getNextPreset(preset: string) {
  const options = videoRenderingService.getPreset(preset as 'social' | 'youtube' | 'square');
  return NextResponse.json({ success: true, options });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const jobId = searchParams.get('jobId');
    const action = searchParams.get('action') || 'presets';

    if (action === 'status' && jobId) {
      const job = await getJob(jobId);
      if (!job) {
        return NextResponse.json(
          { success: false, error: 'Job not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        outputUrl: job.outputUrl,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      });
    }

    if (action === 'list') {
      const limit = parseInt(searchParams.get('limit') || '20', 10);
      const jobs = Array.from(activeJobs.values())
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(({ composition, timeline, ...rest }) => rest);

      return NextResponse.json({ success: true, jobs });
    }

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
