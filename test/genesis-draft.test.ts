import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { GENESIS_YAW_001 as genesis, matchesGenesisProject } from '../src/genesis/yaw-001.ts';
import { ParticipantRepository } from '../src/participants/repository.ts';
import { participantRequest } from '../src/participants/http.ts';
import { SESSION_COOKIE, hashToken } from '../src/participants/auth.ts';
import type { Query, Row } from '../src/participants/database.ts';

const origin = 'https://yawrd.example';
const token = 'a'.repeat(43);
const timestamp = new Date('2026-11-03T00:00:00.123Z');
type Session = { accountId: string; network: string; expired: boolean; revoked: boolean };
function canonicalRow(): Row {
  return {
    id: 'yaw-001', network: 'testnet', creator_account_id: 'yawrd1.testnet',
    dao_account_id: 'demo.factory.yawrd.testnet', name: genesis.name,
    description: genesis.description, objectives: [...genesis.objectives],
    participation: genesis.participation, rewards: genesis.rewards,
    published_at: null, created_at: timestamp,
  };
}

// In-memory adapter models sessions and one winner for both uniqueness keys.
// It does not execute SQL or prove PostgreSQL locking, constraints or privileges.
function harness() {
  const state = {
    session: { accountId: 'yawrd1.testnet', network: 'testnet', expired: false, revoked: false } as Session | null,
    rows: [] as Row[], queries: [] as { text: string; args: unknown[] }[],
    beforeInsert: null as (() => void) | null,
    beforeStatus: null as (() => void) | null,
    failure: false,
  };
  const query: Query = async (text, args = []) => {
    state.queries.push({ text, args });
    if (state.failure) throw new Error('PRIVATE_DATABASE_DETAILS');
    if (text.startsWith('SELECT id, network')) {
      return state.rows.filter(p => p.id === args[0] && p.network === 'testnet' && p.published_at !== null);
    }
    const insert = text.startsWith('INSERT INTO yawrd.projects');
    assert.ok(insert || text.startsWith('SELECT s.account_id, p.id'), 'only Genesis insert/status queries are expected');
    if (insert) state.beforeInsert?.();
    else state.beforeStatus?.();
    const s = state.session;
    if (args[1] !== hashToken(token) || !s || s.expired || s.revoked || s.network !== 'testnet') return [];
    if (insert) {
      if (s.accountId !== args[3]) return [];
      if (!state.rows.some(p => p.network === 'testnet' && (p.id === args[0] || p.dao_account_id === args[2]))) {
        state.rows.push({
          id: args[0], network: 'testnet', creator_account_id: s.accountId, dao_account_id: args[2],
          name: args[4], description: args[5], objectives: JSON.parse(String(args[6])),
          participation: args[7], rewards: args[8], published_at: null, created_at: timestamp,
        });
      }
      return [];
    }
    const projects = s.accountId === args[3]
      ? state.rows.filter(p => p.network === 'testnet' && (p.id === args[0] || p.dao_account_id === args[2])) : [];
    return projects.length ? projects.map(p => ({ ...p, account_id: s.accountId })) : [{ account_id: s.accountId, id: null }];
  };
  return { state, query, repo: new ParticipantRepository(query) };
}
function request(method = 'POST', data: unknown = {}, options: { token?: string | null; origin?: string; host?: string; site?: string; search?: string } = {}) {
  return new Request(`${origin}/api/yawrd/yaw-001/genesis-draft${options.search ?? ''}`, {
    method, headers: {
      host: options.host ?? 'yawrd.example', origin: options.origin ?? origin,
      'sec-fetch-site': options.site ?? 'same-origin', 'content-type': 'application/json',
      cookie: options.token === null ? '' : `${SESSION_COOKIE}=${options.token ?? token}`,
    }, ...(method === 'GET' ? {} : { body: JSON.stringify(data) }),
  });
}
function call(repo: ParticipantRepository, method = 'POST', data: unknown = {}, id = 'yaw-001', options = {}) {
  return participantRequest(request(method, data, options), id, 'genesis-draft', repo, origin);
}

