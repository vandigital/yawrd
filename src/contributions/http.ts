import { body, cookie, errorResponse, fields, json, sameOrigin } from '../participants/http.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { fail } from '../participants/repository.ts';
import type { ContributionRepository } from './repository.ts';

export async function contributionRequest(request: Request, id: string, repo: ContributionRepository, origin: string | null) {
  try {
    fail(id === 'yaw-001', 'not_found', 404);
    fail(request.method === 'GET' || request.method === 'POST', 'method_not_allowed', 405);
    sameOrigin(request, origin, request.method === 'POST');
    fail(!new URL(request.url).search, 'invalid_request');
    const hash = sessionHash(cookie(request, SESSION_COOKIE));
    fail(hash, 'sign_in_required', 401);
    if (request.method === 'GET') return json(await repo.state(id, hash));
    const input = await body(request);
    if (input.kind === 'challenge') {
      fields(input, ['kind', 'submission']);
      fail(input.submission && typeof input.submission === 'object' && !Array.isArray(input.submission), 'invalid_request');
      return json({ challenge: await repo.issueChallenge(id, hash, input.submission as Record<string, unknown>, origin!) });
    }
    fail(input.kind === 'request' || input.kind === 'acknowledgement', 'invalid_request');
    if (input.kind === 'request') return json(await repo.submit(id, hash, input, origin!));
    fields(input, ['kind', 'taskRef', 'prUrl', 'evidence', 'historicalAcceptedOn', 'historicalAcceptedAt', 'consent', 'consentVersion']);
    return json(await repo.acknowledge(id, hash, input));
  } catch (error) { return errorResponse(error); }
}
