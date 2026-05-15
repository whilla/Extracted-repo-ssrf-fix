/**
 * INTEGRATION & VERIFICATION SUITE
 * Validates the new high-level systems added to NexusAI.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.join(cwd, relPath));
}

describe('Gap-Fill Feature Verification', () => {
  it('Collaborative Workflow (CRDTs) files exist', () => {
    expect(fileExists('lib/services/collaborationManager.ts')).toBe(true);
  });

  it('Brand Identity Versioning files exist', () => {
    expect(fileExists('lib/services/brandVersionManager.ts')).toBe(true);
  });

  it('Offline Resilience files exist', () => {
    expect(fileExists('lib/services/offlineSyncManager.ts')).toBe(true);
  });

  it('Circuit Breaker service exists', () => {
    expect(fileExists('lib/services/circuitBreaker.ts')).toBe(true);
  });

  it('Enhanced Rate Limiter exists', () => {
    expect(fileExists('lib/services/rateLimiter.ts')).toBe(true);
  });
});

describe('NexusBrain Engine', () => {
  it('service is loadable and has chatWithBrain function', async () => {
    const mod = await import('@/lib/services/nexusBrain');
    expect(typeof mod.chatWithBrain).toBe('function');
    const result = await mod.chatWithBrain(
      [{ role: 'user' as const, content: 'Hello' }],
      null
    );
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('generates hooks on demand', async () => {
    const mod = await import('@/lib/services/nexusBrain');
    const result = await mod.chatWithBrain(
      [{ role: 'user' as const, content: 'Give me 5 hooks about productivity' }],
      null
    );
    expect(['hook', 'brainstorm']).toContain(result.intent);
    expect(result.text).toMatch(/\d+\./);
  });

  it('generates posts on demand', async () => {
    const mod = await import('@/lib/services/nexusBrain');
    const result = await mod.chatWithBrain(
      [{ role: 'user' as const, content: 'Write a LinkedIn post about leadership' }],
      { brandName: 'TestBrand', niche: 'Leadership', tone: 'professional' }
    );
    expect(['write_post', 'general']).toContain(result.intent);
    expect(result.text.length).toBeGreaterThan(50);
  });
});
