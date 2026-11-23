# Production Beta Preparation — R0 · November 23, 2026

R0 is local preparation only. Nothing was activated in Production. The founder's
November 23 conversation clarification governs this report: YAW-001, YAW-002,
P2 (including its documented non-blocking test-runtime exception) and P3.1–P3.8B
are accepted. Community Tool Library was genuinely published in Development with
Meteor NEP-413; public Discover, project-page, incognito access and seven protected
PostgreSQL checks passed. Committed cross-session concurrency was not independently
demonstrated. YAW-003 remains unexecuted. Current Yawrd and New Yawrd remain separate.
Older local milestone reports describing P3.8B as an unexecuted candidate are
historical implementation evidence, not a reversal of that acceptance.

## Actual source boundaries

| Source inspected | Observed state |
| --- | --- |
| Initial workspace `/home/vanrig01/projects/yawrd` | `preservation/pre-p0b-local-work-2026-11-02`, HEAD `5e029d0770bf83fcbe177adcaec7a9af000601ad`; five tracked changes and 12 untracked status entries. Not the current integration source. Left untouched. |
| Integration `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117` | Branch `feature/phase2-private-creation-p2-postgres-20261117`, HEAD `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`; before R0, 33 tracked modified files and 133 individual untracked files. The full working tree, including accepted P3.1–P3.8B uncommitted/untracked files, is the baseline. |
| Available release checkout `/home/vanrig01/yawrd-release-candidates/wordwake-public-20261116` | Clean `release/wordwake-public-rc-20261116`, HEAD `7e68e0ae5b60811cbb38723d00f67fc93a5c5835`. Useful release source; no evidence establishes it as the exact current deployed revision. |
| Local refs | Local `main` is `4d0d4198fa3e4486a5e5ff9fb9cc30d814481358`; cached `origin/main` is `7e68e0a`. Neither is deployment provenance. No fetch, branch movement or merge performed. |
| Live Production | Read-only HTTPS GETs of `https://yawrd.keelbase.io/` and `/create` succeeded. Public layout chunk: `/_next/static/chunks/app/layout-3f8ba80b8ba21606.js`; Creation chunk: `/_next/static/chunks/app/create/page-ff4a69c08c00a5b9.js`. No commit identity was exposed in the retrieved HTML. Exact deployed commit/source archive remains unverified; obtain its release/build provenance before composing a Production candidate. |

Production shows both Genesis and WordWake in Discover; Genesis is completed with
applications closed, WordWake has Join applications open and tasks inactive.
Production `/create` remains the older three-step preview-only builder. The live
Account dropdown includes wallet connection, provisional terms, Testnet account
selection and disconnect behavior in its public HTML/bundle. It explains that
connection alone does not sign in. This is observed deployed behavior, not an
assumption based on a historical hash. A fresh disconnected Chromium session verified the Account dropdown opens and
Escape dismisses it at 1440 pixels on the homepage and 390 pixels on `/create`;
only same-site GETs were allowed. Authenticated wallet/profile state was not
exercised because R0 does not authorize wallet operations.

Integration replaces the old fallback with `account-authentication.tsx`: shared
session display, explicit sign-in/renew, account mismatch handling, sign-out and
disconnect, plus route-owned Project access. Its wallet/session code also contains
newer prepared authorization behavior. These changes are outside the card patch.
Keep the actual Production dropdown/profile behavior when composing a later
release; do not wholesale replace either navigation/session implementation.

There is no Discover source conflict: the two card files are unchanged in the
integration baseline and match the available release source. `app/page.tsx` already
has accepted generalized-publication reads; R0 adds lifecycle metadata to those
existing mappings without replacing them. The shared shell differs intentionally
from historical Production and needs a separate release-test disposition.

## Bounded local changes

