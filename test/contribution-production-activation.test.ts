import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { contributionActivation, contributionsActive, verifiedContributionActivation } from '../src/contributions/policy.ts';
import { contributionRequest } from '../src/contributions/http.ts';
import { ContributionRepository } from '../src/contributions/repository.ts';
import { SESSION_COOKIE } from '../src/participants/auth.ts';
import type { Query, Row } from '../src/participants/database.ts';
import { GET } from '../app/api/yawrd/[projectId]/[action]/route.ts';

// Invented role/credentials, NOT evidence of the actual Production login.
const role = 'synthetic_release_runtime';
const url = `postgresql://${role}:synthetic@ep-restless-frost-aoun3ads.us-east-1.aws.neon.tech/neondb?sslmode=require`;
const valid = (): Record<string, string | undefined> => ({ NODE_ENV: 'production',
  YAWRD_ENABLE_YAW001_CONTRIBUTIONS: '1', YAWRD_APP_ORIGIN: 'https://yawrd.keelbase.io', DATABASE_URL: url });
const gates = ['migrationVerified', 'permissionsVerified', 'databaseTestsVerified', 'recipientPolicyApproved', 'taskMappingVerified', 'submissionSignatureVerified'] as const;
const ledger = { version: '006_yaw001_contribution_events.sql', checksum: 'b555fc6271ab9635fd30dd9737207175bee0ba397443b0a55c7e3c92f6129c30' };
function body(file: string, name: string) {
  return readFileSync(new URL(file, import.meta.url), 'utf8').match(new RegExp('CREATE FUNCTION yawrd\\.' + name + '\\(\\)[\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;'))![1];
}
const insertGuard = body('../docs/proposals/migrations/006_yaw001_contribution_events.sql', 'check_yaw001_contribution_event');
const immutabilityGuard = body('../migrations/001_participants.sql', 'prevent_mutation');
function schemaFixture(): Row {
  const columns = ['network', 'project_id', 'task_ref', 'event_kind', 'pr_url', 'pr_head_sha', 'merge_commit_sha',
    'actor_account_id', 'application_id', 'description', 'recipient_account_id', 'consent_version',
    'historical_accepted_on', 'historical_accepted_at', 'historical_acceptance_evidence', 'recorded_at', 'request_event_kind'];
  return { durable_table: true, columns, types: columns.map(name => name === 'application_id' ? 'uuid' : name === 'historical_accepted_on' ? 'date'
    : name === 'historical_accepted_at' || name === 'recorded_at' ? 'timestamp with time zone' : 'text'), nullability: true,
    generated_link: "CASE WHEN (event_kind = 'acknowledgement'::text) THEN 'request'::text ELSE NULL::text END",
    validated_constraints: true, payload_constraints: true, event_key: true, evidence_key: true, project_fk: true,
    application_fk: true, matching_request_fk: true, indexes_ready: true, enabled_guards: true, event_permissions: true,
    insert_guard: insertGuard, immutability_guard: immutabilityGuard };
}
function harness() {
  const state = { identity: [{ database_name: 'neondb', current_role: role, login_role: role, restricted: true,
    no_ownership_or_ddl: true, auth_permissions: true, ledger_read_only: true }] as Row[],
    ledger: [{ ...ledger }] as Row[], schema: [schemaFixture()] as Row[],
    errorAt: 0, calls: [] as { text: string; values: unknown[] }[] };
  const query: Query = async (text, values = []) => {
    state.calls.push({ text, values });
    assert.match(text, /^SELECT /);
    if (state.errorAt === state.calls.length) throw new Error('PRIVATE_DATABASE_SENTINEL');
    if (text.startsWith('SELECT current_database()')) return state.identity;
    if (text.startsWith('SELECT version, checksum')) { assert.deepEqual(values, [ledger.version]); return state.ledger; }
    assert.match(text, /^SELECT c.relkind/);
    return state.schema;
  };
  return { state, query };
}
function closed(policy: Awaited<ReturnType<typeof verifiedContributionActivation>>) {
  assert.equal(contributionsActive(policy), false);
  for (const key of gates) assert.equal(policy[key], false, key);
}
async function rejected(env: Record<string, string | undefined>) {
  const h = harness();
  closed(await verifiedContributionActivation(h.query, env));
  assert.equal(h.state.calls.length, 0, 'wrong Production configuration must not connect');
}

