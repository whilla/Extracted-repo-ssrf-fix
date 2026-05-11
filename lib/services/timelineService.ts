'use client';

import { kvGet, kvSet } from './puterService';
import { Timeline, Track, TrackType, TimelineEvent, MediaClipEvent, TextOverlayEvent, ImageOverlayEvent, TransitionEvent } from '@/lib/types';

export interface TimelineError {
  code: 'OVERLAP' | 'OUT_OF_BOUNDS' | 'INVALID_TYPE' | 'MISSING_ASSET';
  message: string;
}

export class TimelineService {
  /**
   * Create a new empty timeline
   */
  static async createTimeline(name: string, aspectRatio: '16:9' | '9:16' | '1:1' | '4:5'): Promise<Timeline> {
    const id = `timeline_${Date.now()}`;
    const newTimeline: Timeline = {
      id,
      name,
      duration: 0,
      aspectRatio,
      tracks: [
        { id: `track_v_${id}`, name: 'Video', type: 'video', events: [] },
        { id: `track_a_${id}`, name: 'Audio', type: 'audio', events: [] },
        { id: `track_t_${id}`, name: 'Text', type: 'text', events: [] },
        { id: `track_i_${id}`, name: 'Images', type: 'image', events: [] },
      ],
    };

    await kvSet(`timeline_${id}`, JSON.stringify(newTimeline));
    return newTimeline;
  }

  /**
   * Retrieve a timeline by ID
   */
  static async getTimeline(id: string): Promise<Timeline | null> {
    const data = await kvGet(`timeline_${id}`);
    if (!data) return null;
    return JSON.parse(data) as Timeline;
  }

  /**
   * Save an updated timeline
   */
  static async saveTimeline(timeline: Timeline): Promise<void> {
    // Update total duration based on the latest event end time
    let maxEnd = 0;
    for (const track of timeline.tracks) {
      for (const event of track.events) {
        const end = event.startTime + event.duration;
        if (end > maxEnd) maxEnd = end;
      }
    }
    timeline.duration = maxEnd;

    await kvSet(`timeline_${timeline.id}`, JSON.stringify(timeline));
  }

  /**
   * Add an event to a specific track
   */
  static async addEvent(timelineId: string, trackId: string, event: TimelineEvent): Promise<void> {
    const timeline = await this.getTimeline(timelineId);
    if (!timeline) throw new Error('Timeline not found');

    const track = timeline.tracks.find(t => t.id === trackId);
    if (!track) throw new Error('Track not found');
    if (track.type !== event.type) throw new Error(`Track type mismatch: track is ${track.type}, event is ${event.type}`);

    track.events.push(event);
    await this.saveTimeline(timeline);
  }

  /**
   * Remove an event from a track
   */
  static async removeEvent(timelineId: string, trackId: string, eventId: string): Promise<void> {
    const timeline = await this.getTimeline(timelineId);
    if (!timeline) throw new Error('Timeline not found');

    const track = timeline.tracks.find(t => t.id === trackId);
    if (!track) throw new Error('Track not found');

    track.events = track.events.filter(e => e.id !== eventId);
    await this.saveTimeline(timeline);
  }

  /**
   * Move an event in time
   */
  static async moveEvent(timelineId: string, trackId: string, eventId: string, newStartTime: number): Promise<void> {
    const timeline = await this.getTimeline(timelineId);
    if (!timeline) throw new Error('Timeline not found');

    const track = timeline.tracks.find(t => t.id === trackId);
    if (!track) throw new Error('Track not found');

    const event = track.events.find(e => e.id === eventId);
    if (!event) throw new Error('Event not found');

    if (newStartTime < 0) throw new Error('Start time cannot be negative');
    
    event.startTime = newStartTime;
    await this.saveTimeline(timeline);
  }

  /**
   * Resize an event (duration)
   */
  static async resizeEvent(timelineId: string, trackId: string, eventId: string, newDuration: number): Promise<void> {
    const timeline = await this.getTimeline(timelineId);
    if (!timeline) throw new Error('Timeline not found');

    const track = timeline.tracks.find(t => t.id === trackId);
    if (!track) throw new Error('Track not found');

    const event = track.events.find(e => e.id === eventId);
    if (!event) throw new Error('Event not found');

    if (newDuration <= 0) throw new Error('Duration must be greater than 0');

    event.duration = newDuration;
    await this.saveTimeline(timeline);
  }
}
