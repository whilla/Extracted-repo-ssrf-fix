import { getSecureCredential } from './providerCredentialUtils';
import { serverGetCredential } from './serverCredentials';
import { logger } from '@/lib/utils/logger';

export interface NativePublishResult {
  success: boolean;
  postId?: string;
  error?: string;
  url?: string;
}

async function getCredential(key: string): Promise<string> {
  // Try server-compatible path first (env vars)
  const serverVal = await serverGetCredential(key);
  if (serverVal) return serverVal;
  // Fall back to browser path (Puter KV + Web Crypto)
  return getCredential(key);
}

function logError(context: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error as unknown as string);
  logger.error(`[NativeProviders/${context}]`, error as any);
  return message;
}

/**
 * Utilities for robust API interactions
 */
const utils = {
  /**
   * Safely parse JSON response, handling non-JSON errors (like 502/404 HTML)
   */
  async safeJsonParse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    const text = await response.text();
    throw new Error(`Expected JSON but received ${contentType || 'unknown type'}. Body snippet: ${text.slice(0, 100)}`);
  },

  /**
   * Unicode-safe Base64 encoding for browser and Node environments
   */
  safeBase64Encode(str: string): string {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf-8').toString('base64');
    }
    // Browser fallback (Unicode safe)
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));
  },

  /**
   * Masks sensitive error details from the end-user while keeping them in logs
   */
  maskError(context: string, error: any): string {
    const rawError = error instanceof Error ? error.message : String(error);
    logError(context, error);
    // Return a generic, safe message to the client
    return `An error occurred while communicating with ${context}. Please try again later.`;
  }
};

