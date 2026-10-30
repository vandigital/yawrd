# Milestone 07B — Persistent participant applications

Status as of **2026-10-29 (Asia/Manila): acceptance criteria MET for Milestone 07B development/Testnet participant applications.** The owner completed the real two-wallet Meteor NEP-413 exercise; final server-side denial and regression checks corroborate the result. The canonical [YAW-001 Blueprint v1](genesis/YAW-001_BLUEPRINT_V1.md) exists: project concept **approved**, Blueprint **draft awaiting formal Yawrder approval**, lifecycle **not started**. No missing contents were invented or copied into application records. YAW-001 creation remains gated until **November 1, 2026 or later**; that date alone does not authorize creation.

The restricted `yawrd_07b_runtime` login is now the application connection. Owner credentials are isolated in an ignored operator-only file that Next.js does not load. Confirmed browser origin: **http://localhost:3000**. Clearly labeled YAW-001 development acceptance records are prepared under creator **yawrd1.testnet**. The owner completed real Meteor sign-in approvals as **yawrd1.testnet** and **olddadai.testnet**. No contract transaction, public deployment, Git push or Milestone 08 implementation occurred. **Milestone 07B meets its acceptance criteria within the development/Testnet scope; this is not production launch approval.** Existing Milestone 06/07A workspace edits, Creation Builder, public fixture and canonical Blueprint are preserved.

The owner independently confirmed in the Neon Console: **organization Keelbase, project Yawrd, branch development, database neondb, endpoint `ep-twilight-voice-aorpfrbm`, pooling enabled; not production**. This confirmation explicitly authorized proceeding with development-only migrations and integration tests. Architecture reconciliation was approved October 29, 2026. These confirmations supersede the earlier pending installation/architecture/branch approvals. No private Keelbase repository was accessed. Only the authorized root environment was loaded through the application's environment loader; `docs/.env.local`, credential stores and wallet files were not read.

## Implementation and changed files

| Files | Behavior |
| --- | --- |
| `migrations/001_participants.sql` | Dedicated `yawrd` schema; projects and separate restricted text; browser-bound challenges; session hashes and finalized key evidence; applications, versioned consent and immutable reviews; per-account challenge rate limit. |
| `scripts/migrations.mjs`, `scripts/migrate.mjs`, `scripts/load-environment.mjs`, `scripts/verify-database.mjs` | Root Next.js environment loading, explicit development endpoint guard, version/checksum ledger, ordered application, advisory transaction lock, atomic migration and repeat execution. Changed applied migrations fail; new changes require a new numbered migration. Read-only schema/checksum/privilege inspection via `db:verify`. Never invoked by build or HTTP requests. |
| `src/participants/{database,database-config,auth,repository,http,types}.ts` | Neon adapter, authentication orchestration, parameterized queries, permission checks and bounded HTTP parsing. |
| `app/api/auth/[action]/route.ts` | POST challenge, verify and logout. |
| `app/api/yawrd/[projectId]/[action]/route.ts` | GET state; POST apply/review. |
| `app/yawrd/[projectId]/page.tsx` | Existing fixture preserved; separately loads published persisted projects. Unpublished names/content never enter metadata. Database failure renders a generic unavailable state. |
| `app/components/{persisted-yawrd,participant-panel}.tsx` | Existing cover, heading, avatar and visual vocabulary; application form, status, creator reviews and progressively revealed information on the same page. |
| `test/participants.test.ts` | Database configuration/target guard tests and offline orchestration, HTTP, mapping and rendering tests using ephemeral synthetic keys and injected query results. These do not execute PostgreSQL. |
| `test/participants-live.test.ts` | Explicit development/disposable modes with endpoint guard; real-database constraints, concurrent submissions/decisions, cryptographic auth, HTTP handlers, session rotation, expiry/revocation, rate limits, restricted reads, migration repeatability and fresh-process persistence checks. |
| `scripts/participant-previews.tsx`, `scripts/participant-screenshots.mjs` | Synthetic static component previews and isolated Chromium screenshots. No application route, authentication bypass or database seed. |
| `scripts/configure-development-runtime.mjs`, `scripts/load-migration-environment.mjs`, `scripts/verify-runtime.mjs`, `scripts/seed-07b-acceptance.mjs`, `scripts/check-07b-acceptance.mjs` | Final development origin/role setup, separate operator credential loading, actual negative SQL probes, labeled YAW-001 records and local HTTP/restart/Chromium verification. |
| `.env.example`, `package.json`, `package-lock.json` | Server-only `DATABASE_URL` configuration, CLI environment loading, migration/live-test commands and installed pinned Neon dependency. |

