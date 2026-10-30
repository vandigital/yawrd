// Node-only verifier. Never import this module into a client component.
import { createHash, createPublicKey, verify } from "node:crypto";
import type { IdentityChallenge, IdentityProof } from "./types.ts";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const IDENTITY_RECIPIENT = "Yawrd localhost identity verification";
export const TESTNET_RPC = "https://rpc.testnet.near.org";

export class IdentityError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}

export function requireIdentity(condition: unknown, code: string): asserts condition {
  if (!condition) throw new IdentityError(code);
}

export function validAccountId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 2 && value.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value);
}

export function identityMessage(c: Pick<IdentityChallenge, "accountId" | "origin" | "issuedAt" | "expiresAt">): string {
  return [
    "Verify wallet ownership for Yawrd local development only.",
    "This creates no production session and authorizes no transaction.",
    `Account: ${c.accountId}`, "Network: testnet", `Origin: ${c.origin}`,
    `Issued at: ${new Date(c.issuedAt).toISOString()}`,
    `Expires at: ${new Date(c.expiresAt).toISOString()}`,
  ].join("\n");
}

function borshString(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return Buffer.concat([length, bytes]);
}

// NEP-413: u32 tag, string message, fixed [u8;32] nonce, string recipient,
// Option<string> callbackUrl. near-connect 0.11.4 has no callbackUrl parameter;
// this harness deliberately signs None (one zero byte), never a redirect.
export function serializeNep413(message: string, nonce: Uint8Array, recipient: string): Buffer {
  requireIdentity(nonce.length === 32, "invalid_nonce");
  const tag = Buffer.alloc(4);
  tag.writeUInt32LE(2 ** 31 + 413);
  return Buffer.concat([tag, borshString(message), Buffer.from(nonce), borshString(recipient), Buffer.from([0])]);
}

function base64(value: unknown, size: number, code: string): Buffer {
  requireIdentity(typeof value === "string" && value.length === Math.ceil(size / 3) * 4, code);
  const bytes = Buffer.from(value, "base64");
  requireIdentity(bytes.length === size && bytes.toString("base64") === value, code);
  return bytes;
}

// Bounded decoding of a single Ed25519 public key; cryptography uses Node/OpenSSL.
export function decodePublicKey(value: unknown): Buffer {
  requireIdentity(typeof value === "string" && /^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value), "invalid_public_key");
  const encoded = value.slice(8);
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(0);
  for (const char of encoded) number = number * BigInt(58) + BigInt(alphabet.indexOf(char));
  const bytes: number[] = [];
  while (number > 0) { bytes.unshift(Number(number % BigInt(256))); number /= BigInt(256); }
  const leading = encoded.match(/^1*/)?.[0].length ?? 0;
  const result = Buffer.concat([Buffer.alloc(leading), Buffer.from(bytes)]);
  requireIdentity(result.length === 32, "invalid_public_key");
  return result;
}

export interface IdentityContext { accountId: string; network: string; origin: string }

export function checkChallenge(challenge: IdentityChallenge, context: IdentityContext, now: number) {
  requireIdentity(context.network === "testnet" && challenge.network === "testnet", "wrong_network");
  requireIdentity(validAccountId(context.accountId) && context.accountId === challenge.accountId, "wrong_account");
  requireIdentity(context.origin === challenge.origin, "wrong_origin");
  requireIdentity(challenge.recipient === IDENTITY_RECIPIENT, "wrong_recipient");
  requireIdentity(challenge.expiresAt - challenge.issuedAt === CHALLENGE_TTL_MS && now >= challenge.issuedAt && now < challenge.expiresAt, "expired_challenge");
  requireIdentity(challenge.message === identityMessage(challenge), "altered_message");
}

export function verifySignature(challenge: IdentityChallenge, proof: IdentityProof) {
  requireIdentity(proof && proof.accountId === challenge.accountId, "wrong_account");
  const rawKey = decodePublicKey(proof.publicKey);
  const signature = base64(proof.signature, 64, "invalid_signature");
  const bytes = serializeNep413(challenge.message, base64(challenge.nonce, 32, "invalid_nonce"), challenge.recipient);
  const digest = createHash("sha256").update(bytes).digest();
  // RFC 8410 SubjectPublicKeyInfo prefix for a raw Ed25519 key.
  const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey]), format: "der", type: "spki" });
  requireIdentity(verify(null, digest, key, signature), "invalid_signature");
}

export interface KeyEvidence { blockHeight: number; blockHash: string }
export type VerifyAccessKey = (accountId: string, publicKey: string) => Promise<KeyEvidence>;

export function testnetAccessKeyVerifier(fetcher: typeof fetch = fetch): VerifyAccessKey {
  return async (accountId, publicKey) => {
    async function rpc(method: string, params: Record<string, unknown>) {
      try {
        const response = await fetcher(TESTNET_RPC, {
          method: "POST", headers: { "content-type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ jsonrpc: "2.0", id: "yawrd-identity", method, params }),
          signal: AbortSignal.timeout(10000), redirect: "error",
        });
        requireIdentity(response.ok, "rpc_unavailable");
        const data = await response.json();
        requireIdentity(data?.jsonrpc === "2.0" && data.id === "yawrd-identity" && !data.error && data.result, "rpc_verification_failed");
        return data.result;
      } catch (error) {
        if (error instanceof IdentityError) throw error;
        throw new IdentityError("rpc_unavailable");
      }
    }
    requireIdentity((await rpc("status", {})).chain_id === "testnet", "wrong_rpc_network");
    const key = await rpc("query", { request_type: "view_access_key", finality: "final", account_id: accountId, public_key: publicKey });
    requireIdentity(key.permission === "FullAccess", "unauthorized_key");
    requireIdentity(Number.isSafeInteger(key.block_height) && key.block_height > 0 && typeof key.block_hash === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(key.block_hash), "rpc_verification_failed");
    return { blockHeight: key.block_height, blockHash: key.block_hash };
  };
}
