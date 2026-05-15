// UTM and Campaign Tracking Service for NexusAI
// Tracks campaign performance across platforms

import { kvGet, kvSet } from './puterService';

export interface UTMCampaign {
  id: string;
  name: string;
  source: string;
  medium: string;
  term?: string;
  content?: string;
  createdAt: string;
  posts: string[]; // Post IDs
  metrics: CampaignMetrics;
}

export interface CampaignMetrics {
  clicks: number;
  impressions: number;
  conversions: number;
  revenue: number;
  engagement: number;
  lastUpdated: string;
}

export interface UTMParams {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term?: string;
  utm_content?: string;
}

const CAMPAIGNS_KEY = 'nexus_campaigns';

/**
 * Generate UTM parameters for a campaign
 */
export function generateUTMParams(campaign: UTMCampaign): UTMParams {
  return {
    utm_source: campaign.source,
    utm_medium: campaign.medium,
    utm_campaign: campaign.name.toLowerCase().replace(/\s+/g, '-'),
    ...(campaign.term && { utm_term: campaign.term }),
    ...(campaign.content && { utm_content: campaign.content }),
  };
}

/**
 * Build a URL with UTM parameters
 */
export function buildUTMUrl(baseUrl: string, campaign: UTMCampaign): string {
  const params = generateUTMParams(campaign);
  const url = new URL(baseUrl);
  
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });
  
  return url.toString();
}

/**
 * Parse UTM parameters from a URL
 */
export function parseUTMParams(url: string): Partial<UTMParams> {
  try {
    const parsed = new URL(url);
    return {
      utm_source: parsed.searchParams.get('utm_source') || undefined,
      utm_medium: parsed.searchParams.get('utm_medium') || undefined,
      utm_campaign: parsed.searchParams.get('utm_campaign') || undefined,
      utm_term: parsed.searchParams.get('utm_term') || undefined,
      utm_content: parsed.searchParams.get('utm_content') || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Create a new campaign
 */
export async function createCampaign(campaign: Omit<UTMCampaign, 'id' | 'createdAt' | 'posts' | 'metrics'>): Promise<UTMCampaign> {
  const campaigns = await loadCampaigns();
  
  const newCampaign: UTMCampaign = {
    ...campaign,
    id: `camp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    posts: [],
    metrics: {
      clicks: 0,
      impressions: 0,
      conversions: 0,
      revenue: 0,
      engagement: 0,
      lastUpdated: new Date().toISOString(),
    },
  };
  
  campaigns.push(newCampaign);
  await saveCampaigns(campaigns);
  
  return newCampaign;
}

/**
 * Load all campaigns
 */
export async function loadCampaigns(): Promise<UTMCampaign[]> {
  const data = await kvGet(CAMPAIGNS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save campaigns
 */
async function saveCampaigns(campaigns: UTMCampaign[]): Promise<void> {
  await kvSet(CAMPAIGNS_KEY, JSON.stringify(campaigns));
}

/**
 * Get a campaign by ID
 */
export async function getCampaign(id: string): Promise<UTMCampaign | null> {
  const campaigns = await loadCampaigns();
  return campaigns.find(c => c.id === id) || null;
}

/**
 * Update campaign metrics
 */
export async function updateCampaignMetrics(
  id: string,
  metrics: Partial<CampaignMetrics>
): Promise<UTMCampaign | null> {
  const campaigns = await loadCampaigns();
  const index = campaigns.findIndex(c => c.id === id);
  
  if (index === -1) return null;
  
  campaigns[index].metrics = {
    ...campaigns[index].metrics,
    ...metrics,
    lastUpdated: new Date().toISOString(),
  };
  
  await saveCampaigns(campaigns);
  return campaigns[index];
}

/**
 * Add a post to a campaign
 */
export async function addPostToCampaign(campaignId: string, postId: string): Promise<boolean> {
  const campaigns = await loadCampaigns();
  const campaign = campaigns.find(c => c.id === campaignId);
  
  if (!campaign) return false;
  
  if (!campaign.posts.includes(postId)) {
    campaign.posts.push(postId);
    await saveCampaigns(campaigns);
  }
  
  return true;
}

/**
 * Get campaign performance summary
 */
export async function getCampaignPerformance(id: string): Promise<{
  campaign: UTMCampaign | null;
  roi: number;
  ctr: number;
  conversionRate: number;
} | null> {
  const campaign = await getCampaign(id);
  if (!campaign) return null;
  
  const { clicks, impressions, conversions, revenue } = campaign.metrics;
  
  return {
    campaign,
    roi: revenue > 0 ? (revenue - clicks * 0.5) / (clicks * 0.5) * 100 : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
  };
}

/**
 * List all campaigns with optional filtering
 */
export async function listCampaigns(filters?: {
  source?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<UTMCampaign[]> {
  let campaigns = await loadCampaigns();
  
  if (filters?.source) {
    campaigns = campaigns.filter(c => c.source === filters.source);
  }
  
  if (filters?.dateFrom) {
    campaigns = campaigns.filter(c => c.createdAt >= filters.dateFrom!);
  }
  
  if (filters?.dateTo) {
    campaigns = campaigns.filter(c => c.createdAt <= filters.dateTo!);
  }
  
  return campaigns.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Delete a campaign
 */
export async function deleteCampaign(id: string): Promise<boolean> {
  const campaigns = await loadCampaigns();
  const filtered = campaigns.filter(c => c.id !== id);
  
  if (filtered.length === campaigns.length) return false;
  
  await saveCampaigns(filtered);
  return true;
}