- `app/components/discovery-carousel.tsx`: one shared card for all project types;
  sort a copy by explicit actionable, planned, completed lifecycle, retaining stable
  order within each group. Unknown lifecycle defaults to planned. Existing route
  IDs, CTA, focus behavior, carousel controls and empty-state behavior remain.
- `app/components/discovery-carousel.module.css`: compact equal-height cards,
  uniform 56-pixel banners, two-line status/title/summary clamping, bounded widths,
  word wrapping, contained horizontal scrolling and consistent CTA placement.
- Existing `BuoyMark` SVG replaces only the black-backed raster card fallback.
  Genesis retains its existing artwork, cropped into the same thin banner. No
  brand assets, project templates or project-page presentation were edited.
- `app/page.tsx`: WordWake is actionable because Join is open, generalized published
  Creations are planned because participation is closed, Genesis is completed.
  Existing database eligibility and publication readers remain intact. There is
  no hardcoded Development publication, founder record or public payload.
- `app/docs/page.tsx` and `app/docs/layout.tsx`: update the existing `/docs` route,
  existing anchors/sidebar label and Creation walkthrough. Explain private saving,
  deployment, two-Steward security approval, separate platform fee, Blueprint
  review/approval, contribution/work-review configuration, full preview, fresh
  NEP-413 publication consent, durable receipt, public page and Discover. Explain
  costs and that publication does not activate generalized participation. Invited
  founder/allowlist statements remain pending founder approval.
- This report. No other accepted file or deferred migration proposal changed.

## Read-only identity and access assessment

`src/participants/auth.ts` verifies the sign-in NEP-413 proof and finalized FullAccess
key, consumes a challenge and mints a one-hour opaque session. Only its hash is
stored. Cookies are HttpOnly, Secure and SameSite=Strict. `src/participants/http.ts`
retains exact origin/Host checks, mutation Origin checks, bounded JSON and no-store
responses. Wallet connection, provisional terms and browser-selected account are
not authorization. `x-yawrd-account` is a mismatch guard against the verified
server identity, not a trusted source of identity.

`src/creation/http.ts` derives the Testnet account from the live, unrevoked,
unexpired cookie session before owner-scoped list/read/create/update operations.
Creation repositories recheck session/ownership atomically. Other Creation APIs
repeat founder/session bindings; security approval deliberately permits the saved
second Steward without disclosing founder intake. There is no general approved
founder allowlist in this source.

Current transaction/service gates are narrower than admission:

- Legacy `creationSubmissionAuthorized` is false. Saved deployment uses the exact
  Development-only founder/Creation/request/prepared-digest/attempt authorization
  in `src/testnet-factory-settings.ts` and `src/creation/deployment.ts`, including
  environment and database endpoint pinning. It is not a generalized beta policy.
- Platform fee is pinned to 0.5 Testnet NEAR to `yawrd.testnet` under
  `testnet-platform-fee-v1`, with finalized native-transfer verification and
  no arbitrary amount/recipient override. The route is Development-only and its
  payment gate is `YAWRD_ENABLE_CREATION_PLATFORM_FEE_PAYMENT`.
- Generation is Development-only under `YAWRD_ENABLE_CREATION_PREPARATION`;
  premium and recovery retain specific accepted bindings and finite-attempt
  authorization. Do not open those globally as a side effect of admission.
- Launch remains explicitly `NODE_ENV === 'development'` and calls the
  Development database guard. It separately requires current source, ownership,
  fresh exact-payload NEP-413 consent and the isolated publication writer.

Smallest recommended platform gate, **not implemented**: one reusable server-only
membership check against an explicitly approved set of `(network, account_id)`
identities from the verified cookie session. Reuse existing account validation;
fail closed on absent/invalid configuration and on nonmembers. A small reviewed
server configuration fits the current stack and needs no new table/service.
Apply the check to every founder-only Creation read/write path, including list,
resume, intake/configuration, deployment preparation/claim/recovery, fee,
preparation/generation/recovery, contribution/governance configuration and Launch
challenge/publication. Recheck at sensitive claims, retain repository owner/CAS
checks and publication cryptography. Never authorize from request JSON, URL,
header, local storage, wallet connection or a hidden button.

