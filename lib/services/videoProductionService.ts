import { createConfigError } from './configError';
/**
 * Video Production Service
 * Complex video editing, timeline management, and rendering
 */

import { kvGet, kvSet } from './puterService';
import type { BrandKit } from '@/lib/types';

export interface VideoClip {
  id: string;
  type: 'video' | 'image' | 'audio' | 'text' | 'transition';
  sourceUrl?: string;
  sourceType: 'generated' | 'uploaded' | 'stock';
  startTime: number;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  volume?: number;
  opacity?: number;
  effects?: VideoEffect[];
  textOverlay?: TextOverlay;
  position: { x: number; y: number };
  scale: { width: number; height: number };
  rotation: number;
}

export interface TextOverlay {
  text: string;
  font: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  position: 'top' | 'bottom' | 'center';
  animation?: 'fade' | 'slide' | 'typewriter';
}

export interface VideoEffect {
  type: 'blur' | 'brightness' | 'contrast' | 'saturation' | 'zoom' | 'pan' | 'shake';
  intensity: number;
  startTime: number;
  duration: number;
}

export interface AudioTrack {
  id: string;
  type: 'voiceover' | 'music' | 'sound_effect';
  sourceUrl?: string;
  volume: number;
  fadeIn?: number;
  fadeOut?: number;
  startTime: number;
  duration: number;
}

export interface VideoTimeline {
  id: string;
  name: string;
  duration: number;
  resolution: '720p' | '1080p' | '4k';
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  fps: number;
  clips: VideoClip[];
  audioTracks: AudioTrack[];
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'rendering' | 'completed' | 'failed';
  renderedUrl?: string;
  thumbnailUrl?: string;
}

export interface RenderJob {
  id: string;
  timelineId: string;
  status: 'queued' | 'rendering' | 'completed' | 'failed';
  progress: number;
  startedAt?: string;
  completedAt?: string;
  outputUrl?: string;
  error?: string;
}

const TIMELINES_KEY = 'video_timelines';
const RENDER_JOBS_KEY = 'video_render_jobs';

