import type { HardeningBinding, HardeningView } from './hardening.ts';
import { PLATFORM_FEE, type PaymentIntent, type VerifiedTransfer } from '../platform-fee/policy.ts';
export const CREATION_FEE_CONSENT = 'creation-platform-fee-v1';
export type CreationFeeTransaction = {
  network: 'testnet'; signerId: string; receiverId: string;
  actions: [{ type: 'Transfer'; params: { deposit: string } }];
};
export function creationFeeTransaction(founder: string): CreationFeeTransaction {
  if (founder.length < 2 || founder.length > 64 || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(founder) || founder === PLATFORM_FEE.recipient) throw Error('Invalid fee payer');
  return { network: 'testnet', signerId: founder, receiverId: PLATFORM_FEE.recipient,
    actions: [{ type: 'Transfer', params: { deposit: PLATFORM_FEE.amountYocto } }] };
}
export type FeeSecurityReview = {
  verified: true; autoUpdate: false; proposalId: number; proposalStatus: 'Approved'; votes: Record<string, string>;
  blockHeight: number; blockHash: string; checkedAt: string;
};
export type CreationFee = {
  creationId: string; revision: number; state: 'prepared' | 'wallet-requested' | 'unknown' | 'paid'; attempt: 0 | 1;
  network: 'testnet'; founderAccountId: string; daoAccountId: string; deploymentTransaction: string; deploymentDigest: string;
  deploymentFinalHeight: string; recipient: string; amountYocto: string; policyVersion: string;
  transaction: CreationFeeTransaction; securityReview: FeeSecurityReview; notBeforeHeight: string;
  claimHeight: string | null; claimReview: FeeSecurityReview | null; claimedAt: string | null;
  transactionHash: string | null; evidence: VerifiedTransfer | null;
};
export function creationFeeIntent(fee: CreationFee): PaymentIntent {
  // An original durable claim, not a browser timestamp, sets the payment anchor.
  if (fee.attempt !== 1 || !fee.claimHeight) throw Error('Payment has not been claimed');
  return { id: fee.creationId, projectId: fee.creationId, founder: fee.founderAccountId, daoId: fee.daoAccountId,
    network: fee.network, creationHash: fee.deploymentTransaction, finalHeight: fee.deploymentFinalHeight,
    evidenceDigest: fee.deploymentDigest, recipient: fee.recipient, amountYocto: fee.amountYocto,
    policyVersion: fee.policyVersion, notBeforeHeight: fee.claimHeight };
}
export type CreationFeeReview = {
  binding: HardeningBinding; accountId: string; securityVerified: boolean; blockHeight: number; blockHash: string; checkedAt: string;
  status: 'security-required' | 'storage-required' | 'unprepared' | CreationFee['state'];
  amountYocto: string; recipient: string; policyVersion: string; transaction: CreationFeeTransaction | null;
  fee: CreationFee | null; storageInstalled: boolean; walletEnabled: boolean;
  review: null | { transaction: CreationFeeTransaction; expiresAt: number; feeEstimateYocto: string; feeReserveYocto: string };
  verification?: { state: 'pending' | 'unknown' | 'failed' | 'invalid'; reason: string };
  fundingEnabled: false; publicationEnabled: false; blueprintEnabled: false;
};
export function creationFeeReview(view: Pick<HardeningView, 'binding' | 'accountId' | 'verified' | 'blockHeight' | 'blockHash' | 'checkedAt'>,
  fee: CreationFee | null = null, storageInstalled = false, authorized = false): CreationFeeReview {
  if (view.accountId !== view.binding.founderAccountId || view.accountId === PLATFORM_FEE.recipient) throw Error('founder_payment_required');
  return { binding: view.binding, accountId: view.accountId, securityVerified: view.verified,
    blockHeight: view.blockHeight, blockHash: view.blockHash, checkedAt: view.checkedAt,
    status: fee && fee.state !== 'prepared' ? fee.state : !view.verified ? 'security-required' : !storageInstalled ? 'storage-required' : fee?.state ?? 'unprepared',
    amountYocto: PLATFORM_FEE.amountYocto, recipient: PLATFORM_FEE.recipient, policyVersion: PLATFORM_FEE.version,
    transaction: fee?.transaction ?? (view.verified ? creationFeeTransaction(view.accountId) : null), fee, storageInstalled,
    walletEnabled: authorized && storageInstalled && view.verified && (!fee || fee.state === 'prepared'), review: null,
    fundingEnabled: false, publicationEnabled: false, blueprintEnabled: false };
}
