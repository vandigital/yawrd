import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { encodeBase64Utf8, type CreationInput } from '../src/create-yawrd.ts';
import { PLATFORM_FEE, FeeError, heldEntitlement, consumeInferenceEntitlement, type FeeProject, type PaymentIntent, type PaymentRecord, type VerifiedDeployment, type VerifiedTransfer } from '../src/platform-fee/policy.ts';
import { boundedReadRpc, verifyNativeTransfer } from '../src/platform-fee/verification.ts';
import { PlatformFeeFoundation } from '../src/platform-fee/service.ts';
import { PostgresFeeStore, type FeeStore } from '../src/platform-fee/repository.ts';
import { prepareCreation, RpcError, type Rpc, type FactorySettings } from '../src/creation-integration.ts';

const H = (s: string) => s.repeat(44);
const txHash = H('T'), creationHash = H('C'), receiptId = H('R'), blockHash = H('B'), refundId = H('F');
const session = 'a'.repeat(64), otherSession = 'b'.repeat(64);
function intent(projectId = 'project-one'): PaymentIntent {
  return { id: `intent-${projectId}`, projectId, founder: 'founder.testnet', daoId: `${projectId}.sputnik.testnet`,
    network: 'testnet', amountYocto: PLATFORM_FEE.amountYocto, recipient: PLATFORM_FEE.recipient, policyVersion: PLATFORM_FEE.version,
    creationHash, finalHeight: '90', notBeforeHeight: '100', evidenceDigest: 'd'.repeat(64) };
}
function response() {
  return { final_execution_status: 'FINAL', status: { SuccessValue: '' },
    transaction: { hash: txHash, signer_id: 'founder.testnet', receiver_id: 'yawrd.testnet', actions: [{ Transfer: { deposit: PLATFORM_FEE.amountYocto } }] },
    transaction_outcome: { id: txHash, block_hash: blockHash, outcome: { executor_id: 'founder.testnet', receipt_ids: [receiptId], status: { SuccessReceiptId: receiptId } } },
    receipts: [{ receipt_id: receiptId, predecessor_id: 'founder.testnet', receiver_id: 'yawrd.testnet',
      receipt: { Action: { signer_id: 'founder.testnet', actions: [{ Transfer: { deposit: PLATFORM_FEE.amountYocto } }] } } }],
    receipts_outcome: [{ id: receiptId, block_hash: blockHash, outcome: { executor_id: 'yawrd.testnet', receipt_ids: [] as string[], status: { SuccessValue: '' } as Record<string, unknown> } }],
  };
}
function rpcFor(result: unknown = response(), options: { network?: string; txHeight?: number; finalHeight?: number; fail?: boolean } = {}): Rpc {
  return async (method, params) => {
    if (options.fail) throw new RpcError({ cause: { name: 'UNKNOWN_TRANSACTION' } });
    if (method === 'status') return { chain_id: options.network ?? 'testnet' };
    if (method === 'block') return { header: { hash: params.block_id ?? H('Z'), height: params.block_id ? options.txHeight ?? 101 : options.finalHeight ?? 120 } };
    if (method === 'EXPERIMENTAL_tx_status') {
      assert.deepEqual(params, { tx_hash: txHash, sender_account_id: 'founder.testnet', wait_until: 'FINAL' });
      return structuredClone(result);
    }
    throw new Error(`Unexpected RPC ${method}`);
  };
}
const settings: FactorySettings = { network: 'testnet', factoryAccountId: 'sputnik.testnet', expectedFactoryCodeHash: H('A'), expectedDaoCodeHash: H('D'),
  setupDepositYocto: '10000000000000000000000', createGas: '150000000000000', costConfirmation: 'test fixture' };

