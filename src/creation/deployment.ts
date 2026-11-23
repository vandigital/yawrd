import { creationActionEnabled, creationDatabaseUrl, creationEnvironment } from './release-environment.ts';
import { founderAdmitted } from './admission.ts';
import { createHash } from 'node:crypto';
import { canonical, CreationRpc, DaoAccountCollisionError, prepareCreation, type PreparedCreation, type FactorySettings, type Rpc } from '../creation-integration.ts';
import { fail } from '../participants/repository.ts';
import { boundedReadRpc, blockHeight, finalizedHeight } from '../platform-fee/verification.ts';
import { DAO_IDENTIFIER } from './dao-identifier.ts';
import { CreationRepository, type PrivateCreation } from './repository.ts';
import type { DeploymentIntent, DeploymentView, VerifiedDeploymentEvidence, RecoveryObservation, RetiredDeploymentAttempt } from './deployment-types.ts';
import { revisionInput } from './validation.ts';
import { DEPLOYMENT_CONSENT } from './deployment-types.ts';
import { authorizedCreationDeployment } from '../testnet-factory-settings.ts';
import { developmentDatabaseUrl } from '../participants/database-config.ts';

export const deploymentHolds = Object.freeze({
  submissionEnabled: false as const, deploymentRecorded: false as const,
  fundingEnabled: false as const, publicationEnabled: false as const,
  blockers: ['durable_deployment_storage_required', 'founder_deployment_authorization_required'],
});
export function savedCreationInput(creation: PrivateCreation, identifier: string) {
  fail(DAO_IDENTIFIER.test(identifier), 'invalid_dao_identifier');
  const c = creation.configuration;
  fail(c.publicName.trim() && c.publicDescription.trim() && c.threshold === 2 && c.secondSteward !== creation.founderAccountId &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(c.secondSteward) &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(creation.founderAccountId), 'invalid_creation_configuration');
  // accountLabel is historical founder input. It is preserved, never interpreted
  // as the new DAO identifier or silently overwritten during draft saving.
  return { projectName: c.publicName, projectPurpose: c.publicDescription, projectAccountLabel: identifier,
    creatorAccountId: creation.founderAccountId, initialStewardAccountIds: [c.secondSteward],
    stewardApprovalThreshold: 2, factoryAccountId: 'factory.yawrd.testnet' };
}
function prepared(creation: PrivateCreation, revision: number, identifier: string, settings: FactorySettings) {
  revisionInput(revision);
  fail(creation.revision === revision, 'creation_revision_conflict', 409);
  fail(settings.factoryAccountId === 'factory.yawrd.testnet', 'unsupported_creation_factory', 503);
  return prepareCreation(savedCreationInput(creation, identifier), settings, { accountId: creation.founderAccountId, network: 'testnet' });
}

/** Read-only preparation from an owner-authorized saved snapshot. No browser
 * initializer, founder, cost override or completion flag is accepted.
 */
export async function prepareSavedCreation(creation: PrivateCreation, revision: number, identifier: string, settings: FactorySettings, transport: Rpc) {
  const p = prepared(creation, revision, identifier, settings), rpc = boundedReadRpc(transport);
  const inspector = new CreationRpc(rpc);
  try { await inspector.inspectInterrupted(p); }
  catch (error) {
    if (error instanceof DaoAccountCollisionError) fail(false, 'dao_account_collision', 409);
    throw error; // Only proven absence counts; transport errors never trigger a new ID.
  }
  const block = (await rpc('block', { finality: 'final' }))?.header;
  fail(block && typeof block.hash === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(block.hash) &&
    Number.isSafeInteger(block.height) && block.height > 0 && typeof block.gas_price === 'string' && /^[1-9][0-9]*$/.test(block.gas_price), 'deployment_quote_unavailable', 503);
  return { ...deploymentHolds, phase: 'prepared-preview' as const, creationId: creation.id, revision,
    identifier, daoAccountId: p.plan.daoAccountId, prepared: p,
    costs: { setupDepositYocto: settings.setupDepositYocto, createGas: settings.createGas,
      observedGasPriceYocto: block.gas_price as string,
      attachedGasAtObservedPriceYocto: (BigInt(settings.createGas) * BigInt(block.gas_price)).toString(),
      blockHash: block.hash as string, blockHeight: String(block.height), costConfirmation: settings.costConfirmation },
  };
}
export type DeploymentPreview = Awaited<ReturnType<typeof prepareSavedCreation>>;

