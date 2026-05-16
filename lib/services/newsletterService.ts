import { kvGet, kvSet } from './puterService';
import { aiService } from './aiService';

export interface NewsletterConfig {
  title: string;
  content: string;
  audience: string;
  schedule?: string;
  platform?: 'mailchimp' | 'klaviyo' | 'convertkit';
}

export interface Newsletter {
  id: string;
  title: string;
  content: string;
  htmlContent: string;
  plainText: string;
  audience: string;
  schedule?: string;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  platform?: string;
  campaignId?: string;
  createdAt: string;
  sentAt?: string;
}

export interface NewsletterSendResult {
  success: boolean;
  campaignId?: string;
  status?: string;
  error?: string;
}

export interface NewsletterStats {
  newsletterId: string;
  sentCount: number;
  openRate: number;
  clickRate: number;
  unsubscribeRate: number;
  bounceRate: number;
}

export interface BrandKit {
  brandName: string;
  niche: string;
  targetAudience: string;
  tone: string;
  contentPillars: string[];
  uniqueSellingPoint: string;
  name?: string;
  userName?: string;
  agentName?: string;
  audience?: string;
  primaryColor?: string;
  secondaryColor?: string;
  avoidTopics?: string[];
  language?: string;
}

export class NewsletterService {
  static async createNewsletter(config: NewsletterConfig): Promise<Newsletter> {
    const newsletter: Newsletter = {
      id: `nl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      title: config.title,
      content: config.content,
      htmlContent: this.textToHtml(config.content),
      plainText: config.content,
      audience: config.audience,
      schedule: config.schedule,
      status: config.schedule ? 'scheduled' : 'draft',
      platform: config.platform,
      createdAt: new Date().toISOString(),
    };

    await kvSet(`newsletter:${newsletter.id}`, JSON.stringify(newsletter));

    return newsletter;
  }

  static async composeNewsletter(topic: string, brandKit: BrandKit | null, config: { tone?: string; length?: string; sections?: string[] } = {}): Promise<{ subject: string; htmlContent: string; plainText: string }> {
    const tone = config.tone || brandKit?.tone || 'professional';
    const length = config.length || 'medium';
    const sections = config.sections || ['introduction', 'main content', 'call to action'];

    const prompt = `Write a newsletter email about: ${topic}

Brand context:
- Brand: ${brandKit?.brandName || 'Our Brand'}
- Niche: ${brandKit?.niche || ''}
- Target audience: ${brandKit?.targetAudience || ''}
- Tone: ${tone}
- USP: ${brandKit?.uniqueSellingPoint || ''}

Requirements:
- Length: ${length}
- Include these sections: ${sections.join(', ')}
- Use a compelling subject line
- Write in HTML format with inline styles
- Include a clear call to action
- Make it engaging and on-brand

Return the response as JSON with this exact structure:
{
  "subject": "The subject line",
  "html": "<html>Full HTML email with inline styles</html>",
  "plainText": "Plain text version"
}

Do not include any markdown formatting or code fences. Return only valid JSON.`;

    const response = await aiService.chat(prompt);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI response did not contain valid JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      subject: parsed.subject || topic,
      htmlContent: parsed.html || this.textToHtml(parsed.plainText || response),
      plainText: parsed.plainText || response,
    };
  }

  static async sendViaMailchimp(newsletter: Newsletter, credentials: { apiKey: string; serverPrefix: string; listId: string; fromName?: string; replyTo?: string }): Promise<NewsletterSendResult> {
    try {
      const apiKey = credentials.apiKey || await kvGet('mailchimp_api_key');
      const serverPrefix = credentials.serverPrefix || await kvGet('mailchimp_server_prefix');
      const listId = credentials.listId || await kvGet('mailchimp_list_id');

      if (!apiKey || !serverPrefix || !listId) {
        return { success: false, error: 'Mailchimp credentials not configured' };
      }

      const baseUrl = `https://${serverPrefix}.api.mailchimp.com/3.0`;

      const campaignResponse = await fetch(`${baseUrl}/campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`anystring:${apiKey}`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'regular',
          settings: {
            subject_line: newsletter.title.substring(0, 150),
            from_name: credentials.fromName || newsletter.title.substring(0, 30),
            reply_to: credentials.replyTo || 'noreply@newsletter.com',
            title: newsletter.title.substring(0, 200),
          },
          recipients: { list_id: listId },
        }),
      });

      if (!campaignResponse.ok) {
        const errorData = await campaignResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Mailchimp campaign creation failed: ${campaignResponse.statusText}`);
      }

      const campaignData = await campaignResponse.json();
      const campaignId = campaignData.id;

      const contentResponse = await fetch(`${baseUrl}/campaigns/${campaignId}/content`, {
        method: 'PUT',
        headers: {
          'Authorization': `Basic ${btoa(`anystring:${apiKey}`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html: newsletter.htmlContent,
          plain_text: newsletter.plainText,
        }),
      });

      if (!contentResponse.ok) {
        const errorData = await contentResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Mailchimp content update failed: ${contentResponse.statusText}`);
      }

      const sendResponse = await fetch(`${baseUrl}/campaigns/${campaignId}/actions/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`anystring:${apiKey}`)}`,
          'Content-Type': 'application/json',
        },
      });

