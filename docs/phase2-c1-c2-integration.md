# Phase 2 — C1/C2 controlled local integration

Date: November 17, 2026 (Asia/Manila).

## Result and working state

C1 Creation welcome and C2 generalized browser-local intake are integrated locally against accepted Production `7e68e0ae5b60811cbb38723d00f67fc93a5c5835`.

- Branch: `feature/phase2-c1-c2-browser-intake-20261117`.
- Worktree: `/home/vanrig01/yawrd-integration/c1-c2-20261117`.
- Durable common Git metadata: `/home/vanrig01/projects/yawrd/.git`.
- HEAD remains the exact accepted Production commit. No commits or staged changes; this is a reviewable working tree.
- The destination and branch did not exist before creation. No existing checkout files were overwritten. Only new branch/worktree registration was added to shared repository metadata.
- Preservation inventory and complete Production comparison were read before selection. Files were selectively extracted from the verified isolated restore; no older feature commits were cherry-picked.

## Exact changes

Modified:

- `app/create/page.tsx`: render the C1 welcome instead of the legacy builder; retain accepted page metadata.
- `package.json`: append the two intake unit-test files to the existing npm test command. No dependency changes or installations.

Added:

- `app/create/creation-journey.tsx`
- `app/create/creation-welcome.tsx`
- `app/create/welcome.module.css`
- `app/create/intake/page.tsx`
- `app/create/intake/intake-client.tsx`
- `app/create/intake/intake.module.css`
- `src/creation-intake.ts`
- `src/yawrd-intake.ts`
- `src/yawrd-intake-storage.ts`
- `test/creation-welcome.browser.test.mjs`
- `test/creation-intake.browser.test.mjs`
- `test/creation-intake.test.ts`
- `test/yawrd-intake.test.ts`
- `docs/phase2-c1-c2-integration.md` (this report)

Local artifacts, not source changes: `node_modules` is an untracked symlink to the existing dependency tree, `.next/`, `next-env.d.ts` and TypeScript cache are generated/ignored. Test/build logs, final audit, full patch and change manifest are stored separately in `/home/vanrig01/yawrd-integration/c1-c2-20261117-evidence/`.

## Behavior and dependency boundary

- `/create` offers the reviewed welcome, cost disclosures, provisional consent, explicit Meteor connection and separate NEP-413 message sign-in. An existing verified session can enter intake without a repeated signature, including when no wallet is connected. Wallet/session mismatches hide the draft.
- `/create?step=intake` and `/create/intake` use the same authenticated UI entry. URLs contain navigation only, never intake answers. Session checks coalesce on focus and stale results are invalidated on unmount/sign-out. Background verification keeps the form mounted; failed verification removes private intake.
- Intake reuses the original v1 validation/serialization and explicit classifications. It contains the optional compatible projectName field, six prompts, three sections, exact founder wording, first-outcome confirmation, review, local saving, JSON export/restore and Copy questions with fallback. Editing the outcome withdraws confirmation. Legacy nameless exports remain valid and open at name entry when explicitly restored.
- Storage uses the existing v1 key scoped by verified account: `yawrd.intake-draft.v1:account:<account>`. Legacy unscoped drafts are left untouched. Corrupt drafts are retained while editing until an explicit replacement save/restore. Storage failures never report success, and failed Start-new replacement stays at welcome rather than loading an old draft as a fresh one.
- Save ends at **Saved in this browser. Nothing has been submitted or launched.** It offers no setup/deploy/fund/publish continuation. Later journey stages are noninteractive and labelled unavailable. The UI explicitly discloses that no server project or cross-device recovery exists.

Reused unchanged from accepted Production: TestnetWalletProvider/useTestnetWallet, TestnetWalletSession, TestnetConsent, project button styling, global NavigationShell, identity types, session/challenge/verify/logout endpoints, session origin/cookie protections, auth diagnostics and public components.

Excluded/deferred: SetupClient and all C3–C5 UI/server modules; WordWake continuation endpoint/data types; private Blueprint workspaces, generation/providers/benchmarks/reviewed-package infrastructure; deployment handoff helpers and Blueprint-draft mapper exports from the copied intake module; governance, reward plans/approvals, treasury and launch; migrations 004/007/008/009 and C4B proposals. No new API routes or server persistence were added. Existing accepted legacy builder/integration code remains unchanged and is not exposed by the new welcome/intake flow.

The accepted homepage/discovery, Genesis, public WordWake, dynamic verified reward presentation, Join controls, participant privacy, wallet infrastructure and auth diagnostics are byte-identical to the baseline. There are no changes to their routes, components, models, tests, styles, access controls or configuration.

