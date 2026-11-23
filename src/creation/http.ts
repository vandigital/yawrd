import type { Query } from '../participants/database.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { body, cookie, errorResponse, fields, json, sameOrigin } from '../participants/http.ts';
import { fail } from '../participants/repository.ts';
import { CreationRepository } from './repository.ts';
import { CREATION_STORAGE_BYTES } from './validation.ts';

/** Trusted server boundary. Neither account IDs nor session hashes from JSON or
 * URL parameters authorize access. P1 functions recheck the cookie session and
 * ownership atomically, including after lock waits. No public/review operation.
 * The runtime SQL role must remain server-only: it is not a per-founder role.
 */
export async function creationRequest(request: Request, id: string | null, query: Query, origin: string | null) {
  try {
    const read = request.method === 'GET';
    fail(read || request.method === (id === null ? 'POST' : 'PATCH'), 'method_not_allowed', 405);
    sameOrigin(request, origin, !read);
    const params = new URL(request.url).searchParams;
    fail([...params.keys()].every(key => id === null && read && key === 'afterId') && params.getAll('afterId').length <= 1, 'invalid_request');
    const hash = sessionHash(cookie(request, SESSION_COOKIE));
    fail(hash, 'sign_in_required', 401);
    const [session] = await query(`SELECT account_id FROM yawrd.sessions
      WHERE token_hash = $1 AND network = 'testnet' AND revoked_at IS NULL
      AND expires_at > clock_timestamp()`, [hash]);
    fail(session, 'sign_in_required', 401);
    // A stale tab for A must not import A's private wording under B's new cookie.
    // This header is only an equality guard against the verified server identity.
    fail(request.headers.get('x-yawrd-account') === session.account_id, 'creation_session_changed', 409);
    const repo = new CreationRepository(query);
    if (read) return id === null
      ? json(await repo.list(hash, { ...(params.has('afterId') ? { afterId: params.get('afterId')! } : {}) }))
      : json({ creation: await repo.read(hash, id) });
    const data = await body(request, CREATION_STORAGE_BYTES + 8192);
    if (id === null) {
      fields(data, ['intake']);
      return json({ creation: await repo.start(hash, data.intake) });
    }
    const intake = Object.hasOwn(data, 'intake');
    fields(data, ['expectedRevision', intake ? 'intake' : 'configuration']);
    const creation = intake
      ? await repo.updateIntake(hash, id, data.expectedRevision as number, data.intake)
      : await repo.updateConfiguration(hash, id, data.expectedRevision as number, data.configuration);
    return json({ creation });
  } catch (error) { return errorResponse(error); }
}
