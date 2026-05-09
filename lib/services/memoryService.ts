// Memory Service - Persistent storage for brand kit, drafts, settings
import type { BrandKit, ContentDraft, ScheduledPost, AppSettings, ChatMessage } from '@/lib/types';
export type { BrandKit } from '@/lib/types';
import { readFile, writeFile, listFiles, deleteFile, PATHS, initFileSystem, kvGet, kvSet } from './puterService';
import {
  loadCloudBrandKit,
  loadCloudChatHistory,
  loadCloudDraft,
  loadCloudOnboardingComplete,
  loadCloudSettings,
  saveCloudBrandKit,
  saveCloudChatHistory,
  saveCloudDraft,
  saveCloudOnboardingComplete,
  saveCloudSettings,
  listCloudDrafts,
} from './cloudPersistenceService';
import {
  sanitizeChatMessageForStorage,
  sanitizeChatMessagesForStorage,
} from './chatStorageSanitizer.mjs';
export {
  sanitizeChatMessageForStorage,
  sanitizeChatMessagesForStorage,
} from './chatStorageSanitizer.mjs';

// Initialize memory system
export async function initMemory(): Promise<void> {
  await initFileSystem();
}

// Brand Kit
export async function saveBrandKit(brandKit: BrandKit): Promise<boolean> {
  const [localSaved, cloudSaved] = await Promise.all([
    writeFile(PATHS.brandKit, brandKit).catch((err) => {
      console.error('[memoryService] Local brand kit save failed:', err);
      return false;
    }),
    saveCloudBrandKit(brandKit).catch((err) => {
      console.error('[memoryService] Cloud brand kit save failed:', err);
      return false;
    }),
  ]);
  return localSaved || cloudSaved;
}

export async function loadBrandKit(): Promise<BrandKit | null> {
  // Check KV store first (newer API saves here)
  const kvBrand = await kvGet('brand_kit');
  if (kvBrand) {
    try {
      return typeof kvBrand === 'string' ? JSON.parse(kvBrand) : kvBrand as BrandKit;
    } catch (parseError) {
      console.warn('[loadBrandKit] Failed to parse KV brand kit:', parseError instanceof Error ? parseError.message : 'Unknown error');
    }
  }

  // Fall back to file system
  const local = await readFile<BrandKit>(PATHS.brandKit, true);
  if (local) return local;

  // Then cloud
  const cloud = await loadCloudBrandKit().catch(() => null);
  if (cloud) {
    await writeFile(PATHS.brandKit, cloud);
  }
  return cloud;
}

// Content Drafts
export async function saveDraft(draft: ContentDraft): Promise<boolean> {
  const path = `${PATHS.drafts}/${draft.id}.json`;
  const [localSaved, cloudSaved] = await Promise.all([
    writeFile(path, draft).catch(() => false),
    saveCloudDraft(draft).catch(() => false),
  ]);
  return localSaved || cloudSaved;
}

export async function loadDraft(id: string): Promise<ContentDraft | null> {
  const path = `${PATHS.drafts}/${id}.json`;
  const local = await readFile<ContentDraft>(path, true);
  if (local) return local;

  const cloud = await loadCloudDraft(id).catch(() => null);
  if (cloud) {
    await writeFile(path, cloud);
  }
  return cloud;
}

export async function deleteDraft(id: string): Promise<boolean> {
  const path = `${PATHS.drafts}/${id}.json`;
  return deleteFile(path);
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'updated' | 'created' | 'id';
  sortOrder?: 'asc' | 'desc';
}

const DEFAULT_LIST_LIMIT = 50;

