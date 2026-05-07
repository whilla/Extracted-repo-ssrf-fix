'use client';

import type { AppSettings, BrandKit, ChatMessage, ContentDraft, DraftVersion, Platform } from '@/lib/types';
import { getUser, kvGet, kvSet } from './puterService';
import { supabase } from '@/lib/supabase/client';

const DEFAULT_WORKSPACE_NAME = 'Personal Workspace';

interface WorkspaceRecord {
  id: string;
  user_id: string;
  name: string;
}

interface JsonRow<T> {
  id: string;
  user_id: string;
  workspace_id?: string;
  data?: T;
  updated_at?: string;
}

interface DraftRow {
  id: string;
  created_at: string;
  updated_at: string;
  versions: DraftVersion[] | null;
  current_version: number | null;
  status: ContentDraft['status'];
  platforms: Platform[] | null;
  content_type: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  publish_results: ContentDraft['publishResults'] | null;
}

export function isCloudPersistenceEnabled(): boolean {
  return Boolean(supabase);
}

async function getPersistenceUserId(): Promise<string> {
  const user = await getUser();
  if (user?.username) return user.username;

  const existing = await kvGet('local_user_id');
  if (existing) return existing;

  const generated = `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await kvSet('local_user_id', generated);
  return generated;
}

async function ensureWorkspace(): Promise<WorkspaceRecord | null> {
  if (!supabase) return null;

  const userId = await getPersistenceUserId();

  const { data: existing, error: existingError } = await supabase
    .from('workspaces')
    .select('id,user_id,name')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return existing as WorkspaceRecord;
  }

  const { data: created, error: createError } = await supabase
    .from('workspaces')
    .upsert({
      user_id: userId,
      name: DEFAULT_WORKSPACE_NAME,
    }, {
      onConflict: 'user_id',
    })
    .select('id,user_id,name')
    .single();

  if (createError) {
    throw createError;
  }

  return created as WorkspaceRecord;
}

export async function saveCloudBrandKit(brandKit: BrandKit): Promise<boolean> {
  if (!supabase) return false;

  const userId = await getPersistenceUserId();
  const workspace = await ensureWorkspace();
  if (!workspace) return false;

  const { error } = await supabase
    .from('brand_kits')
    .upsert({
      user_id: userId,
      workspace_id: workspace.id,
      name: brandKit.brandName || 'Brand Kit',
      data: brandKit,
    }, {
      onConflict: 'user_id',
    });

  if (error) throw error;
  return true;
}

export async function loadCloudBrandKit(): Promise<BrandKit | null> {
  if (!supabase) return null;

  const userId = await getPersistenceUserId();
  const { data, error } = await supabase
    .from('brand_kits')
    .select('id,data,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as JsonRow<BrandKit> | null)?.data || null;
}

export async function saveCloudDraft(draft: ContentDraft): Promise<boolean> {
  if (!supabase) return false;

  const userId = await getPersistenceUserId();
  const workspace = await ensureWorkspace();
  if (!workspace) return false;

  const { error } = await supabase
    .from('drafts')
    .upsert({
      id: draft.id,
      user_id: userId,
      workspace_id: workspace.id,
      name: draft.versions[draft.versions.length - 1]?.text?.slice(0, 80) || 'Draft',
      versions: draft.versions,
      current_version: draft.currentVersion,
      status: draft.status,
      platforms: draft.platforms,
      content_type: draft.contentType || null,
      scheduled_at: draft.scheduledAt || null,
      published_at: draft.publishedAt || null,
      publish_results: draft.publishResults || null,
      created_at: draft.created,
      updated_at: draft.updated,
    }, {
      onConflict: 'id',
    });

  if (error) throw error;
  return true;
}

export async function loadCloudDraft(id: string): Promise<ContentDraft | null> {
  if (!supabase) return null;

  const userId = await getPersistenceUserId();
  const { data, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    created: data.created_at,
    updated: data.updated_at,
    versions: data.versions || [],
    currentVersion: data.current_version || 1,
    status: data.status,
    platforms: data.platforms || [],
    contentType: data.content_type || undefined,
    scheduledAt: data.scheduled_at || undefined,
    publishedAt: data.published_at || undefined,
    publishResults: data.publish_results || undefined,
  };
}

export async function listCloudDrafts(): Promise<ContentDraft[]> {
  if (!supabase) return [];

  const userId = await getPersistenceUserId();
  const { data, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const rows = (data || []) as DraftRow[];

  return rows.map((row) => ({
    id: row.id,
    created: row.created_at,
    updated: row.updated_at,
    versions: row.versions || [],
    currentVersion: row.current_version || 1,
    status: row.status,
    platforms: row.platforms || [],
    contentType: row.content_type || undefined,
    scheduledAt: row.scheduled_at || undefined,
    publishedAt: row.published_at || undefined,
    publishResults: row.publish_results || undefined,
  }));
}

export async function saveCloudSettings(settings: AppSettings): Promise<boolean> {
  if (!supabase) return false;

  const userId = await getPersistenceUserId();
  const workspace = await ensureWorkspace();
  if (!workspace) return false;

  const { error } = await supabase
    .from('app_settings')
    .upsert({
      user_id: userId,
      workspace_id: workspace.id,
      data: settings,
    }, {
      onConflict: 'user_id',
    });

  if (error) throw error;
  return true;
}

export async function loadCloudSettings(): Promise<AppSettings | null> {
  if (!supabase) return null;

  const userId = await getPersistenceUserId();
  const { data, error } = await supabase
    .from('app_settings')
    .select('id,data,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as JsonRow<AppSettings> | null)?.data || null;
}

export async function saveCloudChatHistory(messages: ChatMessage[]): Promise<boolean> {
  if (!supabase) return false;

  const userId = await getPersistenceUserId();
  const workspace = await ensureWorkspace();
  if (!workspace) return false;

  const { error } = await supabase
    .from('chat_threads')
    .upsert({
      user_id: userId,
      workspace_id: workspace.id,
      data: messages,
    }, {
      onConflict: 'user_id',
    });

  if (error) throw error;
  return true;
}

export async function loadCloudChatHistory(): Promise<ChatMessage[]> {
  if (!supabase) return [];

  const userId = await getPersistenceUserId();
  const { data, error } = await supabase
    .from('chat_threads')
    .select('id,data,updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as JsonRow<ChatMessage[]> | null)?.data || [];
}

export async function saveCloudOnboardingComplete(complete: boolean): Promise<boolean> {
  if (!supabase) return false;

  const userId = await getPersistenceUserId();
  const workspace = await ensureWorkspace();
  if (!workspace) return false;

  const { error } = await supabase
    .from('user_state')
    .upsert({
      user_id: userId,
      workspace_id: workspace.id,
      onboarding_complete: complete,
    }, {
      onConflict: 'user_id',
    });

  if (error) throw error;
  return true;
}

export async function loadCloudOnboardingComplete(): Promise<boolean | null> {
  if (!supabase) return null;

  const userId = await getPersistenceUserId();
  const { data, error } = await supabase
    .from('user_state')
    .select('onboarding_complete')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return Boolean((data as { onboarding_complete?: boolean }).onboarding_complete);
}
