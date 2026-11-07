import { TASK_B_REWARD } from '../genesis/task-b-reward.ts';
import { encodeBase64Utf8 } from '../create-yawrd.ts';
import type { Rpc, AttemptStore } from '../creation-integration.ts';

export const PAYOUT = Object.freeze({ ...TASK_B_REWARD, creator: 'yawrd1.testnet', recipient: 'keelbase1.testnet',
  stewards: ['yawrd1.testnet', 'yawrd.testnet'] as readonly string[],
  merge: '26d2d5e8b087749f47696ee27732a42f32929da7', bond: '0', gas: '200000000000000' });
export const PAYOUT_ATTEMPT_KEY = 'yawrd:yaw-001:task-b:payout:v1';
// The browser releases this lock when the approval promise ends or its page
// unloads. A refresh in another mounted flow/tab cannot retire a live request.
const APPROVAL_REQUEST_LOCK = `${PAYOUT_ATTEMPT_KEY}:approval-request`;
export const payoutDescription = `YAW-001 Task B Reward Payout: 1 NEAR Testnet to ${PAYOUT.recipient}. Contribution request and founder acknowledgement recorded. ${PAYOUT.prUrl} Merge: ${PAYOUT.merge}`;
export const transferKind = () => ({ Transfer: { token_id: '', receiver_id: PAYOUT.recipient, amount: PAYOUT.amountYocto, msg: null } });
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
};
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
export const validHash = (v: unknown): v is string => typeof v === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const decode = (v: string) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(v), c => c.charCodeAt(0))));
const idOK = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

export type PayoutProposal = { id: number; proposer: string; description: string; kind: ReturnType<typeof transferKind>;
  status: string; votes: Record<string, string>; last_actions_log?: { block_height: string }[] };
export type PayoutTransaction = { network: 'testnet'; signerId: string; receiverId: string;
  actions: [{ type: 'FunctionCall'; params: { methodName: 'add_proposal' | 'act_proposal'; args: Record<string, unknown>; gas: string; deposit: string } }] };
export type PayoutContext = { accountId: string; acknowledged: boolean; acknowledgedAt: string | null };
export type PayoutEvidence = { hash: string; signer: string };
export type PayoutSnapshot = { proposal: PayoutProposal | null; conflicts: number[]; blockHash: string;
  settlement: 'unverified' | 'pending' | 'failed' | 'paid'; execution?: PayoutEvidence; transferReceipt?: string; evidenceNote?: string };
export type PayoutAttempt = { purpose: 'create' | 'approve'; signer: string; proposalId?: number; hash?: string; phase: 'awaiting' | 'unknown' | 'confirmed' | 'failed' | 'rejected' };
export type PayoutState = { snapshot: PayoutSnapshot | null; attempt: PayoutAttempt | null; busy: boolean; error: string };
export const initialPayoutState: PayoutState = { snapshot: null, attempt: null, busy: false, error: '' };
function savedAttempt(saved: string | null): PayoutAttempt | null {
  if (!saved) return null;
  const a = JSON.parse(saved) as PayoutAttempt;
  if (!a || !['create', 'approve'].includes(a.purpose) || !PAYOUT.stewards.includes(a.signer) || (a.purpose === 'create' && a.signer !== PAYOUT.creator)
    || (a.purpose === 'approve' && !idOK(a.proposalId)) || !['awaiting', 'unknown', 'confirmed', 'failed', 'rejected'].includes(a.phase) || (a.hash && !validHash(a.hash))) throw new Error('Saved wallet outcome is invalid. Reconcile wallet activity before continuing.');
  return a;
}

