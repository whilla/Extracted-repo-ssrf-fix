'use client';

import { getSecureCredential } from './providerCredentialUtils';
import { searchTrends } from './serpStackService';
import { sentimentService } from './sentimentService';
import { DirectCommerceService } from './directCommerceService';
import { kvGet } from './puterService';
import { TimelineService } from './timelineService';

export interface ToolResponse {
  content: string;
  success: boolean;
  error?: string;
}

export interface ToolDefinition<P = unknown> {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (params: P) => Promise<ToolResponse>;
}

export interface WebSearchParams {
  query: string;
}

export interface SentimentParams {
  postId: string;
}

export interface CommerceParams {
  platform: 'shopify' | 'amazon' | 'etsy';
  query?: string;
}

export type BrandContextParams = Record<string, never>;

// ToolRegistry defines the capabilities the AI can autonomously trigger.
export const ToolRegistry: Record<string, ToolDefinition<any>> = {
  web_search: {
    name: 'web_search',
    description: 'Search the real-time web for current events, trends, or specific facts.',
    parameters: { query: 'string' },
    execute: async ({ query }: WebSearchParams) => {
      try {
        if (typeof query !== 'string' || query.trim().length === 0) {
          return { content: '', success: false, error: 'Query must be a non-empty string' };
        }
        const results = await searchTrends(query);
        if (!results || results.length === 0) return { content: 'No search results found.', success: true };
        
        const formatted = results.map(r => `Title: ${r.title}\nSnippet: ${r.snippet}\nLink: ${r.link}`).join('\n\n');
        return { content: formatted, success: true };
      } catch (e) {
        return { content: '', success: false, error: e instanceof Error ? e.message : 'Search failed' };
      }
    },
  },
  get_brand_context: {
    name: 'get_brand_context',
    description: 'Retrieve the full brand kit and identity guidelines.',
    parameters: {},
    execute: async () => {
      try {
        const brand = await kvGet('brand_kit');
        return { content: brand || 'No brand kit configured.', success: true };
      } catch (e) {
        return { content: '', success: false, error: e instanceof Error ? e.message : 'Fetch failed' };
      }
    },
  },
  analyze_sentiment: {
    name: 'analyze_sentiment',
    description: 'Analyze the qualitative mood of a post using its ID.',
    parameters: { postId: 'string' },
    execute: async ({ postId }: SentimentParams) => {
      try {
        if (typeof postId !== 'string' || postId.trim().length === 0) {
          return { content: '', success: false, error: 'postId must be a non-empty string' };
        }
        const report = await sentimentService.analyzeComments(postId, []); // Simplified for tool use
        return { content: JSON.stringify(report), success: true };
      } catch (e) {
        return { content: '', success: false, error: e instanceof Error ? e.message : 'Sentiment analysis failed' };
      }
    },
  },
  update_video_timeline: {
    name: 'update_video_timeline',
    description: 'Manipulate a video timeline by adding, moving, or resizing clips, text, and images.',
    parameters: {
      timelineId: 'string',
      action: 'add_clip' | 'move_event' | 'resize_event' | 'remove_event',
      payload: 'object'
    },
    execute: async ({ timelineId, action, payload }: any) => {
      try {
        if (!timelineId) return { content: '', success: false, error: 'timelineId is required' };

        const timeline = await TimelineService.getTimeline(timelineId);
        if (!timeline) return { content: '', success: false, error: 'Timeline not found' };

        const getTrackIdByType = (type: string) => {
          const track = timeline.tracks.find(t => t.type === type);
          return track ? track.id : null;
        };

        switch (action) {
          case 'add_clip': {
            const { event } = payload;
            if (!event || !event.type) return { content: '', success: false, error: 'Event with type is required' };
            const trackId = getTrackIdByType(event.type);
            if (!trackId) return { content: '', success: false, error: `No track found for type: ${event.type}` };
            await TimelineService.addEvent(timelineId, trackId, event);
            return { content: `Successfully added ${event.type} clip to timeline.`, success: true };
          }
          case 'move_event': {
            const { eventId, newStartTime, type } = payload;
            if (!eventId || newStartTime === undefined || !type) {
              return { content: '', success: false, error: 'eventId, newStartTime, and type are required' };
            }
            const trackId = getTrackIdByType(type);
            if (!trackId) return { content: '', success: false, error: `No track found for type: ${type}` };
            await TimelineService.moveEvent(timelineId, trackId, eventId, newStartTime);
            return { content: `Successfully moved event ${eventId} to ${newStartTime}s.`, success: true };
          }
          case 'resize_event': {
            const { eventId, newDuration, type } = payload;
            if (!eventId || newDuration === undefined || !type) {
              return { content: '', success: false, error: 'eventId, newDuration, and type are required' };
            }
            const trackId = getTrackIdByType(type);
            if (!trackId) return { content: '', success: false, error: `No track found for type: ${type}` };
            await TimelineService.resizeEvent(timelineId, trackId, eventId, newDuration);
            return { content: `Successfully resized event ${eventId} to ${newDuration}s.`, success: true };
          }
          case 'remove_event': {
            const { eventId, type } = payload;
            if (!eventId || !type) return { content: '', success: false, error: 'eventId and type are required' };
            const trackId = getTrackIdByType(type);
            if (!trackId) return { content: '', success: false, error: `No track found for type: ${type}` };
            await TimelineService.removeEvent(timelineId, trackId, eventId);
            return { content: `Successfully removed event ${eventId} from timeline.`, success: true };
          }
          default:
            return { content: '', success: false, error: `Unsupported action: ${action}` };
        }
      } catch (e) {
        return { content: '', success: false, error: e instanceof Error ? e.message : 'Timeline update failed' };
      }
    },
  },
  get_ecommerce_products: {
    name: 'get_ecommerce_products',
    description: 'Retrieve product catalogs and search for specific items from e-commerce platforms like Shopify.',
    parameters: { platform: 'shopify' | 'amazon' | 'etsy', query: 'string (optional)' },
    execute: async ({ platform, query }: CommerceParams) => {
      try {
        const result = await DirectCommerceService.getProducts(platform, query);
        if (!result.success) {
          return { content: '', success: false, error: result.error };
        }
        return { content: JSON.stringify(result.data), success: true };
      } catch (e) {
        return { content: '', success: false, error: e instanceof Error ? e.message : 'Commerce lookup failed' };
      }
    },
  },
};

export function getToolDefinitionsPrompt(): string {
  return Object.values(ToolRegistry).map(t => 
    `- ${t.name}: ${t.description} (Params: ${JSON.stringify(t.parameters)})`
  ).join('\n');
}