for (const flag of [undefined, '', '0', 'true']) test(`Production opt-in ${JSON.stringify(flag)} stays inactive without a query`, async () => {
  await rejected({ ...valid(), YAWRD_ENABLE_YAW001_CONTRIBUTIONS: flag });
});
for (const origin of [undefined, 'http://yawrd.keelbase.io', 'https://yawrd.keelbase.io/', 'https://yawrd.keelbase.io:444',
  'https://other.keelbase.io', 'http://localhost:3000', 'https://user:password@yawrd.keelbase.io']) test(`Production origin ${origin ?? 'missing'} is rejected`, async () => {
  await rejected({ ...valid(), YAWRD_APP_ORIGIN: origin });
});
for (const [name, connection] of [
  ['Development endpoint', url.replace('ep-restless-frost-aoun3ads', 'ep-twilight-voice-aorpfrbm')],
  ['other endpoint', url.replace('ep-restless-frost-aoun3ads', 'ep-other')],
  ['non-Neon host', url.replace('.neon.tech', '.example.com')],
  ['wrong database', url.replace('/neondb?', '/other?')], ['owner login', url.replace(role, 'neondb_owner')],
  ['encoded owner login', url.replace(role, 'neondb_%6fwner')], ['postgres login', url.replace(role, 'postgres')],
  ['missing TLS', url.replace('?sslmode=require', '')], ['disabled TLS', url.replace('sslmode=require', 'sslmode=disable')],
  ['duplicate TLS', url + '&sslmode=disable'], ['session override', url + '&options=-crole%3Dneondb_owner'],
  ['wrong protocol', url.replace('postgresql:', 'https:')], ['wrong port', url.replace('.tech/', '.tech:5433/')],
  ['missing password', url.replace(':synthetic@', '@')], ['fragment', url + '#fragment'], ['invalid URL', 'invalid'],
] as const) test(`Production ${name} is rejected before connection`, async () => {
  await rejected({ ...valid(), DATABASE_URL: connection });
});
test('Production rejects missing and conflicting URLs and cannot use the Development branch as a fallback', async () => {
  await rejected({ ...valid(), DATABASE_URL: undefined });
  await rejected({ ...valid(), YAWRD_DATABASE_URL: url.replace('synthetic@', 'other@') });
  await rejected({ ...valid(), NODE_ENV: 'development', YAWRD_APP_ORIGIN: 'http://localhost:3000', YAWRD_ALLOW_HTTP_LOCALHOST: '1' });
});
for (const variant of ['direct', 'pooled', 'verify-full', 'fallback', 'identical URLs', 'different restricted role'] as const) test(`Production ${variant} requires role, ledger and schema proof`, async () => {
  const env = valid(), h = harness();
  if (variant === 'pooled') env.DATABASE_URL = url.replace('aoun3ads.', 'aoun3ads-pooler.');
  if (variant === 'verify-full') env.DATABASE_URL = url.replace('sslmode=require', 'sslmode=verify-full') + '&channel_binding=require';
  if (variant === 'fallback') { env.DATABASE_URL = undefined; env.YAWRD_DATABASE_URL = url; }
  if (variant === 'identical URLs') env.YAWRD_DATABASE_URL = url;
  if (variant === 'different restricted role') {
    env.DATABASE_URL = url.replace(role, 'another_synthetic_runtime');
    h.state.identity[0].current_role = h.state.identity[0].login_role = 'another_synthetic_runtime';
  }
  closed(contributionActivation(env));
  const policy = await verifiedContributionActivation(h.query, env);
  assert.equal(contributionsActive(policy), true);
  assert.equal(h.state.calls.length, 3);
  for (const gate of gates) assert.equal(policy[gate], true, gate);
  assert.deepEqual(policy.owners, { 'task-a': null, 'task-b': 'keelbase1.testnet' });
});
for (const change of [{ database_name: 'other' }, { current_role: 'neondb_owner' }, { login_role: 'neondb_owner' },
  { restricted: false }, { no_ownership_or_ddl: false }, { auth_permissions: false }, { ledger_read_only: false }]) test(`Production identity/grants ${JSON.stringify(change)} fails closed`, async () => {
  const h = harness(); Object.assign(h.state.identity[0], change);
  closed(await verifiedContributionActivation(h.query, valid()));
  assert.equal(h.state.calls.length, 1);
});
test('Production rejects missing or ambiguous actual runtime identity', async () => {
  for (const ambiguous of [false, true]) {
    const h = harness(); h.state.identity = ambiguous ? [...h.state.identity, ...h.state.identity] : [];
    closed(await verifiedContributionActivation(h.query, valid()));
  }
});
test('Production rejects missing, duplicated, wrong-version and wrong-checksum 006 entries', async () => {
  for (const rows of [[], [{ ...ledger }, { ...ledger }], [{ ...ledger, version: '005_other.sql' }], [{ ...ledger, checksum: '0'.repeat(64) }]]) {
    const h = harness(); h.state.ledger = rows;
    closed(await verifiedContributionActivation(h.query, valid()));
    assert.equal(h.state.calls.length, 2);
  }
});
for (const key of ['durable_table', 'nullability', 'validated_constraints', 'payload_constraints', 'event_key', 'evidence_key',
  'project_fk', 'application_fk', 'matching_request_fk', 'indexes_ready', 'enabled_guards', 'event_permissions']) test(`Production schema ${key} failure stays inactive`, async () => {
  const h = harness(); h.state.schema[0][key] = false;
  closed(await verifiedContributionActivation(h.query, valid()));
});
test('Production requires actual schema columns, types, generated link and reviewed guard bodies', async () => {
  for (const change of [{ columns: [] }, { types: [] }, { generated_link: null }, { generated_link: "'request'::text" },
    { insert_guard: 'BEGIN RETURN NEW; END;' }, { immutability_guard: 'BEGIN RETURN NEW; END;' }]) {
    const h = harness(); Object.assign(h.state.schema[0], change);
    closed(await verifiedContributionActivation(h.query, valid()));
  }
  const h = harness(); h.state.schema = [];
  closed(await verifiedContributionActivation(h.query, valid()));
});
test('Production proof is fresh per request and configuration changes during verification close activation', async () => {
  const h = harness(), env = valid();
  assert.equal(contributionsActive(await verifiedContributionActivation(h.query, env)), true);
  h.state.ledger = [];
  closed(await verifiedContributionActivation(h.query, env));
  const other = harness();
  closed(await verifiedContributionActivation(async (text, values) => {
    const result = await other.query(text, values);
    if (other.state.calls.length === 3) env.YAWRD_APP_ORIGIN = 'https://other.example';
    return result;
  }, env));
});
test('Production query failures, including denied ledger access, preserve sanitized inactive HTTP behavior', async () => {
  for (const errorAt of [1, 2, 3]) {
    const h = harness(); h.state.errorAt = errorAt;
    const activation = await verifiedContributionActivation(h.query, valid());
    closed(activation);
    const response = await contributionRequest(new Request('https://yawrd.keelbase.io/api/yawrd/yaw-001/contributions', {
      headers: { host: 'yawrd.keelbase.io', cookie: `${SESSION_COOKIE}=${'b'.repeat(43)}` },
    }), 'yaw-001', new ContributionRepository(h.query, activation), 'https://yawrd.keelbase.io');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'contributions_inactive' });
    assert.equal(h.state.calls.length, errorAt);
  }
});

