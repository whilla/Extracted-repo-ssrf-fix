import { kvGet } from './puterService';
import { sanitizeApiKey } from './providerCredentialUtils';
import { createConfigError, formatConfigErrorResponse } from './configError';
import { nativeProviders } from './nativeProviders';

export interface DirectPublishResult {
  success: boolean;
  postId?: string;
  error?: string;
  platformUrl?: string;
}

export type SocialPlatform = 'twitter' | 'linkedin' | 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'threads' | 'pinterest' | 'twitch' | 'discord' | 'reddit' | 'whatsapp' | 'telegram' | 'snapchat' | 'wordpress' | 'medium' | 'ghost' | 'substack' | 'mailchimp' | 'klaviyo' | 'convertkit';

/**
 * DirectPublishService provides first-party API integrations for social platforms
 * to reduce reliance on third-party aggregators like Ayrshare.
 */
export class DirectPublishService {
  /**
   * Publish to any supported platform
   */
  static async publish(platform: SocialPlatform, text: string, mediaUrls: string[] = []): Promise<DirectPublishResult> {
    switch (platform) {
      case 'twitter':
        return this.publishToTwitter(text, mediaUrls);
      case 'linkedin':
        return this.publishToLinkedIn(text, mediaUrls);
      case 'instagram':
        return this.publishToInstagram(text, mediaUrls);
      case 'facebook':
        return this.publishToFacebook(text, mediaUrls);
      case 'youtube':
        return this.publishToYouTube(text, text, mediaUrls);
      case 'tiktok':
        return this.publishToTikTok(text, mediaUrls);
      case 'threads':
        return this.publishToThreads(text, mediaUrls);
      case 'pinterest':
        return this.publishToPinterest(text, mediaUrls);
      case 'twitch':
        return this.publishToTwitch(text, mediaUrls);
      case 'discord':
        return nativeProviders.publishDiscord(text, mediaUrls[0]);
      case 'reddit':
        return nativeProviders.publishReddit(text, text.split('\n')[0].slice(0, 100));
      case 'whatsapp':
        const recipient = await kvGet('whatsapp_broadcast_list');
        return nativeProviders.publishWhatsApp(text, recipient || '');
      case 'telegram':
        const tgChatId = await kvGet('telegram_chat_id');
        return nativeProviders.publishTelegram(text, tgChatId || undefined);
      case 'snapchat':
        return nativeProviders.publishSnapchat(text, mediaUrls[0]);
      case 'wordpress':
        return this.publishToWordPress(text, text);
      case 'medium':
        return this.publishToMedium(text, text);
      case 'ghost':
        return this.publishToGhost(text, text);
      case 'substack':
        return this.publishToSubstack(text, text);
      case 'mailchimp':
        return this.publishToMailchimp(text, text);
      case 'klaviyo':
        return this.publishToKlaviyo(text, text);
      case 'convertkit':
        return this.publishToConvertKit(text, text);
      default:
        return { success: false, error: `Platform ${platform} not supported` };
    }
  }

