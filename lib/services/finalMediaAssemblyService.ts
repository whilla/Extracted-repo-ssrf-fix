'use client';

import { persistBlobMediaAsset, type PersistedMediaAsset } from './mediaAssetPersistenceService';
import { Timeline, TimelineAssemblyInput, TimelineAssemblyResult, MediaClipEvent, TextOverlayEvent, ImageOverlayEvent } from '@/lib/types';

/**
 * TimelineRenderer handles the programmatic assembly of a media timeline
 * by playing it back on a canvas and recording the stream.
 */
export class TimelineRenderer {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private activeMedia: Map<string, HTMLMediaElement> = new Map();
  private activeImages: Map<string, HTMLImageElement> = new Map();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.context = this.canvas.getContext('2d')!;
  }

  private async preloadAssets(timeline: Timeline): Promise<void> {
    const loadAsset = async (url: string, type: 'video' | 'audio') => {
      if (this.activeMedia.has(url)) return;
      
      const element = document.createElement(type === 'video' ? 'video' : 'audio');
      element.crossOrigin = 'anonymous';
      element.preload = 'auto';
      element.src = url;

      await new Promise<void>((resolve, reject) => {
        element.onloadedmetadata = () => resolve();
        element.onerror = () => reject(new Error(`Failed to load asset: ${url}`));
      });
      
      this.activeMedia.set(url, element);
    };

    for (const track of timeline.tracks) {
      for (const event of track.events) {
        if ('assetUrl' in event) {
          await loadAsset(event.assetUrl, event.assetType);
        }
      }
    }
  }

  private renderTimelineAtTime(timeline: Timeline, elapsed: number): void {
    this.context.fillStyle = 'black';
    this.context.fillRect(0, 0, this.width, this.height);

    for (const track of timeline.tracks) {
      for (const event of track.events) {
        const isPast = elapsed < event.startTime;
        const isFuture = elapsed >= event.startTime + event.duration;
        if (isPast || isFuture) continue;

        if (event.type === 'video' || event.type === 'audio') {
          const clip = event as MediaClipEvent;
          const media = this.activeMedia.get(clip.assetUrl);
          if (media) {
            const localTime = elapsed - clip.startTime + (clip.startOffset || 0);
            if (Math.abs(media.currentTime - localTime) > 0.1) {
              media.currentTime = localTime;
            }
            if (clip.type === 'video') {
              this.context.globalAlpha = clip.opacity ?? 1;
              this.context.drawImage(media, 0, 0, this.width, this.height);
              this.context.globalAlpha = 1.0;
            }
          }
        } else if (event.type === 'text') {
          const textEvent = event as TextOverlayEvent;
          this.context.fillStyle = textEvent.color || 'white';
          this.context.font = `${textEvent.fontSize || 48}px sans-serif`;
          this.context.textAlign = textEvent.textAlign || 'center';
          this.context.fillText(textEvent.text, this.width / 2, this.height / 2);
        } else if (event.type === 'image') {
          const imgEvent = event as ImageOverlayEvent;
          const img = this.activeImages.get(imgEvent.assetUrl);
          if (img) {
            this.context.globalAlpha = imgEvent.opacity ?? 1;
            const scale = imgEvent.scale ?? 1;
            const w = img.naturalWidth * scale;
            const h = img.naturalHeight * scale;
            const x = imgEvent.position?.x ?? (this.width - w) / 2;
            const y = imgEvent.position?.y ?? (this.height - h) / 2;
            this.context.drawImage(img, x, y, w, h);
            this.context.globalAlpha = 1.0;
          }
        }
      }
    }
  }

  async assemble(input: TimelineAssemblyInput): Promise<TimelineAssemblyResult> {
    const { timeline, generationId } = input;
    const warnings: string[] = [];

    if (typeof window === 'undefined') return { asset: null, warnings: ['Browser required'] };

    try {
      await this.preloadAssets(timeline);

      const recorderMimeType = this.getMimeType();
      const canvasStream = this.canvas.captureStream(30);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
      ]);

      const recorder = new MediaRecorder(combinedStream, { mimeType: recorderMimeType });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      const completion = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: recorderMimeType }));
      });

      recorder.start();

      const startTime = performance.now();
      let animationFrameId = 0;

      const renderLoop = () => {
        const elapsed = (performance.now() - startTime) / 1000;
        this.renderTimelineAtTime(timeline, elapsed);

        if (elapsed < timeline.duration) {
          animationFrameId = window.requestAnimationFrame(renderLoop);
        } else {
          window.cancelAnimationFrame(animationFrameId);
          recorder.stop();
        }
      };

      renderLoop();
      const blob = await completion;

      // CLEANUP: Clear cached assets to prevent memory leaks
      this.activeMedia.clear();
      this.activeImages.clear();

      const persisted = await persistBlobMediaAsset(blob, {
        kind: 'video',
        generationId: generationId || `gen_${Date.now()}`,
        fileExtension: recorderMimeType.includes('webm') ? 'webm' : 'mp4',
      });

      return { asset: persisted, warnings };
    } catch (error) {
      return { asset: null, warnings: [error instanceof Error ? error.message : 'Assembly failed'] };
    }
  }

  private getMimeType(): string {
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return 'video/webm';
  }
}
