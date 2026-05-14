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
  return getSecureCredential(key);
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
  },

  /**
   * SHA-256 hex digest for AWS SigV4 signing
   */
  async sha256Hex(data: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Node.js fallback
    const { createHash } = await import('crypto');
    return createHash('sha256').update(data).digest('hex');
  },

  /**
   * HMAC-SHA256 for AWS SigV4 signing key derivation
   */
  async hmacSha256(key: Uint8Array | string, data: string): Promise<Uint8Array> {
    const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key;
    const dataBytes = new TextEncoder().encode(data);
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', cryptoKey, dataBytes);
      return new Uint8Array(sig);
    }
    const { createHmac } = await import('crypto');
    return createHmac('sha256', Buffer.from(keyBytes)).update(data).digest();
  },

  /**
   * AWS Signature V4 signing implementation
   */
  async getSignatureV4(secretKey: string, datestamp: string, region: string, service: string, stringToSign: string): Promise<string> {
    const kSecret = new TextEncoder().encode(`AWS4${secretKey}`);
    const kDate = await this.hmacSha256(kSecret, datestamp);
    const kRegion = await this.hmacSha256(kDate, region);
    const kService = await this.hmacSha256(kRegion, service);
    const kSigning = await this.hmacSha256(kService, 'aws4_request');
    const signature = await this.hmacSha256(kSigning, stringToSign);
    return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
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

      const templateId = await getCredential('klaviyo_template_id');
      const listId = await getCredential('klaviyo_list_id');

      // Step 1: Create the campaign
      const campaignPayload: Record<string, unknown> = {
        type: 'campaign',
        attributes: {
          name: title.substring(0, 100),
          audiences: {
            inclusions: listId ? [{ type: 'list', id: listId }] : [],
          },
          send_options: { use_smart_send: false },
          tracking_options: { is_tracking_opens: true, is_tracking_clicks: true },
          campaign_type: 'email',
        },
      };

      if (templateId) {
        (campaignPayload.attributes as Record<string, unknown>).template_id = templateId;
      }

      const campaignRes = await fetch('https://a.klaviyo.com/api/campaigns/', {
        method: 'POST',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'revision': '2024-02-15',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(campaignPayload),
      });

      const campaignData = await utils.safeJsonParse(campaignRes);
      if (!campaignRes.ok) throw new Error(campaignData.errors?.[0]?.detail || `Klaviyo API error: ${campaignRes.statusText}`);

      const campaignId = campaignData.data?.id;
      if (!campaignId) throw new Error('No campaign ID returned from Klaviyo');

      // Step 2: Set campaign content (HTML)
      const contentRes = await fetch(`https://a.klaviyo.com/api/campaigns/${campaignId}/copy`, {
        method: 'POST',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'revision': '2024-02-15',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'campaign-copy',
          attributes: {
            subject_line: title.substring(0, 150),
            preview_text: title.substring(0, 100),
            from_label: 'NexusAI',
            from_name: 'NexusAI',
            html: content,
          },
        }),
      });

      if (!contentRes.ok) {
        const contentErr = await utils.safeJsonParse(contentRes).catch(() => ({}));
        if (contentErr.errors?.[0]?.detail?.includes('template')) {
          // If template-based campaigns fail, fall back to creating a simple email
          const fallbackRes = await fetch(`https://a.klaviyo.com/api/campaigns/${campaignId}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Klaviyo-API-Key ${apiKey}`,
              'revision': '2024-02-15',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'campaign',
              id: campaignId,
              attributes: {
                name: title.substring(0, 100),
                template_id: null,
              },
            }),
          });
          if (!fallbackRes.ok) {
            const fallbackErr = await utils.safeJsonParse(fallbackRes).catch(() => ({}));
            throw new Error(fallbackErr.errors?.[0]?.detail || 'Klaviyo template mapping failed');
          }
        } else {
          throw new Error(contentErr.errors?.[0]?.detail || 'Klaviyo content update failed');
        }
      }

      return { success: true, postId: campaignId };
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
      // Substack has no official public API. We support two methods:
      // 1. N8N bridge (recommended) - configure substack_n8n_webhook
      // 2. Email-based publishing - configure substack_email and SMTP settings
      // 3. substackapi.com third-party API (works but is unofficial)
      const n8nWebhook = await getCredential('substack_n8n_webhook');
      const emailAddr = await getCredential('substack_email');
      const apiKey = await getCredential('substack_api_key');

      if (n8nWebhook) {
        const response = await fetch(n8nWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content, type: 'substack_publish' }),
        });
        if (!response.ok) throw new Error(`N8N webhook error: ${response.statusText}`);
        return { success: true, postId: `n8n_${Date.now()}` };
      }

      if (emailAddr) {
        const smtpHost = await getCredential('substack_smtp_host');
        const smtpUser = await getCredential('substack_smtp_user');
        const smtpPass = await getCredential('substack_smtp_pass');
        if (smtpHost && smtpUser && smtpPass) {
          const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${smtpPass}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: emailAddr }] }],
              from: { email: smtpUser },
              subject: title.substring(0, 200),
              content: [{ type: 'text/html', value: content }],
            }),
          });
          if (!response.ok) throw new Error(`Email send error: ${response.statusText}`);
          return { success: true, postId: `email_${Date.now()}` };
        }
      }

      if (apiKey) {
        const newsletterId = await getCredential('substack_newsletter_id');
        if (newsletterId) {
          const response = await fetch('https://substackapi.com/api/publish', {
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
        }
      }

      return {
        success: false,
        error: 'Substack publishing requires one of: substack_n8n_webhook (N8N webhook URL), substack_email (Substack publish email address) with SMTP credentials, or substack_api_key with substack_newsletter_id. Configure one in Settings.',
      };
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
      const accessKey = await getCredential('aws_access_key_id');
      const secretKey = await getCredential('aws_secret_access_key');
      const region = await getCredential('aws_region') || 'us-east-1';
      const sellerId = await getCredential('amazon_seller_id');
      const refreshToken = await getCredential('amazon_sp_api_refresh_token');
      const clientId = await getCredential('amazon_sp_api_client_id');
      const clientSecret = await getCredential('amazon_sp_api_client_secret');

      if (!accessKey || !secretKey) {
        return {
          success: false,
          error: 'Amazon SP-API requires AWS credentials. Configure aws_access_key_id, aws_secret_access_key, and optionally aws_region (default: us-east-1). For SP-API OAuth, also configure amazon_sp_api_refresh_token, amazon_sp_api_client_id, and amazon_sp_api_client_secret.',
        };
      }

      if (!sellerId) throw new Error('Amazon seller ID not configured (amazon_seller_id)');

      // Get access token from SP-API OAuth if refresh token is available
      let accessToken = '';
      if (refreshToken && clientId && clientSecret) {
        const tokenRes = await fetch('https://api.amazon.com/auth/o2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });
        const tokenData = await utils.safeJsonParse(tokenRes);
        if (tokenRes.ok && tokenData.access_token) {
          accessToken = tokenData.access_token;
        } else {
          throw new Error(tokenData.error_description || 'Failed to get SP-API access token');
        }
      }

      // Build the SP-API request for creating a product
      const host = `sellingpartnerapi-${region}.amazon.com`;
      const endpoint = `/definitions/2020-09-01/productTypes/${encodeURIComponent(category || 'GROCERY')}`;
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
      const datestamp = amzDate.slice(0, 8);

      const body = JSON.stringify({
        requirements: 'LISTING',
        locale: 'en_US',
        sellerId: sellerId,
        productType: category || 'GROCERY',
        marketplaceIds: ['ATVPDKIKX0DER'],
        description: title.substring(0, 200),
        content: content,
      });

      const bodyHash = await utils.sha256Hex(body);

      // Build canonical request for SigV4
      const canonicalUri = endpoint;
      const canonicalQueryString = '';
      const signedHeaders = 'host;x-amz-date';
      const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;

      const canonicalRequest = [
        'POST',
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        bodyHash,
      ].join('\n');

      const algorithm = 'AWS4-HMAC-SHA256';
      const credentialScope = `${datestamp}/${region}/execute-api/aws4_request`;
      const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        await utils.sha256Hex(canonicalRequest),
      ].join('\n');

      const signature = await utils.getSignatureV4(secretKey, datestamp, region, 'execute-api', stringToSign);
      const authorizationHeader = `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

      const response = await fetch(`https://${host}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': authorizationHeader,
          'x-amz-date': amzDate,
          'host': host,
          'Content-Type': 'application/json',
          ...(accessToken ? { 'x-amz-access-token': accessToken } : {}),
        },
        body,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Amazon SP-API error (${response.status}): ${errText.slice(0, 200)}`);
      }

      const data = await utils.safeJsonParse(response);
      return {
        success: true,
        postId: data.payload?.productId || data.productId || `amz_${Date.now()}`,
      };
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
