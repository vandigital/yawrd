import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { applyRestoredIntake } from '../src/creation-intake.ts';
import { creationRequest } from '../src/creation/http.ts';
import { hashToken, SESSION_COOKIE } from '../src/participants/auth.ts';
import { createEmptyYawrdIntakeDraft, updateYawrdIntakeDraft } from '../src/yawrd-intake.ts';
import type { Query, Row } from '../src/participants/database.ts';

const origin = 'https://yawrd.example';
const tokenA = 'a'.repeat(43), tokenA2 = 'c'.repeat(43), tokenB = 'b'.repeat(43);
const now = '2026-11-18T00:00:00.000Z';
const draft = () => ({ ...updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft('source', now), {
  projectType: 'community', startingPoint: 'idea', intendedBudget: 'undecided',
  availableResources: 'Private resources', successCriteria: 'Private result', initialOutcomeConfirmed: true,
  founderDescription: 'PRIVATE wording ' + '🦉'.repeat(5000),
}, now), projectName: 'Private project' });
const configuration = { publicName: 'Proposed public name', publicDescription: 'Separate public summary', accountLabel: 'project', secondSteward: 'neighbor.testnet', threshold: 2 };

// Query double checks the HTTP-to-P1 contract; PostgreSQL semantics were accepted
// in P2 and are not reproved here. All application/repository code is real.
function harness() {
  const sessions = new Map([[hashToken(tokenA), 'a.testnet'], [hashToken(tokenA2), 'a.testnet'], [hashToken(tokenB), 'b.testnet']]);
  const records = new Map<string, Row>();
  const calls: { sql: string; args: unknown[] }[] = [];
  const fail = (message: string): never => { throw Object.assign(new Error(message), { code: 'P0001' }); };
  const query: Query = async (sql, args = []) => {
    calls.push({ sql, args });
    const actor = sessions.get(String(args[0]));
    if (sql.includes('FROM yawrd.sessions')) {
      assert.match(sql, /network = 'testnet' AND revoked_at IS NULL[\s\S]*expires_at > clock_timestamp/);
      return actor ? [{ account_id: actor }] : [];
    }
    assert.match(sql, /^SELECT \* FROM yawrd\.creation_/);
    if (!actor) return fail('sign_in_required');
    if (sql.includes('creation_find_start')) {
      const intake=JSON.parse(String(args[1])),matching=[...records.values()].filter(r=>r.founder_account_id===actor&&r.source_draft_id===intake.draftId);
      if(matching.length&&!isDeepStrictEqual(matching[0].initial_intake,intake))return fail('creation_import_conflict');
      return matching;
    }
    if (sql.includes('creation_start')) {
      const intake = JSON.parse(String(args[2]));
      const row = { id: args[1], founder_account_id: actor, source_draft_id: intake.draftId,
        revision: 1, initial_intake: intake, intake, public_name: '', public_description: '', account_label: '', second_steward: '',
        public_text_digest: '0'.repeat(64), reviewed_revision: null, created_at: now, updated_at: now };
      records.set(String(args[1]), row); return [structuredClone(row)];
    }
    if (sql.includes('creation_list')) return [...records.values()].filter(r => r.founder_account_id === actor).map(r => ({ ...r, display_name: (r.intake as { projectName: string }).projectName }));
    const row = records.get(String(args[1]));
    if (!row || row.founder_account_id !== actor) return fail('creation_not_found');
    if (sql.includes('creation_read')) return [structuredClone(row)];
    assert.match(sql, /creation_save/);
    if (args[2] !== row.revision) return fail('creation_revision_conflict');
    if (args[3]) { const intake=JSON.parse(String(args[3]));if(intake.draftId!==row.source_draft_id)return fail('creation_draft_identity_conflict');row.intake=intake; }
    else { const c = JSON.parse(String(args[4])); Object.assign(row, { public_name: c.publicName, public_description: c.publicDescription, account_label: c.accountLabel, second_steward: c.secondSteward }); }
    row.revision = Number(row.revision) + 1;
    return [structuredClone(row)];
  };
  async function send(method = 'GET', id: string | null = null, data?: unknown, token: string | null = tokenA, header = 'a.testnet', headers: Record<string, string> = {}, suffix = '') {
    return creationRequest(new Request(origin + '/api/creations' + (id ? '/' + id : '') + suffix, {
      method, headers: { host: 'yawrd.example', origin, 'sec-fetch-site': 'same-origin', 'x-yawrd-account': header,
        ...(token ? { cookie: SESSION_COOKIE + '=' + token } : {}), ...(data ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(data ? { body: JSON.stringify(data) } : {}),
    }), id, query, origin);
  }
  return { send, calls, sessions, records, query };
}

test('HTTP creates, saves and resumes under a new verified founder session without public approval', async () => {
  const h = harness(), input = draft();
  let response = await h.send('POST', null, { intake: input });
  assert.equal(response.status, 200);
  const first = (await response.json()).creation;
  assert.equal(first.founderAccountId, 'a.testnet');
  assert.equal(first.configuration.publicName, ''); assert.equal(first.configuration.publicDescription, '');
  assert.equal(first.publicTextReview, null);
  response = await h.send('PATCH', first.id, { expectedRevision: 1, configuration });
  assert.equal(response.status, 200); assert.equal((await response.json()).creation.revision, 2);
  response = await h.send('GET', first.id, undefined, tokenA2);
  const resumed = (await response.json()).creation;
  assert.deepEqual(resumed.intake, input); assert.deepEqual(resumed.configuration, configuration);
  assert.equal(resumed.publicTextReview, null);
  const edited = { ...input, projectName: 'Edited private project' };
  assert.equal((await h.send('PATCH', first.id, { expectedRevision: 2, intake: edited }, tokenA2)).status, 200);
  response = await h.send('PATCH', first.id, { expectedRevision: 2, configuration: { ...configuration, publicName: 'Stale edit' } });
  assert.equal(response.status, 409); assert.deepEqual(await response.json(), { error: 'creation_revision_conflict' });
  assert.equal(h.records.get(first.id)?.public_name, configuration.publicName);
  response = await h.send(); const page = await response.json();
  assert.equal(page.items[0].displayName, edited.projectName);
  assert.doesNotMatch(JSON.stringify(page), /PRIVATE|founderDescription|initialIntake|publicTextReview|configuration/);
  assert.match(response.headers.get('cache-control')!, /private, no-store/);
  assert.equal(response.headers.get('vary'), 'Cookie');
  assert.ok(h.calls.every(c => !/creation_review_public_text|yawrd\.projects|INSERT INTO|UPDATE /.test(c.sql)));
});

test('HTTP denies cross-founder reads and writes and stale-account imports', async () => {
  const h = harness();
  const { creation } = await (await h.send('POST', null, { intake: draft() })).json();
  for (const [method, data] of [['GET', undefined], ['PATCH', { expectedRevision: 1, configuration }], ['PATCH', { expectedRevision: 1, intake: draft() }]] as const) {
    const response = await h.send(method, creation.id, data, tokenB, 'b.testnet');
    assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'creation_not_found' });
  }
  assert.deepEqual(await (await h.send('GET', null, undefined, tokenB, 'b.testnet')).json(), { items: [], nextAfterId: null });
  const before = h.calls.length;
  assert.equal((await h.send('POST', null, { intake: draft() }, tokenB, 'a.testnet')).status, 409);
  assert.equal(h.calls.length, before + 1, 'stale identity rejected before any repository operation');
  assert.equal(h.records.size, 1); assert.equal(h.records.get(creation.id)?.revision, 1);
  assert.ok(h.calls.filter(c => c.sql.includes('creation_read') || c.sql.includes('creation_save')).every(c => c.args[0] === hashToken(tokenB)));
});