The accepted `src/identity/nep413.ts` implementation is unchanged. Production sign-in uses its exact `verifySignature` and finalized Testnet `testnetAccessKeyVerifier`, with a distinct sign-in message/recipient and production context validation. The 07A development-only harness remains unchanged.

## Database setup and migration instructions

### Connection, migration and schema evidence

- Installed `@neondatabase/serverless@1.2.0` using `--ignore-scripts`; the lockfile adds only that package, with no additional dependencies. `npm ls @neondatabase/serverless --depth=0` confirms the installed version.
- Next's already-installed `@next/env` loader securely loads root `.env.local` for CLI commands; Next.js loads it for the app. Initially, runtime and migration commands shared the supplied `DATABASE_URL`; final security configuration now separates them as described below. Legacy `YAWRD_DATABASE_URL` remains compatible; conflicting values fail closed. No secret was printed or copied into source. Both `.env.local` and `docs/.env.local` pass `git check-ignore`.
- Before owner branch confirmation, only a SELECT catalog check ran. It found no `yawrd` schema or migration ledger. The migration guard rejected an unpinned command before SQL. After the console confirmation above, commands used the independently confirmed, non-secret `YAWRD_DEV_DATABASE_ENDPOINT=ep-twilight-voice-aorpfrbm`. The guard checks the exact endpoint (normalizing pooling), PostgreSQL protocol, Neon host and required TLS. No endpoint was inferred from a branch name.
- Reviewed and applied the existing **`001_participants.sql` unchanged**. Repeat migration runs passed without replacing records. The public ledger contains exactly that migration, and its SHA-256 matches the reviewed local file. The live test also applies the migration twice before creating records, exercising repeat execution.
- `db:verify` checks catalogs in an explicitly **read-only transaction** and confirms `current_database()='neondb'`. It found exactly seven `yawrd` tables: `projects`, `restricted_content`, `auth_challenges`, `sessions`, `applications`, `review_decisions`, `auth_rate_limits`; all four application triggers are present. PostgreSQL reports **21 CHECK, 4 foreign-key, 7 primary-key, 4 additional UNIQUE and 48 NOT NULL constraints**, all validated.
- Live negative SQL checks require PostgreSQL `23514`, rather than treating arbitrary connection errors as successful denials. These exercise fixture reservation, Testnet isolation, immutable creator identity, creator-only reviews and immutable application/decision UPDATE/DELETE protections.
- Test records are retained for owner inspection. Project IDs are prefixed `dev-07b-`; visible names explicitly read **DEVELOPMENT ONLY — 07B synthetic test**. Synthetic records have no genuine ownership claim, contract or rewards. Runs retained `dev-07b-edfca4dbf826` (initial failing auth run), `dev-07b-7435abbb2924` (passing after fix) and **`dev-07b-f396aa9b23b3`** (final passing suite and actual-route checks), plus clearly marked unpublished companions. No existing project or audit record was deleted.

### Reproduce the authorized development checks

Root `.env.local` supplies only the restricted runtime `DATABASE_URL`; never place it in command arguments or logs. Explicit operator commands separately load `YAWRD_MIGRATION_DATABASE_URL` from the ignored, mode-0600 `.env.migrations.local` JSON file. Next.js does not read that operator file. After independently confirming the endpoint remains development:

```sh
YAWRD_DEV_DATABASE_ENDPOINT=ep-twilight-voice-aorpfrbm npm run db:migrate
YAWRD_DEV_DATABASE_ENDPOINT=ep-twilight-voice-aorpfrbm npm run db:verify
YAWRD_DEV_DATABASE_ENDPOINT=ep-twilight-voice-aorpfrbm YAWRD_TEST_DATABASE_DEVELOPMENT=1 npm run test:participants:live
npm test
npm run typecheck
npm run build
```

`YAWRD_TEST_DATABASE_DEVELOPMENT=1` explicitly permits synthetic writes to the confirmed application development branch. The existing alternative disposable mode remains available with `YAWRD_TEST_DATABASE_DISPOSABLE=1` and `YAWRD_TEST_DATABASE_URL`, but also requires the independently confirmed development endpoint pin, rejects the same application database even under a different pooling hostname, and cannot be combined with development mode. No second database or infrastructure was provisioned.

