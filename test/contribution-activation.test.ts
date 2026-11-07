import assert from 'node:assert/strict';
import test from 'node:test';
import { contributionActivation, contributionsActive, verifiedContributionActivation } from '../src/contributions/policy.ts';
import { ContributionRepository } from '../src/contributions/repository.ts';
import { contributionRequest } from '../src/contributions/http.ts';
import { SESSION_COOKIE } from '../src/participants/auth.ts';
import type { Query, Row } from '../src/participants/database.ts';
import { GET } from '../app/api/yawrd/[projectId]/[action]/route.ts';

// Synthetic connection strings only. Every identity query uses an offline double.
const connection = 'postgresql://yawrd_07b_runtime:synthetic@ep-twilight-voice-aorpfrbm.us-east-1.aws.neon.tech/neondb?sslmode=require';
const valid = () => ({ NODE_ENV: 'development', YAWRD_ENABLE_YAW001_CONTRIBUTIONS: '1',
  YAWRD_APP_ORIGIN: 'http://localhost:3000', YAWRD_ALLOW_HTTP_LOCALHOST: '1',
  DATABASE_URL: connection } as Record<string, string | undefined>);
const identity = () => ({ database_name: 'neondb', current_role: 'yawrd_07b_runtime', login_role: 'yawrd_07b_runtime' });
const gates = ['migrationVerified', 'permissionsVerified', 'databaseTestsVerified', 'recipientPolicyApproved', 'taskMappingVerified', 'submissionSignatureVerified'] as const;

function harness(rows: Row[] = [identity()]) {
  const statements: string[] = [];
  const query: Query = async (text, values = []) => {
    statements.push(text);
    assert.match(text, /^SELECT current_database\(\)/);
    assert.match(text, /current_user AS current_role, session_user AS login_role/);
    assert.deepEqual(values, []);
    return rows;
  };
  return { statements, query };
}
function closed(policy: ReturnType<typeof contributionActivation>) {
  assert.equal(contributionsActive(policy), false);
  for (const gate of gates) assert.equal(policy[gate], false, gate);
}
async function rejected(env: Record<string, string | undefined>) {
  const h = harness();
  closed(await verifiedContributionActivation(h.query, env));
  assert.equal(h.statements.length, 0, 'invalid configuration must not connect');
}

for (const flag of [undefined, '', '0', 'true']) test(`missing or non-explicit opt-in ${JSON.stringify(flag)} stays closed without querying`, async () => {
  await rejected({ ...valid(), YAWRD_ENABLE_YAW001_CONTRIBUTIONS: flag });
});
for (const mode of [undefined, 'production', 'test']) test(`Development configuration cannot activate with NODE_ENV=${mode ?? 'missing'}`, async () => {
  await rejected({ ...valid(), NODE_ENV: mode });
});

for (const origin of [undefined, 'https://yawrd.example', 'http://127.0.0.1:3000', 'http://localhost:3000/', 'http://localhost:3000/path', 'http://user:pass@localhost:3000', 'ftp://localhost']) test(`origin ${origin ?? 'missing'} stays closed`, async () => {
  await rejected({ ...valid(), YAWRD_APP_ORIGIN: origin });
});
test('HTTP localhost requires the existing HTTP opt-in', async () => {
  await rejected({ ...valid(), YAWRD_ALLOW_HTTP_LOCALHOST: undefined });
});

