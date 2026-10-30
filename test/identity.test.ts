import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { DevelopmentChallenges } from "../src/identity/challenges.ts";
import { CHALLENGE_TTL_MS, IDENTITY_RECIPIENT, TESTNET_RPC, checkChallenge, decodePublicKey, serializeNep413, testnetAccessKeyVerifier, verifySignature } from "../src/identity/nep413.ts";
import { DEVELOPMENT_COOKIE, developmentIdentityOrigin, developmentIdentityPost } from "../src/identity/development.ts";
import type { IdentityChallenge, IdentityProof } from "../src/identity/types.ts";
import type { VerifyAccessKey } from "../src/identity/nep413.ts";

const origin = "http://localhost:3000";
const context = { accountId: "alice.testnet", network: "testnet", origin };
const evidence = { blockHeight: 100, blockHash: "11111111111111111111111111111111" };
const env = { NODE_ENV: "development", YAWRD_ENABLE_DEV_IDENTITY: "1" };

// Only ephemeral, synthetic test keys. No wallet material is read or persisted.
function keys() {
  const pair = generateKeyPairSync("ed25519");
  const bytes = pair.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(`0x${bytes.toString("hex")}`);
  let encoded = "";
  while (number > 0) { encoded = alphabet[Number(number % BigInt(58))] + encoded; number /= BigInt(58); }
  for (const byte of bytes) { if (byte !== 0) break; encoded = "1" + encoded; }
  return { ...pair, publicKeyText: `ed25519:${encoded}`, bytes };
}
const key = keys();

function proof(challenge: IdentityChallenge, pair = key, payload?: Buffer): IdentityProof {
  const digest = createHash("sha256").update(payload ?? serializeNep413(challenge.message, Buffer.from(challenge.nonce, "base64"), challenge.recipient)).digest();
  return { accountId: challenge.accountId, publicKey: pair.publicKeyText, signature: sign(null, digest, pair.privateKey).toString("base64") };
}

function harness(verifyKey: VerifyAccessKey = async () => evidence) {
  let now = 1000000;
  const store = new DevelopmentChallenges(verifyKey, () => now);
  const challenge = store.issue(context, "browser-a");
  return { store, challenge, setTime: (time: number) => { now = time; }, consume: (p = proof(challenge)) => store.consume(challenge.id, "browser-a", context, p) };
}

test("NEP-413 Borsh bytes and SHA-256 match an independent struct/hashlib vector", () => {
  // Official NEP example inputs, callbackUrl None for near-connect's interface.
  const bytes = serializeNep413("hi", Uint8Array.from({ length: 32 }, (_, i) => i), "myapp.com");
  assert.equal(bytes.toString("hex"), "9d010080020000006869000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f090000006d796170702e636f6d00");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), "0e80e1606a46e66fcb450f6ceb55803921e465fddee8216463cf7b2680c09f37");
  assert.throws(() => serializeNep413("hi", new Uint8Array(31), "myapp.com"), /invalid_nonce/);
});

test("challenge has a random 32-byte nonce, fixed recipient, exact message and five-minute expiry", () => {
  const h = harness();
  const second = h.store.issue(context, "browser-b");
  assert.equal(Buffer.from(h.challenge.nonce, "base64").length, 32);
  assert.notEqual(h.challenge.nonce, second.nonce);
  assert.notEqual(h.challenge.id, second.id);
  assert.equal(h.challenge.recipient, IDENTITY_RECIPIENT);
  assert.equal(h.challenge.expiresAt - h.challenge.issuedAt, CHALLENGE_TTL_MS);
  assert.equal(h.challenge.message, "Verify wallet ownership for Yawrd local development only.\nThis creates no production session and authorizes no transaction.\nAccount: alice.testnet\nNetwork: testnet\nOrigin: http://localhost:3000\nIssued at: 1970-01-01T00:16:40.000Z\nExpires at: 1970-01-01T00:21:40.000Z");
});

test("valid synthetic proof verifies and returns only local identity and finalized evidence", async () => {
  let checked: unknown;
  const h = harness(async (...args) => { checked = args; return evidence; });
  assert.deepEqual(decodePublicKey(key.publicKeyText), key.bytes);
  assert.deepEqual(await h.consume(), { developmentOnly: true, accountId: "alice.testnet", network: "testnet", ...evidence });
  assert.deepEqual(checked, ["alice.testnet", key.publicKeyText]);
});

