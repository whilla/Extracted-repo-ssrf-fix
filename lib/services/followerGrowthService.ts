import { logger } from '@/lib/utils/logger';
import { kvGet, kvSet, readFile, writeFile, PATHS } from './puterService';
import { serverGetCredential } from './serverCredentials';

export interface FollowerSnapshot {
  date: string;
  platform: string;
  count: number;
  source: 'api' | 'estimated';
}

export interface FollowerGrowthData {
  history: FollowerSnapshot[];
  current: Record<string, number>;
  trends: Record<string, { daily: number; weekly: number; monthly: number }>;
  lastUpdated: string;
}

const FOLLOWER_DATA_PATH = `${PATHS.analytics}/follower_growth.json`;
const MAX_HISTORY = 365;

async function loadData(): Promise<FollowerGrowthData> {
  const data = await readFile<FollowerGrowthData>(FOLLOWER_DATA_PATH, true);
  if (data && data.history && data.current) return data;
  return { history: [], current: {}, trends: {}, lastUpdated: '' };
}

async function saveData(data: FollowerGrowthData): Promise<void> {
  data.history = data.history.slice(-MAX_HISTORY);
  await writeFile(FOLLOWER_DATA_PATH, JSON.stringify(data));
}

interface PlatformApiConfig {
  platform: string;
  credentialKeys: string[];
  apiEndpoint: string | ((...args: string[]) => string);
  responseParser: (data: unknown) => number;
}

const PLATFORM_APIS: PlatformApiConfig[] = [
  {
    platform: 'youtube',
    credentialKeys: ['youtube_api_key', 'youtube_channel_id'],
    apiEndpoint: (key: string, channelId: string) => `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${key}`,
    responseParser: (data: any) => parseInt(data?.items?.[0]?.statistics?.subscriberCount || '0', 10),
  },
  {
    platform: 'instagram',
    credentialKeys: ['instagram_access_token', 'instagram_business_account_id'],
    apiEndpoint: (token: string, accountId: string) => `https://graph.facebook.com/v18.0/${accountId}?fields=followers_count&access_token=${token}`,
    responseParser: (data: any) => parseInt(data?.followers_count || '0', 10),
  },
  {
    platform: 'twitter',
    credentialKeys: ['twitter_api_key', 'twitter_username'],
    apiEndpoint: (key: string, username: string) => `https://api.twitter.com/2/users/by/username/${username}?user.fields=public_metrics`,
    responseParser: (data: any) => parseInt(data?.data?.public_metrics?.followers_count || '0', 10),
  },
  {
    platform: 'tiktok',
    credentialKeys: ['tiktok_access_token'],
    apiEndpoint: (token: string) => 'https://open.tiktokapis.com/v2/user/info/?fields=follower_count',
    responseParser: (data: any) => parseInt(data?.data?.user?.follower_count || '0', 10),
  },
];

export async function fetchFollowerCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const config of PLATFORM_APIS) {
    try {
      const creds = await Promise.all(
        config.credentialKeys.map(k => serverGetCredential(k).then(v => v || kvGet(k)))
      );

      if (creds.some(c => !c)) continue;

      const endpoint = typeof config.apiEndpoint === 'function'
        ? config.apiEndpoint(creds[0]!, creds[1] || '')
        : config.apiEndpoint;

      const response = await fetch(endpoint, {
        headers: creds[0] ? { 'Authorization': `Bearer ${creds[0]}` } : {},
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = await response.json();
        const count = config.responseParser(data);
        if (count > 0) counts[config.platform] = count;
      }
    } catch (err) {
      logger.warn(`[FollowerGrowth] Failed to fetch ${config.platform}`, err instanceof Error ? err.message : String(err));
    }
  }

  return counts;
}

export async function recordFollowerSnapshot(platform: string, count: number): Promise<void> {
  const data = await loadData();
  const today = new Date().toISOString().split('T')[0];

  data.current[platform] = count;
  data.history.push({ date: today, platform, count, source: 'api' });
  data.lastUpdated = new Date().toISOString();

  // Calculate trends
  const platformHistory = data.history.filter(h => h.platform === platform);
  if (platformHistory.length >= 2) {
    const sorted = platformHistory.sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1].count;
    const dayAgo = sorted.filter(h => h.date >= getDaysAgo(1));
    const weekAgo = sorted.filter(h => h.date >= getDaysAgo(7));
    const monthAgo = sorted.filter(h => h.date >= getDaysAgo(30));

    data.trends[platform] = {
      daily: dayAgo.length >= 2 ? latest - dayAgo[0].count : 0,
      weekly: weekAgo.length >= 2 ? latest - weekAgo[0].count : 0,
      monthly: monthAgo.length >= 2 ? latest - monthAgo[0].count : 0,
    };
  }

  await saveData(data);
}

function getDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export async function syncAllFollowerCounts(): Promise<Record<string, number>> {
  const counts = await fetchFollowerCounts();
  for (const [platform, count] of Object.entries(counts)) {
    await recordFollowerSnapshot(platform, count);
  }
  return counts;
}

export async function getFollowerGrowthData(): Promise<FollowerGrowthData> {
  const data = await loadData();

  // Auto-sync if stale (older than 6 hours)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  if (!data.lastUpdated || data.lastUpdated < sixHoursAgo) {
    syncAllFollowerCounts().catch(err => {
      logger.warn('[FollowerGrowth] Background sync failed:', err);
    });
  }

  return data;
}

export async function getFollowerHistory(
  platform: string,
  days: number = 30
): Promise<FollowerSnapshot[]> {
  const data = await loadData();
  const cutoff = getDaysAgo(days);
  return data.history
    .filter(h => h.platform === platform && h.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));
}
