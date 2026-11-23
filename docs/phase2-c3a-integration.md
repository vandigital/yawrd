# Phase 2 C3A — generic founder setup and configuration review

Baseline: `0068d9e340102fa5e31023efa681b83a2820fd60`.
Branch: `feature/phase2-c3a-founder-setup-20261117`.
Worktree: `/home/vanrig01/yawrd-integration/c3a-founder-setup-20261117`.
HEAD remains the baseline. No staged changes or commits. This is a local review candidate.

The destination and branch were absent before creation. This worktree uses durable shared Git metadata, with no existing checkout files overwritten. The preserved source, backups, C1/C2 checkpoint worktree, original checkout and accepted release were not modified.

## Exact changes

Modified:

- `app/create/creation-journey.tsx`: configuration-review stage; later stages remain unavailable.
- `app/create/creation-welcome.tsx`: account/session-guarded setup navigation and refresh recovery.
- `app/create/intake/intake-client.tsx`: successful Save offers Continue to setup review; editing/restoring invalidates that continuation until another save.
- `package.json`: adds the founder setup tests to the established npm test command; dependencies unchanged.
- `test/creation-intake.browser.test.mjs`: extends the isolated C1/C2 workflow through generic C3A.

Added:

- `src/founder-setup.ts`: complete intake mapping and pure two-Steward configuration validation.
- `app/create/setup/setup-client.tsx`: reads only the verified account's browser intake; missing/incomplete data fails closed.
- `app/create/setup/founder-dashboard.tsx`: private intake summary, separate public-text review, configuration editor, costs, disabled actions.
- `app/create/setup/setup.module.css`: generic responsive founder presentation, derived from preserved C3A styles with later reward/governance styling excluded.
- `test/founder-setup.test.ts`: three model/privacy/constraint tests.
- `docs/phase2-c3a-integration.md`: this report.

Local-only artifacts: untracked node_modules symlink to existing dependencies; ignored .next/, next-env.d.ts and tsconfig.tsbuildinfo. No dependency installation. Evidence resides outside the worktree at `/home/vanrig01/yawrd-integration/c3a-founder-setup-20261117-evidence/`.

## Review behavior and reused dependencies

Save a complete C2 intake, then choose **Continue to setup review**. Refresh recovers the saved account-scoped intake using `?step=setup`. Review intake returns to the original draft. Missing/corrupt/incomplete drafts or another account's absent draft produce recovery guidance without showing the former founder's data. Existing C1/C2 consent and session handling remain in control; background verification preserves the mounted view, while identity mismatch or authorization loss removes it.

The founder can review a separate proposed public name/description, account label, second Testnet Steward, and the supported 2-of-2 threshold. Public description starts blank; private founder wording is never copied into it. Explicit public-text acknowledgment is required before configuration review, and changing that text withdraws acknowledgment. No material is published or assigned a public state. The original confirmed intake is never rewritten by setup.

Configuration edits stay in memory, with this limitation disclosed in the UI. They reset on leaving setup or refreshing; no new storage/schema contract was introduced. The proposed public name initially uses the saved project display name, but remains proposed until explicit review. Empty/duplicate/malformed/unsupported accounts, invalid labels, missing public description and thresholds other than two fail validation. On-chain account existence and address availability are explicitly unverified.

Reused: C2 v1 parsing/validation, accountIntakeStore/loadIntakeDraft, established wallet/session/consent parent, CreationJourney, C3A generic local setup/presentation concepts, and `buildYawrdCreation` for pure input/policy validation. Its internal preview factory sentinel is used solely to satisfy the existing validator; neither its example address nor factory call data is returned to the review UI. There is no configured live factory target in this unit.

The setup import graph contains only the setup components/styles, journey, intake modules and pure src/create-yawrd.ts. It reaches no wallet adapter, CreationPanel, CreationRpc, database repository, provider, Blueprint workspace, WordWake, governance, reward or launch implementation. No new API route exists. All deployment/payment/inference controls are disabled and have no action handler. No factory/RPC checks or database operations occur while reviewing.

Costs are separate: DAO setup/storage deposit (unquoted), network fees (unquoted), unresolved Yawrd platform fee (AI inference costs plus Yawrd's contribution), and future Project Funds. No platform amount, payment verifier, receipt, deployment success or funding readiness is fabricated.

## Verification

Commands ran from the new worktree with only PATH/LANG/TMPDIR retained, plus NEXT_TELEMETRY_DISABLED=1 and CI=1. No environment files or credentials were copied; database/wallet service configuration was absent. Existing dependencies were reused. Final results:

| Command | Result | Evidence |
| --- | --- | --- |
| `npm test` | 261 passed, 0 failed/skipped; includes 3 new founder setup tests | unit.log |
| `npm run build` | Passed, including Next compile, TypeScript, prerender and traces | build.log |
| `npm run typecheck` | Passed | typecheck.log |
| `node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-welcome.browser.test.mjs test/creation-intake.browser.test.mjs test/global-account.browser.test.mjs test/wordwake-join.browser.test.mjs` | 4 passed, 0 failed/skipped | browser-final.log |
| `node --import ./test/register-contributions.mjs --test --test-isolation=none test/shared-template-release.test.tsx test/genesis-publication-postgres-guards.test.mjs` | 23 passed, 0 failed/skipped | public.log |
| `npm run test:contributions` | 194 passed, 0 failed/skipped | contributions.log |
| `npm run test:payout` | 39 passed, 0 failed/skipped | payout.log |
| `git diff --check` and added-file whitespace scan | Passed | final-audit.json |

Browser coverage verifies save→setup, missing/incomplete account data recovery, blank public description, duplicate Steward rejection, explicit public review, review invalidation on edits, exact unchanged intake bytes, reset on refresh, account switching, stable mounted controls on focus checks, disabled deployment/payment/inference controls and no overflow at 320/390/768/1440 pixels. The retained C1/C2 flow also covers validation/export/restore, local storage failures and session-loss recovery. Its request audit allows only session GET and explicitly simulated logout POST; unexpected external requests fail the test.

Accepted Genesis/WordWake rendering, dynamic approved rewards, discovery, auth diagnostics, consent and Join/privacy behavior remain covered by the unchanged public/auth/browser regression tests. Their source/components/styles/API routes and wallet controls are byte-identical to the checkpoint. A full baseline diff confirms only the five existing files listed above changed.

The first browser run hit a quoting error in a newly added test expression. Only its selector quoting was corrected; the final complete browser command passed. Both logs are retained. No application workaround was introduced.

Wallet/session/chain/API transports in browser tests are simulated and external browser requests blocked. The Join test uses a temporary candidate-only Next fixture with synthetic records; its simulated application/decision actions perform zero real writes. No genuine Meteor signing, live database-backed session acceptance, network transaction or physical-device testing was performed.

## Outstanding deployment/payment blockers and stop point

Configuration review is ready for product-owner review. Executable creation still requires approved factory identity/current costs, platform-fee amount/rules and recipient/collection mechanism, payment verification and retry/recovery semantics, durable founder/intake/deployment linkage, and separately authorized live acceptance. Server inference must remain gated behind verified deployment and payment. No economic model has been changed or replaced.

WordWake-specific continuation, saved reviewed packages, C3B/C3C governance, reward plans, treasury/funding and publication remain excluded. No migration, deployment, push, transaction, inference request, database mutation or commit occurred. Stop after local integration and verification; checkpointing requires subsequent review.
