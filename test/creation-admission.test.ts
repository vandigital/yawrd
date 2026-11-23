// Offline route tests: synthetic sessions and an in-memory query double only.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { SESSION_COOKIE, hashToken } from '../src/participants/auth.ts';
import type { Query, Row } from '../src/participants/database.ts';
import { createEmptyYawrdIntakeDraft } from '../src/yawrd-intake.ts';

// Only this test process substitutes infrastructure; exported Next route handlers,
// admission, auth checks and Creation HTTP/repositories remain real.
const host = globalThis as typeof globalThis & { __r1Query: Query; __r1DatabaseGuard: () => string };
registerHooks({ load(url, context, next) {
  if (url === new URL('../src/participants/database.ts', import.meta.url).href)
    return { format: 'module', shortCircuit: true, source: 'export const database=(...args)=>globalThis.__r1Query(...args);' };
  if (url === new URL('../src/participants/database-config.ts', import.meta.url).href)
    return { format: 'module', shortCircuit: true, source: 'export const databaseUrl=()=>globalThis.__r1DatabaseGuard();export const developmentDatabaseUrl=databaseUrl;' };
  return next(url, context);
} });
const env = process.env as Record<string, string | undefined>;
const { founderAdmitted, withCreationAdmission } = await import('../src/creation/admission.ts');
const origin = 'https://yawrd.example', id = 'yawrd-aaaaaaaaaaaa';
const tokens = { founder: 'a'.repeat(43), other: 'b'.repeat(43), second: 'c'.repeat(43), expired: 'e'.repeat(43), replacement: 'r'.repeat(43) };
const identities = new Map([[hashToken(tokens.founder), 'founder.testnet'], [hashToken(tokens.other), 'other.testnet'],
  [hashToken(tokens.second), 'second.testnet'], [hashToken(tokens.replacement), 'founder.testnet']]);
