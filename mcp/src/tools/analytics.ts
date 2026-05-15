import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerAnalyticsTools(server: McpServer) {
  server.tool(
    'get_analytics',
    {
      startDate: z.string().optional().describe('Start date (ISO format)'),
      endDate: z.string().optional().describe('End date (ISO format)'),
      platform: z.string().optional().describe('Filter by platform'),
      metric: z.enum(['views', 'likes', 'shares', 'comments', 'engagement_rate', 'reach', 'impressions']).optional().describe('Specific metric'),
    },
    async ({ startDate, endDate, platform, metric }) => {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (platform) params.set('platform', platform);
      if (metric) params.set('metric', metric);
      return fetchNexusAI(`/api/analytics?${params}`);
    }
  );

  server.tool(
    'get_sentiment_analysis',
    {
      postId: z.string().describe('Post ID to analyze'),
      platform: z.string().describe('Platform the post is on'),
    },
    async ({ postId, platform }) => {
      return fetchNexusAI('/api/analytics/sentiment', { body: { postId, platform } });
    }
  );

  server.tool(
    'predict_performance',
    {
      content: z.string().describe('Content to analyze'),
      platform: z.string().describe('Target platform'),
      hashtags: z.array(z.string()).optional().describe('Hashtags to include'),
      scheduledTime: z.string().optional().describe('Planned publish time (ISO)'),
    },
    async ({ content, platform, hashtags, scheduledTime }) => {
      return fetchNexusAI('/api/predictive', { body: { content, platform, hashtags, scheduledTime } });
    }
  );

  server.tool(
    'get_competitive_intel',
    {
      competitors: z.array(z.string()).describe('Competitor handles or brand names'),
      platform: z.string().describe('Platform to analyze'),
      analysisType: z.enum(['content_gap', 'posting_frequency', 'engagement_comparison', 'hashtag_analysis']).optional().default('content_gap').describe('Type of analysis'),
    },
    async ({ competitors, platform, analysisType }) => {
      return fetchNexusAI('/api/intel/competitive', { body: { competitors, platform, analysisType } });
    }
  );

  server.tool(
    'get_trending_topics',
    {
      niche: z.string().optional().describe('Industry or topic niche'),
      location: z.string().optional().describe('Geographic location for local trends'),
      platform: z.string().optional().describe('Platform to get trends from'),
      limit: z.number().optional().default(10).describe('Number of trends to return'),
    },
    async ({ niche, location, platform, limit }) => {
      const params = new URLSearchParams();
      if (niche) params.set('niche', niche);
      if (location) params.set('location', location);
      if (platform) params.set('platform', platform);
      params.set('limit', String(limit));
      return fetchNexusAI(`/api/discovery/trends?${params}`);
    }
  );

  server.tool(
    'get_audience_insights',
    {
      platform: z.string().optional().describe('Platform to analyze'),
      segment: z.string().optional().describe('Specific audience segment'),
    },
    async ({ platform, segment }) => {
      const params = new URLSearchParams();
      if (platform) params.set('platform', platform);
      if (segment) params.set('segment', segment);
      return fetchNexusAI(`/api/audience?${params}`);
    }
  );

  server.tool(
    'get_best_posting_time',
    {
      platform: z.string().describe('Target platform'),
      timezone: z.string().optional().default('UTC').describe('User timezone'),
    },
    async ({ platform, timezone }) => {
      return fetchNexusAI('/api/ai/chat', {
        body: { messages: [{ role: 'user', content: `What is the best time to post on ${platform} for maximum engagement? Timezone: ${timezone}` }] },
      });
    }
  );
}

async function fetchNexusAI(path: string, options?: { method?: string; body?: Record<string, unknown> }) {
  const baseUrl = process.env.NEXUSAI_API_URL || 'http://localhost:3000';
  const apiKey = process.env.NEXUSAI_API_KEY;

  try {
    const method = options?.method || (options?.body ? 'POST' : 'GET');
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json();

    if (!res.ok) {
      return { content: [{ type: 'text' as const, text: `Error: ${data.error || data.message || `HTTP ${res.status}`}` }], isError: true };
    }

    return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text' as const, text: `Connection error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
  }
}
