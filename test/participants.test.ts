import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PersistentAuth, AUTH_RECIPIENT, BROWSER_COOKIE, SESSION_COOKIE, hashToken, sessionHash } from '../src/participants/auth.ts';
import { authRequest, participantRequest, configuredOrigin } from '../src/participants/http.ts';
import { ParticipantRepository } from '../src/participants/repository.ts';
import { PersistedYawrdPresentation } from '../app/components/persisted-yawrd.tsx';
import { serializeNep413 } from '../src/identity/nep413.ts';
import type { IdentityChallenge } from '../src/identity/types.ts';
import type { Query, Row } from '../src/participants/database.ts';
import type { ParticipantView } from '../src/participants/types.ts';
import { databaseUrl, developmentDatabaseUrl, developmentMigrationDatabaseUrl, integrationDatabaseUrl } from '../src/participants/database-config.ts';

test('migration credentials remain separate from runtime and require the confirmed development pin', () => {
  const migration = 'postgresql://synthetic:synthetic@ep-development-pooler.example.neon.tech/test?sslmode=require';
  assert.throws(() => developmentMigrationDatabaseUrl({ DATABASE_URL: migration, YAWRD_DEV_DATABASE_ENDPOINT: 'ep-development' }), /migration_database_unavailable/);
  const env = { DATABASE_URL: 'synthetic-runtime', YAWRD_MIGRATION_DATABASE_URL: migration, YAWRD_DEV_DATABASE_ENDPOINT: 'ep-development' };
  assert.equal(databaseUrl(env), 'synthetic-runtime');
  assert.equal(developmentMigrationDatabaseUrl(env), migration);
  assert.throws(() => developmentMigrationDatabaseUrl({ ...env, YAWRD_DEV_DATABASE_ENDPOINT: 'ep-other' }), /development_database_target_unconfirmed/);
});

