

import { saveDraft, loadDraft, deleteDraft } from './memoryService';
import type { ContentDraft, DraftVersion, Platform } from '../types';

const DRAFTS_PATH = '/NexusAI/content/drafts';

class DraftsService {
  // Generate a unique draft ID
  private generateId(): string {
    return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  // Create a new draft
  async createDraft(params: {
    text: string;
    imageUrl?: string;
    platforms: Platform[];
    contentType?: string;
    score?: number;
  }): Promise<ContentDraft> {
    const id = this.generateId();
    const now = new Date().toISOString();

    const version: DraftVersion = {
      v: 1,
      text: params.text,
      imageUrl: params.imageUrl,
      score: params.score || 0,
      createdAt: now,
    };

    const draft: ContentDraft = {
      id,
      created: now,
      updated: now,
      versions: [version],
      currentVersion: 1,
      status: 'draft',
      platforms: params.platforms,
      contentType: params.contentType as ContentDraft['contentType'],
      title: version.text.slice(0, 80),
      content: version.text,
    };

    // Save to memory
    await saveDraft(draft);

    return draft;
  }

  // Get a draft by ID
  async getDraft(id: string): Promise<ContentDraft | null> {
    try {
      return await loadDraft(id);
    } catch {
      return null;
    }
  }

  // Get all drafts
  async getAllDrafts(): Promise<ContentDraft[]> {
    try {
      const puter = (window as Window & { puter?: { fs?: { readdir: (path: string) => Promise<{ name: string; is_dir: boolean }[]> } } }).puter;
      if (!puter?.fs) return [];

      const files = await puter.fs.readdir(DRAFTS_PATH);
      const drafts: ContentDraft[] = [];

      for (const file of files) {
        if (!file.is_dir && file.name.endsWith('.json')) {
          const id = file.name.replace('.json', '');
          const draft = await this.getDraft(id);
          if (draft) {
            drafts.push(draft);
          }
        }
      }

      // Sort by updated date, newest first
      return drafts.sort((a, b) => 
        new Date(b.updated).getTime() - new Date(a.updated).getTime()
      );
    } catch {
      return [];
    }
  }

  // Get drafts by status
  async getDraftsByStatus(status: ContentDraft['status']): Promise<ContentDraft[]> {
    const drafts = await this.getAllDrafts();
    return drafts.filter(d => d.status === status);
  }

  // Add a new version to a draft
  async addVersion(
    draftId: string,
    params: {
      text: string;
      imageUrl?: string;
      score?: number;
    }
  ): Promise<ContentDraft | null> {
    const draft = await this.getDraft(draftId);
    if (!draft) return null;

    const newVersion: DraftVersion = {
      v: draft.versions.length + 1,
      text: params.text,
      imageUrl: params.imageUrl,
      score: params.score || 0,
      createdAt: new Date().toISOString(),
    };

    draft.versions.push(newVersion);
    draft.currentVersion = newVersion.v;
    draft.updated = new Date().toISOString();

    await saveDraft(draft);

    return draft;
  }

  // Switch to a different version
  async switchVersion(draftId: string, version: number): Promise<ContentDraft | null> {
    const draft = await this.getDraft(draftId);
    if (!draft) return null;

    const versionExists = draft.versions.some(v => v.v === version);
    if (!versionExists) return null;

    draft.currentVersion = version;
    draft.updated = new Date().toISOString();

    await saveDraft(draft);

    return draft;
  }

  // Get the current version of a draft
  getCurrentVersion(draft: ContentDraft): DraftVersion | undefined {
    return draft.versions.find(v => v.v === draft.currentVersion);
  }

  // Update draft status
  async updateStatus(
    draftId: string,
    status: ContentDraft['status'],
    scheduledAt?: string
  ): Promise<ContentDraft | null> {
    const draft = await this.getDraft(draftId);
    if (!draft) return null;

    draft.status = status;
    draft.scheduledAt = scheduledAt;
    draft.updated = new Date().toISOString();

    await saveDraft(draft);

    return draft;
  }

  // Update platforms for a draft
  async updatePlatforms(draftId: string, platforms: Platform[]): Promise<ContentDraft | null> {
    const draft = await this.getDraft(draftId);
    if (!draft) return null;

    draft.platforms = platforms;
    draft.updated = new Date().toISOString();

    await saveDraft(draft);

    return draft;
  }

  // Delete a draft
  async deleteDraft(draftId: string): Promise<boolean> {
    try {
      const puter = (window as Window & { puter?: { fs?: { delete: (path: string) => Promise<void> } } }).puter;
      if (!puter?.fs) return false;

      await puter.fs.delete(`${DRAFTS_PATH}/${draftId}.json`);
      return true;
    } catch {
      return false;
    }
  }

  // Duplicate a draft
  async duplicateDraft(draftId: string): Promise<ContentDraft | null> {
    const original = await this.getDraft(draftId);
    if (!original) return null;

    const currentVersion = this.getCurrentVersion(original);
    if (!currentVersion) return null;

    return this.createDraft({
      text: currentVersion.text,
      imageUrl: currentVersion.imageUrl,
      platforms: original.platforms,
      contentType: original.contentType,
      score: currentVersion.score,
    });
  }

  // Search drafts by text content
  async searchDrafts(query: string): Promise<ContentDraft[]> {
    const drafts = await this.getAllDrafts();
    const lowerQuery = query.toLowerCase();

    return drafts.filter(draft => {
      const currentVersion = this.getCurrentVersion(draft);
      if (!currentVersion) return false;
      return currentVersion.text.toLowerCase().includes(lowerQuery);
    });
  }

  // Get drafts for a specific platform
  async getDraftsByPlatform(platform: Platform): Promise<ContentDraft[]> {
    const drafts = await this.getAllDrafts();
    return drafts.filter(d => d.platforms.includes(platform));
  }

  // Get draft statistics
  async getStats(): Promise<{
    total: number;
    drafts: number;
    approved: number;
    scheduled: number;
    published: number;
    averageVersions: number;
  }> {
    const allDrafts = await this.getAllDrafts();
    
    const stats = {
      total: allDrafts.length,
      drafts: 0,
      approved: 0,
      scheduled: 0,
      published: 0,
      averageVersions: 0,
    };

    let totalVersions = 0;

    for (const draft of allDrafts) {
      const statKey = draft.status === 'draft' ? 'drafts' : draft.status;
      stats[statKey as keyof typeof stats]++;
      totalVersions += draft.versions.length;
    }

    stats.averageVersions = allDrafts.length > 0 
      ? Math.round((totalVersions / allDrafts.length) * 10) / 10 
      : 0;

    return stats;
  }

  // Mark a draft as published
  async markPublished(
    draftId: string,
    publishResults: { platform: string; success: boolean; postId?: string }[]
  ): Promise<ContentDraft | null> {
    const draft = await this.getDraft(draftId);
    if (!draft) return null;

    draft.status = 'published';
    draft.publishedAt = new Date().toISOString();
    draft.publishResults = publishResults;
    draft.updated = new Date().toISOString();

    await saveDraft(draft);

    // Also save to published history
    await this.saveToPublishedHistory(draft);

    return draft;
  }

  // Save to published history
  private async saveToPublishedHistory(draft: ContentDraft): Promise<void> {
    try {
      const puter = (window as Window & { puter?: { fs?: { write: (path: string, data: string) => Promise<void> } } }).puter;
      if (!puter?.fs) return;

      const historyPath = '/NexusAI/content/published';
      const filename = `${draft.id}.json`;
      
      await puter.fs.write(
        `${historyPath}/${filename}`,
        JSON.stringify(draft, null, 2)
      );
    } catch (error) {
      console.error('Error saving to published history:', error);
    }
  }

  // Export draft as different formats
  exportAsText(draft: ContentDraft): string {
    const currentVersion = this.getCurrentVersion(draft);
    return currentVersion?.text || '';
  }

  exportAsJSON(draft: ContentDraft): string {
    return JSON.stringify(draft, null, 2);
  }

  exportAsMarkdown(draft: ContentDraft): string {
    const currentVersion = this.getCurrentVersion(draft);
    if (!currentVersion) return '';

    return `# Draft: ${draft.id}

**Created:** ${new Date(draft.created).toLocaleString()}
**Status:** ${draft.status}
**Platforms:** ${draft.platforms.join(', ')}

---

${currentVersion.text}

${currentVersion.imageUrl ? `![Image](${currentVersion.imageUrl})` : ''}

---

*Version ${currentVersion.v} | Score: ${currentVersion.score}*
`;
  }
}

// Export singleton instance
export const draftsService = new DraftsService();
