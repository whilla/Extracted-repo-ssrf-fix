import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Admin Supabase client using Service Role key.
// WARNING: This bypasses ALL Row Level Security (RLS) policies.
// ONLY use for server-side operations that require admin access
// (e.g., Stripe webhook subscription management, background jobs).
// NEVER use this for user-facing requests.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseClient = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
} else {
  console.warn('[SupabaseAdmin] Service role client not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

/**
 * Returns the admin Supabase client (bypasses RLS).
 * Use only for server-side admin operations.
 */
export function getSupabaseAdminClient() {
  if (!supabaseClient) {
    throw new Error('Supabase admin client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return supabaseClient;
}