test('Genesis descriptor pins accepted identity/evidence and freezes every nested value', () => {
  assert.equal(genesis.reference, 'YAW-001');
  assert.equal(genesis.id, 'yaw-001');
  assert.equal(genesis.name, 'YAW-001 — Build Progress');
  assert.equal(genesis.tagline, 'Building Yawrd, together.');
  assert.equal(genesis.participation, 'Applications are reviewed by the project creator. Participation requires separate authorization.');
  assert.equal(genesis.network, 'testnet');
  assert.equal(genesis.creatorAccountId, 'yawrd1.testnet');
  assert.equal(genesis.daoAccountId, 'demo.factory.yawrd.testnet');
  assert.equal(genesis.factoryAccountId, 'factory.yawrd.testnet');
  assert.equal(genesis.blueprint.version, 'Approved Genesis Blueprint V1');
  assert.equal(genesis.publicRepository, 'vandigital/yawrd-build-progress');
  assert.equal(genesis.creationTransaction, 'GGvuLJcNNEQseQT4LE5uan7apN9gk7ff3WbEHZ4UKip');
  assert.equal(genesis.hardeningTransaction, '4Hpa1DLq6okCSyDid9mCGjxq44qPKrq2hgEERT1eEuc9');
  assert.ok(Object.isFrozen(genesis) && Object.isFrozen(genesis.objectives) && Object.isFrozen(genesis.blueprint));
  assert.throws(() => Object.assign(genesis, { creatorAccountId: 'forged.testnet' }), TypeError);
  assert.throws(() => Object.assign(genesis.objectives, { 0: 'forged' }), TypeError);
  assert.throws(() => Object.assign(genesis.blueprint, { version: 'forged' }), TypeError);
  assert.ok(genesis.name.length <= 120 && genesis.description.length <= 2000);
});

test('creator status is empty before linking; first link returns one unpublished canonical record', async () => {
  const { repo, state } = harness();
  assert.deepEqual(await (await call(repo, 'GET')).json(), { linked: false, project: null });
  state.queries.length = 0;
  const response = await call(repo);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.linked, true);
  assert.deepEqual(result.project, {
    id: 'yaw-001', network: 'testnet', creatorAccountId: 'yawrd1.testnet',
    daoAccountId: 'demo.factory.yawrd.testnet', name: genesis.name,
    description: genesis.description, objectives: [...genesis.objectives],
    participation: genesis.participation, rewards: genesis.rewards,
    publishedAt: null, createdAt: timestamp.toISOString(),
  });
  assert.equal(state.rows.length, 1);
  assert.equal(state.rows[0].published_at, null);
  assert.equal(state.queries.length, 2);
  assert.ok(state.queries[0].text.startsWith('INSERT'), 'no read-then-insert sequence');
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('set-cookie'), null);
});

for (const method of ['GET', 'POST']) {
  test(`${method}: anonymous/malformed-cookie callers receive no unpublished information or database access`, async () => {
    for (const value of [null, 'bad-token']) {
      const { repo, state } = harness();
      state.rows.push(canonicalRow());
      const response = await call(repo, method, {}, 'yaw-001', { token: value });
      assert.equal(response.status, value === null ? 401 : 400);
      assert.doesNotMatch(await response.text(), /Build Progress|demo\.factory|description/);
      assert.equal(state.queries.length, 0);
    }
    const { repo, state } = harness();
    await assert.rejects(method === 'GET' ? repo.genesisStatus(null) : repo.linkGenesis(null), /sign_in_required/);
    assert.equal(state.queries.length, 0);
  });
  for (const kind of ['missing', 'expired', 'revoked', 'wrong-network', 'non-creator'] as const) {
    test(`${method}: ${kind} session cannot access or create a Genesis draft`, async () => {
      const { repo, state } = harness();
      if (kind === 'missing') state.session = null;
      else if (kind === 'expired') state.session!.expired = true;
      else if (kind === 'revoked') state.session!.revoked = true;
      else if (kind === 'wrong-network') state.session!.network = 'mainnet';
      else state.session!.accountId = 'yawrd.testnet'; // Steward status alone is insufficient.
      const response = await call(repo, method);
      assert.equal(response.status, kind === 'non-creator' ? 403 : 401);
      assert.deepEqual(await response.json(), { error: kind === 'non-creator' ? 'creator_only' : 'sign_in_required' });
      assert.equal(state.rows.length, 0);
      state.rows.push(canonicalRow());
      const existing = JSON.stringify(state.rows);
      assert.equal((await call(repo, method)).status, kind === 'non-creator' ? 403 : 401);
      assert.equal(JSON.stringify(state.rows), existing);
    });
  }
}

