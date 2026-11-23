import type { PreparedCreation } from '../creation-integration.ts';

export const DEPLOYMENT_CONSENT = 'creation-deployment-v1';
export type DeploymentState = 'reserved' | 'prepared' | 'wallet-requested' | 'unknown' | 'failed' | 'deployed-hardening-required';
export type DeploymentCosts = {
  setupDepositYocto: string; createGas: string; observedGasPriceYocto: string;
  attachedGasAtObservedPriceYocto: string; blockHash: string; blockHeight: string; costConfirmation: string;
  retiredAttempts?: RetiredDeploymentAttempt[];
};
export type VerifiedDeploymentEvidence = {
  transactionHash: string; transactionBlockHeight: string; finalHeight: string;
  evidenceDigest: string; autoUpdate: boolean | null;
};
export type DeploymentIntent = {
  creationId: string; network: 'testnet'; factoryAccountId: string; identifier: string; daoAccountId: string;
  sourceRevision: number; revision: number; state: DeploymentState; prepared: PreparedCreation | null;
  requestDigest: string | null; costs: DeploymentCosts | null; preparedAt: string | null;
  attempt: number; claimedAt: string | null; notBeforeHeight: string | null; transactionHash: string | null;
  lastEvidence: VerifiedDeploymentEvidence | null; evidenceAttempt: number | null;
  createdAt: string; updatedAt: string;
};
export type DeploymentView = {
  intent: DeploymentIntent | null; submissionEnabled: boolean; deploymentRecorded: boolean;
  fundingEnabled: false; publicationEnabled: false; platformFeesEnabled: false;
};

export type RecoveryObservation = { blockHeight: number; blockHash: string };
export type RetiredDeploymentAttempt = {
  attempt: number; revision: number; state: DeploymentState; claimedAt: string | null; notBeforeHeight: string | null;
  requestDigest: string | null; transactionHash: null; confirmedBy: string;
  sourceRevision: number; preparedAt: string | null; consentVersion: typeof DEPLOYMENT_CONSENT;
  costs: Omit<DeploymentCosts,'retiredAttempts'>;
  confirmation: 'closed-wallet-checked-testnet-no-approval-no-submission-v1';
  observations: RecoveryObservation[]; retiredAt: string;
};
