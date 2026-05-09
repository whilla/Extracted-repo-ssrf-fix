/**
 * VISUAL STYLE MANAGER
 * Implements a "Visual Memory" for consistent multi-modal generation.
 * 
 * Responsibilities:
 * - Store and retrieve visual style vectors (prompts, seeds, color palettes)
 * - Associate style vectors with successful high-performance content
 * - Provide "Visual Brand Guidelines" to image/video providers
 */

import { kvGet, kvSet } from '../services/puterService';

export interface VisualStyleVector {
  id: string;
  stylePrompt: string;
  dominantColors: string[];
  composition: string;
  lighting: string;
  complexity: 'minimal' | 'detailed' | 'complex';
  successfulExamples: string[]; // URLs or IDs of successful assets
  avgEngagementScore: number;
  timestamp: string;
}

export class VisualStyleManager {
  private styles: Map<string, VisualStyleVector> = new Map();
  private initialized = false;

  private readonly KEY = 'nexus_visual_style_memory';

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const data = await kvGet(this.KEY);
      if (data) this.styles = new Map(JSON.parse(data));
    } catch (e) {
      console.error('[VisualStyleManager] Init failed', e);
    }
    this.initialized = true;
  }

  /**
   * Store a style vector when an image/video succeeds
   */
  async recordSuccessfulStyle(style: Omit<VisualStyleVector, 'id' | 'timestamp'>): Promise<void> {
    if (!this.initialized) await this.initialize();

    const id = `style_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const vector: VisualStyleVector = {
      ...style,
      id,
      timestamp: new Date().toISOString(),
    };

    this.styles.set(id, vector);
    await this.save();
  }

  /**
   * Get the most effective visual style for a specific platform or niche
   */
  async getOptimalStyle(): Promise<VisualStyleVector | null> {
    if (!this.initialized) await this.initialize();
    
    return Array.from(this.styles.values())
      .sort((a, b) => b.avgEngagementScore - a.avgEngagementScore)[0] || null;
  }

  private async save(): Promise<void> {
    await kvSet(this.KEY, JSON.stringify(Array.from(this.styles.entries())));
  }
}

export const visualStyleManager = new VisualStyleManager();
