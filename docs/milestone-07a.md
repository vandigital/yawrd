# Milestone 07A — Meteor wallet ownership verification

**Status: accepted and complete for the bounded local-development scope of Milestone 07A.** Acceptance recorded on 2026-10-29 (Asia/Manila), following the user's successful, explicitly approved Meteor Testnet message signature and supplied screenshot. The real-signing acceptance gate is satisfied alongside the automated validation below. No production session was created. Milestone 07B implementation has not started and is outside this acceptance.

## Implementation

Reference: the official [NEP-413 specification](https://github.com/near/NEPs/blob/master/neps/nep-0413.md), particularly its payload, signature and output interfaces. Key authorization follows the official [NEAR View Access Key RPC reference](https://docs.near.org/api/rpc/contracts#view-access-key).

- `src/identity/nep413.ts`: Node-only verifier using native `node:crypto` SHA-256 and Ed25519. Explicit Borsh encoding writes the little-endian `u32` tag `2^31 + 413`, UTF-8 message length/bytes, fixed 32-byte nonce, recipient length/bytes, and the zero byte for absent `callbackUrl`. A bounded base58 decoder accepts only 32-byte Ed25519 public keys; signatures must be canonical base64 encoding of 64 bytes. No new dependencies.
- `src/identity/challenges.ts`: cryptographically random 32-byte nonce and challenge ID, exact server-generated message and fixed recipient, expected account/origin/Testnet and five-minute expiry. Only copies of stored challenges leave the store. Browser binding uses a hash of a separate random cookie token. A matching-browser attempt deletes its challenge synchronously before cryptographic or asynchronous RPC verification, including on failure. Reissuing replaces that browser's pending challenge. Expiry is checked before and after RPC. The store holds at most 1,000 entries and prunes expired entries when issuing challenges.
- RPC is fixed to `https://rpc.testnet.near.org`; callers cannot choose the endpoint, method, permission or finality. The verifier first checks `status.chain_id === "testnet"`, then queries the exact returned key under the expected account with `view_access_key` and `finality: "final"`. Only the literal `FullAccess` permission is accepted. HTTP, JSON, JSON-RPC, timeout, missing/revoked keys and malformed evidence fail closed. Successful local checks return account/network and finalized block evidence, never the proof.
- `src/identity/development.ts` and `app/api/dev/identity/{challenge,verify}/route.ts`: development-only JSON endpoints. Both `NODE_ENV=development` and the explicit enable flag are required. The configured origin must be a canonical HTTP loopback origin. Requests must match its URL origin, Host and Origin, and browser Fetch Metadata must be same-origin when present. Inputs have exact field allowlists and a 4 KiB streaming size limit. Responses are not cached. The browser cookie is HttpOnly, SameSite=Strict, scoped to `/api/dev/identity`, and lasts five minutes; it is a challenge binding, not a session.
- `app/dev/identity/`: separate localhost harness with explicit connection, selected-account control, challenge review, and message-approval button. It explains the absence of gas, transactions and spending permissions. Account, wallet instance and network are rechecked before and after signing. Signatures stay in memory and travel only in the verification POST body. Wallet exceptions are not logged or rendered because they can contain signed data.
- `app/wallet-session.ts` and `app/use-testnet-wallet.ts`: reuse the installed `@hot-labs/near-connect@0.11.4` Meteor session. Pass an explicit `signerId`, `network: "testnet"` and `Uint8Array` nonce to `wallet.signMessage`. Duplicate requests are blocked during approval. Focus refreshes cannot invalidate an unchanged selection while signing. Existing creation signing and wallet feature filters are preserved.

Production route modules remain present in the Next.js build, but all seven supported HTTP methods return 404 before reading input, creating a store, issuing a cookie or doing RPC work. The production page calls `notFound()`. Enabling the development flag in a production runtime cannot enable the harness.

This is a process-local development check. Restarting the development server loses pending challenges. It provides no durable authentication, account profile, authorization, membership or production session.

## Automated validation

- `npm test`: **79 passed**, comprising the existing 53 tests, 22 verifier/challenge/HTTP tests, and 4 Meteor session adapter tests. Tests use only ephemeral synthetic keys generated in memory.
- Coverage includes exact independent Borsh/SHA-256 vector, valid proofs, expiry at the boundary and during RPC, replay and concurrent consumption, browser mismatch, reissuance, attempted mutation of server payloads, wrong selected/returned accounts, substituted/malformed public keys, wrong network/origin/recipient, changed message/nonce/domain tag/callback, raw-message signatures, unauthorized/revoked keys, RPC failures, malformed/oversized HTTP requests, and production gating.
- `npm run typecheck`: passed.
- `npm run build`: passed with installed Next.js 16.4.3. The sandbox initially prevented build-worker execution (`Could not parse output from TypeScript's --showConfig`); the approved local build outside that sandbox passed.
- `git diff --check`: passed.
- Development HTTP: identity page, creation page and public example returned 200. An actual HTTP challenge returned 200 with a 32-byte nonce and HttpOnly cookie, without any signing request.
- Production HTTP, even with `YAWRD_ENABLE_DEV_IDENTITY=1`: identity page and identity API endpoints returned 404 without cookies. Creation/public example returned 200; unknown public project returned 404. All supported API methods were checked after the final build, including with runtime `NODE_ENV=development` deliberately misconfigured: the compiled production gate remained disabled.
- Isolated Chromium: harness at 1440, 390 and 320 px had no horizontal overflow, displayed approval/cost disclosures, and disabled wallet actions without Meteor. Creation and public-page browser smoke checks passed. No user browser profile or wallet storage was accessed.
- Read-only live RPC `status` request succeeded and reported `chain_id: "testnet"`. This establishes connectivity only, not a real wallet proof or FullAccess verification.

The sandboxed Node 26.12.1 process-isolated test invocation reported only file-level passes. `--test-isolation=none` enumerated and executed all 53 baseline tests and all 79 final tests; `npm test` now uses that option. Tests continue using the existing TSX hook and Node runner. No dependencies or lockfile were changed.

## Human Meteor acceptance — passed

The user reported successful message approval in Meteor. The attached screenshot confirms the harness result:

| Acceptance evidence | Recorded result |
| --- | --- |
| Wallet approval | Successful explicit Meteor message approval, reported by the user |
| Verified network | Testnet |
| Verified account | `yawrd.testnet` |
| Finalized block | `275227614` |
| Harness status | "Wallet ownership verified for this local check. No production session was created." |
| Evidence source | User's manual verification report and screenshot attached to the acceptance conversation |

This records a genuine Meteor signing result through the implemented signature and finalized FullAccess-key verification path, rather than a synthetic test proof. The agent reviewed the supplied screenshot; the human performed wallet approval. No signature, challenge body, nonce, browser cookie or private key was requested or retained in this report. Meteor's exact version and the precise signing time were not supplied; compatibility is confirmed for the installation and direct-signing flow exercised in this manual check. No signing failure or compatibility blocker was reported.

The screenshot remains attached to the conversation; no repository screenshot file is claimed. All 07A acceptance gates are satisfied: server verification, browser binding and single-use behavior, invalid-proof/RPC tests, production gating, preservation of creation/public pages, and genuine human-approved Meteor signing.

### Repeat verification procedure

1. Run `npm run dev:identity` and open **http://localhost:3000/dev/identity** in a browser with Meteor. The server binds only to 127.0.0.1. Use the hostname exactly as shown: `127.0.0.1:3000` is a different origin and is rejected by the default configuration.
2. Connect Meteor on Testnet and explicitly select the account. Connection alone does not verify ownership.
3. Click **Prepare challenge**. Review the account, Testnet, origin, expiry, message and recipient.
4. Click **Request Meteor message approval** and approve the off-chain message in Meteor. Never approve a transaction for this check or provide a private key.
5. Record only the successful status, verified public account, finalized block number/hash, Meteor version and time. Do not copy signatures, challenge bodies, nonces or cookies into reports or logs.
6. If it fails, record the exact visible Meteor error or server error code and which stage failed, excluding any signed payload. Stop the signing exercise; do not substitute wallets, add access keys or introduce another architecture.

The completed manual check above closes the previously outstanding acceptance gate. These steps remain as a repeatable local verification procedure.

## Compatibility and scope

near-connect 0.11.4 exposes no `callbackUrl` or `state` in its standalone `SignMessageParams`. This harness deliberately supports an injected/direct Meteor result with `callbackUrl=None`; it does not implement redirect callbacks. Browser binding is supplied by the server cookie. A wallet that signs a different callback payload will fail verification; that must be investigated as a compatibility failure rather than silently accepting extra payload variants.

This verifier supports Ed25519 and literal FullAccess keys only. Other key algorithms, FunctionCall keys and newer gas-key permission objects are rejected. Native Node crypto requires the Node runtime; the verifier is not an Edge-runtime module. The HTTP cookie is appropriate only for the explicitly local HTTP harness; production needs a separate HTTPS session design.

No database, participant applications, production sessions, contract/factory changes, wallet transactions, deployment, spending or pushes were performed. Existing Milestone 06 workspace edits were preserved. Next.js appended generated guidance to `AGENTS.md` on startup; that incidental edit was removed.

## Recommendation for 07B

Recommendation only; do not implement 07B until separately authorized. The real Meteor acceptance gate is complete. For 07B, retain the verifier and replace the process-local store with Neon-backed challenges containing the immutable server payload/context, hashed browser binding, expiry and atomic consumption state. Claim each challenge with a conditional database operation before verification so concurrent workers cannot reuse it; failed attempts remain consumed. Avoid holding a database transaction open across RPC calls.

Only after successful cryptography and finalized key authorization should a database transaction create a session tied to the unique consumed challenge and the `(network, account_id)` identity. Issue a rotated, random opaque session token, persist only its hash, and use an HttpOnly, Secure cookie with a deliberate SameSite policy, expiry and revocation. Use a new production message/recipient and configured HTTPS origin allowlist, CSRF protection, bounded request rates, sanitized result-only telemetry and periodic challenge cleanup. Store verification time/key/block evidence and define when key revocation or sensitive actions require re-verification. Treat wallet connection, verified identity and permission to act as separate states. Participant application design remains outside this milestone.