export async function listDrafts(options: ListOptions = {}): Promise<ContentDraft[]> {
  const { limit = DEFAULT_LIST_LIMIT, offset = 0, sortBy = 'updated', sortOrder = 'desc' } = options;
  const cloudDrafts = await listCloudDrafts().catch(() => []);
  const files = await listFiles(PATHS.drafts);
  const draftsById = new Map<string, ContentDraft>();
  
  for (const file of files) {
    if (file.name.endsWith('.json') && !file.is_dir) {
      const draft = await readFile<ContentDraft>(`${PATHS.drafts}/${file.name}`, true);
      if (draft) {
        draftsById.set(draft.id, draft);
      }
    }
  }

  for (const draft of cloudDrafts) {
    if (!draftsById.has(draft.id)) {
      draftsById.set(draft.id, draft);
      await writeFile(`${PATHS.drafts}/${draft.id}.json`, draft);
    }
  }
  
  const allDrafts = Array.from(draftsById.values());
  const sorted = allDrafts.sort((a, b) => {
    const aVal = sortBy === 'updated' ? new Date(a.updated).getTime() : 
             sortBy === 'created' ? new Date(a.created).getTime() : a.id.localeCompare(b.id);
    const bVal = sortBy === 'updated' ? new Date(b.updated).getTime() : 
             sortBy === 'created' ? new Date(b.created).getTime() : b.id.localeCompare(a.id);
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });
  
  return sorted.slice(offset, offset + limit);
}

// Published Content
export async function savePublishedContent(draft: ContentDraft): Promise<boolean> {
  const path = `${PATHS.published}/${draft.id}.json`;
  const [localSaved, cloudSaved] = await Promise.all([
    writeFile(path, draft).catch(() => false),
    saveCloudDraft(draft).catch(() => false),
  ]);
  return localSaved || cloudSaved;
}

export async function listPublishedContent(): Promise<ContentDraft[]> {
  const cloudDrafts = await listCloudDrafts().catch(() => []);
  const files = await listFiles(PATHS.published);
  const publishedById = new Map<string, ContentDraft>();
  
  for (const file of files) {
    if (file.name.endsWith('.json') && !file.is_dir) {
      const content = await readFile<ContentDraft>(`${PATHS.published}/${file.name}`, true);
      if (content) {
        publishedById.set(content.id, content);
      }
    }
  }

  for (const draft of cloudDrafts) {
    if (draft.status !== 'published') continue;
    if (!publishedById.has(draft.id)) {
      publishedById.set(draft.id, draft);
      await writeFile(`${PATHS.published}/${draft.id}.json`, draft);
    }
  }
  
  return Array.from(publishedById.values()).sort((a, b) => 
    new Date(b.publishedAt || b.updated).getTime() - new Date(a.publishedAt || a.updated).getTime()
  );
}

// Schedule
export async function saveSchedule(posts: ScheduledPost[]): Promise<boolean> {
  return writeFile(PATHS.schedule, posts);
}

export async function loadSchedule(): Promise<ScheduledPost[]> {
  const schedule = await readFile<ScheduledPost[]>(PATHS.schedule, true);
  return schedule || [];
}

export async function addToSchedule(post: ScheduledPost): Promise<boolean> {
  const schedule = await loadSchedule();
  schedule.push(post);
  return saveSchedule(schedule);
}

export async function updateScheduledPost(id: string, updates: Partial<ScheduledPost>): Promise<boolean> {
  const schedule = await loadSchedule();
  const index = schedule.findIndex(p => p.id === id);
  
  if (index === -1) return false;
  
  schedule[index] = { ...schedule[index], ...updates };
  return saveSchedule(schedule);
}

export async function removeFromSchedule(id: string): Promise<boolean> {
  const schedule = await loadSchedule();
  const filtered = schedule.filter(p => p.id !== id);
  return saveSchedule(filtered);
}

// App Settings
const DEFAULT_SETTINGS: AppSettings = {
  defaultModel: 'gpt-4o',
  defaultPlatforms: ['twitter', 'instagram'],
  autoSaveDrafts: true,
  notificationsEnabled: true,
  theme: 'dark',
};

export async function saveSettings(settings: AppSettings): Promise<boolean> {
  const settingsPath = `${PATHS.settings}/app-settings.json`;
  const [localSaved, cloudSaved] = await Promise.all([
    writeFile(settingsPath, settings).catch(() => false),
    saveCloudSettings(settings).catch(() => false),
  ]);
  return localSaved || cloudSaved;
}

