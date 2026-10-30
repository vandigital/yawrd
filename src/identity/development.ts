import { randomBytes } from "node:crypto";
import { DevelopmentChallenges } from "./challenges.ts";
import { IdentityError, requireIdentity, testnetAccessKeyVerifier } from "./nep413.ts";

export const DEVELOPMENT_COOKIE = "yawrd_dev_identity";
type DevelopmentEnvironment = { NODE_ENV?: string; YAWRD_ENABLE_DEV_IDENTITY?: string; YAWRD_DEV_IDENTITY_ORIGIN?: string };

export function developmentIdentityOrigin(env: DevelopmentEnvironment = {
  // Direct NODE_ENV access is replaced at build time by Next.js. A production
  // artifact therefore stays disabled even if its runtime env is misconfigured.
  NODE_ENV: process.env.NODE_ENV,
  YAWRD_ENABLE_DEV_IDENTITY: process.env.YAWRD_ENABLE_DEV_IDENTITY,
  YAWRD_DEV_IDENTITY_ORIGIN: process.env.YAWRD_DEV_IDENTITY_ORIGIN,
}): string | null {
  if (env.NODE_ENV !== "development" || env.YAWRD_ENABLE_DEV_IDENTITY !== "1") return null;
  try {
    const origin = env.YAWRD_DEV_IDENTITY_ORIGIN ?? "http://localhost:3000";
    const url = new URL(origin);
    if (url.origin !== origin || url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    return origin;
  } catch { return null; }
}

function response(body: object, status = 200, cookie?: string) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    ...(cookie ? { "Set-Cookie": `${DEVELOPMENT_COOKIE}=${cookie}; HttpOnly; SameSite=Strict; Path=/api/dev/identity; Max-Age=300` } : {}),
  } });
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  requireIdentity(request.headers.get("content-type")?.split(";")[0].trim() === "application/json", "invalid_request");
  requireIdentity(request.body, "invalid_request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) { await reader.cancel(); throw new IdentityError("invalid_request"); }
    chunks.push(value);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  requireIdentity(data && typeof data === "object" && !Array.isArray(data), "invalid_request");
  return data;
}

function exactFields(data: Record<string, unknown>, fields: string[]) {
  requireIdentity(Object.keys(data).length === fields.length && fields.every((key) => Object.hasOwn(data, key)), "invalid_request");
}

// Keep one store across development hot reloads and both route bundles. It is
// intentionally never initialized in production and is lost on process restart.
const localGlobal = globalThis as typeof globalThis & { yawrdDevelopmentChallenges?: DevelopmentChallenges };

export async function developmentIdentityPost(
  request: Request,
  action: "challenge" | "verify",
  options: { env?: DevelopmentEnvironment; store?: DevelopmentChallenges } = {},
) {
  const origin = developmentIdentityOrigin(options.env);
  if (!origin) return response({ error: "not_found" }, 404);
  try {
    requireIdentity(request.method === "POST", "invalid_request");
    requireIdentity(request.headers.get("host") === new URL(origin).host && new URL(request.url).origin === origin && request.headers.get("origin") === origin, "wrong_origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    requireIdentity(!fetchSite || fetchSite === "same-origin", "wrong_origin");
    const body = await readBody(request);
    const cookies = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${DEVELOPMENT_COOKIE}=`));
    requireIdentity(cookies.length <= 1, "invalid_request");
    let browserToken = cookies[0]?.slice(DEVELOPMENT_COOKIE.length + 1);
    requireIdentity(!browserToken || /^[A-Za-z0-9_-]{43}$/.test(browserToken), "invalid_request");
    const store = options.store ?? (localGlobal.yawrdDevelopmentChallenges ??= new DevelopmentChallenges(testnetAccessKeyVerifier()));
    if (action === "challenge") {
      exactFields(body, ["accountId", "network"]);
      requireIdentity(typeof body.accountId === "string" && typeof body.network === "string", "invalid_request");
      browserToken ||= randomBytes(32).toString("base64url");
      const challenge = store.issue({ accountId: body.accountId, network: body.network, origin }, browserToken);
      return response({ challenge, developmentOnly: true }, 200, browserToken);
    }
    exactFields(body, ["challengeId", "accountId", "network", "proof"]);
    requireIdentity(typeof body.challengeId === "string" && body.challengeId.length === 43 && typeof body.accountId === "string" && typeof body.network === "string" && browserToken, "invalid_request");
    requireIdentity(body.proof && typeof body.proof === "object" && !Array.isArray(body.proof), "invalid_request");
    const proof = body.proof as Record<string, unknown>;
    exactFields(proof, ["accountId", "publicKey", "signature"]);
    requireIdentity(typeof proof.accountId === "string" && typeof proof.publicKey === "string" && typeof proof.signature === "string", "invalid_request");
    const result = await store.consume(body.challengeId, browserToken, { accountId: body.accountId, network: body.network, origin }, { accountId: proof.accountId, publicKey: proof.publicKey, signature: proof.signature });
    return response(result);
  } catch (error) {
    // Never log request bodies, signatures, cookies, nonces or wallet errors.
    return response({ error: error instanceof IdentityError ? error.code : "invalid_request" }, 400);
  }
}
