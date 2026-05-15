// Social Media Listening Service for NexusAI
// Monitors brand mentions, keywords, and sentiment across platforms

import { kvGet, kvSet } from './puterService';

export interface Mention {
  id: string;
  platform: string;
  author: string;
  content: string;
  url: string;
  timestamp: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  engagement: {
    likes: number;
    shares: number;
    comments: number;
  };
  keywords: string[];
}

export interface ListeningQuery {
  id: string;
  query: string;
  platforms: string[];
  sentiment: 'all' | 'positive' | 'negative' | 'neutral';
  isActive: boolean;
  createdAt: string;
  lastChecked: string;
  mentionCount: number;
}

const MENTIONS_KEY = 'nexus_mentions';
const QUERIES_KEY = 'nexus_listening_queries';

/**
 * Create a new listening query
 */
export async function createListeningQuery(query: Omit<ListeningQuery, 'id' | 'createdAt' | 'lastChecked' | 'mentionCount'>): Promise<ListeningQuery> {
  const queries = await loadListeningQueries();
  
  const newQuery: ListeningQuery = {
    ...query,
    id: `query_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    lastChecked: new Date().toISOString(),
    mentionCount: 0,
  };
  
  queries.push(newQuery);
  await saveListeningQueries(queries);
  
  return newQuery;
}

/**
 * Load all listening queries
 */
export async function loadListeningQueries(): Promise<ListeningQuery[]> {
  const data = await kvGet(QUERIES_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save listening queries
 */
async function saveListeningQueries(queries: ListeningQuery[]): Promise<void> {
  await kvSet(QUERIES_KEY, JSON.stringify(queries));
}

/**
 * Fetch mentions for a query (simulated - in production, use platform APIs)
 */
export async function fetchMentionsForQuery(query: ListeningQuery): Promise<Mention[]> {
  // In production, this would call platform APIs (Twitter, Reddit, etc.)
  // For now, return empty array - the structure is ready for API integration
  console.log(`[SocialListening] Fetching mentions for query: ${query.query}`);
  return [];
}

/**
 * Run all active listening queries
 */
export async function runListeningCycle(): Promise<{
  totalMentions: number;
  newMentions: number;
  queriesRun: number;
}> {
  const queries = await loadListeningQueries();
  const activeQueries = queries.filter(q => q.isActive);
  
  let totalMentions = 0;
  let newMentions = 0;
  
  for (const query of activeQueries) {
    const mentions = await fetchMentionsForQuery(query);
    totalMentions += mentions.length;
    
    // Store new mentions
    const existingMentions = await loadMentions();
    const newMentionIds = new Set(existingMentions.map(m => m.id));
    
    for (const mention of mentions) {
      if (!newMentionIds.has(mention.id)) {
        existingMentions.push(mention);
        newMentions++;
      }
    }
    
    await saveMentions(existingMentions);
    
    // Update query
    query.lastChecked = new Date().toISOString();
    query.mentionCount += mentions.length;
  }
  
  await saveListeningQueries(queries);
  
  return {
    totalMentions,
    newMentions,
    queriesRun: activeQueries.length,
  };
}

/**
 * Load all mentions
 */
export async function loadMentions(): Promise<Mention[]> {
  const data = await kvGet(MENTIONS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save mentions
 */
async function saveMentions(mentions: Mention[]): Promise<void> {
  await kvSet(MENTIONS_KEY, JSON.stringify(mentions));
}

/**
 * Get mentions with optional filtering
 */
export async function getMentions(filters?: {
  platform?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  keyword?: string;
  dateFrom?: string;
  limit?: number;
}): Promise<Mention[]> {
  let mentions = await loadMentions();
  
  if (filters?.platform) {
    mentions = mentions.filter(m => m.platform === filters.platform);
  }
  
  if (filters?.sentiment) {
    mentions = mentions.filter(m => m.sentiment === filters.sentiment);
  }
  
  if (filters?.keyword) {
    mentions = mentions.filter(m => 
      m.keywords.some(k => k.toLowerCase().includes(filters.keyword!.toLowerCase()))
    );
  }
  
  if (filters?.dateFrom) {
    mentions = mentions.filter(m => m.timestamp >= filters.dateFrom!);
  }
  
  if (filters?.limit) {
    mentions = mentions.slice(0, filters.limit);
  }
  
  return mentions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Get mention statistics
 */
export async function getMentionStats(): Promise<{
  total: number;
  byPlatform: Record<string, number>;
  bySentiment: Record<string, number>;
  recentTrend: 'up' | 'down' | 'stable';
}> {
  const mentions = await loadMentions();
  
  const byPlatform: Record<string, number> = {};
  const bySentiment: Record<string, number> = { positive: 0, negative: 0, neutral: 0 };
  
  mentions.forEach(m => {
    byPlatform[m.platform] = (byPlatform[m.platform] || 0) + 1;
    bySentiment[m.sentiment]++;
  });
  
  // Calculate recent trend (last 7 days vs previous 7 days)
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
  
  const recentMentions = mentions.filter(m => new Date(m.timestamp).getTime() > sevenDaysAgo).length;
  const previousMentions = mentions.filter(m => {
    const time = new Date(m.timestamp).getTime();
    return time > fourteenDaysAgo && time <= sevenDaysAgo;
  }).length;
  
  let recentTrend: 'up' | 'down' | 'stable';
  if (recentMentions > previousMentions * 1.1) {
    recentTrend = 'up';
  } else if (recentMentions < previousMentions * 0.9) {
    recentTrend = 'down';
  } else {
    recentTrend = 'stable';
  }
  
  return {
    total: mentions.length,
    byPlatform,
    bySentiment,
    recentTrend,
  };
}

/**
 * Delete a listening query
 */
export async function deleteListeningQuery(id: string): Promise<boolean> {
  const queries = await loadListeningQueries();
  const filtered = queries.filter(q => q.id !== id);
  
  if (filtered.length === queries.length) return false;
  
  await saveListeningQueries(filtered);
  return true;
}

/**
 * Toggle a listening query
 */
export async function toggleListeningQuery(id: string): Promise<boolean> {
  const queries = await loadListeningQueries();
  const query = queries.find(q => q.id === id);
  
  if (!query) return false;
  
  query.isActive = !query.isActive;
  await saveListeningQueries(queries);
  
  return true;
}