function generateId(): string {
  return `vid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadTimelines(): Promise<VideoTimeline[]> {
  const data = await kvGet(TIMELINES_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveTimelines(timelines: VideoTimeline[]): Promise<void> {
  await kvSet(TIMELINES_KEY, JSON.stringify(timelines.slice(0, 100)));
}

export async function createTimeline(options: {
  name: string;
  duration?: number;
  resolution?: '720p' | '1080p' | '4k';
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5';
  fps?: number;
}): Promise<VideoTimeline> {
  const timelines = await loadTimelines();

  const timeline: VideoTimeline = {
    id: generateId(),
    name: options.name,
    duration: options.duration || 60,
    resolution: options.resolution || '1080p',
    aspectRatio: options.aspectRatio || '16:9',
    fps: options.fps || 30,
    clips: [],
    audioTracks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
  };

  timelines.unshift(timeline);
  await saveTimelines(timelines);

  return timeline;
}

export async function getTimeline(timelineId: string): Promise<VideoTimeline | null> {
  const timelines = await loadTimelines();
  return timelines.find(t => t.id === timelineId) || null;
}

export async function updateTimeline(
  timelineId: string,
  updates: Partial<VideoTimeline>
): Promise<boolean> {
  const timelines = await loadTimelines();
  const index = timelines.findIndex(t => t.id === timelineId);

  if (index === -1) return false;

  timelines[index] = {
    ...timelines[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveTimelines(timelines);
  return true;
}

export async function addClip(
  timelineId: string,
  clip: Omit<VideoClip, 'id'>
): Promise<string | null> {
  const timelines = await loadTimelines();
  const index = timelines.findIndex(t => t.id === timelineId);

  if (index === -1) return null;

  const clipId = generateId();
  const fullClip: VideoClip = { ...clip, id: clipId };

  timelines[index].clips.push(fullClip);
  timelines[index].updatedAt = new Date().toISOString();

  await saveTimelines(timelines);
  return clipId;
}

export async function updateClip(
  timelineId: string,
  clipId: string,
  updates: Partial<VideoClip>
): Promise<boolean> {
  const timelines = await loadTimelines();
  const timelineIndex = timelines.findIndex(t => t.id === timelineId);

  if (timelineIndex === -1) return false;

  const clipIndex = timelines[timelineIndex].clips.findIndex(c => c.id === clipId);
  if (clipIndex === -1) return false;

  timelines[timelineIndex].clips[clipIndex] = {
    ...timelines[timelineIndex].clips[clipIndex],
    ...updates,
  };
  timelines[timelineIndex].updatedAt = new Date().toISOString();

  await saveTimelines(timelines);
  return true;
}

export async function removeClip(timelineId: string, clipId: string): Promise<boolean> {
  const timelines = await loadTimelines();
  const index = timelines.findIndex(t => t.id === timelineId);

  if (index === -1) return false;

  timelines[index].clips = timelines[index].clips.filter(c => c.id !== clipId);
  timelines[index].updatedAt = new Date().toISOString();

  await saveTimelines(timelines);
  return true;
}

export async function addAudioTrack(
  timelineId: string,
  track: Omit<AudioTrack, 'id'>
): Promise<string | null> {
  const timelines = await loadTimelines();
  const index = timelines.findIndex(t => t.id === timelineId);

  if (index === -1) return null;

  const trackId = generateId();
  const fullTrack: AudioTrack = { ...track, id: trackId };

  timelines[index].audioTracks.push(fullTrack);
  timelines[index].updatedAt = new Date().toISOString();

  await saveTimelines(timelines);
  return trackId;
}

export async function reorderClips(
  timelineId: string,
  clipIds: string[]
): Promise<boolean> {
  const timelines = await loadTimelines();
  const index = timelines.findIndex(t => t.id === timelineId);

  if (index === -1) return false;

  const clipMap = new Map(timelines[index].clips.map(c => [c.id, c]));
  timelines[index].clips = clipIds.map(id => clipMap.get(id)!).filter(Boolean);
  timelines[index].updatedAt = new Date().toISOString();

  await saveTimelines(timelines);
  return true;
}

export async function listTimelines(): Promise<VideoTimeline[]> {
  return loadTimelines();
}

export async function deleteTimeline(timelineId: string): Promise<boolean> {
  const timelines = await loadTimelines();
  const filtered = timelines.filter(t => t.id !== timelineId);
  
  if (filtered.length === timelines.length) return false;
  
  await saveTimelines(filtered);
  return true;
}

export async function renderTimeline(timelineId: string): Promise<RenderJob> {
  const timelines = await loadTimelines();
  const index = timelines.findIndex(t => t.id === timelineId);

  if (index === -1) {
    throw new Error('Timeline not found');
  }

  timelines[index].status = 'rendering';
  await saveTimelines(timelines);

  const job: RenderJob = {
    id: generateId(),
    timelineId,
    status: 'queued',
    progress: 0,
    startedAt: new Date().toISOString(),
  };

  const jobsData = await kvGet(RENDER_JOBS_KEY);
  const jobs: RenderJob[] = jobsData ? JSON.parse(jobsData) : [];
  jobs.unshift(job);
  await kvSet(RENDER_JOBS_KEY, JSON.stringify(jobs.slice(0, 50)));

  // Attempt real FFmpeg rendering, fall back to cloud/Remotion
  renderWithRealBackend(job.id, timelines[index]).catch(err => {
    console.error('[VideoProduction] Render backend failed:', err);
  });

  return job;
}

async function renderWithRealBackend(jobId: string, timeline: VideoTimeline): Promise<void> {
  const renderMode = await kvGet('video_render_mode') || 'auto';

  // Strategy: try FFmpeg WASM in-browser, then Remotion/cloud, then Puter cloud
  try {
    if (renderMode === 'ffmpeg' || renderMode === 'auto') {
      await renderWithFFmpegWasm(jobId, timeline);
      return;
    }
  } catch (ffmpegErr) {
    console.warn('[VideoProduction] FFmpeg WASM failed, trying fallback:', ffmpegErr);
  }

  try {
    if (renderMode === 'remotion' || renderMode === 'auto') {
      await renderWithRemotionLambda(jobId, timeline);
      return;
    }
  } catch (remotionErr) {
    console.warn('[VideoProduction] Remotion failed, trying fallback:', remotionErr);
  }

  // Final fallback: upload clips to Puter cloud for backend processing
  await renderWithPuterCloud(jobId, timeline);
}

async function renderWithFFmpegWasm(jobId: string, timeline: VideoTimeline): Promise<void> {
  try {
    const FFmpeg = (await import('@ffmpeg/ffmpeg')).FFmpeg;
    const fetchFile = (await import('@ffmpeg/util')).fetchFile;
    const ffmpeg = new FFmpeg();

    await updateJobProgressCli(jobId, 10, 'Loading FFmpeg');
    await ffmpeg.load();

    await updateJobProgressCli(jobId, 20, 'Processing clips');

    // Download each clip source and concatenate
    const clipPaths: string[] = [];
    for (let i = 0; i < timeline.clips.length; i++) {
      const clip = timeline.clips[i];
      if (clip.sourceUrl) {
        const inputName = `input_${i}.mp4`;
        const clipData = await fetchFile(clip.sourceUrl);
        await ffmpeg.writeFile(inputName, clipData);
        clipPaths.push(`file ${inputName}`);
      }
    }

    if (clipPaths.length === 0) {
      // Generate a blank video with text overlay
      const resolution = timeline.resolution === '4k' ? '3840:2160' : timeline.resolution === '720p' ? '1280:720' : '1920:1080';
      const textClips = timeline.clips.filter(c => c.textOverlay);
      if (textClips.length > 0) {
        const text = textClips[0].textOverlay?.text || '';
        await ffmpeg.exec([
          '-f', 'lavfi', '-i', `color=c=black:s=${resolution}:d=${timeline.duration}`,
          '-vf', `drawtext=text='${text.replace(/'/g, "\\'")}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'output.mp4',
        ]);
      } else {
        await ffmpeg.exec([
          '-f', 'lavfi', '-i', `color=c=black:s=${resolution}:d=${timeline.duration}`,
          '-c:v', 'libx264', '-pix_fmt', 'yuv420p', 'output.mp4',
        ]);
      }
    } else {
      // Write concat list and merge
      const listContent = clipPaths.join('\n');
      await ffmpeg.writeFile('clips.txt', listContent);
      await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'clips.txt', '-c', 'copy', 'output.mp4']);
    }

    await updateJobProgressCli(jobId, 80, 'Finalizing');

    // Read output and upload to storage
    const outputData = await ffmpeg.readFile('output.mp4');
    const outputBlob = new Blob([outputData], { type: 'video/mp4' });

    // Upload to Puter storage
    const { writeFile } = await import('./puterService');
    const outputPath = `rendered/${jobId}.mp4`;
    const arrayBuf = await outputBlob.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuf);
    const base64 = btoa(String.fromCharCode(...uint8));
    await writeFile(outputPath, base64);

    await completeJob(jobId, outputPath);
  } catch (err) {
    throw new Error(`FFmpeg WASM render failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

async function renderWithRemotionLambda(jobId: string, timeline: VideoTimeline): Promise<void> {
  const remotionApiKey = await kvGet('remotion_api_key');
  if (!remotionApiKey) throw createConfigError('remotion');

  await updateJobProgressCli(jobId, 10, 'Connecting to Remotion');

  const compositionData = {
    id: `nexus-${jobId}`,
    durationInFrames: Math.round(timeline.duration * timeline.fps),
    fps: timeline.fps,
    width: timeline.resolution === '4k' ? 3840 : timeline.resolution === '720p' ? 1280 : 1920,
    height: timeline.resolution === '4k' ? 2160 : timeline.resolution === '720p' ? 720 : 1080,
    clips: timeline.clips.map(c => ({
      type: c.type,
      sourceUrl: c.sourceUrl,
      startTime: c.startTime,
      duration: c.duration,
      textOverlay: c.textOverlay,
      effects: c.effects,
    })),
    audioTracks: timeline.audioTracks.map(t => ({
      type: t.type,
      sourceUrl: t.sourceUrl,
      volume: t.volume,
      startTime: t.startTime,
      duration: t.duration,
    })),
  };

  const response = await fetch('https://api.remotion.dev/v1/render', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${remotionApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      composition: compositionData.id,
      inputProps: compositionData,
      serveUrl: 'https://nexus-remotion.vercel.app/',
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Remotion API error: ${response.statusText}`);
  }

  const data = await response.json();
  const renderId = data.renderId;
  const bucketName = data.bucketName;

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60;
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;
    const statusRes = await fetch(`https://api.remotion.dev/v1/render/${bucketName}/${renderId}`, {
      headers: { 'Authorization': `Bearer ${remotionApiKey}` },
    });
    const statusData = await statusRes.json();

    if (statusData.status === 'done') {
      await updateJobProgressCli(jobId, 90, 'Downloading from Remotion');
      const outputUrl = statusData.outputUrl;

      // Stream to Puter storage
      const mediaRes = await fetch(outputUrl);
      const mediaBlob = await mediaRes.blob();
      const { writeFile } = await import('./puterService');
      const arrayBuf = await mediaBlob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuf);
      const base64 = btoa(String.fromCharCode(...uint8));
      const outputPath = `rendered/${jobId}.mp4`;
      await writeFile(outputPath, base64);

      await completeJob(jobId, outputPath);
      return;
    } else if (statusData.status === 'error') {
      throw new Error(statusData.error || 'Remotion render failed');
    }

    await updateJobProgressCli(jobId, 30 + Math.round((attempts / maxAttempts) * 50));
  }

  throw new Error('Remotion render timed out');
}

