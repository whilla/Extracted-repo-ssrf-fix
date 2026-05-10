import { PATHS, readFile, writeFile, listFiles } from './puterService';
import type { BrandKit } from '@/lib/types';

export interface BrandVersion {
  versionId: string;
  timestamp: string;
  kit: BrandKit;
  changeLog: string;
  author: string;
  performanceSnapshot?: {
    avgEngagementRate: number;
    topPillar: string;
  };
}

/**
 * BrandVersionManager
 * Implements version control for Brand Kits, allowing the a brand's identity 
 * to evolve over time without losing previous successful iterations.
 */
export class BrandVersionManager {
  private readonly VERSIONS_PATH = `${PATHS.brandKit}/versions`;

  /**
   * Saves current brand kit as a new version.
   */
  async createSnapshot(kit: BrandKit, changeLog: string, author: string = 'system'): Promise<string> {
    const versionId = `v${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const version: BrandVersion = {
      versionId,
      timestamp: new Date().toISOString(),
      kit,
      changeLog,
      author,
    };

    // Ensure directory exists (via Puter mock logic, we just save the file)
    await writeFile(`${this.VERSIONS_PATH}/${versionId}.json`, JSON.stringify(version, null, 2));
    
    // Update the current pointer to the latest version
    await writeFile(`${PATHS.brandKit}/current_version.json`, { 
      currentVersionId: versionId, 
      updatedAt: version.timestamp 
    });

    return versionId;
  }

  /**
   * Retrieves a specific version of the brand kit.
   */
  async getVersion(versionId: string): Promise<BrandVersion | null> {
    try {
      const content = await readFile(`${this.VERSIONS_PATH}/${versionId}.json`, true);
      return content as BrandVersion;
    } catch {
      return null;
    }
  }

  /**
   * Lists all available brand versions.
   */
  async listVersions(): Promise<BrandVersion[]> {
    const files = await listFiles(this.VERSIONS_PATH);
    if (!files) return [];

    const versionFiles = files.filter(f => f.name.endsWith('.json'));
    const versions = await Promise.all(
      versionFiles.map(f => this.getVersion(f.name.replace('.json', '')))
    );

    return (versions.filter(v => v !== null) as BrandVersion[]).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Rolls back the current brand kit to a specific version.
   */
  async rollbackTo(versionId: string): Promise<boolean> {
    const version = await this.getVersion(versionId);
    if (!version) return false;

    // 1. Restore the main brandkit.json
    await writeFile(PATHS.brandKit, JSON.stringify(version.kit, null, 2));
    
    // 2. Update the current version pointer
    await writeFile(`${PATHS.brandKit}/current_version.json`, { 
      currentVersionId: versionId, 
      updatedAt: new Date().toISOString() 
    });

    return true;
  }

  /**
   * Compares two versions to identify identity shifts.
   */
  async diffVersions(v1Id: string, v2Id: string): Promise<{
    changedFields: string[];
    summary: string;
  }> {
    const v1 = await this.getVersion(v1Id);
    const v2 = await this.getVersion(v2Id);
    if (!v1 || !v2) throw new Error('One or more versions not found');

    const changedFields: string[] = [];
    const keys = Object.keys(v1.kit) as (keyof BrandKit)[];

    for (const key of keys) {
      if (JSON.stringify(v1.kit[key]) !== JSON.stringify(v2.kit[key])) {
        changedFields.push(key);
      }
    }

    return {
      changedFields,
      summary: `Identity shifted across ${changedFields.length} core dimensions.`,
    };
  }
}

export const brandVersionManager = new BrandVersionManager();
