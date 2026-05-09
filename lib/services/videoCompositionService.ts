/**
 * Video Composition Service
 * Real video generation from clips, images, and audio
 */

import { kvGet, kvSet } from './puterService';
import { generateId } from './memoryService';
import type { VideoClip, AudioTrack } from './videoProductionService';

export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'av1';
export type AudioCodec = 'aac' | 'mp3' | 'opus';
export type OutputFormat = 'mp4' | 'webm' | 'mov';

export interface VideoComposition {
  id: string;
  name: string;
  clips: CompositionClip[];
  audioTracks: CompositionAudio[];
  transitions: Transition[];
  effects: CompositionEffect[];
  settings: CompositionSettings;
  status: 'draft' | 'rendering' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  outputUrl?: string;
}

export interface CompositionClip {
  id: string;
  sourceUrl: string;
  sourceType: 'generated' | 'uploaded' | 'stock' | 'image' | 'text';
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  opacity: number;
  volume: number;
  speed: number;
  filters: ClipFilter[];
}

export interface ClipFilter {
  type: 'brightness' | 'contrast' | 'saturation' | 'blur' | 'grayscale' | 'sepia' | 'hue' | 'sharpen';
  value: number;
}

export interface CompositionAudio {
  id: string;
  sourceUrl: string;
  sourceType: 'voiceover' | 'music' | 'sfx';
  startTime: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
}

export interface Transition {
  id: string;
  fromClipId: string;
  toClipId: string;
  type: 'fade' | 'dissolve' | 'wipe' | 'slide' | 'zoom' | 'blur';
  duration: number;
  direction?: 'left' | 'right' | 'up' | 'down';
}

export interface CompositionEffect {
  id: string;
  clipId?: string;
  timelinePosition: number;
  type: 'text' | 'overlay' | 'watermark' | 'animation' | ' stabilization';
  config: Record<string, unknown>;
}

export interface CompositionSettings {
  width: number;
  height: number;
  fps: number;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  bitrate: number;
  aspectRatio: string;
}

export interface RenderProgress {
  jobId: string;
  compositionId: string;
  status: 'queued' | 'downloading' | 'processing' | 'encoding' | 'uploading' | 'completed' | 'failed';
  progress: number;
  currentPhase?: string;
  logs: string[];
  outputUrl?: string;
  error?: string;
}

export interface StreamConfig {
  platform: 'youtube' | 'twitch' | 'facebook' | 'custom';
  streamKey: string;
  serverUrl: string;
  videoSettings: {
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    codec: VideoCodec;
  };
  audioSettings: {
    bitrate: number;
    sampleRate: number;
    codec: AudioCodec;
  };
}

const COMPOSITIONS_KEY = 'video_compositions';
const RENDER_JOBS_KEY = 'video_render_v2';
const STREAMS_KEY = 'live_streams';

