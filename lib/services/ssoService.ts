// Server-side SSO utilities for NexusAI
// Handles SSO provider configuration and user management

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface SSOProviderConfig {
  id: string;
  type: 'saml' | 'oidc';
  name: string;
  domain: string;
  metadataUrl?: string;
  entityId?: string;
  createdAt: string;
}

export async function getServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // In development, cookie setting may fail in some contexts
          }
        },
      },
    }
  );
}

export async function getServerSession() {
  const supabase = await getServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getServerUser() {
  const supabase = await getServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function isServerSSOUser() {
  const user = await getServerUser();
  if (!user) return false;
  return user.app_metadata?.provider === 'sso' || user.identities?.some((i: any) => i.provider === 'sso');
}

export async function listSSOProviders(): Promise<SSOProviderConfig[]> {
  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase
    .from('sso_providers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error listing SSO providers:', error);
    return [];
  }

  return data || [];
}

export async function createSSOProvider(config: {
  type: 'saml' | 'oidc';
  name: string;
  domain: string;
  metadataUrl?: string;
  entityId?: string;
}): Promise<SSOProviderConfig | null> {
  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase
    .from('sso_providers')
    .insert({
      type: config.type,
      name: config.name,
      domain: config.domain,
      metadata_url: config.metadataUrl,
      entity_id: config.entityId,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating SSO provider:', error);
    return null;
  }

  return data;
}

export async function deleteSSOProvider(id: string): Promise<boolean> {
  const supabase = await getServerSupabaseClient();
  const { error } = await supabase
    .from('sso_providers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting SSO provider:', error);
    return false;
  }

  return true;
}

export async function getSSOProviderByDomain(domain: string): Promise<SSOProviderConfig | null> {
  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase
    .from('sso_providers')
    .select('*')
    .eq('domain', domain)
    .single();

  if (error) {
    return null;
  }

  return data;
}

export async function updateSSOProvider(
  id: string,
  updates: Partial<{
    name: string;
    domain: string;
    metadataUrl: string;
    entityId: string;
  }>
): Promise<SSOProviderConfig | null> {
  const supabase = await getServerSupabaseClient();
  const { data, error } = await supabase
    .from('sso_providers')
    .update({
      name: updates.name,
      domain: updates.domain,
      metadata_url: updates.metadataUrl,
      entity_id: updates.entityId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating SSO provider:', error);
    return null;
  }

  return data;
}
