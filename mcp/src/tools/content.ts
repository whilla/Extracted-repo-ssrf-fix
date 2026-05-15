import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerContentTools(server: McpServer) {
  server.tool(
    'generate_content',
    {
      prompt: z.string().describe('Content topic or idea to generate content about'),
      platform: z.enum(['twitter', 'linkedin', 'instagram', 'youtube', 'tiktok', 'facebook', 'reddit', 'general']).describe('Target platform for content optimization'),
      tone: z.enum(['professional', 'casual', 'humorous', 'educational', 'inspirational', 'promotional']).optional().describe('Tone of the content'),
      maxLength: z.number().optional().describe('Maximum character length'),
      includeHashtags: z.boolean().optional().default(true).describe('Whether to include hashtags'),
      includeCTA: z.boolean().optional().default(true).describe('Whether to include a call-to-action'),
    },
    async ({ prompt, platform, tone, maxLength, includeHashtags, includeCTA }) => {
      const response = await fetchNexusAI('/api/orchestrator', {
        body: { goal: prompt, platform, options: { tone, maxLength, includeHashtags, includeCTA } },
      });
      return response;
    }
  );

  server.tool(
    'generate_hook',
    {
      topic: z.string().describe('Topic for the hook'),
      platform: z.enum(['twitter', 'linkedin', 'youtube', 'tiktok', 'instagram']).describe('Target platform'),
      style: z.enum(['curiosity', 'controversial', 'story', 'statistic', 'question']).optional().describe('Hook style'),
    },
    async ({ topic, platform, style }) => {
      const response = await fetchNexusAI('/api/ai/chat', {
        body: { messages: [{ role: 'user', content: `Generate a viral ${style || ''} hook for ${platform} about: ${topic}` }] },
      });
      return response;
    }
  );

  server.tool(
    'repurpose_content',
    {
      originalContent: z.string().describe('The original content to repurpose'),
      sourcePlatform: z.string().describe('Platform the content was originally created for'),
      targetPlatform: z.string().describe('Platform to repurpose the content for'),
    },
    async ({ originalContent, sourcePlatform, targetPlatform }) => {
      const response = await fetchNexusAI('/api/repurpose', {
        body: { content: originalContent, source: sourcePlatform, target: targetPlatform },
      });
      return response;
    }
  );

  server.tool(
    'generate_hashtags',
    {
      topic: z.string().describe('Topic for hashtag generation'),
      platform: z.enum(['twitter', 'instagram', 'linkedin', 'tiktok', 'youtube']).describe('Target platform'),
      count: z.number().optional().default(10).describe('Number of hashtags to generate'),
      niche: z.string().optional().describe('Specific niche or industry'),
    },
    async ({ topic, platform, count, niche }) => {
      const response = await fetchNexusAI('/api/ai/chat', {
        body: { messages: [{ role: 'user', content: `Generate ${count} optimized hashtags for ${platform} about "${topic}"${niche ? ` in the ${niche} niche` : ''}. Return as a comma-separated list.` }] },
      });
      return response;
    }
  );

  server.tool(
    'draft_post',
    {
      content: z.string().describe('Post content'),
      platforms: z.array(z.string()).describe('Target platforms'),
      scheduledAt: z.string().optional().describe('ISO datetime for scheduled publishing'),
      tags: z.array(z.string()).optional().describe('Tags for organization'),
    },
    async ({ content, platforms, scheduledAt, tags }) => {
      const response = await fetchNexusAI('/api/drafts', {
        method: 'POST',
        body: { content, platforms, scheduledAt, tags },
      });
      return response;
    }
  );

  server.tool(
    'list_drafts',
    {
      status: z.enum(['draft', 'scheduled', 'published', 'rejected']).optional().describe('Filter by status'),
      limit: z.number().optional().default(20).describe('Max results'),
    },
    async ({ status, limit }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      params.set('limit', String(limit));
      const response = await fetchNexusAI(`/api/drafts?${params}`);
      return response;
    }
  );

  server.tool(
    'generate_content_strategy',
    {
      brandName: z.string().describe('Brand name'),
      industry: z.string().describe('Industry or niche'),
      targetAudience: z.string().describe('Description of target audience'),
      goals: z.array(z.string()).describe('Content goals'),
      platforms: z.array(z.string()).describe('Target platforms'),
      timeframe: z.enum(['weekly', 'monthly', 'quarterly']).optional().default('monthly').describe('Strategy timeframe'),
    },
    async ({ brandName, industry, targetAudience, goals, platforms, timeframe }) => {
      const response = await fetchNexusAI('/api/ai/chat', {
        body: { messages: [{ role: 'user', content: `Create a ${timeframe} content strategy for "${brandName}" in the ${industry} industry. Target audience: ${targetAudience}. Goals: ${goals.join(', ')}. Platforms: ${platforms.join(', ')}.` }] },
      });
      return response;
    }
  );
}

async function fetchNexusAI(path: string, options?: { method?: string; body?: Record<string, unknown> }) {
  const baseUrl = process.env.NEXUSAI_API_URL || 'http://localhost:3000';
  const apiKey = process.env.NEXUSAI_API_KEY;

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: options?.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${data.error || data.message || `HTTP ${res.status}`}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: `Connection error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}
