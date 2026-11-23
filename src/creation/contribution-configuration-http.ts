import type { Query } from '../participants/database.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { body, cookie, errorResponse, fields, json, sameOrigin } from '../participants/http.ts';
import { fail } from '../participants/repository.ts';
import { ContributionConfigurationRepository } from './contribution-configuration-repository.ts';
import { CONTRIBUTION_BYTES, ContributionInputError } from './contribution-configuration.ts';

export async function contributionConfigurationRequest(request: Request, id: string, query: Query, origin: string | null) {
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
    const repo = new ContributionConfigurationRepository(query);
    const original = await repo.read(hash, id); // Owner authorization precedes body consumption.
    let view = original;
    if (!read) {
      const data = await body(request, CONTRIBUTION_BYTES + 2048);
      fields(data, ['expectedRevision', 'preparationRevision', 'preparationDigest', 'reviewedSource', 'configuration']);
      view = await repo.save(hash, id, data.expectedRevision, data.preparationRevision, data.preparationDigest, data.reviewedSource, data.configuration);
    }
    await account(); return json(view);
  } catch (error) {
    if (error instanceof ContributionInputError) return json({ error: 'invalid_contribution_configuration' }, 400);
    return errorResponse(error);
  }
}
