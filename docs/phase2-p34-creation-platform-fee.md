# P3.4 Creation platform fee — founder-accepted and closed

## Closure and product handoff — 2026-11-19

The founder accepted and closed P3.4 after personally completing the real
0.5 Testnet NEAR payment. The Development UI displayed **Verified paid** with
finalized transaction and receipt evidence. This is the founder acceptance
record; no additional payment verification is requested. Historical preparation
notes below describe earlier boundaries and do not supersede this closure.
Blueprint/Skill preparation is not part of P3.4 acceptance.

Product requirements for the next work:

1. Wallet connection, sign-in, renewal and supported disconnection belong in the
   global Account dropdown on every Yawrd page.
2. Authentication preserves the current route. Resume safe interrupted reads;
   never automatically replay a payment, signing request or other mutation.
3. Founder payments should offer one clear Pay action. Internal security
   preparation and reconciliation belong behind the scenes; wallet confirmation
   remains explicit. This is a future UX requirement, not a P3.4 redesign here.
4. Technical security details use progressive disclosure and are not mandatory
   founder workflow.
5. Internal checks do not require repeated user approvals. New wallet
   transactions or a material risk still require appropriate consent.
6. Next product milestone: private Blueprint/Skill preparation, scoped from the
   existing `blueprint-preparation-architecture.md` reference before execution.
   This handoff does not authorize generation, providers or publication.

### Global Account UX correction

The former global fallback connected/disconnected Meteor but delegated sign-in
and renewal to individual routes. Account now reuses the existing NEP-413
challenge, message-signing, verification, session and logout endpoints on every
page. Legacy project controls remain available under collapsed Project access.
A successful verified session change refreshes page access without changing the
route, query or fragment. It resumes safe reads only; no payment, signing action
or other write is replayed. The payment state machine is unchanged.

Changed files for this correction:
- `app/components/account-authentication.tsx` (new global controls)
- `app/components/global-navigation.tsx`
- `app/components/route-account-controls.tsx`
- `app/components/participant-panel.tsx`
- `app/create/creation-welcome.tsx`
- `app/create/[id]/payment/payment-panel.tsx` (session refresh and Account link only)
- `test/creation-intake.browser.test.mjs` (focused auth-only mocked mode)
- `docs/phase2-p34-creation-platform-fee.md` (this existing handoff)

Evidence: the auth-only Chromium test passes connection, expired-session
renewal, failed-proof denial, unchanged route/query/fragment, founder access,
second-Steward denial, sign-out/disconnection and no automatic message or
transaction request. Three targeted server-auth tests pass (sanitized failures,
logout/revocation and read-only session checks). TypeScript and diff checks pass.
All proof/API effects in these tests are mocked; no live authentication,
payment verification, database mutation or wallet transaction was performed.

Commands:

```bash
YAWRD_BROWSER_ACCOUNT_AUTH=1 node --import ./test/register-tsx.mjs --test --test-isolation=none test/creation-intake.browser.test.mjs
node --import ./test/register-tsx.mjs --test --test-isolation=none --test-name-pattern='logout revokes|creation session check|database failures are sanitized' test/participants.test.ts
node_modules/.bin/tsc --noEmit --incremental false
git diff --check
```

## Historical preparation baseline and boundary