export function matchingProposal(p: PayoutProposal): boolean {
  return idOK(p.id) && p.proposer === PAYOUT.creator && typeof p.description === 'string'
    && p.description.split(/[\s()[\]<>]+/).includes(PAYOUT.prUrl)
    && p.description.split(/[^A-Za-z0-9]+/).includes(PAYOUT.merge)
    && same(p.kind, transferKind()) && !!p.votes && typeof p.votes === 'object' && !Array.isArray(p.votes);
}
export function approvalCount(p: PayoutProposal | null): number { return PAYOUT.stewards.filter(s => p?.votes[s] === 'Approve').length; }
export function payoutStatus(snapshot: PayoutSnapshot | null): string {
  if (!snapshot) return 'Allocated — chain status not yet verified';
  if (snapshot.conflicts.length) return 'Existing Payout Proposal needs review';
  const p = snapshot.proposal;
  if (!p) return 'Allocated — not yet proposed';
  if (snapshot.settlement === 'paid') return 'Paid';
  if (p.status === 'Failed' || snapshot.settlement === 'failed') return 'Execution failed — payout not confirmed';
  if (p.status === 'Approved') return snapshot.settlement === 'pending' ? 'Approved — transfer pending' : 'Approved — transfer settlement unverified';
  if (p.status !== 'InProgress') return `${p.status} — not paid`;
  return `${approvalCount(p)}/2 approvals — not paid`;
}
export function payoutTransaction(purpose: 'create' | 'approve', signer: string, proposal?: PayoutProposal | null): PayoutTransaction {
  if (!PAYOUT.stewards.includes(signer) || (purpose === 'create' && signer !== PAYOUT.creator)) throw new Error('This wallet cannot perform that payout action.');
  if (purpose === 'approve' && (!proposal || !matchingProposal(proposal) || proposal.status !== 'InProgress' || Object.hasOwn(proposal.votes, signer))) throw new Error('Refresh the Payout Proposal. Voting is unavailable or this wallet already voted.');
  return { network: 'testnet', signerId: signer, receiverId: PAYOUT.daoAccountId, actions: [{ type: 'FunctionCall', params: {
    methodName: purpose === 'create' ? 'add_proposal' : 'act_proposal',
    args: purpose === 'create' ? { proposal: { description: payoutDescription, kind: transferKind() } }
      : { id: proposal!.id, action: 'VoteApprove', proposal: transferKind(), memo: null }, gas: PAYOUT.gas, deposit: '0',
  } }] };
}

