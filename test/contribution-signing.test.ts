import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { signTaskBRequest } from '../app/components/contribution-workspace.tsx';
import { ContributionRepository } from '../src/contributions/repository.ts';
import { contributionRequest } from '../src/contributions/http.ts';
import { contributionActivation, CONTRIBUTION_TASKS, type ContributionActivation } from '../src/contributions/policy.ts';
import { REQUEST_CONSENT, ACK_CONSENT, SUBMISSION_RECIPIENT, type RequestInput } from '../src/contributions/types.ts';
import { AUTH_RECIPIENT, SESSION_COOKIE, hashToken } from '../src/participants/auth.ts';
import { serializeNep413, testnetAccessKeyVerifier } from '../src/identity/nep413.ts';
import type { IdentityChallenge } from '../src/identity/types.ts';
import type { Query, Row } from '../src/participants/database.ts';

const origin = 'https://yawrd.example';
const account = 'keelbase1.testnet';
const token = 'b'.repeat(43), otherSession = 'e'.repeat(43), wrongWallet = 'w'.repeat(43), founder = 'f'.repeat(43);
const terms = CONTRIBUTION_TASKS['task-b'];
const draft: RequestInput = { kind: 'request', taskRef: 'task-b', prUrl: terms.prUrl,
  description: 'Completed Task B Crew and Contributions component.', recipientAccountId: account, consent: true, consentVersion: REQUEST_CONSENT };
const active = (): ContributionActivation => ({ ...contributionActivation({}), enabled: true, migrationVerified: true,
  permissionsVerified: true, databaseTestsVerified: true, recipientPolicyApproved: true, taskMappingVerified: true, submissionSignatureVerified: true });

// Ephemeral synthetic keys only. No genuine wallet, RPC or database access.
const pair = generateKeyPairSync('ed25519');
const raw = pair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let n = BigInt(`0x${raw.toString('hex')}`), encoded = '';
while (n) { encoded = alphabet[Number(n % BigInt(58))] + encoded; n /= BigInt(58); }
for (const byte of raw) { if (byte) break; encoded = '1' + encoded; }
const publicKey = `ed25519:${encoded}`;
function proof(c: Pick<IdentityChallenge, 'message' | 'nonce' | 'recipient' | 'accountId'>) {
  return { accountId: c.accountId, publicKey, signature: sign(null,
    createHash('sha256').update(serializeNep413(c.message, Buffer.from(c.nonce, 'base64'), c.recipient)).digest(), pair.privateKey).toString('base64') };
}

