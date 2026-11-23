import { canonical, type CreationTransaction } from '../../../src/creation-integration';
import { DEPLOYMENT_CONSENT, type DeploymentIntent, type DeploymentView } from '../../../src/creation/deployment-types';

/** Existing Meteor adapter, preceded by a durable server claim. This helper does
 * not grant authorization; both the UI and production endpoint remain gated.
 * No localStorage lock or automatic retry is used as signing authority.
 */
export async function submitDeployment(options: {
  creationRevision: number; founder: string; reviewed: DeploymentIntent;
  request: (data: object) => Promise<DeploymentView>;
  getWallet: () => { accountId: string | null; network: string };
  prepareSign?: (transaction: CreationTransaction) => Promise<void>;
  onStage?: (stage: 'wallet-preparation-started' | 'wallet-ready' | 'durable-claim-received') => void;
  sign: (transaction: CreationTransaction) => Promise<unknown>;
}): Promise<DeploymentView> {
  const { reviewed, request, getWallet, sign, founder } = options;
  let claimed: DeploymentIntent | null = null;
  const context = () => { const wallet = getWallet(); if (wallet.accountId !== founder || wallet.network !== 'testnet') throw new Error('Your wallet account changed. Check your sign-in and deployment state before continuing.'); };
  context();
  // Resolve and validate the exact Meteor signer before consuming a claim.
  if (!reviewed.prepared) throw new Error('Reload the saved deployment request before continuing.');
  options.onStage?.('wallet-preparation-started');
  await options.prepareSign?.(structuredClone(reviewed.prepared.transaction));
  context();
  options.onStage?.('wallet-ready');
  try {
    const begun = await request({action:'begin',expectedRevision:options.creationRevision,intentRevision:reviewed.revision,consent:true,consentVersion:DEPLOYMENT_CONSENT});
    claimed = begun.intent;
    if (!claimed || claimed.creationId !== reviewed.creationId || claimed.identifier !== reviewed.identifier ||
      claimed.state !== 'wallet-requested' || claimed.attempt !== reviewed.attempt + 1 || !claimed.prepared ||
      canonical(claimed.prepared) !== canonical(reviewed.prepared)) throw new Error('The saved wallet request changed. Reload deployment state before continuing.');
    context();
    options.onStage?.('durable-claim-received');
    // Only this winning claim response can reach the unchanged wallet adapter.
    const outcome = await sign(structuredClone(claimed.prepared.transaction));
    const hash = (outcome as { transaction?: { hash?: unknown } } | null)?.transaction?.hash;
    return await request({action:typeof hash === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(hash) ? 'reconcile' : 'report',
      intentRevision:claimed.revision,attempt:claimed.attempt,transactionHash:typeof hash === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(hash) ? hash : null});
  } catch (error) {
    if (claimed) {
      // Rejection is a wallet report, not server evidence of non-execution. The
      // row stays unresolved even when this best-effort update cannot complete.
      try { await request({action:'report',intentRevision:claimed.revision,attempt:claimed.attempt,transactionHash:null}); } catch { /* Read/reconcile the durable claim on reload. */ }
    }
    throw error;
  }
}