for (const missingMigration of [false, true]) test(`actual Production route checks its own adapter offline; missing migration=${missingMigration}`, async () => {
  const env = valid(), h = harness();
  if (missingMigration) h.state.ledger = [];
  const names = [...Object.keys(env), 'YAWRD_DATABASE_URL'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  let reads = 0;
  try {
    for (const name of names) {
      if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
    }
    globalThis.fetch = async (_input, init) => {
      const { query, params } = JSON.parse(String(init?.body));
      assert.match(query, /^SELECT /);
      reads++;
      let rows: Row[];
      if (query.startsWith('SELECT s.account_id')) rows = [{ account_id: 'keelbase1.testnet', application_id: 'synthetic-approved-application', decision: 'approved' }];
      else if (query.startsWith('SELECT e.task_ref')) rows = [];
      else rows = await h.query(query, params);
      const first = rows[0] ?? {};
      return Response.json({ fields: Object.entries(first).map(([name, value]) => ({ name,
        dataTypeID: typeof value === 'boolean' ? 16 : Array.isArray(value) ? 1009 : 25 })),
      rows: rows.map(row => Object.values(row).map(value => typeof value === 'boolean' ? (value ? 't' : 'f')
        : Array.isArray(value) ? '{' + value.map(item => JSON.stringify(item)).join(',') + '}' : value)), rowCount: rows.length });
    };
    const response = await GET(new Request('https://yawrd.keelbase.io/api/yawrd/yaw-001/contributions', {
      headers: { host: 'yawrd.keelbase.io', cookie: `${SESSION_COOKIE}=${'b'.repeat(43)}` },
    }), { params: Promise.resolve({ projectId: 'yaw-001', action: 'contributions' }) });
    assert.equal(response.status, missingMigration ? 503 : 200);
    const result = await response.json();
    if (missingMigration) assert.deepEqual(result, { error: 'contributions_inactive' });
    else { assert.equal(result.accountId, 'keelbase1.testnet'); assert.equal(result.tasks[0].ref, 'task-b'); }
    assert.equal(reads, missingMigration ? 2 : 5);
  } finally {
    globalThis.fetch = previousFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  }
});