/** Observation only until an immutable durable intent exists. A client supplied
 * hash merely requests server RPC reads. Even fully verified evidence cannot
 * activate, publish, fund, or mutate the Creation record through this endpoint.
 */
export async function inspectSavedCreationTransaction(creation: PrivateCreation, revision: number, identifier: string, transactionHash: string, settings: FactorySettings, transport: Rpc) {
  const p = prepared(creation, revision, identifier, settings);
  const checked = await inspectPreparedCreationTransaction(p,transactionHash,transport);
  if (checked.phase !== 'confirmed') return { ...deploymentHolds, phase: checked.phase, transactionHash };
  return { ...deploymentHolds, phase: 'verified-unrecorded' as const, transactionHash,
    daoAccountId: p.plan.daoAccountId, autoUpdate: checked.evidence.autoUpdate,
    hardening: 'required' as const, evidenceDigest: checked.evidence.evidenceDigest };
}
export type DeploymentObservation = Awaited<ReturnType<typeof inspectSavedCreationTransaction>>;

/** Shared server verifier for the frozen durable request, never current edited
 * fields or client receipts. A past failed transaction cannot unlock a newer
 * unresolved attempt: its inclusion must be strictly after this claim's head.
 */
export async function inspectPreparedCreationTransaction(p: PreparedCreation, transactionHash: string, transport: Rpc,
  notBeforeHeight = '0'): Promise<{ phase: 'pending' } | { phase: 'failed' | 'confirmed'; evidence: VerifiedDeploymentEvidence }> {
  const rpc = boundedReadRpc(transport);
  let evidence: unknown;
  const verifyRpc: Rpc = async (method, params) => {
    const result = await rpc(method, params);
    if (method === 'EXPERIMENTAL_tx_status') evidence = structuredClone(result);
    return result;
  };
  const checked = await new CreationRpc(verifyRpc).verify(p,transactionHash);
  if (checked.phase === 'pending') return { phase: 'pending' };
  const raw = evidence as { transaction_outcome?: { block_hash?: string }; receipts_outcome?: { block_hash?: string }[] };
  const finalHeight = BigInt(await finalizedHeight(rpc));
  const transactionBlockHeight = await blockHeight(rpc,raw.transaction_outcome?.block_hash);
  fail(BigInt(transactionBlockHeight) > BigInt(notBeforeHeight),'deployment_predates_attempt',409);
  for (const outcome of [raw.transaction_outcome,...(raw.receipts_outcome ?? [])]) {
    const height = BigInt(await blockHeight(rpc,outcome?.block_hash));
    fail(height >= BigInt(transactionBlockHeight) && height <= finalHeight,'deployment_not_final',409);
  }
  return { phase: checked.phase, evidence: { transactionHash,transactionBlockHeight,finalHeight:String(finalHeight),
    autoUpdate: checked.autoUpdate ?? null,
    evidenceDigest:createHash('sha256').update(JSON.stringify({prepared:p,evidence})).digest('hex') } };
}

/** One founder-authorized Development attempt. Pin the already saved request,
 * not a project label, browser claim, environment enable flag or future retry.
 * The SQL CAS consumes the authorized next attempt before Meteor receives it.
 */
