# Phase 2 platform fee foundation — inactive for review

Baseline: C3A `cdf7fc79ff6baa39f4e27d3f6491ee0c9b2123c1`.
Branch: `feature/phase2-platform-fee-foundation-20261117`.
Durable worktree: `/home/vanrig01/yawrd-integration/platform-fee-foundation-20261117`.
Original implementation worktree: `/tmp/yawrd-platform-fee-foundation-20261117`.
Accepted Production remains `7e68e0a`; this work does not change it.

This is an unwired server foundation. No route, collection UI, wallet request,
transaction broadcast, inference call, active migration, activation flag, or
backfill is added. Only a local checkpoint is authorized. No new dependencies are required.

## Inspected conventions and reuse

- `src/creation-integration.ts`: `prepareCreation`, pinned Testnet factory settings,
  `CreationRpc.verify`, exact creation action/arguments, finalized receipts,
  factory initialization/callback, deployed code hash, configuration, Project
  Rules and factory registry. Existing reconciliation and wallet flows are unchanged.
- `src/rewards/payout.ts`: causal receipt traversal and verified native transfer
  evidence. The generic verifier follows the same provenance principle while
  requiring a single direct native transfer rather than a DAO reward proposal.
- `src/participants/auth.ts`, `http.ts`, and `repository.ts`: hashed one-hour
  Testnet sessions, expiration/revocation checks, same-origin/cookie protection,
  private responses, parameterized queries, authorization within atomic writes,
  and a separate read to observe concurrent unique-constraint winners.
- `src/participants/database.ts` and `database-config.ts`: lazy injected Neon
  `Query`, connection deadlines and independently confirmed database targets.
  The new adapter takes a `Query`; it never imports the live database singleton.
- `migrations/001_participants.sql`, `003_genesis_draft_linking.sql`, and
  `scripts/migrations.mjs`: existing project identity/session schema, immutable
  DAO associations, and automatic discovery limited to numbered SQL files in
  `migrations/`. C3A browser intake/setup creates no generic server project record.
- Installed Next.js route-handler guide was read. No route or Next.js code changes
  are necessary for this inactive foundation.

## Authenticated binding and evidence flow

A future trusted server caller supplies the existing session cookie's hash, not an
account name from a request body. Every read joins a live Testnet session to the
project founder; every write rechecks this binding in SQL. Cookie parsing, origin
checks, bounded bodies and error sanitization must use the existing HTTP helpers
when a route is separately authorized. These internal service methods are not an
HTTP boundary and must never accept arbitrary SQL, RPC URLs, or settings from clients.

1. An existing server-owned project ID, founder and immutable DAO association
   must be present. This foundation neither invents those records nor adds a new
   project creation workflow. A verified browser session or local intake alone is
   insufficient.
2. `reconcileDeployment` rebuilds the creation request against operator-reviewed
   factory settings, verifies founder and DAO identity, and reuses
   `CreationRpc.verify`. Only confirmed creation can produce an immutable server
   deployment record. Record the creation hash, a finalized chain height observed
   after reconciliation, and an audit digest of the reviewed request/RPC evidence.
   Repeat reconciliation of the same binding preserves the first stored record.
3. `openIntent` requires that deployment record and the live founder session.
   SQL creates one recoverable immutable intent per project, binding network,
   founder, project ID, DAO ID, verified creation hash, amount, recipient and policy
   version. It stores a finalized block anchor at least as high as deployment
   verification. Concurrent/repeated opens retain the original intent and anchor.
   There is deliberately no expiration or automatic intent replacement in v1.
4. A caller can supply only a candidate transaction hash to payment reconciliation.
   The verifier fetches transaction/receipt evidence independently through a
   bounded read-only Testnet RPC adapter. A wallet response/receipt is never input
   evidence. Partial execution is pending; RPC timeout, unknown/pruned transaction,
   or storage uncertainty cannot establish payment or justify resubmission.
5. A verified proof enters `fee_claim`. The database serializes claims for the
   same intent, rechecks session/project/deployment/policy, and atomically inserts
   payment and a held entitlement. Global unique indexes arbitrate cross-project
   claims; a transaction can fund only one Yawrd. No transaction spans RPC calls.
6. If a response is lost after commit, the same authenticated intent/hash retrieves
   the original payment and entitlement before any new RPC. A different hash for
   an already paid intent conflicts. No duplicate entitlement or automatic payment
   retry is issued. If storage itself is unavailable, callers must preserve the
   candidate hash and treat the outcome as unknown.

