import { founderAdmitted } from './admission.ts';
import type { Query } from '../participants/database.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { body, cookie, errorResponse, fields, json, sameOrigin } from '../participants/http.ts';
import { fail } from '../participants/repository.ts';
import { canonical, type Rpc } from '../creation-integration.ts';
import { verifyNativeTransfer } from '../platform-fee/verification.ts';
import { PLATFORM_FEE, validHash } from '../platform-fee/policy.ts';
import { authorizeCreationHardening, readCreationHardening } from './hardening-http.ts';
import { CREATION_FEE_CONSENT, creationFeeIntent, creationFeeReview, creationFeeTransaction, type CreationFee, type CreationFeeReview } from './platform-fee.ts';
import { PostgresCreationFeeStore, type CreationFeeStore } from './platform-fee-repository.ts';
import { feeSecurityReview, preflightCreationFee } from './platform-fee-preflight.ts';
import { revisionInput } from './validation.ts';

type Options = { authorized?: boolean; store?: CreationFeeStore };
export async function creationFeeRequest(request: Request, id: string, query: Query, origin: string | null, rpc: Rpc, options: Options = {}) {
  try {
    const post = request.method === 'POST'; fail(post || request.method === 'GET', 'method_not_allowed', 405);
    sameOrigin(request, origin, post); fail(!new URL(request.url).search, 'invalid_request');
    const tokenHash = sessionHash(cookie(request, SESSION_COOKIE)); fail(tokenHash, 'sign_in_required', 401); const hash = tokenHash;
    const access = await authorizeCreationHardening(query, hash, id);
    fail(access.accountId === access.binding.founderAccountId, 'founder_payment_required', 403);
    fail(request.headers.get('x-yawrd-account') === access.accountId, 'creation_session_changed', 409);
    fail(access.accountId !== PLATFORM_FEE.recipient, 'self_payment_forbidden', 409);
    const store = options.store ?? new PostgresCreationFeeStore(query), installed = await store.available();
    let fee = installed ? await store.read(hash,id) : null;
    function bound(value: CreationFee | null) {
      if (!value) return;
      fail(value.creationId === id && value.network === 'testnet' && value.founderAccountId === access.accountId &&
        value.daoAccountId === access.binding.daoAccountId && value.deploymentTransaction === access.binding.creationTransaction &&
        value.recipient === PLATFORM_FEE.recipient && value.amountYocto === PLATFORM_FEE.amountYocto && value.policyVersion === PLATFORM_FEE.version &&
        canonical(value.transaction) === canonical(creationFeeTransaction(access.accountId)), 'fee_identity_frozen', 409);
    }
    bound(fee);
    async function recheck() {
      const after = await authorizeCreationHardening(query,hash,id);
      fail(canonical(after.binding) === canonical(access.binding) && after.accountId === access.accountId && after.identityKey === access.identityKey,
        'creation_revision_conflict',409);
    }
    // Status/reconciliation of a claimed payment remains available even if a
    // later chain/security read is unavailable. Never use it to authorize signing.
    function historical(): CreationFeeReview {
      fail(fee,'fee_not_found',404);
      const r = fee.claimReview ?? fee.securityReview;
      return creationFeeReview({ binding:access.binding,accountId:access.accountId,verified:false,
        blockHeight:r.blockHeight,blockHash:r.blockHash,checkedAt:r.checkedAt },fee,installed,false);
    }
    if (post) {
      const data = await body(request);
      fail(['prepare','begin','report','reconcile'].includes(String(data.action)), 'invalid_request');
      if (data.action === 'report' || data.action === 'reconcile') {
        fields(data,['action','feeRevision','transactionHash']);
        revisionInput(data.feeRevision);
        fail(data.transactionHash === null || validHash(data.transactionHash),'invalid_transaction_hash');
        fail(installed && fee,'fee_not_found',404);
        if (fee.state === 'paid') {
          fail(data.transactionHash === null || data.transactionHash === fee.transactionHash,'fee_already_paid',409);
          await recheck(); return json(historical());
        }
        fail(fee.revision === data.feeRevision,'fee_revision_conflict',409);
        fail(fee.attempt === 1 && ['wallet-requested','unknown'].includes(fee.state),'fee_unresolved',409);
        fail(!fee.transactionHash || data.transactionHash === null || fee.transactionHash === data.transactionHash,'fee_identity_frozen',409);
        if (data.action === 'report') {
          fee = await store.note(hash,id,fee.revision,data.transactionHash as string|null); bound(fee);
          await recheck(); return json(historical());
        }
        const txHash = data.transactionHash ?? fee.transactionHash; fail(validHash(txHash),'invalid_transaction_hash');
        // Save the hash before RPC, so a lost response is recoverable cross-session.
        if (fee.state === 'wallet-requested' || !fee.transactionHash) fee = await store.note(hash,id,fee.revision,txHash);
        bound(fee);
        const result = await verifyNativeTransfer(rpc,creationFeeIntent(fee),txHash);
        await recheck();
        if (result.state === 'verified') fee = await store.complete(hash,id,fee.revision,result.evidence);
        bound(fee); await recheck();
        return json({ ...historical(), ...(result.state === 'verified' ? {} : { verification:result }) });
      }
      fields(data,data.action === 'prepare' ? ['action','expectedCreationRevision','expectedDeploymentRevision'] :
        ['action','expectedCreationRevision','expectedDeploymentRevision','feeRevision','consent','consentVersion']);
      revisionInput(data.expectedCreationRevision); revisionInput(data.expectedDeploymentRevision);
      fail(data.expectedCreationRevision === access.binding.creationRevision && data.expectedDeploymentRevision === access.binding.intentRevision,'creation_revision_conflict',409);
      fail(installed,'fee_storage_required',409);
      fail(options.authorized === true,'fee_not_authorized',403);
      if (data.action === 'begin') {
        revisionInput(data.feeRevision);
        fail(data.consent === true && data.consentVersion === CREATION_FEE_CONSENT,'fee_consent_required');
        fail(fee && fee.revision === data.feeRevision,'fee_revision_conflict',409);
      }
      fail(!fee || fee.state === 'prepared' && fee.attempt === 0,'fee_unresolved',409);
      const security = await readCreationHardening(access,rpc);
      const review = await preflightCreationFee(security,access.identityKey,rpc);
      await recheck();
      if (data.action === 'prepare') {
        fee = await store.open(hash,access.binding,feeSecurityReview(security)); bound(fee);
        fail(fee.state === 'prepared' && fee.attempt === 0,'fee_unresolved',409);
        await recheck(); return json({ ...creationFeeReview(security,fee,true,true),review });
      }
      fail(fee,'fee_not_found',404);
      fee = await store.claim(hash,access.binding,fee.revision,feeSecurityReview(security)); bound(fee);
      fail(fee.state === 'wallet-requested' && fee.attempt === 1,'fee_unresolved',409);
      await recheck(); return json(creationFeeReview(security,fee,true,false));
    }
    let security;
    try { security = await readCreationHardening(access,rpc); }
    catch (error) { if (!fee || fee.state === 'prepared') throw error; await recheck(); return json(historical()); }
    await recheck(); return json(creationFeeReview(security,fee,installed,options.authorized === true));
  } catch (error) { return errorResponse(error); }
}

