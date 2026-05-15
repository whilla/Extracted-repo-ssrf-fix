import { API_CONFIG, isServiceConfigured } from '@/lib/api-config';
import { logger } from '@/lib/utils/logger';

export interface SerpStackResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  domain: string;
}

export interface SerpStackResponse {
  success: boolean;
  results: SerpStackResult[];
  total: number;
  query: string;
}

const CACHE = new Map<string, { data: SerpStackResponse; expiresAt: number }>();

export async function searchTrends(query: string, options?: {
  country?: string;
  language?: string;
  maxResults?: number;
}): Promise<SerpStackResponse> {
  if (!isServiceConfigured('serpStack')) {
    return {
      success: false,
      results: [],
      total: 0,
      query,
    };
  }

  const cacheKey = `serp:${query}:${options?.country || ''}:${options?.language || ''}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const config = API_CONFIG.serpStack;
  const params = new URLSearchParams({
    access_key: config.key || '',
    query,
    format: 'json',
  });

  if (options?.country) params.set('country_code', options.country);
  if (options?.language) params.set('language_code', options.language);
  if (options?.maxResults) params.set('count', String(options.maxResults));

  try {
    const url = `${config.baseUrl}?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      logger.error('SerpStack', `API error: ${response.statusText}`);
      return { success: false, results: [], total: 0, query };
    }

    const data = await response.json();

    if (data.error) {
      logger.error('SerpStack', `API returned error: ${data.error.message || data.error.type}`);
      return { success: false, results: [], total: 0, query };
    }

    const results: SerpStackResult[] = (data.results || []).map((r: any, i: number) => ({
      title: r.title || '',
      link: r.url || '',
      snippet: r.snippet || '',
      position: i + 1,
      domain: r.domain || new URL(r.url || '').hostname,
    }));

    const result = {
      success: true,
      results,
      total: data.search_parameters?.total_results || results.length,
      query,
    };

    CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + config.cacheTTL });
    return result;
  } catch (error) {
    logger.error('SerpStack', 'Search failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, results: [], total: 0, query };
  }
}

export async function searchCompetitors(brandName: string, options?: {
  country?: string;
  maxResults?: number;
}): Promise<SerpStackResponse> {
  return searchTrends(`${brandName} competitors alternatives`, {
    ...options,
    maxResults: options?.maxResults || 10,
  });
}

export function clearCache(): void {
  CACHE.clear();
}
