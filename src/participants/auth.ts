import { createHash, randomBytes } from 'node:crypto';
import { CHALLENGE_TTL_MS, IdentityError, requireIdentity, validAccountId, verifySignature } from '../identity/nep413.ts';
import type { VerifyAccessKey } from '../identity/nep413.ts';
import type { IdentityChallenge, IdentityProof } from '../identity/types.ts';
import type { Query, Row } from './database.ts';
import { fail } from './repository.ts';

export const SESSION_SECONDS = 3600;
export const SESSION_COOKIE = '__Host-yawrd_session';
export const BROWSER_COOKIE = '__Host-yawrd_challenge';
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const opaqueToken = () => randomBytes(32).toString('base64url');
export const sessionHash = (token: string | null) => token && /^[A-Za-z0-9_-]{43}$/.test(token) ? hashToken(token) : null;
export const AUTH_RECIPIENT = 'Yawrd participant sign-in';
export function signInMessage(c: Pick<IdentityChallenge, 'accountId' | 'origin' | 'issuedAt' | 'expiresAt'>) {
  return ['Sign in to Yawrd for one hour.', 'This off-chain message costs no gas, submits no transaction and grants no spending, GitHub or Project Rules permissions.',
    `Account: ${c.accountId}`, 'Network: testnet', `Origin: ${c.origin}`, `Issued at: ${new Date(c.issuedAt).toISOString()}`, `Expires at: ${new Date(c.expiresAt).toISOString()}`].join('\n');
}
function storedChallenge(r: Row): IdentityChallenge {
  // Neon parses timestamptz into Date objects. String(Date) loses milliseconds
  // and changes the reconstructed signed message; preserve the exact instant.
  const time = (value: unknown) => value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return { id: String(r.id), accountId: String(r.account_id), network: r.network as 'testnet', origin: String(r.origin), message: String(r.message), recipient: String(r.recipient), nonce: String(r.nonce), issuedAt: time(r.issued_at), expiresAt: time(r.expires_at) };
}
function check(c: IdentityChallenge, accountId: string, network: string, origin: string, now: number) {
  requireIdentity(c.accountId === accountId && validAccountId(accountId), 'wrong_account');
  requireIdentity(c.network === 'testnet' && network === 'testnet', 'wrong_network');
  requireIdentity(c.origin === origin, 'wrong_origin');
  requireIdentity(c.recipient === AUTH_RECIPIENT && c.message === signInMessage(c), 'altered_message');
  requireIdentity(c.expiresAt - c.issuedAt === CHALLENGE_TTL_MS && now >= c.issuedAt && now < c.expiresAt, 'expired_challenge');
}

export class PersistentAuth {
  readonly query: Query;
  readonly verifyKey: VerifyAccessKey;
  readonly clock: () => number;
  constructor(query: Query, verifyKey: VerifyAccessKey, clock = Date.now) { this.query = query; this.verifyKey = verifyKey; this.clock = clock; }

  async issue(accountId: string, network: string, origin: string, browserToken: string): Promise<IdentityChallenge> {
    requireIdentity(validAccountId(accountId), 'wrong_account');
    requireIdentity(network === 'testnet', 'wrong_network');
    const now = this.clock();
    const c: IdentityChallenge = { id: opaqueToken(), accountId, network: 'testnet', origin, message: '', recipient: AUTH_RECIPIENT, nonce: randomBytes(32).toString('base64'), issuedAt: now, expiresAt: now + CHALLENGE_TTL_MS };
    c.message = signInMessage(c);
    const rows = await this.query(`WITH budget AS (
      INSERT INTO yawrd.auth_rate_limits(account_id, attempts, resets_at) VALUES ($3, 1, clock_timestamp() + interval '1 minute')
      ON CONFLICT (account_id) DO UPDATE SET
        attempts = CASE WHEN yawrd.auth_rate_limits.resets_at <= clock_timestamp() THEN 1 ELSE yawrd.auth_rate_limits.attempts + 1 END,
        resets_at = CASE WHEN yawrd.auth_rate_limits.resets_at <= clock_timestamp() THEN clock_timestamp() + interval '1 minute' ELSE yawrd.auth_rate_limits.resets_at END
      WHERE yawrd.auth_rate_limits.resets_at <= clock_timestamp() OR yawrd.auth_rate_limits.attempts < 10 RETURNING account_id
    ), burn AS (
      UPDATE yawrd.auth_challenges SET consumed_at = clock_timestamp() WHERE browser_hash = $2 AND consumed_at IS NULL AND EXISTS (SELECT 1 FROM budget)
    ) INSERT INTO yawrd.auth_challenges(id, browser_hash, account_id, network, origin, message, recipient, nonce, issued_at, expires_at)
      SELECT $1, $2, $3, 'testnet', $4, $5, $6, $7, $8::timestamptz, $9::timestamptz FROM budget RETURNING id`,
    [c.id, hashToken(browserToken), accountId, origin, c.message, c.recipient, c.nonce, new Date(now).toISOString(), new Date(c.expiresAt).toISOString()]);
    fail(rows.length, 'too_many_challenges', 429);
    return c;
  }

  async verify(id: string, browserToken: string, accountId: string, network: string, origin: string, proof: IdentityProof, previousHash: string | null) {
    // Atomic claim happens before cryptography/RPC. Failed proofs and RPC outages
    // consume the challenge. No transaction remains open across the RPC request.
    const [row] = await this.query(`UPDATE yawrd.auth_challenges SET consumed_at = clock_timestamp()
      WHERE id = $1 AND browser_hash = $2 AND consumed_at IS NULL RETURNING *`, [id, hashToken(browserToken)]);
    requireIdentity(row, 'unknown_challenge');
    const c = storedChallenge(row);
    check(c, accountId, network, origin, this.clock());
    verifySignature(c, proof); // Accepted 07A NEP-413 implementation, unchanged.
    const evidence = await this.verifyKey(c.accountId, proof.publicKey);
    check(c, accountId, network, origin, this.clock());
    const token = opaqueToken();
    const [session] = await this.query(`WITH minted AS (
      INSERT INTO yawrd.sessions(token_hash, challenge_id, network, account_id, public_key, block_height, block_hash, created_at, expires_at)
      SELECT $1, id, network, account_id, $3, $4, $5, statement_timestamp(), statement_timestamp() + interval '1 hour'
      FROM yawrd.auth_challenges WHERE id = $2 AND consumed_at IS NOT NULL AND expires_at > clock_timestamp()
      ON CONFLICT (challenge_id) DO NOTHING RETURNING account_id
    ), rotated AS (
      UPDATE yawrd.sessions SET revoked_at = clock_timestamp() WHERE token_hash = $6 AND EXISTS (SELECT 1 FROM minted)
    ) SELECT account_id FROM minted`, [hashToken(token), id, proof.publicKey, evidence.blockHeight, evidence.blockHash, previousHash]);
    requireIdentity(session, 'expired_challenge');
    return { token, accountId: c.accountId, network: 'testnet' as const };
  }

  async logout(tokenHash: string | null) {
    if (tokenHash) await this.query('UPDATE yawrd.sessions SET revoked_at = clock_timestamp() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash]);
  }
}
export { IdentityError };
