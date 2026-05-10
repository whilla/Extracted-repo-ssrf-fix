import { providerCredentialUtils } from './providerCredentialUtils';

export interface NativePublishResult {
  success: boolean;
  postId?: string;
  error?: string;
  url?: string;
}

/**
 * NativeProviders handles the direct API interactions for platforms 
 * that aren't routed through Ayrshare.
 */
export const nativeProviders = {
  /**
   * Publishes to Discord via Webhook.
   */
  async publishDiscord(content: string, imageUrl?: string): Promise<NativePublishResult> {
    try {
      const webhookUrl = await providerCredentialUtils.getCredential('discord_webhook_url');
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
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Publishes to Reddit via Official API.
   */
  async publishReddit(content: string, title: string, subreddit: string = 'marketing'): Promise<NativePublishResult> {
    try {
      const token = await providerCredentialUtils.getCredential('reddit_access_token');
      const clientId = await providerCredentialUtils.getCredential('reddit_client_id');
      
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

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Reddit API error: ${response.statusText}`);

      return { success: true, postId: data.name };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Publishes to WhatsApp via Meta Graph API.
   */
  async publishWhatsApp(content: string, recipient: string): Promise<NativePublishResult> {
    try {
      const token = await providerCredentialUtils.getCredential('whatsapp_token');
      const phoneId = await providerCredentialUtils.getCredential('whatsapp_phone_id');

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

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `WhatsApp API error: ${response.statusText}`);

      return { success: true, postId: data.messages[0].id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};