/** Only finalized public views and transaction/receipt evidence. Never broadcasts. */
export class PayoutChain {
  readonly rpc: Rpc;
  constructor(rpc: Rpc) { this.rpc = rpc; }
  async view(method_name: string, args: object, block_id: string): Promise<any> {
    const result = await this.rpc('query', { request_type: 'call_function', account_id: PAYOUT.daoAccountId,
      method_name, args_base64: encodeBase64Utf8(JSON.stringify(args)), block_id });
    if (result.block_hash !== block_id) throw new Error('Payout chain snapshot changed. Refresh before continuing.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(result.result)));
  }
  async read(evidence: PayoutEvidence[] = []): Promise<PayoutSnapshot> {
    if ((await this.rpc('status', {})).chain_id !== 'testnet') throw new Error('Reward Payout requires NEAR Testnet.');
    const block = await this.rpc('block', { finality: 'final' });
    const blockHash = block.header?.hash;
    if (!validHash(blockHash)) throw new Error('Finalized Testnet block is unavailable.');
    const count = await this.view('get_last_proposal_id', {}, blockHash);
    if (!idOK(count) || count > 1000) throw new Error('Proposal history could not be fully checked. Creation is disabled; review the project on Testnet.');
    const matches: PayoutProposal[] = [], conflicts: number[] = [];
    // Scan ID ranges, not returned array lengths: removed proposals leave holes.
    for (let from = 0; from < count; from += 50) {
      const proposals = await this.view('get_proposals', { from_index: from, limit: Math.min(50, count - from) }, blockHash);
      if (!Array.isArray(proposals)) throw new Error('Proposal history is unavailable.');
      for (const p of proposals) {
        if (!idOK(p.id) || p.id < from || p.id >= Math.min(from + 50, count)) throw new Error('Invalid proposal history.');
        const t = p.kind?.Transfer;
        // Any same-recipient native transfer could be this reward. Ambiguity
        // blocks creation; it is never interpreted as permission to pay again.
        if (t?.token_id === '' && t.receiver_id === PAYOUT.recipient) {
          if (matchingProposal(p)) matches.push(p); else conflicts.push(p.id);
        }
      }
    }
    if (matches.length > 1) conflicts.push(...matches.map(p => p.id));
    let proposal = matches.length === 1 ? matches[0] : null;
    if (proposal) {
      const fresh = await this.view('get_proposal', { id: proposal.id }, blockHash);
      if (!same(fresh, proposal)) throw new Error('Payout Proposal could not be reconciled.');
      proposal = fresh;
    }
    const snapshot: PayoutSnapshot = { proposal, conflicts: [...new Set(conflicts)], blockHash, settlement: 'unverified' };
    if (!proposal || conflicts.length) return snapshot;
    for (const item of evidence) {
      try {
        const verified = await this.verify(item, proposal);
        if (verified.state === 'paid' && proposal.status === 'Approved' && approvalCount(proposal) === 2) {
          return { ...snapshot, settlement: 'paid', execution: item, transferReceipt: verified.transferReceipt };
        }
        if (verified.purpose === 'approve') snapshot.settlement = verified.state === 'failed' ? 'failed' : verified.state === 'pending' ? 'pending' : snapshot.settlement;
      } catch { snapshot.evidenceNote = 'Transaction evidence is unverified. Refresh or provide the execution transaction hash.'; }
    }
    if (proposal.status === 'Approved' && approvalCount(proposal) === 2) {
      try {
        const found = await this.executionEvidence(proposal);
        for (const item of found) {
          const verified = await this.verify(item, proposal);
          if (verified.state === 'paid') return { ...snapshot, settlement: 'paid', execution: item, transferReceipt: verified.transferReceipt };
        }
      } catch { /* Missing historical RPC support leaves settlement unverified. */ }
      snapshot.evidenceNote = 'Approval is recorded. Successful transfer receipts have not yet been verified. Refresh or enter the execution transaction hash.';
    }
    return snapshot;
  }
  async verify(item: PayoutEvidence, proposal: PayoutProposal | null) {
    if (!validHash(item.hash) || !PAYOUT.stewards.includes(item.signer)) throw new Error('Use a Steward’s valid Testnet transaction hash.');
    const result = await this.rpc('EXPERIMENTAL_tx_status', { tx_hash: item.hash, sender_account_id: item.signer, wait_until: 'FINAL' });
    const tx = result.transaction, call = tx?.actions?.[0]?.FunctionCall;
    if (tx?.hash !== item.hash || tx.signer_id !== item.signer || tx.receiver_id !== PAYOUT.daoAccountId || tx.actions?.length !== 1 || !call || String(call.deposit) !== '0') throw new Error('Transaction does not match this Reward Payout.');
    const args = decode(call.args);
    const purpose = call.method_name === 'add_proposal' ? 'create' : 'approve';
    if (purpose === 'create') {
      if (item.signer !== PAYOUT.creator || !same(args, payoutTransaction('create', item.signer).actions[0].params.args)) throw new Error('Transaction does not match the fixed Payout Proposal.');
    } else if (call.method_name !== 'act_proposal' || !proposal || !matchingProposal(proposal) || args.id !== proposal.id || args.action !== 'VoteApprove' || !same(args.proposal, transferKind())) throw new Error('Transaction does not approve this Payout Proposal.');
    if (result.final_execution_status !== 'FINAL') return { purpose, state: 'pending' as const };
    const receipts: any[] = result.receipts, outcomes: any[] = result.receipts_outcome;
    const root = result.transaction_outcome;
    if (!Array.isArray(receipts) || !Array.isArray(outcomes) || root?.id !== item.hash || !Array.isArray(root.outcome?.receipt_ids)) throw new Error('Final transaction receipts are incomplete.');
    const byId = new Map(outcomes.map(o => [o.id, o]));
    const reachable = new Set<string>(), queue = [...root.outcome.receipt_ids];
    while (queue.length) {
      const id = queue.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const outcome = byId.get(id)?.outcome;
      if (!outcome && receipts.some(r => r.receipt_id === id && r.receipt?.Data)) continue;
      if (!outcome || !Array.isArray(outcome.receipt_ids)) throw new Error('Final receipt graph is incomplete.');
      queue.push(...outcome.receipt_ids);
    }
    const final = [root, ...outcomes.filter(o => reachable.has(o.id))];
    const failed = final.some(o => o.outcome?.status && 'Failure' in o.outcome.status);
    if (failed || (result.status && 'Failure' in result.status)) return { purpose, state: 'failed' as const };
    const success = (s: any) => s && typeof s === 'object' && ('SuccessValue' in s || 'SuccessReceiptId' in s);
    if (!success(result.status) || final.some(o => !success(o.outcome?.status))) throw new Error('Final receipt execution is unresolved.');
    if (receipts.some(r => r.receipt?.Action && (!reachable.has(r.receipt_id) || !byId.has(r.receipt_id)))) throw new Error('Receipt provenance is incomplete.');
    const invoked = receipts.find(r => root.outcome.receipt_ids.includes(r.receipt_id) && r.predecessor_id === item.signer && r.receiver_id === PAYOUT.daoAccountId
      && r.receipt?.Action?.actions?.length === 1 && same(r.receipt.Action.actions[0].FunctionCall, call));
    if (!invoked || byId.get(invoked.receipt_id)?.outcome.executor_id !== PAYOUT.daoAccountId) throw new Error('Steward call receipt is unverified.');
    const transfer = receipts.find(r => purpose === 'approve' && byId.get(invoked.receipt_id)?.outcome.receipt_ids.includes(r.receipt_id)
      && r.predecessor_id === PAYOUT.daoAccountId && r.receiver_id === PAYOUT.recipient && r.receipt?.Action?.actions?.length === 1
      && String(r.receipt.Action.actions[0].Transfer?.deposit) === PAYOUT.amountYocto);
    const settled = transfer && byId.get(transfer.receipt_id)?.outcome;
    if (settled?.executor_id === PAYOUT.recipient && settled.status && 'SuccessValue' in settled.status) return { purpose, state: 'paid' as const, transferReceipt: transfer.receipt_id as string };
    return { purpose, state: 'succeeded' as const };
  }
  private async executionEvidence(proposal: PayoutProposal): Promise<PayoutEvidence[]> {
    const found: PayoutEvidence[] = [];
    // Contract-retained action blocks are bounded to 20. Recover public evidence
    // across browsers without a database, indexer or transaction submission.
    for (const entry of [...(proposal.last_actions_log ?? [])].reverse().slice(0, 20)) {
      const height = Number(entry.block_height);
      if (!idOK(height)) continue;
      const block = await this.rpc('block', { block_id: height });
      for (const header of block.chunks ?? []) {
        const chunk = await this.rpc('chunk', { chunk_id: header.chunk_hash });
        for (const r of chunk.receipts ?? []) {
          if (r.predecessor_id !== PAYOUT.daoAccountId || r.receiver_id !== PAYOUT.recipient || r.receipt?.Action?.actions?.length !== 1 || String(r.receipt.Action.actions[0].Transfer?.deposit) !== PAYOUT.amountYocto) continue;
          const origin = await this.rpc('EXPERIMENTAL_receipt_to_tx', { receipt_id: r.receipt_id, block_height: height, shard_id: chunk.header.shard_id });
          if (validHash(origin.transaction_hash) && PAYOUT.stewards.includes(origin.sender_account_id)) found.push({ hash: origin.transaction_hash, signer: origin.sender_account_id });
        }
      }
      if (found.length) break;
    }
    return found;
  }
}

/** Public attempt metadata only. No automatic signing, retries or extra votes. */
export class PayoutFlow {
  state: PayoutState = { ...initialPayoutState };
  private active = true;
  readonly chain: PayoutChain;
  readonly store: AttemptStore & { removeItem?: (key: string) => void };
  readonly changed: (s: PayoutState) => void;
  constructor(chain: PayoutChain, store: AttemptStore & { removeItem?: (key: string) => void }, changed: (s: PayoutState) => void) {
    this.chain = chain; this.store = store; this.changed = changed;
    try {
      this.state.attempt = savedAttempt(store.getItem(PAYOUT_ATTEMPT_KEY));
    } catch { this.state.error = 'Saved wallet outcome could not be read. Creation is disabled; reconcile wallet activity first.'; }
  }
  stop() { this.active = false; }
  private update(change: Partial<PayoutState>) { this.state = { ...this.state, ...change }; if (this.active) this.changed(this.state); }
  private save(attempt: PayoutAttempt) { this.store.setItem(PAYOUT_ATTEMPT_KEY, JSON.stringify(attempt)); this.update({ attempt }); }
  async refresh(evidence: PayoutEvidence[] = []) {
    if (!this.active || this.state.busy) return;
    this.update({ busy: true });
    try {
      const marker = this.store.getItem(PAYOUT_ATTEMPT_KEY);
      const attempt = savedAttempt(marker);
      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      if (attempt?.purpose === 'approve' && !attempt.hash && ['awaiting', 'unknown'].includes(attempt.phase)
        && locks && this.store.removeItem) {
        await locks.request(APPROVAL_REQUEST_LOCK, { ifAvailable: true }, lock => this.reconcile(evidence, lock ? marker : null));
      } else await this.reconcile(evidence);
    }
    catch { this.update({ snapshot: null, error: 'Testnet payout state could not be verified. Actions are disabled. Refresh to try again.' }); }
    finally { this.update({ busy: false }); }
  }
  private async reconcile(evidence: PayoutEvidence[] = [], recoverMarker: string | null = null) {
    // Another tab may have opened Meteor since this instance last rendered.
    let attempt = savedAttempt(this.store.getItem(PAYOUT_ATTEMPT_KEY));
    this.update({ attempt });
    const snapshot = await this.chain.read([...(attempt?.hash ? [{ hash: attempt.hash, signer: attempt.signer }] : []), ...evidence]);
    if (attempt?.phase === 'confirmed' && !snapshot.proposal) throw new Error('A previously confirmed Payout Proposal is missing. Review its transaction evidence; creation remains blocked.');
    this.update({ snapshot, error: '' });
    if (attempt) {
      const p = snapshot.proposal;
      const signer = attempt.signer;
      if (!attempt.hash) for (const item of evidence.filter(e => e.signer === signer)) {
        const verified = await this.chain.verify(item, p);
        if (verified.purpose === attempt.purpose) { this.save({ ...attempt, hash: item.hash, phase: 'unknown' }); attempt = this.state.attempt!; break; }
      }
      // A known hash must resolve before a vote observation can unlock retry.
      if (attempt.purpose === 'approve' && attempt.hash) {
        const result = await this.chain.verify({ hash: attempt.hash, signer: attempt.signer }, p);
        if (result.purpose !== attempt.purpose) throw new Error('Transaction does not match the saved payout attempt.');
        if (result.state === 'pending') return;
        if (result.state === 'failed') { this.save({ ...attempt, phase: 'failed' }); return; }
      }
      if ((attempt.purpose === 'create' && p) || (attempt.purpose === 'approve' && p && p.id === attempt.proposalId && Object.hasOwn(p.votes, attempt.signer))) this.save({ ...attempt, phase: 'confirmed' });
      else if (attempt.purpose === 'create' && attempt.hash) {
        const result = await this.chain.verify({ hash: attempt.hash, signer: attempt.signer }, p);
        if (result.state === 'failed') this.save({ ...attempt, phase: 'failed' });
      }
      else if (recoverMarker && !attempt.hash && attempt.purpose === 'approve' && ['awaiting', 'unknown'].includes(attempt.phase)
        && !evidence.length && !snapshot.conflicts.length && p && p.id === attempt.proposalId && matchingProposal(p)
        && p.status === 'InProgress' && !Object.hasOwn(p.votes, attempt.signer)
        && this.store.getItem(PAYOUT_ATTEMPT_KEY) === recoverMarker && this.store.removeItem) {
        // Retire only the abandoned local approval marker. The proposal and
        // wallet/session data are untouched; the next click reauthorizes afresh.
        this.store.removeItem(PAYOUT_ATTEMPT_KEY);
        this.update({ attempt: null, error: '' });
      }
    }
  }
  async submit(purpose: 'create' | 'approve', wallet: { getContext: () => { accountId: string | null; network: string }; signPayout: (tx: PayoutTransaction) => Promise<unknown> },
    context: () => Promise<PayoutContext>, stillCurrent: () => boolean = () => true) {
    if (!this.active || this.state.busy) return;
    this.update({ busy: true, error: '' });
    try {
      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
      if (purpose === 'approve' && locks) await locks.request(APPROVAL_REQUEST_LOCK, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('An approval wallet request is still active. Finish or close that request before retrying.');
        await this.submitRequest(purpose, wallet, context, stillCurrent);
      });
      else await this.submitRequest(purpose, wallet, context, stillCurrent);
    } catch (error) { this.update({ error: error instanceof Error ? error.message : 'Approval request could not be prepared.' }); }
    finally { this.update({ busy: false }); }
  }
  private async submitRequest(purpose: 'create' | 'approve', wallet: { getContext: () => { accountId: string | null; network: string }; signPayout: (tx: PayoutTransaction) => Promise<unknown> },
    context: () => Promise<PayoutContext>, stillCurrent: () => boolean) {
    const account = wallet.getContext().accountId;
    let requested = false;
    try {
      const check = () => {
        if (!this.active || !stillCurrent() || !account || wallet.getContext().accountId !== account || wallet.getContext().network !== 'testnet') throw new Error('Wallet or sign-in changed. Refresh and review again.');
      };
      check();
      const auth = await context();
      if (auth.accountId !== account || !auth.acknowledged) throw new Error('Sign in with the selected Steward wallet. The recorded Task B acknowledgement must be available.');
      // Storage must be readable before signing; corrupt/unresolved outcomes
      // never become a new proposal just because a fresh view is empty.
      savedAttempt(this.store.getItem(PAYOUT_ATTEMPT_KEY));
      await this.reconcile();
      check();
      const snapshot = this.state.snapshot!;
      if (snapshot.conflicts.length) throw new Error('Existing matching transfer proposals need review. Creation and voting are disabled.');
      const a = this.state.attempt;
      if (a && ['awaiting', 'unknown'].includes(a.phase)) throw new Error('A previous wallet request has an uncertain outcome. Reconcile it before another transaction.');
      if (purpose === 'create' && snapshot.proposal) throw new Error('A matching Payout Proposal already exists. Review it instead of creating another.');
      const tx = payoutTransaction(purpose, account!, snapshot.proposal);
      const latest = await context();
      check();
      if (latest.accountId !== account || !latest.acknowledged) throw new Error('Sign-in or contribution acknowledgement is no longer available.');
      const other = savedAttempt(this.store.getItem(PAYOUT_ATTEMPT_KEY));
      if (other && ['awaiting', 'unknown'].includes(other.phase)) throw new Error('Another wallet request is awaiting reconciliation. Refresh before proceeding.');
      this.save({ purpose, signer: account!, ...(purpose === 'approve' ? { proposalId: snapshot.proposal!.id } : {}), phase: 'awaiting' });
      requested = true;
      const result = await wallet.signPayout(tx) as any;
      const hash = result?.transaction?.hash;
      this.save({ ...this.state.attempt!, phase: 'unknown', ...(validHash(hash) ? { hash } : {}) });
      await this.reconcile();
    } catch (error) {
      // Only an explicit wallet rejection releases an unsubmitted attempt.
      const rejected = requested && ([4001, 'USER_REJECTED', 'UserRejected'].includes((error as any)?.code) || (error as any)?.message === 'User rejected');
      const notRequested = requested && (error as any)?.code === 'PAYOUT_NOT_REQUESTED';
      if (rejected || notRequested) { try { this.save({ ...this.state.attempt!, phase: rejected ? 'rejected' : 'failed' }); } catch { /* Keep durable awaiting record. */ } }
      this.update({ error: notRequested ? 'No wallet transaction was requested. Reconnect the selected Steward wallet, refresh and review again.' : rejected ? 'Wallet request cancelled. No transaction was confirmed. Refresh before trying again.' : requested ? 'Wallet outcome needs reconciliation. Refresh status and check wallet activity before retrying. No additional transaction was requested.' : error instanceof Error ? error.message : 'Payout action could not be prepared.' });
    }
  }
  async redirect(hash: string) {
    const a = this.state.attempt;
    if (!a || !validHash(hash) || !['awaiting', 'unknown'].includes(a.phase) || this.state.busy) return;
    this.save({ ...a, hash, phase: 'unknown' });
    await this.refresh();
  }
}
