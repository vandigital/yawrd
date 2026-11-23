import type { Query, Row } from '../participants/database.ts';
import { heldEntitlement, requireFee, type FeeProject, type VerifiedDeployment, type PaymentIntent, type PaymentRecord, type VerifiedTransfer } from './policy.ts';

/** Implementations must atomically recheck authorization/bindings at every write.
 * No in-memory implementation is suitable for activation. See deferred SQL proposal.
 */
export interface FeeStore {
  project(sessionHash: string, projectId: string): Promise<FeeProject>;
  recordDeployment(sessionHash: string, deployment: VerifiedDeployment): Promise<void>;
  openIntent(sessionHash: string, projectId: string, anchorHeight: string): Promise<PaymentIntent>;
  intent(sessionHash: string, intentId: string): Promise<PaymentIntent>;
  recovery(sessionHash: string, intentId: string): Promise<PaymentRecord | null>;
  claim(sessionHash: string, intentId: string, evidence: VerifiedTransfer): Promise<PaymentRecord>;
}
const session = `s.token_hash = $1 AND s.network = 'testnet' AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()`;
function intent(row: Row): PaymentIntent {
  return { id: String(row.id), network: row.network as 'testnet', projectId: String(row.project_id), founder: String(row.founder), daoId: String(row.dao_id),
    creationHash: String(row.creation_hash), finalHeight: String(row.final_height), evidenceDigest: String(row.deployment_digest),
    amountYocto: String(row.amount_yocto), recipient: String(row.recipient), policyVersion: String(row.policy_version), notBeforeHeight: String(row.not_before_height) };
}
function payment(row: Row): PaymentRecord {
  requireFee(row.entitlement_state === 'verified-payment-held' && String(row.generation_budget) === '0' && row.consumption_enabled === false, 'invalid_entitlement');
  return { intentId: String(row.intent_id), projectId: String(row.project_id), txHash: String(row.tx_hash), blockHeight: String(row.block_height),
    receiptId: String(row.receipt_id), evidenceDigest: String(row.evidence_digest), entitlement: heldEntitlement() };
}
/** Unwired adapter. Constructor never opens a database connection. */
export class PostgresFeeStore implements FeeStore {
  readonly query: Query;
  constructor(query: Query) { this.query = query; }
  async project(hash: string, id: string): Promise<FeeProject> {
    const [r] = await this.query(`SELECT p.id, p.creator_account_id, p.dao_account_id FROM yawrd.projects p
      JOIN yawrd.sessions s ON s.account_id = p.creator_account_id AND s.network = p.network
      WHERE ${session} AND p.id = $2 AND p.dao_account_id IS NOT NULL`, [hash, id]);
    requireFee(r, 'founder_project_required');
    return { projectId: String(r.id), founder: String(r.creator_account_id), daoId: String(r.dao_account_id) };
  }
  async recordDeployment(hash: string, d: VerifiedDeployment): Promise<void> {
    await this.query('SELECT yawrd.fee_record_deployment($1,$2,$3,$4,$5,$6,$7)',
      [hash, d.projectId, d.founder, d.daoId, d.creationHash, d.finalHeight, d.evidenceDigest]);
  }
  async openIntent(hash: string, projectId: string, height: string): Promise<PaymentIntent> {
    const [r] = await this.query('SELECT * FROM yawrd.fee_open_intent($1,$2,$3)', [hash, projectId, height]);
    requireFee(r, 'payment_intent_unavailable');
    return intent(r);
  }
  async intent(hash: string, id: string): Promise<PaymentIntent> {
    const [r] = await this.query(`SELECT i.*, d.final_height, d.evidence_digest AS deployment_digest FROM yawrd.fee_intents i
      JOIN yawrd.fee_deployments d USING (network, project_id, founder, dao_id, creation_hash)
      JOIN yawrd.projects p ON p.network = i.network AND p.id = i.project_id AND p.creator_account_id = i.founder AND p.dao_account_id = i.dao_id
      JOIN yawrd.sessions s ON s.account_id = i.founder AND s.network = i.network
      WHERE ${session} AND i.id = $2`, [hash, id]);
    requireFee(r, 'founder_intent_required');
    return intent(r);
  }
  async recovery(hash: string, id: string): Promise<PaymentRecord | null> {
    // Authenticate even when no payment exists. Never leak another founder's status.
    await this.intent(hash, id);
    const [r] = await this.query(`SELECT pay.*, e.state AS entitlement_state, e.generation_budget, e.consumption_enabled
      FROM yawrd.fee_payments pay JOIN yawrd.fee_entitlements e USING (intent_id)
      JOIN yawrd.fee_intents i ON i.id = pay.intent_id
      JOIN yawrd.projects p ON p.network = i.network AND p.id = i.project_id AND p.creator_account_id = i.founder AND p.dao_account_id = i.dao_id
      JOIN yawrd.sessions s ON s.account_id = i.founder AND s.network = i.network
      WHERE ${session} AND pay.intent_id = $2`, [hash, id]);
    return r ? payment(r) : null;
  }
  async claim(hash: string, id: string, e: VerifiedTransfer): Promise<PaymentRecord> {
    const [r] = await this.query('SELECT * FROM yawrd.fee_claim($1,$2,$3,$4,$5,$6)',
      [hash, id, e.txHash, e.blockHeight, e.receiptId, e.evidenceDigest]);
    requireFee(r, 'payment_claim_unavailable');
    return payment(r);
  }
}
