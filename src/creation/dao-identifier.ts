/** YAW-003+: 12 unbiased lowercase ASCII letters/digits, independent of names.
 * Rejection sampling discards 252..255 so every symbol has exactly 7 byte values.
 */
export const DAO_IDENTIFIER = /^[a-z0-9]{12}$/;
export function generateDaoIdentifier(random: (bytes: Uint8Array) => Uint8Array = bytes => crypto.getRandomValues(bytes)) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let batch = 0; batch < 32 && value.length < 12; batch++) {
    const bytes = random(new Uint8Array(24));
    if (!(bytes instanceof Uint8Array) || bytes.length !== 24) throw new Error('invalid_random_source');
    for (const byte of bytes) { if (byte < 252) value += alphabet[byte % 36]; if (value.length === 12) return value; }
  }
  throw new Error('random_source_exhausted');
}

/** Preview recovery only. No database reservation or permission to sign. Never
 * replace an existing/corrupt identity automatically, including after RPC errors.
 */
export function previewDaoIdentifier(store: Pick<Storage, 'getItem' | 'setItem'>, founder: string, creationId: string) {
  if (!/^[a-z0-9._-]{2,64}$/.test(founder) || !/^yawrd-[a-z2-7]{12}$/.test(creationId)) throw new Error('invalid_preview_owner');
  const key = `yawrd:creation:dao-preview:v1:${founder}:${creationId}`;
  const saved = store.getItem(key);
  if (saved !== null) { if (!DAO_IDENTIFIER.test(saved)) throw new Error('saved_identifier_unreadable'); return saved; }
  const value = generateDaoIdentifier(); store.setItem(key, value); return value;
}