// Behavioral reference model of the deferred SQL contract, NOT PostgreSQL proof.
// Claim decisions happen synchronously after the shared RPC rendezvous; unique
// maps model the proposed DB constraints. Runtime must use PostgresFeeStore.
class ModelStore implements FeeStore {
  intents = new Map<string, PaymentIntent>();
  payments = new Map<string, PaymentRecord>();
  used = new Map<string, string>();
  deploys = new Map<string, VerifiedDeployment>();
  claims = 0;
  loseCommitResponse = false;
  actor = 'founder.testnet';
  constructor(...ids: string[]) { for (const id of ids) { const i = intent(id); this.intents.set(i.id, i); this.deploys.set(id, i); } }
  auth(hash: string) { if (hash !== session) throw new FeeError('sign_in_required'); }
  async project(hash: string, projectId: string): Promise<FeeProject> {
    this.auth(hash);
    return { projectId, founder: this.actor, daoId: `${projectId}.sputnik.testnet` };
  }
  async recordDeployment(hash: string, d: VerifiedDeployment) { this.auth(hash); this.deploys.set(d.projectId, d); }
  async openIntent(hash: string, projectId: string, height: string) {
    this.auth(hash);
    if (!this.deploys.has(projectId)) throw new FeeError('verified_creation_required');
    const existing = this.intents.get(`intent-${projectId}`);
    if (existing) return structuredClone(existing);
    const i = { ...intent(projectId), notBeforeHeight: height };
    this.intents.set(i.id, i);
    return structuredClone(i);
  }
  async intent(hash: string, id: string) { this.auth(hash); const i = this.intents.get(id); if (!i || i.founder !== this.actor) throw new FeeError('founder_intent_required'); return structuredClone(i); }
  async recovery(hash: string, id: string) { await this.intent(hash, id); return this.payments.get(id) ?? null; }
  async claim(hash: string, id: string, e: VerifiedTransfer) {
    this.auth(hash);
    const i = this.intents.get(id)!;
    if (i.founder !== this.actor) throw new FeeError('founder_intent_required');
    const previous = this.payments.get(id);
    if (previous) { if (previous.txHash !== e.txHash) throw new FeeError('intent_already_paid'); return previous; }
    if (this.used.has(e.txHash)) throw new FeeError('transaction_already_claimed');
    const p: PaymentRecord = { ...e, intentId: id, projectId: i.projectId, entitlement: heldEntitlement() };
    this.used.set(e.txHash, id); this.payments.set(id, p); this.claims++;
    if (this.loseCommitResponse) { this.loseCommitResponse = false; throw new Error('db_timeout_after_commit'); }
    return p;
  }
}
const foundation = (store: FeeStore, rpc = rpcFor(), timeout = 20000) => new PlatformFeeFoundation(store, rpc, settings, timeout);

test('exact finalized native transfer verifies via server RPC; held entitlement cannot be consumed', async () => {
  const r = await verifyNativeTransfer(rpcFor(), intent(), txHash);
  assert.equal(r.state, 'verified');
  if (r.state === 'verified') {
    assert.equal(r.evidence.receiptId, receiptId);
    assert.equal(r.evidence.evidenceDigest.length, 64);
  }
  assert.deepEqual(heldEntitlement(), { state: 'verified-payment-held', generationBudget: 0, consumptionEnabled: false });
  assert.throws(consumeInferenceEntitlement, /inference_consumption_disabled/);
});

