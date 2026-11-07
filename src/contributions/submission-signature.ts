import 'server-only';
import { createHash } from 'node:crypto';
import { CHALLENGE_TTL_MS, requireIdentity, verifySignature } from '../identity/nep413.ts';
import type { IdentityChallenge, IdentityProof } from '../identity/types.ts';
import { TASK_B_REWARD } from '../genesis/task-b-reward.ts';
import { TASK_B_PARTICIPANT, TASK_B_RECIPIENT, CONTRIBUTION_TASKS } from './policy.ts';
import { REQUEST_CONSENT, SUBMISSION_RECIPIENT, type RequestInput } from './types.ts';
import { contributionDescriptionError } from './validation.ts';

export { SUBMISSION_RECIPIENT };
export type SubmissionSigningContext = { id: string; nonce: string; origin: string; issuedAt: number };

/** Agent-compatible draft input, never authentication or permission to submit. */
export function canonicalTaskBSubmission(draft: RequestInput, participantAccountId: string): string {
  requireIdentity(draft && typeof draft === 'object' && !Array.isArray(draft), 'invalid_submission_draft');
  const expected = ['kind', 'taskRef', 'prUrl', 'description', 'recipientAccountId', 'consent', 'consentVersion'];
  requireIdentity(Object.keys(draft).length === expected.length && expected.every(key => Object.hasOwn(draft, key)), 'invalid_submission_draft');
  requireIdentity(participantAccountId === TASK_B_PARTICIPANT, 'wrong_account');
  requireIdentity(draft.kind === 'request' && draft.taskRef === 'task-b' && draft.prUrl === TASK_B_REWARD.prUrl, 'wrong_task_evidence');
  requireIdentity(draft.recipientAccountId === TASK_B_RECIPIENT, 'wrong_recipient');
  requireIdentity(draft.consent === true && draft.consentVersion === REQUEST_CONSENT, 'submission_consent_required');
  requireIdentity(contributionDescriptionError(draft.description) === null, 'invalid_description');
  // Fixed property order is protocol v1. Agents prepare the flat RequestInput;
  // only the trusted server adds identity, exact source revisions and reward terms.
  return JSON.stringify({ domain: 'yawrd-contribution-submission-v1', network: 'testnet', projectId: 'yaw-001',
    daoAccountId: TASK_B_REWARD.daoAccountId, participantAccountId, taskRef: draft.taskRef,
    prUrl: draft.prUrl, prHeadSha: CONTRIBUTION_TASKS['task-b'].head, mergeCommitSha: CONTRIBUTION_TASKS['task-b'].merge,
    description: draft.description, recipientAccountId: TASK_B_RECIPIENT,
    amountYocto: TASK_B_REWARD.amountYocto, consentVersion: draft.consentVersion });
}

/** The repository supplies durable session-bound context and a CSPRNG nonce. */
export function taskBSigningDesign(draft: RequestInput, accountId: string, context: SubmissionSigningContext): IdentityChallenge {
  const payload = canonicalTaskBSubmission(draft, accountId);
  let origin: URL;
  try { origin = new URL(context.origin); } catch { throw new Error('invalid_submission_origin'); }
  requireIdentity(origin.origin === context.origin && !origin.username && !origin.password && (origin.protocol === 'https:' || (origin.protocol === 'http:' && origin.hostname === 'localhost')), 'invalid_submission_origin');
  requireIdentity(/^[A-Za-z0-9_-]{43}$/.test(context.id), 'invalid_challenge_id');
  const nonce = Buffer.from(context.nonce, 'base64');
  requireIdentity(nonce.length === 32 && nonce.toString('base64') === context.nonce, 'invalid_nonce');
  requireIdentity(Number.isSafeInteger(context.issuedAt) && context.issuedAt >= 0 && context.issuedAt <= 8e15, 'invalid_issue_time');
  const expiresAt = context.issuedAt + CHALLENGE_TTL_MS;
  const message = [
    'Sign this specific Yawrd contribution submission, not a login.',
    'This off-chain signature requests contribution review. It authorizes no transaction, payout, delegation or spending.',
    `Origin: ${context.origin}`, `Challenge: ${context.id}`, `Nonce: ${context.nonce}`,
    `Issued at: ${new Date(context.issuedAt).toISOString()}`, `Expires at: ${new Date(expiresAt).toISOString()}`,
    `Payload SHA-256: ${createHash('sha256').update(payload).digest('hex')}`, `Exact submission: ${payload}`,
  ].join('\n');
  return { ...context, accountId, network: 'testnet', recipient: SUBMISSION_RECIPIENT, expiresAt, message };
}

/** Cryptographic payload check only. It does not authenticate the key on-chain,
 * consume a nonce, create a session, record a request, or prevent replay by itself.
 * Never use this result alone as submission authorization.
 */
export function checkTaskBSignatureDesign(challenge: IdentityChallenge, draft: RequestInput, session: { accountId: string; origin: string; network: string }, proof: IdentityProof, now: number) {
  requireIdentity(session.accountId === TASK_B_PARTICIPANT && challenge.accountId === session.accountId, 'wrong_account');
  requireIdentity(session.network === 'testnet' && challenge.network === 'testnet', 'wrong_network');
  requireIdentity(session.origin === challenge.origin, 'wrong_origin');
  const expected = taskBSigningDesign(draft, session.accountId, challenge);
  requireIdentity(challenge.recipient === SUBMISSION_RECIPIENT && challenge.message === expected.message && challenge.expiresAt === expected.expiresAt, 'altered_submission');
  requireIdentity(now >= challenge.issuedAt && now < challenge.expiresAt, 'expired_challenge');
  verifySignature(challenge, proof); // Existing NEP-413 codec/Ed25519 implementation.
}
