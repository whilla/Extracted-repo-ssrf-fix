/**
 * Backup & Restore Service
 * Provides data backup and restore functionality
 */

import { kvGet, kvSet, listFiles, deleteFile } from './puterService';
import { getSupabaseClient } from './logService';
import type { BrandKit, ContentDraft, AppSettings } from '@/lib/types';

const BACKUP_PREFIX = 'nexus_backup_';
const BACKUP_INDEX_KEY = 'nexus_backup_index';
const MAX_BACKUPS = 10;

interface BackupManifest {
  id: string;
  timestamp: string;
  version: string;
  size: number;
  checksums: Record<string, string>;
  includes: string[];
}

interface BackupData {
  brandKits: Record<string, BrandKit>;
  drafts: Record<string, ContentDraft>;
  settings: AppSettings | null;
  agents: Record<string, unknown>;
}

function generateId(): string {
  return `backup_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function computeChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createBackup(label?: string): Promise<BackupManifest> {
  const backupId = generateId();
  const timestamp = new Date().toISOString();
  const checksums: Record<string, string> = {};

  const data: BackupData = {
    brandKits: {},
    drafts: {},
    settings: null,
    agents: {},
  };

  try {
    const brandKitFiles = await listFiles('brandKit');
    for (const file of brandKitFiles.slice(0, 20)) {
      const content = await kvGet(file);
      if (content) {
        data.brandKits[file] = content as BrandKit;
        checksums[file] = await computeChecksum(content);
      }
    }
  } catch (e) {
    console.warn('[Backup] Failed to backup brand kits:', e);
  }

  try {
    const draftFiles = await listFiles('drafts');
    for (const file of draftFiles.slice(0, 50)) {
      const content = await kvGet(file);
      if (content) {
        data.drafts[file] = content as ContentDraft;
        checksums[file] = await computeChecksum(content);
      }
    }
  } catch (e) {
    console.warn('[Backup] Failed to backup drafts:', e);
  }

  try {
    const settings = await kvGet('settings');
    if (settings) {
      data.settings = settings as AppSettings;
      checksums['settings'] = await computeChecksum(settings);
    }
  } catch (e) {
    console.warn('[Backup] Failed to backup settings:', e);
  }

  const jsonData = JSON.stringify(data);
  const size = jsonData.length;

  await kvSet(`${BACKUP_PREFIX}${backupId}`, jsonData);

  const manifest: BackupManifest = {
    id: backupId,
    timestamp,
    version: '1.0.0',
    size,
    checksums,
    includes: Object.keys(checksums),
  };

  await addToBackupIndex(manifest, label);

  await pruneOldBackups();

  console.log(`[Backup] Created backup ${backupId} (${size} bytes)`);
  return manifest;
}

async function addToBackupIndex(manifest: BackupManifest, label?: string): Promise<void> {
  const indexJson = await kvGet(BACKUP_INDEX_KEY);
  let index: Array<BackupManifest & { label?: string }> = [];
  
  if (indexJson) {
    try {
      index = JSON.parse(indexJson);
    } catch (e) {
      console.warn('[Backup] Failed to parse backup index, starting fresh:', e);
      index = [];
    }
  }
  
  index.unshift({ ...manifest, label });
  
  await kvSet(BACKUP_INDEX_KEY, JSON.stringify(index.slice(0, MAX_BACKUPS)));
}

async function pruneOldBackups(): Promise<void> {
  const indexJson = await kvGet(BACKUP_INDEX_KEY);
  if (!indexJson) return;
  
  let index: BackupManifest[] = [];
  try {
    index = JSON.parse(indexJson);
  } catch (e) {
    console.warn('[Backup] Failed to parse backup index for pruning:', e);
    return;
  }
  
  if (index.length > MAX_BACKUPS) {
    const toDelete = index.slice(MAX_BACKUPS);
    for (const backup of toDelete) {
      await deleteFile(`${BACKUP_PREFIX}${backup.id}`).catch(() => {});
    }
    
    await kvSet(BACKUP_INDEX_KEY, JSON.stringify(index.slice(0, MAX_BACKUPS)));
  }
}

export async function listBackups(): Promise<Array<BackupManifest & { label?: string }>> {
  const indexJson = await kvGet(BACKUP_INDEX_KEY);
  if (!indexJson) return [];
  
  try {
    return JSON.parse(indexJson);
  } catch (e) {
    console.warn('[Backup] Failed to parse backup list:', e);
    return [];
  }
}

export async function getBackup(backupId: string): Promise<BackupData | null> {
  const data = await kvGet(`${BACKUP_PREFIX}${backupId}`);
  if (!data) return null;
  
  try {
    return JSON.parse(data);
  } catch (e) {
    console.warn('[Backup] Failed to parse backup data:', e);
    return null;
  }
}

export async function restoreBackup(backupId: string, options: { dryRun?: boolean; targetUserId?: string } = {}): Promise<{ success: boolean; restored: string[]; errors: string[] }> {
  const data = await getBackup(backupId);
  
  if (!data) {
    return { success: false, restored: [], errors: ['Backup not found'] };
  }

  const restored: string[] = [];
  const errors: string[] = [];

  if (options.dryRun) {
    console.log('[Backup] Dry run - would restore:', {
      brandKits: Object.keys(data.brandKits).length,
      drafts: Object.keys(data.drafts).length,
      hasSettings: !!data.settings,
    });
    return { success: true, restored: ['(dry run)'], errors: [] };
  }

  for (const [key, value] of Object.entries(data.brandKits)) {
    try {
      const targetKey = options.targetUserId ? key.replace(/^user_[^_]+_/, `user_${options.targetUserId}_`) : key;
      await kvSet(targetKey, JSON.stringify(value));
      restored.push(`brandKit:${key}`);
    } catch (e) {
      errors.push(`brandKit:${key} - ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  for (const [key, value] of Object.entries(data.drafts)) {
    try {
      const targetKey = options.targetUserId ? key.replace(/^user_[^_]+_/, `user_${options.targetUserId}_`) : key;
      await kvSet(targetKey, JSON.stringify(value));
      restored.push(`draft:${key}`);
    } catch (e) {
      errors.push(`draft:${key} - ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  if (data.settings) {
    try {
      await kvSet('settings', JSON.stringify(data.settings));
      restored.push('settings');
    } catch (e) {
      errors.push(`settings - ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  console.log(`[Backup] Restored backup ${backupId}: ${restored.length} items, ${errors.length} errors`);
  return { success: errors.length === 0, restored, errors };
}

export async function deleteBackup(backupId: string): Promise<boolean> {
  await deleteFile(`${BACKUP_PREFIX}${backupId}`).catch(() => {});
  
  const indexJson = await kvGet(BACKUP_INDEX_KEY);
  if (indexJson) {
    let index: BackupManifest[] = [];
    try {
      index = JSON.parse(indexJson);
    } catch (e) {
      console.warn('[Backup] Failed to parse backup index for deletion:', e);
      return false;
    }
    const filtered = index.filter(b => b.id !== backupId);
    await kvSet(BACKUP_INDEX_KEY, JSON.stringify(filtered));
  }
  
  return true;
}

export async function exportBackupToJSON(backupId: string): Promise<string | null> {
  const data = await getBackup(backupId);
  return data ? JSON.stringify(data, null, 2) : null;
}