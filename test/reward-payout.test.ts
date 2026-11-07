import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PAYOUT, PAYOUT_ATTEMPT_KEY, PayoutChain, PayoutFlow, payoutDescription, payoutTransaction, transferKind,
  matchingProposal, approvalCount, payoutStatus, type PayoutProposal, type PayoutTransaction } from '../src/rewards/payout.ts';
import { payoutContext, payoutContextRequest } from '../src/rewards/context.ts';
import { SESSION_COOKIE } from '../src/participants/auth.ts';
import type { Rpc, AttemptStore } from '../src/creation-integration.ts';
import { createTestnetRpc } from '../src/creation-integration.ts';
import { RewardPayoutWorkspace } from '../app/components/reward-payout.tsx';
import { PersistedYawrdPresentation } from '../app/components/persisted-yawrd.tsx';
import { GENESIS_YAW_001 as g } from '../src/genesis/yaw-001.ts';
import { TestnetWalletSession } from '../app/wallet-session.ts';
import type { NearConnector } from '@hot-labs/near-connect';

const blockHash = 'B'.repeat(44), txHash = 'T'.repeat(44);
const auth = (accountId: string = PAYOUT.creator) => async () => ({ accountId, acknowledged: true, acknowledgedAt: '2026-11-07T00:00:00.000Z' });
const proposal = (change: Partial<PayoutProposal> = {}): PayoutProposal => ({ id: 1, proposer: PAYOUT.creator,
  description: payoutDescription, kind: transferKind(), status: 'InProgress', votes: {}, last_actions_log: [{ block_height: '100' }], ...change });
class Store implements AttemptStore {
  saved: string | null = null;
  getItem(key: string) { assert.equal(key, PAYOUT_ATTEMPT_KEY); return this.saved; }
  setItem(key: string, value: string) { assert.equal(key, PAYOUT_ATTEMPT_KEY); this.saved = value; }
  removeItem(key: string) { assert.equal(key, PAYOUT_ATTEMPT_KEY); this.saved = null; }
}
function outcome(tx: PayoutTransaction, paid = false): any {
  const p = tx.actions[0].params;
  const call = { method_name: p.methodName, args: btoa(JSON.stringify(p.args)), gas: p.gas, deposit: p.deposit };
  const receipts: any[] = [{ receipt_id: 'call', predecessor_id: tx.signerId, receiver_id: PAYOUT.daoAccountId, receipt: { Action: { actions: [{ FunctionCall: call }] } } }];
  const outcomes: any[] = [{ id: 'call', outcome: { executor_id: PAYOUT.daoAccountId, receipt_ids: paid ? ['transfer', 'callback'] : [], status: { SuccessValue: '' } } }];
  if (paid) {
    receipts.push({ receipt_id: 'transfer', predecessor_id: PAYOUT.daoAccountId, receiver_id: PAYOUT.recipient, receipt: { Action: { actions: [{ Transfer: { deposit: PAYOUT.amountYocto } }] } } },
      { receipt_id: 'callback', predecessor_id: PAYOUT.daoAccountId, receiver_id: PAYOUT.daoAccountId, receipt: { Action: { actions: [{ FunctionCall: { method_name: 'on_proposal_callback', args: btoa('{"proposal_id":1}'), gas: '20000000000000', deposit: '0' } }] } } });
    outcomes.push({ id: 'transfer', outcome: { executor_id: PAYOUT.recipient, receipt_ids: [], status: { SuccessValue: '' } } },
      { id: 'callback', outcome: { executor_id: PAYOUT.daoAccountId, receipt_ids: [], status: { SuccessValue: '' } } });
  }
  return { final_execution_status: 'FINAL', transaction: { hash: txHash, signer_id: tx.signerId, receiver_id: tx.receiverId, actions: [{ FunctionCall: call }] },
    transaction_outcome: { id: txHash, outcome: { executor_id: tx.signerId, receipt_ids: ['call'], status: { SuccessReceiptId: 'call' } } },
    receipts, receipts_outcome: outcomes, status: { SuccessValue: '' } };
}
function fixture(initial: PayoutProposal[] = []) {
  let proposals = initial, tx: any = null;
  let network = 'testnet', unavailable = false, discover = false;
  const calls: { method: string; args: any }[] = [];
  const rpc: Rpc = async (method, args) => {
    calls.push({ method, args });
    if (unavailable) throw new Error('offline fixture unavailable');
    if (method === 'status') return { chain_id: network };
    if (method === 'block') return args.finality ? { header: { hash: blockHash } } : { chunks: [{ chunk_hash: 'synthetic-chunk' }] };
    if (method === 'chunk') return { header: { shard_id: 0 }, receipts: discover && tx ? tx.receipts.filter((r: any) => r.receipt_id === 'transfer') : [] };
    if (method === 'EXPERIMENTAL_receipt_to_tx') return { transaction_hash: txHash, sender_account_id: tx.transaction.signer_id };
    if (method === 'EXPERIMENTAL_tx_status') { assert.equal(args.tx_hash, txHash); return structuredClone(tx); }
    assert.equal(method, 'query'); assert.equal(args.account_id, PAYOUT.daoAccountId); assert.equal(args.block_id, blockHash); assert.equal(args.finality, undefined);
    const input = JSON.parse(atob(String(args.args_base64)));
    const value = args.method_name === 'get_last_proposal_id' ? Math.max(0, ...proposals.map(p => p.id + 1))
      : args.method_name === 'get_proposals' ? proposals.filter(p => p.id >= input.from_index && p.id < input.from_index + input.limit)
      : args.method_name === 'get_proposal' ? proposals.find(p => p.id === input.id) : assert.fail('unexpected view');
    return { result: [...new TextEncoder().encode(JSON.stringify(value))], block_hash: blockHash };
  };
  return { chain: new PayoutChain(rpc), calls, set: (p: PayoutProposal[]) => { proposals = p; }, tx: (v: any) => { tx = v; },
    network: (v: string) => { network = v; }, unavailable: () => { unavailable = true; }, discover: () => { discover = true; } };
}
function wallet(account: string = PAYOUT.creator, sign: (tx: PayoutTransaction) => Promise<unknown> = async () => { throw new Error('should not sign'); }) {
  return { getContext: () => ({ accountId: account, network: 'testnet' }), signPayout: sign };
}