test('identical sequential retries preserve original fields and timestamp through a fresh repository', async () => {
  const { repo, state, query } = harness();
  const first = await (await call(repo)).json();
  const original = JSON.stringify(state.rows);
  const fresh = new ParticipantRepository(query);
  assert.deepEqual(await (await call(fresh)).json(), first);
  assert.deepEqual(await (await call(fresh, 'GET')).json(), first);
  assert.equal(JSON.stringify(state.rows), original);
  assert.equal(state.rows.length, 1);
});

test('concurrent identical requests have one logical winner in the mock; SQL constraints remain unverified', async () => {
  const { repo, state } = harness();
  const responses = await Promise.all(Array.from({ length: 12 }, () => call(repo)));
  assert.ok(responses.every(r => r.status === 200));
  const results = await Promise.all(responses.map(r => r.json()));
  assert.ok(results.every(r => JSON.stringify(r) === JSON.stringify(results[0])));
  assert.equal(state.rows.length, 1);
});

test('stored identity, public content, publication state and alternate-ID DAO conflicts return 409 without reassignment', async () => {
  const conflicts: Partial<Row>[] = [
    { creator_account_id: 'other.testnet' }, { dao_account_id: 'other.factory.yawrd.testnet' },
    { dao_account_id: null }, { id: 'another-project' }, { name: 'Different' },
    { description: 'Different' }, { objectives: [] }, { objectives: [...genesis.objectives, 'Extra'] },
    { objectives: [...genesis.objectives].reverse() }, { participation: 'Different' },
    { rewards: 'Different' }, { published_at: timestamp },
  ];
  for (const mutation of conflicts) {
    const { repo, state } = harness();
    state.rows.push({ ...canonicalRow(), ...mutation });
    const original = JSON.stringify(state.rows);
    for (const method of ['GET', 'POST']) {
      const response = await call(repo, method);
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: 'genesis_conflict' });
      assert.equal(JSON.stringify(state.rows), original);
    }
  }
});

test('separate conflicting ID and DAO records also fail without overwriting either', async () => {
  const { repo, state } = harness();
  state.rows.push({ ...canonicalRow(), dao_account_id: 'other.testnet' }, { ...canonicalRow(), id: 'another-project' });
  const original = JSON.stringify(state.rows);
  assert.equal((await call(repo)).status, 409);
  assert.equal(JSON.stringify(state.rows), original);
});

test('status serialization allowlists stored fields and accepts Neon Date or textual timestamps', async () => {
  for (const created_at of [timestamp, timestamp.toISOString()]) {
    const { repo, state } = harness();
    state.rows.push({ ...canonicalRow(), created_at, restricted_content: 'PRIVATE_SENTINEL', applications: ['PRIVATE_SENTINEL'] });
    const response = await call(repo, 'GET');
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.doesNotMatch(text, /PRIVATE_SENTINEL|"(?:restricted_content|applications|token|signature)":/);
    assert.equal(JSON.parse(text).project.createdAt, timestamp.toISOString());
  }
});

test('forged browser identity, receipts, evidence and publication fields are rejected before queries', async () => {
  const fields = ['projectId', 'id', 'network', 'creatorAccountId', 'creator_account_id', 'daoAccountId',
    'dao_account_id', 'factoryAccountId', 'blueprint', 'approval', 'creationTransaction', 'hardeningTransaction',
    'receipt', 'localStorage', 'publishedAt', 'published_at', 'name', 'description'];
  for (const field of fields) {
    const { repo, state } = harness();
    assert.equal((await call(repo, 'POST', { [field]: 'forged' })).status, 400);
    for (const method of ['GET', 'POST']) {
      assert.equal((await call(repo, method, {}, 'yaw-001', { search: `?${field}=forged` })).status, 400);
    }
    assert.equal(state.queries.length, 0);
  }
});