/** Minimal navigation query: only immutable, deployed public identifiers. Never
 * joins a private intake/configuration projection or returns the prepared JSON. */
export async function creationSecurityLinksRequest(request: Request, query: Query, origin: string | null) {
  try {
    fail(request.method === 'GET', 'method_not_allowed', 405); sameOrigin(request, origin, false);
    fail(!new URL(request.url).search, 'invalid_request');
    const tokenHash = sessionHash(cookie(request, SESSION_COOKIE)); fail(tokenHash, 'sign_in_required', 401); const hash = tokenHash;
    const [actor] = await query(`SELECT account_id FROM yawrd.sessions WHERE token_hash=$1
      AND network='testnet' AND revoked_at IS NULL AND expires_at>clock_timestamp()`, [hash]);
    fail(actor, 'sign_in_required', 401);
    fail(request.headers.get('x-yawrd-account') === actor.account_id, 'creation_session_changed', 409);
    const rows = await query(`SELECT c.id,d.dao_account_id,d.prepared#>>'{plan,initializer,config,name}' AS name
      FROM yawrd.creation_deployments d JOIN yawrd.creation_drafts c ON c.id=d.creation_id
      JOIN yawrd.sessions s ON s.account_id=$2 AND s.token_hash=$1 AND s.network='testnet'
      WHERE s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND c.network='testnet' AND d.network='testnet'
        AND d.state='deployed-hardening-required' AND d.evidence_attempt=d.attempt
        AND d.evidence->>'transactionHash'=d.transaction_hash
        AND (($3 AND $2=c.founder_account_id) OR ($2<>c.founder_account_id AND $2=d.prepared#>>'{input,initialStewardAccountIds,0}'))
      ORDER BY c.id LIMIT 50`, [hash, actor.account_id, founderAdmitted(actor.account_id)]);
    return json({ items: rows.map(row => ({ id: String(row.id), name: String(row.name), daoAccountId: String(row.dao_account_id) })) });
  } catch (error) { return errorResponse(error); }
}