Policy is fixed in source and proposed database checks:

| Field | Value |
| --- | --- |
| Network | NEAR Testnet only |
| Amount | `500000000000000000000000` yoctoNEAR, exactly 0.5 NEAR |
| Recipient | `yawrd.testnet` |
| Version | `testnet-platform-fee-v1` |
| Collection order | After independently verified creation |
| Entitlement | `verified-payment-held`, generation budget `0`, consumption disabled |

A native transfer has no project memo or application nonce. The linkage is the
founder's authenticated claim against immutable server intent/deployment records,
strict transaction matching, inclusion after the intent's finalized-block anchor,
and the database's global uniqueness rule. It is not an on-chain cryptographic
commitment to an intent ID. Transfers included at/before the anchor are rejected.
The anchor is observed before intent insertion and is not a claim about the exact
wall-clock broadcast time. No legacy transfer import or retroactive fee assignment
is added.

## Transfer verification and trust assumptions

The verifier requires the requested transaction hash, founder signer, fixed
recipient, exactly one `Transfer` action, exact decimal-string amount and no extra
actions. Founder equals recipient is forbidden, regardless of wallet output.
It requires `FINAL`, successful final/root/receipt execution, the direct transfer
receipt rooted in that transaction, matching predecessor/signer/recipient and
recipient executor. It traverses all receipt IDs, rejects duplicate/unrelated/
missing/cyclic evidence, and checks every outcome's successful status. Descendants
may only be successful protocol refunds to the founder; calls or other transfers
fail closed. Inclusion must be after the intent anchor; outcome blocks must be at
or after inclusion and no later than the finalized head.

The read-only production transport already provided by `createTestnetRpc` pins
`https://rpc.testnet.near.org`; a future caller should inject it. The new wrapper
also disallows broadcast methods and limits each RPC call to 20 seconds. Injected
transports are a trusted server dependency. No live chain lookup was made here.

The implementation trusts authenticated server records, approved factory/code
pins, the RPC's chain/finality/transaction/block responses, server time/session
storage, and the database's isolation/uniqueness guarantees. It validates causal
RPC evidence but does not implement a NEAR light client or independently validate
Merkle proofs or transaction signatures. The digest is an audit fingerprint, not
a signature or cryptographic proof of settlement. Retention of full evidence,
archive RPC availability and any stronger provider trust requirements need review
before activation. The recipient's existing account/no-code status is supplied by
the approved policy; a native transfer does not invoke receiver contract code.

