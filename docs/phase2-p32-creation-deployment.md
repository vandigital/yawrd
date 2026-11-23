# P3.2 completion — durable Creation deployment integration

The durable SQL proposal and application integration are implemented. The proposal
has **not** been executed, no permissions have been granted, and
`creationSubmissionAuthorized` remains **false**. This section supersedes the
read-only-only status in the earlier accepted report retained below.

## Baseline and scope

Verified worktree: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`. All P3.1/previous P3.2 changes
and pre-existing untracked verification files were preserved. Neither P2 nor
unrelated worktrees were changed or reverified.

## Implemented operations

[The unapplied proposal](proposals/migrations/phase2_creation_deployment_intents.sql)
adds exactly one private table, `yawrd.creation_deployments`, keyed by Creation ID.
A database unique constraint reserves `(network, factory, 12-character identifier)`.
The identifier is generated on the server, never taken from a name, a client body,
or the earlier browser preview. Database guards prevent changing it or deleting
its row. Existing P1 intake/configuration, revisions and historical account labels
are unchanged. `testtest` is tested as an ordinary display name, never hardcoded
in the application. YAW-003 is not an account identifier.

The existing `CreationRepository` now calls eight proposed trusted-server SQL
functions (including guard/locking helpers), using the existing P1 verified-session
and ownership pattern. Missing schema, missing functions and inactive privileges
produce a controlled `deployment_storage_unavailable` response, with no memory or
browser fallback. The endpoint supports:

- GET: load the founder-owned durable intent, including its identity and recovery
  state, across browser reloads and authenticated sessions. This allocates nothing.
- `prepare`: reserve the identifier, run accepted finalized factory/code/account
  checks, and persist the exact unsigned request, source revision and cost review.
  A reserved identity survives failed preflight or a lost response. Only proven
  database ID collisions cause a bounded allocation retry; ambiguous commits do not.
- `begin`: require the closed server authorization gate, explicit versioned consent,
  a current Creation revision, a current intent revision, a review under five minutes
  old, and fresh network preflight. Atomically persist `wallet-requested` and an
  attempt number before returning the request to the existing Meteor signing adapter.
- `report`: store a wallet reference or mark uncertainty. Client rejection/success
  flags never release the claim or mark a deployment complete.
- `reconcile`: load the frozen server request and use the established server RPC
  verifier for the exact transaction, finalized receipts, factory callback/registry,
  DAO code, configuration and 2-of-2 policy. Persist verified evidence only with a
  fresh ownership/session check and intent CAS after RPC waits.

The initial request can be refreshed before the first signing attempt. Once an
attempt starts, the exact request and its original source revision are immutable.
P1 project edits still save normally; they cannot rewrite an in-flight request.
Reconciliation always uses the frozen request, while another claim refuses changed
public configuration. A finalized failed attempt can be deliberately prepared again
with the **same identifier and exact request**, after account-absence checks. The
new claim's finalized-height floor cannot regress below prior evidence; old failure
hashes cannot unlock a newer unresolved attempt.

An interrupted request or wallet rejection without verifiable transaction evidence
stays unresolved. There is deliberately no client reset, time-based unlock, automatic
resubmission, or silent identifier replacement. Recover its reference from the
wallet and reconcile; a no-reference ambiguity needs explicit operator review.

The accordion now reads server-owned deployment state. Browser intake storage can
be cleared without changing a reserved identity. The submit helper calls the same
Meteor adapter once after the winning durable claim. If the claim response is lost,
it does not sign. Unknown wallet/RPC results remain recoverable from the saved row.
The legacy browser-only deployment panel cannot sign, even under a future activation
of the saved-Creation path, because it cannot acquire a durable claim.

Successful evidence records `deployed-hardening-required`, not a funded or published
project. Funding, publication and platform fees remain disabled, even if a later RPC
read reports `auto_update: false`. Their existing separate checks and authorization
requirements are preserved. No contract, factory, wallet authentication or deployment
infrastructure was replaced.

## Targeted validation

- `node --import ./test/register-tsx.mjs --test --test-isolation=none test/creation-deployment.test.ts test/creation-persistence.test.ts test/creation-integration.test.ts test/founder-setup.test.ts test/creation-http.test.ts test/wallet-session.test.ts`: **98 passed**.
- `node --test --test-isolation=none test/creation-intake.browser.test.mjs`: **passed** using synthetic browser auth, records and RPC responses. Includes P3.1 accordion, input retention, save/resume/conflict/isolation checks, server-owned identity recovery after clearing intake storage, and the closed wallet gate despite a forged enable response.
- `./node_modules/.bin/tsc --noEmit --incremental false`: **passed**.
- `git diff --check`: **passed**.

The SQL-function double exercises the real repository/service/HTTP/submit code;
source assertions check proposal invariants. **These are not PostgreSQL execution
or lock-proof results.** No proposal SQL, grant, migration, live DB read/write, wallet
transaction, deployment, commit, push or release was performed for this completion.
No P2 runner or general test suite was invoked. The earlier build result below
belongs to the prior accepted slice; this completion uses targeted checks only.

## Remaining authorization boundaries

1. Review and explicitly authorize installation of the single-table SQL proposal
   on the confirmed Development target, with separately reviewed restricted runtime
   permissions for its table/functions. No grant statements are included or applied.
2. Authorize the focused Development checks for the new functions: ownership,
   uniqueness, concurrent claim CAS, frozen-request persistence and reconciliation
   commits. These new SQL behaviors have not been executed here.
3. Authorize a bounded founder wallet attempt for the actual saved Creation and
   reviewed public request, selected two Stewards, 1 Testnet NEAR attachment,
   300 Tgas limit, and the wallet's network fees. Only then change the explicit
   server/client submission gate. Installing SQL does not enable signing.

Platform payment (0.5 Testnet NEAR to `yawrd.testnet`), hardening, funding and
publication remain separate; this deployment authorization would enable none of them.

## Files changed in this completion

- `docs/proposals/migrations/phase2_creation_deployment_intents.sql`
- `src/creation/repository.ts`, `deployment-types.ts`, `deployment.ts`, `deployment-http.ts`
- `app/api/creations/[id]/deployment/route.ts`
- `app/create/setup/deployment-review.tsx`, `deployment-submit.ts`, `founder-dashboard.tsx`
- `src/founder-setup.ts`, `src/creation-integration.ts`, `src/testnet-factory-settings.ts`
- `app/components/creation-panel.tsx`
- `test/creation-deployment.test.ts`, `test/creation-intake.browser.test.mjs`
- This report. Previous modified/untracked files remain in place.

---

## Prior accepted read-only slice — historical report

# P3.2 — saved Creation deployment integration

## Implemented boundary

Saved public details and the verified founder feed the accepted `prepareCreation`
builder, `CreationRpc` code/account checks, and exact wallet transaction shape.
Public settings and the cost reference were copied from the owner-identified
`/tmp/yawrd-milestone-10a/src/testnet-factory-settings.ts`. Its
`docs/milestone-10b-localhost.md` records the same factory/DAO hashes, 1 Testnet
NEAR setup deposit, 300 Tgas, and the accepted policy-set ordering correction.
The original checkout's settings remain null. Neither source checkout was edited.
The October 28 05.5B report records the same hashes but predates deployment and
explicitly calls its deposit ceiling unverified; it is not used as a current
deployment authorization or a sufficient-cost estimate.

The setup page generates a uniform cryptographic 12-character `[a-z0-9]`
identifier. Rechecks/reloads in the same browser retain it under the founder and
Creation ID. Corrupt storage and network uncertainty never replace it. It is
clearly a **preview**, not a durable reservation. Proven account collisions block
preparation; they cannot trigger a second wallet request or silent renaming.
The old `accountLabel` field remains unchanged, read-only, and explicitly historical.
The public name is the human-readable project name. Private intake never enters
factory arguments.

The authenticated deployment endpoint accepts only an action, expected revision,
generated identifier, and (for reconciliation) transaction hash. It reads the
Creation through P1 ownership checks, rejects stale-account tabs and extra fields,
and rechecks authorization/revision after RPC waits. It performs no SQL writes.
Server reconciliation fetches transaction/receipt evidence itself, checks the
exact initializer and finalized DAO/factory state with the existing verifier, and
uses the fee foundation's final-block checks. Even matching evidence returns
`verified-unrecorded`, never an active durable deployment. Browser flags and
simulated wallet completion cannot activate anything.

Setup deposit is exactly 1 Testnet NEAR; gas limit is 300 Tgas. The current gas
component is computed from a finalized block's observed gas price and is explicitly
not the full fee, a maximum, or a fresh sufficient-cost guarantee. The future wallet
must show the final fees. The existing policy's 0.5 Testnet NEAR platform fee to
`yawrd.testnet` remains separate and unavailable until verified deployment.

## Demonstrated durable storage blocker — minimum required extension

P1 `creation_drafts` stores intake/configuration/revision/public-text review only.
It has no immutable generated DAO identity, prepared transaction snapshot,
attempt state, transaction reference, or verified deployment evidence. Its guard
restricts existing identity fields. Reusing `account_label`, `source_draft_id`,
intake JSON, or public-review fields would silently change accepted semantics.

The minimum addition is one private deployment-intent relation keyed by Creation
ID (FK), with a unique `(network, factory_account_id, dao_identifier)` reservation:

- Generated identifier constrained to `^[a-z0-9]{12}$`, factory, actual DAO address,
  founder, and immutable source Creation revision.
- Immutable public initializer/Steward policy, reviewed factory/DAO code hashes,
  setup deposit, gas limit, cost-reference snapshot and snapshot digest.
- Revision/CAS-protected attempt state (`prepared`, `wallet-requested`, `unknown`,
  `rejected`, `failed`, `deployed-hardening-required`) and transaction reference.
- Verified final-block/transaction/receipt evidence digest and checked time;
  transaction references unique across intents. No active/public/funding flag.

Extend the existing trusted-server repository/SQL-function pattern: authenticate
the cookie hash and ownership, lock the Creation, check its revision, reserve the
random ID atomically, and allow only one unresolved attempt across all sessions.
Persist the wallet-requested transition **before** calling the existing Meteor
adapter. A session change, timeout, rejected/failed request or ambiguous commit
must never allocate a new identity or automatically resubmit. An unsigned editable
intent may refresh its snapshot only by CAS; after wallet request, freeze it and
reconcile before allowing changes/retry. Explicit rejection or proven finalized
failure can permit a deliberate retry of the same intent after new preflight;
unknown outcomes cannot. Successful reconciliation records only server-verified
evidence against the frozen intent, with a final ownership/CAS check. Keep funding
and publication closed pending independently verified hardening (`auto_update:
false`, exact policy/code/account access), plus the existing later product gates.

This is a concrete storage requirement, not a migration or a new persistence
system. No SQL schema/grants have been changed or applied by P3.2. A reviewed
proposal and explicit owner authorization to install this extension are required
before wiring a durable writable deployment transition. Browser storage is not
a substitute for this cross-session reservation.

## Live authorization boundary

`creationSubmissionAuthorized` is false in the existing public settings module;
the legacy creation panel also respects it. The new saved-Creation page exposes
read-only checks and a disabled wallet action. It does not import a broadcaster or
invoke signing. No environment, browser response, simulated result or request
field can lift this hold. Changing settings alone cannot enable the legacy action.

Before a live attempt: approve/install only the storage extension above, complete
its repository transitions, and give bounded founder authorization for the saved
intent, exact public initializer, 1 NEAR attachment, 300 Tgas limit and wallet fee
review. Reuse the existing Meteor confirmation and reconciliation flow; do not
deploy/reconfigure the factory or collect the platform fee as part of creation.

RPC shape references: [finalized blocks and gas price](https://docs.near.org/api/rpc/block-chunk),
[transaction and receipt status](https://docs.near.org/api/rpc/transactions).

## Verification for this change

Baseline: `feature/phase2-private-creation-p2-postgres-20261117`,
HEAD `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`. Existing P3.1 changes and both
untracked P2 verification files were present and preserved. No P2 verification
was repeated. Original checkout and earlier worktree were read only.

- `node --import ./test/register-tsx.mjs --test --test-isolation=none test/creation-deployment.test.ts test/creation-integration.test.ts test/founder-setup.test.ts test/creation-http.test.ts test/wallet-session.test.ts`: **55 passed**.
- `node --test --test-isolation=none test/creation-intake.browser.test.mjs`: **passed** with synthetic auth/storage/RPC data. Covers generated preview identity/reload, historical-label preservation, collision handling, immutable wallet gate even with a forged enable response, and existing P3.1 accordion/save/resume/conflict/isolation behavior.
- `./node_modules/.bin/tsc --noEmit --incremental false`: **passed**.
- `NEXT_TELEMETRY_DISABLED=1 npm run build`: **passed**, including the authenticated deployment route.
- `git diff --check`: **passed**.

No live draft was read or written for these tests. No fresh chain execution,
wallet rejection, deployed DAO, server-recorded activation, hardening execution,
or live fee settlement is claimed. The read-only RPC path is exercised with
synthetic evidence; prior accepted network evidence supplies the public pins.

P3.2 files: `src/testnet-factory-settings.ts`, `src/creation-integration.ts`,
`src/founder-setup.ts`, `src/creation/dao-identifier.ts`,
`src/creation/deployment.ts`, `src/creation/deployment-http.ts`,
`app/api/creations/[id]/deployment/route.ts`,
`app/components/creation-panel.tsx`, `app/create/setup/founder-dashboard.tsx`,
`app/create/setup/deployment-review.tsx`, `app/create/setup/setup.module.css`,
`test/creation-deployment.test.ts`, `test/creation-intake.browser.test.mjs`,
`package.json` (existing test command), and this report.
