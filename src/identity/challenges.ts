import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CHALLENGE_TTL_MS, IDENTITY_RECIPIENT, checkChallenge, identityMessage, requireIdentity, validAccountId, verifySignature } from "./nep413.ts";
import type { IdentityContext, VerifyAccessKey } from "./nep413.ts";
import type { IdentityChallenge, IdentityProof } from "./types.ts";

const browserHash = (token: string) => createHash("sha256").update(token).digest();

// Development only: one process, bounded memory, no persistent identity/session.
export class DevelopmentChallenges {
  private records = new Map<string, { challenge: IdentityChallenge; browser: Buffer }>();
  private clock: () => number;
  private verifyKey: VerifyAccessKey;

  constructor(verifyKey: VerifyAccessKey, clock = Date.now) { this.verifyKey = verifyKey; this.clock = clock; }

  issue(context: IdentityContext, browserToken: string): IdentityChallenge {
    requireIdentity(context.network === "testnet", "wrong_network");
    requireIdentity(validAccountId(context.accountId), "wrong_account");
    const now = this.clock();
    const browser = browserHash(browserToken);
    for (const [id, record] of this.records) {
      if (now >= record.challenge.expiresAt || timingSafeEqual(browser, record.browser)) this.records.delete(id);
    }
    requireIdentity(this.records.size < 1000, "challenge_capacity");
    const data = { accountId: context.accountId, network: "testnet" as const, origin: context.origin, issuedAt: now, expiresAt: now + CHALLENGE_TTL_MS };
    const challenge = { ...data, id: randomBytes(32).toString("base64url"), nonce: randomBytes(32).toString("base64"), recipient: IDENTITY_RECIPIENT, message: identityMessage(data) };
    this.records.set(challenge.id, { challenge, browser });
    return { ...challenge };
  }

  async consume(id: string, browserToken: string, context: IdentityContext, proof: IdentityProof) {
    const record = this.records.get(id);
    requireIdentity(record && timingSafeEqual(record.browser, browserHash(browserToken)), "unknown_challenge");
    // Delete synchronously before any async work: even failed proofs/RPC calls burn
    // this attempt and simultaneous requests cannot both verify it.
    this.records.delete(id);
    const { challenge } = record;
    checkChallenge(challenge, context, this.clock());
    verifySignature(challenge, proof);
    const evidence = await this.verifyKey(challenge.accountId, proof.publicKey);
    checkChallenge(challenge, context, this.clock());
    return { developmentOnly: true, accountId: challenge.accountId, network: "testnet", ...evidence };
  }
}
