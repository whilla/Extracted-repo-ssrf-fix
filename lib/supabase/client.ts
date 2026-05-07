'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or anon key is missing. Check your environment variables.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
export type SupabaseBrowserClient = SupabaseClient<Database>;
