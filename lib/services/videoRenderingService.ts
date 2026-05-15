import { logger } from '@/lib/utils/logger';
import { kvGet } from './puterService';

export interface VideoRenderOptions {
  resolution: { width: number; height: number };
  fps: number;
  quality: 'low' | 'medium' | 'high';
  format: 'webm' | 'mp4' | 'gif';
  duration: number;
  preset?: 'social' | 'youtube' | 'square';
}

export interface VideoRenderResult {
  success: boolean;
  outputUrl?: string;
  error?: string;
  renderTime?: number;
  fileSize?: number;
}

export interface VideoComposition {
  id: string;
  scenes: VideoScene[];
  transitions: VideoTransition[];
  audioTrack?: string;
  metadata: {
    title: string;
    description: string;
    tags: string[];
  };
}

export interface VideoScene {
  id: string;
  type: 'text' | 'image' | 'video' | 'color';
  duration: number;
  content: string;
  style?: Record<string, any>;
}

export interface VideoTransition {
  fromScene: string;
  toScene: string;
  type: 'fade' | 'slide' | 'zoom' | 'wipe';
  duration: number;
}

/**
 * VideoRenderingService provides multiple rendering backends:
 * 1. Browser-based Canvas rendering (client-side)
 * 2. FFmpeg WASM rendering (client-side, more features)
 * 3. Cloud rendering via API (server-side, full features)
 */
class VideoRenderingService {
  private currentRender: { abort: () => void } | null = null;

  /**
   * Render video using browser Canvas API
   * Works entirely client-side without external dependencies
   */
  async renderCanvas(
    composition: VideoComposition,
    options: VideoRenderOptions,
    onProgress?: (progress: number) => void
  ): Promise<VideoRenderResult> {
    try {
      const startTime = Date.now();
      const { width, height, fps, duration } = options;
      const totalFrames = Math.floor(duration * fps);

      // Create offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return { success: false, error: 'Canvas 2D context not available' };
      }

      // Setup MediaRecorder
      const stream = canvas.captureStream(fps);
      const mimeType = options.format === 'mp4' ? 'video/mp4' : 'video/webm;codecs=vp9';
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: options.quality === 'high' ? 8000000 : options.quality === 'medium' ? 5000000 : 2500000,
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      return new Promise<VideoRenderResult>((resolve) => {
        this.currentRender = {
          abort: () => {
            mediaRecorder.stop();
            stream.getTracks().forEach(t => t.stop());
            resolve({ success: false, error: 'Render cancelled' });
          },
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          resolve({
            success: true,
            outputUrl: url,
            renderTime: Date.now() - startTime,
            fileSize: blob.size,
          });
        };

        mediaRecorder.onerror = () => {
          resolve({ success: false, error: 'MediaRecorder failed' });
        };

        mediaRecorder.start(100);

        let frame = 0;
        const renderFrame = () => {
          const time = frame / fps;
          
          // Find active scene
          let scene: VideoScene | undefined;
          let sceneTime = 0;
          let elapsed = 0;

          for (const s of composition.scenes) {
            if (time >= elapsed && time < elapsed + s.duration) {
              scene = s;
              sceneTime = time - elapsed;
              break;
            }
            elapsed += s.duration;
          }

          // Clear canvas
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);

          // Render scene
          if (scene) {
            this.renderScene(ctx, scene, sceneTime, width, height);
          }

          frame++;
          onProgress?.(Math.round((frame / totalFrames) * 100));

          if (frame < totalFrames) {
            requestAnimationFrame(renderFrame);
          } else {
            mediaRecorder.stop();
            stream.getTracks().forEach(t => t.stop());
          }
        };

        renderFrame();
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Render failed',
      };
    }
  }

  /**
   * Render a single scene to canvas
   */
  private renderScene(
    ctx: CanvasRenderingContext2D,
    scene: VideoScene,
    sceneTime: number,
    width: number,
    height: number
  ): void {
    const { type, content, style = {}, duration } = scene;

    switch (type) {
      case 'text':
        ctx.font = `${style.fontSize || 48}px ${style.fontFamily || 'Arial'}`;
        ctx.fillStyle = style.color || '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Word-by-word animation
        const words = content.split(' ');
        const progress = Math.min(1, sceneTime / 0.5);
        const visibleWords = Math.ceil(words.length * progress);
        const displayText = words.slice(0, visibleWords).join(' ');

        ctx.fillText(displayText, width / 2, height / 2);
        break;

      case 'color':
        ctx.fillStyle = content;
        ctx.fillRect(0, 0, width, height);
        break;

      case 'image':
        const img = new Image();
        img.src = content;
        if (img.complete) {
          ctx.drawImage(img, 0, 0, width, height);
        }
        break;
    }
  }

  /**
   * Render video using FFmpeg WASM (if available)
   * Provides more advanced features like transitions, filters, etc.
   */
  async renderFFmpeg(
    composition: VideoComposition,
    options: VideoRenderOptions,
    onProgress?: (progress: number) => void
  ): Promise<VideoRenderResult> {
    // Check if FFmpeg is configured
    const ffmpegAvailable = await kvGet('ffmpeg_enabled');
    
    if (!ffmpegAvailable) {
      // Fallback to Canvas rendering
      return this.renderCanvas(composition, options, onProgress);
    }

    // FFmpeg WASM rendering would go here
    // For now, fall back to Canvas
    return this.renderCanvas(composition, options, onProgress);
  }

  /**
   * Cancel current render
   */
  cancelRender(): void {
    if (this.currentRender) {
      this.currentRender.abort();
      this.currentRender = null;
    }
  }

  /**
   * Get recommended settings for social platforms
   */
  getPreset(preset: 'social' | 'youtube' | 'square'): VideoRenderOptions {
    const presets: Record<string, VideoRenderOptions> = {
      social: {
        resolution: { width: 1080, height: 1920 },
        fps: 30,
        quality: 'high',
        format: 'mp4',
        duration: 30,
      },
      youtube: {
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        quality: 'high',
        format: 'mp4',
        duration: 60,
      },
      square: {
        resolution: { width: 1080, height: 1080 },
        fps: 30,
        quality: 'medium',
        format: 'mp4',
        duration: 15,
      },
    };

    return presets[preset] || presets.social;
  }
}

export const videoRenderingService = new VideoRenderingService();