test('confirmed localhost origin requires development mode and explicit HTTP opt-in; production requires HTTPS', () => {
  const names = ['NODE_ENV', 'YAWRD_APP_ORIGIN', 'YAWRD_ALLOW_HTTP_LOCALHOST'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    Object.assign(process.env, { NODE_ENV: 'development' });
    process.env.YAWRD_APP_ORIGIN = 'http://localhost:3000';
    process.env.YAWRD_ALLOW_HTTP_LOCALHOST = '1';
    assert.equal(configuredOrigin(), 'http://localhost:3000');
    process.env.YAWRD_ALLOW_HTTP_LOCALHOST = '0';
    assert.equal(configuredOrigin(), null);
    process.env.YAWRD_ALLOW_HTTP_LOCALHOST = '1';
    Object.assign(process.env, { NODE_ENV: 'production' });
    assert.equal(configuredOrigin(), null);
    process.env.YAWRD_APP_ORIGIN = 'https://yawrd.example';
    assert.equal(configuredOrigin(), 'https://yawrd.example');
    for (const invalid of ['http://127.0.0.1:3000', 'http://localhost:3000', 'https://yawrd.example/', 'https://user:pass@yawrd.example', 'https://yawrd.example/path']) {
      process.env.YAWRD_APP_ORIGIN = invalid;
      assert.equal(configuredOrigin(), null);
    }
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});

test('database configuration accepts the owner setting and refuses ambiguous or unconfirmed migration targets', () => {
  const url = 'postgresql://synthetic:synthetic@ep-development-pooler.example.neon.tech/test?sslmode=require';
  assert.equal(databaseUrl({ DATABASE_URL: url }), url);
  assert.equal(databaseUrl({ YAWRD_DATABASE_URL: url }), url);
  assert.throws(() => databaseUrl({}), /database_unavailable/);
  assert.throws(() => databaseUrl({ DATABASE_URL: url, YAWRD_DATABASE_URL: 'different' }), /database_configuration_conflict/);
  assert.throws(() => developmentDatabaseUrl({ DATABASE_URL: url }), /development_database_target_unconfirmed/);
  assert.throws(() => developmentDatabaseUrl({ DATABASE_URL: url, YAWRD_DEV_DATABASE_ENDPOINT: 'ep-production' }), /development_database_target_unconfirmed/);
  assert.equal(developmentDatabaseUrl({ DATABASE_URL: url, YAWRD_DEV_DATABASE_ENDPOINT: 'ep-development' }), url);
  for (const invalid of [url.replace('sslmode=require', 'sslmode=disable'), url.replace('.neon.tech', '.example.org'), 'invalid']) {
    assert.throws(() => developmentDatabaseUrl({ DATABASE_URL: invalid, YAWRD_DEV_DATABASE_ENDPOINT: 'ep-development' }));
  }
  assert.equal(integrationDatabaseUrl({ DATABASE_URL: url }), null);
  const development = { DATABASE_URL: url, YAWRD_DEV_DATABASE_ENDPOINT: 'ep-development', YAWRD_TEST_DATABASE_DEVELOPMENT: '1' };
  assert.equal(integrationDatabaseUrl(development), url);
  assert.throws(() => integrationDatabaseUrl({ ...development, YAWRD_DEV_DATABASE_ENDPOINT: 'ep-wrong' }));
  assert.throws(() => integrationDatabaseUrl({ ...development, YAWRD_TEST_DATABASE_DISPOSABLE: '1' }));
  assert.throws(() => integrationDatabaseUrl({ DATABASE_URL: url, YAWRD_TEST_DATABASE_URL: url.replace('-pooler.', '.'), YAWRD_DEV_DATABASE_ENDPOINT: 'ep-development', YAWRD_TEST_DATABASE_DISPOSABLE: '1' }), /disposable_database_matches_application/);
  const separate = url.replace('/test?', '/separate?');
  assert.equal(integrationDatabaseUrl({ DATABASE_URL: url, YAWRD_TEST_DATABASE_URL: separate, YAWRD_DEV_DATABASE_ENDPOINT: 'ep-development', YAWRD_TEST_DATABASE_DISPOSABLE: '1' }), separate);
  assert.throws(() => integrationDatabaseUrl({ DATABASE_URL: 'malformed-sensitive-setting', YAWRD_TEST_DATABASE_URL: separate, YAWRD_DEV_DATABASE_ENDPOINT: 'ep-development', YAWRD_TEST_DATABASE_DISPOSABLE: '1' }), error => error instanceof Error && error.message === 'invalid_application_database');
});

const origin = 'https://yawrd.example';
const token = 'a'.repeat(43);
const project = { id: 'test-project', network: 'testnet' as const, creatorAccountId: 'creator.testnet', name: 'Test project', description: 'Public description', objectives: ['An objective'], participation: 'Apply to contribute.', rewards: 'No rewards promised.' };
const publicView: ParticipantView = { accountId: null, role: 'public', application: null, applications: [], restrictedContent: null };
const viewRow = { account_id: null, is_creator: false, is_participant: false, applications: [], restricted_content: null };
const appRow = { id: '00000000-0000-4000-8000-000000000001', account_id: 'alice.testnet', introduction: 'Hello', decision: null, reviewer_account_id: null };
const pair = generateKeyPairSync('ed25519');
const raw = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let number = BigInt(`0x${raw.toString('hex')}`), encoded = '';
while (number) { encoded = alphabet[Number(number % BigInt(58))] + encoded; number /= BigInt(58); }
for (const byte of raw) { if (byte) break; encoded = '1' + encoded; }
const publicKey = `ed25519:${encoded}`;
function proof(c: IdentityChallenge) {
  return { accountId: c.accountId, publicKey, signature: sign(null, createHash('sha256').update(serializeNep413(c.message, Buffer.from(c.nonce, 'base64'), c.recipient)).digest(), pair.privateKey).toString('base64') };
}
function authHarness(options: { rpcError?: boolean; databaseError?: boolean; expiredDuringRpc?: boolean; timestampObjects?: boolean } = {}) {
  let now = options.timestampObjects ? Math.floor(Date.now() / 1000) * 1000 + 123 : Date.now(), rpcCalls = 0;
  let row: Row | null = null;
  const sessions: unknown[][] = [];
  const query: Query = async (text, args = []) => {
    if (options.databaseError) throw new Error('PRIVATE_DATABASE_ERROR');
    if (text.startsWith('WITH budget')) {
      row = { id: args[0], browser_hash: args[1], account_id: args[2], network: 'testnet', origin: args[3], message: args[4], recipient: args[5], nonce: args[6], issued_at: args[7], expires_at: args[8], consumed_at: null };
      if (options.timestampObjects) {
        row.issued_at = new Date(String(args[7]));
        row.expires_at = new Date(String(args[8]));
      }
      return [{ id: args[0] }];
    }
    if (text.startsWith('UPDATE yawrd.auth_challenges')) {
      if (!row || row.id !== args[0] || row.browser_hash !== args[1] || row.consumed_at) return [];
      row.consumed_at = new Date(now).toISOString();
      return [{ ...row }];
    }
    if (text.startsWith('WITH minted')) { sessions.push(args); return [{ account_id: row?.account_id }]; }
    if (text.startsWith('UPDATE yawrd.sessions')) return [];
    throw new Error('Unexpected test query');
  };
  const auth = new PersistentAuth(query, async () => {
    rpcCalls++;
    if (options.rpcError) throw new Error('RPC_INTERNAL_ERROR');
    if (options.expiredDuringRpc) now += 300000;
    return { blockHeight: 100, blockHash: '1'.repeat(32) };
  }, () => now);
  return { auth, query, sessions, rpcCalls: () => rpcCalls, expire: () => { now += 300000; } };
}
function req(action: string, data: object, options: { origin?: string; cookie?: string; site?: string; host?: string } = {}) {
  return new Request(`${origin}/api/auth/${action}`, { method: 'POST', headers: { host: options.host ?? 'yawrd.example', origin: options.origin ?? origin, 'sec-fetch-site': options.site ?? 'same-origin', 'content-type': 'application/json', cookie: options.cookie ?? '' }, body: JSON.stringify(data) });
}
async function issued(h = authHarness()) { const c = await h.auth.issue('alice.testnet', 'testnet', origin, token); return { h, c }; }

test('persistent auth uses a separate sign-in purpose and reuses accepted NEP-413 cryptography', async () => {
  const { h, c } = await issued();
  assert.equal(c.recipient, AUTH_RECIPIENT);
  assert.match(c.message, /Sign in to Yawrd for one hour/);
  assert.doesNotMatch(c.message, /local development only/);
  const result = await h.auth.verify(c.id, token, c.accountId, 'testnet', origin, proof(c), null);
  assert.equal(result.accountId, c.accountId);
  assert.equal(h.rpcCalls(), 1);
  assert.equal(h.sessions.length, 1);
  assert.equal(h.sessions[0][0], hashToken(result.token));
  assert.notEqual(h.sessions[0][0], result.token);
});

test('Neon Date timestamps retain the milliseconds used in the signed challenge', async () => {
  const h = authHarness({ timestampObjects: true });
  const challenge = await h.auth.issue('alice.testnet', 'testnet', origin, token);
  assert.equal(challenge.issuedAt % 1000, 123);
  const result = await h.auth.verify(challenge.id, token, challenge.accountId, 'testnet', origin, proof(challenge), null);
  assert.equal(result.accountId, challenge.accountId);
  assert.equal(h.sessions.length, 1);
});

test('single-use orchestration rejects replay and concurrent proof consumption', async () => {
  const { h, c } = await issued();
  const attempt = () => h.auth.verify(c.id, token, c.accountId, 'testnet', origin, proof(c), null);
  const results = await Promise.allSettled([attempt(), attempt()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(h.sessions.length, 1);
  await assert.rejects(attempt(), /unknown_challenge/);
});

for (const kind of ['signature', 'network', 'origin', 'account', 'expired', 'rpc', 'slow-rpc'] as const) {
  test(`persistent auth fails closed on ${kind} and issues no session`, async () => {
    const { h, c } = await issued(authHarness({ rpcError: kind === 'rpc', expiredDuringRpc: kind === 'slow-rpc' }));
    if (kind === 'expired') h.expire();
    await assert.rejects(h.auth.verify(c.id, token, kind === 'account' ? 'other.testnet' : c.accountId, kind === 'network' ? 'mainnet' : 'testnet', kind === 'origin' ? 'https://evil.example' : origin, kind === 'signature' ? { ...proof(c), signature: Buffer.alloc(64).toString('base64') } : proof(c), null));
    assert.equal(h.sessions.length, 0);
    await assert.rejects(h.auth.verify(c.id, token, c.accountId, 'testnet', origin, proof(c), null), /unknown_challenge/);
  });
}

test('browser mismatch cannot consume another browser challenge', async () => {
  const { h, c } = await issued();
  await assert.rejects(h.auth.verify(c.id, 'b'.repeat(43), c.accountId, 'testnet', origin, proof(c), null), /unknown_challenge/);
  await h.auth.verify(c.id, token, c.accountId, 'testnet', origin, proof(c), null);
});

test('HTTP authentication sets only opaque Secure HttpOnly cookies and rotates previous sessions', async () => {
  const h = authHarness();
  const challengeResponse = await authRequest(req('challenge', { accountId: 'alice.testnet', network: 'testnet' }), 'challenge', h.auth, origin);
  assert.equal(challengeResponse.status, 200);
  const binding = challengeResponse.headers.get('set-cookie')!.split(';')[0];
  assert.match(challengeResponse.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=Strict; Max-Age=300/);
  const { challenge } = await challengeResponse.json();
  const response = await authRequest(req('verify', { challengeId: challenge.id, accountId: challenge.accountId, network: 'testnet', proof: proof(challenge) }, { cookie: `${binding}; ${SESSION_COOKIE}=${token}` }), 'verify', h.auth, origin);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /__Host-yawrd_session=.*HttpOnly; Secure; SameSite=Strict; Max-Age=3600/);
  assert.doesNotMatch(JSON.stringify(await response.json()), /signature|token|publicKey/);
  assert.equal(h.sessions[0][5], hashToken(token));
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
});

test('mutation origin, host, fetch metadata and exact body checks happen before database access', async () => {
  const h = authHarness({ databaseError: true });
  for (const options of [{ origin: 'https://evil.example' }, { host: 'evil.example' }, { site: 'cross-site' }]) {
    const response = await authRequest(req('challenge', { accountId: 'alice.testnet', network: 'testnet' }, options), 'challenge', h.auth, origin);
    assert.equal(response.status, 403);
  }
  assert.equal((await authRequest(req('challenge', { accountId: 'alice.testnet', network: 'testnet', message: 'override' }), 'challenge', h.auth, origin)).status, 400);
  assert.equal((await authRequest(req('challenge', { accountId: 'alice.testnet', network: 'testnet' }), 'challenge', h.auth, null)).status, 503);
});

test('database failures are sanitized and never set an authentication cookie', async () => {
  const h = authHarness({ databaseError: true });
  const response = await authRequest(req('challenge', { accountId: 'alice.testnet', network: 'testnet' }), 'challenge', h.auth, origin);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.doesNotMatch(await response.text(), /PRIVATE_DATABASE_ERROR/);
});

test('logout revokes the hashed session before clearing secure cookies; database failure cannot claim logout', async () => {
  const writes: unknown[][] = [];
  const auth = new PersistentAuth(async (_, values = []) => { writes.push(values); return []; }, async () => { throw new Error(); });
  const response = await authRequest(req('logout', {}, { cookie: `${SESSION_COOKIE}=${token}` }), 'logout', auth, origin);
  assert.equal(response.status, 200);
  assert.deepEqual(writes, [[hashToken(token)]]);
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/);
  const failure = await authRequest(req('logout', {}, { cookie: `${SESSION_COOKIE}=${token}` }), 'logout', authHarness({ databaseError: true }).auth, origin);
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get('set-cookie'), null);
});

