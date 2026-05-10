'use client';

import { kvGet, kvSet } from './puterService';

const CONTROL_AND_ZERO_WIDTH_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g;
const WHITESPACE_LIKE_PATTERN = /[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;
const EDGE_QUOTE_PATTERN = /^['"`]+|['"`]+$/g;
const SECRET_KEY_NAME_PATTERN = /(?:^|_)(?:api_?)?key$/i;
const ENCODED_PREFIX = 'ENC_V1_';

/**
 * NOTE: This is NOT secure storage - base64 is reversible.
 * This provides only basic obfuscation, not encryption.
 * TODO: Implement proper encryption using Web Crypto API or secure key management.
 */

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
  return value.startsWith(ENCODED_PREFIX);
}

function browserSafeBase64Encode(value: string): string {
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(value)));
  }
  return Buffer.from(value).toString('base64');
}

function browserSafeBase64Decode(encoded: string): string {
  if (typeof atob !== 'undefined') {
    return decodeURIComponent(escape(atob(encoded)));
  }
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

export function encodeValue(value: string): string {
  if (isEncryptedValue(value)) return value;
  
  const encoded = browserSafeBase64Encode(value);
  return `${ENCODED_PREFIX}${encoded}`;
}

export function decodeValue(value: string): string {
  if (!isEncryptedValue(value)) return value;
  
  const encoded = value.slice(ENCODED_PREFIX.length);
  return browserSafeBase64Decode(encoded);
}

export async function storeSecureCredential(key: string, value: string): Promise<void> {
  const encrypted = encodeValue(value);
  await kvSet(key, encrypted);
}

export async function getSecureCredential(key: string): Promise<string> {
  const stored = await kvGet(key);
  if (!stored) return '';
  
  if (typeof stored !== 'string') {
    throw new Error(`Expected string for key ${key}, got ${typeof stored}`);
  }
  return decodeValue(stored);
}

export async function storeApiKey(keyName: string, apiKey: string): Promise<boolean> {
  const sanitized = sanitizeApiKey(apiKey);
  if (sanitized) {
    await storeSecureCredential(keyName, sanitized);
    return true;
  }
  return false;
}

export async function getApiKey(keyName: string): Promise<string> {
  const stored = await kvGet(keyName);
  if (!stored) return '';
  
  const value = typeof stored === 'string' ? stored : '';
  if (isEncryptedValue(value)) {
    return decodeValue(value);
  }
  
  return sanitizeApiKey(value);
}