test('three independent wallet authorizations create with 0/2, approve 1/2, then execute 2/2 and verify Paid', async () => {
  const f = fixture(), store = new Store(), flow = new PayoutFlow(f.chain, store, () => {});
  const signed: PayoutTransaction[] = [];
  const first = wallet(PAYOUT.creator, async tx => {
    assert.equal(JSON.parse(store.saved!).phase, 'awaiting');
    signed.push(tx);
    if (tx.actions[0].params.methodName === 'add_proposal') f.set([proposal()]);
    else f.set([proposal({ votes: { [PAYOUT.creator]: 'Approve' } })]);
    f.tx(outcome(tx)); return { transaction: { hash: txHash } };
  });
  await flow.submit('create', first, auth());
  assert.equal(signed.length, 1); assert.equal(approvalCount(flow.state.snapshot!.proposal), 0);
  assert.equal(flow.state.snapshot!.settlement, 'unverified');
  await flow.submit('approve', first, auth());
  assert.equal(signed.length, 2); assert.equal(approvalCount(flow.state.snapshot!.proposal), 1);
  assert.match(payoutStatus(flow.state.snapshot), /1\/2.*not paid/);
  const second = PAYOUT.stewards[1];
  await flow.submit('approve', wallet(second, async tx => {
    signed.push(tx); f.set([proposal({ status: 'Approved', votes: { [PAYOUT.creator]: 'Approve', [second]: 'Approve' } })]);
    f.tx(outcome(tx, true)); return { transaction: { hash: txHash } };
  }), auth(second));
  assert.equal(signed.length, 3); assert.equal(approvalCount(flow.state.snapshot!.proposal), 2);
  assert.equal(payoutStatus(flow.state.snapshot), 'Paid'); assert.equal(flow.state.snapshot!.transferReceipt, 'transfer');
  assert.deepEqual(signed.map(t => t.actions[0].params.methodName), ['add_proposal', 'act_proposal', 'act_proposal']);
  assert.deepEqual(signed[2].actions[0].params.args, { id: 1, action: 'VoteApprove', proposal: transferKind(), memo: null });
  assert.ok(signed.every(t => t.network === 'testnet' && t.receiverId === PAYOUT.daoAccountId && t.actions.length === 1 && t.actions[0].params.deposit === '0'));
  assert.equal(JSON.stringify(signed).includes('Finalize'), false);
});
test('only fixed creator creates; only two distinct eligible stewards can approve; creation never adds a vote', () => {
  assert.throws(() => payoutTransaction('create', 'yawrd.testnet'));
  assert.throws(() => payoutTransaction('approve', PAYOUT.recipient, proposal()));
  for (const status of ['Approved', 'Failed', 'Expired', 'Rejected', 'Removed']) assert.throws(() => payoutTransaction('approve', PAYOUT.creator, proposal({ status })));
  for (const vote of ['Approve', 'Reject', 'Remove']) assert.throws(() => payoutTransaction('approve', PAYOUT.creator, proposal({ votes: { [PAYOUT.creator]: vote } })));
  assert.equal(approvalCount(proposal()), 0);
});
test('full fixed reward/evidence matching is required; suspicious native recipient transfers block recreation', async () => {
  const wrongAmount = proposal(); (wrongAmount.kind.Transfer as { amount: string }).amount = '2';
  for (const p of [proposal({ proposer: 'other.testnet' }), proposal({ description: PAYOUT.prUrl }),
    proposal({ description: payoutDescription.replace('/pull/4 ', '/pull/40 ') }),
    proposal({ description: payoutDescription + 'a' }), wrongAmount]) {
    assert.equal(matchingProposal(p), false);
    const f = fixture([p]), flow = new PayoutFlow(f.chain, new Store(), () => {});
    await flow.submit('create', wallet(), auth());
    assert.deepEqual(flow.state.snapshot!.conflicts, [1]);
    assert.match(flow.state.error, /need review/);
  }
  const f = fixture([proposal()]), flow = new PayoutFlow(f.chain, new Store(), () => {});
  await flow.submit('create', wallet(), auth()); assert.match(flow.state.error, /already exists/);
  f.set([proposal(), proposal({ id: 2 })]); await flow.refresh();
  assert.deepEqual(flow.state.snapshot!.conflicts, [1, 2]);
});
test('pagination scans complete ID ranges despite removed proposals and pins every view to one finalized block', async () => {
  const f = fixture([proposal({ id: 101 })]);
  const snapshot = await f.chain.read(); assert.equal(snapshot.proposal!.id, 101);
  assert.deepEqual(f.calls.filter(c => c.args.method_name === 'get_proposals').map(c => JSON.parse(atob(c.args.args_base64)).from_index), [0, 50, 100]);
});
test('RPC failure, wrong network, missing acknowledgement and changed/revoked sign-in never open Meteor', async () => {
  for (const scenario of ['rpc', 'network', 'ack', 'session', 'changed', 'revoked', 'stopped']) {
    const f = fixture(); const flow = new PayoutFlow(f.chain, new Store(), () => {});
    if (scenario === 'rpc') f.unavailable(); if (scenario === 'network') f.network('mainnet');
    let calls = 0;
    const context = async () => { calls++; return { accountId: scenario === 'session' || (scenario === 'changed' && calls === 2) ? 'yawrd.testnet' : PAYOUT.creator, acknowledged: scenario !== 'ack' && !(scenario === 'revoked' && calls === 2), acknowledgedAt: null }; };
    if (scenario === 'stopped') flow.stop();
    await flow.submit('create', wallet(), context); assert.equal(flow.state.attempt, null);
    if (scenario !== 'stopped') assert.ok(flow.state.error);
  }
});
test('uncertain outcomes survive reload, do not auto-sign or allow duplicates, and resolve from actual chain state', async () => {
  const f = fixture(), store = new Store(), flow = new PayoutFlow(f.chain, store, () => {});
  let signed = 0;
  await flow.submit('create', wallet(PAYOUT.creator, async () => { signed++; throw new Error('network lost'); }), auth());
  assert.equal(signed, 1); assert.equal(JSON.parse(store.saved!).phase, 'awaiting');
  const resumed = new PayoutFlow(f.chain, store, () => {});
  await resumed.refresh(); await resumed.submit('create', wallet(), auth());
  assert.match(resumed.state.error, /uncertain outcome/);
  f.set([proposal()]); await resumed.refresh();
  assert.equal(resumed.state.attempt!.phase, 'confirmed');
  await resumed.submit('create', wallet(), auth()); assert.match(resumed.state.error, /already exists/);
});
test('abandoned hashless approval markers recover on Refresh and reload, preserving Proposal #1 and requiring a new explicit click', async () => {
  for (const phase of ['awaiting', 'unknown']) {
    const p = proposal(), f = fixture([p]), store = new Store();
    store.saved = JSON.stringify({ purpose: 'approve', signer: PAYOUT.creator, proposalId: 1, phase });
    const flow = new PayoutFlow(f.chain, store, () => {});
    flow.state.error = 'Previous wallet outcome needs reconciliation.';
    await flow.refresh();
    assert.equal(store.saved, null); assert.equal(flow.state.attempt, null); assert.equal(flow.state.error, '');
    assert.deepEqual(flow.state.snapshot!.proposal, p);
    assert.equal(approvalCount(flow.state.snapshot!.proposal), 0);
    let requested = 0;
    await flow.submit('approve', wallet(PAYOUT.creator, async tx => {
      requested++; assert.equal(tx.actions[0].params.methodName, 'act_proposal');
      assert.equal(tx.actions[0].params.args.id, 1);
      throw Object.assign(new Error('User rejected'), { code: 4001 });
    }), auth());
    assert.equal(requested, 1); assert.deepEqual(flow.state.snapshot!.proposal, p);
  }
});
test('an active approval promise cannot be retired by its own Refresh or another flow reading 0/2', async () => {
  const f = fixture([proposal()]), store = new Store();
  const flow = new PayoutFlow(f.chain, store, () => {});
  let started!: () => void, finish!: () => void;
  const opened = new Promise<void>(resolve => { started = resolve; });
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const sending = flow.submit('approve', wallet(PAYOUT.creator, async () => { started(); await pending; return undefined; }), auth());
  await opened;
  try {
    const marker = store.saved;
    await flow.refresh(); assert.equal(store.saved, marker); assert.equal(flow.state.busy, true);
    const second = new PayoutFlow(f.chain, store, () => {});
    await second.refresh(); assert.equal(store.saved, marker); assert.equal(second.state.attempt!.phase, 'awaiting');
    assert.equal(approvalCount(second.state.snapshot!.proposal), 0);
    await second.submit('approve', wallet(), auth()); assert.match(second.state.error, /still active/);
  } finally { finish(); await sending; }
  assert.equal(flow.state.attempt!.phase, 'unknown');
  await flow.refresh(); assert.equal(store.saved, null); assert.equal(flow.state.attempt, null);
});
test('recorded votes resolve hashless approval markers without offering another vote', async () => {
  for (const vote of ['Approve', 'Reject', 'Remove']) {
    const f = fixture([proposal({ votes: { [PAYOUT.creator]: vote } })]), store = new Store();
    store.saved = JSON.stringify({ purpose: 'approve', signer: PAYOUT.creator, proposalId: 1, phase: 'awaiting' });
    const flow = new PayoutFlow(f.chain, store, () => {}); await flow.refresh();
    assert.equal(flow.state.attempt!.phase, 'confirmed'); assert.ok(store.saved);
    await flow.submit('approve', wallet(), auth()); assert.match(flow.state.error, /already voted/);
  }
});
test('known approval hashes remain blocked while pending or unverifiable, even when a vote is already visible', async () => {
  for (const scenario of ['pending', 'pending-vote', 'unavailable', 'succeeded-no-vote', 'wrong-proposal']) {
    const f = fixture([proposal({ votes: scenario === 'pending-vote' ? { [PAYOUT.creator]: 'Approve' } : {} })]), store = new Store();
    store.saved = JSON.stringify({ purpose: 'approve', signer: PAYOUT.creator, proposalId: 1, phase: 'unknown', hash: txHash });
    const marker = store.saved;
    const tx = outcome(payoutTransaction('approve', PAYOUT.creator, proposal()));
    if (scenario.startsWith('pending')) tx.final_execution_status = 'EXECUTED_OPTIMISTIC';
    if (scenario === 'wrong-proposal') tx.transaction.actions[0].FunctionCall.args = btoa(JSON.stringify({ id: 99, action: 'VoteApprove', proposal: transferKind() }));
    f.tx(scenario === 'unavailable' ? null : tx);
    const flow = new PayoutFlow(f.chain, store, () => {}); await flow.refresh();
    assert.equal(store.saved, marker, scenario); assert.equal(flow.state.attempt!.phase, 'unknown', scenario);
    await flow.submit('approve', wallet(), auth()); assert.equal(store.saved, marker, scenario);
  }
});
test('a finalized failed approval hash permits retry; a finalized successful recorded vote remains confirmed', async () => {
  for (const failed of [true, false]) {
    const f = fixture([proposal({ votes: failed ? {} : { [PAYOUT.creator]: 'Approve' } })]), store = new Store();
    store.saved = JSON.stringify({ purpose: 'approve', signer: PAYOUT.creator, proposalId: 1, phase: 'unknown', hash: txHash });
    const tx = outcome(payoutTransaction('approve', PAYOUT.creator, proposal()));
    if (failed) tx.status = { Failure: { error: 'synthetic failure' } };
    f.tx(tx); const flow = new PayoutFlow(f.chain, store, () => {}); await flow.refresh();
    assert.equal(flow.state.attempt!.phase, failed ? 'failed' : 'confirmed');
    assert.equal(flow.state.attempt!.hash, txHash);
  }
});
test('manual pending hash evidence is retained before considering hashless approval recovery', async () => {
  const f = fixture([proposal()]), store = new Store();
  store.saved = JSON.stringify({ purpose: 'approve', signer: PAYOUT.creator, proposalId: 1, phase: 'awaiting' });
  const tx = outcome(payoutTransaction('approve', PAYOUT.creator, proposal())); tx.final_execution_status = 'EXECUTED_OPTIMISTIC'; f.tx(tx);
  const flow = new PayoutFlow(f.chain, store, () => {}); await flow.refresh([{ hash: txHash, signer: PAYOUT.creator }]);
  assert.equal(flow.state.attempt!.hash, txHash); assert.equal(flow.state.attempt!.phase, 'unknown');
});
test('approval recovery never clears missing, conflicting, closed or replaced proposal attempts or an unverifiable read', async () => {
  for (const scenario of ['missing', 'conflict', 'closed', 'other-id', 'offline', 'replacement']) {
    const f = fixture(scenario === 'missing' ? [] : scenario === 'conflict' ? [proposal(), proposal({ id: 2 })]
      : [proposal({ id: scenario === 'other-id' ? 2 : 1, status: scenario === 'closed' ? 'Expired' : 'InProgress' })]), store = new Store();
    store.saved = JSON.stringify({ purpose: 'approve', signer: PAYOUT.creator, proposalId: 1, phase: 'awaiting' });
    let expected = store.saved;
    if (scenario === 'offline') f.unavailable();
    if (scenario === 'replacement') {
      const read = f.chain.read.bind(f.chain);
      expected = JSON.stringify({ purpose: 'approve', signer: 'yawrd.testnet', proposalId: 1, phase: 'awaiting' });
      f.chain.read = async e => { const snapshot = await read(e); store.saved = expected; return snapshot; };
    }
    const flow = new PayoutFlow(f.chain, store, () => {}); await flow.refresh(); assert.equal(store.saved, expected, scenario);
  }
});
test('another tab pending attempt, corrupt storage, unavailable storage and changed account before authorization fail closed', async () => {
  for (const scenario of ['tab', 'corrupt', 'storage', 'account', 'unmount']) {
    const f = fixture(), store = new Store(), flow = new PayoutFlow(f.chain, store, () => {});
    if (scenario === 'tab') store.saved = JSON.stringify({ purpose: 'create', signer: PAYOUT.creator, phase: 'awaiting' });
    if (scenario === 'corrupt') store.saved = '{"unrelated":true}';
    if (scenario === 'storage') store.setItem = () => { throw new Error('denied'); };
    let current = true;
    const w = wallet(); let calls = 0;
    const ctx = async () => { if (++calls === 2) { if (scenario === 'account') w.getContext = () => ({ accountId: 'yawrd.testnet', network: 'testnet' }); if (scenario === 'unmount') current = false; } return auth()(); };
    await flow.submit('create', w, ctx, () => current);
    assert.ok(flow.state.error);
  }
});
test('explicit cancellation permits a deliberate later attempt; concurrent clicks never request two signatures', async () => {
  const f = fixture(), store = new Store(), flow = new PayoutFlow(f.chain, store, () => {});
  let signed = 0;
  const rejected = wallet(PAYOUT.creator, async () => { signed++; throw Object.assign(new Error('User rejected'), { code: 4001 }); });
  await Promise.all([flow.submit('create', rejected, auth()), flow.submit('create', rejected, auth())]);
  assert.equal(signed, 1); assert.equal(flow.state.attempt!.phase, 'rejected');
  await flow.submit('create', rejected, auth()); assert.equal(signed, 2);
});
test('wallet adapter failures before requesting authorization do not leave a falsely uncertain broadcast', async () => {
  const f = fixture(), flow = new PayoutFlow(f.chain, new Store(), () => {});
  await flow.submit('create', wallet(PAYOUT.creator, async () => { throw Object.assign(new Error('account changed'), { code: 'PAYOUT_NOT_REQUESTED' }); }), auth());
  assert.equal(flow.state.attempt!.phase, 'failed');
  assert.match(flow.state.error, /No wallet transaction was requested/);
});
test('a previously confirmed proposal disappearing never enables another creation in the same browser', async () => {
  const f = fixture(), store = new Store();
  store.saved = JSON.stringify({ purpose: 'create', signer: PAYOUT.creator, phase: 'confirmed' });
  const flow = new PayoutFlow(f.chain, store, () => {});
  await flow.refresh(); assert.equal(flow.state.snapshot, null);
  await flow.submit('create', wallet(), auth());
  assert.match(flow.state.error, /previously confirmed Payout Proposal is missing/);
});
test('redirect hash and manually supplied failed transaction evidence reconcile without signing', async () => {
  const f = fixture(), store = new Store();
  store.saved = JSON.stringify({ purpose: 'create', signer: PAYOUT.creator, phase: 'awaiting' });
  const tx = outcome(payoutTransaction('create', PAYOUT.creator)); tx.status = { Failure: { error: 'synthetic failure' } }; f.tx(tx);
  const flow = new PayoutFlow(f.chain, store, () => {}); await flow.redirect(txHash);
  assert.equal(flow.state.attempt!.phase, 'failed');
  store.saved = JSON.stringify({ purpose: 'create', signer: PAYOUT.creator, phase: 'awaiting' });
  const resumed = new PayoutFlow(f.chain, store, () => {}); await resumed.refresh([{ hash: txHash, signer: PAYOUT.creator }]);
  assert.equal(resumed.state.attempt!.phase, 'failed');
});
const approved = () => proposal({ status: 'Approved', votes: { [PAYOUT.creator]: 'Approve', 'yawrd.testnet': 'Approve' } });
test('approved DAO status alone never means Paid; evidence recovery across browsers verifies real causal transfer', async () => {
  const p = approved(), f = fixture([p]);
  assert.match(payoutStatus(await f.chain.read()), /settlement unverified/);
  f.tx(outcome(payoutTransaction('approve', 'yawrd.testnet', proposal()), true)); f.discover();
  const snapshot = await f.chain.read(); assert.equal(snapshot.settlement, 'paid'); assert.equal(snapshot.execution!.hash, txHash);
});
for (const scenario of ['pending', 'transfer-failed', 'callback-failed', 'missing-outcome', 'missing-graph', 'wrong-recipient', 'wrong-amount', 'wrong-predecessor', 'unrelated-transfer', 'wrong-proposal', 'wrong-call', 'wrong-hash', 'wrong-voter', 'only-one-vote']) {
  test(`Paid is withheld for ${scenario}`, async () => {
    const p = approved(), f = fixture([scenario === 'only-one-vote' ? { ...p, votes: { [PAYOUT.creator]: 'Approve' } } : p]);
    const tx = outcome(payoutTransaction('approve', 'yawrd.testnet', proposal()), true);
    if (scenario === 'pending') tx.final_execution_status = 'EXECUTED_OPTIMISTIC';
    if (scenario === 'transfer-failed') tx.receipts_outcome[1].outcome.status = { Failure: {} };
    if (scenario === 'callback-failed') tx.receipts_outcome[2].outcome.status = { Failure: {} };
    if (scenario === 'missing-outcome') tx.receipts_outcome.splice(1, 1);
    if (scenario === 'missing-graph') tx.transaction_outcome.outcome.receipt_ids = [];
    if (scenario === 'wrong-recipient') tx.receipts[1].receiver_id = 'other.testnet';
    if (scenario === 'wrong-amount') tx.receipts[1].receipt.Action.actions[0].Transfer.deposit = '1';
    if (scenario === 'wrong-predecessor') tx.receipts[1].predecessor_id = 'other.testnet';
    if (scenario === 'unrelated-transfer') { tx.receipts_outcome[0].outcome.receipt_ids = ['callback']; tx.transaction_outcome.outcome.receipt_ids.push('transfer'); }
    if (scenario === 'wrong-proposal') tx.transaction.actions[0].FunctionCall.args = btoa(JSON.stringify({ id: 99, action: 'VoteApprove', proposal: transferKind() }));
    if (scenario === 'wrong-call') tx.transaction.actions[0].FunctionCall.method_name = 'Finalize';
    if (scenario === 'wrong-hash') tx.transaction.hash = 'F'.repeat(44);
    if (scenario === 'wrong-voter') tx.transaction.signer_id = 'other.testnet';
    f.tx(tx); const snapshot = await f.chain.read([{ hash: txHash, signer: 'yawrd.testnet' }]);
    assert.notEqual(snapshot.settlement, 'paid'); assert.notEqual(payoutStatus(snapshot), 'Paid');
    if (scenario.endsWith('-failed')) assert.equal(snapshot.settlement, 'failed');
    if (scenario === 'pending') assert.equal(snapshot.settlement, 'pending');
  });
}
test('read-only transport adds evidence reads without permitting broadcasts', async () => {
  const methods: string[] = [];
  const rpc = createTestnetRpc((async (url, init) => { assert.equal(url, 'https://rpc.testnet.near.org'); methods.push(JSON.parse(String(init!.body)).method); return Response.json({ result: {} }); }) as typeof fetch);
  for (const method of ['status', 'query', 'block', 'chunk', 'EXPERIMENTAL_receipt_to_tx', 'EXPERIMENTAL_tx_status']) await rpc(method, {});
  assert.equal(methods.length, 6);
  for (const method of ['send_tx', 'broadcast_tx_commit', 'broadcast_tx_async']) await assert.rejects(rpc(method, {}), /Read-only/);
});
test('acknowledgement projection is read-only, session-scoped and restricted to the two stewards, without private contribution content', async () => {
  for (const actor of PAYOUT.stewards) {
    const result = await payoutContext(async (sql, args) => {
      assert.match(sql, /^SELECT/); assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE)\b/);
      for (const text of ['s.revoked_at IS NULL', 's.expires_at > clock_timestamp()', "p.published_at IS NOT NULL", "r.event_kind = 'request'", "a.event_kind = 'acknowledgement'"]) assert.ok(sql.includes(text));
      assert.deepEqual(args, ['a'.repeat(64), PAYOUT.recipient, PAYOUT.prUrl, PAYOUT.merge, PAYOUT.creator, PAYOUT.daoAccountId, [...PAYOUT.stewards]]);
      return [{ account_id: actor, acknowledged: true, acknowledged_at: new Date('2026-11-07T00:00:00Z'), introduction: 'private', description: 'private' }];
    }, 'a'.repeat(64));
    assert.deepEqual(Object.keys(result), ['accountId', 'acknowledged', 'acknowledgedAt']); assert.equal(result.accountId, actor);
  }
  await assert.rejects(payoutContext(async () => [], null), /sign_in_required/);
  for (const actor of ['outsider.testnet', PAYOUT.recipient]) await assert.rejects(payoutContext(async () => [{ account_id: actor }], 'a'.repeat(64)), /steward_sign_in_required/);
  await assert.rejects(payoutContext(async () => [], 'a'.repeat(64)), /steward_sign_in_required/);
});
test('payout HTTP read reuses origin/cookie/no-store protection and sanitized failures; POST cannot write', async () => {
  const origin = 'https://yawrd.keelbase.io';
  const request = (method = 'GET', host = 'yawrd.keelbase.io') => new Request(origin + '/api/yawrd/yaw-001/reward-payout', { method, headers: { host, cookie: `${SESSION_COOKIE}=${'a'.repeat(43)}`, 'sec-fetch-site': 'same-origin' } });
  const good = await payoutContextRequest(request(), 'yaw-001', async () => [{ account_id: 'yawrd.testnet', acknowledged: true, acknowledged_at: null }], origin);
  assert.equal(good.status, 200); assert.match(good.headers.get('cache-control')!, /private, no-store/);
  for (const r of [request('POST'), request('GET', 'wrong.example')]) {
    const response = await payoutContextRequest(r, 'yaw-001', async () => assert.fail('must not query'), origin); assert.ok(response.status >= 400);
  }
  const bad = await payoutContextRequest(request(), 'yaw-001', async () => { throw new Error('private credentials'); }, origin);
  assert.equal(bad.status, 503); assert.deepEqual(await bad.json(), { error: 'service_unavailable' });
});
test('second steward does not need creator/crew membership to see payout; public identity reuses one allocation and makes no settlement claim', () => {
  const w = { ...wallet('yawrd.testnet'), accountId: 'yawrd.testnet', busy: false };
  const html = renderToStaticMarkup(createElement(RewardPayoutWorkspace, { accountId: 'yawrd.testnet', wallet: w }));
  assert.match(html, /Reward Payout/); assert.match(html, /keelbase1.testnet/); assert.match(html, /Creation|Creating a proposal records no approval vote/);
  assert.doesNotMatch(html, /<button[^>]*>Approve Payout|<button[^>]*>Create Payout/);
  assert.equal(renderToStaticMarkup(createElement(RewardPayoutWorkspace, { accountId: 'outsider.testnet', wallet: w })), '');
  const project = { id: g.id, network: g.network, creatorAccountId: g.creatorAccountId, name: g.name, description: g.description, objectives: [...g.objectives], participation: g.participation, rewards: g.rewards };
  const view = { accountId: null, role: 'public' as const, application: null, applications: [], restrictedContent: null };
  const page = renderToStaticMarkup(createElement(PersistedYawrdPresentation, { project, view }));
  assert.equal((page.match(/Task B · Conditional reward/g) ?? []).length, 1);
  assert.match(page, /Reward Payout status: Allocated — chain status not yet verified/); assert.match(page, /Payout Proposal: Unverified/);
  assert.doesNotMatch(page, />Paid<|keelbase1\.testnet/);
  const creatorPage = renderToStaticMarkup(createElement(PersistedYawrdPresentation, { project, view: { ...view, accountId: PAYOUT.creator, role: 'creator' } }));
  const crew = creatorPage.indexOf('aria-labelledby="crew-title"'), payout = creatorPage.indexOf('id="reward-payout"'), contributions = creatorPage.indexOf('aria-label="Contribution workflow not active"');
  assert.ok(crew >= 0 && payout > crew && contributions > payout, 'payout follows Creator Workspace and precedes contribution workflow');
});
test('Meteor payout adapter rejects altered terms, wrong accounts and a wallet replacement; serializes explicit transaction authorization', async () => {
  const listeners = new Map<string, Function[]>(); let signed = 0, release!: () => void;
  const meteor = { manifest: { id: 'meteor-wallet' }, getAccounts: async () => [{ accountId: PAYOUT.creator }],
    signAndSendTransaction: async () => { signed++; await new Promise<void>(resolve => { release = resolve; }); return { transaction: { hash: txHash } }; } };
  const connector = { network: 'testnet', whenManifestLoaded: Promise.resolve(), availableWallets: [meteor],
    getConnectedWallet: async () => ({ wallet: meteor }), on: (name: string, fn: Function) => listeners.set(name, [...(listeners.get(name) ?? []), fn]), off: () => {} };
  const session = new TestnetWalletSession(connector as unknown as NearConnector, () => {}); await session.start();
  const tx = payoutTransaction('create', PAYOUT.creator);
  const altered = structuredClone(tx); altered.actions[0].params.deposit = '1';
  await assert.rejects(session.signPayout(altered), /terms changed/);
  await assert.rejects(session.signPayout(payoutTransaction('approve', 'yawrd.testnet', proposal())), /account or network/);
  const first = session.signPayout(tx);
  while (!release) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(session.snapshot.busy, true); await assert.rejects(session.signPayout(tx), /account or network/);
  release(); await first; assert.equal(signed, 1); assert.equal(session.snapshot.busy, false);
  connector.getConnectedWallet = async () => ({ wallet: { ...meteor } });
  await assert.rejects(session.signPayout(tx), /account or network/); assert.equal(signed, 1);
  session.stop();
});
