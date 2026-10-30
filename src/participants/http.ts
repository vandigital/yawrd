import { IdentityError } from '../identity/nep413.ts';
import { BROWSER_COOKIE, opaqueToken, PersistentAuth, SESSION_COOKIE, SESSION_SECONDS, sessionHash } from './auth.ts';
import { fail, ParticipantRepository, WorkflowError } from './repository.ts';

export function configuredOrigin(): string | null {
  const value = process.env.YAWRD_APP_ORIGIN;
  if (!value) return null;
  try {
    const u = new URL(value);
    const local = process.env.NODE_ENV === 'development' && process.env.YAWRD_ALLOW_HTTP_LOCALHOST === '1' && u.protocol === 'http:' && u.hostname === 'localhost';
    return u.origin === value && !u.username && !u.password && (u.protocol === 'https:' || local) ? value : null;
  } catch { return null; }
}
export function cookie(request: Request, name: string): string | null {
  const values = (request.headers.get('cookie') ?? '').split(';').map(p => p.trim()).filter(p => p.startsWith(`${name}=`));
  fail(values.length <= 1, 'invalid_cookie');
  const token = values[0]?.slice(name.length + 1) ?? null;
  fail(token === null || /^[A-Za-z0-9_-]{43}$/.test(token), 'invalid_cookie');
  return token;
}
export function cookieHeader(name: string, value: string, seconds: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
}
export function json(body: object, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Vary': 'Cookie', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}
export function errorResponse(error: unknown) {
  if (error instanceof WorkflowError) return json({ error: error.code }, error.status);
  if (error instanceof IdentityError) return json({ error: error.code }, 401);
  // Raw database, wallet and RPC errors must never reach logs or responses.
  return json({ error: 'service_unavailable' }, 503);
}
export function sameOrigin(request: Request, origin: string | null, mutation = true) {
  fail(origin, 'service_unavailable', 503);
  fail(new URL(request.url).origin === origin && request.headers.get('host') === new URL(origin).host, 'wrong_origin', 403);
  fail(!mutation || request.headers.get('origin') === origin, 'wrong_origin', 403);
  const site = request.headers.get('sec-fetch-site');
  fail(!site || site === 'same-origin' || (!mutation && site === 'none'), 'wrong_origin', 403);
}
export function fields(data: Record<string, unknown>, expected: string[]) {
  fail(Object.keys(data).length === expected.length && expected.every(k => Object.hasOwn(data, k)), 'invalid_request');
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  fail(request.headers.get('content-type')?.split(';')[0].trim() === 'application/json' && request.body, 'invalid_request');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) { await reader.cancel(); throw new WorkflowError('request_too_large', 413); }
    chunks.push(value);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new WorkflowError('invalid_request'); }
  fail(data && typeof data === 'object' && !Array.isArray(data), 'invalid_request');
  return data;
}
export async function authRequest(request: Request, action: string, auth: PersistentAuth, origin: string | null) {
  try {
    fail(request.method === 'POST', 'method_not_allowed', 405);
    sameOrigin(request, origin);
    const data = await body(request);
    const previousHash = sessionHash(cookie(request, SESSION_COOKIE));
    if (action === 'logout') {
      fields(data, []);
      await auth.logout(previousHash);
      const response = json({ signedOut: true });
      response.headers.append('Set-Cookie', cookieHeader(SESSION_COOKIE, '', 0));
      response.headers.append('Set-Cookie', cookieHeader(BROWSER_COOKIE, '', 0));
      return response;
    }
    if (action === 'challenge') {
      fields(data, ['accountId', 'network']);
      fail(typeof data.accountId === 'string' && typeof data.network === 'string', 'invalid_request');
      const browserToken = cookie(request, BROWSER_COOKIE) ?? opaqueToken();
      const challenge = await auth.issue(data.accountId, data.network, origin!, browserToken);
      const response = json({ challenge });
      response.headers.append('Set-Cookie', cookieHeader(BROWSER_COOKIE, browserToken, 300));
      return response;
    }
    fail(action === 'verify', 'not_found', 404);
    fields(data, ['challengeId', 'accountId', 'network', 'proof']);
    fail(typeof data.challengeId === 'string' && /^[A-Za-z0-9_-]{43}$/.test(data.challengeId) && typeof data.accountId === 'string' && typeof data.network === 'string', 'invalid_request');
    fail(data.proof && typeof data.proof === 'object' && !Array.isArray(data.proof), 'invalid_request');
    const p = data.proof as Record<string, unknown>;
    fields(p, ['accountId', 'publicKey', 'signature']);
    fail(typeof p.accountId === 'string' && typeof p.publicKey === 'string' && typeof p.signature === 'string', 'invalid_request');
    const browserToken = cookie(request, BROWSER_COOKIE);
    fail(browserToken, 'unknown_challenge', 401);
    const result = await auth.verify(data.challengeId, browserToken, data.accountId, data.network, origin!, { accountId: p.accountId, publicKey: p.publicKey, signature: p.signature }, previousHash);
    const response = json({ accountId: result.accountId, network: result.network, expiresIn: SESSION_SECONDS });
    response.headers.append('Set-Cookie', cookieHeader(SESSION_COOKIE, result.token, SESSION_SECONDS));
    response.headers.append('Set-Cookie', cookieHeader(BROWSER_COOKIE, '', 0));
    return response;
  } catch (error) { return errorResponse(error); }
}
export async function participantRequest(request: Request, id: string, action: string, repo: ParticipantRepository, origin: string | null) {
  try {
    const read = ['state', 'agent-association'].includes(action) && request.method === 'GET';
    fail(read || (request.method === 'POST' && ['apply', 'review', 'agent-association'].includes(action)), 'method_not_allowed', 405);
    sameOrigin(request, origin, !read);
    const hash = sessionHash(cookie(request, SESSION_COOKIE));
    if (read && action === 'state') return json(await repo.view(id, hash));
    fail(hash, 'sign_in_required', 401);
    if (read) return json({ association: await repo.agentAssociation(id, hash) });
    const data = await body(request);
    if (action === 'agent-association') {
      fields(data, ['agentReference', 'consent', 'consentVersion']);
      return json({ association: await repo.associateAgent(id, hash, data.agentReference, data.consent, data.consentVersion) });
    }
    if (action === 'apply') {
      fields(data, ['introduction', 'consent']);
      return json(await repo.apply(id, hash, data.introduction, data.consent));
    }
    fields(data, ['applicationId', 'decision']);
    return json(await repo.review(id, hash, data.applicationId, data.decision));
  } catch (error) { return errorResponse(error); }
}
