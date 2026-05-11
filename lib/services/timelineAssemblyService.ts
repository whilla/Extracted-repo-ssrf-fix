'use client';

import { persistBlobMediaAsset, type PersistedMediaAsset } from './mediaAssetPersistenceService';
import { Timeline, TimelineAssemblyInput, TimelineAssemblyResult } from '@/lib/types';
import { TimelineRenderer } from './finalMediaAssemblyService';

/**
 * TimelineAssemblyService provides a high-level API for assembling 
 * media timelines into final video assets.
 */
export class TimelineAssemblyService {
  /**
   * Assembles a timeline into a single video file
   */
  static async assembleTimeline(input: TimelineAssemblyInput): Promise<TimelineAssemblyResult> {
    const { timeline, generationId } = input;

    // Determine canvas dimensions based on aspect ratio
    let width = 1920;
    let height = 1080;

    switch (timeline.aspectRatio) {
      case '9:16':
        width = 1080;
        height = 1920;
        break;
      case '1:1':
        width = 1080;
        height = 1080;
        break;
      case '4:5':
        width = 1080;
        height = 1350;
        break;
    }

    const renderer = new TimelineRenderer(width, height);

    try {
      const result = await renderer.assemble(input);
      return result;
    } catch (error) {
      return { 
        asset: null, 
        warnings: [error instanceof Error ? error.message : 'Assembly failed'] 
      };
    }
  }
}
