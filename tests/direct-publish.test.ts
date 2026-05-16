import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirectPublishService } from '@/lib/services/directPublishService';
import { kvGet } from '@/lib/services/puterService';

vi.mock('@/lib/services/puterService');
vi.mock('@/lib/services/providerCredentialUtils');
vi.mock('@/lib/services/serverCredentials');
vi.mock('@/lib/utils/logger');
vi.mock('@/lib/services/configError');

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DirectPublishService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('publishToTwitter', () => {
    it('returns error when OAuth credentials are missing', async () => {
      vi.mocked(kvGet).mockResolvedValue(null);

      const result = await DirectPublishService.publishToTwitter('test tweet');

      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth 1.0a');
    });

    it('publishes tweet with OAuth 1.0a signing', async () => {
      vi.mocked(kvGet).mockImplementation(async (key: string) => {
        const keys: Record<string, string> = {
          twitter_consumer_key: 'ck',
          twitter_consumer_secret: 'cs',
          twitter_access_token: 'at',
          twitter_access_secret: 'as',
        };
        return keys[key] || null;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: '123456' } }),
      });

      const result = await DirectPublishService.publishToTwitter('test tweet');

      expect(result.success).toBe(true);
      expect(result.postId).toBe('123456');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.twitter.com/2/tweets',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('OAuth'),
          }),
        })
      );
    });

    it('truncates tweet to 280 characters', async () => {
      vi.mocked(kvGet).mockImplementation(async (key: string) => {
        const keys: Record<string, string> = {
          twitter_consumer_key: 'ck',
          twitter_consumer_secret: 'cs',
          twitter_access_token: 'at',
          twitter_access_secret: 'as',
        };
        return keys[key] || null;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: '789' } }),
      });

      const longText = 'a'.repeat(300);
      await DirectPublishService.publishToTwitter(longText);

      const callArgs = mockFetch.mock.calls[0][1];
      const body = JSON.parse(callArgs.body);
      expect(body.text.length).toBeLessThanOrEqual(280);
    });
  });

  describe('publishToYouTube', () => {
    it('returns error when no credentials configured', async () => {
      vi.mocked(kvGet).mockResolvedValue(null);

      const result = await DirectPublishService.publishToYouTube('title', 'desc');

      expect(result.success).toBe(false);
    });

    it('requires video URL for OAuth uploads', async () => {
      vi.mocked(kvGet).mockImplementation(async (key: string) => {
        return key === 'youtube_oauth_token' ? 'token' : null;
      });

      const result = await DirectPublishService.publishToYouTube('title', 'desc', []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('video file URL');
    });

    it('initiates resumable upload with OAuth token', async () => {
      vi.mocked(kvGet).mockImplementation(async (key: string) => {
        return key === 'youtube_oauth_token' ? 'oauth_token' : null;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: () => 'https://upload.youtube.com/upload' },
        })
        .mockResolvedValueOnce({
          ok: true,
          blob: async () => new Blob(['video data']),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'video123' }),
        });

      const result = await DirectPublishService.publishToYouTube('title', 'desc', ['https://example.com/video.mp4']);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer oauth_token',
          }),
        })
      );
    });
  });

  describe('publishToLinkedIn', () => {
    it('returns error when access token missing', async () => {
      vi.mocked(kvGet).mockResolvedValue(null);

      const result = await DirectPublishService.publishToLinkedIn('test post');

      expect(result.success).toBe(false);
    });

    it('publishes to LinkedIn with correct API', async () => {
      vi.mocked(kvGet).mockImplementation(async (key: string) => {
        return key === 'linkedin_access_token' ? 'token' : key === 'linkedin_person_id' ? 'person123' : null;
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'urn:li:share:123' }),
      });

      const result = await DirectPublishService.publishToLinkedIn('test post');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.linkedin.com/v2/ugcPosts',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('publishToInstagram', () => {
    it('requires business account ID', async () => {
      vi.mocked(kvGet).mockImplementation(async (key: string) => {
        return key === 'instagram_access_token' ? 'token' : null;
      });

      const result = await DirectPublishService.publishToInstagram('test caption');

      expect(result.success).toBe(false);
      expect(result.error).toContain('business account');
    });

    it('uses two-step media container then publish flow', async () => {
      vi.mocked(kvGet).mockImplementation(async (key: string) => {
        const keys: Record<string, string> = {
          instagram_access_token: 'token',
          instagram_business_account_id: 'account123',
        };
        return keys[key] || null;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'container123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'post123' }),
        });

      const result = await DirectPublishService.publishToInstagram('test caption', ['https://example.com/image.jpg']);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