function harness(activation = active()) {
  const state = {
    now: Date.now(), permission: 'FullAccess', chain: 'testnet', queries: [] as { text: string; args: unknown[] }[],
    challenges: new Map<string, Row>(), events: new Map<string, Row>(), approved: new Set([account, 'keelbase.testnet']),
    sessions: new Map([[token, account], [otherSession, account], [wrongWallet, 'keelbase.testnet'], [founder, 'yawrd1.testnet']]
      .map(([value, name]) => [hashToken(value), { account: name, live: true, network: 'testnet' }])),
    rate: 0, rpcCalls: 0, writes: 0, published: true, dao: 'demo.factory.yawrd.testnet', creator: 'yawrd1.testnet',
    onRpc: null as null | (() => void), onWrite: null as null | (() => void), rpcFailure: false,
    loseWriteResponse: false,
  };
  const query: Query = async (text, args = []) => {
    state.queries.push({ text, args });
    if (text.startsWith('WITH authorized_request')) state.onWrite?.();
    const session = state.sessions.get(String(args[0]));
    const live = session?.live && session.network === 'testnet' && state.published
      && state.dao === 'demo.factory.yawrd.testnet' && state.creator === 'yawrd1.testnet';
    const approved = session && state.approved.has(session.account);
    const eligible = live && approved && session?.account === account;
    if (text.startsWith('SELECT s.account_id')) return live && session ? [{ account_id: session.account,
      application_id: approved ? '00000000-0000-4000-8000-000000000002' : null, decision: approved ? 'approved' : null }] : [];
    if (text.startsWith('WITH eligible')) {
      if (!eligible || state.rate >= 10) return [];
      state.rate++;
      state.challenges.set(String(args[1]), { id: args[1], browser_hash: args[2], account_id: args[3], network: 'testnet',
        origin: args[4], message: args[5], recipient: args[6], nonce: args[7],
        issued_at: new Date(String(args[8])), expires_at: new Date(String(args[9])), consumed_at: null });
      return [{ id: args[1] }];
    }
    if (text.startsWith('UPDATE yawrd.auth_challenges c')) {
      const c = state.challenges.get(String(args[1]));
      if (!eligible || !c || c.browser_hash !== args[2] || c.recipient !== args[3] || c.origin !== args[4]
        || c.account_id !== session?.account || c.network !== session.network || c.consumed_at) return [];
      c.consumed_at = new Date(state.now);
      return [{ ...c }];
    }
    if (text.startsWith('WITH authorized_request')) {
      state.writes++;
      const c = state.challenges.get(String(args[9]));
      const authorized = Boolean(eligible && c && c.browser_hash === args[10] && c.message === args[11]
        && c.recipient === args[12] && c.origin === args[13] && c.account_id === session?.account
        && c.network === session.network && c.consumed_at && +new Date(c.issued_at as Date) <= state.now
        && +new Date(c.expires_at as Date) > state.now && args[2] === session.account && args[7] === session.account);
      const inserted = authorized && !state.events.has('task-b');
      if (inserted) state.events.set('task-b', { task_ref: args[1], event_kind: 'request', actor_account_id: session!.account,
        description: args[6], recipient_account_id: args[7], recorded_at: new Date(state.now),
        pr_url: args[3], pr_head_sha: args[4], merge_commit_sha: args[5], consent_version: args[8] });
      if (state.loseWriteResponse) throw new Error('PRIVATE_DATABASE_SENTINEL');
      return [{ authorized, inserted }];
    }
    if (text.startsWith('SELECT e.task_ref')) return live && (approved || session?.account === 'yawrd1.testnet')
      ? [...state.events.values()] : [];
    throw new Error(`Unexpected offline query: ${text.slice(0, 60)}`);
  };
  // Exercise the real production key verifier against an injected offline RPC.
  const verifyKey = testnetAccessKeyVerifier(async (_url, init) => {
    state.rpcCalls++;
    const request = JSON.parse(String(init?.body));
    if (state.rpcFailure) throw new Error('PRIVATE_RPC_SENTINEL');
    if (request.method === 'query') {
      assert.equal(request.params.account_id, account);
      assert.equal(request.params.public_key, publicKey);
      assert.equal(request.params.finality, 'final');
      state.onRpc?.();
    }
    return Response.json({ jsonrpc: '2.0', id: request.id, result: request.method === 'status' ? { chain_id: state.chain }
      : { permission: state.permission, block_height: 100, block_hash: '1'.repeat(32) } });
  });
  const repo = new ContributionRepository(query, activation, verifyKey, () => state.now);
  const post = (data: unknown, cookie = token, selectedRepo = repo) => contributionRequest(new Request(`${origin}/api/yawrd/yaw-001/contributions`, {
    method: 'POST', headers: { host: 'yawrd.example', origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
      cookie: `${SESSION_COOKIE}=${cookie}` }, body: JSON.stringify(data),
  }), 'yaw-001', selectedRepo, origin);
  async function prepare(input = draft, cookie = token) {
    const response = await post({ kind: 'challenge', submission: input }, cookie);
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const { challenge } = await response.json() as { challenge: IdentityChallenge };
    return { challenge, command: { ...input, challengeId: challenge.id, proof: proof(challenge) } };
  }
  return { repo, state, query, verifyKey, post, prepare };
}

async function denied(response: Response, status: number, error: string) {
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error });
}

