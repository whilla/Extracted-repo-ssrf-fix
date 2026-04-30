'use client';

const CONTROL_AND_ZERO_WIDTH_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g;
const WHITESPACE_LIKE_PATTERN = /[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;
const EDGE_QUOTE_PATTERN = /^['"`]+|['"`]+$/g;
const SECRET_KEY_NAME_PATTERN = /(?:^|_)(?:api_?)?key$/i;

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
