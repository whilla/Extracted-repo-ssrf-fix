import { createClient } from '@supabase/supabase-js';

// The Service Role key bypasses Row Level Security (RLS).
// This MUST be kept secret and only used on the server.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseClient: ReturnType<typeof createClient> | null = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
} else {
  console.warn('[SupabaseServer] Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable.');
}

export function getSupabaseServerClient() {
  return supabaseClient;
}

export const createClient = getSupabaseServerClient;