test('Task B challenge and explicitly signed request use durable storage, exact evidence and current key verification', async () => {
  const h = harness();
  const { challenge, command } = await h.prepare();
  assert.equal(challenge.accountId, account);
  assert.equal(challenge.recipient, SUBMISSION_RECIPIENT);
  assert.equal(challenge.expiresAt - challenge.issuedAt, 300000);
  assert.equal(Buffer.from(challenge.nonce, 'base64').length, 32);
  assert.match(challenge.message, /"amountYocto":"1000000000000000000000000"/);
  assert.equal(h.state.events.size, 0);
  const stored = h.state.challenges.get(challenge.id)!;
  assert.notEqual(stored.browser_hash, hashToken(token));
  assert.ok(stored.issued_at instanceof Date); // Neon millisecond-preserving path.
  const response = await h.post(command);
  assert.equal(response.status, 200);
  const view = await response.json();
  assert.equal(view.tasks[0].request.actorAccountId, account);
  assert.equal(h.state.rpcCalls, 2);
  assert.equal(h.state.events.size, 1);
  const saved = h.state.events.get('task-b')!;
  assert.deepEqual([saved.pr_url, saved.pr_head_sha, saved.merge_commit_sha], [terms.prUrl, terms.head, terms.merge]);
  assert.equal(saved.recipient_account_id, account);
  assert.doesNotMatch(JSON.stringify(view), /signature|publicKey|browser_hash|challengeId|application_id/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
});

test('missing proof, malformed proof and cryptographically invalid signature cannot write', async () => {
  const h = harness();
  await denied(await h.post(draft), 401, 'submission_signature_required');
  const { command } = await h.prepare();
  await denied(await h.post({ ...command, proof: 'invalid' }), 401, 'invalid_signature');
  await denied(await h.post({ ...command, proof: { ...command.proof, signature: Buffer.alloc(64).toString('base64') } }), 401, 'invalid_signature');
  await denied(await h.post(command), 401, 'unknown_challenge');
  assert.equal(h.state.rpcCalls, 0);
  assert.equal(h.state.writes, 0);
});

test('durable single-use claim rejects concurrent replay and replay through a new repository instance', async () => {
  const h = harness(), { command } = await h.prepare();
  const responses = await Promise.all([h.post(command), h.post(command)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
  const restarted = new ContributionRepository(h.query, active(), h.verifyKey, () => h.state.now);
  await denied(await h.post(command, token, restarted), 401, 'unknown_challenge');
  assert.equal(h.state.writes, 1);
  assert.equal(h.state.events.size, 1);
});

test('wrong wallet and another session for the correct wallet cannot use a contribution challenge', async () => {
  const h = harness();
  await denied(await h.post({ kind: 'challenge', submission: draft }, wrongWallet), 403, 'task_owner_required');
  const { command } = await h.prepare();
  await denied(await h.post(command, wrongWallet), 403, 'task_owner_required');
  await denied(await h.post(command, otherSession), 401, 'unknown_challenge');
  await denied(await h.post({ ...command, proof: { ...command.proof, accountId: 'keelbase.testnet' } }), 401, 'wrong_account');
  assert.equal(h.state.writes, 0);
});

for (const when of ['before verification', 'during RPC', 'at write'] as const) test(`challenge expiry ${when} blocks persistence`, async () => {
  const h = harness(), { challenge, command } = await h.prepare();
  const expire = () => { h.state.now = challenge.expiresAt; };
  if (when === 'before verification') expire();
  else if (when === 'during RPC') h.state.onRpc = expire;
  else h.state.onWrite = expire;
  await denied(await h.post(command), 401, 'expired_challenge');
  assert.equal(h.state.events.size, 0);
});

for (const mutation of ['description', 'recipient', 'purpose', 'origin', 'nonce'] as const) test(`signed ${mutation} substitution cannot authorize a request`, async () => {
  const h = harness(), { challenge, command } = await h.prepare();
  const stored = h.state.challenges.get(challenge.id)!;
  let changed = command;
  let expected = 'altered_submission', status = 401;
  if (mutation === 'description') changed = { ...command, description: 'Altered after approval.' };
  if (mutation === 'recipient') { changed = { ...command, recipientAccountId: 'keelbase.testnet' }; expected = 'recipient_must_match_task_terms'; status = 400; }
  if (mutation === 'purpose') { stored.recipient = AUTH_RECIPIENT; expected = 'unknown_challenge'; }
  if (mutation === 'origin') { stored.origin = 'https://evil.example'; expected = 'unknown_challenge'; }
  if (mutation === 'nonce') stored.nonce = Buffer.alloc(32, 3).toString('base64');
  await denied(await h.post(changed), status, expected);
  assert.equal(h.state.writes, 0);
});

for (const failure of ['unauthorized key', 'wrong RPC network', 'RPC outage'] as const) test(`${failure} fails closed and consumes the challenge`, async () => {
  const h = harness(), { command } = await h.prepare();
  if (failure === 'unauthorized key') h.state.permission = 'FunctionCall';
  if (failure === 'wrong RPC network') h.state.chain = 'mainnet';
  if (failure === 'RPC outage') h.state.rpcFailure = true;
  await denied(await h.post(command), 401, failure === 'unauthorized key' ? 'unauthorized_key' : failure === 'wrong RPC network' ? 'wrong_rpc_network' : 'rpc_unavailable');
  await denied(await h.post(command), 401, 'unknown_challenge');
  assert.equal(h.state.writes, 0);
});

test('fresh signed identical retries retain the first receipt; changed signed payload conflicts', async () => {
  const h = harness();
  const first = await h.post((await h.prepare()).command);
  assert.equal(first.status, 200);
  const receipt = await first.json();
  h.state.now += 1000;
  const retry = await h.post((await h.prepare()).command);
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), receipt);
  const changed = await h.prepare({ ...draft, description: 'A different signed submission.' });
  await denied(await h.post(changed.command), 409, 'event_conflict');
  assert.equal(h.state.events.size, 1);
  assert.equal(h.state.events.get('task-b')!.description, draft.description);
  // Existing receipts cannot turn a write-time expired challenge into success.
  const late = await h.prepare();
  h.state.onWrite = () => { h.state.now = late.challenge.expiresAt; };
  await denied(await h.post(late.command), 401, 'expired_challenge');
});

test('an uncertain database response stays sanitized; a fresh signed retry resolves the original immutable receipt', async () => {
  const h = harness(), { command } = await h.prepare();
  h.state.loseWriteResponse = true;
  await denied(await h.post(command), 503, 'service_unavailable');
  assert.equal(h.state.events.size, 1);
  const original = { ...h.state.events.get('task-b')! };
  await denied(await h.post(command), 401, 'unknown_challenge');
  h.state.loseWriteResponse = false;
  h.state.now += 1000;
  assert.equal((await h.post((await h.prepare()).command)).status, 200);
  assert.deepEqual(h.state.events.get('task-b'), original);
});

test('direct repository submission cannot bypass Task B proof checks', async () => {
  const h = harness();
  await assert.rejects(h.repo.submit('yaw-001', hashToken(token), draft, origin), /submission_signature_required/);
  const { command } = await h.prepare();
  await assert.rejects(h.repo.submit('yaw-001', hashToken(token), { ...command, challengeId: 'z'.repeat(43) }, origin), /unknown_challenge/);
  assert.equal(h.state.writes, 0);
});

for (const loss of ['session', 'membership'] as const) test(`${loss} loss during RPC is rechecked at the write`, async () => {
  const h = harness(), { command } = await h.prepare();
  h.state.onRpc = () => { if (loss === 'session') h.state.sessions.get(hashToken(token))!.live = false; else h.state.approved.delete(account); };
  await denied(await h.post(command), loss === 'session' ? 401 : 403, loss === 'session' ? 'sign_in_required' : 'approved_participant_required');
  assert.equal(h.state.events.size, 0);
});

test('Task B approved membership is required for challenge issuance, and unauthorized acknowledgement stays forbidden', async () => {
  const h = harness();
  const ack = { kind: 'acknowledgement', taskRef: 'task-b', prUrl: terms.prUrl, evidence: 'Original PR acceptance.',
    historicalAcceptedOn: '2026-11-06', historicalAcceptedAt: null, consent: true, consentVersion: ACK_CONSENT };
  await denied(await h.post(ack), 403, 'creator_only');
  h.state.approved.delete(account);
  await denied(await h.post({ kind: 'challenge', submission: draft }), 403, 'approved_participant_required');
  assert.equal(h.state.challenges.size, 0);
  assert.equal(h.state.writes, 0);
});

test('challenge issuance shares the accepted rate budget and all activation gates remain closed', async () => {
  const h = harness();
  for (let i = 0; i < 10; i++) await h.prepare();
  await denied(await h.post({ kind: 'challenge', submission: draft }), 429, 'too_many_challenges');
  const inactive = harness(contributionActivation({ YAWRD_ENABLE_YAW001_CONTRIBUTIONS: '1' }));
  await denied(await inactive.post({ kind: 'challenge', submission: draft }), 503, 'contributions_inactive');
  await denied(await inactive.post(draft), 503, 'contributions_inactive');
  assert.equal(inactive.state.queries.length, 0);
});

test('form signing action exercises challenge -> explicit Meteor message approval -> verified HTTP request offline', async () => {
  const h = harness();
  const steps: string[] = [];
  const result = await signTaskBRequest(draft, account, {
    getContext: () => ({ accountId: account, network: 'testnet' }),
    signIdentity: async params => {
      steps.push('wallet');
      assert.equal(params.signerId, account);
      assert.equal(params.recipient, SUBMISSION_RECIPIENT);
      assert.match(params.message, /Sign this specific Yawrd contribution submission, not a login/);
      return proof({ ...params, accountId: params.signerId, nonce: Buffer.from(params.nonce).toString('base64') });
    },
  }, async command => {
    steps.push(command.kind === 'challenge' ? 'challenge' : 'request');
    const response = await h.post(command);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  }, origin);
  assert.deepEqual(steps, ['challenge', 'wallet', 'request']);
  assert.equal(result.tasks[0].request?.actorAccountId, account);
  assert.equal(h.state.events.size, 1);
});

for (const interruption of ['cancel', 'account change', 'unmount'] as const) test(`form ${interruption} during wallet approval never posts a signed request`, async () => {
  const h = harness(), controller = new AbortController();
  let selected = account, posts = 0;
  await assert.rejects(signTaskBRequest(draft, account, {
    getContext: () => ({ accountId: selected, network: 'testnet' }),
    signIdentity: async params => {
      if (interruption === 'cancel') throw new Error('cancelled');
      if (interruption === 'account change') selected = 'keelbase.testnet';
      if (interruption === 'unmount') controller.abort();
      return proof({ ...params, accountId: account, nonce: Buffer.from(params.nonce).toString('base64') });
    },
  }, async command => { posts++; return (await h.post(command)).json(); }, origin, controller.signal));
  assert.equal(posts, 1);
  assert.equal(h.state.events.size, 0);
  assert.equal(h.state.rpcCalls, 0);
});

test('Task B issue, claim and write SQL enforce authorization and exact durable proof linkage using accepted columns only', async () => {
  const h = harness(); await h.post((await h.prepare()).command);
  for (const { text } of h.state.queries) {
    assert.match(text, /s\.token_hash = \$1/);
    assert.match(text, /s\.revoked_at IS NULL AND s\.expires_at > clock_timestamp\(\)/);
    assert.match(text, /p\.published_at IS NOT NULL/);
    assert.match(text, /p\.dao_account_id = 'demo.factory.yawrd.testnet'/);
    assert.match(text, /p\.creator_account_id = 'yawrd1.testnet'/);
  }
  const claim = h.state.queries.find(q => q.text.startsWith('UPDATE yawrd.auth_challenges c'))!.text;
  assert.match(claim, /c\.consumed_at IS NULL RETURNING c\.\*/);
  const write = h.state.queries.find(q => q.text.startsWith('WITH authorized_request'))!.text;
  for (const predicate of ['c.id = $10', 'c.browser_hash = $11', 'c.message = $12', 'c.recipient = $13', 'c.origin = $14', 'c.consumed_at IS NOT NULL', 'c.expires_at > clock_timestamp()', "d.decision = 'approved'"]) assert.ok(write.includes(predicate), predicate);
  assert.match(write, /ON CONFLICT \(network, project_id, task_ref, event_kind\) DO NOTHING/);
  assert.doesNotMatch(write, /DO UPDATE|CREATE TABLE|recorded_at/);
});