export const nativeProviders = {
  async publishDiscord(content: string, imageUrl?: string): Promise<NativePublishResult> {
    try {
      const webhookUrl = await getCredential('discord_webhook_url');
      if (!webhookUrl) throw new Error('Discord Webhook URL not configured');

      const payload = {
        content: content,
        embeds: imageUrl ? [{ image: { url: imageUrl } }] : [],
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Discord API error: ${response.statusText}`);

      return { success: true, url: webhookUrl };
    } catch (error) {
      return { success: false, error: utils.maskError('Discord', error) };
    }
  },

  async publishReddit(content: string, title: string, subreddit: string = 'marketing'): Promise<NativePublishResult> {
    try {
      const token = await getCredential('reddit_access_token');
      const clientId = await getCredential('reddit_client_id');
      
      if (!token || !clientId) throw new Error('Reddit credentials not configured');

      const response = await fetch('https://oauth.reddit.com/api/submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': `NexusAI/1.0 (by /u/${clientId})`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          sr: subreddit,
          kind: 'self',
          title: title,
          text: content,
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.error || `Reddit API error: ${response.statusText}`);

      return { success: true, postId: data.name };
    } catch (error) {
      return { success: false, error: utils.maskError('Reddit', error) };
    }
  },

  async publishWhatsApp(content: string, recipient: string): Promise<NativePublishResult> {
    try {
      const token = await getCredential('whatsapp_token');
      const phoneId = await getCredential('whatsapp_phone_id');

      if (!token || !phoneId) throw new Error('WhatsApp credentials not configured');

      const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'text',
          text: { body: content },
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.error?.message || `WhatsApp API error: ${response.statusText}`);

      return { success: true, postId: data.messages[0].id };
    } catch (error) {
      return { success: false, error: utils.maskError('WhatsApp', error) };
    }
  },

  async publishTelegram(content: string, chatId?: string): Promise<NativePublishResult> {
    try {
      const botToken = await getCredential('telegram_bot_token');
      if (!botToken) throw new Error('Telegram bot token not configured');

      const targetChatId = chatId || await getCredential('telegram_chat_id');
      if (!targetChatId) throw new Error('Telegram chat ID not configured');

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: content,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.description || `Telegram API error: ${response.statusText}`);

      return { success: true, postId: String(data.result?.message_id) };
    } catch (error) {
      return { success: false, error: utils.maskError('Telegram', error) };
    }
  },

  async publishSnapchat(content: string, imageUrl?: string): Promise<NativePublishResult> {
    try {
      const accessToken = await getCredential('snapchat_access_token');
      if (!accessToken) throw new Error('Snapchat access token not configured');

      const response = await fetch('https://adsapi.snapchat.com/v1/ads', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'story',
          content: content,
          ...(imageUrl && { media_url: imageUrl }),
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.error?.message || `Snapchat API error: ${response.statusText}`);

      return { success: true, postId: data.id };
    } catch (error) {
      return { success: false, error: utils.maskError('Snapchat', error) };
    }
  },

  async publishWordPress(content: string, title: string, status: 'publish' | 'draft' = 'publish'): Promise<NativePublishResult> {
    try {
      const apiUrl = await getCredential('wordpress_api_url');
      const username = await getCredential('wordpress_username');
      const appPassword = await getCredential('wordpress_application_password');
      
      if (!apiUrl || !username || !appPassword) throw new Error('WordPress credentials not configured');

      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const endpoint = `${baseUrl}/wp-json/wp/v2/posts`;

      const authHeader = `Basic ${utils.safeBase64Encode(`${username}:${appPassword}`)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.substring(0, 200),
          content: content,
          status: status,
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.message || `WordPress API error: ${response.statusText}`);

      return { success: true, postId: String(data.id), url: data.link };
    } catch (error) {
      return { success: false, error: utils.maskError('WordPress', error) };
    }
  },

  async publishMedium(content: string, title: string): Promise<NativePublishResult> {
    try {
      const token = await getCredential('medium_integration_token');
      const userId = await getCredential('medium_user_id');
      if (!token || !userId) throw new Error('Medium credentials not configured');

      const response = await fetch(`https://api.medium.com/v1/users/${userId}/posts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          title: title.substring(0, 200),
          contentFormat: 'html',
          content: content,
          publishStatus: 'public',
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.error?.message || `Medium API error: ${response.statusText}`);

      return { success: true, postId: data.data.id, url: data.data.url };
    } catch (error) {
      return { success: false, error: utils.maskError('Medium', error) };
    }
  },

  async publishMailchimp(content: string, title: string): Promise<NativePublishResult> {
    try {
      const apiKey = await getCredential('mailchimp_api_key');
      const listId = await getCredential('mailchimp_list_id');
      const serverPrefix = await getCredential('mailchimp_server_prefix'); // e.g. 'us19'

      if (!apiKey || !listId || !serverPrefix) throw new Error('Mailchimp credentials not configured');

      const response = await fetch(`https://${serverPrefix}.api.mailchimp.com/3.0/campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${utils.safeBase64Encode(`user:${apiKey}`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'regular',
          settings: {
            subject_line: title.substring(0, 150),
            from_name: 'NexusAI',
            reply_to: 'hello@nexusai.io',
          },
          recipients: { list_id: listId },
          content: {
            type: 'text/html',
            html: content,
          },
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.title || `Mailchimp API error: ${response.statusText}`);

      return { success: true, postId: data.id };
    } catch (error) {
      return { success: false, error: utils.maskError('Mailchimp', error) };
    }
  },

  async publishKlaviyo(content: string, title: string): Promise<NativePublishResult> {
    try {
      const apiKey = await getCredential('klaviyo_api_key');
      if (!apiKey) throw new Error('Klaviyo API key not configured');

      const response = await fetch('https://a.klaviyo.com/api/campaigns/', {
        method: 'POST',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'revision': '2024-02-15',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'campaign',
          attributes: {
            name: title.substring(0, 100),
            // Implementation note: real integration requires mapping content to templates
          },
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.errors?.[0]?.detail || `Klaviyo API error: ${response.statusText}`);

      return { success: true, postId: data.data?.id };
    } catch (error) {
      return { success: false, error: utils.maskError('Klaviyo', error) };
    }
  },

  async publishConvertKit(content: string, title: string): Promise<NativePublishResult> {
    try {
      const apiKey = await getCredential('convertkit_api_key');
      if (!apiKey) throw new Error('ConvertKit API key not configured');

      const response = await fetch('https://api.convertkit.com/v3/broadcasts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          broadcast: {
            name: title.substring(0, 100),
            subject: title.substring(0, 100),
            body: content,
          },
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.message || `ConvertKit API error: ${response.statusText}`);

      return { success: true, postId: String(data.id) };
    } catch (error) {
      return { success: false, error: utils.maskError('ConvertKit', error) };
    }
  },

  async publishGhost(content: string, title: string, status: 'published' | 'draft' = 'published'): Promise<NativePublishResult> {
    try {
      const apiUrl = await getCredential('ghost_api_url');
      const adminApiKey = await getCredential('ghost_admin_api_key');
      
      if (!apiUrl || !adminApiKey) throw new Error('Ghost credentials not configured');

      const [id, secret] = adminApiKey.split(':');
      const authHeader = `Ghost ${utils.safeBase64Encode(`${id}:${secret}`)}`;

      const response = await fetch(`${apiUrl}/ghost/api/admin/posts/`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          posts: [{
            title: title.substring(0, 200),
            html: content,
            status: status,
          }],
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.errors?.[0]?.message || `Ghost API error: ${response.statusText}`);

      return { success: true, postId: String(data.posts[0].id), url: data.posts[0].url };
    } catch (error) {
      return { success: false, error: utils.maskError('Ghost', error) };
    }
  },

  async publishSubstack(content: string, title: string): Promise<NativePublishResult> {
    try {
      const apiKey = await getCredential('substack_api_key');
      const newsletterId = await getCredential('substack_newsletter_id');
      
      if (!apiKey || !newsletterId) throw new Error('Substack credentials not configured');

      const response = await fetch('https://substackapi.com/v1/publish', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newsletter_id: newsletterId,
          title: title.substring(0, 200),
          body: content,
          is_public: true,
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.error || `Substack API error: ${response.statusText}`);

      return { success: true, postId: data.id, url: data.url };
    } catch (error) {
      return { success: false, error: utils.maskError('Substack', error) };
    }
  },

  // ==================== E-COMMERCE INTEGRATIONS ====================

  async publishShopify(content: string, title: string, productId?: string): Promise<NativePublishResult> {
    try {
      const storeUrl = await getCredential('shopify_store_url');
      const accessToken = await getCredential('shopify_access_token');
      
      if (!storeUrl || !accessToken) throw new Error('Shopify credentials not configured');

      const url = `${storeUrl.replace(/\/$/, '')}/admin/api/2024-01/graphql.json`;

      const escapedTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const escapedContent = content.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      const mutation = productId
        ? `mutation productUpdate($input: ProductInput!) { productUpdate(id: "${productId}", input: $input) { product { id title } } }`
        : `mutation productCreate($input: ProductInput!) { productCreate(input: $input) { product { id title } } }`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            input: {
              title: title,
              descriptionHtml: content,
              ...(productId ? {} : { status: 'DRAFT' }),
            },
          },
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.errors?.[0]?.message || `Shopify API error: ${response.statusText}`);

      return { success: true, postId: data.product?.id, url: data.product ? `https://${storeUrl}/products/${title.replace(/\s+/g, '-')}` : undefined };
    } catch (error) {
      return { success: false, error: utils.maskError('Shopify', error) };
    }
  },

  async publishAmazon(content: string, title: string, category?: string): Promise<NativePublishResult> {
    try {
      const apiKey = await getCredential('amazon_api_key');
      const sellerId = await getCredential('amazon_seller_id');
      
      if (!apiKey || !sellerId) throw new Error('Amazon credentials not configured');

      const escapedTitle = title.replace(/"/g, '\\"').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const escapedContent = content.replace(/"/g, '\\"').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const response = await fetch('https://sellingpartnerapi.amazon.com/listings/2021-08-01/definitions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'x-amz-seller-id': sellerId,
          'x-amz-date': new Date().toISOString(),
        },
        body: JSON.stringify({
          productType: 'PRODUCT',
          requirements: 'LISTING',
          marketplaceIds: ['ATVPDKIKX0DER'],
          attributes: {
            title: [{ value: escapedTitle, language_tag: 'en_US' }],
            description: [{ value: escapedContent, language_tag: 'en_US' }],
            ...(category ? { item_type: [{ value: category }] } : {}),
          },
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.errors?.[0]?.message || `Amazon API error: ${response.statusText}`);

      return { success: true, postId: data.sku, url: `https://www.amazon.com/dp/${data.sku || data.asin}` };
    } catch (error) {
      return { success: false, error: utils.maskError('Amazon', error) };
    }
  },

  async publishEtsy(content: string, title: string, category?: string): Promise<NativePublishResult> {
    try {
      const apiKey = await getCredential('etsy_api_key');
      const shopId = await getCredential('etsy_shop_id');
      
      if (!apiKey || !shopId) throw new Error('Etsy credentials not configured');

      const response = await fetch(`https://openapi.etsy.com/v3/shop/${shopId}/listings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title,
          description: content,
          price: 0,
          quantity: 1,
          category: category || 'all/other',
        }),
      });

      const data = await utils.safeJsonParse(response);
      if (!response.ok) throw new Error(data.error || `Etsy API error: ${response.statusText}`);

      return { success: true, postId: String(data.listing_id), url: `https://www.etsy.com/listing/${data.listing_id}` };
    } catch (error) {
      return { success: false, error: utils.maskError('Etsy', error) };
    }
  },
};
