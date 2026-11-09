import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import { TestnetWalletProvider } from '../app/use-testnet-wallet.ts';
function renderToStaticMarkup(element: Parameters<typeof renderMarkup>[0]) {
  return renderMarkup(createElement(TestnetWalletProvider, null, element));
}
import { ContributionRepository } from '../src/contributions/repository.ts';
import { contributionRequest } from '../src/contributions/http.ts';
import { CONTRIBUTION_TASKS, contributionActivation, contributionsActive, contributionPreviewEnabled, type ContributionActivation } from '../src/contributions/policy.ts';
import { contributionExample } from '../src/contributions/preview-data.ts';
import { ACK_CONSENT, REQUEST_CONSENT, type TaskRef } from '../src/contributions/types.ts';
import { SESSION_COOKIE, hashToken } from '../src/participants/auth.ts';
import type { Query, Row } from '../src/participants/database.ts';
import { ContributionWorkspace, ContributionExperience } from '../app/components/contribution-workspace.tsx';
import { PersistedYawrdPresentation } from '../app/components/persisted-yawrd.tsx';
import { GENESIS_YAW_001 as g } from '../src/genesis/yaw-001.ts';
import type { ParticipantView } from '../src/participants/types.ts';

const origin = 'https://yawrd.example';
const tokens = { a: 'a'.repeat(43), b: 'b'.repeat(43), founder: 'c'.repeat(43), outsider: 'd'.repeat(43) };
const owners = { 'task-a': 'synthetic-a.testnet', 'task-b': 'keelbase1.testnet' };
const enabled = (): ContributionActivation => ({ enabled: true, migrationVerified: true, permissionsVerified: true, databaseTestsVerified: true, recipientPolicyApproved: true, taskMappingVerified: true, submissionSignatureVerified: true, owners: { ...owners } });
function submission(taskRef: TaskRef = 'task-a') { return { kind: 'request', taskRef, prUrl: CONTRIBUTION_TASKS[taskRef].prUrl, description: 'Current request for the preserved original work.', recipientAccountId: owners[taskRef], consent: true, consentVersion: REQUEST_CONSENT }; }
function acknowledgement(taskRef: TaskRef = 'task-a') { return { kind: 'acknowledgement', taskRef, prUrl: CONTRIBUTION_TASKS[taskRef].prUrl, evidence: 'Synthetic founder approval reference for an offline test.', historicalAcceptedOn: null, historicalAcceptedAt: null, consent: true, consentVersion: ACK_CONSENT }; }

