import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPublishTools(server: McpServer) {
  server.tool(
    'publish_post',
    {
      content: z.string().describe('Content to publish'),
      platforms: z.array(z.enum(['twitter', 'linkedin', 'instagram', 'facebook', 'youtube', 'tiktok', 'reddit', 'discord', 'telegram', 'whatsapp', 'snapchat', 'pinterest', 'threads'])).describe('Target platforms'),
      mediaUrls: z.array(z.string()).optional().describe('URLs of media attachments'),
      scheduledAt: z.string().optional().describe('ISO datetime for scheduled publishing'),
    },
    async ({ content, platforms, mediaUrls, scheduledAt }) => {
      const response = await fetchNexusAI('/api/social/update-status', {
        body: { content, platforms, mediaUrls, scheduledAt },
      });
      return response;
    }
  );

  server.tool(
    'schedule_post',
    {
      content: z.string().describe('Content to schedule'),
      platforms: z.array(z.string()).describe('Target platforms'),
      scheduledAt: z.string().describe('ISO datetime for publishing'),
      timezone: z.string().optional().default('UTC').describe('Timezone for scheduling'),
    },
    async ({ content, platforms, scheduledAt, timezone }) => {
      const response = await fetchNexusAI('/api/drafts', {
        method: 'POST',
        body: { content, platforms, scheduledAt, timezone, status: 'scheduled' },
      });
      return response;
    }
  );

  server.tool(
    'get_publishing_status',
    {
      draftId: z.string().optional().describe('Specific draft/post ID to check'),
      status: z.enum(['draft', 'scheduled', 'published', 'failed', 'rejected']).optional().describe('Filter by status'),
      limit: z.number().optional().default(20).describe('Max results'),
    },
    async ({ draftId, status, limit }) => {
      if (draftId) {
        return fetchNexusAI(`/api/drafts?id=${draftId}`);
      }
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      params.set('limit', String(limit));
      return fetchNexusAI(`/api/drafts?${params}`);
    }
  );

  server.tool(
    'cancel_scheduled_post',
    { draftId: z.string().describe('ID of the scheduled post to cancel') },
    async ({ draftId }) => {
      return fetchNexusAI('/api/drafts', { method: 'DELETE', body: { id: draftId } });
    }
  );

  server.tool(
    'publish_to_shopify',
    {
      title: z.string().describe('Product title'),
      description: z.string().describe('Product description'),
      price: z.number().describe('Product price'),
      images: z.array(z.string()).optional().describe('Product image URLs'),
      tags: z.array(z.string()).optional().describe('Product tags'),
    },
    async ({ title, description, price, images, tags }) => {
      return fetchNexusAI('/api/ecommerce/shopify', {
        body: { action: 'create_product', product: { title, description, price, images, tags } },
      });
    }
  );

  server.tool(
    'publish_to_etsy',
    {
      title: z.string().describe('Listing title'),
      description: z.string().describe('Listing description'),
      price: z.number().describe('Listing price'),
      quantity: z.number().optional().default(1).describe('Available quantity'),
      tags: z.array(z.string()).describe('Listing tags (max 13)'),
      images: z.array(z.string()).optional().describe('Listing image URLs'),
    },
    async ({ title, description, price, quantity, tags, images }) => {
      return fetchNexusAI('/api/ecommerce/etsy', {
        body: { action: 'create_listing', listing: { title, description, price, quantity, tags, images } },
      });
    }
  );

  server.tool(
    'send_newsletter',
    {
      subject: z.string().describe('Email subject line'),
      content: z.string().describe('Email body content'),
      provider: z.enum(['mailchimp', 'klaviyo', 'convertkit']).describe('Email service provider'),
      audience: z.string().optional().describe('Target audience/segment name'),
    },
    async ({ subject, content, provider, audience }) => {
      return fetchNexusAI('/api/ai/chat', {
        body: { messages: [{ role: 'user', content: `Send newsletter via ${provider}: subject="${subject}", audience="${audience || 'all'}", content length: ${content.length} chars` }] },
      });
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
      return { content: [{ type: 'text' as const, text: `Error: ${data.error || data.message || `HTTP ${res.status}`}` }], isError: true };
    }

    return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text' as const, text: `Connection error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
  }
}