Do not gate public Discover/project reads or alter Genesis/WordWake participant
APIs through that founder gate. Preserve an explicit, narrowly scoped second-Steward
security approval path; deciding whether second Stewards need admission is a founder
policy question. Founder must approve the initial identities/network, deny/revocation
behavior for existing drafts and pending receipts, second-Steward exception, service
budgets and external-founder security disposition. No account list or policy has
been selected by R0.

## Factory permission boundary

Read-only finalized Testnet RPC at block `278949408`, hash
`DDo7G6JLkqJHB7eP6CidLcSm3onobgY7hjiVAUoY84Q2`, returned:

- Factory `factory.yawrd.testnet` deployed code hash
  `4mU84bSMfnJ8d7eEvf1jTwXTn5opVE4HGBWpxz9AB65d` (SHA-256 hex
  `37f74875d2c0af4dee973413bc6dbb7efea6d7507199c97f256c01f8c5ee31a0`).
- `get_owner`: `factory.yawrd.testnet`.
- `get_default_code_hash`: `7mSUs75fYMFsUmjXGFLMy7b2LQ7gA1ojW3woSoAUQmzt`.

These code identities exactly match the accepted integration settings. The deployed
WASM exports `create`, ownership/default-code administration and upgrade methods;
its metadata identifies Sputnik factory 0.2.1. The pinned public
[factory source](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao-factory2/src/lib.rs)
reviewed by the existing compatibility documentation exposes payable `create`
without an owner/allowlist check; owner checks protect administration and the
factory-owner/DAO restriction protects upgrades. No signed create was attempted.
R0 verifies deployed hashes/views, but does not independently reproduce that
source build. Treat permissionless payable creation as the applicable model;
there is no verified on-chain founder allowlist to rely on. Do not describe
factory ownership as a creation allowlist.

A Yawrd server allowlist controls platform APIs and supported UI. It cannot prevent
a direct wallet call to payable factory `create`, impose the platform fee on that
external call, or grant platform membership/publication. Strong on-chain admission
would require a separately approved contract/design change, excluded from R0.
Factory-default mutation during wallet review remains the accepted preflight versus
execution race; finalized receipt/state checks must remain, and any default/code
mismatch must block continuation.

## External founders and material security/concurrency dispositions

The existing `direct_sql_limitation` probe in
`scripts/verify-creation-postgres.mjs:929` explicitly demonstrates cross-founder
SELECT, mutation and forged public-text review fields under `yawrd_07b_runtime`.
That role is trusted server infrastructure, not a role handed to wallet users.
Ordinary founder API ownership checks exist; this evidence is not proof that an
ordinary connected founder can issue SQL. Nevertheless, a shared-role SQL escape
or compromised trusted server can cross private founder boundaries. An application
allowlist does not remove this exposure. **External-founder access remains a
release blocker until a separately approved isolation remedy or an explicit,
scoped founder acceptance of that risk.** Development acceptance does not imply
such acceptance for external founders.

P3.8B's dedicated writer and fresh wallet consent protect publication against the
older shared-role forgery scenario. They do not repair private Creation/session
SQL isolation or establish historical human approval authorship. The verifier,
writer credential and application server remain trusted. Preserve writer/owner
role separation, effective membership denials, exact signed payload/source binding,
finalized key verification and immutable evidence; do not substitute UI consent.

The seven accepted protected PostgreSQL checks are not rerun. Atomic uniqueness,
source locking and retry behavior exist in source and offline coverage; they do
not replace committed races from independently connected sessions. Cross-session
same/different-ticket publication, concurrent source edits, lock waits/deadlock
handling and durable retry outcomes need a separate authorized acceptance plan or
an explicit release disposition. Unknown deployment/payment/generation outcomes
retain their one-attempt and recovery rules; admission must not enable blind retries.
No broad security audit or adjacent-system refactor was performed.

