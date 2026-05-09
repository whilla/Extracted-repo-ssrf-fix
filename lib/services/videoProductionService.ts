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
    status: 'rendering',
    progress: 0,
    startedAt: new Date().toISOString(),
  };

  const jobsData = await kvGet(RENDER_JOBS_KEY);
  const jobs: RenderJob[] = jobsData ? JSON.parse(jobsData) : [];
  jobs.unshift(job);
  await kvSet(RENDER_JOBS_KEY, JSON.stringify(jobs.slice(0, 50)));

  simulateRenderProgress(job.id);

  return job;
}

async function simulateRenderProgress(jobId: string) {
  let progress = 0;
  
  const interval = setInterval(async () => {
    progress += Math.random() * 15;
    if (progress > 100) progress = 100;

    const jobsData = await kvGet(RENDER_JOBS_KEY);
    const jobs: RenderJob[] = jobsData ? JSON.parse(jobsData) : [];
    const jobIndex = jobs.findIndex(j => j.id === jobId);
    
    if (jobIndex !== -1) {
      jobs[jobIndex].progress = Math.round(progress);
      
      if (progress >= 100) {
        jobs[jobIndex].status = 'completed';
        jobs[jobIndex].completedAt = new Date().toISOString();
        jobs[jobIndex].outputUrl = `https://example.com/rendered/${jobId}.mp4`;
        
        const timelineId = jobs[jobIndex].timelineId;
        const timelines = await loadTimelines();
        const tIndex = timelines.findIndex(t => t.id === timelineId);
        if (tIndex !== -1) {
          timelines[tIndex].status = 'completed';
          timelines[tIndex].renderedUrl = jobs[jobIndex].outputUrl;
          await saveTimelines(timelines);
        }
      }
      
      await kvSet(RENDER_JOBS_KEY, JSON.stringify(jobs));
    }

    if (progress >= 100) {
      clearInterval(interval);
    }
  }, 2000);
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
  } catch {}

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