type Method = 'GET' | 'POST' | 'PATCH';
type Route = Partial<Record<Method, (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> | Response>>;
const routes: { path: string; module: Route; methods: Method[] }[] = [];
for (const [path, methods] of [['', ['GET', 'POST']], ['[id]', ['GET', 'PATCH']], ['[id]/deployment', ['GET', 'POST']],
  ['[id]/platform-fee', ['GET', 'POST']], ['[id]/preparation', ['GET', 'POST']], ['[id]/contributions', ['GET', 'POST']],
  ['[id]/governance', ['GET', 'POST']], ['[id]/launch', ['GET', 'POST']], ['[id]/hardening', ['GET', 'POST']]] as const) {
  routes.push({ path, module: await import('../app/api/creations/' + (path ? path + '/' : '') + 'route.ts'), methods: [...methods] });
}
const admission: Route = await import('../app/api/creations/admission/route.ts');
const security: Route = await import('../app/api/creations/security/route.ts');
let queries: { sql: string; args: unknown[] }[] = [], row: Row, secondSteward = false, expire = false;
const intake = { ...createEmptyYawrdIntakeDraft('synthetic-source', '2026-11-23T00:00:00Z'), projectName: 'Saved synthetic project' };
const config = { publicName: 'Synthetic public name', publicDescription: 'Synthetic summary', accountLabel: '', secondSteward: '', threshold: 2 };
beforeEach(() => {
  env.NODE_ENV = 'development'; process.env.YAWRD_APP_ORIGIN = origin;
  for(const key of ['VERCEL_ENV','YAWRD_ENABLE_CREATION_TESTNET_BETA','YAWRD_CREATION_ENVIRONMENT']) delete env[key];
  process.env.YAWRD_CREATION_FOUNDER_ALLOWLIST = '["founder.testnet"]';
  delete process.env.YAWRD_ENABLE_CREATION_PLATFORM_FEE_PAYMENT;
  delete process.env.YAWRD_ENABLE_CREATION_PREPARATION;
  queries = []; secondSteward = false; expire = false;
  row = { id, founder_account_id: 'founder.testnet', source_draft_id: intake.draftId, revision: 1,
    initial_intake: intake, intake, public_name: '', public_description: '', account_label: '', second_steward: '',
    public_text_digest: '0'.repeat(64), reviewed_revision: null, created_at: new Date(), updated_at: new Date() };
  host.__r1DatabaseGuard = () => 'synthetic-unused-database';
  host.__r1Query = async (sql, args = []) => {
    queries.push({ sql, args }); const actor = expire ? undefined : identities.get(String(args[0]));
    if (sql.includes('FROM yawrd.sessions')) {
      assert.match(sql, /network\s*=\s*'testnet'/); assert.match(sql, /revoked_at IS NULL/); assert.match(sql, /expires_at\s*>\s*clock_timestamp/);
      return actor ? [{ account_id: actor, expires_at: new Date(Date.now() + 3600000) }] : [];
    }
    if (sql.startsWith('SELECT d.creation_id')) return secondSteward && args[0] === id && args[1] === 'second.testnet' ? [{ creation_id: id }] : [];
    if (sql.includes('creation_list')) return [{ ...row, display_name: 'Saved synthetic project' }];
    if (sql.includes('creation_find_start')) return [];
    if (sql.includes('creation_start')) { row.id = args[1]; return [structuredClone(row)]; }
    if (sql.includes('creation_read')) return actor === row.founder_account_id && args[1] === row.id ? [structuredClone(row)] : [];
    if (sql.includes('creation_save')) {
      if (actor !== row.founder_account_id) return [];
      row.revision = Number(row.revision) + 1; return [structuredClone(row)];
    }
    if (sql.includes('creation_deployment_read')) return [];
    // Existing handler denial after the narrow second-Steward admission probe.
    if (sql.includes('FROM yawrd.creation_deployments')) return [];
    assert.fail('Unexpected private/action query: ' + sql);
  };
});
const originalFetch = globalThis.fetch;
globalThis.fetch = (() => { assert.fail('No external transport is allowed in admission route tests'); }) as typeof fetch;
process.on('exit', () => { globalThis.fetch = originalFetch; });
function request(path: string, method: Method = 'GET', token: string | null = tokens.founder, account = 'founder.testnet', data: unknown = {}) {
  const appOrigin = env.YAWRD_APP_ORIGIN || origin;
  return new Request(appOrigin + '/api/creations' + (path ? '/' + path.replace('[id]', id) : ''), { method,
    headers: { host: new URL(appOrigin).host, origin: appOrigin, 'x-yawrd-account': account,
      ...(token ? { cookie: SESSION_COOKIE + '=' + token } : {}), ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}) },
    ...(method !== 'GET' ? { body: JSON.stringify(data) } : {}) });
}
const invoke = (route: Route, method: Method, req: Request) => route[method]!(req, { params: Promise.resolve({ id }) });

test('server-only configuration accepts exact Testnet identities and fails closed as a whole', () => {
  for (const value of [undefined, '', 'bad', '{}', 'null', '"founder.testnet"', '["*"]', '["founder.near"]',
    '["founder.testnet",null]', '["founder.testnet","Founder.testnet"]', '["founder.testnet","founder.testnet"]',
    '[" founder.testnet"]', JSON.stringify(Array.from({ length: 101 }, (_, i) => `f${i}.testnet`)), ' '.repeat(8193)]) {
    assert.equal(founderAdmitted('founder.testnet', { YAWRD_CREATION_FOUNDER_ALLOWLIST: value }), false, String(value).slice(0, 80));
  }
  assert.equal(founderAdmitted('founder.testnet', { YAWRD_CREATION_FOUNDER_ALLOWLIST: '[]' }), false);
  assert.equal(founderAdmitted('founder.testnet'), true); assert.equal(founderAdmitted('other.testnet'), false);
  assert.equal(founderAdmitted('founder.near'), false);
});

