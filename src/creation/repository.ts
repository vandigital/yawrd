import type { PreparedCreation } from '../creation-integration.ts';
import { generateDaoIdentifier } from './dao-identifier.ts';
import { DEPLOYMENT_CONSENT, type DeploymentIntent, type DeploymentCosts, type VerifiedDeploymentEvidence } from './deployment-types.ts';
import type { Query, Row } from '../participants/database.ts';
import type { YawrdIntakeDraftV1 } from '../yawrd-intake.ts';
import { allocatePublicId, generatePublicId } from '../project-identity.ts';
import { fail, WorkflowError } from '../participants/repository.ts';
import { configurationInput, intakeInput, projectInput, reviewInput, revisionInput, sessionInput, type CreationConfiguration } from './validation.ts';

export type PrivateCreation = {
  id: string; network: 'testnet'; founderAccountId: string; sourceDraftId: string;
  revision: number; initialIntake: YawrdIntakeDraftV1; intake: YawrdIntakeDraftV1;
  configuration: CreationConfiguration; publicTextDigest: string;
  publicTextReview: null | { revision: number; digest: string; consentVersion: string; reviewedAt: string };
  createdAt: string; updatedAt: string;
};
export type CreationSummary = Pick<PrivateCreation, 'id' | 'network' | 'revision' | 'createdAt' | 'updatedAt'> & { displayName: string };
const time = (value: unknown) => new Date(value as string | Date).toISOString();
function creation(r: Row): PrivateCreation {
  return {
    id: String(r.id), network: 'testnet', founderAccountId: String(r.founder_account_id), sourceDraftId: String(r.source_draft_id), revision: Number(r.revision),
    initialIntake: structuredClone(r.initial_intake as YawrdIntakeDraftV1), intake: structuredClone(r.intake as YawrdIntakeDraftV1),
    configuration: { publicName: String(r.public_name), publicDescription: String(r.public_description), accountLabel: String(r.account_label), secondSteward: String(r.second_steward), threshold: 2 },
    publicTextDigest: String(r.public_text_digest),
    publicTextReview: r.reviewed_revision == null ? null : { revision: Number(r.reviewed_revision), digest: String(r.reviewed_public_text_digest), consentVersion: String(r.public_text_consent_version), reviewedAt: time(r.public_text_reviewed_at) },
    createdAt: time(r.created_at), updatedAt: time(r.updated_at),
  };
}
function deployment(r: Row): DeploymentIntent {
  return {
    creationId: String(r.creation_id), network: 'testnet', factoryAccountId: String(r.factory_account_id),
    identifier: String(r.dao_identifier), daoAccountId: String(r.dao_account_id), sourceRevision: Number(r.source_revision),
    revision: Number(r.revision), state: r.state as DeploymentIntent['state'],
    prepared: r.prepared == null ? null : structuredClone(r.prepared as PreparedCreation),
    requestDigest: r.request_digest == null ? null : String(r.request_digest),
    costs: r.costs == null ? null : structuredClone(r.costs as DeploymentCosts),
    preparedAt: r.prepared_at == null ? null : time(r.prepared_at), attempt: Number(r.attempt),
    claimedAt: r.claimed_at == null ? null : time(r.claimed_at), notBeforeHeight: r.not_before_height == null ? null : String(r.not_before_height),
    transactionHash: r.transaction_hash == null ? null : String(r.transaction_hash),
    lastEvidence: r.evidence == null ? null : structuredClone(r.evidence as VerifiedDeploymentEvidence),
    evidenceAttempt: r.evidence_attempt == null ? null : Number(r.evidence_attempt), createdAt: time(r.created_at), updatedAt: time(r.updated_at),
  };
}
const databaseErrors: Record<string, number> = {
  sign_in_required: 401, creation_not_found: 404, creation_import_conflict: 409,
  creation_revision_conflict: 409, creation_draft_identity_conflict: 409,
  creation_intake_locked: 409,
  public_text_review_conflict: 409, public_text_required: 400,
  invalid_creation_configuration: 400,
  deployment_not_found: 404, deployment_revision_conflict: 409,
  deployment_identity_frozen: 409, deployment_transition_conflict: 409,
  deployment_request_mismatch: 409, deployment_unresolved: 409,
  deployment_review_expired: 409, deployment_consent_required: 400,
  deployment_evidence_required: 400, deployment_head_regressed: 409,
  deployment_recovery_evidence_required: 409, deployment_recovery_history_frozen: 409,
};

