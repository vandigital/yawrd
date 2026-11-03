import assert from 'node:assert/strict';
import test from 'node:test';
import { GENESIS_YAW_001 as g, GENESIS_PUBLICATION_CONSENT_VERSION, matchesGenesisIdentity, matchesGenesisProject } from '../src/genesis/yaw-001.ts';
import { ParticipantRepository } from '../src/participants/repository.ts';
import { participantRequest } from '../src/participants/http.ts';
import { SESSION_COOKIE, hashToken } from '../src/participants/auth.ts';
import type { Query, Row } from '../src/participants/database.ts';

const origin = 'https://yawrd.example';
const token = 'a'.repeat(43);
const firstPublication = new Date('2026-11-03T08:00:00.123Z');
const consent = { consent: true, consentVersion: 'genesis-publication-v1' };
function canonical(): Row {
  return { id: 'yaw-001', network: 'testnet', creator_account_id: 'yawrd1.testnet', dao_account_id: 'demo.factory.yawrd.testnet',
    name: g.name, description: g.description, objectives: [...g.objectives], participation: g.participation, rewards: g.rewards,
    published_at: null, created_at: new Date('2026-11-03T00:00:00Z'), restricted_content: 'PRIVATE_SENTINEL' };
}

// Models the SQL predicates and one logical winner; does not execute PostgreSQL
// or prove grants, triggers, locking or EvalPlanQual behavior under concurrency.
function harness() {
  const state = { rows: [canonical()], accountId: 'yawrd1.testnet', network: 'testnet', expired: false, revoked: false,
    missing: false, permissionFailure: false, beforeWrite: null as (() => void) | null,
    mutations: 0, queries: [] as { text: string; args: unknown[] }[] };
  const query: Query = async (text, args = []) => {
    state.queries.push({ text, args });
    const update = text.startsWith('UPDATE yawrd.projects p SET published_at');
    assert.ok(update || text.startsWith('SELECT s.account_id, p.id'), 'only publication UPDATE or authorized fallback SELECT');
    if (update) {
      if (state.permissionFailure) throw Object.assign(new Error('PRIVATE_PERMISSION_DETAILS'), { code: '42501' });
      state.beforeWrite?.();
    }
    if (state.missing || state.expired || state.revoked || state.network !== 'testnet' || args[1] !== hashToken(token)) return [];
    if (update) {
      const p = state.rows.find(p => p.network === 'testnet' && p.id === args[0] && p.creator_account_id === state.accountId
        && state.accountId === args[3] && p.dao_account_id === args[2] && p.name === args[4] && p.description === args[5]
        && JSON.stringify(p.objectives) === args[6] && p.participation === args[7] && p.rewards === args[8] && p.published_at === null
        && !state.rows.some(other => other.network === p.network && other.dao_account_id === args[2] && other.id !== p.id));
      if (!p) return [];
      p.published_at = firstPublication;
      state.mutations++;
      return [{ published_at: p.published_at }];
    }
    const rows = state.accountId === args[3]
      ? state.rows.filter(p => p.network === 'testnet' && (p.id === args[0] || p.dao_account_id === args[2])) : [];
    return rows.length ? rows.map(p => ({ ...p, account_id: state.accountId })) : [{ account_id: state.accountId, id: null }];
  };
  return { state, repo: new ParticipantRepository(query) };
}
function request(method = 'POST', data: unknown = consent, options: { token?: string | null; host?: string; origin?: string; site?: string; search?: string } = {}) {
  return new Request(`${origin}/api/yawrd/yaw-001/genesis-publish${options.search ?? ''}`, {
    method, headers: { host: options.host ?? 'yawrd.example', origin: options.origin ?? origin,
      'sec-fetch-site': options.site ?? 'same-origin', 'content-type': 'application/json',
      cookie: options.token === null ? '' : `${SESSION_COOKIE}=${options.token ?? token}` },
    ...(method === 'GET' ? {} : { body: JSON.stringify(data) }),
  });
}
function call(repo: ParticipantRepository, data: unknown = consent, options = {}, id = 'yaw-001') {
  return participantRequest(request('POST', data, options), id, 'genesis-publish', repo, origin);
}

test('verified creator explicitly publishes the exact canonical project with a database timestamp', async () => {
  const { repo, state } = harness();
  const original = structuredClone(state.rows[0]);
  const response = await call(repo);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { published: true, projectId: 'yaw-001', network: 'testnet', publishedAt: firstPublication.toISOString() });
  assert.equal(state.mutations, 1);
  assert.equal(state.queries.length, 1);
  assert.deepEqual({ ...state.rows[0], published_at: null }, original);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('set-cookie'), null);
});