test('fixed Genesis route rejects other IDs and keeps dev-yaw-001 fixtures separate', async () => {
  const { repo, state } = harness();
  state.rows.push({ ...canonicalRow(), id: 'dev-yaw-001', dao_account_id: null });
  const fixture = JSON.stringify(state.rows[0]);
  for (const method of ['GET', 'POST']) {
    for (const id of ['dev-yaw-001', 'YAW-001', 'another-project', '../yaw-001', genesis.daoAccountId]) {
      assert.equal((await call(repo, method, {}, id)).status, 404);
    }
  }
  assert.equal(state.queries.length, 0);
  assert.equal((await call(repo)).status, 200);
  assert.equal(state.rows.length, 2);
  assert.equal(JSON.stringify(state.rows[0]), fixture);
});

test('origin, host, fetch metadata, method and request limits reuse the existing HTTP boundary', async () => {
  const { repo, state } = harness();
  for (const method of ['GET', 'POST']) {
    for (const options of [{ host: 'evil.example' }, { site: 'cross-site' }]) {
      assert.equal((await call(repo, method, {}, 'yaw-001', options)).status, 403);
    }
  }
  assert.equal((await call(repo, 'POST', {}, 'yaw-001', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(repo, 'DELETE')).status, 405);
  assert.equal((await participantRequest(request(), 'yaw-001', 'genesis-draft', repo, null)).status, 503);
  const base = request();
  for (const raw of ['{', 'null', '[]']) {
    assert.equal((await participantRequest(new Request(base.url, { method: 'POST', headers: base.headers, body: raw }), 'yaw-001', 'genesis-draft', repo, origin)).status, 400);
  }
  assert.equal((await call(repo, 'POST', { value: 'x'.repeat(9000) })).status, 413);
  assert.equal(state.queries.length, 0);
});

test('authorization is rechecked at insert and at status read, including loss during the request', async () => {
  const { repo, state } = harness();
  state.beforeInsert = () => { state.session!.revoked = true; };
  assert.equal((await call(repo)).status, 401);
  assert.equal(state.rows.length, 0);
  const h = harness();
  h.state.beforeStatus = () => { h.state.session!.revoked = true; };
  const response = await call(h.repo);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'sign_in_required' });
  // A completed authorized insert is not undone by subsequent session expiry.
  assert.equal(h.state.rows.length, 1);
  assert.equal(h.state.rows[0].published_at, null);
});

test('database errors (including inactive migration/grants) remain sanitized', async () => {
  const { repo, state } = harness();
  state.failure = true;
  for (const method of ['GET', 'POST']) {
    const response = await call(repo, method);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'service_unavailable' });
  }
});