      if (!sendResponse.ok) {
        const errorData = await sendResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || `Mailchimp send failed: ${sendResponse.statusText}`);
      }

      newsletter.campaignId = campaignId;
      newsletter.status = 'sent';
      newsletter.platform = 'mailchimp';
      newsletter.sentAt = new Date().toISOString();
      await kvSet(`newsletter:${newsletter.id}`, JSON.stringify(newsletter));

      return { success: true, campaignId, status: 'sent' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Mailchimp error',
      };
    }
  }

  static async sendViaKlaviyo(newsletter: Newsletter, credentials: { apiKey: string; listId?: string; fromEmail?: string; fromName?: string }): Promise<NewsletterSendResult> {
    try {
      const apiKey = credentials.apiKey || await kvGet('klaviyo_api_key');
      const listId = credentials.listId || await kvGet('klaviyo_list_id');

      if (!apiKey) {
        return { success: false, error: 'Klaviyo API key not configured' };
      }

      const headers = {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'revision': '2024-02-15',
        'Content-Type': 'application/json',
      };

      const campaignPayload: Record<string, unknown> = {
        type: 'campaign',
        attributes: {
          name: newsletter.title.substring(0, 100),
          audiences: {
            inclusions: listId ? [{ type: 'list', id: listId }] : [],
          },
          send_options: { use_smart_send: false },
          tracking_options: { is_tracking_opens: true, is_tracking_clicks: true },
          campaign_type: 'email',
        },
      };

      const campaignResponse = await fetch('https://a.klaviyo.com/api/campaigns/', {
        method: 'POST',
        headers,
        body: JSON.stringify(campaignPayload),
      });

      if (!campaignResponse.ok) {
        const errorData = await campaignResponse.json().catch(() => ({}));
        throw new Error(errorData.errors?.[0]?.detail || `Klaviyo campaign creation failed: ${campaignResponse.statusText}`);
      }

      const campaignData = await campaignResponse.json();
      const campaignId = campaignData.data?.id;

      if (!campaignId) {
        throw new Error('No campaign ID returned from Klaviyo');
      }

      const contentResponse = await fetch(`https://a.klaviyo.com/api/campaigns/${campaignId}/copy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'campaign-copy',
          attributes: {
            subject_line: newsletter.title.substring(0, 150),
            preview_text: newsletter.plainText.substring(0, 100),
            from_label: credentials.fromName || newsletter.title.substring(0, 30),
            from_email: credentials.fromEmail || 'noreply@newsletter.com',
            html: newsletter.htmlContent,
            text: newsletter.plainText,
          },
        }),
      });

      if (!contentResponse.ok) {
        const errorData = await contentResponse.json().catch(() => ({}));
        throw new Error(errorData.errors?.[0]?.detail || `Klaviyo content update failed: ${contentResponse.statusText}`);
      }

      const sendResponse = await fetch(`https://a.klaviyo.com/api/campaigns/${campaignId}/actions/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });

      if (!sendResponse.ok) {
        const errorData = await sendResponse.json().catch(() => ({}));
        throw new Error(errorData.errors?.[0]?.detail || `Klaviyo send failed: ${sendResponse.statusText}`);
      }

      newsletter.campaignId = campaignId;
      newsletter.status = 'sent';
      newsletter.platform = 'klaviyo';
      newsletter.sentAt = new Date().toISOString();
      await kvSet(`newsletter:${newsletter.id}`, JSON.stringify(newsletter));

      return { success: true, campaignId, status: 'sent' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Klaviyo error',
      };
    }
  }

  static async sendViaConvertKit(newsletter: Newsletter, credentials: { apiKey: string; apiSecret?: string }): Promise<NewsletterSendResult> {
    try {
      const apiKey = credentials.apiKey || await kvGet('convertkit_api_key');

      if (!apiKey) {
        return { success: false, error: 'ConvertKit API key not configured' };
      }

      const broadcastResponse = await fetch('https://api.convertkit.com/v3/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          broadcast: {
            name: newsletter.title.substring(0, 100),
            subject: newsletter.title.substring(0, 100),
            body: newsletter.htmlContent,
            plain_text: newsletter.plainText,
          },
        }),
      });

      if (!broadcastResponse.ok) {
        const errorData = await broadcastResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `ConvertKit broadcast creation failed: ${broadcastResponse.statusText}`);
      }

      const broadcastData = await broadcastResponse.json();
      const broadcastId = broadcastData.broadcast?.id || broadcastData.id;

      if (!broadcastId) {
        throw new Error('No broadcast ID returned from ConvertKit');
      }

      const sendResponse = await fetch(`https://api.convertkit.com/v3/broadcasts/${broadcastId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });

      if (!sendResponse.ok) {
        const errorData = await sendResponse.json().catch(() => ({}));
        throw new Error(errorData.message || `ConvertKit send failed: ${sendResponse.statusText}`);
      }

      newsletter.campaignId = String(broadcastId);
      newsletter.status = 'sent';
      newsletter.platform = 'convertkit';
      newsletter.sentAt = new Date().toISOString();
      await kvSet(`newsletter:${newsletter.id}`, JSON.stringify(newsletter));

      return { success: true, campaignId: String(broadcastId), status: 'sent' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown ConvertKit error',
      };
    }
  }

  static async scheduleNewsletter(newsletter: Newsletter, platform: 'mailchimp' | 'klaviyo' | 'convertkit', sendAt: string): Promise<{ success: boolean; scheduledAt?: string; error?: string }> {
    try {
      const sendDate = new Date(sendAt);
      if (isNaN(sendDate.getTime())) {
        return { success: false, error: 'Invalid schedule date' };
      }

      newsletter.schedule = sendDate.toISOString();
      newsletter.status = 'scheduled';
      newsletter.platform = platform;
      await kvSet(`newsletter:${newsletter.id}`, JSON.stringify(newsletter));

      await kvSet(`newsletter:schedule:${newsletter.id}`, JSON.stringify({
        newsletterId: newsletter.id,
        platform,
        sendAt: sendDate.toISOString(),
        createdAt: new Date().toISOString(),
      }));

      const scheduledJobs = await kvGet<Array<{ newsletterId: string; sendAt: string }>>('newsletter:scheduled_jobs', true) || [];
      scheduledJobs.push({ newsletterId: newsletter.id, sendAt: sendDate.toISOString() });
      await kvSet('newsletter:scheduled_jobs', JSON.stringify(scheduledJobs));

      return { success: true, scheduledAt: sendDate.toISOString() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to schedule newsletter',
      };
    }
  }

  static async getNewsletterStats(newsletterId: string): Promise<NewsletterStats> {
    const newsletterData = await kvGet(`newsletter:${newsletterId}`);
    if (!newsletterData) {
      return {
        newsletterId,
        sentCount: 0,
        openRate: 0,
        clickRate: 0,
        unsubscribeRate: 0,
        bounceRate: 0,
      };
    }

    const newsletter = JSON.parse(newsletterData) as Newsletter;

    if (!newsletter.campaignId || !newsletter.platform) {
      return {
        newsletterId,
        sentCount: 0,
        openRate: 0,
        clickRate: 0,
        unsubscribeRate: 0,
        bounceRate: 0,
      };
    }

    const cachedStats = await kvGet(`newsletter:stats:${newsletterId}`, true);
    if (cachedStats) {
      return cachedStats as unknown as NewsletterStats;
    }

    let stats: NewsletterStats = {
      newsletterId,
      sentCount: 0,
      openRate: 0,
      clickRate: 0,
      unsubscribeRate: 0,
      bounceRate: 0,
    };

    try {
      if (newsletter.platform === 'mailchimp') {
        const apiKey = await kvGet('mailchimp_api_key');
        const serverPrefix = await kvGet('mailchimp_server_prefix');

        if (apiKey && serverPrefix) {
          const baseUrl = `https://${serverPrefix}.api.mailchimp.com/3.0`;
          const response = await fetch(`${baseUrl}/reports/${newsletter.campaignId}`, {
            headers: {
              'Authorization': `Basic ${btoa(`anystring:${apiKey}`)}`,
            },
          });

          if (response.ok) {
            const data = await response.json();
            stats = {
              newsletterId,
              sentCount: data.emails_sent || 0,
              openRate: data.open_rate ? data.open_rate * 100 : 0,
              clickRate: data.click_rate ? data.click_rate * 100 : 0,
              unsubscribeRate: data.unsubscribed ? (data.unsubscribed / (data.emails_sent || 1)) * 100 : 0,
              bounceRate: data.hard_bounces ? (data.hard_bounces / (data.emails_sent || 1)) * 100 : 0,
            };
          }
        }
      } else if (newsletter.platform === 'klaviyo') {
        const apiKey = await kvGet('klaviyo_api_key');

        if (apiKey) {
          const response = await fetch(`https://a.klaviyo.com/api/campaigns/${newsletter.campaignId}`, {
            headers: {
              'Authorization': `Klaviyo-API-Key ${apiKey}`,
              'revision': '2024-02-15',
            },
          });

          if (response.ok) {
            const data = await response.json();
            const attrs = data.data?.attributes?.archived_report || {};
            const sent = attrs.recipients || 0;
            stats = {
              newsletterId,
              sentCount: sent,
              openRate: attrs.open_rate || 0,
              clickRate: attrs.click_rate || 0,
              unsubscribeRate: attrs.unsubscribed ? (attrs.unsubscribed / (sent || 1)) * 100 : 0,
              bounceRate: attrs.bounce_rate || 0,
            };
          }
        }
      } else if (newsletter.platform === 'convertkit') {
        const apiKey = await kvGet('convertkit_api_key');

        if (apiKey) {
          const response = await fetch(`https://api.convertkit.com/v3/broadcasts/${newsletter.campaignId}?api_key=${apiKey}`);

          if (response.ok) {
            const data = await response.json();
            const broadcast = data.broadcast || {};
            const sent = broadcast.sent_at ? (broadcast.recipients_count || 0) : 0;
            stats = {
              newsletterId,
              sentCount: sent,
              openRate: broadcast.open_rate || 0,
              clickRate: broadcast.click_rate || 0,
              unsubscribeRate: broadcast.unsubscribed_count ? (broadcast.unsubscribed_count / (sent || 1)) * 100 : 0,
              bounceRate: 0,
            };
          }
        }
      }

      await kvSet(`newsletter:stats:${newsletterId}`, JSON.stringify(stats));
    } catch {
    }

    return stats;
  }

  static async testSend(newsletter: Newsletter, email: string, platform: 'mailchimp' | 'klaviyo' | 'convertkit'): Promise<{ success: boolean; error?: string }> {
    try {
      if (platform === 'mailchimp') {
        const apiKey = await kvGet('mailchimp_api_key');
        const serverPrefix = await kvGet('mailchimp_server_prefix');
        const listId = await kvGet('mailchimp_list_id');

        if (!apiKey || !serverPrefix || !listId) {
          return { success: false, error: 'Mailchimp credentials not configured' };
        }

        const baseUrl = `https://${serverPrefix}.api.mailchimp.com/3.0`;

        const campaignResponse = await fetch(`${baseUrl}/campaigns`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`anystring:${apiKey}`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'regular',
            settings: {
              subject_line: `[TEST] ${newsletter.title.substring(0, 140)}`,
              from_name: 'Test Sender',
              reply_to: email,
              title: `[TEST] ${newsletter.title.substring(0, 200)}`,
            },
            recipients: { list_id: listId },
          }),
        });

        if (!campaignResponse.ok) {
          const errorData = await campaignResponse.json().catch(() => ({}));
          throw new Error(errorData.detail || `Mailchimp test campaign creation failed: ${campaignResponse.statusText}`);
        }

        const campaignData = await campaignResponse.json();
        const campaignId = campaignData.id;

        await fetch(`${baseUrl}/campaigns/${campaignId}/content`, {
          method: 'PUT',
          headers: {
            'Authorization': `Basic ${btoa(`anystring:${apiKey}`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            html: newsletter.htmlContent,
            plain_text: newsletter.plainText,
          }),
        });

        const sendResponse = await fetch(`${baseUrl}/campaigns/${campaignId}/actions/test-send`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${btoa(`anystring:${apiKey}`)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            test_emails: [email],
            send_type: 'html',
          }),
        });

        if (!sendResponse.ok) {
          const errorData = await sendResponse.json().catch(() => ({}));
          throw new Error(errorData.detail || `Mailchimp test send failed: ${sendResponse.statusText}`);
        }

        return { success: true };
      } else if (platform === 'klaviyo') {
        const apiKey = await kvGet('klaviyo_api_key');

        if (!apiKey) {
          return { success: false, error: 'Klaviyo API key not configured' };
        }

        const campaignPayload = {
          type: 'campaign',
          attributes: {
            name: `[TEST] ${newsletter.title.substring(0, 90)}`,
            audiences: { inclusions: [] },
            send_options: { use_smart_send: false },
            tracking_options: { is_tracking_opens: true, is_tracking_clicks: true },
            campaign_type: 'email',
          },
        };

        const campaignResponse = await fetch('https://a.klaviyo.com/api/campaigns/', {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${apiKey}`,
            'revision': '2024-02-15',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(campaignPayload),
        });

        if (!campaignResponse.ok) {
          const errorData = await campaignResponse.json().catch(() => ({}));
          throw new Error(errorData.errors?.[0]?.detail || `Klaviyo test campaign creation failed: ${campaignResponse.statusText}`);
        }

        const campaignData = await campaignResponse.json();
        const campaignId = campaignData.data?.id;

        if (!campaignId) {
          throw new Error('No campaign ID returned from Klaviyo');
        }

        await fetch(`https://a.klaviyo.com/api/campaigns/${campaignId}/copy`, {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${apiKey}`,
            'revision': '2024-02-15',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'campaign-copy',
            attributes: {
              subject_line: `[TEST] ${newsletter.title.substring(0, 140)}`,
              preview_text: newsletter.plainText.substring(0, 100),
              from_label: 'Test Sender',
              from_email: email,
              html: newsletter.htmlContent,
              text: newsletter.plainText,
            },
          }),
        });

        const sendResponse = await fetch(`https://a.klaviyo.com/api/campaign-messages/${campaignId}/actions/test`, {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${apiKey}`,
            'revision': '2024-02-15',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: {
              type: 'campaign-message',
              attributes: {
                test_emails: [email],
              },
            },
          }),
        });

        if (!sendResponse.ok) {
          const errorData = await sendResponse.json().catch(() => ({}));
          throw new Error(errorData.errors?.[0]?.detail || `Klaviyo test send failed: ${sendResponse.statusText}`);
        }

        return { success: true };
      } else if (platform === 'convertkit') {
        const apiKey = await kvGet('convertkit_api_key');

        if (!apiKey) {
          return { success: false, error: 'ConvertKit API key not configured' };
        }

        const broadcastResponse = await fetch('https://api.convertkit.com/v3/broadcasts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            broadcast: {
              name: `[TEST] ${newsletter.title.substring(0, 90)}`,
              subject: `[TEST] ${newsletter.title.substring(0, 90)}`,
              body: newsletter.htmlContent,
              plain_text: newsletter.plainText,
              email_address: email,
            },
          }),
        });

        if (!broadcastResponse.ok) {
          const errorData = await broadcastResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `ConvertKit test broadcast creation failed: ${broadcastResponse.statusText}`);
        }

        const broadcastData = await broadcastResponse.json();
        const broadcastId = broadcastData.broadcast?.id || broadcastData.id;

        if (!broadcastId) {
          throw new Error('No broadcast ID returned from ConvertKit');
        }

        const sendResponse = await fetch(`https://api.convertkit.com/v3/broadcasts/${broadcastId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            test_mode: true,
            test_email: email,
          }),
        });

        if (!sendResponse.ok) {
          const errorData = await sendResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `ConvertKit test send failed: ${sendResponse.statusText}`);
        }

        return { success: true };
      }

      return { success: false, error: `Unsupported platform: ${platform}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Test send failed',
      };
    }
  }

  private static textToHtml(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const paragraphs = escaped.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;background-color:#f4f4f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
<tr>
<td align="center" style="padding:20px 0;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
<tr>
<td style="padding:40px 30px;">
${paragraphs}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
  }
}
