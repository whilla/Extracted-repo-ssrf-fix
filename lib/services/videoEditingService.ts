import { logger } from '@/lib/utils/logger';
import { createConfigError } from './configError';

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio' | 'text' | 'image';
  mediaUrl?: string;
  startTime: number;
  endTime: number;
  volume?: number;
  text?: string;
  style?: Record<string, any>;
}

export interface Transition {
  type: 'fade' | 'dissolve' | 'wipe' | 'slide' | 'zoom';
  duration: number;
}

export interface Timeline {
  tracks: TimelineTrack[];
  transitions: Map<string, Transition>;
  duration: number;
  resolution: { width: number; height: number };
}

export interface VideoEditResult {
  success: boolean;
  outputUrl?: string;
  error?: string;
}

export class VideoEditingService {
  private static timeline: Timeline | null = null;

  static createTimeline(resolution: { width: number; height: number } = { width: 1920, height: 1080 }): Timeline {
    this.timeline = {
      tracks: [],
      transitions: new Map(),
      duration: 0,
      resolution,
    };
    return this.timeline;
  }

  static addTrack(track: TimelineTrack): void {
    if (!this.timeline) {
      this.createTimeline();
    }
    this.timeline!.tracks.push(track);
    const trackEnd = track.endTime;
    if (trackEnd > this.timeline!.duration) {
      this.timeline!.duration = trackEnd;
    }
  }

  static addTransition(trackId1: string, trackId2: string, transition: Transition): void {
    if (!this.timeline) return;
    this.timeline.transitions.set(`${trackId1}-${trackId2}`, transition);
  }

  /**
   * Render timeline to a video using Canvas API + MediaRecorder
   * Works in-browser for simple compositions. For complex rendering, use backend API.
   */
  static async renderTimeline(
    onProgress?: (progress: number) => void
  ): Promise<VideoEditResult> {
    try {
      if (!this.timeline) {
        return { success: false, error: 'No timeline created' };
      }

      if (this.timeline.tracks.length === 0) {
        return { success: false, error: 'Timeline has no tracks to render' };
      }

      logger.info('[VideoEditingService] Starting canvas-based render', {
        tracks: this.timeline.tracks.length,
        duration: this.timeline.duration,
        resolution: this.timeline.resolution,
      });

      const { width, height } = this.timeline.resolution;
      const duration = this.timeline.duration;
      const fps = 24;
      const totalFrames = Math.floor(duration * fps);

      // Create offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { success: false, error: 'Canvas 2D context not available' };
      }

      // Setup MediaRecorder for WebM output
      const stream = canvas.captureStream(fps);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 5000000,
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      return new Promise<VideoEditResult>((resolve) => {
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          resolve({ success: true, outputUrl: url });
        };

        mediaRecorder.onerror = () => {
          resolve({ success: false, error: 'MediaRecorder failed during rendering' });
        };

        mediaRecorder.start(100); // Collect data every 100ms

        let frame = 0;
        const renderFrame = () => {
          const time = frame / fps;

          // Clear canvas
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);

          // Render each track
          for (const track of this.timeline!.tracks) {
            if (time >= track.startTime && time <= track.endTime) {
              const trackProgress = (time - track.startTime) / (track.endTime - track.startTime);

              switch (track.type) {
                case 'text':
                  if (track.text) {
                    const style = track.style || {};
                    ctx.font = `${style.fontSize || 48}px ${style.fontFamily || 'Arial'}`;
                    ctx.fillStyle = style.color || '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const y = style.position === 'top' ? height * 0.15 :
                              style.position === 'bottom' ? height * 0.85 : height * 0.5;
                    
                    if (style.background) {
                      const metrics = ctx.measureText(track.text);
                      const pad = 20;
                      ctx.fillStyle = style.background;
                      ctx.fillRect(
                        (width - metrics.width) / 2 - pad,
                        y - (style.fontSize || 48) / 2 - pad / 2,
                        metrics.width + pad * 2,
                        (style.fontSize || 48) + pad
                      );
                      ctx.fillStyle = style.color || '#ffffff';
                    }
                    
                    ctx.fillText(track.text, width / 2, y);
                  }
                  break;

                case 'image':
                case 'video':
                  if (track.mediaUrl) {
                    const img = new Image();
                    img.src = track.mediaUrl;
                    if (img.complete) {
                      ctx.globalAlpha = track.style?.opacity || 1;
                      ctx.drawImage(img, 0, 0, width, height);
                      ctx.globalAlpha = 1;
                    }
                  }
                  break;
              }
            }
          }

          frame++;
          if (frame < totalFrames) {
            onProgress?.(Math.round((frame / totalFrames) * 100));
            requestAnimationFrame(renderFrame);
          } else {
            mediaRecorder.stop();
            stream.getTracks().forEach(track => track.stop());
          }
        };

        // Preload images before starting
        const imageUrls = this.timeline!.tracks
          .filter(t => (t.type === 'image' || t.type === 'video') && t.mediaUrl)
          .map(t => t.mediaUrl!);
        
        if (imageUrls.length === 0) {
          renderFrame();
        } else {
          let loaded = 0;
          imageUrls.forEach(url => {
            const img = new Image();
            img.onload = () => {
              loaded++;
              if (loaded === imageUrls.length) renderFrame();
            };
            img.onerror = () => {
              loaded++;
              if (loaded === imageUrls.length) renderFrame();
            };
            img.src = url;
          });
        }
      });
    } catch (error) {
      logger.error('[VideoEditingService] Render error', error as any);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown render error',
      };
    }
  }

  static addTextOverlay(
    text: string,
    startTime: number,
    endTime: number,
    style?: {
      fontSize?: number;
      fontFamily?: string;
      color?: string;
      position?: 'top' | 'center' | 'bottom';
      background?: string;
    }
  ): void {
    this.addTrack({
      id: `text_${Date.now()}`,
      type: 'text',
      startTime,
      endTime,
      text,
      style: style || {},
    });
  }

  static addBrollOverlay(
    mediaUrl: string,
    startTime: number,
    endTime: number,
    opacity: number = 1
  ): void {
    this.addTrack({
      id: `broll_${Date.now()}`,
      type: 'video',
      mediaUrl,
      startTime,
      endTime,
      style: { opacity },
    });
  }

  static addFadeTransition(
    trackId1: string,
    trackId2: string,
    duration: number = 1
  ): void {
    this.addTransition(trackId1, trackId2, {
      type: 'fade',
      duration,
    });
  }

  static trimTrack(trackId: string, newStart: number, newEnd: number): void {
    if (!this.timeline) return;
    const track = this.timeline.tracks.find(t => t.id === trackId);
    if (track) {
      track.startTime = newStart;
      track.endTime = newEnd;
    }
  }

  static getTimeline(): Timeline | null {
    return this.timeline;
  }
}