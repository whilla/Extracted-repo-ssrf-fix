import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nativeProviders } from '@/lib/services/nativeProviders';

vi.mock('@/lib/services/providerCredentialUtils', () => ({
  getSecureCredential: vi.fn(async (key: string) => {
    const keys: Record<string, string> = {
      mailchimp_api_key: 'apikey-us19',
      mailchimp_list_id: 'list123',
      mailchimp_server_prefix: 'us19',
      klaviyo_api_key: 'klaviyo_key',
      convertkit_api_key: 'ck_key',
      discord_webhook_url: 'https://discord.com/api/webhooks/test',
      telegram_bot_token: 'bot123',
      telegram_chat_id: 'chat456',
    };
    return keys[key] || '';
  }),
  sanitizeApiKey: vi.fn((key: string | null) => key || ''),
}));

vi.mock('@/lib/services/serverCredentials', () => ({
  serverGetCredential: vi.fn(async () => null),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/services/configError', () => ({
  createConfigError: (service: string) => new Error(`Configuration error for ${service}`),
  formatConfigErrorResponse: (error: Error) => ({ success: false, error: error.message }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('nativeProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('publishMailchimp', () => {
    it('creates and sends campaign', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'campaign123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const result = await nativeProviders.publishMailchimp('<h1>Hello</h1>', 'Test Campaign');

      expect(result.success).toBe(true);
      expect(result.postId).toBe('campaign123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('publishKlaviyo', () => {
    it('creates campaign and attempts to send', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: 'campaign456' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const result = await nativeProviders.publishKlaviyo('<h1>Hello</h1>', 'Test Campaign');

      expect(result.success).toBe(true);
      expect(result.postId).toBe('campaign456');
    });
  });

  describe('publishConvertKit', () => {
    it('creates broadcast and sends', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'broadcast789' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({}),
        });

      const result = await nativeProviders.publishConvertKit('<h1>Hello</h1>', 'Test Broadcast');

      expect(result.success).toBe(true);
      expect(result.postId).toBe('broadcast789');
    });
  });

  describe('publishDiscord', () => {
    it('sends message via webhook', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      const result = await nativeProviders.publishDiscord('Hello Discord!');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            content: 'Hello Discord!',
            embeds: [],
          }),
        })
      );
    });
  });

  describe('publishTelegram', () => {
    it('sends message via bot API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ result: { message_id: 999 } }),
      });

      const result = await nativeProviders.publishTelegram('Hello Telegram!');

      expect(result.success).toBe(true);
      expect(result.postId).toBe('999');
    });

    it('returns error when bot token missing', async () => {
      const { getSecureCredential } = await import('@/lib/services/providerCredentialUtils');
      vi.mocked(getSecureCredential).mockResolvedValue('');

      const result = await nativeProviders.publishTelegram('test');

      expect(result.success).toBe(false);
    });
  });
});
