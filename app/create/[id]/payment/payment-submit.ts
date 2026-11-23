import { canonical } from '../../../../src/creation-integration';
import { CREATION_FEE_CONSENT, type CreationFeeReview, type CreationFeeTransaction } from '../../../../src/creation/platform-fee';
import { validHash } from '../../../../src/platform-fee/policy';

/** One winning durable claim can invoke the already-prepared Meteor signer.
 * A lost claim response or rejected/unknown wallet result never permits retry. */
export async function submitCreationFee(options: {
  reviewed: CreationFeeReview;
  request: (data: object) => Promise<CreationFeeReview>;
  getWallet: () => { accountId: string | null; network: string };
  sign: (transaction: CreationFeeTransaction) => Promise<unknown>;
  now?: () => number;
}): Promise<CreationFeeReview> {
  const { reviewed, request, getWallet, sign } = options;
  const now = options.now ?? Date.now, fee = reviewed.fee, permit = reviewed.review;
  function context() {
    const wallet = getWallet();
    if (wallet.accountId !== reviewed.accountId || wallet.network !== 'testnet') throw Error('Your wallet account changed. Refresh the payment review.');
  }
  if (!reviewed.walletEnabled || !fee || fee.state !== 'prepared' || fee.attempt !== 0 || !permit || permit.expiresAt <= now() ||
    canonical(permit.transaction) !== canonical(fee.transaction)) throw Error('Refresh and prepare the payment review before signing.');
  context();
  let claimed: CreationFeeReview | null = null;
  try {
    const begun = await request({ action: 'begin', expectedCreationRevision: reviewed.binding.creationRevision,
      expectedDeploymentRevision: reviewed.binding.intentRevision, feeRevision: fee.revision, consent: true, consentVersion: CREATION_FEE_CONSENT });
    claimed = begun;
    if (!begun.fee || begun.fee.state !== 'wallet-requested' || begun.fee.attempt !== 1 || begun.fee.revision !== fee.revision + 1 ||
      begun.fee.creationId !== fee.creationId || begun.fee.daoAccountId !== fee.daoAccountId || begun.fee.founderAccountId !== fee.founderAccountId ||
      begun.binding.creationId !== reviewed.binding.creationId || canonical(begun.fee.transaction) !== canonical(fee.transaction))
      throw Error('The saved payment claim changed. Reload its status; do not submit again.');
    context();
    if (permit.expiresAt <= now()) throw Error('The payment review expired. The saved claim stays locked for recovery.');
    // The UI reserved a window in the original click; no async wallet lookup here.
    const outcome = await sign(structuredClone(fee.transaction));
    const hash = (outcome as { transaction?: { hash?: unknown } } | null)?.transaction?.hash;
    return await request({ action: validHash(hash) ? 'reconcile' : 'report', feeRevision: begun.fee.revision, transactionHash: validHash(hash) ? hash : null });
  } catch (error) {
    if (claimed?.fee?.state === 'wallet-requested') {
      try { await request({ action: 'report', feeRevision: claimed.fee.revision, transactionHash: null }); }
      catch { /* The durable claim alone locks signing, even if reporting fails. */ }
    }
    throw error;
  }
}