## Exact verification commands and results

All commands ran from the integration worktree with a clean environment retaining only PATH/LANG/TMPDIR plus NEXT_TELEMETRY_DISABLED=1 and CI=1. No environment files, credentials, database URLs or real wallet configuration were copied. Existing dependencies were reused. No live database or chain operations occurred.

| Command | Result | Evidence |
| --- | --- | --- |
| `node --import ./test/register-tsx.mjs --test --test-isolation=none test/yawrd-intake.test.ts test/creation-intake.test.ts` | **9 passed, 0 failed/skipped** | c1-c2-unit.log |
| `npm test` | **258 passed, 0 failed/skipped**, includes those 9 new tests | npm-test-final.log |
| `npm run test:contributions` | **194 passed, 0 failed/skipped** | production-contributions.log |
| `npm run test:payout` | **39 passed, 0 failed/skipped** | production-payout.log |
| `node --import ./test/register-contributions.mjs --test --test-isolation=none test/shared-template-release.test.tsx test/genesis-publication-postgres-guards.test.mjs` | **23 passed, 0 failed/skipped** | production-public.log |
| `node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-welcome.browser.test.mjs test/creation-intake.browser.test.mjs test/global-account.browser.test.mjs test/wordwake-join.browser.test.mjs` | **4 passed, 0 failed/skipped** | browser-final.log |
| `npm run build` | **Passed**, Next.js 16.4.3 webpack compile, TypeScript, prerender and tracing | build-final.log |
| `npm run typecheck` | **Passed** | typecheck-final.log |

The accepted default tests passed 249/249 before wiring the 9 intake tests into npm test. Final combined unit/regression counts above do not double-count the separate focused run.

Browser coverage uses actual React modules in offline webpack fixtures for welcome/intake/Account, and actual Next components/CSS through the existing temporary Join fixture for public project rendering. Wallet/session/API proofs are synthetic and external browser requests are blocked. It verifies consent defaults and keyboard use, cancelled connection/signature/verification retries, network mismatch, retained sessions, no implicit signing, per-account drafts, original text/whitespace, validation/confirmation withdrawal, local refresh/export/restore, historical nameless v1, forged gates, storage failures, corrupt draft retention, focus refresh, session loss/recovery, responsive review at 320/390/768/1440, existing Genesis/WordWake presentation, snapshot-bound rewards and Join applicant/founder/privacy states. The intake audit contains only session GETs and one explicitly simulated logout POST; no Creation API, generation, database or transaction calls. Join apply/review operations are also simulated, with zero real writes.

The initial combined browser run had 3 passes and one test-selector failure: it inspected the first alert rather than the session-error alert on the welcome page. The selector was corrected to inspect all alerts, and both the focused intake rerun and final combined browser run passed. Original failure evidence is retained in browser.log; no application workaround was introduced for it.

A separate final-build HTTP smoke ran `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4328` in the same clean environment: **10/10 checks passed**. `/create`, `/create/intake` and `/` return 200; all five excluded `/api/create/*` routes return 404; unpublished/unconfigured public WordWake returns 404 in this no-data fixture. `/api/auth/session` returns the expected 503 because no accepted HTTPS origin is configured; this confirms the origin safeguard remains closed, not a verified live sign-in. See http-smoke.json and http-smoke.py. The local server was stopped afterward.

Whitespace, full baseline-file comparison, source/backup preservation hashes, and worktree state were checked separately; see final-audit.json. The final change patch includes tracked modifications and added files without staging them. The 600 preserved source hashes/status and all backup checksums remain unchanged. Accepted release HEAD and tracked contents remain unchanged.

## Limits, decisions and stop point

No dependency blocker remains for this bounded C1/C2 unit. No unresolved failing check remains. Real Meteor signing, genuine server session-cookie round trips, live database-backed public rendering, deployed origin behavior and physical-device testing were not performed; those require separately authorized human/environment acceptance. Browser-local account separation is UI isolation, not encrypted storage or server authorization.

Product-owner review can assess this bounded welcome/intake experience and its truthful unavailable stages. Generalized server persistence, WordWake continuation, setup, Blueprint generation, deployment, funding and launch remain deferred to separately scoped work. Any rollout, migration, merge, push or deployment requires separate authorization. No fee amount or later-stage product decision is inferred here.

The preserved source/backup, accepted release and original development checkout were not modified. No dependencies were installed; no schema/data changes, real wallet transactions, external source uploads, Git commits/merges/pushes or Production changes occurred. Work stops after local C1/C2 integration and verification.