test('publication requires a distinct versioned affirmative consent, including direct repository calls', async () => {
  assert.equal(GENESIS_PUBLICATION_CONSENT_VERSION, 'genesis-publication-v1');
  for (const data of [{}, { ...consent, consent: false }, { ...consent, consent: 'true' }, { ...consent, consentVersion: 'participant-v1' }, { ...consent, consentVersion: null }]) {
    const { repo, state } = harness();
    assert.equal((await call(repo, data)).status, 400);
    assert.equal(state.queries.length, 0);
  }
  const { repo, state } = harness();
  await assert.rejects(repo.publishGenesis(hashToken(token), false, consent.consentVersion), /publication_consent_required/);
  await assert.rejects(repo.publishGenesis(hashToken(token), true, 'other-version'), /publication_consent_required/);
  assert.equal(state.queries.length, 0);
});

test('anonymous and malformed-cookie requests cannot publish or learn unpublished identity', async () => {
  for (const value of [null, 'malformed']) {
    const { repo, state } = harness();
    const response = await call(repo, consent, { token: value });
    assert.equal(response.status, value === null ? 401 : 400);
    assert.equal(state.queries.length, 0);
    assert.doesNotMatch(await response.text(), /Build Progress|PRIVATE_SENTINEL|factory/);
  }
  const { repo, state } = harness();
  await assert.rejects(repo.publishGenesis(null, true, consent.consentVersion), /sign_in_required/);
  assert.equal(state.queries.length, 0);
});

for (const kind of ['missing', 'expired', 'revoked', 'wrong-network', 'non-creator'] as const) {
  test(`${kind} server session cannot publish either a draft or an already published project`, async () => {
    for (const published_at of [null, firstPublication]) {
      const { repo, state } = harness();
      state.rows[0].published_at = published_at;
      if (kind === 'wrong-network') state.network = 'mainnet';
      else if (kind === 'non-creator') state.accountId = 'yawrd.testnet';
      else state[kind] = true;
      const response = await call(repo);
      assert.equal(response.status, kind === 'non-creator' ? 403 : 401);
      assert.equal(state.mutations, 0);
      assert.doesNotMatch(await response.text(), /publishedAt|PRIVATE_SENTINEL|factory/);
    }
  });
}

test('approved participation wording rejects an unreconciled legacy value without publication', async () => {
  assert.equal(g.participation, 'Applications are reviewed by the project creator. Participation requires separate authorization.');
  for (const published_at of [null, firstPublication]) {
    const { repo, state } = harness();
    state.rows[0].participation = 'Participant applications are not open for this unpublished project. Crew Member approval, agent association, GitHub access and contribution acceptance require separate authorization.';
    state.rows[0].published_at = published_at;
    const original = structuredClone(state.rows);
    assert.equal(matchesGenesisIdentity(state.rows[0]), false);
    assert.equal(matchesGenesisProject(state.rows[0]), false);
    const response = await call(repo);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'genesis_conflict' });
    assert.deepEqual(state.rows, original);
    assert.equal(state.mutations, 0);
  }
});

test('missing Genesis record is not inserted or published', async () => {
  const { repo, state } = harness();
  state.rows = [];
  const response = await call(repo);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
  assert.equal(state.rows.length, 0);
  assert.equal(state.mutations, 0);
});

test('every mismatched canonical identity/public field fails without publication or overwrite', async () => {
  for (const change of [
    { creator_account_id: 'other.testnet' }, { dao_account_id: 'other.testnet' }, { dao_account_id: null },
    { id: 'other-project' }, { name: 'Changed' }, { description: 'Changed' }, { objectives: [] },
    { objectives: [...g.objectives].reverse() }, { participation: 'Changed' }, { rewards: 'Changed' },
  ]) {
    for (const published_at of [null, firstPublication]) {
      const { repo, state } = harness();
      state.rows[0] = { ...state.rows[0], ...change, published_at };
      const original = structuredClone(state.rows);
      const response = await call(repo);
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), { error: 'genesis_conflict' });
      assert.deepEqual(state.rows, original);
      assert.equal(state.mutations, 0);
    }
  }
});

test('a wrong-network stored project is not eligible', async () => {
  const { repo, state } = harness();
  state.rows[0].network = 'mainnet';
  assert.equal((await call(repo)).status, 404);
  assert.equal(state.mutations, 0);
});

test('conflicting duplicate DAO identity cannot be published even in a corrupt fixture', async () => {
  const { repo, state } = harness();
  state.rows.push({ ...canonical(), id: 'other-project' });
  assert.equal((await call(repo)).status, 409);
  assert.equal(state.mutations, 0);
});

