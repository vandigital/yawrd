import { createHash } from 'node:crypto';
import { canonical, CreationRpc, type Rpc } from '../creation-integration.ts';
import { fail } from '../participants/repository.ts';
import { boundedReadRpc } from '../platform-fee/verification.ts';
import { PLATFORM_FEE } from '../platform-fee/policy.ts';
import { PROFILE_RUNTIME_HASH, type HardeningView } from './hardening.ts';
import { creationFeeTransaction, type CreationFeeReview, type FeeSecurityReview } from './platform-fee.ts';
const integer = (x: unknown): x is string => typeof x === 'string' && /^\d+$/.test(x);
export function feeSecurityReview(view: HardeningView): FeeSecurityReview {
  fail(view.verified && !view.autoUpdate && view.proposal?.status === 'Approved', 'fee_security_required', 409);
  return { verified: true, autoUpdate: false, proposalId: view.proposal.id, proposalStatus: 'Approved', votes: { ...view.proposal.votes },
    blockHeight: view.blockHeight, blockHash: view.blockHash, checkedAt: view.checkedAt };
}
/** Existing finalized RPC and reviewed runtime. No signing or broadcast. Native
 * transfer fee estimate uses its two send/execution costs; 2x is balance headroom,
 * not a promised maximum. Meteor must present the actual transaction fee. */
export async function preflightCreationFee(view: HardeningView, identityKey: string, transport: Rpc): Promise<NonNullable<CreationFeeReview['review']>> {
  feeSecurityReview(view);
  fail(view.accountId === view.binding.founderAccountId && /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(identityKey), 'signer_permission_unavailable', 409);
  const rpc = boundedReadRpc(transport), reader = new CreationRpc(rpc), block = view.blockHash;
  const [protocol, price, signer, recipient, key] = await Promise.all([
    rpc('EXPERIMENTAL_protocol_config', { block_id: block }), rpc('gas_price', [block] as any),
    reader.query('view_account', { account_id: view.accountId }, block),
    reader.query('view_account', { account_id: PLATFORM_FEE.recipient }, block),
    reader.query('view_access_key', { account_id: view.accountId, public_key: identityKey }, block),
  ]);
  fail(protocol?.protocol_version === 88 && createHash('sha256').update(canonical(protocol.runtime_config)).digest('hex') === PROFILE_RUNTIME_HASH,
    'profiled_runtime_changed', 409);
  fail([signer,recipient,key].every(r => r.block_hash === block) && key.permission === 'FullAccess', 'signer_permission_unavailable', 409);
  fail(integer(signer.amount) && integer(signer.locked) && Number.isSafeInteger(signer.storage_usage) && signer.storage_usage >= 0 &&
    integer(price?.gas_price) && BigInt(price.gas_price) > BigInt(0), 'balance_unavailable', 503);
  const costs = protocol.runtime_config.transaction_costs;
  const gas = [costs.action_creation_config.transfer_cost, costs.action_receipt_creation_config].reduce((total, item) => {
    for (const k of ['send_not_sir','execution']) fail(Number.isSafeInteger(item[k]) && item[k] > 0, 'profiled_runtime_changed', 409);
    return total + BigInt(item.send_not_sir) + BigInt(item.execution);
  }, BigInt(0));
  const estimate = gas * BigInt(price.gas_price), reserve = estimate * BigInt(2);
  const storage = BigInt(protocol.runtime_config.storage_amount_per_byte) * BigInt(signer.storage_usage) - BigInt(signer.locked);
  fail(BigInt(signer.amount) - (storage > BigInt(0) ? storage : BigInt(0)) >= BigInt(PLATFORM_FEE.amountYocto) + reserve,
    'insufficient_fee_balance', 409);
  const expiresAt = new Date(view.checkedAt).getTime() + 60000;
  fail(expiresAt > Date.now(), 'governance_stale', 409);
  return { transaction: creationFeeTransaction(view.accountId), expiresAt, feeEstimateYocto: estimate.toString(), feeReserveYocto: reserve.toString() };
}