test('transaction and receipt evidence reject forged fields, actions and incomplete or unrelated graphs', async t => {
  const cases: [string, (r: any) => void][] = [
    ['wrong transaction hash', r => r.transaction.hash = H('X')],
    ['wrong signer', r => r.transaction.signer_id = 'attacker.testnet'],
    ['wrong recipient', r => r.transaction.receiver_id = 'attacker.testnet'],
    ['underpayment', r => r.transaction.actions[0].Transfer.deposit = '499999999999999999999999'],
    ['overpayment', r => r.transaction.actions[0].Transfer.deposit = '500000000000000000000001'],
    ['numeric amount', r => r.transaction.actions[0].Transfer.deposit = 5e23],
    ['extra action', r => r.transaction.actions.push({ Transfer: { deposit: '1' } })],
    ['function call', r => r.transaction.actions = [{ FunctionCall: { deposit: PLATFORM_FEE.amountYocto } }]],
    ['forged receipt amount', r => r.receipts[0].receipt.Action.actions[0].Transfer.deposit = '1'],
    ['forged receipt recipient', r => r.receipts[0].receiver_id = 'attacker.testnet'],
    ['forged predecessor', r => r.receipts[0].predecessor_id = 'attacker.testnet'],
    ['forged receipt signer', r => r.receipts[0].receipt.Action.signer_id = 'attacker.testnet'],
    ['forged executor', r => r.receipts_outcome[0].outcome.executor_id = 'attacker.testnet'],
    ['forged root ID', r => r.transaction_outcome.id = H('X')],
    ['unlinked receipt', r => r.transaction_outcome.outcome.receipt_ids = [H('X')]],
    ['unlinked success ID', r => r.transaction_outcome.outcome.status.SuccessReceiptId = H('X')],
    ['missing outcome', r => r.receipts_outcome = []],
    ['missing details', r => r.receipts = []],
    ['unrelated outcome', r => r.receipts_outcome.push({ ...r.receipts_outcome[0], id: H('X') })],
    ['duplicate outcome', r => r.receipts_outcome.push(r.receipts_outcome[0])],
    ['duplicate receipt', r => r.receipts.push(r.receipts[0])],
    ['cyclic graph', r => r.receipts_outcome[0].outcome.receipt_ids = [receiptId]],
    ['unresolved outcome', r => r.receipts_outcome[0].outcome.status = { Unknown: '' }],
    ['ambiguous status', r => r.status = { SuccessValue: '', Failure: {} }],
    ['wrong block hash', r => r.transaction_outcome.block_hash = 'forged'],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const r = response(); mutate(r);
    assert.equal((await verifyNativeTransfer(rpcFor(r), intent(), txHash)).state, 'invalid');
  });
});

test('pending, failed, unknown, malformed and timed-out lookups never claim payment', async () => {
  for (const state of ['NONE', 'INCLUDED', 'INCLUDED_FINAL', 'EXECUTED_OPTIMISTIC', 'EXECUTED']) {
    const store = new ModelStore('project-one');
    const r = await foundation(store, rpcFor({ final_execution_status: state })).reconcilePayment(session, 'intent-project-one', txHash);
    assert.equal(r.state, 'pending'); assert.equal(store.claims, 0);
  }
  const failed = response(); failed.receipts_outcome[0].outcome.status = { Failure: { error: 'failed' } };
  assert.equal((await verifyNativeTransfer(rpcFor(failed), intent(), txHash)).state, 'failed');
  assert.equal((await verifyNativeTransfer(rpcFor({}, { fail: true }), intent(), txHash)).state, 'unknown');
  assert.equal((await verifyNativeTransfer(rpcFor(null), intent(), txHash)).state, 'invalid');
  const never: Rpc = async () => new Promise(() => {});
  const store = new ModelStore('project-one');
  const r = await foundation(store, never, 5).reconcilePayment(session, 'intent-project-one', txHash);
  assert.equal(r.state, 'unknown'); assert.equal(store.claims, 0);
});

test('network, self-payment, policy and temporal bindings fail closed', async () => {
  assert.equal((await verifyNativeTransfer(rpcFor(response(), { network: 'mainnet' }), intent(), txHash)).state, 'invalid');
  for (const patch of [{ network: 'mainnet' }, { recipient: 'founder.testnet' }, { amountYocto: '1' }, { policyVersion: 'future' }, { finalHeight: '101' }]) {
    await assert.rejects(verifyNativeTransfer(rpcFor(), { ...intent(), ...patch } as PaymentIntent, txHash));
  }
  await assert.rejects(verifyNativeTransfer(rpcFor(), { ...intent(), founder: 'yawrd.testnet' }, txHash), /self_payment_forbidden/);
  assert.equal((await verifyNativeTransfer(rpcFor(response(), { txHeight: 100 }), intent(), txHash)).state, 'invalid');
  assert.equal((await verifyNativeTransfer(rpcFor(response(), { txHeight: 99 }), intent(), txHash)).state, 'invalid');
  assert.equal((await verifyNativeTransfer(rpcFor(response(), { txHeight: 121 }), intent(), txHash)).state, 'pending');
});

