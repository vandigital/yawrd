import { createHash } from 'node:crypto';
import type { Rpc } from '../creation-integration.ts';
import { FeeError, requireFee, validHash, validHeight, validateIntent, type PaymentIntent, type VerifiedTransfer } from './policy.ts';

// RPC JSON is untrusted. Objects are narrowed by the checks below, before use.
type Json = Record<string, any>;
const object = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (v: unknown, key: string): v is Json => object(v) && Object.keys(v).length === 1 && Object.hasOwn(v, key);
const success = (v: unknown) => (only(v, 'SuccessValue') && typeof v.SuccessValue === 'string') ||
  (only(v, 'SuccessReceiptId') && validHash(v.SuccessReceiptId));
export const evidenceDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type TransferVerification = { state: 'verified'; evidence: VerifiedTransfer } |
  { state: 'pending' | 'unknown' | 'failed' | 'invalid'; reason: string };

/** Wraps even injected RPC transports with a deadline. A timeout never means failed payment. */
export function boundedReadRpc(rpc: Rpc, timeoutMs = 20000): Rpc {
  requireFee(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 20000, 'invalid_rpc_timeout');
  return async (method, params) => {
    requireFee(['status', 'query', 'EXPERIMENTAL_tx_status', 'block', 'EXPERIMENTAL_protocol_config', 'gas_price'].includes(method), 'read_only_rpc_required');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([rpc(method, params), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('rpc_timeout')), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  };
}
export async function finalizedHeight(rpc: Rpc): Promise<string> {
  requireFee((await rpc('status', {}))?.chain_id === 'testnet', 'wrong_rpc_network');
  const h = (await rpc('block', { finality: 'final' }))?.header;
  requireFee(h && validHash(h.hash) && Number.isSafeInteger(h.height) && h.height > 0, 'invalid_final_block');
  return String(h.height);
}
export async function blockHeight(rpc: Rpc, hash: unknown): Promise<string> {
  requireFee(validHash(hash), 'missing_block_hash');
  const h = (await rpc('block', { block_id: hash }))?.header;
  requireFee(h?.hash === hash && Number.isSafeInteger(h.height) && h.height > 0, 'invalid_block');
  return String(h.height);
}

/** Server RPC lookup only. Never accepts wallet receipts, raw client JSON, or signed transactions. */
export async function verifyNativeTransfer(transport: Rpc, intent: PaymentIntent, txHash: string): Promise<TransferVerification> {
  const rpc = boundedReadRpc(transport);
  validateIntent(intent);
  requireFee(validHash(txHash), 'invalid_transaction_hash');
  try {
    const finalHeight = await finalizedHeight(rpc);
    const r = await rpc('EXPERIMENTAL_tx_status', { tx_hash: txHash, sender_account_id: intent.founder, wait_until: 'FINAL' });
    // Nodes may return partial data before transaction/receipt details exist.
    if (['NONE', 'INCLUDED', 'EXECUTED_OPTIMISTIC', 'INCLUDED_FINAL', 'EXECUTED'].includes(r?.final_execution_status)) {
      return { state: 'pending', reason: 'awaiting_final_receipts' };
    }
    requireFee(r?.final_execution_status === 'FINAL', 'unresolved_execution');
    const tx = r.transaction;
    const transfer = (actions: unknown) => Array.isArray(actions) && actions.length === 1 &&
      only(actions[0], 'Transfer') && only(actions[0].Transfer, 'deposit') && actions[0].Transfer.deposit === intent.amountYocto;
    requireFee(tx?.hash === txHash && tx.signer_id === intent.founder && tx.receiver_id === intent.recipient && transfer(tx.actions), 'transaction_mismatch');
    const root = r.transaction_outcome;
    requireFee(root?.id === txHash && root.outcome?.executor_id === intent.founder && Array.isArray(root.outcome.receipt_ids) &&
      root.outcome.receipt_ids.length === 1 && validHash(root.outcome.receipt_ids[0]), 'invalid_transaction_outcome');
    requireFee(Array.isArray(r.receipts) && Array.isArray(r.receipts_outcome) && r.receipts_outcome.length > 0 &&
      r.receipts.length <= 32 && r.receipts_outcome.length <= 32, 'incomplete_receipts');
    const receipts = new Map<string, Json>(), outcomes = new Map<string, Json>();
    for (const receipt of r.receipts) {
      requireFee(object(receipt) && validHash(receipt.receipt_id) && !receipts.has(receipt.receipt_id), 'invalid_receipt_ids');
      receipts.set(receipt.receipt_id, receipt);
    }
    for (const outcome of r.receipts_outcome) {
      requireFee(object(outcome) && validHash(outcome.id) && outcome.id !== txHash && !outcomes.has(outcome.id), 'invalid_outcome_ids');
      outcomes.set(outcome.id, outcome);
    }
    // Every returned outcome and receipt must belong to the root's complete graph.
    const reached = new Set<string>(), queue: string[] = [...root.outcome.receipt_ids];
    while (queue.length) {
      const id = queue.pop()!;
      requireFee(validHash(id) && !reached.has(id), 'invalid_receipt_graph');
      reached.add(id);
      const o = outcomes.get(id)?.outcome;
      requireFee(o && Array.isArray(o.receipt_ids) && o.receipt_ids.every(validHash), 'incomplete_receipt_graph');
      queue.push(...o.receipt_ids);
    }
    requireFee([...outcomes.keys(), ...receipts.keys()].every(id => reached.has(id)), 'unrelated_receipt');
    requireFee([...outcomes.keys()].every(id => receipts.has(id)), 'missing_receipt_details');
    const invokedId = root.outcome.receipt_ids[0];
    const invoked = receipts.get(invokedId), settled = outcomes.get(invokedId)?.outcome;
    requireFee(invoked?.predecessor_id === intent.founder && invoked.receiver_id === intent.recipient &&
      only(invoked.receipt, 'Action') && invoked.receipt.Action.signer_id === intent.founder &&
      transfer(invoked.receipt.Action.actions) && settled?.executor_id === intent.recipient, 'unverified_transfer_receipt');
    requireFee(only(root.outcome.status, 'SuccessReceiptId') && root.outcome.status.SuccessReceiptId === invokedId, 'unlinked_transfer_receipt');
    // Descendants of a simple native transfer can only be protocol refunds. Reject
    // calls, additional recipient transfers, and injected arbitrary action receipts.
    for (const [id, receipt] of receipts) {
      if (id === invokedId) continue;
      requireFee(receipt.predecessor_id === 'system' && receipt.receiver_id === intent.founder && only(receipt.receipt, 'Action') &&
        Array.isArray(receipt.receipt.Action.actions) && receipt.receipt.Action.actions.length === 1 &&
        only(receipt.receipt.Action.actions[0], 'Transfer') &&
        /^[0-9]+$/.test(receipt.receipt.Action.actions[0].Transfer?.deposit) &&
        outcomes.get(id)?.outcome?.executor_id === intent.founder, 'unexpected_receipt_action');
    }
    const all = [root, ...outcomes.values()];
    if (only(r.status, 'Failure') || all.some(o => only(o.outcome?.status, 'Failure'))) return { state: 'failed', reason: 'execution_failed' };
    requireFee(only(r.status, 'SuccessValue') && typeof r.status.SuccessValue === 'string' &&
      only(settled.status, 'SuccessValue') && all.every(o => success(o.outcome?.status)), 'unresolved_receipt_outcome');
    for (const o of all) {
      if (only(o.outcome.status, 'SuccessReceiptId')) requireFee(o.outcome.receipt_ids.includes(o.outcome.status.SuccessReceiptId), 'unlinked_success_receipt');
    }
    const height = await blockHeight(rpc, root.block_hash);
    requireFee(BigInt(height) > BigInt(intent.notBeforeHeight), 'payment_predates_intent');
    // The final head read before waiting may be behind; classify it as pending.
    const latestFinal = BigInt(await finalizedHeight(rpc));
    requireFee(latestFinal >= BigInt(finalHeight), 'inconsistent_final_head');
    for (const o of all) {
      const h = BigInt(await blockHeight(rpc, o.block_hash));
      requireFee(h >= BigInt(height), 'receipt_predates_transaction');
      if (h > latestFinal) return { state: 'pending', reason: 'awaiting_final_block' };
    }
    return { state: 'verified', evidence: { txHash, blockHeight: height, receiptId: invokedId, evidenceDigest: evidenceDigest(r) } };
  } catch (error) {
    // All transport errors (including unknown/pruned txs) preserve uncertainty.
    if (error instanceof Error && error.name === 'Error' && error.message === 'rpc_timeout') return { state: 'unknown', reason: 'rpc_timeout' };
    if (error instanceof FeeError) return { state: 'invalid', reason: error.code };
    return { state: 'unknown', reason: 'rpc_or_evidence_unavailable' };
  }
}
