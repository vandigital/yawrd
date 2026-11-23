import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { allocatePublicId, generatePublicId, PUBLIC_ID_ATTEMPTS, PUBLIC_ID_PATTERN } from '../src/project-identity.ts';
import { CreationRepository } from '../src/creation/repository.ts';
import { CREATION_STORAGE_BYTES, emptyConfiguration, intakeInput, PUBLIC_TEXT_CONSENT } from '../src/creation/validation.ts';
import { createEmptyYawrdIntakeDraft, updateYawrdIntakeDraft } from '../src/yawrd-intake.ts';
import type { Query, Row } from '../src/participants/database.ts';

const now = '2026-11-17T00:00:00.123Z';
const founder = 'founder.testnet', other = 'other.testnet', session = 'a'.repeat(64), otherSession = 'b'.repeat(64);
const draft = (id = 'c2-source') => ({ ...updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft(id, now), {
  projectType: 'community', startingPoint: 'idea', intendedBudget: 'undecided',
  availableResources: '  PRIVATE resources\n', successCriteria: 'Private result\n', initialOutcomeConfirmed: true,
  founderDescription: '  PRIVATE ORIGINAL wording — 🐳\n',
}, now), projectName: 'Private draft name' });
const config = () => ({ publicName: ' Public name ', publicDescription: ' Explicit proposed summary\n', accountLabel: 'my-project', secondSteward: 'second.testnet', threshold: 2 });
const review = (r: { revision: number; publicTextDigest: string }) => ({ expectedRevision: r.revision, publicTextDigest: r.publicTextDigest, consent: true, consentVersion: PUBLIC_TEXT_CONSENT });
const dbError = (message: string) => Object.assign(new Error(message), { code: 'P0001' });
const digest = (a: string, b: string) => createHash('sha256').update(JSON.stringify([a, b])).digest('hex');
const equal = (a: unknown, b: unknown): boolean => {
  const canonical = (v: unknown): string => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']'
    : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical((v as Row)[k])).join(',') + '}' : JSON.stringify(v);
  return canonical(a) === canonical(b);
};
function stored(id: string, actor: string, intake: ReturnType<typeof draft>) {
  return { id, network: 'testnet', founder_account_id: actor, source_draft_id: intake.draftId,
    revision: 1, initial_intake: structuredClone(intake), intake: structuredClone(intake),
    public_name: '', public_description: '', account_label: '', second_steward: '', threshold: 2,
    public_text_digest: digest('', ''), reviewed_revision: null as number | null,
    reviewed_public_text_digest: null as string | null, public_text_consent_version: null as string | null,
    public_text_reviewed_at: null as string | null, created_at: now, updated_at: now };
}

/** Behavioral model, not a PostgreSQL emulator/proof. Its atomic decisions model
 * the proposed row locks/CAS/unique constraints. Adapter assertions below exercise
 * the actual parameterized queries; live SQL verification is an activation gate.
 */
