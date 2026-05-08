import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const approvalRoute = await read('app/api/approval/route.ts');
assert.equal(
  (approvalRoute.match(/userData\?\.role !== 'admin'|userData\.role !== 'admin'/g) || []).length,
  2,
  'approval GET and POST must enforce admin role checks'
);

const middleware = await read('middleware.ts');
assert.match(
  middleware,
  /catch \(error\)[\s\S]*NextResponse\.redirect\(new URL\('\/login'/,
  'middleware auth errors must redirect instead of allowing protected access'
);
assert.match(
  middleware,
  /catch \(error\)[\s\S]*NextResponse\.next\(\)/,
  'middleware auth errors on login/auth pages must not dead-end the user'
);

const proxyRoute = await read('app/api/proxy/route.ts');
assert.doesNotMatch(
  proxyRoute,
  /proceeding anyway for testing/,
  'proxy must not bypass authentication for testing'
);
assert.match(
  proxyRoute,
  /buildPinnedTargetUrl/,
  'proxy fetches must use a URL pinned to the validated DNS result'
);
assert.match(
  proxyRoute,
  /\^ff\[0-9a-f\]\{2\}:/,
  'proxy must block the IPv6 ff00::/8 multicast range'
);

const draftsRoute = await read('app/api/drafts/route.ts');
assert.match(
  draftsRoute,
  /Supabase not configured' \}, \{ status: 503 \}/,
  'drafts GET must fail when Supabase is unavailable'
);
assert.doesNotMatch(
  draftsRoute,
  /demo-draft|demo-user|sanitizeDemoDraft/,
  'drafts route must not return fake demo drafts'
);

const socialUpdateRoute = await read('app/api/social/update-status/route.ts');
assert.doesNotMatch(
  socialUpdateRoute,
  /demo:\s*true|ENABLE_DEMO_MODE/,
  'social update must not return fake demo success'
);

const memoryService = await read('lib/services/memoryService.ts');
assert.match(
  memoryService,
  /saveCloudBrandKit\(brandKit\)\.catch\(\(\) => false\)/,
  'saveBrandKit must preserve cloud failure behavior'
);
assert.match(
  memoryService,
  /Promise\.all\(\[[\s\S]*PATHS\.brandKit[\s\S]*saveCloudBrandKit/,
  'saveBrandKit must save local and cloud copies in parallel'
);
for (const expected of [
  /writeFile\(path, draft\)\.catch\(\(\) => false\)/,
  /writeFile\(settingsPath, settings\)\.catch\(\(\) => false\)/,
  /writeFile\(historyPath, trimmed\)\.catch\(\(\) => false\)/,
  /writeFile\(historyPath, \[\]\)\.catch\(\(\) => false\)/,
]) {
  assert.match(memoryService, expected, 'parallel local writes must catch failures consistently');
}

const vectorMemoryService = await read('lib/services/vectorMemoryService.ts');
assert.match(
  vectorMemoryService,
  /Cannot save memory - Supabase not configured[\s\S]*return false/,
  'vector memory save must return false when Supabase is unavailable'
);
assert.match(
  vectorMemoryService,
  /Cannot query memory - Supabase not configured[\s\S]*agent/,
  'vector memory query must fail clearly when Supabase is unavailable'
);
assert.match(
  vectorMemoryService,
  /Cannot clear memory - Supabase not configured/,
  'vector memory clear must log missing Supabase'
);

const planService = await read('lib/services/planService.ts');
assert.match(
  planService,
  /requireSupabase[\s\S]*Supabase not configured/,
  'plan service must fail fast when Supabase is unavailable'
);

const supabaseClient = await read('supabase/client.ts');
assert.match(
  supabaseClient,
  /function getSupabaseClient/,
  'nullable browser Supabase client must have an explicit throwing accessor'
);

const authCallback = await read('app/auth/callback/route.ts');
assert.match(
  authCallback,
  /NextResponse\.redirect\(new URL\('\/error\?message=auth_config_error'/,
  'auth callback config errors must redirect to a browser page'
);

const workerRoute = await read('app/api/worker/route.ts');
assert.match(
  workerRoute,
  /@supabase\/ssr/,
  'worker route must use @supabase/ssr auth helpers'
);
assert.match(
  workerRoute,
  /result\.error \|\| !result\.data\.user/,
  'worker route must reject Supabase auth errors and missing users'
);

const workerProcessRoute = await read('app/api/worker/process/route.ts');
assert.match(
  workerProcessRoute,
  /export async function POST\(\)/,
  'worker process route must mutate state via POST, not GET'
);
assert.doesNotMatch(
  workerProcessRoute,
  /export async function GET\(\)/,
  'worker process route must not expose state mutation as GET'
);

const activateRoute = await read('app/api/activate/route.ts');
assert.match(
  activateRoute,
  /result\.error[\s\S]*Unauthorized/,
  'activation route must reject Supabase auth errors'
);

const performanceService = await read('lib/services/performanceService.ts');
assert.match(
  performanceService,
  /getSupabaseOrNull/,
  'performance service must expose nullable Supabase access separately'
);
assert.match(
  performanceService,
  /requireSupabaseThrowing/,
  'performance service throwing Supabase access must be named explicitly'
);

const evolutionRoute = await read('app/api/evolution/route.ts');
assert.match(
  evolutionRoute,
  /catch \(error\)[\s\S]*Authentication error/,
  'evolution auth helper must log swallowed authentication errors'
);
assert.doesNotMatch(
  evolutionRoute,
  /Demo mode|proceed without auth/,
  'evolution route must not allow unauthenticated demo access'
);

for (const path of [
  'app/api/approval/route.ts',
  'app/api/drafts/route.ts',
  'app/api/proxy/route.ts',
  'app/api/social/update-status/route.ts',
  'app/api/worker/route.ts',
  'app/api/worker/monitor/route.ts',
  'app/api/agent/reflect/route.ts',
  'app/api/activate/route.ts',
  'app/api/orchestrator/route.ts',
]) {
  const source = await read(path);
  assert.doesNotMatch(
    source,
    /demo mode|demo:\s*true|demo-user|demo-draft|mock admin|proceeding anyway|proceed without auth/i,
    `${path} must not contain fake/demo live behavior`
  );
}
