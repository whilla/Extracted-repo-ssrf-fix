import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const cwd = process.cwd();

describe('API Middleware - Rate Limiting', () => {
  it('rateLimit allows requests within limit', () => {
    const { rateLimit, clearRateLimit } = require('../lib/utils/rateLimit.ts');
    clearRateLimit('test-key');

    const result1 = rateLimit({ maxRequests: 5, windowMs: 60000, key: 'test-key' });
    expect(result1.allowed).toBe(true);
    expect(result1.remaining).toBe(4);
  });

  it('rateLimit blocks requests over limit', () => {
    const { rateLimit, clearRateLimit } = require('../lib/utils/rateLimit.ts');
    clearRateLimit('test-block-key');

    for (let i = 0; i < 5; i++) {
      rateLimit({ maxRequests: 5, windowMs: 60000, key: 'test-block-key' });
    }

    const blocked = rateLimit({ maxRequests: 5, windowMs: 60000, key: 'test-block-key' });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBeDefined();
  });

  it('rateLimit utility respects window boundaries', () => {
    const { rateLimit, clearRateLimit } = require('../lib/utils/rateLimit.ts');
    clearRateLimit('window-test');

    const r1 = rateLimit({ maxRequests: 2, windowMs: 5000, key: 'window-test' });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = rateLimit({ maxRequests: 2, windowMs: 5000, key: 'window-test' });
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = rateLimit({ maxRequests: 2, windowMs: 5000, key: 'window-test' });
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('clearRateLimit resets store', () => {
    const { rateLimit, clearRateLimit, getRateLimitStatus } = require('../lib/utils/rateLimit.ts');
    clearRateLimit('clear-test');
    rateLimit({ maxRequests: 5, windowMs: 60000, key: 'clear-test' });
    expect(getRateLimitStatus('clear-test')).toBeDefined();
    clearRateLimit('clear-test');
    expect(getRateLimitStatus('clear-test')).toBeUndefined();
  });
});

describe('New API Endpoints - File Structure Validation', () => {
  it('All new API route files exist', () => {
    const routes = [
      'app/api/ecommerce/shopify/route.ts',
      'app/api/ecommerce/amazon/route.ts',
      'app/api/ecommerce/etsy/route.ts',
      'app/api/spatial/models/route.ts',
      'app/api/spatial/ar-filters/route.ts',
      'app/api/spatial/vr-environments/route.ts',
      'app/api/interactive/route.ts',
      'app/api/compliance/route.ts',
      'app/api/compliance/region/route.ts',
      'app/api/audience/route.ts',
      'app/api/predictive/route.ts',
      'app/api/crm/route.ts',
      'app/api/crm/segment/route.ts',
      'app/api/crm/customer/route.ts',
      'app/api/data/visualization/route.ts',
      'app/api/data/comparison/route.ts',
      'app/api/intel/analyze/route.ts',
      'app/api/intel/competitive/route.ts',
      'app/api/features/route.ts',
    ];

    routes.forEach(r => {
      const fullPath = path.join(cwd, r);
      expect(fs.existsSync(fullPath)).toBe(true);
    });
  });

  it('All route files have auth middleware and proper exports', () => {
    const routes = [
      'app/api/ecommerce/shopify/route.ts',
      'app/api/ecommerce/amazon/route.ts',
      'app/api/ecommerce/etsy/route.ts',
      'app/api/spatial/models/route.ts',
      'app/api/spatial/ar-filters/route.ts',
      'app/api/spatial/vr-environments/route.ts',
      'app/api/interactive/route.ts',
      'app/api/compliance/route.ts',
      'app/api/audience/route.ts',
      'app/api/predictive/route.ts',
      'app/api/crm/route.ts',
      'app/api/crm/segment/route.ts',
      'app/api/crm/customer/route.ts',
      'app/api/data/visualization/route.ts',
      'app/api/data/comparison/route.ts',
      'app/api/intel/competitive/route.ts',
      'app/api/features/route.ts',
    ];

    routes.forEach(r => {
      const content = fs.readFileSync(path.join(cwd, r), 'utf-8');
      expect(content).toContain('withApiMiddleware');
      expect(
        content.includes('export async function POST') || content.includes('export async function GET')
      ).toBe(true);
    });
  });

  it('Service files export expected classes', () => {
    const services = [
      { file: 'lib/services/competitiveIntelService.ts', exports: ['CompetitiveIntelService'] },
      { file: 'lib/services/predictiveViralService.ts', exports: ['PredictiveViralService'] },
      { file: 'lib/services/audienceBehaviorService.ts', exports: ['AudienceBehaviorService'] },
      { file: 'lib/services/crmService.ts', exports: ['CRMService'] },
      { file: 'lib/services/interactiveContentService.ts', exports: ['InteractiveContentService'] },
      { file: 'lib/services/spatialContentService.ts', exports: ['SpatialContentService'] },
      { file: 'lib/services/dataVisualizationService.ts', exports: ['DataVisualizationService'] },
      { file: 'lib/services/regionalContentFilterService.ts', exports: ['RegionalContentFilterService'] },
    ];

    services.forEach(({ file, exports: expectedExports }) => {
      const content = fs.readFileSync(path.join(cwd, file), 'utf-8');
      expectedExports.forEach(exp => {
        expect(
          content.includes(`export class ${exp}`) || content.includes(`export { ${exp}`)
        ).toBe(true);
      });
    });
  });

  it('Supabase CRM migration file exists with correct schema', () => {
    const migrationPath = path.join(cwd, 'supabase/migrations/20260511_crm_schema.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
    const content = fs.readFileSync(migrationPath, 'utf-8');
    expect(content).toContain('crm_customers');
    expect(content).toContain('crm_segments');
    expect(content).toContain('crm_interactions');
    expect(content).toContain('enable row level security');
  });

  it('API documentation exists with endpoint coverage', () => {
    const docPath = path.join(cwd, 'docs/API_REFERENCE.md');
    expect(fs.existsSync(docPath)).toBe(true);
    const content = fs.readFileSync(docPath, 'utf-8');
    expect(content).toContain('/api/ecommerce/shopify');
    expect(content).toContain('/api/predictive');
    expect(content).toContain('/api/crm');
    expect(content).toContain('/api/spatial/models');
    expect(content).toContain('/api/interactive');
    expect(content).toContain('/api/compliance');
  });
});

describe('New API Endpoints - Settings Page', () => {
  it('Settings page has new tab sections', () => {
    const content = fs.readFileSync(
      path.join(cwd, 'app/(app)/settings/page.tsx'), 'utf-8'
    );
    expect(content).toContain("'ecommerce'");
    expect(content).toContain("'compliance'");
    expect(content).toContain("'crm'");
    expect(content).toContain('shopifyStoreUrl');
    expect(content).toContain('complianceRegions');
    expect(content).toContain('blockedTopics');
  });
});
