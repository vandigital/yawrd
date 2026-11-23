import { CreationRpc, prepareCreation, type FactorySettings, type Rpc } from '../creation-integration.ts';
import type { CreationInput } from '../create-yawrd.ts';
import { FeeError, requireFee, validateIntent, validHash, type PaymentRecord } from './policy.ts';
import { blockHeight, boundedReadRpc, evidenceDigest, finalizedHeight, verifyNativeTransfer, type TransferVerification } from './verification.ts';
import type { FeeStore } from './repository.ts';

type Reconciliation = { state: 'paid'; payment: PaymentRecord } | Exclude<TransferVerification, { state: 'verified' }>;
/** Non-operational server service: no route, wallet submission, provider, or runtime database import.
 * Supply only the existing cookie's server-hashed session token and operator-reviewed factory settings.
 */
export class PlatformFeeFoundation {
  private readonly rpc: Rpc;
  private readonly store: FeeStore;
  private readonly settings: FactorySettings;
  constructor(store: FeeStore, rpc: Rpc, settings: FactorySettings, timeoutMs = 20000) {
    this.store = store;
    this.rpc = boundedReadRpc(rpc, timeoutMs);
    this.settings = structuredClone(settings);
  }
  private session(hash: string) { requireFee(/^[a-f0-9]{64}$/.test(hash), 'sign_in_required'); }

  /** Verify existing creation; never creates a project or trusts a browser "confirmed" flag.
   * The project/DAO association must already exist in authenticated server records.
   */
  async reconcileDeployment(hash: string, projectId: string, input: CreationInput, creationHash: string) {
    this.session(hash);
    const p = await this.store.project(hash, projectId);
    requireFee(validHash(creationHash), 'invalid_creation_hash');
    const prepared = prepareCreation(input, this.settings, { accountId: p.founder, network: 'testnet' });
    requireFee(prepared.plan.daoAccountId === p.daoId && input.creatorAccountId === p.founder, 'deployment_identity_mismatch');
    // Fingerprint the same evidence the existing reconciler actually inspected.
    let raw: any;
    const verificationRpc: Rpc = async (method, params) => {
      const result = await this.rpc(method, params);
      if (method === 'EXPERIMENTAL_tx_status') raw = structuredClone(result);
      return result;
    };
    const verified = await new CreationRpc(verificationRpc).verify(prepared, creationHash);
    requireFee(verified.phase === 'confirmed', 'verified_creation_required');
    requireFee(raw?.final_execution_status === 'FINAL' && raw.transaction?.hash === creationHash, 'verified_creation_required');
    const finalHeight = await finalizedHeight(this.rpc);
    requireFee(BigInt(await blockHeight(this.rpc, raw.transaction_outcome?.block_hash)) <= BigInt(finalHeight), 'creation_not_final');
    await this.store.recordDeployment(hash, { ...p, creationHash, finalHeight, evidenceDigest: evidenceDigest({ prepared, raw }) });
  }
  async openIntent(hash: string, projectId: string) {
    this.session(hash);
    // Authenticate before any RPC. Database rechecks identity and deployment atomically.
    await this.store.project(hash, projectId);
    const i = await this.store.openIntent(hash, projectId, await finalizedHeight(this.rpc));
    validateIntent(i);
    return i;
  }
  async reconcilePayment(hash: string, intentId: string, txHash: string): Promise<Reconciliation> {
    this.session(hash);
    requireFee(validHash(txHash), 'invalid_transaction_hash');
    const i = await this.store.intent(hash, intentId);
    validateIntent(i);
    const saved = await this.store.recovery(hash, intentId);
    if (saved) {
      requireFee(saved.txHash === txHash, 'intent_already_paid');
      return { state: 'paid', payment: saved };
    }
    const result = await verifyNativeTransfer(this.rpc, i, txHash);
    if (result.state !== 'verified') return result;
    try {
      return { state: 'paid', payment: await this.store.claim(hash, intentId, result.evidence) };
    } catch (error) {
      if (error instanceof FeeError) throw error;
      // Includes a database timeout after commit. Recovery uses the same intent/hash;
      // no new transfer is ever requested, and no entitlement is returned speculatively.
      return { state: 'unknown', reason: 'claim_requires_recovery' };
    }
  }
}
