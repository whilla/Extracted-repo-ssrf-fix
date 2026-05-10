'use client';

import { kvGet } from './puterService';
import { sanitizeApiKey } from './providerCredentialUtils';

export interface SocialComment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
  platform: string;
}

export interface ReaderResult {
  success: boolean;
  comments: SocialComment[];
  error?: string;
}

/**
 * DirectReaderService provides first-party API integrations to read 
 * engagement data (comments, replies) from social platforms.
 */
export class DirectReaderService {
  /**
   * Fetch comments for any supported platform
   */
  static async readComments(platform: string, postId: string): Promise<ReaderResult> {
    switch (platform) {
      case 'twitter':
      case 'x':
        return this.readTwitterComments(postId);
      case 'youtube':
        return this.readYouTubeComments(postId);
      case 'linkedin':
        return this.readLinkedInComments(postId);
      case 'facebook':
        return this.readFacebookComments(postId);
      default:
        return { success: false, comments: [], error: `Reader not implemented for platform: ${platform}` };
    }
  }

  /**
   * Read replies from X (Twitter) using API v2
   */
  static async readTwitterComments(postId: string): Promise<ReaderResult> {
    const apiKey = sanitizeApiKey(await kvGet('twitter_api_key'));
    if (!apiKey) {
      return { success: false, comments: [], error: 'Twitter API key not configured.' };
    }

    try {
      // In X API v2, we fetch tweets that mention the original post ID as a reply
      const response = await fetch(`https://api.twitter.com/2/tweets/search/recent?query=conversation_id:${postId}&expansions=author_id&user.fields=username`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || 'Twitter read failed');
      }

      const data = await response.json();
      const comments = (data.data || []).map((tweet: any) => ({
        id: tweet.id,
        author: 'Twitter User', // Simplified for this implementation
        text: tweet.text,
        timestamp: tweet.created_at,
        platform: 'twitter',
      }));

      return { success: true, comments };
    } catch (error) {
      return { success: false, comments: [], error: error instanceof Error ? error.message : 'Unknown Twitter error' };
    }
  }

  /**
   * Read comments from YouTube via Data API v3
   */
  static async readYouTubeComments(postId: string): Promise<ReaderResult> {
    const apiKey = sanitizeApiKey(await kvGet('youtube_api_key'));
    if (!apiKey) {
      return { success: false, comments: [], error: 'YouTube API key not configured.' };
    }

    try {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${postId}&maxResults=100&key=${apiKey}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || 'YouTube read failed');
      }

      const data = await response.json();
      const comments = (data.items || []).map((item: any) => ({
        id: item.id,
        author: item.snippet.topLevelComment.snippet.authorDisplayName,
        text: item.snippet.topLevelComment.snippet.textDisplay,
        timestamp: item.snippet.topLevelComment.snippet.publishedAt,
        platform: 'youtube',
      }));

      return { success: true, comments };
    } catch (error) {
      return { success: false, comments: [], error: error instanceof Error ? error.message : 'Unknown YouTube error' };
    }
  }

  /**
   * Read comments from LinkedIn via UGC API
   */
  static async readLinkedInComments(postId: string): Promise<ReaderResult> {
    const accessToken = sanitizeApiKey(await kvGet('linkedin_access_token'));
    if (!accessToken) {
      return { success: false, comments: [], error: 'LinkedIn access token not configured.' };
    }

    try {
      const response = await fetch(`https://api.linkedin.com/v2/socials/${postId}/comments`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'LinkedIn read failed');
      }

      const data = await response.json();
      const comments = (data.elements || []).map((comment: any) => ({
        id: comment.id,
        author: 'LinkedIn User',
        text: comment.message.text,
        timestamp: comment.createdAt,
        platform: 'linkedin',
      }));

      return { success: true, comments };
    } catch (error) {
      return { success: false, comments: [], error: error instanceof Error ? error.message : 'Unknown LinkedIn error' };
    }
  }

  /**
   * Read comments from Facebook via Graph API
   */
  static async readFacebookComments(postId: string): Promise<ReaderResult> {
    const accessToken = sanitizeApiKey(await kvGet('facebook_access_token'));
    if (!accessToken) {
      return { success: false, comments: [], error: 'Facebook access token not configured.' };
    }

    try {
      const response = await fetch(`https://graph.facebook.com/v18.0/${postId}/comments?access_token=${accessToken}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Facebook read failed');
      }

      const data = await response.json();
      const comments = (data.data || []).map((comment: any) => ({
        id: comment.id,
        author: comment.from?.name || 'Facebook User',
        text: comment.message,
        timestamp: comment.created_time,
        platform: 'facebook',
      }));

      return { success: true, comments };
    } catch (error) {
      return { success: false, comments: [], error: error instanceof Error ? error.message : 'Unknown Facebook error' };
    }
  }
}
