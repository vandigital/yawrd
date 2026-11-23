import type { Query } from '../participants/database.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { body, cookie, errorResponse, fields, json, sameOrigin } from '../participants/http.ts';
import { fail } from '../participants/repository.ts';
import { LaunchPreparationRepository } from './launch-preparation-repository.ts';
import { readLaunchFunds } from './launch-funds.ts';
import { sameLaunchSource } from './launch-preparation.ts';
import { publicationText } from './publication.ts';
import type { PublicationRepository } from './publication-repository.ts';
import type { IdentityProof } from '../identity/types.ts';
import type { Rpc } from '../creation-integration.ts';

export async function launchPreparationRequest(request: Request, id: string, query: Query, origin: string | null, rpc?: Rpc, publication?: PublicationRepository, publicationAuthorized = true) {
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
    const repo = new LaunchPreparationRepository(query);
    let view = await repo.read(hash, id); // Authorize owner before consuming a private write body.
    if (!read) {
      fail(publicationAuthorized, 'launch_publication_blocked',403);
      const data = await body(request, 600000);
      const publishing = data.action === 'publish';
      fields(data, publishing ? ['action','challengeId','proof'] : ['source','consent','payload']);
      if (publishing) {
        fail(publication,'launch_publication_blocked',409);
        const proof = data.proof as IdentityProof;
        fail(proof && typeof proof === 'object','invalid_request');
        fields(proof as unknown as Record<string,unknown>,['accountId','publicKey','signature']);
        await account();
        return json({published:await publication.publish(hash,id,view.binding.founderAccountId,origin!,data.challengeId,proof)});
      }
      fail(data.consent === true, 'launch_consent_required');
      fail(view.current && sameLaunchSource(data.source as typeof view.source,view.source), 'launch_source_changed',409);
      await account();
      fail(publication && await publication.ready(), 'launch_publication_blocked',409);
      fail(publicationText(data.payload) === publicationText(view.proposed),'launch_source_changed',409);
      return json({challenge:await publication.issue(hash,id,view.binding.founderAccountId,origin!,{source:view.source,proposed:view.proposed})});
    }
    if (publication && await publication.ready()) {
      view.publicationEnabled=publicationAuthorized;
      view.published=await publication.receipt(hash,id,view.binding.founderAccountId) ?? undefined;
    }
    if (rpc) view.funds=await readLaunchFunds(view.binding.daoAccountId,rpc);
    await account(); return json(view);
  } catch (error) { return errorResponse(error); }
}
