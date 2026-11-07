import type { IdentityProof } from '../identity/types.ts';

export type TaskRef = 'task-a' | 'task-b';
export const SUBMISSION_RECIPIENT = 'Yawrd contribution submission / yaw-001 / v1';
export const REQUEST_CONSENT = 'yaw001-contribution-request-v1';
export const ACK_CONSENT = 'yaw001-prior-acceptance-ack-v1';
export type ContributionRequest = { actorAccountId: string; recipientAccountId: string; description: string; recordedAt: string };
export type ContributionAcknowledgement = { actorAccountId: string; recordedAt: string; historicalAcceptedOn: string | null; historicalAcceptedAt: string | null; evidence: string };
export type ContributionTask = {
  ref: TaskRef; title: string; prUrl: string; historicalNote: string;
  recipientAccountId: string | null;
  request: ContributionRequest | null; acknowledgement: ContributionAcknowledgement | null;
};
export type ContributionState = { accountId: string; role: 'participant' | 'creator'; tasks: ContributionTask[] };
export type RequestInput = { kind: 'request'; taskRef: TaskRef; prUrl: string; description: string; recipientAccountId: string; consent: true; consentVersion: typeof REQUEST_CONSENT };
export type SignedRequestInput = RequestInput & { challengeId: string; proof: IdentityProof };
export type AckInput = { kind: 'acknowledgement'; taskRef: TaskRef; prUrl: string; evidence: string; historicalAcceptedOn: string | null; historicalAcceptedAt: string | null; consent: true; consentVersion: typeof ACK_CONSENT };