test("expiry is enforced at the boundary and after a slow RPC", async () => {
  const expired = harness(async () => { assert.fail("must not call RPC"); });
  expired.setTime(expired.challenge.expiresAt);
  await assert.rejects(expired.consume(), /expired_challenge/);
  const slow = harness(async () => { slow.setTime(slow.challenge.expiresAt); return evidence; });
  await assert.rejects(slow.consume(), /expired_challenge/);
  const before = harness(); before.setTime(before.challenge.issuedAt - 1);
  await assert.rejects(before.consume(), /expired_challenge/);
});

test("replay fails and two concurrent consumers yield exactly one verification", async () => {
  const h = harness();
  const results = await Promise.allSettled([h.consume(), h.consume()]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  await assert.rejects(h.consume(), /unknown_challenge/);
});

test("challenge is consumed while the first request is still awaiting RPC", async () => {
  let finish!: () => void;
  const wait = new Promise<void>((resolve) => { finish = resolve; });
  const h = harness(async () => { await wait; return evidence; });
  const pending = h.consume();
  await assert.rejects(h.consume(), /unknown_challenge/);
  finish(); await pending;
});

test("a different browser cannot use or burn a challenge", async () => {
  const h = harness();
  await assert.rejects(h.store.consume(h.challenge.id, "browser-b", context, proof(h.challenge)), /unknown_challenge/);
  await h.consume();
});

test("issuing again for the same browser invalidates its old challenge", async () => {
  const h = harness(); h.store.issue(context, "browser-a");
  await assert.rejects(h.consume(), /unknown_challenge/);
});

test("mutating the returned challenge cannot change server-owned payload", async () => {
  const h = harness(); h.challenge.message = "attacker-controlled";
  await assert.rejects(h.consume(), /invalid_signature/);
});

for (const [name, change, code] of [
  ["selected account", { accountId: "bob.testnet" }, "wrong_account"],
  ["network", { network: "mainnet" }, "wrong_network"],
  ["origin", { origin: "https://evil.example" }, "wrong_origin"],
] as const) {
  test(`incorrect ${name} fails before RPC and consumes the attempt`, async () => {
    const h = harness(async () => { assert.fail("must not call RPC"); });
    await assert.rejects(h.store.consume(h.challenge.id, "browser-a", { ...context, ...change }, proof(h.challenge)), new RegExp(code));
    await assert.rejects(h.consume(), /unknown_challenge/);
  });
}

test("wrong returned account, substituted key and malformed Ed25519 keys fail", async () => {
  const other = keys();
  for (const change of [
    { accountId: "bob.testnet" }, { publicKey: other.publicKeyText },
    { publicKey: "secp256k1:abc" }, { publicKey: "ed25519:00000000" },
    { publicKey: `ed25519:${"1".repeat(33)}` }, { signature: "invalid" },
    { signature: Buffer.alloc(64).toString("base64") },
  ]) {
    const h = harness(async () => { assert.fail("must not call RPC"); });
    await assert.rejects(h.consume({ ...proof(h.challenge), ...change }), /wrong_account|invalid_public_key|invalid_signature/);
  }
});

test("wrong recipient, altered signed message, nonce, domain tag, callback and raw-message signatures fail", () => {
  const { challenge: c } = harness();
  assert.throws(() => checkChallenge({ ...c, recipient: "other-app" }, context, c.issuedAt), /wrong_recipient/);
  assert.throws(() => checkChallenge({ ...c, message: "other-message" }, context, c.issuedAt), /altered_message/);
  const p = proof(c);
  for (const altered of [{ ...c, message: `${c.message}!` }, { ...c, nonce: Buffer.alloc(32).toString("base64") }, { ...c, recipient: "other-app" }]) {
    assert.throws(() => verifySignature(altered, p), /invalid_signature/);
  }
  const payload = serializeNep413(c.message, Buffer.from(c.nonce, "base64"), c.recipient);
  const wrongTag = Buffer.from(payload); wrongTag.writeUInt32LE(413);
  const callback = Buffer.concat([payload.subarray(0, -1), Buffer.from([1, 0, 0, 0, 0])]);
  for (const bytes of [wrongTag, payload.subarray(4), callback]) assert.throws(() => verifySignature(c, proof(c, key, bytes)), /invalid_signature/);
  assert.throws(() => verifySignature(c, { ...p, signature: sign(null, payload, key.privateKey).toString("base64") }), /invalid_signature/);
});

test("RPC outage consumes a valid proof without returning identity", async () => {
  const h = harness(async () => { throw new Error("rpc unavailable"); });
  await assert.rejects(h.consume(), /rpc unavailable/);
  await assert.rejects(h.consume(), /unknown_challenge/);
});

function fakeRpc(query: unknown = { ...evidence, block_height: evidence.blockHeight, block_hash: evidence.blockHash, permission: "FullAccess" }, chain = "testnet") {
  const requests: { method: string; params: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    assert.equal(url, TESTNET_RPC); assert.equal(options?.cache, "no-store"); assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    const request = JSON.parse(options!.body as string); requests.push(request);
    return Response.json({ jsonrpc: "2.0", id: "yawrd-identity", result: request.method === "status" ? { chain_id: chain } : query });
  };
  return { requests, verify: testnetAccessKeyVerifier(fetcher) };
}

test("RPC uses the fixed Testnet endpoint, checks chain and queries exact key at finality final", async () => {
  const rpc = fakeRpc();
  assert.deepEqual(await rpc.verify(context.accountId, key.publicKeyText), evidence);
  assert.deepEqual(rpc.requests.map((r) => [r.method, r.params]), [
    ["status", {}], ["query", { request_type: "view_access_key", finality: "final", account_id: "alice.testnet", public_key: key.publicKeyText }],
  ]);
});

test("RPC rejects unauthorized, revoked, missing and malformed access keys and wrong chain", async () => {
  for (const query of [null, {}, { permission: { FunctionCall: {} } }, { permission: { GasKeyFullAccess: {} } }, { permission: "FullAccess" }, { permission: "FullAccess", block_height: 1, block_hash: "invalid" }]) {
    await assert.rejects(fakeRpc(query).verify(context.accountId, key.publicKeyText), /unauthorized_key|rpc_verification_failed/);
  }
  await assert.rejects(fakeRpc(undefined, "mainnet").verify(context.accountId, key.publicKeyText), /wrong_rpc_network/);
});

test("RPC fails closed on transport failures, timeout, HTTP error, JSON-RPC error or invalid response", async () => {
  const responses = [
    async () => { throw new Error("offline"); },
    async () => { throw new DOMException("timed out", "TimeoutError"); },
    async () => new Response("unavailable", { status: 503 }),
    async () => new Response("not-json"),
    async () => Response.json({ jsonrpc: "2.0", id: "yawrd-identity", error: { cause: { name: "UNKNOWN_ACCESS_KEY" } } }),
    async () => Response.json({ jsonrpc: "2.0", id: "wrong", result: { chain_id: "testnet" } }),
  ];
  for (const fetcher of responses) await assert.rejects(testnetAccessKeyVerifier(fetcher)(context.accountId, key.publicKeyText), /rpc_unavailable|rpc_verification_failed/);
  let calls = 0;
  const revoked: typeof fetch = async () => ++calls === 1
    ? Response.json({ jsonrpc: "2.0", id: "yawrd-identity", result: { chain_id: "testnet" } })
    : Response.json({ jsonrpc: "2.0", id: "yawrd-identity", error: { cause: { name: "UNKNOWN_ACCESS_KEY" } } });
  await assert.rejects(testnetAccessKeyVerifier(revoked)(context.accountId, key.publicKeyText), /rpc_verification_failed/);
});

function request(action: string, body: object, cookie?: string, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/dev/identity/${action}`, { method: "POST", headers: { host: "localhost:3000", origin, "content-type": "application/json", "sec-fetch-site": "same-origin", ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body) });
}

test("development routes are disabled by default and unconditionally absent in production", async () => {
  for (const environment of [{}, { NODE_ENV: "development" }, { NODE_ENV: "test", YAWRD_ENABLE_DEV_IDENTITY: "1" }, { NODE_ENV: "production", YAWRD_ENABLE_DEV_IDENTITY: "1" }]) {
    assert.equal(developmentIdentityOrigin(environment), null);
    for (const action of ["challenge", "verify"] as const) {
      const response = await developmentIdentityPost(request(action, {}), action, { env: environment });
      assert.equal(response.status, 404); assert.equal(response.headers.get("set-cookie"), null);
    }
  }
  for (const configured of ["https://example.com", "http://0.0.0.0:3000", "http://localhost:3000/path", "http://user:pass@localhost:3000", "http://localhost:3000/", "invalid"]) {
    assert.equal(developmentIdentityOrigin({ ...env, YAWRD_DEV_IDENTITY_ORIGIN: configured }), null);
  }
  assert.equal(developmentIdentityOrigin(env), origin);
});

test("development routes enforce origin, host and same-origin browser requests", async () => {
  const invalidHeaders: Record<string, string>[] = [{ origin: "https://evil.example" }, { origin: "null" }, { host: "evil.example" }, { "sec-fetch-site": "cross-site" }];
  for (const headers of invalidHeaders) {
    const response = await developmentIdentityPost(request("challenge", context, undefined, headers), "challenge", { env });
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: "wrong_origin" });
  }
  const missing = request("challenge", {}); missing.headers.delete("origin");
  assert.equal((await developmentIdentityPost(missing, "challenge", { env })).status, 400);
});

test("browser-bound HTTP challenge/verification works without a production session and rejects replay", async () => {
  const store = new DevelopmentChallenges(async () => evidence);
  const options = { env, store };
  const issued = await developmentIdentityPost(request("challenge", { accountId: context.accountId, network: "testnet" }), "challenge", options);
  assert.equal(issued.status, 200); assert.equal(issued.headers.get("cache-control"), "no-store");
  const cookieHeader = issued.headers.get("set-cookie")!;
  assert.match(cookieHeader, /HttpOnly; SameSite=Strict; Path=\/api\/dev\/identity; Max-Age=300/);
  const cookie = cookieHeader.split(";")[0];
  const { challenge } = await issued.json();
  const body = { challengeId: challenge.id, accountId: context.accountId, network: "testnet", proof: proof(challenge) };
  const missingBrowser = await developmentIdentityPost(request("verify", body), "verify", options);
  assert.equal(missingBrowser.status, 400);
  const wrongBrowser = await developmentIdentityPost(request("verify", body, `${DEVELOPMENT_COOKIE}=${"a".repeat(43)}`), "verify", options);
  assert.deepEqual(await wrongBrowser.json(), { error: "unknown_challenge" });
  const verified = await developmentIdentityPost(request("verify", body, cookie), "verify", options);
  assert.equal(verified.status, 200); assert.equal(verified.headers.get("set-cookie"), null);
  assert.deepEqual(await verified.json(), { developmentOnly: true, accountId: context.accountId, network: "testnet", ...evidence });
  const replay = await developmentIdentityPost(request("verify", body, cookie), "verify", options);
  assert.deepEqual(await replay.json(), { error: "unknown_challenge" });
});

test("development route rejects supplied payload overrides, wrong network, malformed and oversized input", async () => {
  for (const body of [{ accountId: "alice.testnet", network: "mainnet" }, { accountId: "bad..testnet", network: "testnet" }, { accountId: "alice.testnet", network: "testnet", message: "attacker" }, { huge: "x".repeat(5000) }]) {
    assert.equal((await developmentIdentityPost(request("challenge", body), "challenge", { env })).status, 400);
  }
  for (const body of ["{", "null", "[]"]) {
    const malformed = new Request(`${origin}/api/dev/identity/challenge`, { method: "POST", headers: { host: "localhost:3000", origin, "content-type": "application/json" }, body });
    assert.deepEqual(await (await developmentIdentityPost(malformed, "challenge", { env })).json(), { error: "invalid_request" });
  }
  const wrongContent = request("challenge", {}, undefined, { "content-type": "text/plain" });
  assert.equal((await developmentIdentityPost(wrongContent, "challenge", { env })).status, 400);
});
