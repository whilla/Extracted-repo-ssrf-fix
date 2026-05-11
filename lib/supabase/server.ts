import { createClient } from '@supabase/supabase-js';

let supabaseServerClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseServerClient() {
  if (supabaseServerClient) return supabaseServerClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  supabaseServerClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseServerClient;
}

export const createClient = () => getSupabaseServerClient();