function authorizedDevelopmentRequest(creation: PrivateCreation, intent: DeploymentIntent | null,
  env: Record<string,string|undefined> = process.env): boolean {
  if (env.NODE_ENV !== 'development' || (env.VERCEL_ENV && env.VERCEL_ENV !== 'development')) return false;
  try {
    const target = new URL(developmentDatabaseUrl(env));
    if (target.hostname.split('.')[0].replace(/-pooler$/,'') !== 'ep-twilight-voice-aorpfrbm' ||
      target.pathname !== '/neondb') return false;
  } catch { return false; }
  const allowed = authorizedCreationDeployment;
  return creation.id === allowed.creationId && creation.founderAccountId === allowed.founderAccountId &&
    creation.network === 'testnet' && intent?.creationId === creation.id && intent.network === 'testnet' &&
    intent.factoryAccountId === 'factory.yawrd.testnet' && intent.identifier === allowed.identifier &&
    intent.daoAccountId === allowed.daoAccountId &&
    intent.requestDigest === allowed.requestDigest && !!intent.prepared &&
    createHash('sha256').update(canonical(intent.prepared)).digest('hex') === allowed.preparedDigest;
}

export function authorizedDevelopmentDeployment(creation: PrivateCreation, intent: DeploymentIntent | null,
  env: Record<string,string|undefined> = process.env): boolean {
  const allowed=authorizedCreationDeployment, retired=intent?.costs?.retiredAttempts;
  return creation.revision === 6 && intent?.attempt === allowed.nextAttempt-1 && intent.state === 'prepared' &&
    intent.transactionHash === null && intent.lastEvidence === null && intent.evidenceAttempt === null &&
    retired?.length === 1 && retired[0].attempt === 1 && retired[0].revision === 5 && retired[0].state === 'unknown' &&
    retired[0].sourceRevision === 6 && retired[0].transactionHash === null &&
    retired[0].requestDigest === allowed.requestDigest && retired[0].confirmedBy === allowed.founderAccountId &&
    retired[0].confirmation === 'closed-wallet-checked-testnet-no-approval-no-submission-v1' &&
    authorizedDevelopmentRequest(creation,intent,env);
}

/** Founder-authorized retirement of the original locked claim only. A successful
 * CAS changes revision/state, consuming this permission without enabling signing.
 */
export function authorizedDevelopmentRecovery(creation: PrivateCreation, intent: DeploymentIntent | null,
  env: Record<string,string|undefined> = process.env): boolean {
  return creation.revision === 6 && intent?.revision === 5 && intent.attempt === 1 && intent.state === 'unknown' &&
    intent.transactionHash === null && intent.lastEvidence === null && intent.evidenceAttempt === null &&
    authorizedDevelopmentRequest(creation,intent,env);
}

