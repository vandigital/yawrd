import type { IdentityChallenge } from '../identity/types.ts';
import type { LaunchView } from './launch-preparation.ts';

export const PUBLICATION_CONSENT = 'creation-publication-v1';
export const PUBLICATION_RECIPIENT = 'Yawrd publication consent';
export type PublicationReceipt = { creationId: string; url: string; publishedAt: string };
export type PublicationReview = Pick<LaunchView, 'source' | 'proposed'>;
/** Stable JSON, preserving array order and every reviewed string. Shared by browser and server. */
export function publicationText(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(publicationText).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + publicationText((value as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function publicationMessage(c: IdentityChallenge, creationId: string, sourceDigest: string, payloadDigest: string) {
  return [
    'Publish this Yawrd and its reviewed project title, overview and selected planned task details publicly.',
    'I approve the exact Blueprint, contribution and governance source identified below for this publication.',
    'Applications, task participation, repository access, rewards and payments remain inactive.',
    'This off-chain wallet message costs no gas and sends no transaction.',
    `Consent: ${PUBLICATION_CONSENT}`, `Yawrd: ${creationId}`, `Founder: ${c.accountId}`,
    'Network: testnet', `Origin: ${c.origin}`, `Source SHA-256: ${sourceDigest}`, `Public payload SHA-256: ${payloadDigest}`,
    `Issued at: ${new Date(c.issuedAt).toISOString()}`, `Expires at: ${new Date(c.expiresAt).toISOString()}`,
  ].join('\n');
}
