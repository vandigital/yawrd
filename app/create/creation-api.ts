import type { PrivateCreation, CreationSummary } from '../../src/creation/repository';
import type { YawrdIntakeDraftV1 } from '../../src/yawrd-intake';
import type { FounderConfiguration } from '../../src/founder-setup';

export class CreationRequestError extends Error {
  constructor(readonly code: string) {
    super(code === 'creation_intake_locked'
      ? 'Your initial project answers are locked because AI preparation has started. These edits were not saved. Return to AI preparation to check its saved status.'
      : code === 'creation_revision_conflict'
      ? 'This draft changed in another tab or session. Your edits are still here. Export or copy them before loading the saved version.'
      : code === 'creation_import_conflict' || code === 'creation_draft_identity_conflict'
      ? 'This intake belongs to a different saved version. Your edits are still here. Export a copy and resume the saved draft before making changes.'
      : code === 'creation_session_changed' || code === 'sign_in_required'
      ? 'Your sign-in changed or expired. Sign in again before saving. Your edits have not been submitted.'
      : code === 'creation_not_found'
      ? 'This saved draft is unavailable for your signed-in account.'
      : code.startsWith('invalid_creation')
      ? 'Check your draft fields. Public name allows 120 characters, public description 2,000, and setup requires a valid account label and a different Testnet Steward.'
      : 'Your private draft could not be saved or loaded. Check your connection and retry. Your edits are still here.');
  }
}
async function request(account: string, path: string, method = 'GET', data?: object) {
  const response = await fetch('/api/creations' + path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'x-yawrd-account': account, ...(data ? { 'content-type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new CreationRequestError(typeof result.error === 'string' ? result.error : 'service_unavailable');
  return result;
}
export async function listCreations(account: string, afterId?: string): Promise<{ items: CreationSummary[]; nextAfterId: string | null }> {
  return request(account, afterId ? '?afterId=' + encodeURIComponent(afterId) : '');
}
export async function readCreation(account: string, id: string): Promise<PrivateCreation> {
  return (await request(account, '/' + encodeURIComponent(id))).creation;
}
export async function saveCreationIntake(account: string, current: PrivateCreation | null, intake: YawrdIntakeDraftV1): Promise<PrivateCreation> {
  return (await (current
    ? request(account, '/' + current.id, 'PATCH', { expectedRevision: current.revision, intake })
    : request(account, '', 'POST', { intake }))).creation;
}
export async function saveCreationConfiguration(account: string, current: PrivateCreation, configuration: FounderConfiguration): Promise<PrivateCreation> {
  return (await request(account, '/' + current.id, 'PATCH', { expectedRevision: current.revision, configuration })).creation;
}
