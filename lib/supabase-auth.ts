import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export const getSupabaseClient = () => {
  return getSupabaseBrowserClient();
};

export const signInWithEmail = async (email: string, password: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
};

export const signUpWithEmail = async (email: string, password: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
};

export const signUpWithMagicLink = async (email: string) => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
};

export const signInWithGoogle = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
};

export const signInWithSSO = async (domainOrProvider: string, _provider?: 'saml' | 'oidc') => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  const { error } = await supabase.auth.signInWithSSO({
    domain: domainOrProvider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
};

export const signInWithGitHub = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
};

export const signInWithMicrosoft = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
};

export const signInWithOkta = async (oktaDomain: string) => {
  return signInWithSSO(oktaDomain, 'oidc');
};

export const signInWithKeycloak = async (keycloakUrl: string) => {
  return signInWithSSO(keycloakUrl, 'oidc');
};

export const signOut = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

export const getSession = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
};

export const isSSOUser = async () => {
  const user = await getCurrentUser();
  if (!user) return false;
  return user.app_metadata?.provider === 'sso' || user.identities?.some((i: any) => i.provider === 'sso');
};

export const getSSOProvider = async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  return user.app_metadata?.provider === 'sso' ? user.app_metadata?.sso_provider || null : null;
};
