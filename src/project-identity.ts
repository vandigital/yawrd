import { randomBytes } from 'node:crypto';

/** Provisional format. Server/test utility only; importing this module allocates nothing.
 * Twelve independent uniform 5-bit symbols give 60 random bits. Randomness is not
 * uniqueness or authorization: a persistent UNIQUE/PRIMARY KEY must arbitrate.
 */
export const PUBLIC_ID_PATTERN = /^yawrd-[a-z2-7]{12}$/;
export const PUBLIC_ID_ATTEMPTS = 5;
type RandomSource = (size: number) => Uint8Array;

export function generatePublicId(random: RandomSource = randomBytes): string {
  const bytes = random(12);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 12) throw new Error('invalid_random_source');
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  return 'yawrd-' + Array.from(bytes, byte => alphabet[byte & 31]).join('');
}

/** reserve returns null ONLY for a confirmed ID collision. Never retry a timeout,
 * unknown commit, failed authentication, import conflict, or arbitrary SQL error.
 * Dependencies are trusted server/test code, never client-controlled options.
 */
export async function allocatePublicId<T>(reserve: (id: string) => Promise<T | null>, random?: RandomSource): Promise<T> {
  for (let attempt = 0; attempt < PUBLIC_ID_ATTEMPTS; attempt++) {
    const result = await reserve(generatePublicId(random));
    if (result !== null) return result;
  }
  throw new Error('public_id_collision_limit');
}
