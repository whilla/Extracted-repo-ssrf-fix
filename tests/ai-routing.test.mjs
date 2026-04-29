import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackProviders } from '../lib/services/providerFallback.ts';

test('buildFallbackProviders keeps Puter fallback chain when Puter is preferred', () => {
  assert.deepEqual(
    buildFallbackProviders('puter', ['puter', 'groq', 'openrouter']),
    ['puter', 'groq', 'openrouter']
  );
});

test('buildFallbackProviders keeps Puter in the chain by default for non-Puter providers', () => {
  assert.deepEqual(
    buildFallbackProviders('groq', ['puter', 'groq', 'openrouter']),
    ['groq', 'puter', 'openrouter']
  );
});

test('buildFallbackProviders excludes Puter when explicit disable is enabled', () => {
  assert.deepEqual(
    buildFallbackProviders('groq', ['puter', 'groq', 'openrouter'], { disablePuterFallback: true }),
    ['groq', 'openrouter']
  );
});

test('buildFallbackProviders preserves the preferred non-Puter provider when it is the only routed option', () => {
  assert.deepEqual(
    buildFallbackProviders('openrouter', ['puter', 'openrouter'], { disablePuterFallback: true }),
    ['openrouter']
  );
});
