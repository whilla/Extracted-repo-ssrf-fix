import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasConfiguredSecret,
  sanitizeApiKey,
  sanitizeStoredValueForKey,
} from '../lib/services/providerCredentialUtils.ts';

test('sanitizeApiKey strips whitespace, quotes, and zero-width characters', () => {
  const raw = '  \"sk-\u200Babc 123\u00A0\"  ';
  assert.equal(sanitizeApiKey(raw), 'sk-abc123');
});

test('hasConfiguredSecret uses sanitized values', () => {
  assert.equal(hasConfiguredSecret(' \u200B\t '), false);
  assert.equal(hasConfiguredSecret('  key-123  '), true);
});

test('sanitizeStoredValueForKey preserves normal values but sanitizes secret-like keys', () => {
  assert.equal(sanitizeStoredValueForKey('ltx_open_endpoint', '  https://api.example.com/ltx  '), 'https://api.example.com/ltx');
  assert.equal(sanitizeStoredValueForKey('ayrshare_key', '  "abc 123"  '), 'abc123');
});