function harness() {
  const records = new Map<string, ReturnType<typeof stored>>();
  const sessions = new Map([[session, { account: founder, network: 'testnet', expires: 100, revoked: false }], [otherSession, { account: other, network: 'testnet', expires: 100, revoked: false }]]);
  const calls: { sql: string; args: unknown[] }[] = [];
  let clock = 0, entropyCalls = 0, loseStart = false, loseSave = false;
  const query: Query = async (sql, args = []) => {
    calls.push({ sql, args });
    const s = sessions.get(String(args[0]));
    if (!s || s.network !== 'testnet' || s.revoked || s.expires <= clock) throw dbError('sign_in_required');
    const actor = s.account;
    const source = (intake: ReturnType<typeof draft>) => [...records.values()].find(r => r.founder_account_id === actor && r.source_draft_id === intake.draftId);
    if (sql.includes('creation_find_start')) {
      const intake = JSON.parse(String(args[1])), p = source(intake);
      if (p && !equal(p.initial_intake, intake)) throw dbError('creation_import_conflict');
      return p ? [structuredClone(p)] : [];
    }
    if (sql.includes('creation_start')) {
      const id = String(args[1]), intake = JSON.parse(String(args[2]));
      let p = source(intake);
      if (!p && !records.has(id)) { p = stored(id, actor, intake); records.set(id, p); }
      if (p && !equal(p.initial_intake, intake)) throw dbError('creation_import_conflict');
      if (loseStart) { loseStart = false; throw new Error('uncertain_start_commit'); }
      return p ? [structuredClone(p)] : [];
    }
    if (sql.includes('creation_list')) {
      return [...records.values()].filter(p => p.founder_account_id === actor && (!args[1] || p.id > String(args[1])))
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, Number(args[2]))
        .map(p => ({ id: p.id, network: p.network, revision: p.revision, display_name: p.intake.projectName ?? '', created_at: p.created_at, updated_at: p.updated_at }));
    }
    const p = records.get(String(args[1]));
    if (!p || p.founder_account_id !== actor) throw dbError('creation_not_found');
    if (sql.includes('creation_read')) return [structuredClone(p)];
    if (args[2] !== p.revision) throw dbError('creation_revision_conflict');
    if (sql.includes('creation_save')) {
      const intake = args[3] == null ? null : JSON.parse(String(args[3]));
      const c = args[4] == null ? null : JSON.parse(String(args[4]));
      if (intake && intake.draftId !== p.source_draft_id) throw dbError('creation_draft_identity_conflict');
      if (c?.secondSteward === actor) throw dbError('invalid_creation_configuration');
      const current = { publicName: p.public_name, publicDescription: p.public_description, accountLabel: p.account_label, secondSteward: p.second_steward, threshold: p.threshold };
      const changed = intake ? !equal(p.intake, intake) : !equal(current, c);
      if (changed) {
        if (intake) p.intake = structuredClone(intake);
        else Object.assign(p, { public_name: c.publicName, public_description: c.publicDescription, account_label: c.accountLabel, second_steward: c.secondSteward, threshold: c.threshold });
        p.revision++; p.public_text_digest = digest(p.public_name, p.public_description);
        p.reviewed_revision = null; p.reviewed_public_text_digest = null; p.public_text_consent_version = null; p.public_text_reviewed_at = null;
      }
      if (loseSave) { loseSave = false; throw new Error('uncertain_save_commit'); }
      return [structuredClone(p)];
    }
    if (sql.includes('creation_review_public_text')) {
      if (args[3] !== p.public_text_digest || args[4] !== PUBLIC_TEXT_CONSENT) throw dbError('public_text_review_conflict');
      if (!p.public_name.trim() || !p.public_description.trim()) throw dbError('public_text_required');
      if (p.reviewed_revision === null) {
        p.reviewed_revision = p.revision; p.reviewed_public_text_digest = p.public_text_digest;
        p.public_text_consent_version = PUBLIC_TEXT_CONSENT; p.public_text_reviewed_at = now;
      }
      return [structuredClone(p)];
    }
    throw new Error('unexpected_model_query');
  };
  const repo = new CreationRepository(query, size => new Uint8Array(size).fill(entropyCalls++));
  return { repo, query, records, sessions, calls, entropyCalls: () => entropyCalls, expire: () => { clock = 101; }, loseStart: () => { loseStart = true; }, loseSave: () => { loseSave = true; } };
}

test('ID generation uses every lowercase base32 symbol and cryptographic default without side effects', () => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  for (let i = 0; i < 32; i++) assert.equal(generatePublicId(n => new Uint8Array(n).fill(i)), 'yawrd-' + alphabet[i].repeat(12));
  const ids = new Set(Array.from({ length: 256 }, () => generatePublicId()));
  assert.equal(ids.size, 256);
  for (const id of ids) assert.match(id, PUBLIC_ID_PATTERN);
  assert.throws(() => generatePublicId(() => new Uint8Array(1)), /invalid_random_source/);
});

test('only confirmed collisions retry; collision exhaustion is bounded and unknown errors propagate once', async () => {
  let attempts = 0;
  const result = await allocatePublicId(async id => ++attempts < 3 ? null : id, n => new Uint8Array(n).fill(attempts));
  assert.equal(attempts, 3); assert.match(result, PUBLIC_ID_PATTERN);
  attempts = 0;
  await assert.rejects(allocatePublicId(async () => { attempts++; return null; }), /public_id_collision_limit/);
  assert.equal(attempts, PUBLIC_ID_ATTEMPTS);
  attempts = 0;
  await assert.rejects(allocatePublicId(async () => { attempts++; throw new Error('unknown_commit'); }), /unknown_commit/);
  assert.equal(attempts, 1);
});

