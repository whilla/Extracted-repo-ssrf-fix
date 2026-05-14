

import { createConfigError } from './configError';
import { kvGet, kvSet } from './puterService';
import { DirectPublishService, type DirectPublishResult } from './directPublishService';
import { publishPost as ayrsharePublish } from './publishService'; // We will wrap this to avoid circular deps
import type { Platform } from '@/lib/types';

export type PublishingStrategy = 'NATIVE_FIRST' | 'AGGREGATED_FIRST' | 'STRICT_NATIVE' | 'STRICT_AGGREGATED';

export interface PublishRouteResult {
  platform: Platform;
  method: 'native' | 'aggregated';
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * PublishOrchestrator handles the routing of posts between 
 * direct native APIs and third-party aggregators (Ayrshare).
 */
export const publishOrchestrator = {
  /**
   * Get the current publishing strategy from settings.
   */
  async getStrategy(): Promise<PublishingStrategy> {
    const strategy = await kvGet('publishing_strategy');
    return (strategy as PublishingStrategy) || 'NATIVE_FIRST';
  },

  /**
   * Set the publishing strategy.
   */
  async setStrategy(strategy: PublishingStrategy): Promise<void> {
    await kvSet('publishing_strategy', strategy);
  },

  /**
   * Orchestrates the publishing process for a single platform.
   */
  async routePublish(
    platform: Platform, 
    text: string, 
    mediaUrls: string[] = []
  ): Promise<PublishRouteResult> {
    const strategy = await this.getStrategy();
    
    if (strategy === 'STRICT_NATIVE') {
      return this.tryNative(platform, text, mediaUrls);
    }
    
    if (strategy === 'STRICT_AGGREGATED') {
      return this.tryAggregated(platform, text, mediaUrls);
    }

    if (strategy === 'NATIVE_FIRST') {
      const nativeResult = await this.tryNative(platform, text, mediaUrls);
      if (nativeResult.success) return nativeResult;
      
      console.warn(`Native publish failed for ${platform}, failing over to aggregated.`);
      return this.tryAggregated(platform, text, mediaUrls);
    }

    // Default: AGGREGATED_FIRST
    const aggResult = await this.tryAggregated(platform, text, mediaUrls);
    if (aggResult.success) return aggResult;

    console.warn(`Aggregated publish failed for ${platform}, failing over to native.`);
    return this.tryNative(platform, text, mediaUrls);
  },

  /**
   * Logic for Native Publishing
   */
  async tryNative(platform: Platform, text: string, mediaUrls: string[]): Promise<PublishRouteResult> {
    try {
      const result = await DirectPublishService.publish(platform as any, text, mediaUrls);
      return {
        platform,
        method: 'native',
        success: result.success,
        postId: result.postId,
        error: result.error,
      };
    } catch (error) {
      return {
        platform,
        method: 'native',
        success: false,
        error: error instanceof Error ? error.message : 'Native publish exception',
      };
    }
  },

  /**
   * Logic for Aggregated Publishing (Ayrshare)
   * Note: Since Ayrshare handles multiple platforms, we simulate a per-platform call here
   * by calling the core Ayrshare logic.
   */
  async tryAggregated(platform: Platform, text: string, mediaUrls: string[]): Promise<PublishRouteResult> {
    try {
      // We call a specialized wrapper to handle single-platform Ayrshare posts
      // This avoids the overhead of the full publishPost logic which handles arrays
      const result = await this.executeAyrshareSinglePost(platform, text, mediaUrls);
      return {
        platform,
        method: 'aggregated',
        success: result.success,
        postId: result.postId,
        error: result.error,
      };
    } catch (error) {
      return {
        platform,
        method: 'aggregated',
        success: false,
        error: error instanceof Error ? error.message : 'Aggregated publish exception',
      };
    }
  },

  /**
   * Internal helper to call Ayrshare for a single platform.
   */
  async executeAyrshareSinglePost(platform: Platform, text: string, mediaUrls: string[]): Promise<{ success: boolean; postId?: string; error?: string }> {
    // This mimics the internal logic of publishService.ts without causing circular dependencies
    const { kvGet } = await import('./puterService');
    const { sanitizeApiKey } = await import('./providerCredentialUtils');

    const key = await kvGet('ayrshare_key');
    const sanitized = sanitizeApiKey(key);
    if (!sanitized) throw createConfigError('ayrshare');

const PLATFORM_MAP: Record<Platform, string> = {
  twitter: 'twitter',
  instagram: 'instagram',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
  facebook: 'facebook',
  threads: 'threads',
  youtube: 'youtube',
  pinterest: 'pinterest',
  discord: 'discord',
  reddit: 'reddit',
  whatsapp: 'whatsapp',
  telegram: 'telegram',
  snapchat: 'snapchat',
  wordpress: 'wordpress',
  medium: 'medium',
  ghost: 'ghost',
  substack: 'substack',
  mailchimp: 'mailchimp',
  klaviyo: 'klaviyo',
  convertkit: 'convertkit',
  general: 'general',
};

    const response = await fetch('https://api.ayrshare.com/api/post', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sanitized}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        post: text,
        platforms: [PLATFORM_MAP[platform]],
        mediaUrls: mediaUrls,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Ayrshare request failed');
    }

    const data = await response.json();
    return {
      success: !!data.id,
      postId: data.id,
      error: data.errors ? JSON.stringify(data.errors) : undefined,
    };
  }
};
