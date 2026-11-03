import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { ParticipantRepository } from '../src/participants/repository.ts';
import { participantRequest } from '../src/participants/http.ts';
import { SESSION_COOKIE, hashToken } from '../src/participants/auth.ts';
import type { Query, Row } from '../src/participants/database.ts';

const origin = 'https://yawrd.example';
const token = 'a'.repeat(43), otherToken = 'b'.repeat(43);
const project = 'development-project';
const appId = '00000000-0000-4000-8000-000000000001';
const payload = { agentReference: 'ironclaw:independent-01', consent: true, consentVersion: 'agent-association-v1' };
const timestamp = new Date('2026-10-30T04:00:00.123Z');

// Isolated query adapter models the insert/select boundary and unique insert.
// SQL guard assertions below separately protect the actual statement structure.
// No Neon client or environment loader is imported or invoked.
function harness() {
  const state = {
    session: 'live' as 'live' | 'expired' | 'revoked',
    account: 'alice.testnet',
    membership: 'approved' as 'approved' | 'pending' | 'rejected' | 'none',
    approvedProjects: new Set([project]),
    approvedAccounts: new Set(['alice.testnet']),
    rows: new Map<string, Row>(),
    queries: [] as { text: string; args: unknown[] }[],
    beforeWrite: null as null | (() => void),
    databaseFailure: false,
  };
  const query: Query = async (text, args = []) => {
    state.queries.push({ text, args });
    if (state.databaseFailure) throw new Error('PRIVATE_DATABASE_SENTINEL');
    const writing = text.startsWith('INSERT INTO yawrd.agent_associations');
    if (writing) state.beforeWrite?.();
    const account = args[1] === hashToken(otherToken) ? 'other.testnet' : state.account;
    const live = state.session === 'live' && [hashToken(token), hashToken(otherToken)].includes(String(args[1]));
    const approved = live && state.approvedAccounts.has(account) && state.membership === 'approved' && state.approvedProjects.has(String(args[0]));
    const applicationId = args[0] === project && account === 'alice.testnet' ? appId : '00000000-0000-4000-8000-000000000002';
    const key = `${args[0]}:${account}`;
    if (writing) {
      if (approved && !state.rows.has(key)) state.rows.set(key, { application_id: applicationId, account_id: account, agent_reference: args[2], consent_version: payload.consentVersion, authorized_at: timestamp });
      return [];
    }
    assert.ok(text.startsWith('SELECT s.account_id, d.application_id'));
    return [{ account_id: live ? account : null, application_id: approved ? applicationId : null, ...(approved ? state.rows.get(key) : {}) }];
  };
  const repo = new ParticipantRepository(query);
  return { state, repo };
}
function request(method: string, data: unknown = payload, options: { token?: string | null; origin?: string; host?: string; site?: string } = {}) {
  return new Request(`${origin}/api/yawrd/${project}/agent-association`, {
    method,
    headers: { host: options.host ?? 'yawrd.example', origin: options.origin ?? origin, 'sec-fetch-site': options.site ?? 'same-origin', 'content-type': 'application/json', cookie: options.token === null ? '' : `${SESSION_COOKIE}=${options.token ?? token}` },
    ...(method === 'POST' ? { body: JSON.stringify(data) } : {}),
  });
}
function call(repo: ParticipantRepository, method = 'POST', data: unknown = payload, id = project, options = {}) {
  return participantRequest(request(method, data, options), id, 'agent-association', repo, origin);
}