// Adapter double exercises the ACTUAL repository/HTTP handler. It models unique
// inserts and SQL authorization, not PostgreSQL execution or genuine concurrency.
function harness(activation = enabled()) {
  const state = {
    published: true, dao: g.daoAccountId as string, creator: g.creatorAccountId as string,
    sessions: new Map(Object.entries(tokens).map(([key, token]) => [hashToken(token), { account: key === 'founder' ? g.creatorAccountId : key === 'a' ? owners['task-a'] : key === 'b' ? owners['task-b'] : 'synthetic-outsider.testnet', live: true, network: 'testnet' }])),
    memberships: new Map<string, string>([[owners['task-a'], 'approved'], [owners['task-b'], 'approved']]),
    rows: new Map<string, Row>(), queries: [] as { text: string; args: unknown[] }[],
    beforeWrite: null as null | (() => void), databaseFailure: false,
  };
  const query: Query = async (text, args = []) => {
    state.queries.push({ text, args });
    if (state.databaseFailure) throw new Error('PRIVATE_DATABASE_SENTINEL');
    const write = text.startsWith('INSERT INTO yawrd.yaw001_contribution_events');
    if (write) state.beforeWrite?.();
    const session = state.sessions.get(String(args[0]));
    const live = session?.live && session.network === 'testnet' && state.published && state.dao === g.daoAccountId && state.creator === g.creatorAccountId;
    if (!live || !session) return [];
    const account = session.account;
    const approved = state.memberships.get(account) === 'approved';
    const application = state.memberships.has(account) ? account === owners['task-a'] ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002' : null;
    if (text.startsWith('SELECT s.account_id')) return [{ account_id: account, application_id: application, decision: approved ? 'approved' : null }];
    if (text.startsWith('SELECT e.task_ref')) {
      return [...state.rows.values()].filter(row => account === g.creatorAccountId || (approved
        && (row.task_ref === 'task-a' ? args[1] : args[2]) === account
        && (row.event_kind === 'acknowledgement' || row.actor_account_id === account)));
    }
    assert.ok(write, text);
    const request = text.includes("$2, 'request'");
    const allowed = request ? approved && args[2] === account && args[7] === account : account === g.creatorAccountId;
    const key = `${args[1]}:${request ? 'request' : 'acknowledgement'}`;
    if (!allowed || state.rows.has(key)) return [];
    const row = { task_ref: args[1], event_kind: request ? 'request' : 'acknowledgement', actor_account_id: account,
      recorded_at: new Date(946857600000 + state.rows.size * 1000), application_id: request ? application : null,
      description: request ? args[6] : null, recipient_account_id: request ? args[7] : null,
      historical_acceptance_evidence: request ? null : args[6], historical_accepted_on: request ? null : args[7], historical_accepted_at: request ? null : args[8],
    };
    state.rows.set(key, row);
    return [{ task_ref: args[1] }];
  };
  return { state, repo: new ContributionRepository(query, activation), activation };
}
function request(method = 'POST', data: unknown = submission(), token: string | null = tokens.a, headers: Record<string, string> = {}, search = '') {
  return new Request(`${origin}/api/yawrd/yaw-001/contributions${search}`, { method, headers: { host: 'yawrd.example', origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}), ...headers }, ...(method === 'GET' ? {} : { body: JSON.stringify(data) }) });
}
const call = (h: ReturnType<typeof harness>, data: unknown = submission(), token: string | null = tokens.a, method = 'POST') => contributionRequest(request(method, data, token), 'yaw-001', h.repo, origin);