## Production release dependencies and founder decisions

| Dependency | R0 disposition / next decision |
| --- | --- |
| Exact Production source and wallet/profile dropdown | Obtain actual deployed build/commit/archive provenance and reconcile newer integration behavior into a reviewed candidate. Preserve Production functionality; no wholesale historical checkout replacement. No card conflict found. |
| Production schema and publication writer | No Production database inspected or changed. Independently confirm accepted P2–P3.8B dependencies and Production endpoint; provision separate function-only writer/owner/runtime privileges and server-only configuration. Use only schema, never Development rows or Community Tool Library data. P3.8A proposal remains superseded; do not install it. |
| Launch environment guard | Separate reviewed release change required; current route returns 404 outside Development and uses the Development database guard. No guard or configuration changed. Deployment, fee and generation have additional gates. |
| Founder allowlist and security | Approve membership/revocation/Steward/service-budget rules and external-founder isolation/risk disposition before implementation or external admission. Platform allowlisting is not factory enforcement. |
| Shared-template snapshot | Existing suite has 6/7 passing; one historical byte-comparison fails on accepted shared shell changes against `e246d109`. Approve a reconciled source baseline and update the snapshot in a separate reviewed change; do not revert accepted UI or silently bless the failure. |
| YAW-003 | Unexecuted, unaccepted; separate scope, founder authorization and prerequisites. R0 performs no YAW-003 actions. |
| Concurrency | Committed cross-session proof remains unestablished. Decide required isolated acceptance and release criteria; no inference from the seven checks or offline tests. |
| Production activation | Separate founder release approval after the above; no activation claimed. |

## Verification and preservation

- 78/78 focused offline tests passed: `public-yawrd`, `project-experience`,
  `wallet-session`, `identity`, `creation-publication`, `creation-http`.
- TypeScript `tsc --noEmit --incremental false` passed in the complete isolated
  source copy. Initial incomplete-copy errors were resolved by including the
  existing `contracts/` and script type dependencies; no source fix was needed.
- Chromium responsive checks at 320, 390, 768 and 1440 pixels passed using the
  actual shared component/CSS and landing global CSS with local synthetic data.
  Equal heights, 56-pixel banners, long/unbroken text, no page/card overflow,
  all three route types/order, Previous/Next and Home/End focus were checked.
  Two widths were visually inspected. External traffic was blocked; no live
  database, wallet, provider or Development publication records were used.
- Existing shared-template release suite: 6 passed, 1 known historical baseline
  assertion failed, preserved. Its result is not an all-green release claim.
- Production disconnected Account dropdown opened and dismissed with Escape on
  desktop/mobile in Chromium; no wallet actions. Evidence:
  `/tmp/yawrd-r0-production-browser.json` and Production desktop/mobile screenshots.
- Production public HTML/navigation JS and Testnet factory code/views were read
  without authentication. Authenticated profile behavior, actual Production
  source identity, database state and committed concurrency remain unverified.
- Evidence: `/tmp/yawrd-r0-focused.tap`, `/tmp/yawrd-r0-typecheck.log`,
  `/tmp/yawrd-r0-browser.tap`, `/tmp/yawrd-r0-browser-metrics.json`,
  `/tmp/yawrd-r0-cards-{320,390,768,1440}.png`,
  `/tmp/yawrd-r0-shared-template.tap`. The disposable browser test lives in the
  isolated source copy; it is not added to the integration test suite.
- Baseline file hashes were captured before edits; only the five named application
  files and this new report are intended for the integration tree. Initial
  workspace, navigation/wallet code, templates, migration proposals and unrelated
  modified/untracked files are preserved. No dependencies installed, secrets read,
  database tests/mutations, inference, wallet actions, contract edits, commits,
  pushes, merges, deployments or Production activation occurred. Stop after R0.
