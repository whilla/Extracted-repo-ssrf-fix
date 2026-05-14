

import { getFileReadUrl, PATHS, writeBinaryFile } from './puterService';
import {
  inferExtensionFromMimeType,
  isDurableMediaReference,
  isEphemeralMediaReference,
} from './mediaAssetPrimitives.mjs';

export interface PersistedMediaAsset {
  url: string;
  path?: string;
  mimeType: string;
  persisted: boolean;
}

function sanitizeFileStem(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'asset';
}

function buildAssetPath(kind: 'image' | 'video' | 'audio', extension: string, generationId?: string): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const prefix = sanitizeFileStem(generationId || 'session');
  return `${PATHS.assets}/${kind}/${prefix}-${stamp}.${extension}`;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return await response.blob();
}

async function fetchBlobFromReference(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    return dataUrlToBlob(url);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch media asset: ${response.status} ${response.statusText}`);
  }
  return await response.blob();
}

export async function persistBlobMediaAsset(
  blob: Blob,
  options: {
    kind: 'image' | 'video' | 'audio';
    generationId?: string;
    fileExtension?: string;
  }
): Promise<PersistedMediaAsset | null> {
  const extension = options.fileExtension || inferExtensionFromMimeType(blob.type, options.kind === 'audio' ? 'mp3' : options.kind === 'video' ? 'webm' : 'png');
  const path = buildAssetPath(options.kind, extension, options.generationId);
  const saved = await writeBinaryFile(path, blob);

  if (!saved) {
    return null;
  }

  const resolvedUrl = await getFileReadUrl(path);
  if (!resolvedUrl) {
    return null;
  }

  return {
    url: resolvedUrl,
    path,
    mimeType: blob.type || `application/${extension}`,
    persisted: true,
  };
}

export async function persistMediaReference(
  url: string,
  options: {
    kind: 'image' | 'video' | 'audio';
    generationId?: string;
    mimeTypeHint?: string;
  }
): Promise<PersistedMediaAsset | null> {
  if (!url || typeof url !== 'string') return null;
  const fallbackExtension = options.kind === 'audio' ? 'mp3' : options.kind === 'video' ? 'webm' : 'png';

  if (isEphemeralMediaReference(url) || url.startsWith('data:')) {
    try {
      const blob = await fetchBlobFromReference(url);
      return await persistBlobMediaAsset(blob, {
        kind: options.kind,
        generationId: options.generationId,
        fileExtension: inferExtensionFromMimeType(options.mimeTypeHint || blob.type, fallbackExtension),
      });
    } catch {
      return null;
    }
  }

  if (isDurableMediaReference(url)) {
    return {
      url,
      mimeType: options.mimeTypeHint || 'application/octet-stream',
      persisted: !url.startsWith('blob:'),
    };
  }

  return null;
}