NEAR documents `FINAL` as finalizing all receipts including refunds, and supports
`EXPERIMENTAL_tx_status` for receipt details across older/newer node versions:
[transaction RPC reference](https://docs.near.org/api/rpc/transactions).
Block hashes/heights and the final head use the
[block RPC reference](https://docs.near.org/api/rpc/block-chunk).

## Deferred schema and atomicity

`docs/proposals/migrations/phase2_platform_fee_foundation.sql` is a proposal only,
outside the migration discovery directory and numbering pattern. It defines:

- `fee_deployments`: immutable verified creation binding; unique project, DAO and
  creation transaction; references the existing project identity.
- `fee_intents`: immutable fee policy and finalized-block anchor; one per project;
  composite foreign key to verified deployment evidence.
- `fee_payments`: immutable verified transaction/receipt evidence; unique network
  plus transaction, receipt and project, and one payment per intent.
- `fee_entitlements`: one held record per verified payment; fixed zero budget and
  consumption disabled, protected by checks and append-only triggers.
- Evidence views, authenticated deployment/intent/claim functions, session/project
  row locks, and append-only guards. No runtime grants are supplied; new functions'
  default PUBLIC execution is explicitly revoked.

`fee_claim` locks the intent with `FOR UPDATE`; live session and current project
identity are checked under shared row locks. Payment insertion uses unique indexes
and `ON CONFLICT DO NOTHING`. A separate statement observes the winner, rejects
cross-intent reuse/conflicting payment, and inserts the entitlement in the same
function call/transaction. An error rolls the whole statement back. Identical
retries return the original record. This protocol assumes PostgreSQL READ COMMITTED
and ordinary volatile PL/pgSQL statement snapshots; serialization/deadlock errors
at stronger isolation remain unknown until same-hash recovery.

These are invoker functions, with no automatic permissions or production role
changes. A future server writer must be trusted to invoke them only after server
verification. They do not defend against a compromised privileged application or
DB owner. Runtime/client SQL access must not allow callers to forge verifier
arguments or insert evidence directly. Permission design needs explicit review.

## Local verification and limitations

- New platform-fee suite: **41 passing**, including forged receipts, wrong signer,
  recipient/amount/actions, incomplete/unrelated/duplicate/cyclic graphs, refund
  failure, pending results, identity changes, Mainnet rejection, self-payment,
  policy/time binding, timeout, deployment gating, replay and recovery.
- Concurrent tests use a shared rendezvous followed by an atomic behavioral store
  model: same-intent retries produce one entitlement, cross-project transaction
  reuse has one winner, and two transactions cannot both fund one intent.
- SQL adapter test verifies that a verified claim uses one parameterized function
  call. The behavioral model is not a substitute for actual PostgreSQL locking,
  constraints, permissions or crash recovery tests.
- `npm test`: **302 passing** (includes the 41 new tests).
- `npm run test:contributions`: **194 passing**.
- `npm run test:payout`: **39 passing**.
- `npm run typecheck`: passed. No new dependencies installed; existing local
  dependencies were reused with a temporary worktree symlink.
- `npm run build`: passed with Next.js 16.4.3 (webpack), including compilation,
  TypeScript, static page generation and build traces. This is a local Production
  build, not a deployment. Build/test commands used an isolated environment with
  no inherited database credentials or activation flags.
- No database connection, SQL/migration execution, chain RPC, payment, inference,
  browser run, push or deployment was performed.
  Existing WordWake, Genesis, reward and founder setup implementation is unchanged.

## Outstanding activation requirements

1. Review this implementation and the deferred proposal. Confirm the exact target
   development database/schema/role independently, including installed project DAO
   identity guards. Production compatibility is unknown. Separately authorize any
   schema application and permissions; do not promote this proposal automatically.
2. Under separate authorization, execute real PostgreSQL multi-connection tests
   for same-intent and cross-project races, different-hash races, rollback between
   payment/entitlement insertion, uncertain commit recovery, revoked/expired/wrong-
   network sessions, immutable evidence, policy/height checks, and role grants.
3. Approve and implement generic server project/configuration persistence and
   authenticated creation reconciliation. Pin the reviewed Testnet factory and
   DAO code/settings. Review RPC evidence/retention assumptions and test actual
   native-transfer/refund response shapes with separately authorized fixtures.
4. Separately authorize HTTP and founder-facing collection integration with
   existing same-origin/cookie/body/error protections, rate limits and explicit
   disclosure of the 0.5 NEAR fee plus network costs. Persist wallet-attempt and
   candidate-hash recovery before any future wallet request. Hashless, pending or
   unknown attempts must block automatic resubmission; elapsed time is not failure.
   This foundation provides no wallet submission path.
5. Approve finite generation/token/cost budgets, concurrency/consumption rules,
   model/provider selection, and provider-failure/refund/retry policy. Until then,
   no entitlement can be consumed: the function always rejects, database budget is
   zero, and there is no inference/provider integration. A held record must never
   be interpreted as permission for unlimited generation.
6. The review task authorizes this local checkpoint commit only. Obtain separate
   approval for merge, release, any operational Testnet action or migration.
   Mainnet needs its own explicit policy/authorization.


## Checkpoint source/security review — 2026-11-17

The changed-file inventory matches the eight-file implementation handoff. All
implementation, schema and test content was reviewed without code changes. The
only review-stage content changes update this handoff with the durable location,
Production build result and checkpoint authorization. No substantive issue was
found that blocks preservation of this inactive foundation.

The review checked finalized transaction/receipt provenance, exact single native
transfer terms, failure/uncertainty handling, authenticated project/deployment
binding, unique replay keys, same-intent locking, atomic entitlement insertion,
zero budget/disabled consumption, and default PUBLIC function-execution revocation.
The trusted server/RPC/writer assumptions and real PostgreSQL verification gaps
above remain activation gates, not operational approval.

All three test suites were rerun against the reviewed source and reproduced their
reported passing counts. Standalone TypeScript and the Production build passed.
The build introduced no fee route. A source scan confirmed no runtime import of
the foundation and no change to active migrations, existing collection paths,
WordWake, Genesis, C1–C3A or shared application behavior.

SHA-256 manifests and test/build logs accompany the durable worktree in
`/home/vanrig01/yawrd-integration/platform-fee-foundation-review-20261117/`.
File hashes were checked before/after preservation. Protected checkout HEAD,
tracked-diff and status snapshots were also compared. These local review artifacts
are kept outside the commit; only the eight reviewed files belong in it.
