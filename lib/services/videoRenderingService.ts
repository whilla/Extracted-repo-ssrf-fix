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

interface PreloadedAssets {
  images: Map<string, HTMLImageElement>;
  videos: Map<string, HTMLVideoElement>;
  audioBuffer: AudioBuffer | null;
}

class VideoRenderingService {
  private currentRender: { abort: () => void } | null = null;

  async renderCanvas(
    composition: VideoComposition,
    options: VideoRenderOptions,
    onProgress?: (progress: number) => void
  ): Promise<VideoRenderResult> {
    try {
      const startTime = Date.now();
      const { fps, duration } = options;
      const width = options.resolution.width;
      const height = options.resolution.height;
      const totalFrames = Math.floor(duration * fps);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return { success: false, error: 'Canvas 2D context not available' };
      }

      const preloaded = await this.preloadAssets(composition);

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
            this.cleanupPreloaded(preloaded);
            resolve({ success: false, error: 'Render cancelled' });
          },
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          this.cleanupPreloaded(preloaded);
          resolve({
            success: true,
            outputUrl: url,
            renderTime: Date.now() - startTime,
            fileSize: blob.size,
          });
        };

        mediaRecorder.onerror = () => {
          this.cleanupPreloaded(preloaded);
          resolve({ success: false, error: 'MediaRecorder failed' });
        };

        mediaRecorder.start(100);

        let frame = 0;
        const renderFrame = () => {
          const time = frame / fps;

          let scene: VideoScene | undefined;
          let sceneTime = 0;
          let elapsed = 0;
          let sceneIndex = -1;

          for (let i = 0; i < composition.scenes.length; i++) {
            const s = composition.scenes[i];
            if (time >= elapsed && time < elapsed + s.duration) {
              scene = s;
              sceneTime = time - elapsed;
              sceneIndex = i;
              break;
            }
            elapsed += s.duration;
          }

          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);

          if (scene) {
            const transition = this.getActiveTransition(composition.transitions, scene.id, sceneTime, scene.duration);
            if (transition) {
              this.renderTransition(ctx, transition, scene, sceneTime, scene.duration, width, height, preloaded);
            } else {
              this.renderScene(ctx, scene, sceneTime, width, height, preloaded);
            }
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

  async renderWithAudio(
    composition: VideoComposition,
    options: VideoRenderOptions,
    onProgress?: (progress: number) => void
  ): Promise<VideoRenderResult> {
    try {
      const startTime = Date.now();
      const { fps, duration } = options;
      const width = options.resolution.width;
      const height = options.resolution.height;
      const totalFrames = Math.floor(duration * fps);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return { success: false, error: 'Canvas 2D context not available' };
      }

      const preloaded = await this.preloadAssets(composition);

      const videoStream = canvas.captureStream(fps);

      let audioDestination: MediaStreamAudioDestinationNode | null = null;
      let audioContext: AudioContext | null = null;
      let combinedStream: MediaStream;

      if (composition.audioTrack && preloaded.audioBuffer) {
        audioContext = new AudioContext();
        audioDestination = audioContext.createMediaStreamDestination();
        const source = audioContext.createBufferSource();
        source.buffer = preloaded.audioBuffer;
        source.connect(audioDestination);
        source.loop = false;

        const totalDuration = composition.scenes.reduce((sum, s) => sum + s.duration, 0);
        if (preloaded.audioBuffer.duration < totalDuration) {
          source.loop = true;
        }

        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.8;
        source.disconnect();
        source.connect(gainNode);
        gainNode.connect(audioDestination);

        source.start(0);

        combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...audioDestination.stream.getAudioTracks(),
        ]);
      } else {
        combinedStream = videoStream;
      }

      const mimeType = options.format === 'mp4' ? 'video/mp4' : 'video/webm;codecs=vp9';

      const mediaRecorder = new MediaRecorder(combinedStream, {
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
            if (audioContext) audioContext.close();
            videoStream.getTracks().forEach(t => t.stop());
            this.cleanupPreloaded(preloaded);
            resolve({ success: false, error: 'Render cancelled' });
          },
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          if (audioContext) audioContext.close();
          this.cleanupPreloaded(preloaded);
          resolve({
            success: true,
            outputUrl: url,
            renderTime: Date.now() - startTime,
            fileSize: blob.size,
          });
        };

        mediaRecorder.onerror = () => {
          if (audioContext) audioContext.close();
          this.cleanupPreloaded(preloaded);
          resolve({ success: false, error: 'MediaRecorder failed' });
        };

        mediaRecorder.start(100);

        let frame = 0;
        const renderFrame = () => {
          const time = frame / fps;

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

          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);

          if (scene) {
            const transition = this.getActiveTransition(composition.transitions, scene.id, sceneTime, scene.duration);
            if (transition) {
              this.renderTransition(ctx, transition, scene, sceneTime, scene.duration, width, height, preloaded);
            } else {
              this.renderScene(ctx, scene, sceneTime, width, height, preloaded);
            }
          }

          frame++;
          onProgress?.(Math.round((frame / totalFrames) * 100));

          if (frame < totalFrames) {
            requestAnimationFrame(renderFrame);
          } else {
            mediaRecorder.stop();
            videoStream.getTracks().forEach(t => t.stop());
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

  async renderFFmpeg(
    composition: VideoComposition,
    options: VideoRenderOptions,
    onProgress?: (progress: number) => void
  ): Promise<VideoRenderResult> {
    const ffmpegAvailable = await kvGet('ffmpeg_enabled');

    if (!ffmpegAvailable) {
      if (composition.audioTrack) {
        return this.renderWithAudio(composition, options, onProgress);
      }
      return this.renderCanvas(composition, options, onProgress);
    }

    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg' as string);
      const { fetchFile } = await import('@ffmpeg/util' as string);
      const ffmpeg = new FFmpeg();

      await ffmpeg.load({
        coreURL: await fetch('/ffmpeg/ffmpeg-core.js').then(r => r.url),
        wasmURL: await fetch('/ffmpeg/ffmpeg-core.wasm').then(r => r.url),
      });

      const { width, height } = this.parseResolution(options);
      const fps = options.fps || 30;

      await ffmpeg.writeFile('config.txt', this.buildFFmpegConfig(composition, width, height, fps));
      await ffmpeg.exec(['-y', '-f', 'concat', '-safe', '0', '-i', 'config.txt', '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', 'output.mp4']);

      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data as Uint8Array], { type: 'video/mp4' });
      const outputUrl = URL.createObjectURL(blob);

      onProgress?.(100);
      return { success: true, outputUrl, renderTime: 0, fileSize: blob.size };
    } catch (error) {
      logger.warn('[VideoRenderingService]', 'FFmpeg render failed, falling back to canvas', error as any);
      if (composition.audioTrack) {
        return this.renderWithAudio(composition, options, onProgress);
      }
      return this.renderCanvas(composition, options, onProgress);
    }
  }

  private buildFFmpegConfig(composition: VideoComposition, width: number, height: number, fps: number): string {
    const lines: string[] = [];
    for (const scene of composition.scenes) {
      const mediaUrl = scene.style?.mediaUrl || scene.content;
      if (scene.type === 'image' && mediaUrl) {
        const duration = scene.duration || 5;
        lines.push(`file '${mediaUrl}'`);
        lines.push(`duration ${duration}`);
      } else if (scene.type === 'video' && mediaUrl) {
        lines.push(`file '${mediaUrl}'`);
      } else if (scene.type === 'color') {
        const duration = scene.duration || 5;
        const color = scene.style?.color || scene.content || '#000000';
        lines.push(`file 'color:${color}:s=${width}x${height}:r=${fps}:d=${duration}'`);
        lines.push(`duration ${duration}`);
      }
    }
    return lines.join('\n');
  }

  private parseResolution(options: VideoRenderOptions): { width: number; height: number } {
    if (options.resolution?.width && options.resolution?.height) {
      return { width: options.resolution.width, height: options.resolution.height };
    }
    switch ((options.preset || '').toLowerCase()) {
      case 'social':
      case 'vertical': return { width: 1080, height: 1920 };
      case 'square': return { width: 1080, height: 1080 };
      case 'youtube': return { width: 1920, height: 1080 };
      default: return { width: 1920, height: 1080 };
    }
  }

  private async preloadAssets(composition: VideoComposition): Promise<PreloadedAssets> {
    const images = new Map<string, HTMLImageElement>();
    const videos = new Map<string, HTMLVideoElement>();
    let audioBuffer: AudioBuffer | null = null;

    const imageScenes = composition.scenes.filter(s => s.type === 'image');
    const videoScenes = composition.scenes.filter(s => s.type === 'video');

    const imagePromises = imageScenes.map(async (scene) => {
      return new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          images.set(scene.content, img);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = scene.content;
      });
    });

    const videoPromises = videoScenes.map(async (scene) => {
      return new Promise<void>((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.onloadeddata = () => {
          videos.set(scene.content, video);
          resolve();
        };
        video.onerror = () => resolve();
        video.src = scene.content;
      });
    });

    if (composition.audioTrack) {
      try {
        const audioContext = new AudioContext();
        const response = await fetch(composition.audioTrack);
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        await audioContext.close();
      } catch {
        audioBuffer = null;
      }
    }

    await Promise.all([...imagePromises, ...videoPromises]);

    return { images, videos, audioBuffer };
  }

  private cleanupPreloaded(preloaded: PreloadedAssets): void {
    preloaded.videos.forEach(video => {
      video.pause();
      video.src = '';
      video.load();
    });
    preloaded.videos.clear();
    preloaded.images.clear();
  }

  private renderScene(
    ctx: CanvasRenderingContext2D,
    scene: VideoScene,
    sceneTime: number,
    width: number,
    height: number,
    preloaded: PreloadedAssets
  ): void {
    const { type, content, style = {}, duration } = scene;

    switch (type) {
      case 'text':
        ctx.font = `${style.fontSize || 48}px ${style.fontFamily || 'Arial'}`;
        ctx.fillStyle = style.color || '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

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

      case 'image': {
        const img = preloaded.images.get(content);
        if (img) {
          const fadeIn = Math.min(1, sceneTime / 0.3);
          ctx.globalAlpha = fadeIn;
          const scale = style.fit || 'cover';
          if (scale === 'contain') {
            const ratio = Math.min(width / img.width, height / img.height);
            const w = img.width * ratio;
            const h = img.height * ratio;
            ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
          } else {
            const ratio = Math.max(width / img.width, height / img.height);
            const w = img.width * ratio;
            const h = img.height * ratio;
            ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
          }
          ctx.globalAlpha = 1;
        } else {
          const fallbackImg = new Image();
          fallbackImg.crossOrigin = 'anonymous';
          fallbackImg.src = content;
          if (fallbackImg.complete && fallbackImg.naturalWidth > 0) {
            ctx.drawImage(fallbackImg, 0, 0, width, height);
          }
        }
        break;
      }

      case 'video': {
        const video = preloaded.videos.get(content);
        if (video) {
          const seekTime = sceneTime % video.duration;
          if (Math.abs(video.currentTime - seekTime) > 0.1) {
            video.currentTime = seekTime;
          }
          if (video.paused) {
            video.play().catch(() => {});
          }
          ctx.drawImage(video, 0, 0, width, height);
        } else {
          const fallbackVideo = document.createElement('video');
          fallbackVideo.crossOrigin = 'anonymous';
          fallbackVideo.muted = true;
          fallbackVideo.src = content;
          fallbackVideo.currentTime = sceneTime;
          fallbackVideo.onseeked = () => {
            ctx.drawImage(fallbackVideo, 0, 0, width, height);
          };
        }
        break;
      }
    }
  }

  private getActiveTransition(
    transitions: VideoTransition[],
    currentSceneId: string,
    sceneTime: number,
    sceneDuration: number
  ): (VideoTransition & { progress?: number; direction?: 'enter' | 'exit' }) | null {
    for (const t of transitions) {
      if (t.toScene === currentSceneId && sceneTime < t.duration) {
        return { ...t, progress: sceneTime / t.duration };
      }
      if (t.fromScene === currentSceneId && sceneTime > sceneDuration - t.duration) {
        const exitTime = sceneTime - (sceneDuration - t.duration);
        return { ...t, progress: exitTime / t.duration, direction: 'exit' as const };
      }
    }
    return null;
  }

  private renderTransition(
    ctx: CanvasRenderingContext2D,
    transition: VideoTransition & { progress?: number; direction?: 'enter' | 'exit' },
    scene: VideoScene,
    sceneTime: number,
    sceneDuration: number,
    width: number,
    height: number,
    preloaded: PreloadedAssets
  ): void {
    const progress = transition.progress ?? 0;
    const direction = transition.direction ?? 'enter';
    const eased = this.easeInOutCubic(progress);

    ctx.save();

    switch (transition.type) {
      case 'fade':
        if (direction === 'enter') {
          this.renderScene(ctx, scene, sceneTime, width, height, preloaded);
          ctx.globalAlpha = eased;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);
          ctx.globalAlpha = 1;
        } else {
          this.renderScene(ctx, scene, sceneTime, width, height, preloaded);
          ctx.globalAlpha = 1 - eased;
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);
          ctx.globalAlpha = 1;
        }
        break;

      case 'slide':
        if (direction === 'enter') {
          const offsetX = width * (1 - eased);
          ctx.translate(offsetX, 0);
          this.renderScene(ctx, scene, sceneTime, width, height, preloaded);
        } else {
          const offsetX = -width * eased;
          ctx.translate(offsetX, 0);
          this.renderScene(ctx, scene, sceneTime, width, height, preloaded);
        }
        break;

      case 'zoom':
        if (direction === 'enter') {
          const scale = eased;
          ctx.translate(width / 2, height / 2);
          ctx.scale(scale, scale);
          ctx.translate(-width / 2, -height / 2);
          ctx.globalAlpha = eased;
          this.renderScene(ctx, scene, sceneTime, width, height, preloaded);
          ctx.globalAlpha = 1;
        } else {
          const scale = 1 + eased * 0.5;
          ctx.translate(width / 2, height / 2);
          ctx.scale(scale, scale);
          ctx.translate(-width / 2, -height / 2);
          ctx.globalAlpha = 1 - eased;
          this.renderScene(ctx, scene, sceneTime, width, height, preloaded);
          ctx.globalAlpha = 1;
        }
        break;

      case 'wipe':
        this.renderScene(ctx, scene, sceneTime, width, height, preloaded);
        if (direction === 'enter') {
          ctx.fillStyle = '#000000';
          ctx.fillRect(width * (1 - eased), 0, width * eased, height);
        } else {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width * eased, height);
        }
        break;
    }

    ctx.restore();
  }

  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  cancelRender(): void {
    if (this.currentRender) {
      this.currentRender.abort();
      this.currentRender = null;
    }
  }

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