test('identical start/import is idempotent and recovery allocates no fresh ID', async () => {
  const h = harness(), input = draft(), a = await h.repo.start(session, input);
  const b = await h.repo.start(session, JSON.parse(JSON.stringify(input)));
  assert.deepEqual(a, b); assert.equal(h.records.size, 1); assert.equal(h.entropyCalls(), 1);
  assert.deepEqual(a.initialIntake, input); assert.deepEqual(a.configuration, emptyConfiguration());
  assert.equal(a.publicTextReview, null); assert.equal(a.founderAccountId, founder);
});

test('database ID collision retries without changing founder/source identity', async () => {
  const h = harness();
  h.records.set('yawrd-aaaaaaaaaaaa', stored('yawrd-aaaaaaaaaaaa', other, draft('other-draft')));
  const a = await h.repo.start(session, draft());
  assert.equal(a.id, 'yawrd-bbbbbbbbbbbb'); assert.equal(h.entropyCalls(), 2);
  assert.equal(a.sourceDraftId, draft().draftId); assert.equal(a.founderAccountId, founder);
});

test('concurrent starts have one winner; conflicting concurrent imports never overwrite it', async () => {
  const h = harness(), input = draft();
  const [a, b] = await Promise.all([h.repo.start(session, input), h.repo.start(session, input)]);
  assert.equal(a.id, b.id); assert.equal(h.records.size, 1);
  const h2 = harness(), changed = { ...input, projectName: 'Conflicting import' };
  const results = await Promise.allSettled([h2.repo.start(session, input), h2.repo.start(session, changed)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && /creation_import_conflict/.test(String(r.reason))).length, 1);
  assert.equal(h2.records.size, 1);
});

