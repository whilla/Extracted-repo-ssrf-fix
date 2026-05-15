import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  generateUTMParams, 
  buildUTMUrl, 
  parseUTMParams,
  UTMCampaign 
} from '@/lib/services/campaignTrackingService';

describe('Campaign Tracking Service', () => {
  describe('generateUTMParams', () => {
    it('should generate UTM parameters from campaign', () => {
      const campaign: UTMCampaign = {
        id: 'test',
        name: 'Summer Sale',
        source: 'twitter',
        medium: 'social',
        term: 'summer',
        content: 'banner',
        createdAt: '2024-01-01',
        posts: [],
        metrics: {
          clicks: 0,
          impressions: 0,
          conversions: 0,
          revenue: 0,
          engagement: 0,
          lastUpdated: '2024-01-01',
        },
      };

      const params = generateUTMParams(campaign);

      expect(params.utm_source).toBe('twitter');
      expect(params.utm_medium).toBe('social');
      expect(params.utm_campaign).toBe('summer-sale');
      expect(params.utm_term).toBe('summer');
      expect(params.utm_content).toBe('banner');
    });
  });

  describe('buildUTMUrl', () => {
    it('should build URL with UTM parameters', () => {
      const campaign: UTMCampaign = {
        id: 'test',
        name: 'Test Campaign',
        source: 'facebook',
        medium: 'paid',
        createdAt: '2024-01-01',
        posts: [],
        metrics: {
          clicks: 0,
          impressions: 0,
          conversions: 0,
          revenue: 0,
          engagement: 0,
          lastUpdated: '2024-01-01',
        },
      };

      const url = buildUTMUrl('https://example.com', campaign);

      expect(url).toContain('utm_source=facebook');
      expect(url).toContain('utm_medium=paid');
      expect(url).toContain('utm_campaign=test-campaign');
    });
  });

  describe('parseUTMParams', () => {
    it('should parse UTM parameters from URL', () => {
      const url = 'https://example.com?utm_source=twitter&utm_medium=social&utm_campaign=test';
      
      const params = parseUTMParams(url);

      expect(params.utm_source).toBe('twitter');
      expect(params.utm_medium).toBe('social');
      expect(params.utm_campaign).toBe('test');
    });

    it('should return empty object for invalid URL', () => {
      const params = parseUTMParams('not-a-url');
      expect(params).toEqual({});
    });
  });
});

describe('Offline Generation Service', () => {
  it('should detect offline mode', async () => {
    const { isOfflineMode } = await import('@/lib/services/offlineGenerationService');
    
    // This test depends on navigator state
    expect(typeof isOfflineMode()).toBe('boolean');
  });
});

describe('RSS Service', () => {
  it('should generate valid RSS XML', async () => {
    const { generateRSSFeed } = await import('@/lib/services/rssService');

    const xml = generateRSSFeed([
      {
        title: 'Test Post',
        description: 'Test description',
        link: 'https://example.com/post',
        pubDate: '2024-01-01T00:00:00Z',
        content: 'Test content',
      },
    ]);

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>Test Post</title>');
  });

  it('should escape XML special characters', async () => {
    const { generateRSSFeed } = await import('@/lib/services/rssService');

    const xml = generateRSSFeed([
      {
        title: 'Test & Post <script>',
        description: 'Test "description"',
        link: 'https://example.com/post',
        pubDate: '2024-01-01T00:00:00Z',
        content: 'Test content',
      },
    ]);

    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    expect(xml).toContain('&quot;');
  });
});

describe('SSO Service', () => {
  it('should have SSO functions available', async () => {
    const ssoModule = await import('@/lib/services/ssoService');

    expect(ssoModule.getSSOProviderByDomain).toBeDefined();
    expect(ssoModule.createSSOProvider).toBeDefined();
    expect(ssoModule.listSSOProviders).toBeDefined();
  });
});

describe('Amazon OAuth Service', () => {
  it('should generate auth URL', async () => {
    const { getAmazonAuthUrl, generateOAuthState } = await import('@/lib/services/amazonOAuthService');

    const state = generateOAuthState();
    expect(state.length).toBeGreaterThan(0);

    const url = getAmazonAuthUrl({
      clientId: 'test-client',
      clientSecret: 'test-secret',
      redirectUri: 'https://example.com/callback',
      region: 'us-east-1',
    }, state);

    expect(url).toContain('client_id=test-client');
    expect(url).toContain('state=');
  });
});
