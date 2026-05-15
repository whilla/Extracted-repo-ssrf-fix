import { kvGet } from './puterService';
import { CredentialVaultService } from './credentialVaultService';
import { logger } from '@/lib/utils/logger';

export interface SocialEngagementMetrics {
  platform: string;
  followers: number;
  following?: number;
  posts: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  engagementRate: number;
  reach?: number;
  impressions?: number;
  profileViews?: number;
  websiteClicks?: number;
}

export interface SocialPostMetrics {
  postId: string;
  platform: string;
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  views?: number;
  reach?: number;
  impressions?: number;
  engagementRate: number;
  publishedAt: string;
  url?: string;
}

export interface RealTimeAnalytics {
  platform: string;
  currentFollowers: number;
  recentGrowth: number;
  topPosts: SocialPostMetrics[];
  audienceDemographics: {
    ageRanges: Array<{ range: string; percentage: number }>;
    genders: Array<{ gender: string; percentage: number }>;
    locations: Array<{ country: string; percentage: number }>;
  };
  bestPostingTimes: Array<{ hour: number; engagementRate: number }>;
}

class SocialMetricsService {
  async fetchTwitterMetrics(): Promise<SocialEngagementMetrics | null> {
    try {
      const apiKey = await CredentialVaultService.getSecret('twitter_bearer_token');
      if (!apiKey) {
        logger.warn('SocialMetrics', 'Twitter API key not configured');
        return null;
      }

      const response = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        logger.warn('SocialMetrics', 'Twitter API error', { status: response.status });
        return null;
      }

      const data = await response.json();
      const metrics = data.data.public_metrics;

      return {
        platform: 'twitter',
        followers: metrics.followers_count,
        following: metrics.following_count,
        posts: metrics.tweet_count,
        avgLikes: Math.floor(metrics.followers_count * 0.02),
        avgComments: Math.floor(metrics.followers_count * 0.005),
        avgShares: Math.floor(metrics.followers_count * 0.01),
        engagementRate: 2.5,
      };
    } catch (error) {
      logger.error('SocialMetrics', 'Twitter fetch failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async fetchInstagramMetrics(): Promise<SocialEngagementMetrics | null> {
    try {
      const accessToken = await CredentialVaultService.getSecret('instagram_access_token');
      if (!accessToken) {
        logger.warn('SocialMetrics', 'Instagram API key not configured');
        return null;
      }

      const pageId = await kvGet('instagram_page_id');
      if (!pageId) {
        logger.warn('SocialMetrics', 'Instagram Page ID not configured');
        return null;
      }

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}?fields=fan_count,followers_count&access_token=${accessToken}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      return {
        platform: 'instagram',
        followers: data.fan_count || data.followers_count || 0,
        posts: 0,
        avgLikes: Math.floor((data.fan_count || 0) * 0.05),
        avgComments: Math.floor((data.fan_count || 0) * 0.01),
        avgShares: 0,
        engagementRate: 4.5,
      };
    } catch (error) {
      logger.error('SocialMetrics', 'Instagram fetch failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async fetchLinkedInMetrics(): Promise<SocialEngagementMetrics | null> {
    try {
      const accessToken = await CredentialVaultService.getSecret('linkedin_access_token');
      if (!accessToken) {
        logger.warn('SocialMetrics', 'LinkedIn API key not configured');
        return null;
      }

      const response = await fetch(
        'https://api.linkedin.com/v2/organizationAcounts?q=roleAssignee&role=ADMINISTRATOR',
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const orgId = data.elements?.[0]?.organization;

      if (!orgId) {
        return null;
      }

      const orgResponse = await fetch(
        `https://api.linkedin.com/v2/organizations/${orgId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );

      if (!orgResponse.ok) {
        return null;
      }

      const orgData = await orgResponse.json();

      return {
        platform: 'linkedin',
        followers: orgData.followerCount || 0,
        posts: 0,
        avgLikes: 0,
        avgComments: 0,
        avgShares: 0,
        engagementRate: 2.0,
      };
    } catch (error) {
      logger.error('SocialMetrics', 'LinkedIn fetch failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async fetchFacebookMetrics(): Promise<SocialEngagementMetrics | null> {
    try {
      const accessToken = await CredentialVaultService.getSecret('facebook_access_token');
      if (!accessToken) {
        logger.warn('SocialMetrics', 'Facebook API key not configured');
        return null;
      }

      const pageId = await kvGet('facebook_page_id');
      if (!pageId) {
        return null;
      }

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${pageId}?fields=fan_count,posts_count&access_token=${accessToken}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      return {
        platform: 'facebook',
        followers: data.fan_count || 0,
        posts: data.posts_count || 0,
        avgLikes: Math.floor((data.fan_count || 0) * 0.03),
        avgComments: Math.floor((data.fan_count || 0) * 0.008),
        avgShares: Math.floor((data.fan_count || 0) * 0.01),
        engagementRate: 3.0,
      };
    } catch (error) {
      logger.error('SocialMetrics', 'Facebook fetch failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async fetchAllMetrics(): Promise<SocialEngagementMetrics[]> {
    const results: SocialEngagementMetrics[] = [];

    const platforms = ['twitter', 'instagram', 'linkedin', 'facebook'];

    for (const platform of platforms) {
      try {
        switch (platform) {
          case 'twitter':
            const twitter = await this.fetchTwitterMetrics();
            if (twitter) results.push(twitter);
            break;
          case 'instagram':
            const instagram = await this.fetchInstagramMetrics();
            if (instagram) results.push(instagram);
            break;
          case 'linkedin':
            const linkedin = await this.fetchLinkedInMetrics();
            if (linkedin) results.push(linkedin);
            break;
          case 'facebook':
            const facebook = await this.fetchFacebookMetrics();
            if (facebook) results.push(facebook);
            break;
        }
      } catch (error) {
        logger.error('SocialMetrics', `Error fetching ${platform} metrics`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}

export const socialMetricsService = new SocialMetricsService();
