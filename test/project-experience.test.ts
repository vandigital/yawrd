import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { ParticipantRepository, WorkflowError } from '../src/participants/repository.ts';
import { participantRequest } from '../src/participants/http.ts';
import { SESSION_COOKIE } from '../src/participants/auth.ts';
import { GENESIS_YAW_001 as genesis } from '../src/genesis/yaw-001.ts';
import { genesisApplicationsClosed } from '../src/genesis/participation.ts';
import type { ParticipantView, PersistedProject } from '../src/participants/types.ts';
import { PersistedYawrdPresentation } from '../app/components/persisted-yawrd.tsx';
import { RewardPayoutIdentityContent } from '../app/components/reward-payout.tsx';
import { TestnetWalletProvider } from '../app/use-testnet-wallet.ts';
import { PAYOUT, initialPayoutState, payoutDescription, transferKind, type PayoutSnapshot } from '../src/rewards/payout.ts';

const project: PersistedProject = { ...genesis, objectives: [...genesis.objectives] };
const visitor: ParticipantView = { accountId: null, role: 'public', application: null, applications: [], restrictedContent: null };
const application = { id: '00000000-0000-4000-8000-000000000001', accountId: 'fixture.testnet', introduction: 'PRIVATE_INTRODUCTION', status: 'approved' as const, reviewerAccountId: genesis.creatorAccountId };
const render = (view = visitor, value = project, active = false) => renderToStaticMarkup(createElement(TestnetWalletProvider, null,
  createElement(PersistedYawrdPresentation, { project: value, view, contributionsActive: active })));
const origin = 'https://yawrd.example';
function request(action: string, data?: object, authenticated = true) {
  return new Request(`${origin}/api/yawrd/yaw-001/${action}`, { method: data ? 'POST' : 'GET', headers: {
    host: 'yawrd.example', origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json',
    cookie: authenticated ? `${SESSION_COOKIE}=${'a'.repeat(43)}` : '',
  }, ...(data ? { body: JSON.stringify(data) } : {}) });
}

test('canonical YAW-001 applications close at the repository before any database operation', async () => {
  let calls = 0;
  const repo = new ParticipantRepository(async () => { calls++; throw Error('No query may run'); });
  for (const [introduction, consent] of [['New application', true], ['', false], ['Historical retry', true]]) {
    await assert.rejects(repo.apply(genesis.id, 'session', introduction, consent),
      error => error instanceof WorkflowError && error.code === 'applications_closed' && error.status === 409);
  }
  assert.equal(calls, 0, 'no insert, update, delete or historical overwrite');
  assert.equal(genesisApplicationsClosed(genesis.id), true);
  assert.equal(genesisApplicationsClosed(genesis.id, 'mainnet'), false);
  assert.equal(genesisApplicationsClosed('other-project'), false);
});

test('existing apply API returns a non-sensitive closed response and retains authentication guards', async () => {
  const repo = new ParticipantRepository(async () => { throw Error('PRIVATE_DATABASE_ERROR'); });
  const data = { introduction: 'New application', consent: true };
  const response = await participantRequest(request('apply', data), genesis.id, 'apply', repo, origin);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'applications_closed' });
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const anonymous = await participantRequest(request('apply', data, false), genesis.id, 'apply', repo, origin);
  assert.equal(anonymous.status, 401);
  assert.deepEqual(await anonymous.json(), { error: 'sign_in_required' });
});

test('another project retains its atomic application insertion, consent and returned history', async () => {
  const queries: string[] = [];
  const repo = new ParticipantRepository(async (sql, args = []) => {
    queries.push(sql);
    assert.equal(args[0], 'future-project');
    if (sql.startsWith('INSERT')) {
      assert.match(sql, /s.account_id <> p.creator_account_id/);
      assert.match(sql, /ON CONFLICT .* DO NOTHING RETURNING id/);
      assert.equal(args[3], 'A future contribution');
      return [{ id: application.id }];
    }
    return [{ account_id: application.accountId, is_creator: false, is_participant: false, applications: [{ id: application.id, account_id: application.accountId, introduction: 'A future contribution', decision: null }], restricted_content: null }];
  });
  const result = await repo.apply('future-project', 'session', '  A future contribution  ', true);
  assert.equal(result.application?.introduction, 'A future contribution');
  assert.equal(result.application?.status, 'pending');
  assert.equal(queries.length, 2);
  assert.match(render({ ...visitor, accountId: application.accountId }, { ...project, id: 'future-project' }), /Apply to Join/);
  assert.doesNotMatch(render(visitor, { ...project, id: 'future-project' }), /Completed · Applications closed/);
});

test('closure preserves authenticated history reads and creator review through existing API', async () => {
  const row = { account_id: genesis.creatorAccountId, is_creator: true, is_participant: false, restricted_content: 'PRIVATE_WORKSPACE',
    applications: [{ id: application.id, account_id: application.accountId, introduction: application.introduction, decision: 'approved', reviewer_account_id: genesis.creatorAccountId }] };
  let writes = 0;
  const repo = new ParticipantRepository(async (sql, args = []) => {
    assert.equal(args[0], genesis.id);
    if (sql.startsWith('INSERT INTO yawrd.review_decisions')) { writes++; assert.match(sql, /s.account_id = p.creator_account_id/); return []; }
    assert.match(sql, /s.revoked_at IS NULL AND s.expires_at > clock_timestamp\(\)/);
    return [row];
  });
  const state = await participantRequest(request('state'), genesis.id, 'state', repo, origin);
  assert.equal(state.status, 200);
  assert.equal((await state.json()).restrictedContent, 'PRIVATE_WORKSPACE');
  const review = await participantRequest(request('review', { applicationId: application.id, decision: 'approved' }), genesis.id, 'review', repo, origin);
  assert.equal(review.status, 200);
  assert.equal((await review.json()).applications[0].introduction, application.introduction);
  assert.equal(writes, 1);
});

