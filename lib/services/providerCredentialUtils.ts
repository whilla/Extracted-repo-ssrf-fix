'use client';

import { kvGet, kvSet } from './puterService';

const CONTROL_AND_ZERO_WIDTH_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g;
const WHITESPACE_LIKE_PATTERN = /[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;
const EDGE_QUOTE_PATTERN = /^['"`]+|['"`]+$/g;
const SECRET_KEY_NAME_PATTERN = /(?:^|_)(?:api_?)?key$/i;
const ENCRYPTION_PREFIX = 'SEC_V2_';

/**
 * PRODUCTION SECURITY IMPLEMENTATION
 * Uses AES-GCM 256-bit encryption via Web Crypto API.
 */

async function getMasterKey(): Promise<CryptoKey> {
  const seed = await kvGet('app_master_secret');
  if (!seed || typeof seed !== 'string' || seed.length < 32) {
    throw new Error('[Security] Master secret not configured. Set app_master_secret in KV store.');
  }
  
  let salt = await kvGet('app_master_salt');
  if (!salt || typeof salt !== 'string') {
    // Generate a random salt and persist it
    const randomSalt = new Uint8Array(16);
    window.crypto.getRandomValues(randomSalt);
    salt = btoa(String.fromCharCode(...randomSalt));
    await kvSet('app_master_salt', salt);
  }
  
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(seed),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function sanitizeApiKey(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';

  const withoutControls = value.replace(CONTROL_AND_ZERO_WIDTH_PATTERN, '');
  const withoutEdgeQuotes = withoutControls.trim().replace(EDGE_QUOTE_PATTERN, '');
  return withoutEdgeQuotes.replace(WHITESPACE_LIKE_PATTERN, '');
}

export function hasConfiguredSecret(value: string | null | undefined): boolean {
  return sanitizeApiKey(value).length > 0;
}

export function sanitizeStoredValueForKey(storageKey: string, value: string | null | undefined): string {
  if (typeof value !== 'string') return '';

  const normalized = value.replace(CONTROL_AND_ZERO_WIDTH_PATTERN, '').trim();
  if (
    SECRET_KEY_NAME_PATTERN.test(storageKey) ||
    storageKey === 'ayrshare_key' ||
    storageKey === 'fal_key' ||
    storageKey === 'ltx_key'
  ) {
    return sanitizeApiKey(normalized);
  }

  return normalized;
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

async function browserSafeBase64Encode(value: string): Promise<string> {
  const encoded = btoa(unescape(encodeURIComponent(value)));
  return encoded;
}

async function browserSafeBase64Decode(encoded: string): Promise<string> {
  return decodeURIComponent(escape(atob(encoded)));
}

export async function storeSecureCredential(key: string, value: string): Promise<void> {
  const sanitized = sanitizeApiKey(value);
  if (!sanitized) {
    await kvSet(key, '');
    return;
  }

  const masterKey = await getMasterKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(sanitized);

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    encoded
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  const base64 = btoa(String.fromCharCode(...combined));
  await kvSet(key, `${ENCRYPTION_PREFIX}${base64}`);
}

export async function getSecureCredential(key: string): Promise<string> {
  const stored = await kvGet(key);
  if (!stored || typeof stored !== 'string' || !stored.startsWith(ENCRYPTION_PREFIX)) {
    return stored ? sanitizeApiKey(stored) : '';
  }

  try {
    const base64 = stored.slice(ENCRYPTION_PREFIX.length);
    const combined = new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const masterKey = await getMasterKey();
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      masterKey,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error(`[Security] Decryption failed for ${key}:`, error);
    return '';
  }
}

export async function storeApiKey(keyName: string, apiKey: string): Promise<boolean> {
  try {
    const sanitized = sanitizeApiKey(apiKey);
    if (!sanitized) return false;
    await storeSecureCredential(keyName, sanitized);
    return true;
  } catch {
    return false;
  }
}

export async function getApiKey(keyName: string): Promise<string> {
  return getSecureCredential(keyName);
}