test('admission status uses the verified session, never the selected account or body', async () => {
  let response = await invoke(admission, 'GET', request('admission', 'GET', null));
  assert.deepEqual(await response.json(), { accountId: null, admitted: false, expiresAt: null });
  response = await invoke(admission, 'GET', request('admission', 'GET', tokens.other, 'founder.testnet'));
  const value = await response.json(); assert.equal(value.accountId, 'other.testnet'); assert.equal(value.admitted, false);
  assert.ok(Number.isFinite(value.expiresAt)); assert.doesNotMatch(JSON.stringify(value), /allowlist|private|public_key/);
  assert.match(response.headers.get('cache-control')!, /private, no-store/);
});

for (const scenario of ['signed-out', 'expired', 'unapproved', 'missing-config', 'invalid-config', 'mismatched'] as const) {
  test(`${scenario}: all exported founder routes deny before private reads, body consumption or RPC`, async () => {
    if (scenario === 'missing-config') delete process.env.YAWRD_CREATION_FOUNDER_ALLOWLIST;
    if (scenario === 'invalid-config') process.env.YAWRD_CREATION_FOUNDER_ALLOWLIST = '["founder.testnet",false]';
    const token = scenario === 'signed-out' ? null : scenario === 'expired' ? tokens.expired : scenario === 'unapproved' || scenario === 'mismatched' ? tokens.other : tokens.founder;
    const account = scenario === 'unapproved' ? 'other.testnet' : 'founder.testnet';
    const status = scenario === 'signed-out' || scenario === 'expired' ? 401 : scenario === 'mismatched' ? 409 : 403;
    for (const route of routes) for (const method of route.methods) {
      queries = []; const req = request(route.path, method, token, account, { action: 'publish', accountId: 'founder.testnet', admitted: true, proof: {} });
      const response = await invoke(route.module, method, req);
      assert.equal(response.status, status, route.path + ' ' + method); assert.equal(req.bodyUsed, false);
      assert.ok(queries.every(q => q.sql.includes('FROM yawrd.sessions') || q.sql.startsWith('SELECT d.creation_id')), route.path);
      assert.doesNotMatch(JSON.stringify(await response.json()), /Saved synthetic|source_draft|public_name|signature/);
    }
    assert.equal(row.revision, 1);
  });
}

test('approved founder can save and resume with a replacement verified session; no ownership shortcut', async () => {
  const root = routes.find(r => r.path === '')!.module, item = routes.find(r => r.path === '[id]')!.module;
  let response = await invoke(root, 'POST', request('', 'POST', tokens.founder, 'founder.testnet', { intake }));
  assert.equal(response.status, 200); const created = (await response.json()).creation;
  response = await invoke(root, 'GET', request('')); assert.equal((await response.json()).items[0].id, created.id);
  response = await item.GET!(new Request(request('[id]').url.replace(id, created.id), request('[id]', 'GET', tokens.replacement)), { params: Promise.resolve({ id: created.id }) });
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).creation.intake, intake);
  const patch = request('[id]', 'PATCH', tokens.replacement, 'founder.testnet', { expectedRevision: 1, configuration: config });
  response = await item.PATCH!(patch, { params: Promise.resolve({ id: created.id }) });assert.equal(response.status, 200);
  process.env.YAWRD_CREATION_FOUNDER_ALLOWLIST = '["founder.testnet","other.testnet"]';
  response = await item.GET!(request('[id]', 'GET', tokens.other, 'other.testnet'), { params: Promise.resolve({ id: created.id }) });assert.equal(response.status, 404);
});

test('admission preserves the existing deployment authorization and Production environment guards', async () => {
  const deployment = routes.find(r => r.path.endsWith('/deployment'))!;
  let response = await invoke(deployment.module, 'GET', request(deployment.path));
  assert.equal(response.status, 200); assert.equal((await response.json()).submissionEnabled, false);
  response = await invoke(deployment.module, 'POST', request(deployment.path, 'POST', tokens.founder, 'founder.testnet', { action: 'begin', expectedRevision: 1, intentRevision: 1, consent: true, consentVersion: 'synthetic' }));
  assert.equal(response.status, 403); assert.equal((await response.json()).error, 'deployment_not_authorized');
  env.NODE_ENV = 'production';
  for (const path of ['platform-fee','preparation','contributions','governance','launch','hardening']) {
    const route = routes.find(r => r.path.endsWith('/' + path))!;queries = [];
    response = await invoke(route.module, 'POST', request(route.path, 'POST'));
    assert.equal(response.status, 404, path);assert.deepEqual(queries, []);
  }
});