async function renderWithPuterCloud(jobId: string, timeline: VideoTimeline): Promise<void> {
  await updateJobProgressCli(jobId, 10, 'Submitting to Puter cloud render');

  // Store render job for Puter cloud worker to process
  const { writeFile } = await import('./puterService');
  await writeFile(`render_jobs/${jobId}.json`, JSON.stringify({
    timelineId: timeline.id,
    resolution: timeline.resolution,
    aspectRatio: timeline.aspectRatio,
    fps: timeline.fps,
    duration: timeline.duration,
    clips: timeline.clips,
    audioTracks: timeline.audioTracks,
    createdAt: new Date().toISOString(),
  }));

  // Register with monitor service for polling
  const monitorKey = `render_monitor_${jobId}`;
  await kvSet(monitorKey, JSON.stringify({
    status: 'queued',
    progress: 0,
    checkedAt: new Date().toISOString(),
  }));

  // Start polling for completion
  pollCloudRenderJob(jobId, monitorKey).catch(err => {
    console.error('[VideoProduction] Cloud render polling failed:', err);
  });
}

async function pollCloudRenderJob(jobId: string, monitorKey: string): Promise<void> {
  let attempts = 0;
  const maxAttempts = 120;
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;

    try {
      const data = await kvGet(monitorKey);
      if (!data) {
        await updateJobProgressCli(jobId, 50);
        continue;
      }
      const state = JSON.parse(data);

      if (state.status === 'completed' && state.outputUrl) {
        await completeJob(jobId, state.outputUrl);
        return;
      } else if (state.status === 'failed') {
        throw new Error(state.error || 'Cloud render failed');
      }

      await updateJobProgressCli(jobId, 20 + Math.round((attempts / maxAttempts) * 60));
    } catch (err) {
      if (attempts >= maxAttempts) {
        throw new Error(`Cloud render timed out: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }
  }
  throw new Error('Cloud render timed out');
}

async function updateJobProgressCli(jobId: string, progress: number, statusText?: string): Promise<void> {
  const jobsData = await kvGet(RENDER_JOBS_KEY);
  const jobs: RenderJob[] = jobsData ? JSON.parse(jobsData) : [];
  const jobIndex = jobs.findIndex(j => j.id === jobId);
  if (jobIndex !== -1) {
    jobs[jobIndex].progress = Math.min(100, progress);
    if (progress >= 100) {
      jobs[jobIndex].status = 'completed';
      jobs[jobIndex].completedAt = new Date().toISOString();
    }
    await kvSet(RENDER_JOBS_KEY, JSON.stringify(jobs.slice(0, 50)));
  }
}

async function completeJob(jobId: string, outputPath: string): Promise<void> {
  const jobsData = await kvGet(RENDER_JOBS_KEY);
  const jobs: RenderJob[] = jobsData ? JSON.parse(jobsData) : [];
  const jobIndex = jobs.findIndex(j => j.id === jobId);

  if (jobIndex !== -1) {
    jobs[jobIndex].status = 'completed';
    jobs[jobIndex].progress = 100;
    jobs[jobIndex].completedAt = new Date().toISOString();
    jobs[jobIndex].outputUrl = outputPath;
    await kvSet(RENDER_JOBS_KEY, JSON.stringify(jobs.slice(0, 50)));

    const timelineId = jobs[jobIndex].timelineId;
    const timelines = await loadTimelines();
    const tIndex = timelines.findIndex(t => t.id === timelineId);
    if (tIndex !== -1) {
      timelines[tIndex].status = 'completed';
      timelines[tIndex].renderedUrl = outputPath;
      await saveTimelines(timelines);
    }
  }
}

export async function getRenderJob(jobId: string): Promise<RenderJob | null> {
  const jobsData = await kvGet(RENDER_JOBS_KEY);
  const jobs: RenderJob[] = jobsData ? JSON.parse(jobsData) : [];
  return jobs.find(j => j.id === jobId) || null;
}

export async function generateVideoFromTimeline(
  timelineId: string,
  brandKit?: BrandKit | null
): Promise<{ script: string; prompt: string }> {
  const timeline = await getTimeline(timelineId);
  if (!timeline) throw new Error('Timeline not found');

  const sceneDescriptions = timeline.clips.map(clip => {
    if (clip.type === 'text') {
      return `Text overlay: "${clip.textOverlay?.text}" at ${clip.position.x},${clip.position.y}`;
    }
    if (clip.sourceUrl) {
      return `Clip from ${clip.sourceUrl}, duration ${clip.duration}s`;
    }
    return `Empty clip, duration ${clip.duration}s`;
  }).join('\n');

  const audioDescriptions = timeline.audioTracks.map(track => 
    `${track.type} audio, volume ${track.volume}, starting at ${track.startTime}s`
  ).join('\n');

  const prompt = `Create a video production script for a ${timeline.duration}s ${timeline.resolution} ${timeline.aspectRatio} video at ${timeline.fps}fps.

TIMELINE:
${sceneDescriptions}

AUDIO:
${audioDescriptions}

BRAND: ${brandKit?.brandName || 'brand'}, niche: ${brandKit?.niche || 'general'}, tone: ${brandKit?.tone || 'professional'}

Generate:
1. A detailed production script with timing
2. A comprehensive video generation prompt for AI video generation

Return JSON:
{
  "script": "detailed production script...",
  "prompt": "AI video generation prompt..."
}`;

  const { universalChat } = await import('./aiService');
  const response = await universalChat(prompt, { model: 'gpt-4o', brandKit });

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (parseError) {
    console.warn('[parseTimelineFromScript] Failed to parse AI response as JSON:', parseError instanceof Error ? parseError.message : 'Unknown error');
  }

  return {
    script: response,
    prompt: `Create a ${timeline.resolution} video with ${timeline.aspectRatio} aspect ratio.`,
  };
}

export function getTimelineDuration(timeline: VideoTimeline): number {
  const lastClip = timeline.clips[timeline.clips.length - 1];
  if (!lastClip) return timeline.duration;
  return lastClip.startTime + lastClip.duration;
}

export function getTimelineStatus(timeline: VideoTimeline): {
  totalClips: number;
  totalDuration: number;
  hasAudio: boolean;
  hasTextOverlays: boolean;
  estimatedRenderTime: number;
} {
  return {
    totalClips: timeline.clips.length,
    totalDuration: getTimelineDuration(timeline),
    hasAudio: timeline.audioTracks.length > 0,
    hasTextOverlays: timeline.clips.some(c => c.textOverlay),
    estimatedRenderTime: Math.ceil(getTimelineDuration(timeline) * 2),
  };
}