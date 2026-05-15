import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectPublishService } from '@/lib/services/directPublishService';
import { nativeProviders } from '@/lib/services/nativeProviders';

// Mock the kvGet function
vi.mock('@/lib/services/puterService', () => ({
  kvGet: vi.fn(),
  kvSet: vi.fn(),
}));

vi.mock('@/lib/services/providerCredentialUtils', () => ({
  sanitizeApiKey: vi.fn((key) => key),
}));

vi.mock('@/lib/services/configError', () => ({
  createConfigError: vi.fn((service) => new Error(`${service} not configured`)),
  formatConfigErrorResponse: vi.fn((error) => ({ success: false, error: error.message })),
}));

import { kvGet } from '@/lib/services/puterService';

const mockKvGet = vi.mocked(kvGet);

describe('DirectPublishService Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('publishToTwitter', () => {
    it('should return error when API key is not configured', async () => {
      mockKvGet.mockResolvedValue(null);

      const result = await DirectPublishService.publishToTwitter('Test tweet');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Twitter API key not configured');
    });

    it('should handle API errors gracefully', async () => {
      mockKvGet.mockResolvedValue('test-api-key');

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ detail: 'Unauthorized' }),
      });

      const result = await DirectPublishService.publishToTwitter('Test tweet');

      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth');
    });
  });

  describe('publishToWordPress', () => {
    it('should return error when credentials are missing', async () => {
      mockKvGet.mockResolvedValue(null);

      const result = await DirectPublishService.publishToWordPress('Content', 'Title');

      expect(result.success).toBe(false);
    });

    it('should successfully publish when credentials are valid', async () => {
      mockKvGet.mockImplementation(async (key) => {
        if (key === 'wordpress_api_url') return 'https://example.com';
        if (key === 'wordpress_username') return 'admin';
        if (key === 'wordpress_application_password') return 'password';
        return null;
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 123, link: 'https://example.com/post' }),
      });

      const result = await DirectPublishService.publishToWordPress('Content', 'Title');

      expect(result.success).toBe(true);
      expect(result.postId).toBe('123');
      expect(result.platformUrl).toBe('https://example.com/post');
    });
  });

  describe('publishToTwitch', () => {
    it('should handle clip uploads', async () => {
      mockKvGet.mockImplementation(async (key) => {
        if (key === 'twitch_access_token') return 'token';
        if (key === 'twitch_client_id') return 'client-id';
        if (key === 'twitch_channel_id') return 'channel-123';
        return null;
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'clip-123' }),
      });

      const result = await DirectPublishService.publishToTwitch('Clip description', ['https://example.com/clip.mp4']);

      expect(result.success).toBe(true);
      expect(result.postId).toContain('clip');
    });

    it('should handle schedule creation', async () => {
      mockKvGet.mockImplementation(async (key) => {
        if (key === 'twitch_access_token') return 'token';
        if (key === 'twitch_client_id') return 'client-id';
        if (key === 'twitch_channel_id') return 'channel-123';
        return null;
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await DirectPublishService.publishToTwitch('Going live on 2024-01-15T20:00:00Z');

      expect(result.success).toBe(true);
      expect(result.postId).toContain('schedule');
    });
  });

  describe('publishToSubstack', () => {
    it('should use N8N webhook when configured', async () => {
      mockKvGet.mockImplementation(async (key) => {
        if (key === 'substack_n8n_webhook') return 'https://n8n.example.com/webhook';
        return null;
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await DirectPublishService.publishToSubstack('Content', 'Title');

      expect(result.success).toBe(true);
      expect(result.postId).toContain('n8n');
    });
  });

  describe('publish routing', () => {
    it('should route to correct platform handler', async () => {
      mockKvGet.mockResolvedValue(null);

      const platforms = ['twitter', 'linkedin', 'wordpress', 'medium', 'twitch'];

      for (const platform of platforms) {
        const result = await DirectPublishService.publish(platform as any, 'Test content');
        expect(result).toBeDefined();
        expect(result.success).toBeDefined();
      }
    });

    it('should return error for unsupported platform', async () => {
      const result = await DirectPublishService.publish('unsupported' as any, 'Test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not supported');
    });
  });
});

describe('nativeProviders Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('publishDiscord', () => {
    it('should send webhook when configured', async () => {
      vi.mock('@/lib/services/serverCredentials', () => ({
        serverGetCredential: vi.fn().mockResolvedValue('https://discord.com/webhook'),
      }));

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
      });

      const result = await nativeProviders.publishDiscord('Test message');

      expect(result.success).toBe(true);
    });
  });

  describe('publishReddit', () => {
    it('should return error when credentials missing', async () => {
      vi.mock('@/lib/services/serverCredentials', () => ({
        serverGetCredential: vi.fn().mockResolvedValue(null),
      }));

      const result = await nativeProviders.publishReddit('Content', 'Title');

      expect(result.success).toBe(false);
    });
  });
});