test('fixture and invalid project IDs never query persistent project data', async () => {
  const repo = new ParticipantRepository(async () => { assert.fail('must not query'); });
  for (const id of ['the-common-table', '../test', 'MAINNET', '']) assert.equal(await repo.project(id), null);
});

test('project mapping exposes only public columns and keeps network and creator identity', async () => {
  const repo = new ParticipantRepository(async () => [{ ...project, creator_account_id: project.creatorAccountId, restricted_content: 'PRIVATE_SENTINEL', arbitrary: 'PRIVATE_SENTINEL' }]);
  const result = await repo.project(project.id);
  assert.equal(result?.network, 'testnet');
  assert.equal(result?.creatorAccountId, project.creatorAccountId);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SENTINEL/);
});

test('non-creator view never serializes other applications and maps the current decision', async () => {
  const repo = new ParticipantRepository(async () => [{ ...viewRow, account_id: 'alice.testnet', applications: [appRow] }]);
  const view = await repo.view(project.id, hashToken(token));
  assert.equal(view.application?.status, 'pending');
  assert.deepEqual(view.applications, []);
  assert.equal(view.restrictedContent, null);
});

test('creator-only decisions fail for public, expired and participant sessions and reject conflicts', async () => {
  for (const [row, code] of [
    [viewRow, 'sign_in_required'],
    [{ ...viewRow, account_id: 'alice.testnet' }, 'creator_only'],
    [{ ...viewRow, account_id: 'creator.testnet', is_creator: true, applications: [{ ...appRow, decision: 'rejected', reviewer_account_id: 'creator.testnet' }] }, 'decision_conflict'],
  ] as const) {
    const repo = new ParticipantRepository(async text => text.startsWith('INSERT') ? [] : [row]);
    await assert.rejects(repo.review(project.id, hashToken(token), appRow.id, 'approved'), new RegExp(code));
  }
});