export async function loadSettings(): Promise<AppSettings> {
  const settingsPath = `${PATHS.settings}/app-settings.json`;
  const local = await readFile<AppSettings>(settingsPath, true);
  if (local) return { ...DEFAULT_SETTINGS, ...local };

  const cloud = await loadCloudSettings().catch(() => null);
  if (cloud) {
    await writeFile(settingsPath, cloud);
    return { ...DEFAULT_SETTINGS, ...cloud };
  }

  return DEFAULT_SETTINGS;
}

// Chat History
const MAX_CHAT_HISTORY = 100;

export async function saveChatMessage(message: ChatMessage): Promise<boolean> {
  const historyPath = `${PATHS.chatHistory}/messages.json`;
  const messages = sanitizeChatMessagesForStorage(await readFile<ChatMessage[]>(historyPath, true) || []);
  
  messages.push(sanitizeChatMessageForStorage(message));
  
  // Keep only last MAX_CHAT_HISTORY messages
  const trimmed = messages.slice(-MAX_CHAT_HISTORY);

  const [localSaved, cloudSaved] = await Promise.all([
    writeFile(historyPath, trimmed).catch(() => false),
    saveCloudChatHistory(trimmed).catch(() => false),
  ]);
  return localSaved || cloudSaved;
}

export async function loadChatHistory(): Promise<ChatMessage[]> {
  const historyPath = `${PATHS.chatHistory}/messages.json`;
  const local = await readFile<ChatMessage[]>(historyPath, true);
  if (local && local.length > 0) {
    const sanitized = sanitizeChatMessagesForStorage(local);
    if (JSON.stringify(sanitized) !== JSON.stringify(local)) {
      await writeFile(historyPath, sanitized);
    }
    return sanitized;
  }

  const cloud = await loadCloudChatHistory().catch(() => []);
  const sanitizedCloud = sanitizeChatMessagesForStorage(cloud);
  if (cloud.length > 0) {
    await writeFile(historyPath, sanitizedCloud);
  }
  return sanitizedCloud;
}

export async function clearChatHistory(): Promise<boolean> {
  const historyPath = `${PATHS.chatHistory}/messages.json`;
  const [localSaved, cloudSaved] = await Promise.all([
    writeFile(historyPath, []).catch(() => false),
    saveCloudChatHistory([]).catch(() => false),
  ]);
  return localSaved || cloudSaved;
}

// Onboarding state
export async function isOnboardingComplete(): Promise<boolean> {
  const complete = await kvGet('onboarding_complete');
  if (complete !== null) return complete === 'true';

  const cloud = await loadCloudOnboardingComplete().catch(() => null);
  if (cloud !== null) {
    await kvSet('onboarding_complete', cloud.toString());
    return cloud;
  }

  return false;
}

export async function setOnboardingComplete(complete: boolean): Promise<boolean> {
  const [localSaved, cloudSaved] = await Promise.all([
    kvSet('onboarding_complete', complete.toString()),
    saveCloudOnboardingComplete(complete).catch(() => false),
  ]);
  return localSaved || cloudSaved;
}

// Recent topics (for avoiding repetition)
export async function getRecentTopics(limit = 10): Promise<string[]> {
  const published = await listPublishedContent();
  const drafts = await listDrafts();
  
  const all = [...published, ...drafts]
    .sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
    .slice(0, limit);
  
  // Extract topics from content (first 50 chars as summary)
  return all
    .map(item => {
      const latestVersion = item.versions[item.versions.length - 1];
      return latestVersion?.text?.substring(0, 50) || '';
    })
    .filter(Boolean);
}

// Skills
export async function saveSkill(name: string, data: unknown): Promise<boolean> {
  const path = `${PATHS.skills}/${name}.json`;
  return writeFile(path, data);
}

export async function loadSkill<T = unknown>(name: string): Promise<T | null> {
  const path = `${PATHS.skills}/${name}.json`;
  return readFile<T>(path, true);
}

// Generate unique ID using cryptographically secure random
export function generateId(): string {
  const bytes = new Uint8Array(6);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(bytes);
  } else if (typeof global !== 'undefined' && global.crypto) {
    global.crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const randomPart = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 9);
  return `${Date.now()}-${randomPart}`;
}
