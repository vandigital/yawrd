/** Approved Testnet policy only. No environment override or Mainnet policy. */
export const PLATFORM_FEE = Object.freeze({
  network: 'testnet' as const,
  amountYocto: '500000000000000000000000',
  recipient: 'yawrd.testnet',
  version: 'testnet-platform-fee-v1',
});
export const validHash = (value: unknown): value is string => typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
export const validHeight = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
export class FeeError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function requireFee(value: unknown, code: string): asserts value {
  if (!value) throw new FeeError(code);
}
export interface FeeProject { projectId: string; founder: string; daoId: string }
export interface VerifiedDeployment extends FeeProject {
  creationHash: string; finalHeight: string; evidenceDigest: string;
}
export interface PaymentIntent extends VerifiedDeployment {
  id: string; network: 'testnet'; amountYocto: string; recipient: string; policyVersion: string; notBeforeHeight: string;
}
export interface VerifiedTransfer {
  txHash: string; blockHeight: string; receiptId: string; evidenceDigest: string;
}
export interface PaymentRecord extends VerifiedTransfer {
  intentId: string; projectId: string;
  entitlement: { state: 'verified-payment-held'; generationBudget: 0; consumptionEnabled: false };
}
export const heldEntitlement = () => ({ state: 'verified-payment-held' as const, generationBudget: 0 as const, consumptionEnabled: false as const });
/** Deliberately unconditional: payment is evidence, not permission to call a provider. */
export function consumeInferenceEntitlement(): never { throw new FeeError('inference_consumption_disabled'); }
export function validateIntent(i: PaymentIntent) {
  requireFee(i.network === PLATFORM_FEE.network && i.amountYocto === PLATFORM_FEE.amountYocto &&
    i.recipient === PLATFORM_FEE.recipient && i.policyVersion === PLATFORM_FEE.version, 'unsupported_fee_policy');
  requireFee(i.founder !== i.recipient, 'self_payment_forbidden');
  requireFee(validHash(i.creationHash) && validHeight(i.finalHeight) && validHeight(i.notBeforeHeight) &&
    BigInt(i.notBeforeHeight) >= BigInt(i.finalHeight), 'invalid_deployment_binding');
}