test('separate sessions of the same founder share source identity and revision protection', async () => {
  const h = harness(), secondSession = 'd'.repeat(64);
  h.sessions.set(secondSession, { account: founder, network: 'testnet', expires: 100, revoked: false });
  const [a, b] = await Promise.all([h.repo.start(session, draft()), h.repo.start(secondSession, draft())]);
  assert.equal(a.id, b.id); assert.equal(h.records.size, 1);
  const results = await Promise.allSettled([
    h.repo.updateConfiguration(session, a.id, 1, config()),
    h.repo.updateConfiguration(secondSession, a.id, 1, { ...config(), publicName: 'Other device' }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && /creation_revision_conflict/.test(String(r.reason))).length, 1);
});

test('start retries after edits use immutable original import and cannot overwrite current content', async () => {
  const h = harness(), input = draft(), a = await h.repo.start(session, input);
  const edited = { ...input, projectName: 'Changed private name' };
  const b = await h.repo.updateIntake(session, a.id, a.revision, edited);
  assert.equal(b.id, a.id); assert.deepEqual(b.initialIntake, input); assert.deepEqual(b.intake, edited);
  const retry = await h.repo.start(session, input);
  assert.deepEqual(retry, b); assert.equal(h.entropyCalls(), 1);
  await assert.rejects(h.repo.start(session, edited), /creation_import_conflict/);
  assert.deepEqual(await h.repo.read(session, a.id), b);
});

test('uncertain commits require same-source/read recovery without automatic retries', async () => {
  const h = harness(); h.loseStart();
  await assert.rejects(h.repo.start(session, draft()), /uncertain_start_commit/);
  assert.equal(h.entropyCalls(), 1);
  const a = await h.repo.start(session, draft());
  assert.equal(h.entropyCalls(), 1); assert.equal(h.records.size, 1);
  h.loseSave();
  await assert.rejects(h.repo.updateConfiguration(session, a.id, a.revision, config()), /uncertain_save_commit/);
  const recovered = await h.repo.read(session, a.id);
  assert.equal(recovered.revision, a.revision + 1);
  await assert.rejects(h.repo.updateConfiguration(session, a.id, a.revision, config()), /creation_revision_conflict/);
  assert.deepEqual((await h.repo.read(session, a.id)).configuration, config());
});

test('wrong founder cannot read, update or review; same source ID in another founder account grants no access', async () => {
  const h = harness(), a = await h.repo.start(session, draft());
  for (const work of [() => h.repo.read(otherSession, a.id), () => h.repo.updateIntake(otherSession, a.id, 1, draft()),
    () => h.repo.updateConfiguration(otherSession, a.id, 1, config()), () => h.repo.reviewPublicText(otherSession, a.id, review(a))]) {
    await assert.rejects(work(), /creation_not_found/);
  }
  assert.deepEqual((await h.repo.list(otherSession)).items, []);
  const b = await h.repo.start(otherSession, draft());
  assert.notEqual(b.id, a.id); assert.equal(b.founderAccountId, other);
  assert.equal((await h.repo.list(session)).items.length, 1);
});

test('missing, forged, expired, revoked and wrong-network sessions fail every operation', async t => {
  for (const state of ['missing', 'malformed', 'unknown', 'expired', 'revoked', 'wrong-network']) await t.test(state, async () => {
    const h = harness(), a = await h.repo.start(session, draft());
    let hash: string | null = session;
    if (state === 'missing') hash = null;
    if (state === 'malformed') hash = founder;
    if (state === 'unknown') hash = 'c'.repeat(64);
    if (state === 'expired') h.expire();
    if (state === 'revoked') h.sessions.get(session)!.revoked = true;
    if (state === 'wrong-network') h.sessions.get(session)!.network = 'mainnet';
    for (const work of [() => h.repo.start(hash, draft()), () => h.repo.read(hash, a.id), () => h.repo.list(hash),
      () => h.repo.updateIntake(hash, a.id, 1, draft()), () => h.repo.updateConfiguration(hash, a.id, 1, config()), () => h.repo.reviewPublicText(hash, a.id, review(a))]) {
      await assert.rejects(work(), /sign_in_required/);
    }
    assert.equal(h.entropyCalls(), 1); assert.equal(h.records.get(a.id)!.revision, 1);
  });
});

test('session is rechecked between initial lookup and atomic start', async () => {
  const h = harness();
  const repo = new CreationRepository(async (sql, args) => {
    const rows = await h.query(sql, args);
    if (sql.includes('creation_find_start')) h.sessions.get(session)!.revoked = true;
    return rows;
  });
  await assert.rejects(repo.start(session, draft()), /sign_in_required/);
  assert.equal(h.records.size, 0);
});

test('concurrent saves have one revision winner and stale saves cannot clobber it', async () => {
  const h = harness(), a = await h.repo.start(session, draft());
  const writes = await Promise.allSettled([
    h.repo.updateConfiguration(session, a.id, 1, config()),
    h.repo.updateIntake(session, a.id, 1, { ...draft(), projectName: 'Concurrent change' }),
  ]);
  assert.equal(writes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(writes.filter(r => r.status === 'rejected' && /creation_revision_conflict/.test(String(r.reason))).length, 1);
  assert.equal((await h.repo.read(session, a.id)).revision, 2);
  await assert.rejects(h.repo.updateConfiguration(session, a.id, 1, config()), /creation_revision_conflict/);
});

test('configuration saves preserve exact initial/current private wording and immutable source binding', async () => {
  const h = harness(), input = draft(), a = await h.repo.start(session, input);
  const b = await h.repo.updateConfiguration(session, a.id, 1, config());
  assert.equal(b.id, a.id); assert.equal(b.founderAccountId, a.founderAccountId); assert.equal(b.sourceDraftId, a.sourceDraftId);
  assert.deepEqual(b.initialIntake, input); assert.deepEqual(b.intake, input);
  assert.deepEqual(b.configuration, config());
  await assert.rejects(h.repo.updateIntake(session, a.id, 2, draft('replacement-source')), /creation_draft_identity_conflict/);
  // Returned values cannot mutate stored snapshots.
  b.initialIntake.answers.founderDescription = 'mutated';
  assert.deepEqual((await h.repo.read(session, a.id)).initialIntake, input);
});

test('public text review binds exact digest/revision, is idempotent and does not publish or approve deployment', async () => {
  const h = harness(), a = await h.repo.start(session, draft());
  await assert.rejects(h.repo.reviewPublicText(session, a.id, review(a)), /public_text_required/);
  const b = await h.repo.updateConfiguration(session, a.id, 1, config());
  const c = await h.repo.reviewPublicText(session, a.id, review(b));
  assert.deepEqual(c.publicTextReview, { revision: b.revision, digest: b.publicTextDigest, consentVersion: PUBLIC_TEXT_CONSENT, reviewedAt: now });
  assert.equal(c.revision, b.revision);
  assert.deepEqual(await h.repo.reviewPublicText(session, a.id, review(b)), c);
  await assert.rejects(h.repo.reviewPublicText(session, a.id, { ...review(b), publicTextDigest: 'f'.repeat(64) }), /public_text_review_conflict/);
  await assert.rejects(h.repo.reviewPublicText(session, a.id, { ...review(b), consent: false }), /public_text_review_required/);
  await assert.rejects(h.repo.reviewPublicText(session, a.id, { ...review(b), expectedRevision: 1 }), /creation_revision_conflict/);
  assert.equal(Object.hasOwn(c, 'publishedAt'), false); assert.equal(Object.hasOwn(c, 'daoAccountId'), false);
});

test('relevant edits invalidate review, including edit/revert and intake/configuration revision changes', async t => {
  for (const field of ['publicName', 'publicDescription', 'accountLabel', 'secondSteward', 'intake']) await t.test(field, async () => {
    const h = harness(), a = await h.repo.start(session, draft());
    const b = await h.repo.updateConfiguration(session, a.id, 1, config());
    await h.repo.reviewPublicText(session, a.id, review(b));
    const c = field === 'intake'
      ? await h.repo.updateIntake(session, a.id, b.revision, { ...draft(), projectName: 'Edited private name' })
      : await h.repo.updateConfiguration(session, a.id, b.revision, { ...config(), [field]: field === 'secondSteward' ? 'third.testnet' : field === 'accountLabel' ? 'other-label' : config()[field as 'publicName' | 'publicDescription'] + ' ' });
    assert.equal(c.publicTextReview, null); assert.equal(c.revision, b.revision + 1);
    await assert.rejects(h.repo.reviewPublicText(session, a.id, review(b)), /creation_revision_conflict/);
    const reverted = field === 'intake' ? await h.repo.updateIntake(session, a.id, c.revision, draft()) : await h.repo.updateConfiguration(session, a.id, c.revision, config());
    assert.equal(reverted.publicTextDigest, b.publicTextDigest); assert.equal(reverted.publicTextReview, null);
  });
});

test('no-op saves preserve revision and review; stale no-op saves still fail', async () => {
  const h = harness(), a = await h.repo.start(session, draft());
  const b = await h.repo.updateConfiguration(session, a.id, 1, config());
  const c = await h.repo.reviewPublicText(session, a.id, review(b));
  assert.deepEqual(await h.repo.updateConfiguration(session, a.id, c.revision, config()), c);
  assert.deepEqual(await h.repo.updateIntake(session, a.id, c.revision, draft()), c);
  await assert.rejects(h.repo.updateIntake(session, a.id, 1, draft()), /creation_revision_conflict/);
});

test('list is bounded, founder-only, summary-only and uses stable pagination', async () => {
  const h = harness();
  for (let i = 0; i < 4; i++) await h.repo.start(session, draft('source-' + i));
  await h.repo.start(otherSession, draft('other-source'));
  const first = await h.repo.list(session, { limit: 2 });
  assert.equal(first.items.length, 2); assert.equal(first.nextAfterId, first.items[1].id);
  const second = await h.repo.list(session, { limit: 2, afterId: first.nextAfterId! });
  assert.equal(second.items.length, 2); assert.equal(second.nextAfterId, null);
  assert.equal(new Set([...first.items, ...second.items].map(p => p.id)).size, 4);
  assert.doesNotMatch(JSON.stringify(first), /PRIVATE|founderDescription|initialIntake|configuration|sourceDraftId/);
  for (const limit of [0, 51, 1.1, NaN]) await assert.rejects(h.repo.list(session, { limit }), /invalid_creation_limit/);
});

test('C2 partial/legacy imports remain valid; forged gates, extra fields and unsupported schema fail', async () => {
  const h = harness();
  const legacy = createEmptyYawrdIntakeDraft('legacy-without-name', now);
  assert.deepEqual((await h.repo.start(session, legacy)).intake, legacy);
  for (const invalid of [{ ...draft(), schemaVersion: 'future' }, { ...draft(), owner: other },
    { ...draft(), gates: { ...draft().gates, blueprintApproval: 'approved' } },
    { ...draft(), answers: { ...draft().answers, secret: 'extra' } },
    { ...draft(), classification: { ...draft().classification, method: 'inferred' } }]) {
    await assert.rejects(h.repo.start(session, invalid), /invalid_creation/);
  }
  assert.equal(h.records.size, 1);
});

test('storage/text/account/revision limits fail before SQL; maximum C2 wording fits the storage budget', async () => {
  const h = harness(), a = await h.repo.start(session, draft());
  const full = draft('largest');
  for (const field of ['availableResources', 'successCriteria', 'founderDescription'] as const) full.answers[field] = '🦉'.repeat(10000);
  assert.ok(Buffer.byteLength(JSON.stringify(intakeInput(full))) < CREATION_STORAGE_BYTES);
  assert.deepEqual((await h.repo.start(session, full)).intake, full);
  const before = h.calls.length;
  for (const c of [{ ...config(), publicName: 'x'.repeat(121) }, { ...config(), publicDescription: 'x'.repeat(2001) },
    { ...config(), accountLabel: 'a.b' }, { ...config(), accountLabel: 'x'.repeat(64) },
    { ...config(), secondSteward: 'a.near' }, { ...config(), threshold: 1 }, { ...config(), publishedAt: now },
    { ...config(), publicDescription: '\u0000' }, { ...config(), publicDescription: '\ud800' }]) {
    await assert.rejects(h.repo.updateConfiguration(session, a.id, 1, c), /invalid_creation/);
  }
  for (const rev of [0, -1, 1.1, NaN, Number.MAX_SAFE_INTEGER]) await assert.rejects(h.repo.updateConfiguration(session, a.id, rev, config()), /invalid_creation_revision/);
  assert.equal(h.calls.length, before);
  await assert.rejects(h.repo.updateConfiguration(session, a.id, 1, { ...config(), secondSteward: founder }), /invalid_creation_configuration/);
  await assert.rejects(h.repo.start(session, { ...draft(), answers: { ...draft().answers, founderDescription: 'x'.repeat(20001) } }), /invalid_creation/);
});

test('adapter uses parameterized server functions, hashes only and no runtime database import', async () => {
  const h = harness(), payload = { ...draft(), projectName: "a'; DROP TABLE projects; --" };
  const a = await h.repo.start(session, payload);
  await h.repo.updateConfiguration(session, a.id, 1, config());
  await h.repo.read(session, a.id); await h.repo.list(session);
  for (const { sql, args } of h.calls) {
    assert.match(sql, /^SELECT \* FROM yawrd\.creation_[a-z_]+\(\$1/);
    assert.doesNotMatch(sql, /DROP|PRIVATE|founder\.testnet|yawrd\.projects/);
    assert.equal(args[0], session);
  }
  const adapter = await readFile(new URL('../src/creation/repository.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(adapter, /import\s+\{\s*database\s*\}|process\.env|fetch\(|use server|fee_|creation_attempts/);
});

test('SQL remains a deferred isolated proposal with identity/review guards and closed PUBLIC execution', async () => {
  const sql = await readFile(new URL('../docs/proposals/migrations/phase2_private_creation_p1.sql', import.meta.url), 'utf8');
  assert.doesNotMatch((await readdir(new URL('../migrations/', import.meta.url))).join('\n'), /private_creation|creation_p1/);
  assert.deepEqual([...sql.matchAll(/CREATE TABLE ([a-z_.]+)/g)].map(m => m[1]), ['yawrd.creation_drafts']);
  assert.doesNotMatch(sql, /(?:INSERT INTO|UPDATE|ALTER TABLE|REFERENCES) yawrd\.projects|fee_|CREATE.*creation_attempts|^GRANT /m);
  for (const name of [...sql.matchAll(/CREATE FUNCTION yawrd\.(\w+)/g)].map(m => m[1])) assert.match(sql, new RegExp('REVOKE ALL ON FUNCTION yawrd\\.' + name + '\\('));
  assert.match(sql, /UNIQUE \(network, founder_account_id, source_draft_id\)/);
  assert.match(sql, /NEW\.initial_intake IS DISTINCT FROM OLD\.initial_intake/);
  assert.match(sql, /NEW\.reviewed_revision := NULL/);
  assert.match(sql, /FOR UPDATE/); assert.match(sql, /FOR SHARE/);
  assert.match(sql, /PERFORM yawrd\.creation_founder\(_session\)/);
  assert.match(sql, /SECURITY INVOKER/); assert.doesNotMatch(sql, /SECURITY DEFINER/);
});
