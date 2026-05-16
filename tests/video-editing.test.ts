import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoEditingService, TimelineTrack } from '@/lib/services/videoEditingService';

describe('VideoEditingService', () => {
  beforeEach(() => {
    (VideoEditingService as any).timeline = null;
  });

  describe('createTimeline', () => {
    it('creates timeline with default resolution', () => {
      const timeline = VideoEditingService.createTimeline();
      expect(timeline.resolution).toEqual({ width: 1920, height: 1080 });
      expect(timeline.tracks).toEqual([]);
      expect(timeline.duration).toBe(0);
    });

    it('creates timeline with custom resolution', () => {
      const timeline = VideoEditingService.createTimeline({ width: 1080, height: 1920 });
      expect(timeline.resolution).toEqual({ width: 1080, height: 1920 });
    });
  });

  describe('addTrack', () => {
    it('adds track to timeline', () => {
      VideoEditingService.createTimeline();
      const track: TimelineTrack = {
        id: 'track1',
        type: 'text',
        startTime: 0,
        endTime: 5,
        text: 'Hello World',
      };
      VideoEditingService.addTrack(track);

      const timeline = VideoEditingService.getTimeline();
      expect(timeline?.tracks).toHaveLength(1);
      expect(timeline?.tracks[0]).toEqual(track);
      expect(timeline?.duration).toBe(5);
    });

    it('auto-creates timeline if none exists', () => {
      const track: TimelineTrack = {
        id: 'track1',
        type: 'text',
        startTime: 0,
        endTime: 3,
        text: 'Test',
      };
      VideoEditingService.addTrack(track);

      const timeline = VideoEditingService.getTimeline();
      expect(timeline).not.toBeNull();
      expect(timeline?.tracks).toHaveLength(1);
    });

    it('updates duration to longest track', () => {
      VideoEditingService.createTimeline();
      VideoEditingService.addTrack({ id: 't1', type: 'text', startTime: 0, endTime: 3, text: 'a' });
      VideoEditingService.addTrack({ id: 't2', type: 'text', startTime: 0, endTime: 10, text: 'b' });

      const timeline = VideoEditingService.getTimeline();
      expect(timeline?.duration).toBe(10);
    });
  });

  describe('addTextOverlay', () => {
    it('adds text track with styling', () => {
      VideoEditingService.createTimeline();
      VideoEditingService.addTextOverlay('Hello', 0, 5, {
        fontSize: 36,
        color: '#ffffff',
        position: 'center',
      });

      const timeline = VideoEditingService.getTimeline();
      const textTrack = timeline?.tracks.find(t => t.type === 'text');
      expect(textTrack).toBeDefined();
      expect(textTrack?.text).toBe('Hello');
      expect(textTrack?.style?.fontSize).toBe(36);
    });
  });

  describe('addBrollOverlay', () => {
    it('adds video track with opacity', () => {
      VideoEditingService.createTimeline();
      VideoEditingService.addBrollOverlay('https://example.com/video.mp4', 0, 5, 0.8);

      const timeline = VideoEditingService.getTimeline();
      const videoTrack = timeline?.tracks.find(t => t.type === 'video');
      expect(videoTrack).toBeDefined();
      expect(videoTrack?.mediaUrl).toBe('https://example.com/video.mp4');
      expect(videoTrack?.style?.opacity).toBe(0.8);
    });
  });

  describe('addTransition', () => {
    it('adds transition between tracks', () => {
      VideoEditingService.createTimeline();
      VideoEditingService.addTrack({ id: 't1', type: 'text', startTime: 0, endTime: 5, text: 'a' });
      VideoEditingService.addTrack({ id: 't2', type: 'text', startTime: 5, endTime: 10, text: 'b' });
      VideoEditingService.addFadeTransition('t1', 't2', 1);

      const timeline = VideoEditingService.getTimeline();
      const transition = timeline?.transitions.get('t1-t2');
      expect(transition).toBeDefined();
      expect(transition?.type).toBe('fade');
      expect(transition?.duration).toBe(1);
    });
  });

  describe('trimTrack', () => {
    it('modifies track timing', () => {
      VideoEditingService.createTimeline();
      VideoEditingService.addTrack({ id: 't1', type: 'text', startTime: 0, endTime: 10, text: 'a' });
      VideoEditingService.trimTrack('t1', 2, 8);

      const timeline = VideoEditingService.getTimeline();
      const track = timeline?.tracks.find(t => t.id === 't1');
      expect(track?.startTime).toBe(2);
      expect(track?.endTime).toBe(8);
    });
  });

  describe('renderTimeline', () => {
    it('returns error when no timeline exists', async () => {
      const result = await VideoEditingService.renderTimeline();
      expect(result.success).toBe(false);
      expect(result.error).toBe('No timeline created');
    });

    it('returns error when timeline has no tracks', async () => {
      VideoEditingService.createTimeline();
      const result = await VideoEditingService.renderTimeline();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Timeline has no tracks to render');
    });
  });
});