  /**
   * Publish directly to WordPress
   */
  static async publishToWordPress(content: string, title: string): Promise<DirectPublishResult> {
    try {
      const apiUrl = await kvGet('wordpress_api_url');
      const username = await kvGet('wordpress_username');
      const appPassword = await kvGet('wordpress_application_password');
      
      if (!apiUrl || !username || !appPassword) {
        return formatConfigErrorResponse(createConfigError('wordpress'));
      }

      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const endpoint = `${baseUrl}/wp-json/wp/v2/posts`;
      const authHeader = btoa(`${username}:${appPassword}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.substring(0, 200),
          content: content,
          status: 'publish',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'WordPress API request failed');
      }

      return {
        success: true,
        postId: String(data.id),
        platformUrl: data.link,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown WordPress error',
      };
    }
  }

  /**
   * Publish directly to Medium
   */
  static async publishToMedium(content: string, title: string): Promise<DirectPublishResult> {
    try {
      const token = await kvGet('medium_integration_token');
      const userId = await kvGet('medium_user_id');
      if (!token || !userId) {
        return formatConfigErrorResponse(createConfigError('medium'));
      }

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

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Medium API request failed');
      }

      return {
        success: true,
        postId: data.data.id,
        platformUrl: data.data.url,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Medium error',
      };
    }
  }

  /**
   * Publish directly to Ghost
   */
  static async publishToGhost(content: string, title: string): Promise<DirectPublishResult> {
    try {
      const apiUrl = await kvGet('ghost_api_url');
      const contentApiKey = await kvGet('ghost_content_api_key');
      const adminApiKey = await kvGet('ghost_admin_api_key');
      if (!apiUrl || !contentApiKey || !adminApiKey) {
        return formatConfigErrorResponse(createConfigError('ghost'));
      }

      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const endpoint = `${baseUrl}/ghost/api/admin/posts/`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Ghost ${adminApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.substring(0, 200),
          html: content,
          status: 'published',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Ghost API request failed');
      }

      return {
        success: true,
        postId: data.posts[0].id,
        platformUrl: `${baseUrl}/post/${data.posts[0].id}/`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Ghost error',
      };
    }
  }

  /**
   * Publish directly to Substack via native providers (N8N bridge, email, or third-party API)
   */
  static async publishToSubstack(content: string, title: string): Promise<DirectPublishResult> {
    const response = await nativeProviders.publishSubstack(content, title);
    return {
      success: response.success,
      postId: response.postId,
      error: response.error,
      platformUrl: response.url,
    };
  }

  /**
   * Publish directly to Mailchimp
   */
  static async publishToMailchimp(content: string, title: string): Promise<DirectPublishResult> {
    try {
      const apiKey = await kvGet('mailchimp_api_key');
      const listId = await kvGet('mailchimp_list_id');
      const serverPrefix = await kvGet('mailchimp_server_prefix');
      if (!apiKey || !listId || !serverPrefix) {
        return formatConfigErrorResponse(createConfigError('mailchimp'));
      }

      const response = await nativeProviders.publishMailchimp(content, title);
      return {
        success: response.success,
        postId: response.postId,
        error: response.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Mailchimp error',
      };
    }
  }

  /**
   * Publish directly to Klaviyo
   */
  static async publishToKlaviyo(content: string, title: string): Promise<DirectPublishResult> {
    try {
      const apiKey = await kvGet('klaviyo_api_key');
      if (!apiKey) {
        return formatConfigErrorResponse(createConfigError('klaviyo'));
      }

      const response = await nativeProviders.publishKlaviyo(content, title);
      return {
        success: response.success,
        postId: response.postId,
        error: response.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Klaviyo error',
      };
    }
  }

  /**
   * Publish directly to ConvertKit
   */
  static async publishToConvertKit(content: string, title: string): Promise<DirectPublishResult> {
    try {
      const apiKey = await kvGet('convertkit_api_key');
      if (!apiKey) {
        return formatConfigErrorResponse(createConfigError('convertkit'));
      }

      const response = await nativeProviders.publishConvertKit(content, title);
      return {
        success: response.success,
        postId: response.postId,
        error: response.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown ConvertKit error',
      };
    }
  }

  /**
   * Publish directly to Twitter/X using API v2 with OAuth 1.0a signing
   * Twitter requires OAuth 1.0a User Context for write operations.
   * This implementation uses HMAC-SHA1 signing with stored credentials.
   */
  static async publishToTwitter(text: string, mediaUrls: string[] = []): Promise<DirectPublishResult> {
    const consumerKey = sanitizeApiKey(await kvGet('twitter_consumer_key'));
    const consumerSecret = await kvGet('twitter_consumer_secret');
    const accessToken = sanitizeApiKey(await kvGet('twitter_access_token'));
    const accessSecret = await kvGet('twitter_access_secret');

    if (!consumerKey || !consumerSecret || !accessToken || !accessSecret) {
      return {
        success: false,
        error: 'Twitter/X requires OAuth 1.0a credentials. Configure twitter_consumer_key, twitter_consumer_secret, twitter_access_token, and twitter_access_secret in Settings.',
      };
    }

    try {
      const url = 'https://api.twitter.com/2/tweets';
      const method = 'POST';
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const nonce = crypto.randomUUID().replace(/-/g, '');

      const params = new URLSearchParams({
        oauth_consumer_key: consumerKey,
        oauth_nonce: nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: timestamp,
        oauth_token: accessToken,
        oauth_version: '1.0',
      });

      const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(params.toString())}`;
      const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(accessSecret)}`;

      const encoder = new TextEncoder();
      const keyData = encoder.encode(signingKey);
      const baseStringData = encoder.encode(baseString);
      const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
      const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, baseStringData);
      const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

      const authHeader = `OAuth oauth_consumer_key="${encodeURIComponent(consumerKey)}", oauth_nonce="${nonce}", oauth_signature="${encodeURIComponent(signature)}", oauth_signature_method="HMAC-SHA1", oauth_timestamp="${timestamp}", oauth_token="${encodeURIComponent(accessToken)}", oauth_version="1.0"`;

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.substring(0, 280),
          ...(mediaUrls.length > 0 && { media: { media_ids: [] } }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.title || `Twitter API request failed (${response.status})`;
        return {
          success: false,
          error: errorMessage,
        };
      }

      const data = await response.json();
      const postId = data.data?.id;
      return {
        success: true,
        postId,
        platformUrl: postId ? `https://twitter.com/user/status/${postId}` : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Twitter error',
      };
    }
  }

  /**
   * Publish directly to LinkedIn
   */
  static async publishToLinkedIn(text: string, mediaUrls: string[] = []): Promise<DirectPublishResult> {
    const accessToken = sanitizeApiKey(await kvGet('linkedin_access_token'));
    if (!accessToken) {
      return { success: false, error: 'LinkedIn access token not configured. Add linkedin_access_token in Settings.' };
    }

    try {
      const personId = await kvGet('linkedin_person_id');
      const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          author: `urn:li:person:${personId}`,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text },
              shareMediaCategory: mediaUrls.length >0 ? 'IMAGE' : 'NONE',
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'LinkedIn API request failed');
      }

      const data = await response.json();
      return {
        success: true,
        postId: data.id,
        platformUrl: `https://linkedin.com/feed/update/${data.id}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown LinkedIn error',
      };
    }
  }

  /**
   * Publish directly to Instagram via Meta Graph API
   */
  static async publishToInstagram(text: string, mediaUrls: string[] = []): Promise<DirectPublishResult> {
    const accessToken = sanitizeApiKey(await kvGet('instagram_access_token'));
    if (!accessToken) {
      return { success: false, error: 'Instagram access token not configured. Add instagram_access_token in Settings.' };
    }

    try {
      const instagramAccountId = await kvGet('instagram_business_account_id');
      if (!instagramAccountId) {
        return { success: false, error: 'Instagram business account not linked. Connect via Meta Developer Portal.' };
      }

      // First, create media container
      const containerResponse = await fetch(`https://graph.facebook.com/v18.0/${instagramAccountId}/media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: accessToken,
          caption: text.substring(0, 2200),
          ...(mediaUrls.length > 0 && { image_url: mediaUrls[0] }),
        }),
      });

      if (!containerResponse.ok) {
        const errorData = await containerResponse.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Instagram media creation failed');
      }

      const containerData = await containerResponse.json();
      const containerId = containerData.id;

      // Then, publish the container
      const publishResponse = await fetch(`https://graph.facebook.com/v18.0/${instagramAccountId}/media_publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: accessToken,
          creation_id: containerId,
        }),
      });

      if (!publishResponse.ok) {
        const errorData = await publishResponse.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Instagram publish failed');
      }

      const publishData = await publishResponse.json();
      return {
        success: true,
        postId: publishData.id,
        platformUrl: `https://instagram.com/p/${publishData.id}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Instagram error',
      };
    }
  }

  /**
   * Publish directly to Facebook via Meta Graph API
   */
  static async publishToFacebook(text: string, mediaUrls: string[] = []): Promise<DirectPublishResult> {
    const accessToken = sanitizeApiKey(await kvGet('facebook_access_token'));
    if (!accessToken) {
      return { success: false, error: 'Facebook access token not configured. Add facebook_access_token in Settings.' };
    }

    try {
      const pageId = await kvGet('facebook_page_id');
      if (!pageId) {
        return { success: false, error: 'Facebook page not configured. Add facebook_page_id in Settings.' };
      }

      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: accessToken,
          message: text.substring(0, 63206),
          ...(mediaUrls.length > 0 && { link: mediaUrls[0] }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Facebook API request failed');
      }

      const data = await response.json();
      return {
        success: true,
        postId: data.id,
        platformUrl: `https://facebook.com/${data.id}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Facebook error',
      };
    }
  }

  /**
   * Publish directly to YouTube via YouTube Data API v3
   * Supports both OAuth 2.0 access tokens (for real uploads) and API key fallback
   * for metadata-only operations.
   *
   * For actual video uploads, YouTube requires the resumable upload protocol:
   * 1. Initiate upload to get upload URL
   * 2. Upload video bytes in chunks
   *
   * This implementation handles the metadata creation step. For full video uploads,
   * use the N8N bridge or configure OAuth 2.0 with youtube.upload scope.
   */
  static async publishToYouTube(title: string, description: string, mediaUrls: string[] = []): Promise<DirectPublishResult> {
    const oauthToken = await kvGet('youtube_oauth_token');
    const apiKey = sanitizeApiKey(await kvGet('youtube_api_key'));

    if (!oauthToken && !apiKey) {
      return { success: false, error: 'YouTube not configured. Add youtube_oauth_token (for uploads) or youtube_api_key in Settings.' };
    }

    try {
      if (oauthToken) {
        return this.publishToYouTubeWithOAuth(title, description, mediaUrls, oauthToken);
      }

      return {
        success: false,
        error: 'YouTube video uploads require OAuth 2.0 with the youtube.upload scope. Configure youtube_oauth_token in Settings, or use the N8N bridge for automated uploads. An API key alone can only read data, not upload videos.',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown YouTube error',
      };
    }
  }

  /**
   * Publish to YouTube using OAuth 2.0 access token with resumable upload protocol
   */
  private static async publishToYouTubeWithOAuth(
    title: string,
    description: string,
    mediaUrls: string[],
    oauthToken: string,
  ): Promise<DirectPublishResult> {
    if (mediaUrls.length === 0) {
      return {
        success: false,
        error: 'YouTube upload requires a video file URL. Provide a mediaUrl pointing to the video file.',
      };
    }

    const videoUrl = mediaUrls[0];

    const metadata = {
      snippet: {
        title: title.substring(0, 100),
        description: description.substring(0, 5000),
        tags: [],
        categoryId: '22',
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
      },
    };

    const initResponse = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${oauthToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!initResponse.ok) {
      const errorData = await initResponse.json().catch(() => ({}));
      if (initResponse.status === 401 || initResponse.status === 403) {
        return {
          success: false,
          error: 'YouTube OAuth token expired or lacks youtube.upload scope. Re-authenticate via Google Cloud Console.',
        };
      }
      throw new Error(errorData.error?.message || `YouTube init failed (${initResponse.status})`);
    }

    const uploadUrl = initResponse.headers.get('location');
    if (!uploadUrl) {
      throw new Error('YouTube did not return an upload URL');
    }

    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to fetch video from ${videoUrl}`);
    }

    const videoBlob = await videoResponse.blob();
    const videoBytes = await videoBlob.arrayBuffer();

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(videoBytes.byteLength),
        'Content-Type': 'video/*',
      },
      body: videoBytes,
    });

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `YouTube upload failed (${uploadResponse.status})`);
    }

    const data = await uploadResponse.json();
    const videoId = data.id;
    return {
      success: true,
      postId: videoId,
      platformUrl: videoId ? `https://youtube.com/watch?v=${videoId}` : undefined,
    };
  }

  /**
   * Publish directly to TikTok via TikTok Display API
   */
  static async publishToTikTok(text: string, mediaUrls: string[] = []): Promise<DirectPublishResult> {
    const accessToken = sanitizeApiKey(await kvGet('tiktok_access_token'));
    if (!accessToken) {
      return { success: false, error: 'TikTok access token not configured. Add tiktok_access_token in Settings.' };
    }

    try {
      // TikTok Content Posting API requires a two-step process:
      // 1. POST /v2/video/upload/ to get a publish ID
      // 2. POST /v2/video/publish/ to complete the publish
      // The old code used /v2/video/list/ (read-only endpoint) - wrong for uploading
      //
      // Proper upload flow:
      //   POST https://open.tiktokapis.com/v2/video/upload/
      //   Authorization: Bearer {access_token}
      //   Body: source_info->source_type (FILE_PATH or PULL_FROM_URL), video_size, etc.
      //
      // For text-only posts (no video), TikTok doesn't support them via API.
      // Use TikTok Photos API instead.
      if (mediaUrls.length === 0) {
        return {
          success: false,
          error: 'TikTok posting requires at least one video or image URL. Text-only posts are not supported via the TikTok API.',
        };
      }

      const response = await fetch('https://open.tiktokapis.com/v2/video/upload/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_info: {
            source_type: 'PULL_FROM_URL',
            video_url: mediaUrls[0],
          },
          post_info: {
            title: text.substring(0, 2200),
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
        }),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: 'TikTok requires OAuth 2.0 with the video.publish scope. Configure OAuth 2.0 via TikTok Developer Portal or use the N8N bridge.',
        };
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'TikTok API request failed');
      }

      const data = await response.json();
      const uploadId = data.data?.upload_id || data.data?.publish_id;
      return {
        success: !!uploadId,
        postId: uploadId,
        error: uploadId ? undefined : 'TikTok upload did not return an upload ID',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown TikTok error',
      };
    }
  }

  /**
   * Publish to Threads (Meta's text-based platform)
   */
  static async publishToThreads(text: string, mediaUrls: string[] = []): Promise<DirectPublishResult> {
    const accessToken = sanitizeApiKey(await kvGet('threads_access_token'));
    if (!accessToken) {
      return { success: false, error: 'Threads access token not configured. Add threads_access_token in Settings.' };
    }

    try {
      const userId = await kvGet('threads_user_id');
      const response = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text.substring(0, 500),
          ...(mediaUrls.length > 0 && { image_url: mediaUrls[0] }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Threads API request failed');
      }

      const data = await response.json();
      return {
        success: true,
        postId: data.id,
        platformUrl: `https://threads.net/@user/thread/${data.id}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Threads error',
      };
    }
  }

  /**
   * Publish to Pinterest
   */
  static async publishToPinterest(text: string, mediaUrls: string[] = []): Promise<DirectPublishResult> {
    const accessToken = sanitizeApiKey(await kvGet('pinterest_access_token'));
    if (!accessToken) {
      return { success: false, error: 'Pinterest access token not configured. Add pinterest_access_token in Settings.' };
    }

    try {
      const boardId = await kvGet('pinterest_board_id');
      const response = await fetch('https://api.pinterest.com/v5/pins', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          board_id: boardId,
          note: text.substring(0, 500),
          link: mediaUrls[0] || '',
          ...(mediaUrls.length > 1 && { image_url: mediaUrls[1] }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Pinterest API request failed');
      }

      const data = await response.json();
      return {
        success: true,
        postId: data.id,
        platformUrl: data.url,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Pinterest error',
      };
    }
  }

  /**
   * Publish to Twitch (for live streaming announcements, clips, and schedule updates)
   */
  static async publishToTwitch(text: string, mediaUrls: string[] = []): Promise<DirectPublishResult> {
    const accessToken = sanitizeApiKey(await kvGet('twitch_access_token'));
    if (!accessToken) {
      return { success: false, error: 'Twitch access token not configured. Add twitch_access_token in Settings.' };
    }

    try {
      const clientId = await kvGet('twitch_client_id');
      const channelId = await kvGet('twitch_channel_id');
      if (!channelId || !clientId) {
        return {
          success: false,
          error: 'Twitch requires both twitch_client_id and twitch_channel_id to be configured.',
        };
      }

      // Determine publish type based on content
      const isClip = mediaUrls.length > 0 && mediaUrls[0].includes('clip');
      const isSchedule = text.toLowerCase().includes('schedule') || text.toLowerCase().includes('going live');

      if (isClip) {
        // Upload clip via Twitch API
        const clipUrl = mediaUrls[0];
        const response = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${channelId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': clientId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            url: clipUrl,
            title: text.substring(0, 100),
          }),
        });

        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: 'Twitch requires OAuth with clips:edit scope. Configure via Twitch Developer Portal.',
          };
        }

        if (!response.ok) {
          throw new Error(`Twitch clip upload error: ${response.statusText}`);
        }

        const data = await response.json();
        return {
          success: true,
          postId: data.id || `twitch_clip_${Date.now()}`,
          platformUrl: `https://twitch.tv/${channelId}/clip/${data.id || ''}`,
        };
      }

      if (isSchedule) {
        // Create scheduled stream
        const scheduledTime = this.extractScheduledTime(text);
        if (!scheduledTime) {
          return {
            success: false,
            error: 'Could not extract scheduled time from message. Include a date/time like "2024-01-15T20:00:00Z".',
          };
        }

        const response = await fetch(`https://api.twitch.tv/helix/schedule/broadcasts?broadcaster_id=${channelId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Client-Id': clientId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            start_time: scheduledTime,
            title: text.substring(0, 140),
            is_recurring: false,
            category_id: '',
          }),
        });

        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: 'Twitch requires OAuth with channel:manage:schedule scope. Configure via Twitch Developer Portal.',
          };
        }

        if (!response.ok) {
          throw new Error(`Twitch schedule error: ${response.statusText}`);
        }

        return {
          success: true,
          postId: `twitch_schedule_${Date.now()}`,
          platformUrl: `https://twitch.tv/${channelId}/schedule`,
        };
      }

      // Default: channel announcement
      const response = await fetch(`https://api.twitch.tv/helix/chat/announcements?broadcaster_id=${channelId}&moderator_id=${channelId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Client-Id': clientId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text.substring(0, 500) }),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: 'Twitch requires OAuth with moderator:manage:announcements scope. Configure via Twitch Developer Portal or use the N8N bridge.',
        };
      }

      if (!response.ok) {
        throw new Error(`Twitch API error: ${response.statusText}`);
      }

      return {
        success: true,
        postId: `twitch_announcement_${Date.now()}`,
        platformUrl: `https://twitch.tv/${channelId}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Twitch error',
      };
    }
  }

  /**
   * Extract scheduled time from text
   */
  private static extractScheduledTime(text: string): string | null {
    // ISO 8601 pattern
    const isoMatch = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/);
    if (isoMatch) return isoMatch[0];

    // Simple date patterns like "Jan 15, 2024 at 8:00 PM"
    const dateMatch = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}(?:\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM))?/i);
    if (dateMatch) {
      try {
        return new Date(dateMatch[0]).toISOString();
      } catch {
        return null;
      }
    }

    return null;
  }
}
