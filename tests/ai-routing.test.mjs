import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackProviders } from '../lib/services/providerFallback.ts';

test('buildFallbackProviders keeps Puter fallback chain when Puter is preferred', () => {
  assert.deepEqual(
    buildFallbackProviders('puter', ['puter', 'groq', 'openrouter']),
    ['puter', 'groq', 'openrouter']
  );
});

test('buildFallbackProviders excludes Puter after manual switch to another provider', () => {
  assert.deepEqual(
    buildFallbackProviders('groq', ['puter', 'groq', 'openrouter']),
    ['groq', 'openrouter']
  );
});

test('buildFallbackProviders preserves the preferred non-Puter provider when it is the only option', () => {
  assert.deepEqual(
    buildFallbackProviders('openrouter', ['puter', 'openrouter']),
    ['openrouter']
  );
});
