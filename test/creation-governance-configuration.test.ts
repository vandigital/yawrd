import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GovernanceConfigurationRepository } from '../src/creation/governance-configuration-repository.ts';
import { governanceConfigurationRequest } from '../src/creation/governance-configuration-http.ts';
import { GOVERNANCE_CONSENT, sameGovernanceSource, type GovernanceView } from '../src/creation/governance-configuration.ts';
import { SESSION_COOKIE, sessionHash } from '../src/participants/auth.ts';
import type { Query } from '../src/participants/database.ts';
import { PREPARATION_ID as id, preparationView } from './fixtures/preparation.ts';
const token = 'a'.repeat(43), hash = sessionHash(token)!, origin = 'https://yawrd.example';
/** Offline SQL contract model: no database access; does not certify PostgreSQL locking/durability. */
function harness() {
  const view: GovernanceView = { binding: preparationView('a'.repeat(64)).binding, title: 'Community seed survey',
    source: { contributionRevision: 1, contributionDigest: 'c'.repeat(64), preparationRevision: 1, preparationDigest: 'a'.repeat(64) }, contributionCurrent: true, saved: null };
  const sessions = new Map([[hash, 'founder.testnet'], [sessionHash('b'.repeat(43))!, 'other.testnet'], [sessionHash('s'.repeat(43))!, 'steward.testnet']]);
  const calls: string[] = []; let revoke = false, available = true;
  const query: Query = async (sql, args = []) => {
    calls.push(sql); const actor = sessions.get(String(args[0]));
    if (sql.startsWith('SELECT account_id')) return actor ? [{ account_id: actor }] : [];
    if (!actor) throw { code: 'P0001', message: 'sign_in_required' };
    if (actor !== view.binding.founderAccountId || args[1] !== id) throw { code: 'P0001', message: 'creation_not_found' };
    if (!available) throw { code: 'P0001', message: 'governance_contributions_required' };
    if (view.saved && JSON.stringify(view.saved.binding) !== JSON.stringify(view.binding)) throw { code: 'P0001', message: 'governance_binding_changed' };
    if (sql.includes('creation_governance_save')) {
      const [, , expected, contributionRevision, contributionDigest, preparationRevision, preparationDigest, confirmed] = args;
      if (!confirmed) throw { code: 'P0001', message: 'governance_confirmation_required' };
      const source = { contributionRevision, contributionDigest, preparationRevision, preparationDigest } as GovernanceView['source'];
      if (!view.contributionCurrent || !sameGovernanceSource(view.source, source)) throw { code: 'P0001', message: 'governance_source_changed' };
      const retry = view.saved && sameGovernanceSource(view.saved.source, source) && [view.saved.revision, view.saved.revision - 1].includes(Number(expected));
      if (!retry) {
        if (expected !== (view.saved?.revision ?? 0)) throw { code: 'P0001', message: 'governance_revision_conflict' };
        view.saved = { revision: Number(expected) + 1, binding: structuredClone(view.binding), source: structuredClone(source),
          reviewMode: 'founder-led', consentVersion: GOVERNANCE_CONSENT, savedBy: actor, savedAt: '2026-11-21T00:00:00Z' };
      }
    } else assert.match(sql, /creation_governance_read/);
    if (revoke) { sessions.delete(hash); revoke = false; }
    return [{ workspace: structuredClone(view) }];
  };
  const repo = new GovernanceConfigurationRepository(query);
  const payload = () => ({ expectedRevision: view.saved?.revision ?? 0, source: structuredClone(view.source), confirmed: true });
  const send = (data?: object, t: string | null = token, account = 'founder.testnet', headers = {}, search = '') => governanceConfigurationRequest(new Request(origin + '/api/creations/' + id + '/governance' + search, {
    method: data ? 'POST' : 'GET', headers: { host: 'yawrd.example', origin, ...(t ? { cookie: SESSION_COOKIE + '=' + t } : {}), 'x-yawrd-account': account,
      ...(data ? { 'content-type': 'application/json' } : {}), ...headers }, body: data ? JSON.stringify(data) : undefined }), id, query, origin);
  return { view, repo, query, calls, sessions, payload, send, revoke: () => { revoke = true; }, unavailable: () => { available = false; } };
}
test('founder confirmation survives repository recreation; identical receipt retries are idempotent', async () => {
  const h = harness(), data = h.payload();
  assert.equal((await h.send(data)).status, 200);
  assert.equal((await h.send(data)).status, 200); assert.equal(h.view.saved?.revision, 1);
  assert.deepEqual(await new GovernanceConfigurationRepository(h.query).read(hash, id), h.view);
  assert.equal(h.view.saved?.reviewMode, 'founder-led'); assert.equal(h.view.saved?.savedBy, h.view.binding.founderAccountId);
  assert.deepEqual(h.view.saved?.binding, h.view.binding);
});
test('other founder, Steward membership, expired session and switched Account cannot read or save', async () => {
  const h = harness();
  for (const [t, actor, status] of [[null, 'founder.testnet', 401], ['x'.repeat(43), 'founder.testnet', 401], ['b'.repeat(43), 'other.testnet', 404], ['s'.repeat(43), 'steward.testnet', 404], [token, 'other.testnet', 409]] as const) {
    for (const data of [undefined, h.payload()]) { const response = await h.send(data, t, actor); assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /Community|factory|source/); }
  }
  h.revoke(); const response = await h.send(); assert.equal(response.status, 401); assert.doesNotMatch(await response.text(), /Community|factory/);
  assert.equal(h.view.saved, null);
});
test('new contribution revision preserves prior confirmation and requires renewed explicit consent', async () => {
  const h = harness(); const old = h.payload(); await h.send(old); const saved = structuredClone(h.view.saved);
  h.view.source.contributionRevision++; h.view.source.contributionDigest = 'd'.repeat(64);
  assert.equal((await h.send(old)).status, 409); assert.deepEqual(h.view.saved, saved);
  assert.equal((await h.send({ ...h.payload(), confirmed: false })).status, 400);
  assert.equal((await h.send(h.payload())).status, 200); assert.equal(h.view.saved?.revision, 2);
});
test('new Blueprint without reviewed saved contributions blocks saves but preserves prior settings', async () => {
  const h = harness(); await h.send(h.payload()); const saved = structuredClone(h.view.saved);
  h.view.contributionCurrent = false;
  assert.equal((await h.send()).status, 200); assert.equal((await h.send(h.payload())).status, 409); assert.deepEqual(h.view.saved, saved);
  h.unavailable(); assert.equal((await h.send()).status, 409);
});
test('source changes between precheck and SQL save fail; stale writers cannot replace a newer confirmation', async () => {
  const h = harness(); const racing: Query = async (sql, args) => { if (sql.includes('creation_governance_save')) h.view.source.contributionRevision++; return h.query(sql, args); };
  await assert.rejects(new GovernanceConfigurationRepository(racing).save(hash, id, 0, structuredClone(h.view.source), true), /governance_source_changed/); assert.equal(h.view.saved, null);
  const c = harness(); const old = c.payload(); await c.send(old); c.view.source.contributionRevision++; c.view.source.contributionDigest = 'd'.repeat(64);
  const fresh = c.payload(), stale = { ...fresh, expectedRevision: 0 };
  const responses = await Promise.all([c.send(fresh), c.send(stale)]); assert.deepEqual(responses.map(r => r.status), [200, 409]); assert.equal(c.view.saved?.revision, 2);
});
test('changed founder/DAO verification bindings cannot silently rebind earlier approved work', async () => {
  for (const field of ['daoAccountId', 'deploymentDigest', 'paymentDigest'] as const) {
    const h = harness(); await h.send(h.payload()); h.view.binding[field] += 'changed';
    assert.equal((await h.send()).status, 409); assert.equal((await h.send(h.payload())).status, 409); assert.equal(h.view.saved?.revision, 1);
  }
});
test('HTTP bounds, exact fields, origin checks, private caching and unsupported method', async () => {
  const h = harness();
  for (const data of [{ ...h.payload(), founder: 'other.testnet' }, { ...h.payload(), source: { ...h.view.source, reviewer: 'steward.testnet' } }, { ...h.payload(), source: null }, { ...h.payload(), source: { ...h.view.source, contributionDigest: 'forged' } }, { ...h.payload(), expectedRevision: -1 }]) assert.equal((await h.send(data)).status, 400);
  assert.equal((await h.send(h.payload(), token, 'founder.testnet', { origin: 'https://other.example' })).status, 403);
  assert.equal((await h.send(undefined, token, 'founder.testnet', {}, '?source=forged')).status, 400);
  assert.equal((await h.send({ text: 'x'.repeat(3000) })).status, 413);
  const response = await h.send(); assert.match(response.headers.get('cache-control')!, /private, no-store/); assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal((await governanceConfigurationRequest(new Request(origin, { method: 'DELETE' }), id, h.query, origin)).status, 405);
});
test('missing schema fails closed and corrupt saved authority cannot be presented as confirmed', async () => {
  const query: Query = async () => { throw { code: '42883' }; };
  await assert.rejects(new GovernanceConfigurationRepository(query).read(hash, id), /governance_storage_required/);
  const h = harness(); await h.send(h.payload()); (h.view.saved as any).reviewMode = 'stewards';
  await assert.rejects(h.repo.read(hash, id), /governance_integrity_error/);
});
test('additive SQL enforces source, binding, append-only saves and restricted grants', () => {
  const sql = readFileSync(new URL('../docs/proposals/migrations/phase2_creation_governance_configuration.sql', import.meta.url), 'utf8');
  for (const text of ['creation_contribution_read(_session,_id)', 'FOR UPDATE', 'prevent_mutation()', 'PRIMARY KEY (creation_id,revision)',
    'REFERENCES yawrd.creation_contribution_configurations(creation_id,revision)', 'REFERENCES yawrd.creation_preparation_approvals(creation_id,revision)',
    'head.binding IS DISTINCT FROM NEW.binding', 'NEW.binding IS DISTINCT FROM verified', '_expected<>COALESCE(head.revision,0)',
    "v->'source' IS DISTINCT FROM source", '_confirmed IS DISTINCT FROM true', 'FROM PUBLIC']) assert.ok(sql.includes(text), text);
  assert.doesNotMatch(sql, /ALTER TABLE|DROP |UPDATE yawrd\.|DELETE FROM|SECURITY DEFINER|GRANT UPDATE|GRANT DELETE|GRANT TRUNCATE|^\s*(COMMIT|ROLLBACK);/im);
  assert.doesNotMatch(sql, /GRANT INSERT\([^)]*saved_at/);
  const route = readFileSync(new URL('../app/api/creations/[id]/governance/route.ts', import.meta.url), 'utf8');
  assert.match(route, /!creationEnvironment\(\)/); assert.match(route, /creationDatabaseUrl\(\)/);
});
