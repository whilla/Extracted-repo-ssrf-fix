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
  durationSeconds?: number;
  dimensions?: { width: number; height: number };
  aspectRatio?: string;
  thumbnailUrl?: string;
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
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL: must be a non-empty string');
    }
    
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL format: ${url}`);
    }
    
    const validTypes: MediaAssetType[] = ['video', 'audio', 'image'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid MediaAssetType: ${type}`);
    }
    
    const id = `asset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
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

    await kvSet(`asset_meta_${id}`, JSON.stringify(asset));
    
    return asset;
  }

  /**
   * Resolves a stored asset ID back to a usable asset object
   */
  async resolveAsset(assetId: string): Promise<MediaAsset | null> {
    const data = await kvGet(`asset_meta_${assetId}`);
    if (!data) return null;
    
    try {
      return JSON.parse(data);
    } catch (err) {
      console.error(`[MediaAssetManager] Failed to parse asset ${assetId}:`, err);
      return null;
    }
  }

  /**
   * Validates if a media asset is actually playable/reachable
   */
  async validateAsset(asset: MediaAsset, options?: { method?: 'HEAD' | 'GET', logger?: any }): Promise<boolean> {
    const method = options?.method || 'HEAD';
    const logger = options?.logger;
    
    try {
      const response = await fetch(asset.url, { method });
      if (response.ok) return true;
      
      if (method === 'HEAD' && !response.ok) {
        const getResponse = await fetch(asset.url, { method: 'GET', headers: { 'Range': 'bytes=0-0' } });
        return getResponse.ok || getResponse.status === 206;
      }
      
      return false;
    } catch (err) {
      logger?.error?.(`[MediaAssetManager] Validation failed for ${asset.url}:`, err);
      return false;
    }
  }
}

export const mediaAssetManager = MediaAssetManager.getInstance();