test('HTTP rejects missing/expired/revoked sessions, forged identity, origin and extra operations', async () => {
  const h = harness();
  assert.equal((await h.send('POST', null, { intake: draft() }, null)).status, 401);
  assert.equal((await h.send('GET', null, undefined, 'd'.repeat(43))).status, 401);
  h.sessions.delete(hashToken(tokenA));
  assert.equal((await h.send()).status, 401);
  h.sessions.set(hashToken(tokenA), 'a.testnet');
  for (const extra of [{ founderAccountId: 'b.testnet' }, { sessionHash: hashToken(tokenB) }, { consent: true }, { publicTextReview: {} }])
    assert.equal((await h.send('POST', null, { intake: draft(), ...extra })).status, 400);
  assert.equal((await h.send('POST', null, { intake: draft() }, tokenA, 'a.testnet', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await h.send('GET', null, undefined, tokenA, 'a.testnet', { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await h.send('POST', null, { intake: draft() }, tokenA, 'a.testnet', { host: 'evil.example' })).status, 403);
  assert.equal((await h.send('GET', null, undefined, tokenA, 'a.testnet', {}, '?founder=b.testnet')).status, 400);
  assert.equal((await h.send('GET', 'not-an-id')).status, 400);
  assert.equal((await h.send('DELETE')).status, 405);
  assert.equal((await h.send('POST', null, { intake: 'x'.repeat(540000) })).status, 413);
  const { creation } = await (await h.send('POST', null, { intake: draft() })).json();
  assert.equal((await h.send('PATCH', creation.id, { expectedRevision: 1, configuration, intake: draft() })).status, 400);
  assert.equal((await h.send('PATCH', creation.id, { expectedRevision: 1, configuration, consent: true })).status, 400);
  assert.equal((await h.send('PATCH', creation.id, { expectedRevision: 0, configuration })).status, 400);
});

test('HTTP sanitizes database errors and fails closed without configured origin', async () => {
  const request = new Request(origin + '/api/creations', { headers: { host: 'yawrd.example', cookie: SESSION_COOKIE + '=' + tokenA, 'x-yawrd-account': 'a.testnet' } });
  const unavailable: Query = async () => { throw new Error('PRIVATE database detail'); };
  const response = await creationRequest(request, null, unavailable, origin);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'service_unavailable' });
  assert.equal((await creationRequest(request, null, unavailable, null)).status, 503);
});

test('edited export start conflicts, then owned read and reviewed PATCH recover the same Creation without changing configuration', async () => {
  const h=harness(),input=draft();
  const first=(await (await h.send('POST',null,{intake:input})).json()).creation;
  await h.send('PATCH',first.id,{expectedRevision:1,configuration});
  const restored={...input,projectName:'Yawrd Public Beta Test',createdAt:'2026-01-01T00:00:00.000Z'};
  const conflict=await h.send('POST',null,{intake:restored});
  assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{error:'creation_import_conflict'});
  const selected=(await (await h.send('GET',first.id,undefined,tokenA2)).json()).creation;
  const editable=applyRestoredIntake(selected.intake,{...restored,draftId:'another-export-id'},'2026-11-18T01:00:00.000Z');
  const response=await h.send('PATCH',selected.id,{expectedRevision:selected.revision,intake:editable},tokenA2);
  assert.equal(response.status,200);const saved=(await response.json()).creation;
  assert.equal(saved.id,first.id);assert.equal(saved.sourceDraftId,first.sourceDraftId);assert.equal(saved.intake.createdAt,input.createdAt);
  assert.equal(saved.intake.projectName,'Yawrd Public Beta Test');assert.deepEqual(saved.initialIntake,input);assert.deepEqual(saved.configuration,configuration);
  assert.equal(saved.publicTextReview,null);assert.equal(h.records.size,1);
  assert.equal(h.calls.filter(c=>c.sql.includes('creation_start(')).length,1);
  assert.equal((await h.send('PATCH',saved.id,{expectedRevision:selected.revision,intake:editable})).status,409);
  assert.equal((await h.send('PATCH',saved.id,{expectedRevision:saved.revision,intake:editable},tokenB,'b.testnet')).status,404);
});