Worktree `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch `feature/phase2-private-creation-p2-postgres-20261117`, HEAD
`0ecf38f53436c887895dacb67fe3612cdf4d4ce5`, with accepted uncommitted P3.1–P3.4
work and untracked files preserved. No accepted milestone was reopened.

Read-only inspection of the confirmed Development `ep-twilight-voice-aorpfrbm`,
`neondb`, using the restricted application role confirmed the installed Creation
columns and `creation_founder`, `creation_read`, `creation_deployment_lock`
SECURITY INVOKER definitions. `yawrd.creation_platform_fees` is still absent.
No SQL proposal, grant, fixture write, payment, deployment or wallet signing has
been executed. The installation script below has only been shell syntax-checked.

## Exact proposal artifacts and affected objects

All files remain outside migration discovery:

1. `docs/proposals/migrations/phase2_creation_platform_fees.sql`
2. `docs/proposals/migrations/phase2_creation_platform_fee_grants.sql`
3. `docs/proposals/migrations/phase2_creation_platform_fee_verify.sql`

The first creates **one table** `yawrd.creation_platform_fees`, eight functions:
`creation_fee_guard`, `creation_fee_lock`, `creation_fee_review`,
`creation_fee_read`, `creation_fee_open`, `creation_fee_claim`,
`creation_fee_note`, `creation_fee_complete`; and two triggers on that table:
`guard_creation_fee` and `preserve_creation_fee` (the latter reuses
`yawrd.prevent_mutation`). All functions are SECURITY INVOKER with a fixed
`pg_catalog,yawrd` search path. No existing object is replaced, no existing
Creation/deployment row is updated, and no legacy project is inserted.

The second grants only to `yawrd_07b_runtime`:

- SELECT on the new table.
- INSERT on the nine columns used by `creation_fee_open`:
  `creation_id, founder_account_id, dao_account_id, deployment_transaction,
  deployment_digest, deployment_final_height, request, security_review,
  not_before_height`.
- UPDATE on `state, attempt, claimed_at, claim_height, claim_review,
  consent_version, transaction_hash, evidence`.
- EXECUTE on those eight new functions.

No DELETE, TRUNCATE, DDL, role-management, existing-table or schema-wide grants.
PUBLIC gets no table access or function EXECUTE. Existing P1/P3.2 session,
Creation-lock and deployment-read/lock permissions are reused. This is the same
**trusted server SQL role** boundary as P1/P3.2; browser users never receive SQL
credentials or the power to supply verified evidence to the completion function.
The grants alone do not make an untrusted SQL caller a chain verifier.

The third contains **read-only catalog assertions**: eight invoker functions,
no PUBLIC EXECUTE, required narrow runtime privileges and no binding-update or
delete privilege. Included in the installation transaction, assertion failure
rolls back the new schema and grants together.

## Durable contract

One row per immutable deployed Creation freezes founder, Testnet, DAO, creation
transaction/digest/finalized height, exact Transfer, fee policy, recipient
`yawrd.testnet`, amount `500000000000000000000000` yoctoNEAR (0.5 NEAR), original
security snapshot and intent anchor. It references the existing deployment row,
without editing it or private intake. No new DAO identifier is allocated.

The only transitions are:

```
prepared (attempt 0) -> wallet-requested (attempt 1) -> unknown -> paid
                                                \-------------> paid