export function deploymentView(intent: DeploymentIntent | null, authorized = false): DeploymentView {
  return { intent, submissionEnabled: authorized && intent?.state === 'prepared',
    deploymentRecorded:intent?.state === 'deployed-hardening-required',
    fundingEnabled:false,publicationEnabled:false,platformFeesEnabled:false };
}
function frozenRequest(intent: DeploymentIntent): PreparedCreation {
  const p = intent.prepared;
  fail(p && p.input.creatorAccountId === p.transaction.signerId && p.plan.daoAccountId === intent.daoAccountId &&
    p.input.projectAccountLabel === intent.identifier && p.settings.factoryAccountId === 'factory.yawrd.testnet', 'deployment_request_mismatch',409);
  const rebuilt = prepareCreation(p.input,p.settings,{accountId:p.transaction.signerId,network:'testnet'});
  fail(canonical(rebuilt) === canonical(p),'deployment_request_mismatch',409);
  return p;
}
async function ownedRevision(repo: CreationRepository, hash: string, id: string, revision: number) {
  revisionInput(revision);
  const creation = await repo.read(hash,id);
  fail(creation.revision === revision,'creation_revision_conflict',409);
  return creation;
}
export async function prepareDurableDeployment(repo: CreationRepository, hash: string, id: string, revision: number,
  settings: FactorySettings, transport: Rpc, authorized = false): Promise<DeploymentView> {
  const creation = await ownedRevision(repo,hash,id,revision);
  const intent = await repo.reserveDeployment(hash,id,revision);
  if (['wallet-requested','unknown','deployed-hardening-required'].includes(intent.state)) return deploymentView(intent,authorized);
  const p = prepared(creation,revision,intent.identifier,settings);
  if (intent.attempt > 0) fail(canonical(frozenRequest(intent)) === canonical(p),'deployment_identity_frozen',409);
  const preview = await prepareSavedCreation(creation,revision,intent.identifier,settings,transport);
  const saved = await repo.prepareDeployment(hash,id,revision,intent.revision,preview.prepared,preview.costs);
  return deploymentView(saved,authorized);
}
export async function beginDurableDeployment(repo: CreationRepository, hash: string, id: string, revision: number,
  intentRevision: number, settings: FactorySettings, transport: Rpc, authorized = false): Promise<DeploymentView> {
  fail(authorized,'deployment_not_authorized',403);
  const creation = await ownedRevision(repo,hash,id,revision);
  const intent = await repo.deployment(hash,id);
  fail(intent,'deployment_not_found',404);
  fail(intent.revision === intentRevision,'deployment_revision_conflict',409);
  fail(intent.state === 'prepared','deployment_unresolved',409);
  const p = frozenRequest(intent);
  fail(canonical(p) === canonical(prepared(creation,revision,intent.identifier,settings)),'deployment_request_mismatch',409);
  const rpc = boundedReadRpc(transport);
  await new CreationRpc(rpc).inspectInterrupted(p);
  const height = await finalizedHeight(rpc);
  // This atomic, durable CAS is completed before the response can allow a wallet
  // call. A lost response leaves an unresolved row, never a fresh signing permit.
  return deploymentView(await repo.claimDeployment(hash,id,revision,intentRevision,height),authorized);
}
export async function reconcileDurableDeployment(repo: CreationRepository, hash: string, id: string,
  intentRevision: number, attempt: number, transactionHash: string, transport: Rpc): Promise<DeploymentView> {
  const current = await repo.deployment(hash,id);
  fail(current,'deployment_not_found',404);
  if (['failed','deployed-hardening-required'].includes(current.state) && current.transactionHash === transactionHash && current.evidenceAttempt === current.attempt)
    return deploymentView(current); // Recovery after a lost verification response.
  fail(current.revision === intentRevision && current.attempt === attempt,'deployment_revision_conflict',409);
  fail(['wallet-requested','unknown'].includes(current.state),'deployment_unresolved',409);
  const p = frozenRequest(current);
  // Store the untrusted reference first; an RPC timeout retains it for recovery.
  const noted = await repo.noteDeployment(hash,id,intentRevision,attempt,transactionHash);
  const checked = await inspectPreparedCreationTransaction(p,transactionHash,transport,noted.notBeforeHeight!);
  if (checked.phase === 'pending') return deploymentView(noted);
  return deploymentView(await repo.finishDeployment(hash,id,noted.revision,attempt,
    checked.phase === 'confirmed' ? 'deployed-hardening-required' : 'failed',checked.evidence));
}

/** Operator-controlled recovery through the separately authorized retirement
 * endpoint and the installed function-only SQL recovery update.
 * Retirement preserves attempt history and never grants another signature.
 */
