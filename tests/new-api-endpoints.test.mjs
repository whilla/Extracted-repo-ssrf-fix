import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const cwd = process.cwd();

test('API Middleware - Rate Limiting', async (t) => {
  await t.test('rateLimit allows requests within limit', () => {
    const { rateLimit, clearRateLimit } = require('../lib/utils/rateLimit.ts');
    clearRateLimit('test-key');

    const result1 = rateLimit({ maxRequests: 5, windowMs: 60000, key: 'test-key' });
    assert.ok(result1.allowed, 'First request should be allowed');
    assert.equal(result1.remaining, 4, 'Should have 4 remaining');
  });

  await t.test('rateLimit blocks requests over limit', () => {
    const { rateLimit, clearRateLimit } = require('../lib/utils/rateLimit.ts');
    clearRateLimit('test-block-key');

    for (let i = 0; i < 5; i++) {
      rateLimit({ maxRequests: 5, windowMs: 60000, key: 'test-block-key' });
    }

    const blocked = rateLimit({ maxRequests: 5, windowMs: 60000, key: 'test-block-key' });
    assert.ok(!blocked.allowed, 'Sixth request should be blocked');
    assert.equal(blocked.remaining, 0, 'Should have 0 remaining');
    assert.ok(blocked.retryAfter !== undefined, 'Should provide retry time');
  });
});

test('New API Endpoints - File Structure Validation', async (t) => {
  await t.test('All new API route files exist', () => {
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
      assert.ok(fs.existsSync(fullPath), `Route file should exist: ${r}`);
    });
  });

  await t.test('All route files have auth middleware and proper exports', () => {
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
      assert.ok(content.includes('withApiMiddleware'), `Route should use withApiMiddleware: ${r}`);
      assert.ok(
        content.includes('export async function POST') || content.includes('export async function GET'),
        `Route should export POST or GET handler: ${r}`
      );
    });
  });

  await t.test('Service files export expected classes', () => {
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
        assert.ok(
          content.includes(`export class ${exp}`) || content.includes(`export { ${exp}`),
          `Service ${file} should export ${exp}`
        );
      });
    });
  });

  await t.test('Supabase CRM migration file exists with correct schema', () => {
    const migrationPath = path.join(cwd, 'supabase/migrations/20260511_crm_schema.sql');
    assert.ok(fs.existsSync(migrationPath), 'CRM migration should exist');
    const content = fs.readFileSync(migrationPath, 'utf-8');
    assert.ok(content.includes('crm_customers'), 'Migration should create crm_customers table');
    assert.ok(content.includes('crm_segments'), 'Migration should create crm_segments table');
    assert.ok(content.includes('crm_interactions'), 'Migration should create crm_interactions table');
    assert.ok(content.includes('enable row level security'), 'Migration should enable RLS');
  });

  await t.test('API documentation exists with endpoint coverage', () => {
    const docPath = path.join(cwd, 'docs/API_REFERENCE.md');
    assert.ok(fs.existsSync(docPath), 'API docs should exist');
    const content = fs.readFileSync(docPath, 'utf-8');
    assert.ok(content.includes('/api/ecommerce/shopify'), 'Docs should cover Shopify endpoint');
    assert.ok(content.includes('/api/predictive'), 'Docs should cover predictive endpoint');
    assert.ok(content.includes('/api/crm'), 'Docs should cover CRM endpoint');
    assert.ok(content.includes('/api/spatial/models'), 'Docs should cover spatial models');
    assert.ok(content.includes('/api/interactive'), 'Docs should cover interactive content');
    assert.ok(content.includes('/api/compliance'), 'Docs should cover compliance');
  });
});

test('New API Endpoints - Settings Page', async (t) => {
  await t.test('Settings page has new tab sections', () => {
    const content = fs.readFileSync(
      path.join(cwd, 'app/(app)/settings/page.tsx'), 'utf-8'
    );
    assert.ok(content.includes("'ecommerce'"), 'Should have ecommerce tab');
    assert.ok(content.includes("'compliance'"), 'Should have compliance tab');
    assert.ok(content.includes("'crm'"), 'Should have CRM tab');
    assert.ok(content.includes('shopifyStoreUrl'), 'Should have Shopify URL field');
    assert.ok(content.includes('complianceRegions'), 'Should have compliance regions');
    assert.ok(content.includes('blockedTopics'), 'Should have blocked topics field');
  });
});

test('API Middleware - Unit Tests', async (t) => {
  await t.test('rateLimit utility respects window boundaries', () => {
    const { rateLimit, clearRateLimit } = require('../lib/utils/rateLimit.ts');
    clearRateLimit('window-test');

    const r1 = rateLimit({ maxRequests: 2, windowMs: 5000, key: 'window-test' });
    assert.ok(r1.allowed);
    assert.equal(r1.remaining, 1);

    const r2 = rateLimit({ maxRequests: 2, windowMs: 5000, key: 'window-test' });
    assert.ok(r2.allowed);
    assert.equal(r2.remaining, 0);

    const r3 = rateLimit({ maxRequests: 2, windowMs: 5000, key: 'window-test' });
    assert.ok(!r3.allowed);
    assert.equal(r3.remaining, 0);
  });

  await t.test('clearRateLimit resets store', () => {
    const { rateLimit, clearRateLimit, getRateLimitStatus } = require('../lib/utils/rateLimit.ts');
    clearRateLimit('clear-test');
    rateLimit({ maxRequests: 5, windowMs: 60000, key: 'clear-test' });
    assert.ok(getRateLimitStatus('clear-test'), 'Should have entry before clear');
    clearRateLimit('clear-test');
    assert.equal(getRateLimitStatus('clear-test'), undefined, 'Should not have entry after clear');
  });
});
