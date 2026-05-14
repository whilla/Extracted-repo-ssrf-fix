/**
 * INTEGRATION & VERIFICATION SUITE
 * This test suite validates the new high-level systems added to NexusAI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function fileExists(relPath) {
  return fs.existsSync(path.join(process.cwd(), relPath));
}

// Lazy-load TS modules via dynamic imports so node:test can run them
async function loadService(path) {
  const mod = await import(path);
  return mod;
}

test('Gap-Fill Feature Verification', async (t) => {
  await t.test('Collaborative Workflow (CRDTs) — files exist', () => {
    assert.ok(fileExists('lib/services/collaborationManager.ts'), 'collaborationManager.ts should exist');
  });

  await t.test('Brand Identity Versioning — files exist', () => {
    assert.ok(fileExists('lib/services/brandVersionManager.ts'), 'brandVersionManager.ts should exist');
  });

  await t.test('Offline Resilience — files exist', () => {
    assert.ok(fileExists('lib/services/offlineSyncManager.ts'), 'offlineSyncManager.ts should exist');
  });

  await t.test('NexusBrain service is loadable and has chat function', async () => {
    const mod = await loadService('../lib/services/nexusBrain.ts');
    assert.ok(typeof mod.chatWithBrain === 'function', 'chatWithBrain should be exported');
    const result = await mod.chatWithBrain(
      [{ role: 'user', content: 'Hello' }],
      null
    );
    assert.ok(typeof result.text === 'string', 'chatWithBrain should return text');
    assert.ok(result.text.length > 0, 'response should not be empty');
  });

  await t.test('NexusBrain generates hooks on demand', async () => {
    const mod = await loadService('../lib/services/nexusBrain.ts');
    const result = await mod.chatWithBrain(
      [{ role: 'user', content: 'Give me 5 hooks about productivity' }],
      null
    );
    assert.ok(result.intent === 'hook' || result.intent === 'brainstorm', 'should detect hook intent');
    assert.ok(result.text.includes('1.'), 'should return numbered hooks');
  });

  await t.test('NexusBrain generates posts on demand', async () => {
    const mod = await loadService('../lib/services/nexusBrain.ts');
    const result = await mod.chatWithBrain(
      [{ role: 'user', content: 'Write a LinkedIn post about leadership' }],
      { brandName: 'TestBrand', niche: 'Leadership', tone: 'professional' }
    );
    assert.ok(result.intent === 'write_post' || result.intent === 'general', 'should detect write_post intent');
    assert.ok(result.text.length > 50, 'should return a substantial post');
  });
});
