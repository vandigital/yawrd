import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ContributionInputError, carryContributionConfiguration, initialContributionConfiguration, omittedContributionDependencies,
  validateContributionConfiguration, type ContributionSource, type ContributionConfiguration } from '../src/creation/contribution-configuration.ts';
import { ContributionConfigurationRepository } from '../src/creation/contribution-configuration-repository.ts';
import { contributionConfigurationRequest } from '../src/creation/contribution-configuration-http.ts';
import { preparationDigest, preparationText } from '../src/creation/preparation-repository.ts';
import { PREPARATION_CONSENT } from '../src/creation/preparation-contract.ts';
import { SESSION_COOKIE, sessionHash } from '../src/participants/auth.ts';
import type { Query } from '../src/participants/database.ts';
import { PREPARATION_ID as id, preparationArtifacts, preparationView } from './fixtures/preparation.ts';

const origin = 'https://yawrd.example', token = 'a'.repeat(43), hash = sessionHash(token)!;
function fixture() {
  const artifacts = preparationArtifacts(), text = preparationText(artifacts), digest = preparationDigest(text);
  return { artifacts, text, digest, source: { revision: 1, digest, title: artifacts.blueprint.title, tasks: artifacts.tasks, references: artifacts.references } satisfies ContributionSource };
}
type RecordRow = { revision: number; preparationRevision: number; preparationDigest: string; configurationText: string; digest: string; savedBy: string; savedAt: string };
/** Deterministic SQL contract model only; this does not execute or certify PostgreSQL. */
function harness() {
  const f = fixture(), preparation = preparationView(f.digest);
  preparation.versions[0].approval = { digest: f.digest, approvedBy: 'founder.testnet', approvedAt: '2026-11-20T00:00:00.000Z', consentVersion: PREPARATION_CONSENT };
  const sessions = new Map([[hash, 'founder.testnet'], [sessionHash('b'.repeat(43))!, 'other.testnet'], [sessionHash('s'.repeat(43))!, 'steward.testnet']]);
  const rows: RecordRow[] = [], calls: string[] = [];
  let paid = true, deployed = true, revokeOnRead = false;
  function rawSource(revision: number) { const v = preparation.versions.find(v => v.revision === revision)!; return { revision, digest: v.digest, artifactText: preparationText(v.artifacts) }; }
  const query: Query = async (sql, args = []) => {
    calls.push(sql); const actor = sessions.get(String(args[0]));
    if (sql.startsWith('SELECT account_id')) return actor ? [{ account_id: actor }] : [];
    if (!actor) throw { code: 'P0001', message: 'sign_in_required' };
    if (actor !== preparation.binding.founderAccountId || args[1] !== id) throw { code: 'P0001', message: 'creation_not_found' };
    if (!paid) throw { code: 'P0001', message: 'preparation_payment_required' };
    if (!deployed) throw { code: 'P0001', message: 'creation_deployment_unverified' };
    const approved = preparation.versions.filter(v => v.approval).at(-1);
    if (!approved) throw { code: 'P0001', message: 'contribution_approval_required' };
    let head = rows.at(-1);
    if (sql.includes('creation_contribution_save')) {
      const [, , expected, sourceRevision, sourceDigest, reviewedSource, configurationText] = args;
      if (approved.revision !== sourceRevision || approved.digest !== sourceDigest) throw { code: 'P0001', message: 'contribution_source_changed' };
      const same = head?.preparationRevision === sourceRevision && head?.preparationDigest === sourceDigest && head?.configurationText === configurationText;
      if (!(same && (head!.revision === Number(expected) + 1 || head!.revision === expected))) {
        if (expected !== (head?.revision ?? 0)) throw { code: 'P0001', message: 'contribution_revision_conflict' };
        if ((!head || head.preparationRevision !== sourceRevision || head.preparationDigest !== sourceDigest) && reviewedSource !== true) throw { code: 'P0001', message: 'contribution_review_required' };
        rows.push({ revision: (head?.revision ?? 0) + 1, preparationRevision: Number(sourceRevision), preparationDigest: String(sourceDigest),
          configurationText: String(configurationText), digest: preparationDigest(String(configurationText)), savedBy: actor, savedAt: '2026-11-20T01:00:00.000Z' });
      }
    } else assert.match(sql, /creation_contribution_read/);
    head = rows.at(-1);
    const workspace = { binding: preparation.binding, approved: rawSource(approved.revision), saved: head ? { ...head, source: rawSource(head.preparationRevision) } : null };
    if (revokeOnRead) { sessions.delete(hash); revokeOnRead = false; }
    return [{ workspace: structuredClone(workspace) }];
  };
  const repo = new ContributionConfigurationRepository(query);
  const payload = (configuration = initialContributionConfiguration(f.source), extra = {}) => ({ expectedRevision: rows.at(-1)?.revision ?? 0,
    preparationRevision: 1, preparationDigest: f.digest, reviewedSource: true, configuration, ...extra });
  const send = (data?: object, identityToken: string | null = token, account = 'founder.testnet', headers: Record<string, string> = {}, search = '') =>
    contributionConfigurationRequest(new Request(origin + '/api/creations/' + id + '/contributions' + search, { method: data ? 'POST' : 'GET',
      headers: { host: 'yawrd.example', origin, ...(identityToken ? { cookie: SESSION_COOKIE + '=' + identityToken } : {}), 'x-yawrd-account': account, ...(data ? { 'content-type': 'application/json' } : {}), ...headers }, body: data ? JSON.stringify(data) : undefined }), id, query, origin);
  function derivative(approved = false) {
    const parent = preparation.versions.at(-1)!, artifacts = structuredClone(parent.artifacts); artifacts.blueprint.summary += ' Revised.';
    const digest = preparationDigest(preparationText(artifacts));
    preparation.versions.push({ ...parent, revision: parent.revision + 1, parentRevision: parent.revision, digest, artifacts,
      origin: 'founder-edited', generation: null, authorAccountId: 'founder.testnet', approval: approved ? { digest, approvedBy: 'founder.testnet', approvedAt: '2026-11-20T02:00:00.000Z', consentVersion: PREPARATION_CONSENT } : null });
  }
  return { ...f, repo, query, rows, calls, sessions, preparation, payload, send, derivative,
    unpay: () => { paid = false; }, undeploy: () => { deployed = false; }, revokeDuringRead: () => { revokeOnRead = true; } };
}
test('defaults ignore AI unpaid proposals; explicit acknowledgement is required for unpaid work', () => {
  const { source } = fixture(), config = initialContributionConfiguration(source);
  assert.equal(source.tasks[0].rewardTerms, 'unpaid');
  assert.ok(config.tasks.every(t => t.rewardTerms === 'undecided' && !t.unpaidAcknowledged));
  config.tasks[0].rewardTerms = 'unpaid'; assert.throws(() => validateContributionConfiguration(config, source), ContributionInputError);
  config.tasks[0].unpaidAcknowledged = true; assert.deepEqual(validateContributionConfiguration(config, source), config);
  config.tasks[0].rewardTerms = 'undecided'; assert.throws(() => validateContributionConfiguration(config, source));
});
test('strict task/source contract rejects fabricated tasks, rewards, authority and malformed text', () => {
  const { source } = fixture();
  for (const mutate of [(c: any) => { c.budget = 0; }, (c: any) => { c.published = true; }, (c: any) => { c.tasks[0].amount = '0'; },
    (c: any) => { c.tasks[0].taskId = 'forged'; }, (c: any) => { c.tasks[1].taskId = c.tasks[0].taskId; }, (c: any) => { c.tasks.pop(); },
    (c: any) => { c.tasks[0].included = 'true'; }, (c: any) => { c.tasks[0].rewardTerms = 'paid'; }, (c: any) => { c.participationTerms = '\0'; },
    (c: any) => { c.participationTerms = '\ud800'; }, (c: any) => { c.tasks[0].rewardNote = 'x'.repeat(2001); }]) {
    const config = initialContributionConfiguration(source); mutate(config); assert.throws(() => validateContributionConfiguration(config, source));
  }
  const config = initialContributionConfiguration(source); config.tasks.reverse();
  assert.deepEqual(validateContributionConfiguration(config, source).tasks.map(t => t.taskId), source.tasks.map(t => t.id));
});
test('inclusion preserves task content and reports excluded dependencies without blocking draft saves', () => {
  const { source } = fixture(), before = structuredClone(source), config = initialContributionConfiguration(source);
  config.tasks[0].included = false;
  assert.equal(omittedContributionDependencies(config, source).length, 1);
  validateContributionConfiguration(config, source); assert.deepEqual(source, before);
});
test('founder save/reload, new session and identical retry preserve exact source and immutable artifacts', async () => {
  const h = harness(), original = structuredClone(h.preparation), config = initialContributionConfiguration(h.source);
  config.participationTerms = 'Private demonstration only.'; config.tasks[0].included = false;
  const data = h.payload(config), response = await h.send(data); assert.equal(response.status, 200);
  const view = await response.json(); assert.equal(view.saved.revision, 1); assert.deepEqual(view.saved.configuration, config);
  assert.deepEqual(view.approved.tasks, original.versions[0].artifacts.tasks); assert.equal(view.saved.source.digest, h.digest);
  assert.deepEqual(h.preparation, original); assert.doesNotMatch(JSON.stringify(view), /PRIVATE|privateNotes|artifactText|responseId/);
  const fresh = sessionHash('c'.repeat(43))!; h.sessions.set(fresh, 'founder.testnet');
  assert.deepEqual(await new ContributionConfigurationRepository(h.query).read(fresh, id), view);
  assert.equal((await h.send(data)).status, 200); assert.equal(h.rows.length, 1);
});
test('founder-only authorization rejects other founder, second Steward and expired/revoked sessions', async () => {
  const h = harness();
  for (const [t, a, status] of [[null, 'founder.testnet', 401], ['x'.repeat(43), 'founder.testnet', 401],
    ['b'.repeat(43), 'other.testnet', 404], ['s'.repeat(43), 'steward.testnet', 404]] as const) {
    for (const data of [undefined, h.payload()]) { const response = await h.send(data, t, a); assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /seed|PRIVATE|configurationText/); }
  }
  h.sessions.delete(hash); assert.equal((await h.send()).status, 401); assert.equal(h.rows.length, 0);
  assert.ok(h.calls.filter(s => s.startsWith('SELECT account_id')).every(s => s.includes('revoked_at IS NULL') && s.includes('expires_at>clock_timestamp()')));
});
test('session revocation before response never discloses private source', async () => {
  const h = harness(); h.revokeDuringRead(); const response = await h.send(); assert.equal(response.status, 401); assert.doesNotMatch(await response.text(), /seed|PRIVATE/);
});
test('source approval and existing verified payment/deployment bindings are required', async () => {
  const h = harness(); h.preparation.versions[0].approval = null; assert.equal((await h.send()).status, 409);
  for (const unbind of ['unpay', 'undeploy'] as const) { const h = harness(); h[unbind](); assert.equal((await h.send()).status, 409); assert.equal((await h.send(h.payload())).status, 409); }
});
test('concurrent different saves have one winner and stale saves cannot overwrite it', async () => {
  const h = harness(), a = initialContributionConfiguration(h.source), b = structuredClone(a); a.participationTerms = 'One'; b.participationTerms = 'Two';
  const results = await Promise.all([h.send(h.payload(a)), h.send(h.payload(b))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(h.rows.length, 1);
  assert.equal((await h.send(h.payload(b, { expectedRevision: 0 }))).status, 409);
});
test('many unapproved derivatives do not invalidate or hide prior approved configuration', async () => {
  const h = harness(); await h.send(h.payload()); const saved = structuredClone(h.rows[0]);
  for (let i = 0; i < 25; i++) h.derivative();
  const view = await h.repo.read(hash, id); assert.equal(view.approved.revision, 1); assert.deepEqual(h.rows[0], saved);
  const changed = structuredClone(view.saved!.configuration); changed.participationTerms = 'Still configuring approved version one';
  assert.equal((await h.send(h.payload(changed))).status, 200); assert.equal(h.rows.length, 2);
});
test('new approved version preserves old settings and requires review plus renewed unpaid consent to carry forward', async () => {
  const h = harness(), config = initialContributionConfiguration(h.source); config.tasks[0].rewardTerms = 'unpaid'; config.tasks[0].unpaidAcknowledged = true;
  await h.send(h.payload(config)); const oldRow = structuredClone(h.rows[0]); h.derivative(true);
  const view = await h.repo.read(hash, id); assert.equal(view.approved.revision, 2); assert.equal(view.saved!.source.revision, 1); assert.deepEqual(h.rows[0], oldRow);
  assert.equal((await h.send(h.payload(config))).status, 409);
  const carried = carryContributionConfiguration(config, view.approved); assert.equal(carried.tasks[0].unpaidAcknowledged, false);
  const next = h.payload(carried, { preparationRevision: 2, preparationDigest: view.approved.digest });
  assert.equal((await h.send(next)).status, 400);
  carried.tasks[0].unpaidAcknowledged = true;
  assert.equal((await h.send({ ...next, reviewedSource: false })).status, 409);
  assert.equal((await h.send(next)).status, 200); assert.equal(h.rows[1].preparationRevision, 2); assert.deepEqual(h.rows[0], oldRow);
});
test('approval changes between server precheck and SQL save fail without persisting wrong source', async () => {
  const h = harness(); const racing: Query = async (sql, args) => { if (sql.includes('creation_contribution_save')) h.derivative(true); return h.query(sql, args); };
  await assert.rejects(new ContributionConfigurationRepository(racing).save(hash, id, 0, 1, h.digest, true, initialContributionConfiguration(h.source)), /contribution_source_changed/);
  assert.equal(h.rows.length, 0);
});
test('HTTP enforces origin, account identity, exact fields, body bounds and private no-store responses', async () => {
  const h = harness();
  assert.equal((await h.send(undefined, token, 'other.testnet')).status, 409);
  assert.equal((await h.send(h.payload(), token, 'founder.testnet', { origin: 'https://other.example' })).status, 403);
  assert.equal((await h.send(undefined, token, 'founder.testnet', { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await h.send(undefined, token, 'founder.testnet', {}, '?source=forged')).status, 400);
  assert.equal((await h.send({ ...h.payload(), founder: 'other.testnet' })).status, 400);
  assert.equal((await h.send({ text: 'x'.repeat(140000) })).status, 413);
  const response = await h.send(); assert.match(response.headers.get('cache-control')!, /private, no-store/); assert.equal(response.headers.get('vary'), 'Cookie');
  const request = new Request(origin + '/api/creations/' + id + '/contributions', { method: 'DELETE', headers: { host: 'yawrd.example', origin } });
  assert.equal((await contributionConfigurationRequest(request, id, h.query, origin)).status, 405);
  const unknown: Query = async () => { throw Error('SECRET database exception'); };
  assert.deepEqual(await (await contributionConfigurationRequest(new Request(origin, { headers: { host: 'yawrd.example', cookie: SESSION_COOKIE + '=' + token } }), id, unknown, origin)).json(), { error: 'service_unavailable' });
});
test('absent schema fails closed; corrupted source or stored configuration fails integrity validation', async () => {
  const unavailable: Query = async () => { throw { code: '42883' }; };
  await assert.rejects(new ContributionConfigurationRepository(unavailable).read(hash, id), /contribution_storage_required/);
  const h = harness(); await h.send(h.payload()); h.rows[0].digest = '0'.repeat(64);
  await assert.rejects(h.repo.read(hash, id), /contribution_integrity_error/);
  const malformed = harness(); malformed.preparation.versions[0].digest = '0'.repeat(64);
  await assert.rejects(malformed.repo.read(hash, id), /contribution_integrity_error/);
});
test('SQL proposal contains source/append guards and restricted grants without modifying accepted systems', () => {
  const sql = readFileSync(new URL('../docs/proposals/migrations/phase2_creation_contribution_configuration.sql', import.meta.url), 'utf8');
  for (const text of ['creation_preparation_access(_session,_id)', 'FOR UPDATE', 'PRIMARY KEY (creation_id,revision)',
    'REFERENCES yawrd.creation_preparation_approvals(creation_id,revision)', 'prevent_mutation()', 'a.revision IS DISTINCT FROM _source',
    'head.preparation_revision<>_source', '_reviewed IS DISTINCT FROM true', '_expected<>COALESCE(head.revision,0)',
    "'unpaidAcknowledged'", 'configuration_digest:=encode(sha256', 'FROM PUBLIC']) assert.ok(sql.includes(text), text);
  assert.doesNotMatch(sql, /ALTER TABLE|DROP |UPDATE yawrd\.|DELETE FROM|SECURITY DEFINER|GRANT UPDATE|GRANT DELETE|GRANT TRUNCATE|^\s*(COMMIT|ROLLBACK);/im);
  assert.doesNotMatch(sql, /GRANT INSERT\([^)]*(saved_at|configuration_digest)/);
  const http = readFileSync(new URL('../src/creation/contribution-configuration-http.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(http, /preparation-generation|provider|treasury|payout/);
});