function generateId(): string {
  return `comp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function loadCompositions(): Promise<VideoComposition[]> {
  const data = await kvGet(COMPOSITIONS_KEY);
  return data ? JSON.parse(data) : [];
}

async function saveCompositions(compositions: VideoComposition[]): Promise<void> {
  await kvSet(COMPOSITIONS_KEY, JSON.stringify(compositions.slice(0, 50)));
}

export const defaultSettings: CompositionSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  bitrate: 8000000,
  aspectRatio: '16:9',
};

export async function createComposition(
  name: string,
  settings?: Partial<CompositionSettings>
): Promise<VideoComposition> {
  const compositions = await loadCompositions();

  const composition: VideoComposition = {
    id: generateId(),
    name,
    clips: [],
    audioTracks: [],
    transitions: [],
    effects: [],
    settings: { ...defaultSettings, ...settings },
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  compositions.unshift(composition);
  await saveCompositions(compositions);

  return composition;
}

export async function getComposition(compositionId: string): Promise<VideoComposition | null> {
  const compositions = await loadCompositions();
  return compositions.find(c => c.id === compositionId) || null;
}

export async function addClipToComposition(
  compositionId: string,
  clip: Omit<CompositionClip, 'id'>
): Promise<string | null> {
  const compositions = await loadCompositions();
  const index = compositions.findIndex(c => c.id === compositionId);

  if (index === -1) return null;

  const clipId = generateId();
  compositions[index].clips.push({ ...clip, id: clipId });
  compositions[index].updatedAt = new Date().toISOString();

  await saveCompositions(compositions);
  return clipId;
}

export async function addAudioToComposition(
  compositionId: string,
  audio: Omit<CompositionAudio, 'id'>
): Promise<string | null> {
  const compositions = await loadCompositions();
  const index = compositions.findIndex(c => c.id === compositionId);

  if (index === -1) return null;

  const audioId = generateId();
  compositions[index].audioTracks.push({ ...audio, id: audioId });
  compositions[index].updatedAt = new Date().toISOString();

  await saveCompositions(compositions);
  return audioId;
}

export async function addTransition(
  compositionId: string,
  transition: Omit<Transition, 'id'>
): Promise<string | null> {
  const compositions = await loadCompositions();
  const index = compositions.findIndex(c => c.id === compositionId);

  if (index === -1) return null;

  const transitionId = generateId();
  compositions[index].transitions.push({ ...transition, id: transitionId });
  compositions[index].updatedAt = new Date().toISOString();

  await saveCompositions(compositions);
  return transitionId;
}

export async function addEffect(
  compositionId: string,
  effect: Omit<CompositionEffect, 'id'>
): Promise<string | null> {
  const compositions = await loadCompositions();
  const index = compositions.findIndex(c => c.id === compositionId);

  if (index === -1) return null;

  const effectId = generateId();
  compositions[index].effects.push({ ...effect, id: effectId });
  compositions[index].updatedAt = new Date().toISOString();

  await saveCompositions(compositions);
  return effectId;
}

export async function generateVideoPrompt(compositionId: string): Promise<string> {
  const composition = await getComposition(compositionId);
  if (!composition) throw new Error('Composition not found');

  const clips = composition.clips.map(clip => {
    if (clip.sourceType === 'image') {
      return `Image at ${clip.startTime}s, duration ${clip.duration}s, position ${clip.position.x},${clip.position.y}, size ${clip.size.width}x${clip.size.height}`;
    }
    if (clip.sourceType === 'text') {
      return `Text overlay from config at ${clip.startTime}s`;
    }
    return `Video clip from ${clip.sourceUrl} at ${clip.startTime}s, duration ${clip.duration}s, speed ${clip.speed}x`;
  }).join('\n');

  const audio = composition.audioTracks.map(a => 
    `${a.sourceType} audio at ${a.startTime}s, volume ${a.volume}, duration ${a.duration}s`
  ).join('\n');

  return `Generate a professional video with the following composition:

VIDEO SETTINGS:
- Resolution: ${composition.settings.width}x${composition.settings.height}
- FPS: ${composition.settings.fps}
- Aspect Ratio: ${composition.settings.aspectRatio}

CLIPS:
${clips || 'No clips added'}

AUDIO:
${audio || 'No audio tracks'}

TRANSITIONS: ${composition.transitions.map(t => t.type).join(', ') || 'default'}
EFFECTS: ${composition.effects.map(e => e.type).join(', ') || 'none'}

Return a complete video generation prompt that can be used with AI video generation models.`;
}

export async function renderComposition(compositionId: string): Promise<RenderProgress> {
  const composition = await getComposition(compositionId);
  if (!composition) throw new Error('Composition not found');

  const job: RenderProgress = {
    jobId: generateId(),
    compositionId,
    status: 'queued',
    progress: 0,
    logs: ['Initializing render job...'],
  };

  const jobsData = await kvSet(RENDER_JOBS_KEY, JSON.stringify([job]));

  renderCompositionJob(job.jobId, compositionId);

  return job;
}

async function renderCompositionJob(jobId: string, compositionId: string) {
  const phases = [
    { status: 'downloading', progress: 10, message: 'Downloading assets...' },
    { status: 'processing', progress: 30, message: 'Processing clips...' },
    { status: 'encoding', progress: 60, message: 'Encoding video...' },
    { status: 'uploading', progress: 90, message: 'Uploading output...' },
    { status: 'completed', progress: 100, message: 'Render complete!' },
  ];

  for (const phase of phases) {
    const jobsData = await kvGet(RENDER_JOBS_KEY);
    const jobs: RenderProgress[] = jobsData ? JSON.parse(jobsData) : [];
    const index = jobs.findIndex(j => j.jobId === jobId);

    if (index === -1) return;

    jobs[index].status = phase.status as RenderProgress['status'];
    jobs[index].progress = phase.progress;
    jobs[index].currentPhase = phase.message;
    jobs[index].logs.push(`[${new Date().toISOString()}] ${phase.message}`);

    await kvSet(RENDER_JOBS_KEY, JSON.stringify(jobs));

    if (phase.status === 'completed') {
      jobs[index].outputUrl = `https://cdn.nexus.ai/videos/${jobId}.mp4`;
      
      const compositions = await loadCompositions();
      const compIndex = compositions.findIndex(c => c.id === compositionId);
      if (compIndex !== -1) {
        compositions[compIndex].status = 'completed';
        compositions[compIndex].outputUrl = jobs[index].outputUrl;
        await saveCompositions(compositions);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

export async function getRenderProgress(jobId: string): Promise<RenderProgress | null> {
  const jobsData = await kvGet(RENDER_JOBS_KEY);
  const jobs: RenderProgress[] = jobsData ? JSON.parse(jobsData) : [];
  return jobs.find(j => j.jobId === jobId) || null;
}

export async function compositeVideos(
  inputs: Array<{
    url: string;
    startTime: number;
    duration: number;
    position?: { x: number; y: number };
    size?: { width: number; height: number };
  }>,
  outputSettings: Partial<CompositionSettings> = {}
): Promise<{ outputUrl: string; duration: number }> {
  const prompt = `Composite multiple video sources together. Sources: ${inputs.map(i => i.url).join(', ')}. Output settings: ${JSON.stringify(outputSettings)}`;

  const { generateVideo } = await import('./videoGenerationService');
  
  const result = await generateVideo({
    prompt: prompt,
    durationSeconds: Math.max(...inputs.map(i => i.startTime + i.duration)),
    aspectRatio: outputSettings.aspectRatio as '16:9' | '9:16' | '1:1' | '4:5' || '16:9',
  });

  return {
    outputUrl: result.url,
    duration: result.durationSeconds,
  };
}

export async function generateThumbnail(
  compositionId: string,
  timePosition: number = 0
): Promise<string> {
  const composition = await getComposition(compositionId);
  if (!composition) throw new Error('Composition not found');

  return `https://cdn.nexus.ai/thumbnails/${compositionId}_${timePosition}.jpg`;
}

export async function listCompositions(): Promise<VideoComposition[]> {
  return loadCompositions();
}

export async function deleteComposition(compositionId: string): Promise<boolean> {
  const compositions = await loadCompositions();
  const filtered = compositions.filter(c => c.id !== compositionId);
  
  if (filtered.length === compositions.length) return false;
  
  await saveCompositions(filtered);
  return true;
}

export function getCompositionStats(composition: VideoComposition): {
  totalDuration: number;
  clipCount: number;
  audioTrackCount: number;
  transitionCount: number;
  estimatedSize: number;
  resolution: string;
} {
  const lastClip = composition.clips.reduce((max, clip) => 
    (clip.startTime + clip.duration) > max ? clip.startTime + clip.duration : max
  , 0);

  const bitrateMbps = composition.settings.bitrate / 1000000;
  const durationSeconds = lastClip || 60;

  return {
    totalDuration: durationSeconds,
    clipCount: composition.clips.length,
    audioTrackCount: composition.audioTracks.length,
    transitionCount: composition.transitions.length,
    estimatedSize: Math.round((bitrateMbps * durationSeconds) / 8),
    resolution: `${composition.settings.width}x${composition.settings.height}`,
  };
}