test('saved second Steward can enter only the security boundary, including absent founder configuration', async () => {
  delete process.env.YAWRD_CREATION_FOUNDER_ALLOWLIST; secondSteward = true;
  let called = false;
  const next = async () => { called = true; return Response.json({ securityOnly: true }); };
  const response = await withCreationAdmission(request('[id]/hardening', 'GET', tokens.second, 'second.testnet'), host.__r1Query, origin, next, id);
  assert.equal(response.status, 200); assert.equal(called, true);
  const hardening = routes.find(r => r.path === '[id]/hardening')!;
  const actual = await invoke(hardening.module, 'GET', request(hardening.path, 'GET', tokens.second, 'second.testnet'));
  assert.equal(actual.status, 404, 'admitted Steward still needs the original verified deployment binding');
  assert.equal((await actual.json()).error, 'creation_not_found');
  for (const path of ['[id]', '[id]/platform-fee', '[id]/deployment', '[id]/launch']) {
    const route = routes.find(r => r.path === path)!;
    assert.equal((await invoke(route.module, 'GET', request(path, 'GET', tokens.second, 'second.testnet'))).status, 403);
  }
  called = false; secondSteward = false;
  assert.equal((await withCreationAdmission(request('[id]/hardening', 'GET', tokens.second, 'second.testnet'), host.__r1Query, origin, next, id)).status, 403);
  assert.equal(called, false);
  const nav = await invoke(security, 'GET', request('security', 'GET', tokens.second, 'second.testnet'));
  assert.equal(nav.status, 200);
  const query = queries.findLast(q => q.sql.includes('ORDER BY c.id LIMIT 50'))!;
  assert.match(query.sql, /\$3 AND \$2=c.founder_account_id/); assert.deepEqual(query.args.slice(1), ['second.testnet', false]);
});

test('wrong Origin and revoked sessions fail before any private operation', async () => {
  const route = routes[0].module;
  let req = request('', 'POST');req.headers.set('origin', 'https://attacker.example');
  assert.equal((await invoke(route, 'POST', req)).status, 403);assert.deepEqual(queries, []);
  expire = true;assert.equal((await invoke(route, 'GET', request(''))).status, 401);
});

for (const mode of ['preview','production'] as const) test(`${mode}: real release route exports enforce admission without granting deployment`, async () => {
  Object.assign(env,{NODE_ENV:'production',VERCEL_ENV:mode,YAWRD_ENABLE_CREATION_TESTNET_BETA:'1',YAWRD_CREATION_ENVIRONMENT:mode+'-testnet',
    YAWRD_APP_ORIGIN:mode==='preview'?'https://yawrd-synthetic.vercel.app':'https://yawrd.keelbase.io',
    YAWRD_CREATION_DATABASE_ENDPOINT:'ep-'+mode+'-synthetic',YAWRD_CREATION_PRODUCTION_ENDPOINT:'ep-production-synthetic'});
  host.__r1DatabaseGuard=()=>`postgresql://yawrd_07b_runtime@ep-${mode}-synthetic.neon.tech/neondb?sslmode=require`;
  for(const route of routes)for(const method of route.methods){
    const req=request(route.path,method,tokens.other,'other.testnet');queries=[];
    const response=await invoke(route.module,method,req);assert.equal(response.status,403,route.path+' '+method);
    assert.equal(req.bodyUsed,false);assert.ok(queries.every(q=>q.sql.includes('FROM yawrd.sessions')||q.sql.startsWith('SELECT d.creation_id')));
  }
  const root=routes.find(r=>r.path==='')!.module;
  assert.equal((await invoke(root,'GET',request(''))).status,200);
  const deploy=routes.find(r=>r.path==='[id]/deployment')!.module;
  const view=await invoke(deploy,'GET',request('[id]/deployment'));assert.equal(view.status,200);assert.equal((await view.json()).submissionEnabled,false);
});