### Integration defect found and fixed

The first live run passed application/review authorization and persistence, but valid challenge verification failed with `altered_message`. Neon returns `timestamptz` values as JavaScript `Date` objects. `storedChallenge` converted them through `String(Date)`, losing milliseconds and changing the reconstructed sign-in message. A sanitized diagnostic confirmed the timestamp type and precision loss without printing the challenge or proof.

`src/participants/auth.ts` now reads `Date.getTime()` directly and still parses string timestamps. A deterministic offline regression uses a 123 ms timestamp; the live HTTP challenge/verification tests exercise Neon-returned Dates. The accepted NEP-413 serializer/verifier and signature requirements were not changed. Final offline and live reruns pass.

### Final origin and runtime security configuration

The owner confirmed the actual browser origin is **http://localhost:3000**. Root `.env.local` now sets `YAWRD_APP_ORIGIN` to exactly that origin and `YAWRD_ALLOW_HTTP_LOCALHOST=1`. The existing gate accepts HTTP localhost only in development; production still requires HTTPS. No HTTP IP-address, forwarded-host or wildcard-origin allowance was added. Browser cookies remain `__Host-`, Secure, HttpOnly and SameSite=Strict. Automated origin tests confirm production rejects local HTTP even with the allowance flag set. Challenge issuance and verification use the same canonical origin and signed-message origin.