export async function retireUnsubmittedDeployment(repo: CreationRepository, hash: string, id: string,
  creationRevision: number, intentRevision: number, attempt: number, observations: [RecoveryObservation,RecoveryObservation],
  founderConfirmed: boolean, transport: Rpc, authorized = false): Promise<DeploymentView> {
  fail(authorized,'deployment_recovery_not_authorized',403);
  fail(founderConfirmed === true,'deployment_recovery_confirmation_required');
  const creation = await ownedRevision(repo,hash,id,creationRevision), intent = await repo.deployment(hash,id);
  fail(intent,'deployment_not_found',404);
  fail(intent.revision === intentRevision && intent.attempt === attempt,'deployment_revision_conflict',409);
  fail(['wallet-requested','unknown'].includes(intent.state) && intent.attempt > 0 && !intent.transactionHash &&
    !intent.lastEvidence && intent.costs,'deployment_recovery_hash_required_or_resolved',409);
  fail(Array.isArray(observations) && observations.length === 2 && observations.every(o=>o && typeof o === 'object' &&
    Number.isSafeInteger(o.blockHeight) && o.blockHeight > 0 && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(o.blockHash)), 'invalid_recovery_observations');
  const rpc=boundedReadRpc(transport),inspector=new CreationRpc(rpc),p=frozenRequest(intent);
  const first=await inspector.inspectInterrupted(p,observations[0].blockHeight);
  const second=await inspector.inspectInterrupted(p,observations[1].blockHeight);
  // Re-check a fresh finalized head after both historical canonical-height reads.
  const fresh=await inspector.inspectInterrupted(p);
  fail(first.blockHeight === observations[0].blockHeight && first.blockHash === observations[0].blockHash &&
    second.blockHeight === observations[1].blockHeight && second.blockHash === observations[1].blockHash &&
    BigInt(first.blockHeight) >= BigInt(intent.notBeforeHeight!) && second.blockHeight-first.blockHeight >= 20 &&
    fresh.blockHeight >= second.blockHeight,'deployment_recovery_observations_unconfirmed',409);
  const {retiredAttempts:previousRetired=[],...quote}=intent.costs!;
  const retired:RetiredDeploymentAttempt={attempt:intent.attempt,revision:intent.revision,state:intent.state,
    claimedAt:intent.claimedAt,notBeforeHeight:intent.notBeforeHeight,requestDigest:intent.requestDigest,transactionHash:null,
    sourceRevision:intent.sourceRevision,preparedAt:intent.preparedAt,consentVersion:DEPLOYMENT_CONSENT,costs:quote,
    confirmedBy:creation.founderAccountId,confirmation:'closed-wallet-checked-testnet-no-approval-no-submission-v1',
    observations:[first,second,fresh],retiredAt:new Date().toISOString()};
  const costs={...intent.costs,retiredAttempts:[...previousRetired,retired]};
  // SQL rechecks owner/CAS/no-hash after RPC waits, preserves this audit snapshot,
  // and retains attempt N. Any separately authorized next claim increments N+1.
  return deploymentView(await repo.prepareDeployment(hash,id,creationRevision,intentRevision,p,costs));
}

/** Release authorization is separate from admission. Only a fresh, never-claimed
 * intent can submit; the existing begin path still rebuilds, preflights and CAS-claims.
 * Historical Development recovery/retry pins never authorize a release request.
 */
export function authorizedDeploymentForEnvironment(creation: PrivateCreation, intent: DeploymentIntent | null,
  env: Record<string,string|undefined> = process.env): boolean {
  if (creationEnvironment(env) === 'development') return authorizedDevelopmentDeployment(creation,intent,env);
  if (!creationActionEnabled('deployment',env) || !founderAdmitted(creation.founderAccountId,env)) return false;
  try {
    creationDatabaseUrl(env);
    return !!intent && creation.network === 'testnet' && intent.network === 'testnet' &&
      intent.creationId === creation.id && intent.sourceRevision === creation.revision &&
      intent.state === 'prepared' && intent.attempt === 0 && intent.transactionHash === null &&
      intent.lastEvidence === null && intent.evidenceAttempt === null && !intent.costs?.retiredAttempts?.length &&
      canonical(frozenRequest(intent)) === canonical(prepared(creation,creation.revision,intent.identifier,intent.prepared!.settings));
  } catch { return false; }
}