for (const [name, url] of [
  ['another endpoint', connection.replace('ep-twilight-voice-aorpfrbm', 'ep-production')],
  ['non-Neon host', connection.replace('.neon.tech', '.example.org')],
  ['wrong database', connection.replace('/neondb?', '/production?')],
  ['owner role', connection.replace('yawrd_07b_runtime:', 'neondb_owner:')],
  ['another role', connection.replace('yawrd_07b_runtime:', 'other_runtime:')],
  ['encoded owner role', connection.replace('yawrd_07b_runtime:', 'neondb_%6fwner:')],
  ['missing TLS', connection.replace('?sslmode=require', '')],
  ['disabled TLS', connection.replace('sslmode=require', 'sslmode=disable')],
  ['duplicate TLS options', connection + '&sslmode=disable'],
  ['session options', connection + '&options=-crole%3Dneondb_owner'],
  ['database override', connection + '&database=production'],
  ['wrong protocol', connection.replace('postgresql:', 'https:')],
  ['wrong port', connection.replace('.tech/', '.tech:5433/')],
  ['missing password', connection.replace(':synthetic@', '@')],
  ['fragment', connection + '#ignored'],
  ['malformed URL', 'invalid'],
] as const) test(`${name} is rejected before any database access`, async () => {
  await rejected({ ...valid(), DATABASE_URL: url });
});
test('missing URL and conflicting effective database settings are rejected', async () => {
  await rejected({ ...valid(), DATABASE_URL: undefined });
  await rejected({ ...valid(), YAWRD_DATABASE_URL: connection.replace('synthetic', 'other') });
});
test('a caller-controlled endpoint pin cannot redirect activation', async () => {
  await rejected({ ...valid(), YAWRD_DEV_DATABASE_ENDPOINT: 'ep-production' });
  await rejected({ ...valid(), YAWRD_DEV_DATABASE_ENDPOINT: 'ep-production', DATABASE_URL: connection.replace('ep-twilight-voice-aorpfrbm', 'ep-production') });
});

for (const variant of ['direct', 'pooled', 'verify-full', 'fallback URL', 'identical URLs', 'explicit pin', 'HTTPS localhost'] as const) test(`valid Development ${variant} activates only after the app connection verifies all three identities`, async () => {
  const env = valid();
  if (variant === 'pooled') env.DATABASE_URL = connection.replace('aorpfrbm.', 'aorpfrbm-pooler.');
  if (variant === 'verify-full') env.DATABASE_URL = connection.replace('sslmode=require', 'sslmode=verify-full') + '&channel_binding=require';
  if (variant === 'fallback URL') { env.DATABASE_URL = undefined; env.YAWRD_DATABASE_URL = connection; }
  if (variant === 'identical URLs') env.YAWRD_DATABASE_URL = connection;
  if (variant === 'explicit pin') env.YAWRD_DEV_DATABASE_ENDPOINT = 'ep-twilight-voice-aorpfrbm';
  if (variant === 'HTTPS localhost') { env.YAWRD_APP_ORIGIN = 'https://localhost:3000'; env.YAWRD_ALLOW_HTTP_LOCALHOST = undefined; }
  closed(contributionActivation(env));
  const h = harness();
  const policy = await verifiedContributionActivation(h.query, env);
  assert.equal(h.statements.length, 1);
  assert.equal(contributionsActive(policy), true);
  for (const gate of gates) assert.equal(policy[gate], true, gate);
  assert.deepEqual(policy.owners, { 'task-a': null, 'task-b': 'keelbase1.testnet' });
});

for (const changed of [
  { database_name: 'production' }, { current_role: 'neondb_owner' }, { login_role: 'neondb_owner' },
  { current_role: null }, { login_role: null },
]) test(`live connection identity mismatch ${JSON.stringify(changed)} keeps every readiness gate closed`, async () => {
  const h = harness([{ ...identity(), ...changed }]);
  closed(await verifiedContributionActivation(h.query, valid()));
  assert.equal(h.statements.length, 1);
});
test('missing or ambiguous connection identity cannot enable contributions', async () => {
  for (const rows of [[], [identity(), identity()]]) closed(await verifiedContributionActivation(harness(rows).query, valid()));
});
test('identity decisions are not cached across requests', async () => {
  const env = valid();
  let calls = 0;
  const query: Query = async () => ++calls === 1 ? [identity()] : [{ ...identity(), login_role: 'neondb_owner' }];
  assert.equal(contributionsActive(await verifiedContributionActivation(query, env)), true);
  closed(await verifiedContributionActivation(query, env));
  assert.equal(calls, 2);
});
for (const change of ['opt-in', 'mode', 'database', 'origin'] as const) test(`configuration ${change} changed while identity was pending fails closed`, async () => {
  const env = valid();
  const query: Query = async () => {
    if (change === 'opt-in') env.YAWRD_ENABLE_YAW001_CONTRIBUTIONS = '0';
    if (change === 'mode') env.NODE_ENV = 'production';
    if (change === 'database') env.DATABASE_URL = connection.replace('/neondb?', '/production?');
    if (change === 'origin') env.YAWRD_APP_ORIGIN = 'https://public.example';
    return [identity()];
  };
  closed(await verifiedContributionActivation(query, env));
});
test('each accepted gate is still required within the verified Development boundary', async () => {
  const policy = await verifiedContributionActivation(harness().query, valid());
  for (const gate of gates) assert.equal(contributionsActive({ ...policy, [gate]: false }), false, gate);
});

