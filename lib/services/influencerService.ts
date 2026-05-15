// Influencer Management Service for NexusAI
// Tracks and manages influencer relationships and campaigns

import { kvGet, kvSet } from './puterService';

export interface Influencer {
  id: string;
  name: string;
  platform: string;
  handle: string;
  followers: number;
  engagementRate: number;
  niche: string[];
  contactEmail?: string;
  status: 'prospect' | 'contacted' | 'negotiating' | 'active' | 'completed' | 'rejected';
  notes: string;
  campaigns: string[]; // Campaign IDs
  createdAt: string;
  updatedAt: string;
}

export interface InfluencerCampaign {
  id: string;
  name: string;
  influencers: string[]; // Influencer IDs
  budget: number;
  startDate: string;
  endDate: string;
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  deliverables: string[];
  metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
  };
  createdAt: string;
}

const INFLUENCERS_KEY = 'nexus_influencers';
const INFLUENCER_CAMPAIGNS_KEY = 'nexus_influencer_campaigns';

/**
 * Add a new influencer
 */
export async function addInfluencer(influencer: Omit<Influencer, 'id' | 'createdAt' | 'updatedAt' | 'campaigns'>): Promise<Influencer> {
  const influencers = await loadInfluencers();
  
  const newInfluencer: Influencer = {
    ...influencer,
    id: `inf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    campaigns: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  influencers.push(newInfluencer);
  await saveInfluencers(influencers);
  
  return newInfluencer;
}

/**
 * Load all influencers
 */
export async function loadInfluencers(): Promise<Influencer[]> {
  const data = await kvGet(INFLUENCERS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save influencers
 */
async function saveInfluencers(influencers: Influencer[]): Promise<void> {
  await kvSet(INFLUENCERS_KEY, JSON.stringify(influencers));
}

/**
 * Get influencer by ID
 */
export async function getInfluencer(id: string): Promise<Influencer | null> {
  const influencers = await loadInfluencers();
  return influencers.find(i => i.id === id) || null;
}

/**
 * Update influencer
 */
export async function updateInfluencer(id: string, updates: Partial<Influencer>): Promise<Influencer | null> {
  const influencers = await loadInfluencers();
  const index = influencers.findIndex(i => i.id === id);
  
  if (index === -1) return null;
  
  influencers[index] = {
    ...influencers[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  await saveInfluencers(influencers);
  return influencers[index];
}

/**
 * Create influencer campaign
 */
export async function createInfluencerCampaign(campaign: Omit<InfluencerCampaign, 'id' | 'createdAt' | 'metrics'>): Promise<InfluencerCampaign> {
  const campaigns = await loadInfluencerCampaigns();
  
  const newCampaign: InfluencerCampaign = {
    ...campaign,
    id: `icamp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    metrics: {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
    },
    createdAt: new Date().toISOString(),
  };
  
  campaigns.push(newCampaign);
  await saveInfluencerCampaigns(campaigns);
  
  // Add campaign to influencers
  for (const infId of campaign.influencers) {
    const influencer = await getInfluencer(infId);
    if (influencer) {
      influencer.campaigns.push(newCampaign.id);
      await updateInfluencer(infId, { campaigns: influencer.campaigns });
    }
  }
  
  return newCampaign;
}

/**
 * Load influencer campaigns
 */
export async function loadInfluencerCampaigns(): Promise<InfluencerCampaign[]> {
  const data = await kvGet(INFLUENCER_CAMPAIGNS_KEY);
  return data ? JSON.parse(data) : [];
}

/**
 * Save influencer campaigns
 */
async function saveInfluencerCampaigns(campaigns: InfluencerCampaign[]): Promise<void> {
  await kvSet(INFLUENCER_CAMPAIGNS_KEY, JSON.stringify(campaigns));
}

/**
 * Search influencers by criteria
 */
export async function searchInfluencers(criteria: {
  platform?: string;
  niche?: string;
  minFollowers?: number;
  maxFollowers?: number;
  minEngagementRate?: number;
  status?: Influencer['status'];
}): Promise<Influencer[]> {
  let influencers = await loadInfluencers();
  
  if (criteria.platform) {
    influencers = influencers.filter(i => i.platform === criteria.platform);
  }
  
  if (criteria.niche) {
    influencers = influencers.filter(i => i.niche.includes(criteria.niche!));
  }
  
  if (criteria.minFollowers) {
    influencers = influencers.filter(i => i.followers >= criteria.minFollowers!);
  }
  
  if (criteria.maxFollowers) {
    influencers = influencers.filter(i => i.followers <= criteria.maxFollowers!);
  }
  
  if (criteria.minEngagementRate) {
    influencers = influencers.filter(i => i.engagementRate >= criteria.minEngagementRate!);
  }
  
  if (criteria.status) {
    influencers = influencers.filter(i => i.status === criteria.status);
  }
  
  return influencers.sort((a, b) => b.followers - a.followers);
}

/**
 * Get influencer performance metrics
 */
export async function getInfluencerPerformance(id: string): Promise<{
  influencer: Influencer | null;
  totalCampaigns: number;
  activeCampaigns: number;
  totalImpressions: number;
  totalClicks: number;
  avgEngagementRate: number;
} | null> {
  const influencer = await getInfluencer(id);
  if (!influencer) return null;
  
  const campaigns = await loadInfluencerCampaigns();
  const influencerCampaigns = campaigns.filter(c => influencer.campaigns.includes(c.id));
  
  const totalImpressions = influencerCampaigns.reduce((sum, c) => sum + c.metrics.impressions, 0);
  const totalClicks = influencerCampaigns.reduce((sum, c) => sum + c.metrics.clicks, 0);
  const activeCampaigns = influencerCampaigns.filter(c => c.status === 'active').length;
  
  return {
    influencer,
    totalCampaigns: influencerCampaigns.length,
    activeCampaigns,
    totalImpressions,
    totalClicks,
    avgEngagementRate: influencer.engagementRate,
  };
}

/**
 * Delete influencer
 */
export async function deleteInfluencer(id: string): Promise<boolean> {
  const influencers = await loadInfluencers();
  const filtered = influencers.filter(i => i.id !== id);
  
  if (filtered.length === influencers.length) return false;
  
  await saveInfluencers(filtered);
  return true;
}
