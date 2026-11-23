import { creationEnvironment } from './release-environment.ts';
import 'server-only';
import type { Query } from '../participants/database.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { cookie, errorResponse, json, sameOrigin } from '../participants/http.ts';
import { fail } from '../participants/repository.ts';
import { validAccountId } from '../identity/nep413.ts';

type Environment = Record<string, string | undefined>;

/** Deployment-local, Testnet-only admission. Never send this configuration to a client. */
export function founderAdmitted(accountId: unknown, env: Environment = process.env): boolean {
  const text = env.YAWRD_CREATION_FOUNDER_ALLOWLIST;
  if (!text || text.length > 8192) return false;
  try {
    const accounts: unknown = JSON.parse(text);
    if (!Array.isArray(accounts) || accounts.length > 100 ||
        !accounts.every(a => validAccountId(a) && a.endsWith('.testnet')) ||
        new Set(accounts).size !== accounts.length) return false;
    return validAccountId(accountId) && accountId.endsWith('.testnet') && accounts.includes(accountId);
  } catch { return false; }
}

async function identity(request: Request, query: Query, origin: string | null) {
  sameOrigin(request, origin, request.method !== 'GET');
  const hash = sessionHash(cookie(request, SESSION_COOKIE));
  if (!hash) return null;
  const [session] = await query(`SELECT account_id,expires_at FROM yawrd.sessions WHERE token_hash=$1
    AND network='testnet' AND revoked_at IS NULL AND expires_at>clock_timestamp()`, [hash]);
  if (!session) return null;
  return { accountId: String(session.account_id), expiresAt: new Date(session.expires_at as string | Date).getTime() };
}

/** Navigation status only. This returns no private Creation data or allowlist. */
export async function creationAdmissionRequest(request: Request, query: Query, origin: string | null) {
  try {
    fail(request.method === 'GET', 'method_not_allowed', 405);
    fail(!new URL(request.url).search, 'invalid_request');
    const session = await identity(request, query, origin);
    return json(session ? { ...session, admitted: founderAdmitted(session.accountId), securityAvailable: !!creationEnvironment() }
      : { accountId: null, expiresAt: null, admitted: false });
  } catch (error) { return errorResponse(error); }
}

/** Admission precedes all private reads, body consumption, RPC and sensitive claims.
 * Existing handlers still enforce ownership, session rechecks and action permissions.
 * A security ID permits only the saved second Steward, never general founder access.
 */
export async function withCreationAdmission(request: Request, query: Query, origin: string | null,
  next: () => Promise<Response>, securityCreationId?: string) {
  try {
    const session = await identity(request, query, origin);
    fail(session, 'sign_in_required', 401);
    fail(request.headers.get('x-yawrd-account') === session.accountId, 'creation_session_changed', 409);
    if (!founderAdmitted(session.accountId)) {
      fail(securityCreationId, 'creation_invite_only', 403);
      // Only security identifiers; no private intake/configuration or prepared payload.
      const [steward] = await query(`SELECT d.creation_id FROM yawrd.creation_deployments d
        JOIN yawrd.creation_drafts c ON c.id=d.creation_id
        WHERE c.id=$1 AND c.network='testnet' AND d.network='testnet'
          AND c.founder_account_id<>$2 AND d.state='deployed-hardening-required'
          AND d.prepared#>>'{input,initialStewardAccountIds,0}'=$2
          AND d.evidence_attempt=d.attempt AND d.evidence->>'transactionHash'=d.transaction_hash`,
      [securityCreationId, session.accountId]);
      fail(steward, 'creation_invite_only', 403);
    }
    return await next();
  } catch (error) { return errorResponse(error); }
}
