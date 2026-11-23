import { validateYawrdIntakeDraft, type YawrdIntakeDraftV1 } from '../yawrd-intake.ts';
import { fail } from '../participants/repository.ts';
import { PUBLIC_ID_PATTERN } from '../project-identity.ts';

export const CREATION_STORAGE_BYTES = 524288;
export const PUBLIC_TEXT_CONSENT = 'creation-public-text-v1' as const;
export type CreationConfiguration = {
  publicName: string; publicDescription: string; accountLabel: string;
  secondSteward: string; threshold: 2;
};
export const emptyConfiguration = (): CreationConfiguration => ({
  publicName: '', publicDescription: '', accountLabel: '', secondSteward: '', threshold: 2,
});

function record(value: unknown, keys: string[]): Record<string, unknown> {
  fail(value && typeof value === 'object' && !Array.isArray(value), 'invalid_creation_input');
  const r = value as Record<string, unknown>;
  fail([Object.prototype, null].includes(Object.getPrototypeOf(r)) &&
    Object.keys(r).length === keys.length && keys.every(key => Object.hasOwn(r, key)), 'invalid_creation_input');
  for (const key of keys) fail(Object.hasOwn(Object.getOwnPropertyDescriptor(r, key) ?? {}, 'value'), 'invalid_creation_input');
  return r;
}
function text(value: unknown, max: number): string {
  // PostgreSQL text/jsonb cannot store NUL or unpaired UTF-16 surrogates.
  fail(typeof value === 'string' && value.length <= max && !value.includes('\u0000') && value.isWellFormed(), 'invalid_creation_input');
  return value;
}
export function sessionInput(hash: unknown): asserts hash is string {
  fail(typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash), 'sign_in_required', 401);
}
export function projectInput(id: unknown): asserts id is string {
  fail(typeof id === 'string' && PUBLIC_ID_PATTERN.test(id), 'invalid_creation_id');
}
export function revisionInput(value: unknown): asserts value is number {
  fail(Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) < Number.MAX_SAFE_INTEGER, 'invalid_creation_revision');
}
export function intakeInput(value: unknown): YawrdIntakeDraftV1 {
  // Reject oversized/unknown fields before C2's allowlisting validator can discard
  // them. Canonical export formatting is not preserved; every text value is.
  const keys = ['schemaVersion', 'draftId', 'createdAt', 'updatedAt', 'answers', 'classification', 'gates'];
  const hasName = !!value && typeof value === 'object' && Object.hasOwn(value, 'projectName');
  const r = record(value, hasName ? [...keys, 'projectName'] : keys);
  record(r.answers, ['projectType', 'startingPoint', 'availableResources', 'successCriteria', 'initialOutcomeConfirmed', 'intendedBudget', 'founderDescription']);
  record(r.classification, ['method', 'projectType', 'projectStage', 'budgetStatus']);
  record(r.gates, ['initialOutcome', 'blueprintApproval', 'taskReadiness']);
  let result: YawrdIntakeDraftV1;
  try { result = validateYawrdIntakeDraft(value); } catch { fail(false, 'invalid_creation_intake'); }
  for (const v of [result.draftId, result.createdAt, result.updatedAt, result.projectName ?? '', ...Object.values(result.answers).filter(v => typeof v === 'string')]) text(v, 20000);
  fail(Buffer.byteLength(JSON.stringify(result), 'utf8') <= CREATION_STORAGE_BYTES, 'creation_too_large', 413);
  return result;
}
export function configurationInput(value: unknown): CreationConfiguration {
  const r = record(value, ['publicName', 'publicDescription', 'accountLabel', 'secondSteward', 'threshold']);
  const publicName = text(r.publicName, 120), publicDescription = text(r.publicDescription, 2000);
  const accountLabel = text(r.accountLabel, 63), secondSteward = text(r.secondSteward, 64);
  fail(!accountLabel || (accountLabel.length >= 2 && /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(accountLabel)), 'invalid_creation_configuration');
  fail(!secondSteward || (/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(secondSteward) && secondSteward.length <= 64), 'invalid_creation_configuration');
  fail(r.threshold === 2, 'invalid_creation_configuration');
  return { publicName, publicDescription, accountLabel, secondSteward, threshold: 2 };
}
export function reviewInput(value: unknown) {
  const r = record(value, ['expectedRevision', 'publicTextDigest', 'consent', 'consentVersion']);
  revisionInput(r.expectedRevision);
  fail(typeof r.publicTextDigest === 'string' && /^[a-f0-9]{64}$/.test(r.publicTextDigest), 'invalid_public_text_digest');
  fail(r.consent === true && r.consentVersion === PUBLIC_TEXT_CONSENT, 'public_text_review_required');
  return { expectedRevision: r.expectedRevision, publicTextDigest: r.publicTextDigest, consentVersion: PUBLIC_TEXT_CONSENT };
}
