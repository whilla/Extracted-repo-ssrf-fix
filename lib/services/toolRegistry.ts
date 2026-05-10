'use client';

import { searchTrends } from './serpStackService';
import { sentimentService } from './sentimentService';
import { kvGet } from './puterService';

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

export interface BrandContextParams {
  // No parameters needed
}

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
};

export function getToolDefinitionsPrompt(): string {
  return Object.values(ToolRegistry).map(t => 
    `- ${t.name}: ${t.description} (Params: ${JSON.stringify(t.parameters)})`
  ).join('\n');
}
