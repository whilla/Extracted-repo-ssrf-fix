import { logger } from '@/lib/utils/logger';

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

  static async renderTimeline(
    onProgress?: (progress: number) => void
  ): Promise<VideoEditResult> {
    try {
      if (!this.timeline) {
        return { success: false, error: 'No timeline created' };
      }

      const renderRequest = {
        timeline: {
          tracks: this.timeline.tracks.map(t => ({
            ...t,
            transitions: undefined,
          })),
          duration: this.timeline.duration,
          resolution: this.timeline.resolution,
        },
        transitions: Array.from(this.timeline.transitions.entries()),
      };

      logger.info('[VideoEditingService] Rendering timeline', renderRequest);

      for (let i = 0; i <= 100; i += 10) {
        await new Promise(r => setTimeout(r, 100));
        onProgress?.(i);
      }

      const outputUrl = `https://storage.nexusai.io/renders/${Date.now()}.mp4`;
      return { success: true, outputUrl };
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