test('shipped policy stays inactive under every environment flag; no table query or write', async () => {
  for (const flag of [undefined, '', '0', '1', 'true']) {
    const h = harness(contributionActivation({ YAWRD_ENABLE_YAW001_CONTRIBUTIONS: flag }));
    assert.equal(contributionsActive(h.activation), false);
    assert.deepEqual(h.activation.owners, { 'task-a': null, 'task-b': 'keelbase1.testnet' });
    for (const [input, token] of [[submission(), tokens.a], [acknowledgement(), tokens.founder]] as const) {
      const response = await call(h, input, token);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'contributions_inactive' });
    }
    assert.equal((await call(h, undefined, tokens.a, 'GET')).status, 503);
    assert.equal(h.state.queries.length, 0);
  }
});
for (const gate of ['enabled', 'migrationVerified', 'permissionsVerified', 'databaseTestsVerified', 'recipientPolicyApproved', 'taskMappingVerified', 'submissionSignatureVerified'] as const) test(`${gate} is independently required`, async () => {
  const policy = enabled(); policy[gate] = false;
  const h = harness(policy);
  assert.equal((await call(h)).status, 503);
  assert.equal(h.state.queries.length, 0);
});
test('approved assigned participant submits; DTO excludes private application/agent/session data', async () => {
  const h = harness();
  const response = await call(h);
  assert.equal(response.status, 200);
  const view = await response.json();
  assert.equal(view.tasks.length, 1);
  assert.equal(view.tasks[0].ref, 'task-a');
  assert.equal(view.tasks[0].request.recipientAccountId, owners['task-a']);
  assert.equal(view.tasks[0].request.recordedAt, '2000-01-03T00:00:00.000Z');
  assert.equal(h.state.rows.size, 1);
  assert.doesNotMatch(JSON.stringify(view), /application_id|00000000|agent_reference|token_hash|publicKey|signature/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(response.headers.get('vary'), 'Cookie');
});
test('creator sees pending requests and both tasks; other owner sees only their task', async () => {
  const h = harness(); await call(h);
  const founder = await (await call(h, undefined, tokens.founder, 'GET')).json();
  assert.equal(founder.role, 'creator');
  assert.equal(founder.tasks.length, 2);
  assert.equal(founder.tasks[0].request.actorAccountId, owners['task-a']);
  const other = await (await call(h, undefined, tokens.b, 'GET')).json();
  assert.equal(other.tasks[0].ref, 'task-b');
  assert.equal(other.tasks[0].request, null);
  assert.doesNotMatch(JSON.stringify(other), /synthetic-a\.testnet|Current request/);
});
test('Task A adapter submission retains evidence; Task B cannot use the old unsigned path', async () => {
  const h = harness();
  assert.equal((await call(h, submission('task-a'), tokens.a)).status, 200);
  assert.equal((await call(h, submission('task-b'), tokens.b)).status, 401);
  for (const write of h.state.queries.filter(q => q.text.startsWith('INSERT'))) {
    const ref = write.args[1] as TaskRef;
    assert.equal(write.args[2], owners[ref]);
    assert.deepEqual(write.args.slice(3, 6), [CONTRIBUTION_TASKS[ref].prUrl, CONTRIBUTION_TASKS[ref].head, CONTRIBUTION_TASKS[ref].merge]);
  }
  assert.equal(h.state.rows.size, 1);
});
test('injected shared ownership does not bypass Task B signature verification', async () => {
  const h = harness({ ...enabled(), owners: { 'task-a': owners['task-b'], 'task-b': owners['task-b'] } });
  assert.equal((await call(h, { ...submission('task-a'), recipientAccountId: owners['task-b'] }, tokens.b)).status, 200);
  assert.equal((await call(h, submission('task-b'), tokens.b)).status, 401);
  const records = [...h.state.rows.values()];
  assert.equal(records.length, 1);
  assert.equal(records[0].task_ref, 'task-a');
});
for (const ackFirst of [true, false]) test(`request and acknowledgement are independent; ackFirst=${ackFirst}`, async () => {
  const h = harness();
  const ack = () => call(h, acknowledgement(), tokens.founder);
  if (ackFirst) { assert.equal((await ack()).status, 200); assert.equal(h.state.rows.size, 1); }
  assert.equal((await call(h)).status, 200);
  assert.equal((await ack()).status, 200);
  const view = await h.repo.state('yaw-001', hashToken(tokens.a));
  assert.equal(h.state.rows.size, 2);
  assert.equal(view.tasks[0].request?.actorAccountId, owners['task-a']);
  assert.equal(view.tasks[0].acknowledgement?.actorAccountId, g.creatorAccountId);
  assert.notEqual(view.tasks[0].request?.recordedAt, view.tasks[0].acknowledgement?.recordedAt);
  assert.equal(view.tasks[0].acknowledgement?.historicalAcceptedOn, null);
});
test('identical sequential/concurrent adapter retries preserve first receipt and actor', async () => {
  const h = harness();
  const responses = await Promise.all(Array.from({ length: 8 }, () => call(h)));
  assert.ok(responses.every(response => response.status === 200));
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.ok(bodies.every(body => JSON.stringify(body) === JSON.stringify(bodies[0])));
  assert.equal(h.state.rows.size, 1);
  const ackResponses = await Promise.all(Array.from({ length: 8 }, () => call(h, acknowledgement(), tokens.founder)));
  assert.ok(ackResponses.every(response => response.status === 200));
  assert.equal(h.state.rows.size, 2);
});
test('conflicting concurrent requests/acknowledgements cannot replace first facts', async () => {
  const h = harness();
  const responses = await Promise.all([call(h), call(h, { ...submission(), description: 'Different current request.' })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const acknowledgements = await Promise.all([call(h, acknowledgement(), tokens.founder), call(h, { ...acknowledgement(), evidence: 'Different evidence.' }, tokens.founder)]);
  assert.deepEqual(acknowledgements.map(response => response.status).sort(), [200, 409]);
  assert.equal(h.state.rows.size, 2);
});
for (const status of ['pending', 'rejected', 'none']) test(`${status} participant cannot submit or read`, async () => {
  const h = harness();
  if (status === 'none') h.state.memberships.delete(owners['task-a']); else h.state.memberships.set(owners['task-a'], status);
  assert.equal((await call(h)).status, 403);
  assert.equal((await call(h, undefined, tokens.a, 'GET')).status, 403);
  assert.equal(h.state.rows.size, 0);
});
test('unknown task ownership, other task claims, creator task claims and wrong recipient are denied', async () => {
  const h = harness();
  assert.equal((await call(h, submission(), tokens.b)).status, 403);
  assert.equal((await call(h, submission(), tokens.founder)).status, 403);
  assert.equal((await call(h, { ...submission(), recipientAccountId: owners['task-b'] })).status, 400);
  h.activation.owners = { 'task-a': null, 'task-b': owners['task-b'] };
  assert.deepEqual(await (await call(h)).json(), { error: 'task_owner_unconfirmed' });
  const view = await (await call(h, undefined, tokens.a, 'GET')).json();
  assert.deepEqual(view.tasks, []);
  assert.equal(h.state.rows.size, 0);
});
test('approved participant and outsider cannot acknowledge or gain creator review', async () => {
  const h = harness();
  assert.equal((await call(h, acknowledgement())).status, 403);
  assert.equal((await call(h, acknowledgement(), tokens.outsider)).status, 403);
  assert.equal((await call(h, undefined, tokens.outsider, 'GET')).status, 403);
});
for (const kind of ['request', 'acknowledgement'] as const) test(`write-time session loss blocks ${kind}`, async () => {
  const h = harness(); const token = kind === 'request' ? tokens.a : tokens.founder;
  h.state.beforeWrite = () => { h.state.sessions.get(hashToken(token))!.live = false; };
  assert.equal((await call(h, kind === 'request' ? submission() : acknowledgement(), token)).status, 401);
  assert.equal(h.state.rows.size, 0);
});
test('membership loss at write is rejected even after a successful context read', async () => {
  const h = harness(); h.state.beforeWrite = () => { h.state.memberships.set(owners['task-a'], 'rejected'); };
  assert.equal((await call(h)).status, 403);
  assert.equal(h.state.rows.size, 0);
});
test('expired/revoked and wrong-network sessions cannot read, write or replay receipts', async () => {
  for (const mutation of [{ live: false }, { network: 'mainnet' }]) {
    const h = harness(); await call(h);
    Object.assign(h.state.sessions.get(hashToken(tokens.a))!, mutation);
    assert.equal((await call(h)).status, 401);
    assert.equal((await call(h, undefined, tokens.a, 'GET')).status, 401);
    assert.equal(h.state.rows.size, 1);
  }
});
test('unpublished, mismatched DAO/creator, other project and anonymous requests fail closed', async () => {
  for (const mutation of [{ published: false }, { dao: 'other.testnet' }, { creator: 'other.testnet' }]) {
    const h = harness(); Object.assign(h.state, mutation);
    assert.equal((await call(h)).status, 401);
    assert.equal(h.state.rows.size, 0);
  }
  const h = harness();
  assert.equal((await call(h, submission(), null)).status, 401);
  assert.equal((await contributionRequest(request(), 'other-project', h.repo, origin)).status, 404);
  assert.equal(h.state.queries.length, 0);
});
test('canonical PR and strict fields reject amount, actor, source, backdate and payment overrides', async () => {
  const h = harness();
  for (const extra of [{ amount: '1' }, { actorAccountId: g.creatorAccountId }, { recordedAt: '2000-01-01' }, { applicationId: 'x' }, { proposalId: '1' }, { transferHash: 'invented' }, { prHeadSha: '0'.repeat(40) }]) {
    assert.equal((await call(h, { ...submission(), ...extra })).status, 400);
    await assert.rejects(h.repo.submit('yaw-001', hashToken(tokens.a), { ...submission(), ...extra }), /invalid_request/);
  }
  for (const prUrl of [CONTRIBUTION_TASKS['task-b'].prUrl, `${submission().prUrl}/`, `${submission().prUrl}?x=1`, 'javascript:alert(1)']) assert.equal((await call(h, { ...submission(), prUrl })).status, 400);
  assert.equal((await call(h, { ...submission(), taskRef: 'task-c' })).status, 400);
  assert.equal(h.state.rows.size, 0);
});
test('bounded input and explicit consent are checked before any write', async () => {
  const h = harness();
  for (const description of ['', ' ', ' leading', 'trailing ', 'line\nbreak', '\u0000', 'x'.repeat(1001), null, []]) assert.equal((await call(h, { ...submission(), description })).status, 400);
  for (const consent of [false, 'true', 1, null]) assert.equal((await call(h, { ...submission(), consent })).status, 400);
  assert.equal((await call(h, { ...submission(), consentVersion: 'other' })).status, 400);
  for (const evidence of ['', ' ', '\n', 'x'.repeat(2001), null]) assert.equal((await call(h, { ...acknowledgement(), evidence }, tokens.founder)).status, 400);
  assert.equal(h.state.rows.size, 0);
});
test('unknown/date-only/exact historical precision survives acknowledgement without inventing time', async () => {
  for (const historical of [
    { historicalAcceptedOn: null, historicalAcceptedAt: null },
    { historicalAcceptedOn: '2000-01-01', historicalAcceptedAt: null },
    { historicalAcceptedOn: null, historicalAcceptedAt: '2000-01-01T00:00:00.123Z' },
  ]) {
    const h = harness();
    const response = await call(h, { ...acknowledgement(), ...historical }, tokens.founder);
    assert.equal(response.status, 200);
    const saved = (await response.json()).tasks[0].acknowledgement;
    assert.equal(saved.historicalAcceptedOn, historical.historicalAcceptedOn);
    assert.equal(saved.historicalAcceptedAt, historical.historicalAcceptedAt);
    assert.notEqual(saved.recordedAt, saved.historicalAcceptedAt);
    assert.equal(h.state.rows.size, 1);
    assert.equal(h.state.rows.has('task-a:request'), false);
  }
});
test('future, malformed, infinite and ambiguous acceptance timestamps are rejected', async () => {
  const h = harness();
  for (const historical of [
    { historicalAcceptedOn: '2000-01-01', historicalAcceptedAt: '2000-01-01T00:00:00.000Z' },
    { historicalAcceptedOn: '2026-02-30' }, { historicalAcceptedOn: '2999-01-01' },
    { historicalAcceptedAt: 'infinity' }, { historicalAcceptedAt: '2999-01-01T00:00:00.000Z' }, { historicalAcceptedAt: '2000-01-01' },
  ]) assert.equal((await call(h, { ...acknowledgement(), ...historical }, tokens.founder)).status, 400);
  assert.equal(h.state.rows.size, 0);
});
test('same-origin, method, query, JSON body, size and cookie protections are reused', async () => {
  const h = harness();
  const wrongOrigins: Record<string, string>[] = [{ origin: 'https://evil.example' }, { host: 'evil.example' }, { 'sec-fetch-site': 'cross-site' }];
  for (const headers of wrongOrigins) assert.equal((await contributionRequest(request('POST', submission(), tokens.a, headers), 'yaw-001', h.repo, origin)).status, 403);
  assert.equal((await contributionRequest(request('PUT'), 'yaw-001', h.repo, origin)).status, 405);
  assert.equal((await contributionRequest(request('GET', null, tokens.a, {}, '?task=task-a'), 'yaw-001', h.repo, origin)).status, 400);
  assert.equal((await contributionRequest(request('POST', submission(), tokens.a, { 'content-type': 'text/plain' }), 'yaw-001', h.repo, origin)).status, 400);
  assert.equal((await call(h, { ...submission(), description: 'x'.repeat(9000) })).status, 413);
  assert.equal((await contributionRequest(request('GET', null, tokens.a, { cookie: `${SESSION_COOKIE}=${tokens.a}; ${SESSION_COOKIE}=${tokens.a}` }), 'yaw-001', h.repo, origin)).status, 400);
  assert.equal((await contributionRequest(request(), 'yaw-001', h.repo, null)).status, 503);
  assert.equal(h.state.queries.length, 0);
});
test('database errors stay sanitized and never disclose private error details', async () => {
  const h = harness(); h.state.databaseFailure = true;
  const response = await call(h);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'service_unavailable' });
});
test('actual SQL reauthorizes writes, avoids update/sequence/timestamp grants and scopes reads', async () => {
  const h = harness(); await call(h); await call(h, acknowledgement(), tokens.founder);
  const writes = h.state.queries.filter(q => q.text.startsWith('INSERT'));
  assert.equal(writes.length, 2);
  for (const { text } of h.state.queries) {
    assert.match(text, /s\.token_hash = \$1/);
    assert.match(text, /s\.revoked_at IS NULL AND s\.expires_at > clock_timestamp\(\)/);
    assert.match(text, /p\.published_at IS NOT NULL/);
    assert.match(text, /p\.dao_account_id = 'demo.factory.yawrd.testnet'/);
    assert.match(text, /p\.creator_account_id = 'yawrd1.testnet'/);
  }
  for (const { text } of writes) {
    assert.match(text, /ON CONFLICT \(network, project_id, task_ref, event_kind\) DO NOTHING RETURNING task_ref/);
    assert.doesNotMatch(text, /DO UPDATE|nextval|INSERT[\s\S]*recorded_at/);
  }
  assert.match(writes[0].text, /d\.decision = 'approved'/);
  assert.match(writes[0].text, /s\.account_id = \$3 AND s\.account_id = \$8/);
  assert.match(writes[1].text, /s\.account_id = p\.creator_account_id AND s\.account_id = 'yawrd1.testnet'/);
  const reads = h.state.queries.filter(q => q.text.startsWith('SELECT e'));
  assert.ok(reads.every(q => q.text.includes('assignment.owner_account_id = s.account_id') && q.text.includes('e.actor_account_id = s.account_id')));
});
test('preview is development opt-in only and cannot activate real writes', () => {
  for (const NODE_ENV of ['production', 'test', 'development']) for (const flag of [undefined, '0', '1']) {
    const env = { NODE_ENV, YAWRD_ENABLE_CONTRIBUTION_PREVIEW: flag, YAWRD_ENABLE_YAW001_CONTRIBUTIONS: '1' };
    assert.equal(contributionPreviewEnabled(env), NODE_ENV === 'development' && flag === '1');
    assert.equal(contributionsActive(contributionActivation(env)), false);
  }
});
test('preview renders forms, distinct history, empty states, escaped text and no payment controls', () => {
  const actions = { onSubmit: async () => {}, onAcknowledge: async () => {} };
  for (const example of ['submit', 'review', 'acknowledged', 'unassigned', 'long-text'] as const) {
    const state = contributionExample(example);
    if (example === 'review') state.tasks[0].request!.description = '<script>private()</script>';
    const html = renderToStaticMarkup(createElement(ContributionExperience, { state, preview: true, ...actions }));
    assert.match(html, /Development Preview/);
    assert.doesNotMatch(html, /<script>|Approve Rewards|Send payment|Connect Meteor|proposalId|<iframe/);
    if (example === 'submit') assert.match(html, /Receiving wallet|Review submission draft/);
    if (example === 'review') assert.match(html, /&lt;script&gt;private\(\)&lt;\/script&gt;/);
    if (example === 'acknowledged') assert.match(html, /Historical acceptance|New in-app acknowledgement time|Exact date and time unconfirmed/);
    if (example === 'unassigned') assert.match(html, /No completed task is assigned/);
  }
});
test('normal approved/creator view shows inactive card; public/pending/rejected never gets workflow records', () => {
  const project = { id: g.id, network: g.network, creatorAccountId: g.creatorAccountId, name: g.name, description: g.description, objectives: [...g.objectives], participation: g.participation, rewards: g.rewards };
  for (const role of ['public', 'participant', 'creator'] as const) {
    const view: ParticipantView = { accountId: role === 'public' ? null : 'synthetic.testnet', role, application: null, applications: [], restrictedContent: null };
    const html = renderToStaticMarkup(createElement(PersistedYawrdPresentation, { project, view }));
    assert.equal(html.includes('Contribution requests · Not active'), role !== 'public');
    assert.doesNotMatch(html, /synthetic-contributor|Illustrative record|year-2000|Preview submission/);
  }
  const disabled = renderToStaticMarkup(createElement(ContributionWorkspace, { accountId: 'synthetic.testnet', active: false }));
  assert.doesNotMatch(disabled, /<form|<input|<button/);
});
test('production source cannot import preview fixtures or expose server manifest to a client module', () => {
  for (const file of ['app/components/contribution-workspace.tsx', 'src/contributions/types.ts', 'app/api/yawrd/[projectId]/[action]/route.ts']) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"][^'"]*(?:preview-data|dev\/contributions)/);
  }
  for (const file of ['src/contributions/repository.ts', 'src/contributions/policy.ts']) assert.match(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), /import 'server-only'/);
});