/** Trusted-server adapter over the accepted P1 functions and unapplied P3.2
 * extension. Query injection remains the only database boundary; no in-memory
 * fallback, runtime allocation or environment override is introduced.
 */
export class CreationRepository {
  private readonly query: Query;
  private readonly random?: Parameters<typeof generatePublicId>[0];
  constructor(query: Query, random?: Parameters<typeof generatePublicId>[0]) { this.query = query; this.random = random; }
  private async execute(sql: string, values: unknown[]): Promise<Row[]> {
    try { return await this.query(sql, values); }
    catch (error) {
      const e = error as { code?: string; message?: string };
      if (e.code === 'P0001' && e.message && Object.hasOwn(databaseErrors, e.message)) throw new WorkflowError(e.message, databaseErrors[e.message]);
      if (sql.includes('yawrd.creation_deployment_')) {
        if (['42P01','42883','42501'].includes(e.code ?? '')) throw new WorkflowError('deployment_storage_unavailable', 503);
        if (e.code === '23505') throw new WorkflowError('deployment_evidence_conflict', 409);
      }
      throw error; // Existing HTTP boundary sanitizes raw database errors.
    }
  }
  async start(hash: string | null, value: unknown): Promise<PrivateCreation> {
    sessionInput(hash);
    const intake = JSON.stringify(intakeInput(value));
    // Authenticates even when no matching source exists; no random ID on recovery.
    const existing = await this.execute('SELECT * FROM yawrd.creation_find_start($1,$2::jsonb)', [hash, intake]);
    if (existing.length) return creation(existing[0]);
    return allocatePublicId(async id => {
      // Empty result means ONLY a persistent public-ID collision. This function
      // rechecks the live founder and source binding atomically on every retry.
      const rows = await this.execute('SELECT * FROM yawrd.creation_start($1,$2,$3::jsonb)', [hash, id, intake]);
      return rows.length ? creation(rows[0]) : null;
    }, this.random);
  }
  async read(hash: string | null, id: string): Promise<PrivateCreation> {
    sessionInput(hash); projectInput(id);
    const [row] = await this.execute('SELECT * FROM yawrd.creation_read($1,$2)', [hash, id]);
    fail(row, 'creation_not_found', 404);
    return creation(row);
  }
  async list(hash: string | null, options: { limit?: number; afterId?: string } = {}) {
    sessionInput(hash);
    const limit = options.limit ?? 20;
    fail(Number.isInteger(limit) && limit >= 1 && limit <= 50, 'invalid_creation_limit');
    if (options.afterId !== undefined) projectInput(options.afterId);
    // Stable lexicographic ID pagination avoids timestamp precision/cursor loss.
    const rows = await this.execute('SELECT * FROM yawrd.creation_list($1,$2,$3)', [hash, options.afterId ?? null, limit + 1]);
    const items: CreationSummary[] = rows.slice(0, limit).map(r => ({ id: String(r.id), network: 'testnet', revision: Number(r.revision), displayName: String(r.display_name), createdAt: time(r.created_at), updatedAt: time(r.updated_at) }));
    return { items, nextAfterId: rows.length > limit ? items[items.length - 1].id : null };
  }
  private async save(hash: string | null, id: string, expectedRevision: number, intake: string | null, configuration: string | null) {
    sessionInput(hash); projectInput(id); revisionInput(expectedRevision);
    const [row] = await this.execute('SELECT * FROM yawrd.creation_save($1,$2,$3,$4::jsonb,$5::jsonb)', [hash, id, expectedRevision, intake, configuration]);
    fail(row, 'creation_not_found', 404);
    return creation(row);
  }
  async updateIntake(hash: string | null, id: string, expectedRevision: number, value: unknown) {
    sessionInput(hash);
    return this.save(hash, id, expectedRevision, JSON.stringify(intakeInput(value)), null);
  }
  async updateConfiguration(hash: string | null, id: string, expectedRevision: number, value: unknown) {
    sessionInput(hash);
    return this.save(hash, id, expectedRevision, null, JSON.stringify(configurationInput(value)));
  }
  async reviewPublicText(hash: string | null, id: string, value: unknown) {
    sessionInput(hash); projectInput(id);
    const review = reviewInput(value);
    const [row] = await this.execute('SELECT * FROM yawrd.creation_review_public_text($1,$2,$3,$4,$5)', [hash, id, review.expectedRevision, review.publicTextDigest, review.consentVersion]);
    fail(row, 'creation_not_found', 404);
    return creation(row);
  }
  async deployment(hash: string | null, id: string): Promise<DeploymentIntent | null> {
    sessionInput(hash); projectInput(id);
    const [row] = await this.execute('SELECT * FROM yawrd.creation_deployment_read($1,$2)', [hash,id]);
    return row ? deployment(row) : null;
  }
  async reserveDeployment(hash: string | null, id: string, expectedCreationRevision: number): Promise<DeploymentIntent> {
    sessionInput(hash); projectInput(id); revisionInput(expectedCreationRevision);
    const existing = await this.deployment(hash,id);
    if (existing) return existing;
    for (let collision = 0; collision < 5; collision++) {
      const [row] = await this.execute('SELECT * FROM yawrd.creation_deployment_reserve($1,$2,$3,$4)',
        [hash,id,expectedCreationRevision,generateDaoIdentifier()]);
      if (row) return deployment(row); // SQL arbitrates cross-session uniqueness.
    }
    throw new WorkflowError('deployment_identifier_collision_limit',409);
  }
  async prepareDeployment(hash: string | null, id: string, creationRevision: number, expectedRevision: number, prepared: PreparedCreation, costs: DeploymentCosts) {
    sessionInput(hash); projectInput(id); revisionInput(creationRevision); revisionInput(expectedRevision);
    const [row] = await this.execute('SELECT * FROM yawrd.creation_deployment_prepare($1,$2,$3,$4,$5::jsonb,$6::jsonb)',
      [hash,id,creationRevision,expectedRevision,JSON.stringify(prepared),JSON.stringify(costs)]);
    fail(row,'deployment_not_found',404); return deployment(row);
  }
  async claimDeployment(hash: string | null, id: string, creationRevision: number, expectedRevision: number, height: string) {
    sessionInput(hash); projectInput(id); revisionInput(creationRevision); revisionInput(expectedRevision);
    fail(/^[1-9][0-9]*$/.test(height),'invalid_deployment_height');
    const [row] = await this.execute('SELECT * FROM yawrd.creation_deployment_claim($1,$2,$3,$4,$5::bigint,$6)',
      [hash,id,creationRevision,expectedRevision,height,DEPLOYMENT_CONSENT]);
    fail(row,'deployment_not_found',404); return deployment(row);
  }
  async noteDeployment(hash: string | null, id: string, expectedRevision: number, attempt: number, transactionHash: string | null) {
    sessionInput(hash); projectInput(id); revisionInput(expectedRevision);
    fail(Number.isSafeInteger(attempt) && attempt > 0,'invalid_deployment_attempt');
    fail(transactionHash === null || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(transactionHash),'invalid_transaction_hash');
    const [row] = await this.execute('SELECT * FROM yawrd.creation_deployment_note($1,$2,$3,$4,$5)', [hash,id,expectedRevision,attempt,transactionHash]);
    fail(row,'deployment_not_found',404); return deployment(row);
  }
  async finishDeployment(hash: string | null, id: string, expectedRevision: number, attempt: number,
    state: 'failed' | 'deployed-hardening-required', evidence: VerifiedDeploymentEvidence) {
    sessionInput(hash); projectInput(id); revisionInput(expectedRevision);
    fail(Number.isSafeInteger(attempt) && attempt > 0,'invalid_deployment_attempt');
    const [row] = await this.execute('SELECT * FROM yawrd.creation_deployment_finish($1,$2,$3,$4,$5,$6::jsonb)',
      [hash,id,expectedRevision,attempt,state,JSON.stringify(evidence)]);
    fail(row,'deployment_not_found',404); return deployment(row);
  }

}