```

The fee revision increments on each mutation. Current Creation/deployment and
fee revisions, fresh finalized hardening, explicit consent and native-transfer
preflight are required for an atomic signing claim. Session -> Creation ->
deployment -> fee lock order reuses the accepted functions; the session is
rechecked after waits. Only the winning claim response can reach Meteor.

Original request, intent snapshot and anchor never change. The fresh claim
snapshot, claim height, time and consent remain immutable after attempt 1.
There is **no reset, delete, retirement or retry function**, even after a reported
rejection or observed failure. Unknown or hashless outcomes stay locked.
The first saved transaction hash cannot be replaced. A wrong manually entered
hash therefore needs operator review; always copy the exact hash from Meteor.

Candidate hashes are untrusted and do not reserve a globally unique payment.
As in accepted deployment persistence, a generated **verified transaction hash**
is unique only for `paid` rows; the finalized receipt ID is also unique. Another
founder cannot squat on someone else's public hash by merely reporting it.
Completion uses only `verifyNativeTransfer` output: exact sender/recipient/amount,
transaction **after the durable claim height**, FINAL execution, complete
successful receipt graph and finalized blocks. Only then is `paid` saved.
Idempotent completion of the same evidence and already-paid resume create no
new payment authority. A database timeout after commit is recovered by reading
the same row. Invalid/pending/failed/unknown verifier results never mark paid or
unlock another payment. Unverified failure is not stored as fabricated evidence.

Generation budget stays zero and inference consumption stays false. Funding,
publication and Blueprint/Skill execution remain unconditionally disabled.

## Application integration

- The existing Development-only founder route now supports GET and explicit
  POST `prepare`, `begin`, `report`, `reconcile`, with NEP-413 sessions,
  same-origin mutation checks, exact field allowlists and ownership checks.
  Second Stewards retain only the accepted security route/navigation access.
- `PostgresCreationFeeStore` maps only the new SQL contract. The legacy-project
  fee repository is not repurposed. Availability checks do not create objects.
- Preparing saves/reuses the intent and returns a 60-second cost review. It
  does not submit a transaction. The accepted RPC/runtime preflight checks
  signer FullAccess permission, recipient existence, account storage reserve
  and balance. Native transfer gas costs are read from the reviewed protocol;
  a 2x estimate is balance headroom, not a maximum-fee promise. Meteor presents
  the actual additional network fee for founder approval.
- The prepared Meteor adapter accepts the exact native Transfer variant, using
  native keyless account selection, a one-use canonical permit and synchronous
  connector invocation. It rejects changed recipient, amount or extra actions.
- The final explicit payment click reserves a blank authorization window using
  the accepted helper, then claims the durable attempt. The actual Meteor
  authorization route is invoked only after that claim. No automatic payment.
  Popup blocking consumes no claim and invalidates the local review. A lost
  claim response never reaches the signer. Unknown wallet responses are recorded
  best-effort; the durable claim alone already prevents another session paying.
- Reconciliation persists the returned/manual hash before RPC. It remains
  available for existing attempts even when current governance reads fail or
  wallet activation is off. Paid resume never requests another signature.
- The compact dark UI shows pending, unknown, paid or blocked state, exact fee,
  founder, separate costs, a clear next action and collapsed technical/history
  details. Paid means saved finalized proof, not a browser callback. Project
  preparation is described as the next unavailable milestone, with no execution.

### Activation remains OFF

`YAWRD_ENABLE_CREATION_PLATFORM_FEE_PAYMENT` must equal `1` on the **Development
server** before prepare/claim can mutate fee records or expose the signing flow.
It is not a public/client setting. No environment setting was changed. Installing
SQL does not enable this flag, sign a payment or modify existing Creation data.
This is generalized to eligible saved Creations; it is not hardcoded to the beta
project or its display name. Production routes remain unavailable.

## Credential-safe installation — ONLY after separate approval

Prepared script: `scripts/install-creation-platform-fees-development.sh`.
Review the three SQL files and script before authorizing it. The command is:

```bash
cd /home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117
bash scripts/install-creation-platform-fees-development.sh
```

Do **not** execute it as part of this preparation task. It prints the public
Development target and requires the exact local confirmation
`INSTALL P3.4 DEVELOPMENT`, then asks for the Development owner role name.
`psql -W` asks for the password at a protected local prompt (no echo). Enter it
only there; never paste it into chat or a shell command. No connection URL or
password is printed, stored, written to an env file or passed as an argument.
Inherited password/service/host-address overrides and local password files are
excluded. `psql -X` skips startup commands.

The pinned host is
`ep-twilight-voice-aorpfrbm-pooler.c-2.ap-southeast-1.aws.neon.tech`, database
`neondb`, encrypted connection, owner role separate from `yawrd_07b_runtime`.
The script applies the three files with `ON_ERROR_STOP` in **one transaction**,
with bounded lock/statement/connect timeouts. It neither reads owner env files
nor updates application settings. It does not invoke the general migration or
runtime-configuration scripts. A repeated installation fails safely on existing
objects rather than replacing them.

Expected result: `PASS: P3.4 table, invoker functions and restricted grants
installed. Wallet activation remains separate.` Any error rolls the transaction
back. Return only that sanitized result or error code, not connection secrets.

Required founder authorization:

> I authorize installing the three P3.4 Creation platform-fee SQL artifacts on
> Development endpoint ep-twilight-voice-aorpfrbm / neondb, including only their
> restricted yawrd_07b_runtime grants. This does not authorize wallet activation,
> payment, Production changes or modification of existing Creation/deployment data.

Stop after installation authorization is requested. Later database-backed
acceptance must use synthetic records in a rolled-back transaction before live
payment activation. The present mock tests and SQL inspection are not a claim
that these new functions have executed successfully in PostgreSQL.

## Validation and limitations

Prepared SQL has been reviewed against actual installed types/helpers. It has
**not** been installed, parsed by PostgreSQL, or tested against live data.
Model-store CAS tests are code-level behavior, not PostgreSQL concurrency proof.
The operator installation/catalog checks and subsequent rolled-back function
acceptance remain outstanding at the explicit authorization boundary.

Targeted test commands (run each Node command separately to isolate prototype
mocks in the existing fixtures):

```bash
node --import ./test/register-tsx.mjs --test --test-reporter=spec --test-isolation=none test/creation-hardening.test.ts
node --import ./test/register-tsx.mjs --test --test-reporter=spec --test-isolation=none test/platform-fee.test.ts
node --import ./test/register-tsx.mjs --test --test-reporter=spec --test-isolation=none --test-name-pattern='native platform fee|Meteor authorization|prepared creation|Creation governance' test/wallet-session.test.ts
YAWRD_BROWSER_FEE_REVIEW=1 node --import ./test/register-tsx.mjs --test --test-isolation=none test/creation-intake.browser.test.mjs
node_modules/.bin/tsc --noEmit --incremental false
bash -n scripts/install-creation-platform-fees-development.sh
git diff --check
```

All browser data and wallet results are synthetic, using the existing harness.
Screenshots under `/tmp/yawrd-intake-recovery-evidence/` include
`platform-fee-ready-desktop.png`, `platform-fee-ready-mobile.png`,
`platform-fee-paid-mobile.png`. No actual payment has been performed or verified.

## Files changed for durable preparation

New files:
- `docs/proposals/migrations/phase2_creation_platform_fees.sql`
- `docs/proposals/migrations/phase2_creation_platform_fee_grants.sql`
- `docs/proposals/migrations/phase2_creation_platform_fee_verify.sql`
- `scripts/install-creation-platform-fees-development.sh`
- `src/creation/platform-fee-repository.ts`
- `src/creation/platform-fee-preflight.ts`
- `app/create/[id]/payment/payment-submit.ts`

Accepted P3.4 files extended:
- `src/creation/platform-fee.ts`
- `src/creation/platform-fee-http.ts`
- `app/api/creations/[id]/platform-fee/route.ts`
- `app/create/[id]/payment/payment-panel.tsx`
- `app/wallet-session.ts`
- `app/use-testnet-wallet.ts`
- `test/creation-hardening.test.ts`
- `test/wallet-session.test.ts`
- `test/creation-intake.browser.test.mjs`
- `docs/phase2-p34-creation-platform-fee.md`

Two status-copy corrections: `app/create/setup/founder-dashboard.tsx` no longer
asserts no payment was made when it has not read fee status;
`app/create/[id]/secure/hardening-panel.tsx` directs the founder to separate fee
review and approval rather than asserting payment is permanently unavailable.
All other accepted changes/untracked files were preserved. The corrected P3.2
SQL remains unchanged; SHA-256
`33f6eb35df4728ba71165271be2514352926f00d9c9a6052439206c1df66a4c5`.

## Final preparation results

- Latest fee-only run: 18 tests passed (binding, ownership, CAS, unknown/hash
  recovery, finalized completion, gates, expired consent and duplicate evidence).
- Existing native-transfer foundation: 41 tests/subtests passed separately.
- Prepared Meteor/window subset: 6 tests passed, including exact native fee
  Transfer, rejected altered payloads/app keys and unchanged governance adapter.
- Focused offline Chromium flow passed: unavailable state, keyboard disclosure,
  founder/session isolation, review/consent, popup blocking with zero claims,
  exactly one mocked signature, unknown result, reload, manual reconciliation,
  paid resume and closed downstream execution. Screenshots are synthetic.
- TypeScript, shell syntax and diff checks passed.
- Running Development page HTTP 200; unauthenticated fee API HTTP 401.
- Installer and every SQL proposal remain unexecuted. The only database access
  in this assignment was the initial read-only schema/function inspection.