test('complete successful protocol refund is accepted; failing or missing descendant blocks verification', async () => {
  const r: any = response();
  r.receipts_outcome[0].outcome.receipt_ids = [refundId];
  r.receipts.push({ receipt_id: refundId, predecessor_id: 'system', receiver_id: 'founder.testnet',
    receipt: { Action: { actions: [{ Transfer: { deposit: '10' } }] } } });
  r.receipts_outcome.push({ id: refundId, block_hash: blockHash, outcome: { executor_id: 'founder.testnet', receipt_ids: [], status: { SuccessValue: '' } } });
  assert.equal((await verifyNativeTransfer(rpcFor(r), intent(), txHash)).state, 'verified');
  r.receipts_outcome[1].outcome.status = { Failure: {} };
  assert.equal((await verifyNativeTransfer(rpcFor(r), intent(), txHash)).state, 'failed');
  r.receipts_outcome.pop();
  assert.equal((await verifyNativeTransfer(rpcFor(r), intent(), txHash)).state, 'invalid');
});

test('authenticated intent requires server deployment; repeats preserve its original anchor', async () => {
  const store = new ModelStore(); const service = foundation(store);
  await assert.rejects(service.openIntent(session, 'project-one'), /verified_creation_required/);
  store.deploys.set('project-one', intent());
  const a = await service.openIntent(session, 'project-one');
  const b = await foundation(store, rpcFor(response(), { finalHeight: 130 })).openIntent(session, 'project-one');
  assert.deepEqual(a, b); assert.equal(a.notBeforeHeight, '120');
});

test('invalid session, foreign identity and changed identity cannot establish payment', async () => {
  const store = new ModelStore('project-one'); let calls = 0;
  const service = foundation(store, async (...args) => { calls++; return rpcFor()(...args); });
  await assert.rejects(service.reconcilePayment('', 'intent-project-one', txHash), /sign_in_required/);
  await assert.rejects(service.reconcilePayment(otherSession, 'intent-project-one', txHash), /sign_in_required/);
  assert.equal(calls, 0);
  const changed: Rpc = async (...args) => { const r = await rpcFor()(...args); if (args[0] === 'EXPERIMENTAL_tx_status') store.actor = 'other.testnet'; return r; };
  await assert.rejects(foundation(store, changed).reconcilePayment(session, 'intent-project-one', txHash), /founder_intent_required/);
  assert.equal(store.claims, 0);
});

