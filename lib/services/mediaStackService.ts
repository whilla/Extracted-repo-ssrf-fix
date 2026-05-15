import { API_CONFIG, isServiceConfigured } from '@/lib/api-config';
import { logger } from '@/lib/utils/logger';

export interface MediaStackNews {
  title: string;
  text: string;
  url: string;
  source: string;
  category: string[];
  country: string[];
  language: string;
  image: string;
  published_at: string;
}

export interface MediaStackResponse {
  success: boolean;
  articles: MediaStackNews[];
  total: number;
  pagination: {
    limit: number;
    offset: number;
    count: number;
    total: number;
  };
}

const CACHE = new Map<string, { data: MediaStackResponse; expiresAt: number }>();

export async function fetchTrendingNews(options?: {
  keywords?: string;
  countries?: string[];
  languages?: string[];
  categories?: string[];
  sources?: string[];
  sort?: 'published_desc' | 'published_asc' | 'score_desc';
  limit?: number;
}): Promise<MediaStackResponse> {
  if (!isServiceConfigured('mediaStack')) {
    return {
      success: false,
      articles: [],
      total: 0,
      pagination: { limit: 0, offset: 0, count: 0, total: 0 },
    };
  }

  const cacheKey = `media:${JSON.stringify(options)}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const config = API_CONFIG.mediaStack;
  const params = new URLSearchParams({
    access_key: config.key || '',
    format: 'json',
  });

  if (options?.keywords) params.set('keywords', options.keywords);
  if (options?.countries?.length) params.set('countries', options.countries.join(','));
  if (options?.languages?.length) params.set('languages', options.languages.join(','));
  if (options?.categories?.length) params.set('categories', options.categories.join(','));
  if (options?.sources?.length) params.set('sources', options.sources.join(','));
  if (options?.sort) params.set('sort', options.sort);
  if (options?.limit) params.set('limit', String(Math.min(options.limit, 100)));

  try {
    const url = `${config.baseUrl}?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      logger.error('MediaStack', `API error: ${response.statusText}`);
      return {
        success: false,
        articles: [],
        total: 0,
        pagination: { limit: 0, offset: 0, count: 0, total: 0 },
      };
    }

    const data = await response.json();

    if (data.error) {
      logger.error('MediaStack', `API returned error: ${data.error.message || data.error.type}`);
      return {
        success: false,
        articles: [],
        total: 0,
        pagination: { limit: 0, offset: 0, count: 0, total: 0 },
      };
    }

    const result: MediaStackResponse = {
      success: true,
      articles: (data.data || []).map((article: any) => ({
        title: article.title || '',
        text: article.description || article.text || '',
        url: article.url || '',
        source: article.source || '',
        category: article.category || [],
        country: article.countries || [],
        language: article.language || 'en',
        image: article.image || '',
        published_at: article.published_at || '',
      })),
      total: data.pagination?.total || 0,
      pagination: data.pagination || { limit: 0, offset: 0, count: 0, total: 0 },
    };

    CACHE.set(cacheKey, { data: result, expiresAt: Date.now() + config.cacheTTL });
    return result;
  } catch (error) {
    logger.error('MediaStack', 'Fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      articles: [],
      total: 0,
      pagination: { limit: 0, offset: 0, count: 0, total: 0 },
    };
  }
}

export async function fetchNewsByTopic(topic: string, options?: {
  limit?: number;
  countries?: string[];
}): Promise<MediaStackResponse> {
  return fetchTrendingNews({
    keywords: topic,
    countries: options?.countries || ['us'],
    limit: options?.limit || 10,
    sort: 'published_desc',
  });
}

export async function fetchTrendingTopics(options?: {
  categories?: string[];
  limit?: number;
}): Promise<MediaStackResponse> {
  return fetchTrendingNews({
    categories: options?.categories || ['general', 'technology', 'business'],
    limit: options?.limit || 20,
    sort: 'score_desc',
  });
}

export function clearCache(): void {
  CACHE.clear();
}
