import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerBrandTools(server: McpServer) {
  server.tool(
    'get_brand_kit',
    {},
    async () => fetchNexusAI('/api/brand/context')
  );

  server.tool(
    'update_brand_kit',
    {
      name: z.string().optional().describe('Brand name'),
      industry: z.string().optional().describe('Brand industry'),
      audience: z.string().optional().describe('Target audience description'),
      voice: z.string().optional().describe('Brand voice/tone description'),
      pillars: z.array(z.string()).optional().describe('Content pillars'),
      avoidTopics: z.array(z.string()).optional().describe('Topics to avoid'),
    },
    async ({ name, industry, audience, voice, pillars, avoidTopics }) => {
      return fetchNexusAI('/api/brand/context', {
        body: { name, industry, audience, voice, pillars, avoidTopics },
      });
    }
  );

  server.tool(
    'check_brand_compliance',
    {
      content: z.string().describe('Content to check'),
      strictMode: z.boolean().optional().default(false).describe('Enforce strict compliance checking'),
    },
    async ({ content, strictMode }) => {
      return fetchNexusAI('/api/ai/chat', {
        body: { messages: [{ role: 'user', content: `Check this content for brand compliance${strictMode ? ' (strict mode)' : ''}:\n\n${content}` }] },
      });
    }
  );

  server.tool(
    'get_agent_memory',
    {
      agentId: z.string().optional().describe('Specific agent ID (omit for all agents)'),
      category: z.enum(['brand', 'audience', 'performance', 'strategy']).optional().describe('Memory category'),
    },
    async ({ agentId, category }) => {
      const params = new URLSearchParams();
      if (agentId) params.set('agentId', agentId);
      if (category) params.set('category', category);
      return fetchNexusAI(`/api/agent/reflect?${params}`);
    }
  );

  server.tool(
    'get_system_status',
    {},
    async () => fetchNexusAI('/api/features/status')
  );

  server.tool(
    'get_health',
    {},
    async () => fetchNexusAI('/api/health')
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