test('same-decision retry returns the recorded immutable result', async () => {
  const repo = new ParticipantRepository(async text => text.startsWith('INSERT') ? [] : [{ ...viewRow, account_id: 'creator.testnet', is_creator: true, applications: [{ ...appRow, decision: 'approved', reviewer_account_id: 'creator.testnet' }] }]);
  const result = await repo.review(project.id, hashToken(token), appRow.id, 'approved');
  assert.equal(result.applications[0].status, 'approved');
});

test('application requires explicit consent, bounded introduction, and no identity supplied by the browser', async () => {
  const repo = new ParticipantRepository(async () => { assert.fail('invalid input must not query'); });
  for (const [intro, consent] of [['', true], ['hello', false], ['x'.repeat(1001), true], [null, true], ['hello', 'true']]) {
    await assert.rejects(repo.apply(project.id, hashToken(token), intro, consent), /introduction_and_consent_required/);
  }
  const response = await participantRequest(req('apply', { introduction: 'hello', consent: true, accountId: 'creator.testnet' }, { cookie: `${SESSION_COOKIE}=${token}` }), project.id, 'apply', repo, origin);
  assert.equal(response.status, 400);
});

test('duplicate application returns the first persisted application unchanged', async () => {
  const repo = new ParticipantRepository(async text => text.startsWith('INSERT') ? [] : [{ ...viewRow, account_id: 'alice.testnet', applications: [appRow] }]);
  const result = await repo.apply(project.id, hashToken(token), 'replacement introduction', true);
  assert.equal(result.application?.introduction, 'Hello');
});

