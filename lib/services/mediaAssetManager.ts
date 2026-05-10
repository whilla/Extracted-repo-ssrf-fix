/**
 * MEDIA ASSET WRAPPER
 * Standardizes media assets across different providers to prevent a mix of 
 * blob URLs, direct HTTPS links, and local mirrors.
 */

import { kvGet, kvSet } from './puterService';

export type MediaAssetType = 'video' | 'audio' | 'image';

export interface MediaAsset {
  id: string;
  type: MediaAssetType;
  url: string;
  provider: string;
  mimeType: string;
  duration?: number;
  dimensions?: { width: number; height: number };
  createdAt: string;
  metadata: Record<string, any>;
}

export class MediaAssetManager {
  private static instance: MediaAssetManager = new MediaAssetManager();

  private constructor() {}

  static getInstance() {
    return this.instance;
  }

  /**
   * Standardizes any incoming media URL into a formal MediaAsset
   */
  async wrapAsset(url: string, type: MediaAssetType, provider: string, metadata: Record<string, any> = {}): Promise<MediaAsset> {
    const id = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Detect mime type from URL or assume defaults
    let mimeType = 'application/octet-stream';
    if (url.endsWith('.mp3') || url.includes('audio')) mimeType = 'audio/mpeg';
    if (url.endsWith('.mp4') || url.includes('video')) mimeType = 'video/mp4';
    if (url.endsWith('.jpg') || url.endsWith('.png')) mimeType = 'image/jpeg';

    const asset: MediaAsset = {
      id,
      type,
      url,
      provider,
      mimeType,
      createdAt: new Date().toISOString(),
      metadata,
    };

    // Persist the metadata record for future assembly
    await kvSet(`asset_meta_${id}`, JSON.stringify(asset));
    
    return asset;
  }

  /**
   * Resolves a stored asset ID back to a usable asset object
   */
  async resolveAsset(assetId: string): Promise<MediaAsset | null> {
    const data = await kvGet(`asset_meta_${assetId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Validates if a media asset is actually playable/reachable
   */
  async validateAsset(asset: MediaAsset): Promise<boolean> {
    try {
      const response = await fetch(asset.url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const mediaAssetManager = MediaAssetManager.getInstance();
