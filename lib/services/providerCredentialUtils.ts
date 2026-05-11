'use client';

import { kvGet, kvSet } from './puterService';

const CONTROL_AND_ZERO_WIDTH_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g;
const WHITESPACE_LIKE_PATTERN = /[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;
const EDGE_QUOTE_PATTERN = /^['"`]+|['"`]+$/g;
const SECRET_KEY_NAME_PATTERN = /(?:^|_)(?:api_?)?key$/i;
const ENCRYPTION_PREFIX = 'SEC_V2_';

async function getMasterKey(): Promise<CryptoKey> {
  const seed = await kvGet('app_master_secret');
  if (!seed || typeof seed !== 'string' || seed.length < 32) {
    throw new Error('[Security] Master secret not configured. Set app_master_secret in KV store.');
  }
  
  let salt = await kvGet('app_master_salt');
  if (!salt || typeof salt !== 'string') {
    const randomSalt = new Uint8Array(16);
    window.crypto.getRandomValues(randomSalt);
    salt = btoa(String.fromCharCode(...randomSalt));
    await kvSet('app_master_salt', salt);
  }
  
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(seed),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
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
  if (!value) return '';
  let cleaned = value.replace(EDGE_QUOTE_PATTERN, '').trim();
  if (cleaned.startsWith('sk_live_')) {
    cleaned = 'sk_live_********************';
  }
  return cleaned;
}

export function hasConfiguredSecret(value: string | null | undefined): boolean {
  return Boolean(value && value.length >= 20);
}

export function sanitizeStoredValueForKey(storageKey: string, value: string | null | undefined): string {
  if (!value) return '';
  let cleaned = value.replace(EDGE_QUOTE_PATTERN, '').trim();
  
  if (SECRET_KEY_NAME_PATTERN.test(storageKey)) {
    const visibleChars = Math.min(8, Math.floor(cleaned.length * 0.25));
    if (visibleChars > 0) {
      cleaned = cleaned.slice(0, visibleChars) + '*'.repeat(cleaned.length - visibleChars);
    }
  }
  
  return cleaned;
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

export async function storeSecureCredential(key: string, value: string): Promise<void> {
  const encoder = new TextEncoder();
  const masterKey = await getMasterKey();
  
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    encoder.encode(value)
  );
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  await kvSet(`cred_${key}`, ENCRYPTION_PREFIX + btoa(String.fromCharCode(...combined)));
}

export async function getSecureCredential(key: string): Promise<string> {
  const stored = await kvGet(`cred_${key}`);
  if (!stored || typeof stored !== 'string') {
    throw new Error(`Credential not found: ${key}`);
  }
  
  if (!isEncryptedValue(stored)) {
    return stored;
  }
  
  const encryptedData = atob(stored.slice(ENCRYPTION_PREFIX.length));
  const combined = new Uint8Array(encryptedData.length);
  for (let i = 0; i < encryptedData.length; i++) {
    combined[i] = encryptedData.charCodeAt(i);
  }
  
  const masterKey = await getMasterKey();
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  try {
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      masterKey,
      encrypted
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    throw new Error(`Failed to decrypt credential: ${key}`);
  }
}

export async function storeApiKey(keyName: string, apiKey: string): Promise<boolean> {
  try {
    await storeSecureCredential(keyName, apiKey);
    return true;
  } catch (error) {
    console.error('[Security] Failed to store API key:', error);
    return false;
  }
}

export async function getApiKey(keyName: string): Promise<string> {
  return getSecureCredential(keyName);
}

export const providerCredentialUtils = {
  sanitizeApiKey,
  hasConfiguredSecret,
  sanitizeStoredValueForKey,
  isEncryptedValue,
  storeSecureCredential,
  getSecureCredential,
  storeApiKey,
  getApiKey,
};