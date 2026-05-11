/**
 * ANALYTICS INGESTION SERVICE
 * Bridges the gap between real-world social performance and the LearningSystem
 * 
 * Responsibilities:
 * - Fetch performance metrics from social platforms (TikTok, IG, YouTube, X)
 * - Normalize raw API data into engagement scores
 * - Feed real-world wins back into the LearningSystem to refine agent behavior
 * - Track "Prediction vs Reality" delta for viral scoring improvement
 */

import { learningSystem } from '../core/LearningSystem';
import { puterService } from './puterService';

interface PlatformMetrics {
  impressions: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  postId: string;
  platform: string;
}

export class AnalyticsIngestionService {
  private initialized = false;

  /**
   * Main entry point to sync performance data for published content
   */
  async syncPublishedContentPerformance(): Promise<{ synced: number; learned: number }> {
    if (!this.initialized) await this.initialize();

    const publishedFiles = await puterService.listFiles(puterService.PATHS.published);
    if (!publishedFiles || publishedFiles.length === 0) {
      return { synced: 0, learned: 0 };
    }

    let syncedCount = 0;
    let learnedCount = 0;

    for (const file of publishedFiles) {
      if (file.is_dir) continue;

      try {
        const rawContent = await puterService.readFile(`${puterService.PATHS.published}/${file.name}`, true);
        if (!rawContent || typeof rawContent !== 'object') continue;

        const content = rawContent as Record<string, unknown>;
        
        const postIds = this.extractPostIds(content);
        
        for (const post of postIds) {
          const metrics = await this.fetchPlatformMetrics(post.platform, post.id);
          
          if (metrics) {
            const contentText = (content.text as string) || (content.caption as string);
            if (!contentText) {
              console.warn(`[AnalyticsIngestion] Missing content text for ${file.name}`);
              continue;
            }
            
            await learningSystem.recordEngagementFeedback({
              postId: post.id,
              platform: post.platform,
              content: contentText,
              impressions: metrics.impressions,
              engagements: metrics.engagements,
              likes: metrics.likes,
              comments: metrics.comments,
              shares: metrics.shares,
              generationId: content.generationId as string | undefined,
            });
            syncedCount++;
            learnedCount++;
          }
        }
      } catch (error) {
        console.error(`[AnalyticsIngestion] Failed to sync ${file.name}:`, error);
      }
    }

    return { synced: syncedCount, learned: learnedCount };
  }

  /**
   * Interface for external social APIs
   * In a real environment, this would use secure API keys and rate-limiting
   */
  private async fetchPlatformMetrics(platform: string, postId: string): Promise<PlatformMetrics | null> {
    // Mocking API call logic. In production, this would hit TikTok/Meta/Google APIs
    // Example implementation for a generic endpoint
    try {
      // const response = await fetch(`https://api.${platform}.com/v1/metrics/${postId}`);
      // const data = await response.json();
      
      // Simulating a successful API response for demonstration of the pipeline
      return {
        postId,
        platform,
        impressions: Math.floor(Math.random() * 10000) + 500,
        likes: Math.floor(Math.random() * 1000),
        comments: Math.floor(Math.random() * 100),
        shares: Math.floor(Math.random() * 50),
        engagements: 0, // Calculated in LearningSystem
      };
    } catch (error) {
      console.error(`[AnalyticsIngestion] API error for ${platform} post ${postId}:`, error);
      return null;
    }
  }

  private extractPostIds(content: any): Array<{ id: string; platform: string }> {
    const ids: Array<{ id: string; platform: string }> = [];
    
    if (content.publishedUrls && Array.isArray(content.publishedUrls)) {
      content.publishedUrls.forEach((url: any) => {
        if (typeof url === 'string') {
          const platform = this.detectPlatformFromUrl(url);
          if (!platform) return;
          const id = this.extractIdFromUrl(url, platform);
          if (id) ids.push({ id, platform });
        }
      });
    }
    
    return ids;
  }

  private detectPlatformFromUrl(url: string): string | null {
    if (url.includes('tiktok.com')) return 'tiktok';
    if (url.includes('instagram.com')) return 'instagram';
    if (url.includes('youtube.com')) return 'youtube';
    if (url.includes('x.com') || url.includes('twitter.com')) return 'x';
    return null;
  }

  private extractIdFromUrl(url: string, platform: string): string | null {
    try {
      const cleanUrl = url.split('?')[0].replace(/\/$/, '');
      const parsed = new URL(cleanUrl);
      
      switch (platform) {
        case 'youtube': {
          const pathname = parsed.pathname;
          if (parsed.hostname === 'youtu.be') {
            return pathname.slice(1) || null;
          }
          const videoMatch = pathname.match(/\/video\/([a-zA-Z0-9_-]+)/);
          if (videoMatch) return videoMatch[1];
          const watchMatch = pathname.match(/\/watch\?v=([a-zA-Z0-9_-]+)/);
          if (watchMatch) return watchMatch[1];
return null as string | null;
        }
        case 'tiktok': {
          const videoMatch = parsed.pathname.match(/\/video\/(\d+)/);
          return videoMatch ? videoMatch[1] : null;
        }
        case 'instagram': {
          const pathParts = parsed.pathname.split('/').filter(Boolean);
          if (pathParts.length >= 2 && (pathParts[0] === 'p' || pathParts[0] === 'reel')) {
            return pathParts[1] || null;
          }
          return pathParts[pathParts.length - 1] || null;
        }
        case 'x':
        case 'twitter': {
          const statusMatch = parsed.pathname.match(/\/status\/(\d+)/);
          return statusMatch ? statusMatch[1] : null;
        }
        default: {
          const parts = cleanUrl.split('/').filter(Boolean);
          return parts[parts.length - 1] || null;
        }
      }
    } catch {
      return null;
    }
  }

  private async initialize(): Promise<void> {
    this.initialized = true;
    console.log('[AnalyticsIngestion] Initialized');
  }
}

export const analyticsIngestionService = new AnalyticsIngestionService();
