import {
  YAWRD_INTAKE_STORAGE_KEY,
  parseYawrdIntakeDraft,
  validateYawrdIntakeDraft,
  serializeYawrdIntakeDraft,
  type YawrdIntakeDraftV1,
} from "./yawrd-intake.ts";

export interface LocalKeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function saveIntakeDraft(store: LocalKeyValueStore, draft: YawrdIntakeDraftV1): void {
  store.setItem(YAWRD_INTAKE_STORAGE_KEY, serializeYawrdIntakeDraft(draft));
}

export function loadIntakeDraft(store: LocalKeyValueStore): YawrdIntakeDraftV1 | null {
  const serialized = store.getItem(YAWRD_INTAKE_STORAGE_KEY);
  return serialized === null ? null : parseYawrdIntakeDraft(serialized);
}

/** Reuse the existing draft format and operations, isolating browser drafts by verified account.
 * Legacy unscoped drafts are never auto-read; founders can explicitly restore an export.
 */
export function accountIntakeStore(store: LocalKeyValueStore, accountId: string): LocalKeyValueStore {
  if (!/^[a-z0-9._-]{2,64}$/.test(accountId)) throw new Error("A verified account is required");
  const scoped = (key: string) => `${key}:account:${accountId}`;
  return {
    getItem: key => store.getItem(scoped(key)),
    setItem: (key, value) => store.setItem(scoped(key), value),
    removeItem: key => store.removeItem(scoped(key)),
  };
}

// Recovery copies reuse the existing v1 intake format and account-scoped store.
// Keep distinct versions instead of replacing another local or server draft.
function recoveryKey(creationId: string) {
  if (creationId !== 'browser' && !/^yawrd-[a-z2-7]{12}$/.test(creationId)) throw new Error('Invalid saved Creation');
  return 'yawrd.intake-recovery.v1:' + creationId;
}
export function loadIntakeRecoveryCopies(store: LocalKeyValueStore, creationId: string): YawrdIntakeDraftV1[] {
  const raw = store.getItem(recoveryKey(creationId));
  if (raw === null) return [];
  const copies: unknown = JSON.parse(raw);
  if (!Array.isArray(copies)) throw new Error('Saved recovery copies could not be read');
  return copies.map(validateYawrdIntakeDraft);
}
export function keepIntakeRecoveryCopies(store: LocalKeyValueStore, creationId: string, drafts: YawrdIntakeDraftV1[]) {
  const copies = loadIntakeRecoveryCopies(store,creationId);
  const serialized = new Set(copies.map(serializeYawrdIntakeDraft));
  for (const draft of drafts) {
    const copy = validateYawrdIntakeDraft(draft), text = serializeYawrdIntakeDraft(copy);
    if (!serialized.has(text)) { copies.push(copy); serialized.add(text); }
  }
  store.setItem(recoveryKey(creationId),JSON.stringify(copies));
  return copies;
}