test('connection failures preserve sanitized inactive responses for request and acknowledgement without reaching writes', async () => {
  let calls = 0;
  const query: Query = async () => { calls++; throw new Error('PRIVATE_CONNECTION_SENTINEL'); };
  const activation = await verifiedContributionActivation(query, valid());
  closed(activation);
  const repo = new ContributionRepository(query, activation);
  for (const data of [{ kind: 'request' }, { kind: 'challenge', submission: {} },
    { kind: 'acknowledgement', taskRef: 'task-b', prUrl: '', evidence: '', historicalAcceptedOn: null, historicalAcceptedAt: null, consent: true, consentVersion: '' }]) {
    const response = await contributionRequest(new Request('http://localhost:3000/api/yawrd/yaw-001/contributions', {
      method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json',
        cookie: `${SESSION_COOKIE}=${'b'.repeat(43)}` }, body: JSON.stringify(data),
    }), 'yaw-001', repo, 'http://localhost:3000');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'contributions_inactive' });
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  }
  assert.equal(calls, 1, 'only the identity SELECT was attempted');
});

for (const mismatch of [false, true]) test(`actual route verifies the application adapter before contribution access; identity mismatch=${mismatch}`, async () => {
  const env = valid();
  const names = [...Object.keys(env), 'YAWRD_DATABASE_URL', 'YAWRD_DEV_DATABASE_ENDPOINT'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const queries: string[] = [];
  try {
    for (const name of names) {
      if (env[name] === undefined) delete process.env[name];
      else process.env[name] = env[name];
    }
    // Exercise the actual lazy Neon adapter; replace its transport, not the
    // activation function or repository. Only SELECT statements are permitted.
    globalThis.fetch = async (_input, init) => {
      const { query } = JSON.parse(String(init?.body)) as { query: string };
      queries.push(query);
      assert.match(query, /^SELECT /);
      let row: Row | undefined;
      if (query.startsWith('SELECT current_database()')) row = { ...identity(), login_role: mismatch ? 'neondb_owner' : 'yawrd_07b_runtime' };
      else if (query.startsWith('SELECT s.account_id')) row = { account_id: 'keelbase1.testnet', application_id: '00000000-0000-4000-8000-000000000002', decision: 'approved' };
      else assert.match(query, /^SELECT e.task_ref/);
      return Response.json({ fields: Object.keys(row ?? {}).map(name => ({ name, dataTypeID: 25 })),
        rows: row ? [Object.values(row)] : [], rowCount: row ? 1 : 0 });
    };
    const response = await GET(new Request('http://localhost:3000/api/yawrd/yaw-001/contributions', {
      headers: { host: 'localhost:3000', cookie: `${SESSION_COOKIE}=${'b'.repeat(43)}` },
    }), { params: Promise.resolve({ projectId: 'yaw-001', action: 'contributions' }) });
    assert.equal(response.status, mismatch ? 503 : 200);
    const result = await response.json();
    if (mismatch) {
      assert.deepEqual(result, { error: 'contributions_inactive' });
      assert.equal(queries.length, 1);
    } else {
      assert.equal(result.accountId, 'keelbase1.testnet');
      assert.equal(result.tasks[0].ref, 'task-b');
      assert.equal(result.tasks[0].request, null);
      assert.equal(queries.length, 3);
    }
    assert.ok(queries[0].startsWith('SELECT current_database()'));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
