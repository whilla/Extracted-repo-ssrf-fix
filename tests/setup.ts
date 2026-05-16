import { vi } from 'vitest';

vi.mock('@/lib/services/puterService', () => ({
  kvGet: vi.fn(async (key: string) => {
    const store: Record<string, string> = {
      twitter_consumer_key: 'test_consumer_key',
      twitter_consumer_secret: 'test_consumer_secret',
      twitter_access_token: 'test_access_token',
      twitter_access_secret: 'test_access_secret',
      youtube_oauth_token: 'test_youtube_oauth',
      youtube_api_key: 'test_youtube_key',
      linkedin_access_token: 'test_linkedin_token',
      linkedin_person_id: 'test_person_id',
      instagram_access_token: 'test_ig_token',
      instagram_business_account_id: 'test_ig_account',
      facebook_access_token: 'test_fb_token',
      facebook_page_id: 'test_fb_page',
      mailchimp_api_key: 'test_mc_key',
      mailchimp_list_id: 'test_mc_list',
      mailchimp_server_prefix: 'us19',
      klaviyo_api_key: 'test_klaviyo_key',
      convertkit_api_key: 'test_ck_key',
      discord_webhook_url: 'https://discord.com/api/webhooks/test',
      telegram_bot_token: 'test_tg_token',
      telegram_chat_id: 'test_tg_chat',
    };
    return store[key] || null;
  }),
  kvSet: vi.fn(async () => {}),
  kvDelete: vi.fn(async () => {}),
}));

vi.mock('@/lib/services/providerCredentialUtils', () => ({
  sanitizeApiKey: vi.fn((key: string | null) => key || ''),
  getSecureCredential: vi.fn(async (key: string) => {
    const store: Record<string, string> = {
      discord_webhook_url: 'https://discord.com/api/webhooks/test',
      reddit_access_token: 'test_reddit_token',
      reddit_client_id: 'test_reddit_client',
      whatsapp_token: 'test_wa_token',
      whatsapp_phone_id: 'test_wa_phone',
      telegram_bot_token: 'test_tg_token',
      telegram_chat_id: 'test_tg_chat',
      wordpress_api_url: 'https://example.com',
      wordpress_username: 'admin',
      wordpress_application_password: 'test_wp_pass',
      medium_integration_token: 'test_medium_token',
      medium_user_id: 'test_medium_user',
      ghost_api_url: 'https://ghost.example.com',
      ghost_admin_api_key: 'test_ghost_key',
      mailchimp_api_key: 'test_mc_key',
      mailchimp_list_id: 'test_mc_list',
      mailchimp_server_prefix: 'us19',
      klaviyo_api_key: 'test_klaviyo_key',
      convertkit_api_key: 'test_ck_key',
      shopify_store_url: 'https://test-shop.myshopify.com',
      shopify_access_token: 'test_shopify_token',
      etsy_api_key: 'test_etsy_key',
      etsy_shop_id: 'test_etsy_shop',
    };
    return store[key] || '';
  }),
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