test('public completion showcase contains approved evidence, one identity and no private roster or synthetic activity', () => {
  const html = render();
  assert.match(html, /<h1>Build Progress<\/h1>/);
  assert.match(html, /Completed on Testnet/);
  assert.match(html, /Completed · Applications closed/);
  assert.equal((html.match(/id="genesis-identity-title"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /PRIVATE_|fixture.testnet|keelbase1.testnet|hermes-yaw001|Apply to Join|<textarea|<form|Take part in this Yawrd/);
  assert.doesNotMatch(html, /recent activity|synthetic|Development preview/i);
  for (const url of [`https://github.com/${genesis.publicRepository}`, `https://github.com/${genesis.publicRepository}/pull/2`, PAYOUT.prUrl,
    `https://testnet.nearblocks.io/address/${genesis.creatorAccountId}`, `https://testnet.nearblocks.io/address/${genesis.daoAccountId}`,
    `https://testnet.nearblocks.io/address/${genesis.factoryAccountId}`, `https://testnet.nearblocks.io/txns/${genesis.creationTransaction}`,
    `https://testnet.nearblocks.io/txns/${genesis.hardeningTransaction}`]) assert.ok(html.includes(`href="${url}"`), url);
  assert.match(html, /Task A is accepted with no payout allocated/);
  assert.match(html, /Separate from Project Funds or future funding/);
  const source = readFileSync(new URL('../app/components/genesis-project.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /build-progress-preview|preview-data|agentAssociation|\.applications/);
});

test('completed project retains creator, participant and Steward workspaces below public content', () => {
  for (const role of ['creator', 'participant'] as const) {
    const html = render({ ...visitor, accountId: role === 'creator' ? genesis.creatorAccountId : application.accountId, role,
      application: role === 'participant' ? application : null, applications: role === 'creator' ? [application] : [], restrictedContent: 'PRIVATE_WORKSPACE' }, project, true);
    assert.match(html, /PRIVATE_WORKSPACE/);
    if (role === 'creator') assert.match(html, /PRIVATE_INTRODUCTION/);
    assert.match(html, /Contribution/);
    assert.ok(html.indexOf('aria-labelledby="crew-title"') > html.indexOf('</article>'), 'workspace follows project');
    assert.doesNotMatch(html, /Apply to Join/);
  }
  const steward = render({ ...visitor, accountId: 'yawrd.testnet' });
  assert.match(steward, /id="reward-payout"/);
  assert.match(steward, /Verify transaction evidence/);
  assert.doesNotMatch(render({ ...visitor, accountId: 'new.testnet' }), /Apply to Join|<textarea/);
  for (const status of ['pending', 'approved', 'rejected'] as const) {
    const html = render({ ...visitor, accountId: application.accountId, application: { ...application, status } });
    assert.match(html, new RegExp(`Application ${status}`));
  }
});

const snapshot = (settlement: PayoutSnapshot['settlement']): PayoutSnapshot => ({
  proposal: { id: 1, proposer: PAYOUT.creator, description: payoutDescription, kind: transferKind(), status: 'Approved', votes: { [PAYOUT.stewards[0]]: 'Approve', [PAYOUT.stewards[1]]: 'Approve' } },
  conflicts: [], blockHash: 'B'.repeat(44), settlement,
});
const identity = (value: PayoutSnapshot | null, error = '') => renderToStaticMarkup(createElement(RewardPayoutIdentityContent, { compact: true, state: { ...initialPayoutState, snapshot: value, error } }));

test('compact reward presentation distinguishes unverified, pending, failed and verified receipt settlement', () => {
  assert.match(identity(null), /chain status not yet verified/);
  assert.match(identity(null, 'offline'), /Unverified — refresh payout status/);
  for (const [settlement, label] of [['unverified', 'transfer settlement unverified'], ['pending', 'transfer pending'], ['failed', 'payout not confirmed']] as const) {
    const html = identity(snapshot(settlement));
    assert.ok(html.includes(label));
    assert.doesNotMatch(html, /Reward Payout status: Paid|View Payout Transfer/);
  }
  const verified = { ...snapshot('paid'), execution: { hash: 'T'.repeat(44), signer: PAYOUT.stewards[1] }, transferReceipt: 'R'.repeat(44) };
  const paid = identity(verified);
  assert.match(paid, /Reward Payout status: Paid/);
  assert.ok(paid.includes(`href="https://testnet.nearblocks.io/txns/${verified.execution.hash}/execution#${verified.transferReceipt}"`));
  assert.match(paid, /<details[^>]*><summary[^>]*>Reward verification/);
  assert.match(identity(verified, 'offline'), /Verification refresh unavailable. Showing the last verified result/);
  assert.match(identity({ ...snapshot('unverified'), conflicts: [1, 2] }), /Existing Payout Proposal needs review/);
});