test('write/read SQL binds live sessions, fixed linkage and both uniqueness keys without mutation or publication', async () => {
  const { repo, state } = harness();
  await call(repo);
  const [insert, status] = state.queries;
  for (const query of [insert, status]) {
    assert.match(query.text, /s\.token_hash = \$2 AND s\.network = 'testnet' AND s\.revoked_at IS NULL AND s\.expires_at > clock_timestamp\(\)/);
    assert.match(query.text, /s\.account_id = \$4/);
    assert.deepEqual(query.args.slice(0, 4), ['yaw-001', hashToken(token), 'demo.factory.yawrd.testnet', 'yawrd1.testnet']);
    assert.doesNotMatch(query.text, /\bUPDATE\b|\bDELETE\b/);
  }
  assert.match(insert.text, /SELECT 'testnet', \$1, s\.account_id/);
  assert.match(insert.text, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(insert.text, /published_at|created_at|DO UPDATE/);
  assert.match(status.text, /\(p\.id = \$1 OR p\.dao_account_id = \$3\) AND s\.account_id = \$4/);
  assert.equal(await repo.project('yaw-001'), null, 'existing public reader cannot discover the draft');
});

test('draft execution never publishes; the separate publication action requires explicit consent', async () => {
  const { repo, state } = harness();
  for (const action of ['publish', 'publishGenesis']) {
    assert.equal((await participantRequest(request(), 'yaw-001', action, repo, origin)).status, 405);
  }
  assert.equal(state.queries.length, 0);
  assert.equal((await participantRequest(request(), 'yaw-001', 'genesis-publish', repo, origin)).status, 400);
  assert.equal(state.queries.length, 0);
  await call(repo);
  assert.equal(state.rows[0].published_at, null);
  assert.ok(state.queries.every(query => !query.text.startsWith('UPDATE')));
  for (const file of ['../src/genesis/yaw-001.ts', '../src/participants/repository.ts', '../src/participants/http.ts']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /CreationRpc|CreationFlow|createTestnetRpc|localStorage|fetch\(|signAndSend/);
  }
});

test('inactive 003 draft retains nullable associations, unique DAO linkage and existing identity trigger guards', () => {
  const draft = readFileSync(new URL('../docs/proposals/migrations/003_genesis_draft_linking.sql', import.meta.url), 'utf8');
  const original = readFileSync(new URL('../migrations/001_participants.sql', import.meta.url), 'utf8');
  assert.deepEqual(readdirSync(new URL('../migrations/', import.meta.url)).sort(), ['001_participants.sql', '003_genesis_draft_linking.sql']);
  assert.match(draft, /ADD COLUMN dao_account_id text,/);
  assert.doesNotMatch(draft, /dao_account_id text NOT NULL|CREATE TABLE|GRANT |UPDATE yawrd\.projects/);
  assert.match(draft, /dao_account_id IS NULL OR/);
  assert.match(draft, /dao_account_id ~ '\^\[a-z0-9\]\+\(\[\._-\]\[a-z0-9\]\+\)\*\$'/);
  assert.match(draft, /length\(dao_account_id\) BETWEEN 2 AND 64/);
  assert.match(draft, /UNIQUE \(network, dao_account_id\)/);
  assert.match(draft, /CREATE OR REPLACE FUNCTION yawrd\.protect_creator\(\)/);
  for (const field of ['network', 'id', 'creator_account_id', 'dao_account_id']) {
    assert.ok(draft.includes(`NEW.${field} IS DISTINCT FROM OLD.${field}`));
  }
  assert.match(original, /PRIMARY KEY \(network, id\)/);
  assert.match(original, /CREATE TRIGGER immutable_project_identity BEFORE UPDATE ON yawrd\.projects FOR EACH ROW EXECUTE FUNCTION yawrd\.protect_creator\(\)/);
  assert.match(original, /published_at timestamptz,/); // Omitted INSERT column defaults to NULL.
});

test('prepared runtime opt-in grants only draft INSERT columns and verifies publication/update denials', () => {
  const configure = readFileSync(new URL('../scripts/configure-development-runtime.mjs', import.meta.url), 'utf8');
  const verify = readFileSync(new URL('../scripts/verify-runtime.mjs', import.meta.url), 'utf8');
  const grants = [...configure.matchAll(/GRANT INSERT \(([^)]+)\)\s+ON yawrd\.projects TO yawrd_07b_runtime/g)];
  assert.equal(grants.length, 1);
  assert.deepEqual(grants[0][1].split(',').map(s => s.trim()), ['network', 'id', 'creator_account_id', 'dao_account_id', 'name', 'description', 'objectives', 'participation', 'rewards']);
  assert.match(configure, /if \(process\.env\.YAWRD_ENABLE_GENESIS_DRAFT_LINKING === '1'\)/);
  assert.match(configure, /REVOKE INSERT \(network, id, creator_account_id, dao_account_id/);
  assert.doesNotMatch(configure, /GRANT UPDATE[^`]*ON yawrd\.projects/);
  assert.match(verify, /genesisDraftLinking = false/);
  assert.match(verify, /projects: \[\]/);
  assert.match(verify, /projects\.\$\{row\.column_name\} INSERT/);
  assert.match(verify, /insert-published-project/);
});