`scripts/configure-development-runtime.mjs` is an explicit operator command, hard-gated to the owner-confirmed development endpoint `ep-twilight-voice-aorpfrbm`, `neondb`, and the confirmed local acceptance origin. It created **yawrd_07b_runtime** through SQL, with LOGIN but NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION and NOBYPASSRLS. It grants no role memberships, schema/object ownership or migration permissions. [Neon's role documentation](https://github.com/neondatabase/website/blob/main/content/docs/manage/roles.md) confirms SQL-created roles receive selective grants rather than automatic `neon_superuser` membership and are scoped to the branch.

| Runtime object | Allowed operations |
| --- | --- |
| Database/schema | CONNECT to `neondb`; USAGE on `yawrd` |
| `projects`, `restricted_content` | SELECT |
| `applications`, `review_decisions` | SELECT, INSERT |
| `auth_challenges` | SELECT, INSERT; UPDATE only `consumed_at` |
| `sessions` | SELECT, INSERT; UPDATE only `revoked_at` |
| `auth_rate_limits` | SELECT, INSERT; UPDATE only `attempts`, `resets_at` |

PUBLIC CREATE on the development database/public schema and PUBLIC TEMPORARY on that database were revoked so inherited defaults cannot defeat the restriction. No production role or database was contacted. No schema/migration or future default-object grants were added. Existing immutable-record and creator-review triggers remain unchanged.

`DATABASE_URL` now selects this runtime login. The preserved owner URL is **absent from root `.env.local`** and stored in `.env.migrations.local` as a single JSON setting, with mode **0600**. Only explicit migration/catalog/seed/live-test operator commands load it through `scripts/load-migration-environment.mjs`. Normal Next.js and the runtime database adapter never load that file. A fresh app-environment process confirms the migration URL is absent. Operator credentials remain accessible to the local OS account for maintenance; this is credential separation, not OS process isolation.

`developmentMigrationDatabaseUrl` has no fallback to runtime credentials. The live suite requires both connections to target the same confirmed endpoint/database; disposable mode requires its own matching migration connection. Synthetic setup and direct constraint probes use the owner connection; all repository/authentication/HTTP handler operations and fresh-process application reads use the restricted connection.

`npm run db:verify:runtime` checks all **49 table-level permissions**, every UPDATE column allowlist, role attributes/memberships and absence of relation/function ownership. All **22 actual prohibited SQL operations** fail specifically with PostgreSQL **42501 insufficient_privilege**. Each probe is forced to roll back even if an unexpected grant lets it execute. Probes cover schema/table/TEMP creation, schema alteration, trigger disabling, role creation/administration, assuming the owner role, granting admin membership, migration-ledger access, project/restricted-content writes, audit mutation/deletion/TRUNCATE, session identity/lifetime changes and challenge-message changes.

Reproduce the final setup only on the already confirmed development endpoint:

```sh
YAWRD_DEV_DATABASE_ENDPOINT=ep-twilight-voice-aorpfrbm YAWRD_ACCEPTANCE_ORIGIN=http://localhost:3000 npm run db:configure:development
npm run db:verify
npm run db:verify:runtime
npm run db:seed:acceptance
YAWRD_TEST_DATABASE_DEVELOPMENT=1 npm run test:participants:live
npm test
npm run typecheck
npm run build
npm run test:acceptance:local
```

The local acceptance script needs ports **3000 and 3099 free** and refuses to replace existing servers. It stops only servers it starts. The final manual server runs separately at port 3000. A repeated run retains additional synthetic audit records and revokes its synthetic sessions; it does not change the two human acceptance fixtures.

### YAW-001 development acceptance data

`npm run db:seed:acceptance` prepares exactly two idempotent development-only fixtures: **dev-yaw-001** and **dev-yaw-001-rejection**, the latter a companion to exercise the immutable rejection outcome with the same two human wallets. Both refer to the same YAW-001 acceptance exercise; neither is an alternative production Yawrd. Existing applications/decisions are preserved on repeated setup.

- Name: **YAW-001 — Build Progress**; tagline: **Building Yawrd, together.**
- Creator: **yawrd1.testnet**; intended Testnet address: **demo.factory.yawrd.testnet**, explicitly **not deployed**.
- Each description prominently says **DEVELOPMENT ONLY**, the concept is approved, Blueprint v1 is a draft awaiting formal approval, Project Rules are not deployed, no Project Funds are held, no rewards are available, there is no production publication, and creation remains gated until November 1 or later.
- Public objectives/participation contain only labeled acceptance-test instructions. Restricted content is a synthetic access-check marker, with no Blueprint details, private source information, real work assignment or reward offer. The seed script does not read the Blueprint file.
- The existing `published_at` field is set only to permit page access in this development branch, as required by the existing 07B repository. It does not represent public production publication; the local descriptions explicitly say so. No publication API or Blueprint migration was added.
- Creation remains disabled by the existing `testnetFactorySettings = null` gate; no factory configuration or automatic November 1 activation was introduced.
- `the-common-table` was neither written in PostgreSQL nor modified in source. Its offline coverage, HTTP page and browser checks remain part of validation.

Migration source is trusted repository code, not request data. Its runner constructs DDL from reviewed migration files; application SQL uses numbered parameter placeholders exclusively. The Neon adapter follows the driver's official [`query(text, parameters)` interface](https://github.com/neondatabase/serverless/blob/main/CONFIG.md).

Owner maintenance can periodically delete expired sessions first, then expired unreferenced challenges, then obsolete rate-limit rows. No scheduler/service was introduced. Applications/reviews are immutable audit records and must not be deleted by routine maintenance. Retention/deletion policy and any future appeal/reapplication workflow require an owner decision and a versioned migration.

## Verification results

| Check | Final result on 2026-10-29 |
| --- | --- |
| Driver installation/lockfile | Passed; pinned `1.2.0`, one package added, install scripts disabled. |
| Root configuration | **Passed**; exact confirmed localhost origin; restricted runtime in `.env.local`; migration credential isolated in operator-only `.env.migrations.local`; both ignored and mode 0600. |
| Development target | Owner confirmed in Neon Console: Yawrd/development/neondb, endpoint `ep-twilight-voice-aorpfrbm`; exact endpoint guard used for every migration/test command. |
| Migration/catalogs | **Passed**; original migration applied and repeatable; checksum matches; seven tables, four triggers, validated constraints; read-only catalog verification passed. |
| `npm test` | **106 passed**: prior 104 cases plus migration/runtime credential separation and development/production origin regressions. Creation Builder, fixture and 07A coverage pass. |
| `npm run test:participants:live` with explicit development mode | **13 passed, 0 failed, 0 skipped** (12 subtests plus their parent). No synthetic key authorization is presented as wallet/RPC acceptance. |
| `npm run typecheck` | **Passed.** |
| `npm run build` | **Passed** in final security configuration, Next.js 16.4.3/webpack. Sandboxed TypeScript subprocess output could not be parsed; authorized local build passed. No deployment. |
| Built app HTTP | Creation Builder `/` and `/yawrd/the-common-table`: **200**. Production `/dev/identity`: **404**; both 07A APIs reject all seven supported methods (**14 checks**, no cookies), even with the development enable flag set. |
| Actual development HTTP auth routes | Challenge **200**; invalid proof **401**, replay **401/unknown_challenge**, cross-origin **403**; no invalid-proof session minted. |
| Actual Next.js restarts and live Chromium | **Passed**; pending survives one restart, creator approval/rejection survive another; five desktop/mobile browser scenarios, real hydrated refresh, Secure-cookie delivery and no overflow. **14 grouped checks** in the local runner. |
| Actual development HTTP/SSR workflow | Synthetic session fixtures: application **200/pending**, non-creator review **403**, creator approval **200**; approved page/API contains authorized restricted text, public page/API omits it; logout **200** removes access. HTTP fixture sessions revoked afterward. |
| Unconfigured-origin gate | Built-app challenge returns **503/service_unavailable**, no cookie, before database access when origin is unset. |
| Browser artifact secret check | **Passed**; configured URL/password absent from 27 `.next/static` files, no values printed. |
| Runtime database privileges | **Passed**: restricted login, 49 table permission checks, column UPDATE allowlists and 22 prohibited-operation probes; owner connection preserved separately. |
| `git diff --check` | **Passed.** |

The real-PostgreSQL suite checks concurrent applications (one persisted winner and original consent), concurrent opposite decisions (one immutable winner), deterministic retries, unpublished/network/fixture guards, creator/public/approved/pending/rejected separation, expiry/revocation, a fresh Node process reloading an approved application, atomic challenge claiming, cryptographic sign-in, session hashing/rotation/logout, invalid proofs and injected key-verifier failure, reissuance, the eleventh-challenge rate limit, HTTP consent/cross-origin/review checks and logout removal of restricted access.

For cryptographic live tests, ephemeral synthetic Ed25519 keys sign the real NEP-413 payload; only key-authorization evidence is injected into the test process. Actual Next.js route success-path authorization uses owner-inserted synthetic session fixtures, never an exposed API bypass. No real wallet/RPC success is claimed. Tests retain only hashes in session tables; proofs/tokens were not logged.

**Earlier integration pass:** the workspace had a running development server, which was left untouched. The separate real-route verification used an isolated temporary copy of Yawrd source and an in-memory inherited database setting at localhost:3077. No environment file, wallet storage or unrelated source was copied. Temporary verification servers were stopped afterward. Installation, live network checks, builds and loopback servers used sandbox escalation; no automatic approval rejection occurred. The first isolated-start attempt in the shared workspace was blocked by Next's existing development-server lock; the isolated source copy resolved it without stopping the user's server.

No authorization bypass was observed in final tests. The real integration failure was the timestamp precision bug described above; it is fixed and covered by regression tests. The final security pass resolves database least privilege. The subsequent owner-operated two-wallet exercise and final read-only server verification close human acceptance for the development/Testnet scope.

Prior implementation evidence, not rerun in this integration pass: isolated headless Chromium static previews covered public, apply, pending, approved, rejected, creator and fixture at 1280px; apply/approved/creator at 390px; pending at 320px. All 11 had no horizontal overflow. Those are static synthetic components, not hydrated live database or wallet acceptance.

Reproduce the static previews with:

```sh
node --import ./test/register-tsx.mjs scripts/participant-previews.tsx
node scripts/participant-screenshots.mjs
```

Screenshots and machine-readable results are local ignored review artifacts under `docs/verification/milestone-07b/`:

- `public-1280.png`, `apply-1280.png`, `pending-1280.png`
- `approved-1280.png`, `rejected-1280.png`, `creator-1280.png`
- `fixture-1280.png`, `apply-390.png`, `approved-390.png`, `creator-390.png`, `pending-320.png`

The earlier preview images are labeled synthetic. They do not prove a persisted project or accepted Meteor sign-in. Final live browser artifacts are described below.

The live modes above retain synthetic records for inspection and never drop schemas. They use test-process-only key-authorization injection or direct owner session fixtures as described; neither creates a runtime bypass. A fresh Node process reloads the persisted approved application. Do not run either mode without confirmation of the dedicated development endpoint.


### Final local acceptance evidence

Final complete run: **14 grouped checks passed**. Retained synthetic HTTP project: **dev-07b-http-6af7e7bbc013**; retained final live-suite project: **dev-07b-5030f356a817**. Before the human exercise, both human acceptance fixtures were separately confirmed to have **zero applications** after automation. That historical readiness check is superseded by the real applications and decisions recorded below.

The local runner uses the real Next.js app with the restricted runtime login, and only the operator connection for clearly labeled synthetic project/session setup. The synthetic project uses synthetic account names; **no YAW-001 application, decision, session or successful signature was fabricated for either human wallet**. The actual YAW-001 page/API is checked anonymously and its `yawrd1.testnet` sign-in challenge is checked only through a deliberately invalid proof and replay. That creates no session; the human must prepare a fresh challenge.

The runner checks public metadata, origin/message consistency, Secure cookies, invalid proof/replay/cross-origin denial, separate synthetic applicant submission, pending status, creator-only decisions, rejection/unauthorized denial, approved access, logout and SSR/React-payload protection. It stops/restarts its own Next.js server after pending submission and again after approval/rejection, proving persistence across real application restarts. All synthetic HTTP fixture sessions are revoked in cleanup. Database records are retained for audit; no existing applications or decisions are deleted.

Isolated Chromium uses a new temporary profile, never the owner's browser or wallet storage. Live pages cover YAW-001 public at **1280px and 390px**, the original fixture and Creation Builder at **1280px**, and a synthetic approved participant at **390px**. Checks require trustworthy localhost, no horizontal overflow, expected page content and native Secure-cookie delivery for synthetic approved content. The public refresh button is the only application control clicked; its successful API fetch confirms hydration. No wallet button is clicked. Screenshots were visually inspected at mobile width.

Production checks run the built app at localhost:3099 solely for restriction testing: builder/fixture **200**, `/dev/identity` **404**, all seven methods on each of the two 07A APIs denied with no cookies, and HTTP auth issuance **503** with no cookie even though local development allows HTTP. The browser asset scan checks both connection URLs and passwords without logging values.

An initial runner assertion expected `Vary` to equal only `Cookie`; real Next.js correctly adds framework fields alongside Cookie. The assertion now checks Cookie membership. Browser readiness handling also accounts for Chromium execution-context replacement during navigation, with bounded retries for that CDP transport race. Neither required an application authorization change.

Final local artifacts are ignored under `docs/verification/milestone-07b/`:

- `final-acceptance-results.json` — historical automated-only checks, synthetic project reference, origin, runtime role and **humanWalletAcceptance: NOT RUN**. This predates the human exercise and describes that automated run only; the human report and `human-acceptance-server-results.json` below supersede it for final acceptance.
- `final-yaw001-public-1280.png`, `final-yaw001-public-390.png`.
- `final-fixture-1280.png`, `final-creation-1280.png`, `final-synthetic-approved-390.png`.

`next dev` automatically adds its installed-version guidance block to `AGENTS.md`. This was generated by Next.js; it does not change the Yawrd product/security instructions. No dependencies were installed in this final pass, no services were provisioned and no automatic approval rejection occurred.

## Security and authorization review

- Challenges use random 32-byte IDs/nonces, exact account/network/origin/purpose, five-minute expiry and a hash of a separate browser cookie. An atomic conditional UPDATE consumes a matching challenge before cryptography or RPC. Bad proof/RPC failures remain consumed; another browser cannot consume it. The database rechecks challenge expiry when minting a session.
- Only accepted NEP-413 signature verification and finalized Testnet FullAccess-key authorization can reach session creation. Network/expiry/context checks repeat after RPC. No transaction is held open while waiting for RPC. A unique session challenge reference prevents duplicate minting.
- Sessions are random opaque 32-byte tokens; only SHA-256 hashes are persisted. Cookies have `__Host-` names, Secure, HttpOnly, SameSite=Strict, Path=/ and a one-hour lifetime. Sign-in rotates/revokes a prior browser session atomically with minting. Logout revokes before claiming success. All reads/mutations check database expiry/revocation; sessions are never extended by activity. Key revocation after sign-in is bounded by the one-hour session; immediate key rechecking on every action is not implemented.
- Configured origin, request URL, Host and Origin must agree for mutations; cross-origin Fetch Metadata is rejected. No forwarded-header trust or wildcard CORS. JSON bodies stream through an 8 KiB cap, exact allowlists reject supplied identities/roles/payload overrides. Challenge issuance is limited to 10/account/minute in Postgres; distributed abuse across many account names and operational storage quotas remain deployment considerations.
- Application and review INSERT statements derive the actor from a live session inside SQL. The creator cannot apply to their own Yawrd. The unique `(network, project_id, account_id)` application constraint preserves first submission/consent; a separate read after an insert conflict observes the concurrent winner.
- The creator check is enforced in the review INSERT and a database trigger. Each application permits one decision; update/delete triggers protect decisions and applications, and project identity/creator cannot be changed. Same-decision retries return the recorded result; conflicting retries return 409. Immutable records do not yet have an appeal or reapplication mechanism.
- Membership is derived from approved decisions; no independently writable membership flag exists. Restricted content and other applicants' introductions are selected only by a single statement with a live session and creator/approved checks. Public/pending/rejected responses contain no restricted text; a participant sees only their own application; only the creator receives the review list. Page metadata only uses generic/fixture values. The database module has a `server-only` import guard. Authorized participant text may travel in that authorized page's server response/React payload; it is never authored into a client source file or globally cached public response.
- API responses use private/no-store and Vary: Cookie. The page is dynamic and loads authorization on the server. Generic errors disclose no credentials, proofs or raw database/RPC/wallet exceptions. A disconnected/switched wallet does not change a signed-in identity: the UI explicitly displays the server-verified account and requires sign-out/new verification to change it.
- Approval sends no invitations, changes no contracts, grants no external repository access and submits no transaction. The 07A development harness has not been promoted into a production bypass.

## Final human acceptance report — criteria met

**Acceptance date: October 29, 2026 (Asia/Manila).** Creator: **yawrd1.testnet**. Applicant: **olddadai.testnet**. The owner reported completion of the actual Meteor NEP-413 exercise, rather than a simulated signature or the 07A development harness. Individual human-action timestamps and wallet proofs were not supplied or retained in this report.

| Criterion | Human evidence supplied by owner | Final corroboration |
| --- | --- | --- |
| Creator and separate applicant authentication | Both accounts signed in through Meteor NEP-413. | Stored server sessions exist for both accounts, associated with consumed challenges for the configured localhost origin, sign-in recipient, Ed25519 key identifiers and positive finalized block heights. No raw proof/key/session material was exported. |
| Application and pending review | Applicant submitted; creator saw the pending application, introduction and review controls. | Persisted application belongs to `olddadai.testnet`, with `participant-v1` consent and project creator `yawrd1.testnet`. The introduction was not copied into evidence. |
| Pending persistence | Pending status survived the first requested development-server restart. | The restart was performed only on the port-3000 Yawrd process and the page returned HTTP 200 afterward. Database/session records were preserved; owner confirmed the pending result. |
| Creator approval and restricted access | Creator approved; applicant gained participant access. | Main project has an immutable `approved` decision by `yawrd1.testnet`; the production repository query using the existing live applicant session returns role `participant` and non-empty restricted content. Content is not copied into the report. |
| Sign-out and reauthentication | Sign-out removed authenticated access while the selected Meteor wallet remained visible; a new Meteor sign-in restored Approved status and access. | The stored applicant session history includes revoked and active sessions. A selected wallet and a verified server session remain distinct. Owner observed the actual browser transitions. |
| Post-approval persistence | Approved status and access survived the second requested server restart. | The second port-3000-only restart returned HTTP 200. The final read-only query still returns the approved decision and participant access. |
| Separate rejection | Creator rejected on the companion project; applicant saw the final rejection. | Companion has an immutable `rejected` decision by `yawrd1.testnet`; an existing live applicant session receives no restricted content. |
| Project isolation | Main YAW-001 application remained approved after companion rejection. | The same existing applicant session returns `approved`/participant access on `dev-yaw-001` and `rejected`/no restricted access on `dev-yaw-001-rejection`. |

### Final server-side denial evidence

Command: `node scripts/verify-07b-human-acceptance.mjs`.

This new verifier uses **only the restricted runtime connection**, pins the confirmed development endpoint/database, and runs all SQL in **read-only transactions**. It creates no application, decision, challenge or session, and does not sign in, sign out, rotate or recover a token. It leaves both human test records and sessions unchanged.

For authenticated verification, it executes the production `ParticipantRepository.view` SELECT with the session-hash parameter resolved **inside PostgreSQL** from the applicant's already-existing, unrevoked, unexpired session. No hash leaves PostgreSQL. This checks the actual server authorization predicate against the real human application; it is **not an HTTP replay of the owner's browser cookie** and does not mint or simulate a human signature. Meteor UI signing is owner-attested; the final check corroborates stored server evidence and does not independently replay historical signatures or requery historical finalized keys.

Evidence captured at **14:38:11 Asia/Manila on October 29, 2026** (`2026-10-29T06:38:11.284Z`): creator had one verified active session; applicant had three recorded verified sessions, two revoked and one active. These are aggregate counts only, not session identifiers.

| Context | Main `dev-yaw-001` | Companion `dev-yaw-001-rejection` |
| --- | --- | --- |
| Existing live applicant session, production repository SELECT | `approved`, role `participant`, restricted access present | `rejected`, role `public`, `restrictedContent: null` |
| No session, production repository SELECT | No account/application/review list; `restrictedContent: null` | Same denial |
| Anonymous actual GET `/api/yawrd/{id}/state` | HTTP **200**, `restrictedContent: null`; no account/application/review list | Same denial |
| Anonymous actual GET `/yawrd/{id}` | HTTP **200** public page; participant heading and synthetic restricted text absent from full server response/React payload | Same denial |

HTTP 200 is intentional for a readable public page/state; denial means restricted content is absent, rather than blocking the public project. API responses retain `Cache-Control: private, no-store` and `Vary: Cookie`. The authenticated applicant never receives other applicants' review lists. Earlier real-HTTP synthetic-session and live-database negative tests separately cover non-creator review denial, rejected-session denial, expiry/revocation, conflicting decisions, cross-origin denial and immutable audit constraints.

Sanitized machine-readable evidence: `docs/verification/milestone-07b/human-acceptance-server-results.json` (ignored local artifact). It contains public account/project IDs, decision/status booleans, aggregate session counts and HTTP status codes. It contains no connection values, cookies, tokens, hashes, introductions, restricted text or wallet proofs.

### Final regression checks

| Check | Final acceptance result |
| --- | --- |
| `npm test` | **106 passed**, zero failures/skips. |
| `YAWRD_TEST_DATABASE_DEVELOPMENT=1 npm run test:participants:live` | **13 passed**, zero failures/skips; restricted connection used for application/auth operations. New retained synthetic fixture: `dev-07b-1a0661b3c4e6`, separate from human projects. |
| `npm run db:verify:runtime` | **Passed**: 49 table privilege checks, UPDATE column allowlists, role attributes/membership/ownership checks and **22 actual denied operations**, all SQLSTATE 42501 in rollback-only probes. |
| `node scripts/verify-07b-human-acceptance.mjs` | **Passed**: real persisted human decisions, project isolation, live rejected-session denial, anonymous repository/API/SSR denial. All database reads are read-only. |
| `npm run typecheck` | **Passed.** |
| `npm run build` | **Passed**, Next.js 16.4.3/webpack; compilation, TypeScript, page generation and traces completed. Local build only, no deployment. |
| `git diff --check` | **Passed.** |

The existing live suite checks the unchanged migration twice for repeatability; no new migration or schema change was introduced. It writes only additional labeled synthetic test data, without resetting/deleting human records or sessions. The full synthetic HTTP/restart/Chromium runner was **not rerun during final acceptance**, because the owner's server remains available on port 3000; its earlier 14 grouped passing checks and five desktop/mobile browser scenarios remain prior evidence. Fresh final API/SSR checks used the running app without restarting it.

### Scope and remaining qualifications

**All Milestone 07B acceptance criteria are satisfied for the dedicated development/Testnet environment. No outstanding 07B acceptance blocker remains.** The owner-operated two-wallet gate is complete and corroborated by final server checks. This conclusion is bounded to the implemented participant-application scope and the confirmed development branch.

- YAW-001 records remain clearly labeled development-only tests. They establish neither DAO deployment nor funded Project Funds, reward availability, external repository access or public production publication.
- The project concept remains approved; canonical Blueprint v1 remains **draft awaiting formal approval**. No Blueprint migration/edit or draft-detail publication occurred. The existing unconfigured-factory creation gate remains in place. Creation is not authorized before November 1, 2026, and that date alone does not authorize it.
- Existing security limits remain documented: sessions expire after at most one hour; access-key revocation is not rechecked on every request; decisions/applications are immutable with no appeal/reapplication flow; retention, operational quotas and distributed abuse controls require production planning. None is represented as a new production security approval.
- Only the new read-only evidence script and this report were intentionally changed in this final pass. No application code, environment configuration, human test data, human sessions, production data or DAO contract was changed. Build output and additional synthetic integration fixtures are expected verification artifacts.
- No dependencies were installed, no new service was provisioned, no Git push/merge/public deployment occurred, and **Milestone 08 was not started**.
