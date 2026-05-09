import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create client only if configured, otherwise export null
let supabase: ReturnType<typeof createClient<Database>> | null = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('[SupabaseClient] Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
}

function getSupabaseClient() {
  if (!supabase) {
    throw new Error('Supabase client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  return supabase;
}

export { getSupabaseClient };

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      drafts: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          name: string;
          versions: any[];
          current_version: number;
          status: string;
          platforms: any[];
          content_type: string | null;
          scheduled_at: string | null;
          published_at: string | null;
          publish_results: any | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          name: string;
          versions?: any[];
          current_version?: number;
          status?: string;
          platforms?: any[];
          content_type?: string | null;
          scheduled_at?: string | null;
          published_at?: string | null;
          publish_results?: any | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          name?: string;
          versions?: any[];
          current_version?: number;
          status?: string;
          platforms?: any[];
          content_type?: string | null;
          scheduled_at?: string | null;
          published_at?: string | null;
          publish_results?: any | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      brand_kits: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          name: string;
          data: any;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          name: string;
          data?: any;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          name?: string;
          data?: any;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_threads: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          data: any[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          data?: any[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          user_id?: string;
          data?: any[];
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
