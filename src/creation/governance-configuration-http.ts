import type { Query } from '../participants/database.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { body, cookie, errorResponse, fields, json, sameOrigin } from '../participants/http.ts';
import { fail } from '../participants/repository.ts';
import { GovernanceConfigurationRepository } from './governance-configuration-repository.ts';
import type { GovernanceSource } from './governance-configuration.ts';

export async function governanceConfigurationRequest(request: Request, id: string, query: Query, origin: string | null) {
  try {
    const read = request.method === 'GET';
    fail(read || request.method === 'POST', 'method_not_allowed', 405);
    sameOrigin(request, origin, !read); fail(!new URL(request.url).search, 'invalid_request');
    const hash = sessionHash(cookie(request, SESSION_COOKIE)); fail(hash, 'sign_in_required', 401);
    async function account() {
      const [session] = await query(`SELECT account_id FROM yawrd.sessions WHERE token_hash=$1 AND network='testnet'
        AND revoked_at IS NULL AND expires_at>clock_timestamp()`, [hash]);
      fail(session, 'sign_in_required', 401);
      fail(request.headers.get('x-yawrd-account') === session.account_id, 'creation_session_changed', 409);
    }
    await account();
    const repo = new GovernanceConfigurationRepository(query);
    let view = await repo.read(hash, id); // Authorize owner before consuming a private write body.
    if (!read) {
      const data = await body(request, 2048);
      fields(data, ['expectedRevision', 'source', 'confirmed']);
      fail(data.source && typeof data.source === 'object' && !Array.isArray(data.source), 'invalid_request');
      fields(data.source as Record<string, unknown>, ['contributionRevision', 'contributionDigest', 'preparationRevision', 'preparationDigest']);
      view = await repo.save(hash, id, data.expectedRevision, data.source as GovernanceSource, data.confirmed);
    }
    await account(); return json(view);
  } catch (error) { return errorResponse(error); }
}