test('restricted UI is progressively rendered for approved participants and creator only', () => {
  const app = { id: appRow.id, accountId: 'alice.testnet', introduction: 'Hello', status: 'pending' as const, reviewerAccountId: null };
  for (const status of ['public', 'pending', 'rejected', 'approved', 'creator'] as const) {
    const allowed = status === 'approved' || status === 'creator';
    const view: ParticipantView = { ...publicView, accountId: status === 'public' ? null : status === 'creator' ? 'creator.testnet' : 'alice.testnet', role: status === 'creator' ? 'creator' : status === 'approved' ? 'participant' : 'public', application: status === 'pending' || status === 'rejected' || status === 'approved' ? { ...app, status } : null, restrictedContent: allowed ? 'PRIVATE_AUTHORIZED_SENTINEL' : null };
    const html = renderToStaticMarkup(createElement(PersistedYawrdPresentation, { project, view }));
    assert.equal(html.includes('PRIVATE_AUTHORIZED_SENTINEL'), allowed);
    if (status === 'pending') assert.match(html, /Application pending/);
    if (status === 'rejected') assert.match(html, /Application rejected/);
    if (status === 'approved') assert.match(html, /Application approved/);
    if (status === 'creator') assert.match(html, /Review applications/);
  }
});

test('opaque token validation rejects empty, malformed and caller-selected identities', () => {
  for (const value of [null, '', 'alice.testnet', 'a'.repeat(42), 'a'.repeat(44), '$'.repeat(43)]) assert.equal(sessionHash(value), null);
  assert.equal(sessionHash(token), hashToken(token));
  assert.equal(BROWSER_COOKIE.startsWith('__Host-'), true);
});
