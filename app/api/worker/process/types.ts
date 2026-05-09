import { SupabaseClient, Session } from '@supabase/supabase-js';

export type ServerClient = SupabaseClient<Database>;

export interface Database {
  public: {
    Tables: {
      user_secrets: {
        Row: {
          user_id: string;
          key_name: string;
          value: string;
        };
        Insert: {
          user_id: string;
          key_name: string;
          value: string;
        };
        Update: {
          user_id?: string;
          key_name?: string;
          value?: string;
        };
      };
      posts_queue: {
        Row: {
          id: string;
          user_id: string;
          platforms: string[];
          text: string;
          mediaUrl: string | null;
          status: string;
          postId: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          platforms: string[];
          text: string;
          mediaUrl?: string | null;
          status?: string;
          postId?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          platforms?: string[];
          text?: string;
          mediaUrl?: string | null;
          status?: string;
          postId?: string | null;
          error?: string | null;
          updated_at?: string;
        };
      };
    };
  };
}

export interface PostJob {
  id: string;
  user_id: string;
  platforms: string[];
  text: string;
  mediaUrl: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  postId: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSecret {
  user_id: string;
  key_name: string;
  value: string;
}

export async function getAyrshareKeyForUser(supabase: ServerClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_secrets')
    .select('value')
    .eq('user_id', userId)
    .eq('key_name', 'ayrshare_key')
    .single();

  if (error || !data) return null;
  return sanitizeApiKey(data.value);
}

async function processJob(supabase: ServerClient, job: PostJob) {
  const userId = job.user_id;
  const apiKey = await getAyrshareKeyForUser(supabase, userId);

  if (!apiKey) {
    return { ok: false, error: 'Ayrshare API key not configured in database' };
  }

  const platforms = job.platforms;
  const text = job.text;
  const mediaUrl = job.mediaUrl;
  const hashtags: string[] = [];

  const postIds: Record<string, string> = {};
  const errors: Record<string, string> = {};

  for (const platform of platforms) {
    const adapted = adaptContentForPlatform(text, hashtags, platform);
    const finalText = `${adapted.text}\n\n${adapted.hashtags.join(' ')}`;

    try {
      const response = await fetch('https://api.ayrshare.com/api/post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          post: finalText,
          platform,
          mediaUrl,
        }),
      });

      const result = await response.json();

      if (result.postId) {
        postIds[platform] = result.postId;
      } else if (result.error) {
        errors[platform] = result.error;
      }
    } catch (err) {
      errors[platform] = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  const success = Object.keys(postIds).length > 0;
  return {
    ok: success,
    postIds,
    errors,
  };
}

function sanitizeApiKey(key: string): string {
  return key.trim().replace(/['"]/g, '');
}

import { adaptContentForPlatform } from '@/lib/services/platformAdapterService';