test('approved operator creates and privately retrieves a project-scoped persisted association', async () => {
  const { repo, state } = harness();
  const empty = await call(repo, 'GET');
  assert.deepEqual(await empty.json(), { association: null });
  const created = await call(repo);
  assert.equal(created.status, 200);
  const expected = { association: { network: 'testnet', projectId: project, applicationId: appId, operatorAccountId: 'alice.testnet', agentReference: payload.agentReference, consentVersion: payload.consentVersion, authorizedAt: timestamp.toISOString() } };
  assert.deepEqual(await created.json(), expected);
  const retrieved = await call(repo, 'GET');
  assert.deepEqual(await retrieved.json(), expected);
  assert.equal(state.rows.size, 1);
  assert.equal(retrieved.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(retrieved.headers.get('vary'), 'Cookie');
  assert.equal(created.headers.get('set-cookie'), null);
  assert.doesNotMatch(JSON.stringify(expected), /publicKey|signature|token|restrictedContent/);
});

test('identical sequential and concurrent retries preserve the first reference and authorization time', async () => {
  const { repo, state } = harness();
  const responses = await Promise.all(Array.from({ length: 12 }, () => call(repo)));
  assert.ok(responses.every(r => r.status === 200));
  const results = await Promise.all(responses.map(r => r.json()));
  assert.ok(results.every(r => JSON.stringify(r) === JSON.stringify(results[0])));
  assert.deepEqual(await (await call(repo)).json(), results[0]);
  assert.equal(state.rows.size, 1);
});

test('concurrent conflicting submissions produce one winner and reject the other without overwrite', async () => {
  const { repo, state } = harness();
  const responses = await Promise.all([call(repo), call(repo, 'POST', { ...payload, agentReference: 'other:agent' })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const conflict = responses.find(r => r.status === 409)!;
  assert.deepEqual(await conflict.json(), { error: 'association_conflict' });
  assert.equal(state.rows.size, 1);
  assert.equal((await (await call(repo, 'GET')).json()).association.agentReference, payload.agentReference);
});

test('approved membership in two projects keeps associations independent', async () => {
  const { repo, state } = harness();
  state.approvedProjects.add('second-project');
  await call(repo);
  assert.deepEqual(await (await call(repo, 'GET', payload, 'second-project')).json(), { association: null });
  const second = await call(repo, 'POST', { ...payload, agentReference: 'second:agent' }, 'second-project');
  assert.equal(second.status, 200);
  assert.equal((await second.json()).association.projectId, 'second-project');
  assert.equal((await (await call(repo, 'GET')).json()).association.agentReference, payload.agentReference);
  assert.equal(state.rows.size, 2);
});

test('another approved participant can retrieve only their own association', async () => {
  const { repo, state } = harness();
  state.approvedAccounts.add('other.testnet');
  await call(repo);
  assert.deepEqual(await (await call(repo, 'GET', payload, project, { token: otherToken })).json(), { association: null });
  const other = await call(repo, 'POST', { ...payload, agentReference: 'other:agent' }, project, { token: otherToken });
  assert.equal(other.status, 200);
  assert.equal((await other.json()).association.operatorAccountId, 'other.testnet');
  assert.equal((await (await call(repo, 'GET')).json()).association.agentReference, payload.agentReference);
});

test('unknown or unpublished projects return not_found without an association', async () => {
  const repo = new ParticipantRepository(async () => []);
  for (const method of ['GET', 'POST']) {
    const response = await call(repo, method);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  }
});

for (const method of ['GET', 'POST']) {
  test(`${method}: anonymous request fails before database access`, async () => {
    const { repo, state } = harness();
    assert.equal((await call(repo, method, payload, project, { token: null })).status, 401);
    assert.equal(state.queries.length, 0);
  });
  for (const session of ['expired', 'revoked'] as const) {
    test(`${method}: ${session} session cannot access an existing association`, async () => {
      const { repo, state } = harness();
      await call(repo);
      state.session = session;
      const response = await call(repo, method);
      assert.equal(response.status, 401);
      assert.doesNotMatch(await response.text(), /ironclaw/);
      assert.equal(state.rows.size, 1);
    });
  }
  for (const membership of ['pending', 'rejected', 'none'] as const) {
    test(`${method}: ${membership} membership is denied, including creator-only access`, async () => {
      const { repo, state } = harness();
      state.membership = membership;
      if (membership === 'none') state.account = 'creator.testnet';
      assert.equal((await call(repo, method)).status, 403);
      assert.equal(state.rows.size, 0);
    });
  }
  test(`${method}: cross-project and other-operator access cannot reveal or create an association`, async () => {
    const { repo, state } = harness();
    await call(repo);
    for (const response of [await call(repo, method, payload, 'other-project'), await call(repo, method, payload, project, { token: otherToken })]) {
      assert.equal(response.status, 403);
      assert.doesNotMatch(await response.text(), /ironclaw/);
    }
    assert.equal(state.rows.size, 1);
  });
}

test('forged operator, application, network, project, timestamp and extra identity fields are rejected before queries', async () => {
  for (const field of ['accountId', 'operatorAccountId', 'applicationId', 'network', 'projectId', 'authorizedAt']) {
    const { repo, state } = harness();
    assert.equal((await call(repo, 'POST', { ...payload, [field]: 'forged' })).status, 400);
    assert.equal(state.queries.length, 0);
  }
});

test('missing, false, nonboolean or wrong-version consent cannot write', async () => {
  for (const data of [
    { agentReference: payload.agentReference },
    ...[false, 'true', null, 1].map(consent => ({ ...payload, consent })),
    ...['participant-v1', '', null].map(consentVersion => ({ ...payload, consentVersion })),
  ]) {
    const { repo, state } = harness();
    assert.equal((await call(repo, 'POST', data)).status, 400);
    assert.equal(state.queries.length, 0);
  }
});

test('invalid and oversized references fail while the exact 200-character bound succeeds', async () => {
  for (const agentReference of ['', ' ', ' padded', 'has space', 'line\nfeed', 'agent\n', 'agent\r', '<script>', 'agent?key=secret', '💻', null, 123, 'a'.repeat(201)]) {
    const { repo, state } = harness();
    assert.equal((await call(repo, 'POST', { ...payload, agentReference })).status, 400);
    assert.equal(state.queries.length, 0);
  }
  assert.equal((await call(harness().repo, 'POST', { ...payload, agentReference: 'a'.repeat(200) })).status, 200);
});

test('origin, host, fetch metadata, HTTP methods, invalid JSON and body bounds retain existing protection', async () => {
  const { repo, state } = harness();
  for (const method of ['GET', 'POST']) {
    for (const options of [{ origin: 'https://evil.example', host: 'evil.example' }, { host: 'evil.example' }, { site: 'cross-site' }]) {
      assert.equal((await call(repo, method, payload, project, options)).status, 403);
    }
  }
  assert.equal((await call(repo, 'POST', payload, project, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await participantRequest(request('DELETE'), project, 'agent-association', repo, origin)).status, 405);
  const invalid = request('POST');
  const malformed = new Request(invalid.url, { method: 'POST', headers: invalid.headers, body: '{' });
  assert.equal((await participantRequest(malformed, project, 'agent-association', repo, origin)).status, 400);
  assert.equal((await call(repo, 'POST', { ...payload, agentReference: 'a'.repeat(9000) })).status, 413);
  assert.equal(state.queries.length, 0);
});

test('membership is revalidated at write time, and session loss before the write also fails closed', async () => {
  for (const revoked of ['membership', 'session']) {
    const { repo, state } = harness();
    state.beforeWrite = () => { if (revoked === 'membership') state.membership = 'rejected'; else state.session = 'revoked'; };
    assert.equal((await call(repo)).status, revoked === 'membership' ? 403 : 401);
    assert.equal(state.rows.size, 0);
  }
});

test('database failures remain sanitized, including an inactive/missing association table', async () => {
  const { repo, state } = harness();
  state.databaseFailure = true;
  for (const method of ['GET', 'POST']) {
    const response = await call(repo, method);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'service_unavailable' });
  }
});

test('actual SQL guards bind identity and membership at insert/read; draft remains inactive with minimal grants', async () => {
  const { repo, state } = harness();
  await call(repo);
  assert.equal(state.queries.length, 2);
  for (const { text, args } of state.queries) {
    assert.match(text, /s\.token_hash = \$2 AND s\.network = 'testnet' AND s\.revoked_at IS NULL AND s\.expires_at > clock_timestamp\(\)/);
    assert.match(text, /a\.network = p\.network AND a\.project_id = p\.id AND a\.account_id = s\.account_id/);
    assert.match(text, /d\.application_id = a\.id AND d\.decision = 'approved'/);
    assert.match(text, /p\.network = 'testnet' AND p\.id = \$1 AND p\.published_at IS NOT NULL/);
    assert.deepEqual(args.slice(0, 2), [project, hashToken(token)]);
    assert.ok(!args.includes('alice.testnet') && !args.includes(appId));
  }
  assert.match(state.queries[0].text, /ON CONFLICT \(application_id\) DO NOTHING/);
  assert.doesNotMatch(state.queries[0].text, /DO UPDATE/);
  const draft = readFileSync(new URL('../docs/proposals/migrations/m08_agent_association.sql', import.meta.url), 'utf8');
  assert.match(draft, /application_id uuid PRIMARY KEY/);
  assert.match(draft, /FOREIGN KEY \(application_id, network, project_id\)\s+REFERENCES yawrd\.applications\(id, network, project_id\)/);
  assert.match(draft, /BEFORE INSERT ON yawrd\.agent_associations/);
  assert.match(draft, /d\.application_id = NEW.application_id AND d\.network = NEW.network\s+AND d\.project_id = NEW.project_id AND d\.decision = 'approved'/);
  assert.match(draft, /NEW.authorized_at := clock_timestamp\(\)/);
  assert.match(draft, /BEFORE UPDATE OR DELETE/);
  assert.match(draft, /GRANT SELECT ON yawrd.agent_associations TO yawrd_07b_runtime/);
  assert.match(draft, /GRANT INSERT \(application_id, network, project_id, agent_reference, consent_version\)/);
  assert.doesNotMatch(draft, /GRANT (?:UPDATE|DELETE|ALL|EXECUTE)/);
  assert.deepEqual(readdirSync(new URL('../migrations/', import.meta.url)).sort(), ['001_participants.sql', '003_genesis_draft_linking.sql']);
});
