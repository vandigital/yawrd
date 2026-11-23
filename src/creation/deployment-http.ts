import type { Query } from '../participants/database.ts';
import type { FactorySettings, Rpc } from '../creation-integration.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { body, cookie, errorResponse, fields, json, sameOrigin } from '../participants/http.ts';
import { fail } from '../participants/repository.ts';
import { CreationRepository, type PrivateCreation } from './repository.ts';
import { beginDurableDeployment, deploymentView, prepareDurableDeployment, reconcileDurableDeployment, retireUnsubmittedDeployment } from './deployment.ts';
import { DEPLOYMENT_CONSENT, type DeploymentIntent, type RecoveryObservation } from './deployment-types.ts';
import { revisionInput } from './validation.ts';

export async function creationDeploymentRequest(request: Request, id: string, query: Query, origin: string | null,
  settings: FactorySettings, rpc: Rpc, authorized: boolean | ((creation: PrivateCreation, intent: DeploymentIntent | null) => boolean) = false,
  recoveryAuthorized: boolean | ((creation: PrivateCreation, intent: DeploymentIntent | null) => boolean) = false) {
  try {
    const read = request.method === 'GET';
    fail(read || request.method === 'POST','method_not_allowed',405);
    sameOrigin(request,origin,!read);
    fail(!new URL(request.url).search,'invalid_request');
    const hash = sessionHash(cookie(request,SESSION_COOKIE));
    fail(hash,'sign_in_required',401);
    const repo = new CreationRepository(query), creation = await repo.read(hash,id);
    fail(request.headers.get('x-yawrd-account') === creation.founderAccountId,'creation_session_changed',409);
    const permitted = (intent: DeploymentIntent | null) => typeof authorized === 'function' ? authorized(creation,intent) : authorized;
    if (read) {
      const intent = await repo.deployment(hash,id);
      return json(deploymentView(intent,permitted(intent)));
    }
    const data = await body(request);
    if (data.action === 'prepare') {
      fields(data,['action','expectedRevision']);
      const next = await prepareDurableDeployment(repo,hash,id,data.expectedRevision as number,settings,rpc);
      return json(deploymentView(next.intent,permitted(next.intent)));
    }
    if (data.action === 'begin') {
      fields(data,['action','expectedRevision','intentRevision','consent','consentVersion']);
      fail(permitted(await repo.deployment(hash,id)),'deployment_not_authorized',403);
      fail(data.consent === true && data.consentVersion === DEPLOYMENT_CONSENT,'deployment_consent_required');
      revisionInput(data.intentRevision);
      return json(await beginDurableDeployment(repo,hash,id,data.expectedRevision as number,data.intentRevision,settings,rpc,true));
    }
    if (data.action === 'retire') {
      fields(data,['action','expectedRevision','intentRevision','attempt','observations','founderConfirmed']);
      // Recovery authorization is separately scoped by the server route; it
      // grants no wallet signing permission.
      const intent=await repo.deployment(hash,id);
      fail(typeof recoveryAuthorized === 'function' ? recoveryAuthorized(creation,intent) : recoveryAuthorized,
        'deployment_recovery_not_authorized',403);
      return json(await retireUnsubmittedDeployment(repo,hash,id,data.expectedRevision as number,
        data.intentRevision as number,data.attempt as number,data.observations as [RecoveryObservation,RecoveryObservation],
        data.founderConfirmed as boolean,rpc,true));
    }
    fail(data.action === 'report' || data.action === 'reconcile','invalid_request');
    fields(data,['action','intentRevision','attempt','transactionHash']);
    revisionInput(data.intentRevision);
    fail(Number.isSafeInteger(data.attempt) && (data.attempt as number) > 0,'invalid_deployment_attempt');
    fail(data.transactionHash === null || (typeof data.transactionHash === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(data.transactionHash)),'invalid_transaction_hash');
    if (data.action === 'report') return json(deploymentView(await repo.noteDeployment(hash,id,data.intentRevision,data.attempt as number,data.transactionHash as string|null)));
    fail(typeof data.transactionHash === 'string','invalid_transaction_hash');
    return json(await reconcileDurableDeployment(repo,hash,id,data.intentRevision,data.attempt as number,data.transactionHash,rpc));
  } catch (error) { return errorResponse(error); }
}