test('sequential retries and reload preserve the first timestamp without another mutation', async () => {
  const { repo, state } = harness();
  const first = await (await call(repo)).json();
  const before = structuredClone(state.rows);
  assert.deepEqual(await (await call(repo)).json(), first);
  assert.deepEqual(await (await call(new ParticipantRepository(repo.query))).json(), first);
  assert.equal(state.mutations, 1);
  assert.deepEqual(state.rows, before);
  assert.ok(state.queries.slice(1).some(q => q.text.startsWith('SELECT')));
});

test('concurrent mock requests preserve one timestamp; real PostgreSQL locking remains unverified', async () => {
  const { repo, state } = harness();
  const responses = await Promise.all(Array.from({ length: 12 }, () => call(repo)));
  assert.ok(responses.every(r => r.status === 200));
  const results = await Promise.all(responses.map(r => r.json()));
  assert.ok(results.every(r => r.publishedAt === firstPublication.toISOString()));
  assert.equal(state.mutations, 1);
});

test('authorization and public identity are rechecked at the atomic write', async () => {
  for (const drift of ['session', 'identity']) {
    const { repo, state } = harness();
    state.beforeWrite = () => { if (drift === 'session') state.revoked = true; else state.rows[0].description = 'Changed before write'; };
    assert.equal((await call(repo)).status, drift === 'session' ? 401 : 409);
    assert.equal(state.rows[0].published_at, null);
    assert.equal(state.mutations, 0);
  }
});

test('permission failure stays sanitized and cannot claim publication', async () => {
  const { repo, state } = harness();
  state.permissionFailure = true;
  const response = await call(repo);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'service_unavailable' });
  assert.equal(state.rows[0].published_at, null);
  assert.equal(state.mutations, 0);
});

test('request identity, evidence and timestamps cannot override server records', async () => {
  for (const field of ['id', 'projectId', 'creatorAccountId', 'network', 'daoAccountId', 'approval', 'receipt', 'publishedAt', 'published_at', 'name', 'description']) {
    const { repo, state } = harness();
    assert.equal((await call(repo, { ...consent, [field]: 'forged' })).status, 400);
    assert.equal(state.queries.length, 0);
  }
});

test('publication is POST-only, fixed-project and same-origin with existing request limits', async () => {
  const { repo, state } = harness();
  for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await participantRequest(request(method), g.id, 'genesis-publish', repo, origin)).status, 405);
  for (const options of [{ host: 'evil.example' }, { origin: 'https://evil.example' }, { site: 'cross-site' }]) assert.equal((await call(repo, consent, options)).status, 403);
  assert.equal((await call(repo, consent, { search: '?publishedAt=forged' })).status, 400);
  for (const id of ['dev-yaw-001', 'other-project', g.daoAccountId]) assert.equal((await call(repo, consent, {}, id)).status, 404);
  assert.equal((await call(repo, { ...consent, data: 'x'.repeat(9000) })).status, 413);
  assert.equal(state.queries.length, 0);
});

test('SQL guards all identity/public fields and sets only the first publication timestamp', async () => {
  const { repo, state } = harness();
  await call(repo);
  const update = state.queries[0];
  assert.equal(state.queries.length, 1, 'no preliminary read can authorize the update');
  assert.match(update.text, /^UPDATE yawrd\.projects p SET published_at = statement_timestamp\(\)/);
  assert.match(update.text, /s\.token_hash = \$2 AND s\.network = 'testnet' AND s\.revoked_at IS NULL AND s\.expires_at > clock_timestamp\(\)/);
  assert.match(update.text, /s\.account_id = \$4/);
  for (const guard of ["p.network = 'testnet'", 'p.id = $1', 'p.creator_account_id = s.account_id', 'p.creator_account_id = $4', 'p.dao_account_id = $3',
    'p.name = $5', 'p.description = $6', 'p.objectives = $7::jsonb', 'p.participation = $8', 'p.rewards = $9', 'p.published_at IS NULL', 'RETURNING p.published_at']) assert.ok(update.text.includes(guard), guard);
  assert.deepEqual(update.args.slice(0, 4), ['yaw-001', hashToken(token), 'demo.factory.yawrd.testnet', 'yawrd1.testnet']);
  assert.deepEqual(update.args.slice(4), [g.name, g.description, JSON.stringify(g.objectives), g.participation, g.rewards]);
  assert.doesNotMatch(update.text, /\bINSERT\b|\bDELETE\b|\bGRANT\b/);
});

test('publication identity comparison does not loosen unpublished draft validation', () => {
  const draft = canonical();
  assert.equal(matchesGenesisIdentity(draft), true);
  assert.equal(matchesGenesisProject(draft), true);
  const published = { ...draft, published_at: firstPublication };
  assert.equal(matchesGenesisIdentity(published), true);
  assert.equal(matchesGenesisProject(published), false);
  assert.equal(matchesGenesisIdentity({ ...published, rewards: 'forged' }), false);
});