// Release all claimants after both have observed no saved payment, so these
// tests exercise the atomic claim boundary rather than the recovery fast path.
function rendezvousRpc(count: number): Rpc {
  let arrived = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  return async (...args) => {
    if (args[0] === 'EXPERIMENTAL_tx_status') { if (++arrived === count) release(); await gate; }
    return rpcFor()(...args);
  };
}
test('concurrent same-intent claims recover exactly one payment and entitlement', async () => {
  const store = new ModelStore('project-one'); const service = foundation(store, rendezvousRpc(2));
  const results = await Promise.all([1, 2].map(() => service.reconcilePayment(session, 'intent-project-one', txHash)));
  assert.deepEqual(results[0], results[1]); assert.equal(results[0].state, 'paid');
  assert.equal(store.claims, 1); assert.equal(store.payments.size, 1);
});
test('concurrent cross-Yawrd transaction reuse has exactly one winner', async () => {
  const store = new ModelStore('project-one', 'project-two'); const service = foundation(store, rendezvousRpc(2));
  const results = await Promise.allSettled(['project-one', 'project-two'].map(id => service.reconcilePayment(session, `intent-${id}`, txHash)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const loser = results.find(r => r.status === 'rejected');
  assert.ok(loser?.status === 'rejected' && loser.reason.code === 'transaction_already_claimed');
  assert.equal(store.claims, 1); assert.equal(store.payments.size, 1);
});
test('database timeout after commit recovers without RPC or issuing another entitlement', async () => {
  const store = new ModelStore('project-one'); store.loseCommitResponse = true;
  assert.equal((await foundation(store).reconcilePayment(session, 'intent-project-one', txHash)).state, 'unknown');
  const service = foundation(store, async () => { throw new Error('RPC must not be called'); });
  const recovered = await service.reconcilePayment(session, 'intent-project-one', txHash);
  assert.equal(recovered.state, 'paid'); assert.equal(store.claims, 1);
  await assert.rejects(service.reconcilePayment(session, 'intent-project-one', H('X')), /intent_already_paid/);
});
test('SQL adapter sends only verified claim fields using one atomic function call', async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const store = new PostgresFeeStore(async (sql, values = []) => {
    calls.push({ sql, values });
    return [{ intent_id: 'intent', project_id: 'project', tx_hash: txHash, block_height: '101', receipt_id: receiptId,
      evidence_digest: 'd'.repeat(64), entitlement_state: 'verified-payment-held', generation_budget: 0, consumption_enabled: false }];
  });
  await store.claim(session, 'intent', { txHash, blockHeight: '101', receiptId, evidenceDigest: 'd'.repeat(64) });
  assert.deepEqual(calls, [{ sql: 'SELECT * FROM yawrd.fee_claim($1,$2,$3,$4,$5,$6)', values: [session, 'intent', txHash, '101', receiptId, 'd'.repeat(64)] }]);
});
test('foundation is unwired and SQL is excluded from migration discovery', async () => {
  const migrations = await readFile(new URL('../scripts/migrations.mjs', import.meta.url), 'utf8');
  assert.match(migrations, /\.\.\/migrations\//);
  const route = await readFile(new URL('../app/api/yawrd/[projectId]/[action]/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /platform-fee/);
  await assert.rejects(boundedReadRpc(rpcFor())('broadcast_tx_commit', {}), /read_only_rpc_required/);
});

function deploymentFixture() {
  const code = 'fee-test-dao';
  let n = BigInt(`0x${createHash('sha256').update(code).digest('hex')}`), codeHash = '';
  while (n) { codeHash = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Number(n % BigInt(58))] + codeHash; n /= BigInt(58); }
  const pinned = { ...settings, expectedDaoCodeHash: codeHash };
  const input: CreationInput = { projectName: 'Project One', projectPurpose: 'Build together', projectAccountLabel: 'project-one',
    creatorAccountId: 'founder.testnet', initialStewardAccountIds: ['steward.testnet'], stewardApprovalThreshold: 2, factoryAccountId: pinned.factoryAccountId };
  const p = prepareCreation(input, pinned, { accountId: input.creatorAccountId, network: 'testnet' });
  const call = (method_name: string, args: unknown) => ({ FunctionCall: { method_name, args: encodeBase64Utf8(JSON.stringify(args)) } });
  const raw: any = { final_execution_status: 'FINAL', status: { SuccessValue: '' },
    transaction: { hash: creationHash, signer_id: input.creatorAccountId, receiver_id: pinned.factoryAccountId,
      actions: [{ FunctionCall: { ...call('create', p.plan.factoryCall.args).FunctionCall, gas: pinned.createGas, deposit: pinned.setupDepositYocto } }] },
    transaction_outcome: { id: creationHash, block_hash: blockHash, outcome: { status: { SuccessReceiptId: H('E') }, receipt_ids: [H('E')] } },
    receipts: [
      { receipt_id: H('D'), predecessor_id: pinned.factoryAccountId, receiver_id: p.plan.daoAccountId,
        receipt: { Action: { actions: [call('new', p.plan.initializer)] } } },
      { receipt_id: H('K'), predecessor_id: pinned.factoryAccountId, receiver_id: pinned.factoryAccountId,
        receipt: { Action: { actions: [call('on_create', { account_id: p.plan.daoAccountId, attached_deposit: pinned.setupDepositYocto, predecessor_account_id: input.creatorAccountId })] } } },
    ],
    receipts_outcome: [
      { id: H('D'), outcome: { executor_id: p.plan.daoAccountId, status: { SuccessValue: '' } } },
      { id: H('K'), outcome: { executor_id: pinned.factoryAccountId, status: { SuccessValue: 'dHJ1ZQ==' } } },
    ],
  };
  const rpc: Rpc = async (method, params) => {
    if (method === 'status') return { chain_id: 'testnet' };
    if (method === 'EXPERIMENTAL_tx_status') return structuredClone(raw);
    if (method === 'block') return { header: { hash: params.block_id ?? H('Z'), height: params.block_id ? 90 : 100 } };
    if (params.request_type === 'view_code') return { code_base64: Buffer.from(code).toString('base64') };
    if (params.request_type === 'call_function') {
      const views: Record<string, unknown> = { get_config: p.plan.initializer.config, get_policy: p.plan.initializer.policy,
        get_factory_info: { factory_id: pinned.factoryAccountId, auto_update: false }, get_dao_list: [p.plan.daoAccountId] };
      return { result: [...Buffer.from(JSON.stringify(views[String(params.method_name)]))] };
    }
    throw new Error('unexpected deployment RPC');
  };
  return { pinned, input, raw, rpc };
}
test('deployment must pass existing creation reconciliation before a server intent can exist', async () => {
  const store = new ModelStore(); const f = deploymentFixture();
  const service = new PlatformFeeFoundation(store, f.rpc, f.pinned);
  await service.reconcileDeployment(session, 'project-one', f.input, creationHash);
  assert.equal(store.deploys.get('project-one')?.creationHash, creationHash);
  assert.equal(store.deploys.get('project-one')?.finalHeight, '100');
  assert.equal((await service.openIntent(session, 'project-one')).creationHash, creationHash);
  assert.equal(store.payments.size, 0);
});
test('pending, forged and mismatched deployment cannot establish an intent', async () => {
  for (const mutate of [
    (f: ReturnType<typeof deploymentFixture>) => { f.raw.final_execution_status = 'INCLUDED_FINAL'; },
    (f: ReturnType<typeof deploymentFixture>) => { f.raw.receipts_outcome[1].outcome.status.SuccessValue = 'ZmFsc2U='; },
    (f: ReturnType<typeof deploymentFixture>) => { f.raw.transaction.signer_id = 'attacker.testnet'; },
    (f: ReturnType<typeof deploymentFixture>) => { f.input.creatorAccountId = 'attacker.testnet'; },
    (f: ReturnType<typeof deploymentFixture>) => { f.input.projectAccountLabel = 'other-project'; },
  ]) {
    const store = new ModelStore(); const f = deploymentFixture(); mutate(f);
    const service = new PlatformFeeFoundation(store, f.rpc, f.pinned);
    await assert.rejects(service.reconcileDeployment(session, 'project-one', f.input, creationHash));
    assert.equal(store.deploys.size, 0); assert.equal(store.intents.size, 0);
  }
});
test('sequential cross-Yawrd replay is rejected and no second entitlement is issued', async () => {
  const store = new ModelStore('project-one', 'project-two'); const service = foundation(store);
  assert.equal((await service.reconcilePayment(session, 'intent-project-one', txHash)).state, 'paid');
  await assert.rejects(service.reconcilePayment(session, 'intent-project-two', txHash), /transaction_already_claimed/);
  assert.equal(store.payments.size, 1);
});
test('two different transactions cannot both fund the same intent', async () => {
  const store = new ModelStore('project-one'); const alternate = H('X'); let arrivals = 0; let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const rpc: Rpc = async (method, params) => {
    if (method !== 'EXPERIMENTAL_tx_status') return rpcFor()(method, params);
    if (++arrivals === 2) release(); await gate;
    const r = response(); r.transaction.hash = String(params.tx_hash); r.transaction_outcome.id = String(params.tx_hash);
    return r;
  };
  const results = await Promise.allSettled([txHash, alternate].map(h => foundation(store, rpc).reconcilePayment(session, 'intent-project-one', h)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(store.claims, 1);
});
