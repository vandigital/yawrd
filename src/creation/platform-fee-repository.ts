import type { Query, Row } from '../participants/database.ts';
import { WorkflowError, fail } from '../participants/repository.ts';
import type { HardeningBinding } from './hardening.ts';
import { CREATION_FEE_CONSENT, type CreationFee, type FeeSecurityReview } from './platform-fee.ts';
import type { VerifiedTransfer } from '../platform-fee/policy.ts';

export interface CreationFeeStore {
  available(): Promise<boolean>;
  read(session: string, id: string): Promise<CreationFee | null>;
  open(session: string, binding: HardeningBinding, review: FeeSecurityReview): Promise<CreationFee>;
  claim(session: string, binding: HardeningBinding, revision: number, review: FeeSecurityReview): Promise<CreationFee>;
  note(session: string, id: string, revision: number, hash: string | null): Promise<CreationFee>;
  complete(session: string, id: string, revision: number, evidence: VerifiedTransfer): Promise<CreationFee>;
}
function map(r: Row): CreationFee {
  return { creationId: String(r.creation_id), revision: Number(r.revision), state: r.state as CreationFee['state'], attempt: Number(r.attempt) as 0 | 1,
    network: r.network as 'testnet', founderAccountId: String(r.founder_account_id), daoAccountId: String(r.dao_account_id),
    deploymentTransaction: String(r.deployment_transaction), deploymentDigest: String(r.deployment_digest), deploymentFinalHeight: String(r.deployment_final_height),
    recipient: String(r.recipient), amountYocto: String(r.amount_yocto), policyVersion: String(r.policy_version),
    transaction: r.request as CreationFee['transaction'], securityReview: r.security_review as FeeSecurityReview, notBeforeHeight: String(r.not_before_height),
    claimHeight: r.claim_height == null ? null : String(r.claim_height), claimReview: r.claim_review as FeeSecurityReview | null,
    claimedAt: r.claimed_at == null ? null : new Date(r.claimed_at as string).toISOString(),
    transactionHash: r.transaction_hash == null ? null : String(r.transaction_hash), evidence: r.evidence as VerifiedTransfer | null };
}
export class PostgresCreationFeeStore implements CreationFeeStore {
  private readonly query: Query;
  constructor(query: Query) { this.query = query; }
  async available() {
    const [r] = await this.query(`SELECT to_regclass('yawrd.creation_platform_fees') IS NOT NULL
      AND to_regprocedure('yawrd.creation_fee_read(text,text)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_fee_open(text,text,bigint,bigint,jsonb)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_fee_claim(text,text,bigint,bigint,bigint,jsonb,text)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_fee_note(text,text,bigint,text)') IS NOT NULL
      AND to_regprocedure('yawrd.creation_fee_complete(text,text,bigint,jsonb)') IS NOT NULL AS installed`);
    return r?.installed === true;
  }
  private async run(sql: string, args: unknown[], optional = false) {
    try { const [r] = await this.query(sql, args); fail(r || optional, 'fee_not_found', 404); return r ? map(r) : null; }
    catch (error) {
      if (sql.includes('creation_fee_complete') && (error as {code?:string})?.code === '23505')
        throw new WorkflowError('fee_transaction_already_claimed',409);
      const message = error instanceof Error ? error.message : '';
      const code = ['sign_in_required', 'creation_not_found', 'creation_revision_conflict', 'deployment_revision_conflict',
        'fee_revision_conflict', 'fee_identity_frozen', 'fee_unresolved', 'fee_security_required', 'fee_not_found', 'fee_consent_required',
        'fee_evidence_required', 'fee_request_mismatch', 'creation_deployment_unverified'].find(code => message.includes(code));
      if (code) throw new WorkflowError(code, code === 'sign_in_required' ? 401 : code.endsWith('not_found') ? 404 : 409);
      throw error;
    }
  }
  read(s: string, id: string) { return this.run('SELECT * FROM yawrd.creation_fee_read($1,$2)', [s,id], true); }
  async open(s: string, b: HardeningBinding, r: FeeSecurityReview) {
    return (await this.run('SELECT * FROM yawrd.creation_fee_open($1,$2,$3,$4,$5::jsonb)', [s,b.creationId,b.creationRevision,b.intentRevision,JSON.stringify(r)]))!;
  }
  async claim(s: string, b: HardeningBinding, revision: number, r: FeeSecurityReview) {
    return (await this.run('SELECT * FROM yawrd.creation_fee_claim($1,$2,$3,$4,$5,$6::jsonb,$7)', [s,b.creationId,b.creationRevision,b.intentRevision,revision,JSON.stringify(r),CREATION_FEE_CONSENT]))!;
  }
  async note(s: string, id: string, revision: number, hash: string | null) {
    return (await this.run('SELECT * FROM yawrd.creation_fee_note($1,$2,$3,$4)', [s,id,revision,hash]))!;
  }
  async complete(s: string, id: string, revision: number, e: VerifiedTransfer) {
    return (await this.run('SELECT * FROM yawrd.creation_fee_complete($1,$2,$3,$4::jsonb)', [s,id,revision,JSON.stringify(e)]))!;
  }
}
