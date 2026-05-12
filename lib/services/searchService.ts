import { logger } from '@/lib/utils/logger';
import { kvGet, kvSet } from './puterService';
import { loadAgentMemory } from './agentMemoryService';
import { loadBrandKit, listPublishedContent } from './memoryService';
import { CRMService } from './crmService';

export interface SearchResult {
  id: string;
  type: 'draft' | 'published' | 'brandKit' | 'crmCustomer' | 'agentMemory' | 'contentIdea';
  title: string;
  snippet: string;
  score: number;
  url?: string;
  createdAt?: string;
}

export interface SearchResponse {
  success: boolean;
  results: SearchResult[];
  total: number;
  query: string;
}

const REINDEX_INTERVAL = 5 * 60 * 1000;
let lastIndexTime = 0;
let searchCache: SearchResult[] = [];

export class SearchService {
  static async search(query: string, limit = 20): Promise<SearchResponse> {
    try {
      const start = Date.now();
      const q = query.toLowerCase().trim();
      if (!q) return { success: true, results: [], total: 0, query };

      // Rebuild search index if stale
      if (Date.now() - lastIndexTime > REINDEX_INTERVAL) {
        searchCache = await this.buildIndex();
        lastIndexTime = Date.now();
      }

      // Score results by relevance
      const scored = searchCache
        .map(r => ({
          ...r,
          score: this.calculateScore(r, q),
        }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      logger.info('[SearchService] Search completed', {
        query: q,
        results: scored.length,
        latency: Date.now() - start,
      });

      return { success: true, results: scored, total: scored.length, query };
    } catch (error) {
      return { success: false, results: [], total: 0, query };
    }
  }

  private static calculateScore(result: SearchResult, query: string): number {
    let score = 0;
    const title = result.title.toLowerCase();
    const snippet = result.snippet.toLowerCase();

    // Exact title match: highest score
    if (title === query) score += 100;
    else if (title.includes(query)) score += 50;
    else if (title.split(' ').some(w => query.includes(w) || w.includes(query))) score += 25;

    // Snippet match
    if (snippet.includes(query)) score += 20;
    else if (query.split(' ').some(w => snippet.includes(w))) score += 10;

    // Recency boost
    if (result.createdAt) {
      const age = Date.now() - new Date(result.createdAt).getTime();
      if (age < 86400000) score += 15;       // < 1 day
      else if (age < 604800000) score += 8;   // < 1 week
      else if (age < 2592000000) score += 3;  // < 1 month
    }

    // Type boost (prioritize drafts and published)
    if (result.type === 'published') score += 5;
    if (result.type === 'draft') score += 3;

    return score;
  }

  private static async buildIndex(): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const seen = new Set<string>();

    try {
      // Index brand kit
      const brandKit = await loadBrandKit();
      if (brandKit?.brandName && !seen.has(brandKit.brandName)) {
        seen.add(brandKit.brandName);
        results.push({
          id: 'brandKit',
          type: 'brandKit',
          title: `Brand: ${brandKit.brandName}`,
          snippet: `${brandKit.niche} — ${brandKit.targetAudience}`,
          score: 0,
          url: '/brand',
        });
      }
    } catch {}

    try {
      // Index published content
      const published = await listPublishedContent();
      for (const p of published) {
        const id = `pub_${p.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        results.push({
          id: p.id,
          type: 'published',
          title: p.title || 'Published Post',
          snippet: (p.content || '').slice(0, 200),
          score: 0,
          createdAt: p.publishedAt,
          url: `/history`,
        });
      }
    } catch {}

    try {
      // Index CRM customers
      const customers = await CRMService.getAllCustomers();
      if (customers.success && customers.data) {
        for (const c of customers.data) {
          const id = `crm_${c.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          results.push({
            id: c.id,
            type: 'crmCustomer',
            title: c.name,
            snippet: `${c.email} — ${c.lifecycleStage} (score: ${c.score})`,
            score: 0,
            createdAt: c.lastContact,
          });
        }
      }
    } catch {}

    try {
      // Index agent memory (content ideas)
      const memory = await loadAgentMemory();
      for (const idea of memory.contentIdeas || []) {
        const id = `idea_${idea.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        results.push({
          id: idea.id,
          type: 'contentIdea',
          title: idea.idea.slice(0, 100),
          snippet: idea.idea,
          score: 0,
          createdAt: idea.createdAt,
        });
      }
    } catch {}

    logger.info('[SearchService] Index built', { totalEntries: results.length });
    return results;
  }
}

export const searchService = new SearchService();
