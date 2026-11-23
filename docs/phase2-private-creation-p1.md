# Phase 2 private Creation persistence — inactive Unit P1

Date: November 17, 2026 (Asia/Manila).
Baseline/parent: `07c1e6333337d3f888f92c3ee2964592b09c5217`.
Branch: `feature/phase2-private-creation-p1-20261117`.
Durable worktree: `/home/vanrig01/yawrd-integration/private-creation-p1-20261117`.

Inactive local implementation; the subsequent source review authorizes only a local
checkpoint. This unit adds no route,
Server Action, UI integration, runtime database import, activation flag, automatic
migration, DAO association, deployment attempt, fee integration or publication.
The source checkpoint and accepted Production reference `7e68e0a` are unchanged.
No real project identity (including the internally named YAW-003) was allocated.

## Exact source changes

- `src/project-identity.ts`: isolated provisional cryptographic ID generator and
  bounded reservation retry; importing/constructing the foundation allocates nothing.
- `src/creation/validation.ts`: C2 validation reuse, strict persistence envelopes,
  storage/text/configuration limits and explicit versioned public-text review input.
- `src/creation/repository.ts`: injectable trusted-server SQL adapter for start/import,
  founder-only read/list, revision-checked intake/configuration updates and public-text review.
- `docs/proposals/migrations/phase2_private_creation_p1.sql`: deferred one-table SQL
  proposal, authenticated functions, revision/identity/review guards, no runtime grants.
- `test/creation-persistence.test.ts`: offline identity, authorization, idempotency,
  recovery, concurrency, validation and isolation tests.
- `package.json`: append the focused test file to the existing test command only.
- `docs/phase2-private-creation-p1.md`: this handoff.

No dependencies changed or were installed. Existing dependencies were reused via
an untracked `node_modules` symlink to the existing project dependency tree.
Ignored build artifacts include `.next/`, `next-env.d.ts` and TypeScript cache.
Logs are `/tmp/yawrd-p1-{focused,unit,contributions,payout,public,build,typecheck}.log`.

## Deferred schema and adapter contract

The proposal is outside `migrations/` and does not match automatic numbered-file
discovery. It requires only the existing participants/session foundation. Historical
migrations and the fee/Blueprint proposals remain untouched.

`yawrd.creation_drafts` contains:

| Field group | Contract |
| --- | --- |
| Identity | Immutable `id` primary key; `network = testnet`; session-derived `founder_account_id`; immutable C2 `source_draft_id`; unique `(network, founder_account_id, source_draft_id)` |
| Private intake | Immutable `initial_intake` and editable `intake`, both C2 v1 JSONB; each retains the source draft ID and has a 512 KiB serialized storage cap |
| Configuration | Separate `public_name` (120 characters), `public_description` (2,000), account label (blank or valid 2–63 characters), second distinct named Testnet Steward (blank or valid, at most 64), fixed threshold 2 |
| Revision | Server-controlled safe-integer `revision`, server creation/update timestamps; content changes increment once; no-op saves retain the revision |
| Public-text review | Database-derived exact-text SHA-256 digest, reviewed revision/digest, consent version and first review timestamp; all review fields clear on content changes |

Initial proposed public fields are blank; private intake is never copied into them.
Partial intakes and historical nameless C2 exports remain valid. Configuration
storage permits blank fields; it does not imply account availability, completeness,
configuration approval, cost review or deployment readiness.

Methods accept the existing cookie's server-computed session hash, never an actor
provided by client JSON. A hash's shape is not authentication: every SQL function
joins/locks a live, unrevoked, unexpired Testnet session and derives its account.
Known SQL workflow errors use the existing `WorkflowError` convention. A future
HTTP boundary must use the existing sanitized `errorResponse` for unknown failures.

1. `start(hash, intake)` validates C2, authenticates and looks up the founder/source
   binding before generating a candidate ID. An identical initial import returns
   the current record, even after subsequent edits; a different import under the
   same founder/source fails with `creation_import_conflict`. Use revision-checked
   updates to edit an existing Creation, not start/import.
2. If absent, start invokes the SQL function with a cryptographic candidate. SQL
   rechecks authorization and uses unique constraints with `ON CONFLICT DO NOTHING`.
   A separate statement observes a concurrent source winner. Only a demonstrated
   ID collision returns no record and permits another candidate, at most five times.
   Timeouts, unknown commits and arbitrary SQL errors propagate without retry.
3. `read` is founder-only; another founder receives the same not-found result as
   an absent ID. `list` returns summaries only, at most 50 records with an opaque
   ID cursor. Ordering is lexicographic ID order, not chronological order.
4. `updateIntake` and `updateConfiguration` lock the founder's row and compare the
   expected revision before any change, including no-op detection. One concurrent
   writer wins; stale writes return `creation_revision_conflict` without overwriting.
   Intake updates cannot replace the source draft ID or immutable original snapshot.
5. `reviewPublicText` requires explicit consent/version and the exact current
   revision/digest. Blank/whitespace-only public text cannot be reviewed. Review is
   idempotent and does not change the content revision. Every content change clears
   review, including whitespace edits, intake changes, Steward changes and edit/revert.
6. On an uncertain start commit, recover with the same original import/source.
   On an uncertain update/review commit, read the same ID before deciding what to do.
   Never create a replacement identity or overwrite a newer revision as recovery.

Original text values, whitespace, Unicode, confirmations and derived C2 fields are
preserved. JSONB does not preserve export indentation/key order. The initial snapshot
is immutable; P1 does not retain an audit history of every intermediate edit/review.
The table blocks deletion so an identity/source binding cannot be forgotten/reused.
Retention and archival operations require a later reviewed policy.

## Security assumptions and activation requirements

- The format `yawrd-` plus 12 lowercase RFC 4648 base32 symbols (`a-z2-7`) is
  provisional. Twelve CSPRNG bytes supply twelve unbiased 5-bit symbols: 60 bits
  of identifier entropy. Persistent uniqueness is mandatory; secrecy is irrelevant
  to access control. Tests reserve IDs only in a synthetic model. Format and live
  allocation still need approval; the generator has no live caller.
- P1 uniqueness is enforced within the private Creation registry. Existing legacy
  IDs remain unchanged. Before future lifecycle integration, verify the shared route
  namespace and atomically carry this exact ID into any deployed project record;
  conflicting legacy/project records must fail rather than receive replacement IDs.
- `Query` and optional test entropy are trusted server dependencies. No HTTP caller
  may select SQL, randomness, database, founder, network, revision outcome or review
  fields. There is no live store singleton or usable client authorization token here.
- Functions are `SECURITY INVOKER`; all new function PUBLIC execution is revoked.
  No role grants or RLS policies are introduced. Invoker functions require underlying
  table privileges and do not defend against a compromised privileged runtime/DB
  owner. Review role/schema/function/table privileges and default grants separately;
  never expose a database login to clients. C2 validation remains a trusted server
  responsibility; SQL checks cover identity, ownership, revisions, review and storage.
- SQL concurrency assumes PostgreSQL READ COMMITTED and normal volatile PL/pgSQL
  statement snapshots. Authorize real multi-connection tests for source/ID races,
  update/review races, session revocation/expiry during waits, transaction rollback,
  uncertain commit recovery, append-only identity and role denial before activation.
  No PostgreSQL test or SQL execution occurred in P1.
- Each intake snapshot is capped at 512 KiB, with existing C2 20,000-character text
  limits. Two snapshots mean up to 1 MiB of intake payload per row, plus configuration,
  metadata, JSONB/index/storage overhead. JavaScript public text limits count UTF-16
  code units and are conservative relative to PostgreSQL character counts. NUL and
  unpaired UTF-16 surrogates are rejected instead of silently altering text.
- Before adding any endpoint: enforce a bounded streaming JSON body (the existing
  participant helper's 8 KiB cap is insufficient), same-origin/cookie safeguards,
  no-store private responses, exact fields, request deadlines, and no sensitive logs.
  Define and atomically enforce per-founder Creation/storage quotas and write/start
  rate limits, including across sessions/workers. Bounded collision retry and list
  pagination do not prevent authenticated storage abuse. No transport or quota policy
  is activated by this foundation.
- No public project, discovery, metadata or publication reader imports these modules.
  The proposal neither references nor writes `yawrd.projects`. No deployment/payment/
  inference/publication permission follows from saving or reviewing a Creation.

## Verification and design clarifications

Commands ran with an empty inherited environment except PATH, LANG and TMPDIR,
plus `NEXT_TELEMETRY_DISABLED=1` and `CI=1`. No environment files or credentials
were copied, and no external database/chain service was called.

| Command | Result |
| --- | --- |
| Focused Node test run for `test/creation-persistence.test.ts` | 32 passed; 0 failed/skipped |
| `npm test` | 334 passed; 0 failed/skipped, including those 32 |
| `npm run test:contributions` | 194 passed; 0 failed/skipped |
| `npm run test:payout` | 39 passed; 0 failed/skipped |
| Existing shared-template and Genesis PostgreSQL guard source tests | 23 passed; 0 failed/skipped; no database connection |
| `npm run build` | Passed, Next.js 16.4.3 webpack compile, TypeScript and page generation |
| `npm run typecheck` | Passed |
| Tracked diff and added-file whitespace checks | Passed |

Focused coverage includes uniform alphabet mapping/default random IDs, bounded
collision recovery, propagation of unknown errors, source idempotency/conflict,
concurrent starts and updates across separate founder sessions, invalid/revoked/
expired/wrong-network sessions, wrong-founder denial, stable identity, original
wording, pagination, no-op/stale saves, uncertain commits, exact public review and
invalidation, validation/storage bounds and deferred/public isolation guards.
The concurrent/commit tests use an atomic behavioral model, not a PostgreSQL engine.
The test digest is a deterministic model token, not a PostgreSQL JSONB hash fixture.
No browser tests were added or run: no UI or HTTP integration changed.

P1 intentionally uses one new table, not the earlier two-table full-lifecycle design:
deployment attempts, finalization and fee association are excluded. It stores only
the current editable revision plus immutable original intake. Review invalidation is
conservative across all content revisions; it does not carry public review forward
after unrelated intake/configuration edits. The persistence envelope rejects unknown
fields, whereas the browser C2 restore parser allowlists/discards them. Public fields
start blank rather than using C3A's local suggested name. These choices affect only
the inactive foundation; the accepted browser experience is unchanged.

No existing worktree files, accepted authentication, public routes, WordWake,
Genesis, factory settings, deployment flow or deferred proposals were modified.
Shared Git metadata contains the requested new branch/worktree and local checkpoint;
preserved worktree files and approved commits are unchanged. No migrations, live
allocation, wallet action, payment, inference, transaction, push, GitHub change,
deployment or Vercel CLI occurred.


## Final source/security review and Mainnet compatibility

Reviewed November 17, 2026 against the actual seven-file manifest and baseline,
including the complete SQL proposal, adapter, validation, generator, tests and
existing project/authentication conventions. No substantive issue blocks an inactive
local checkpoint. This is source-level acceptance, not database or activation approval.

| Review area | Finding |
| --- | --- |
| Founder/identity | Every data operation authenticates in SQL; actor comes from the live session. The trigger freezes public ID, network, founder, source binding, initial intake and creation time. IDs confer no access. |
| Starts/recovery | Unique source binding arbitrates concurrent starts; identical initial imports recover current data, conflicting imports fail. ID reservation retries only demonstrated collisions, at most five times. Unknown outcomes propagate. |
| Updates/review | Row locks and expected revisions protect concurrent writes. Exact database text digest plus revision binds review; content edits clear review. No-op saves and identical reviews retain their original result. |
| Privacy/namespace | Private and proposed-public fields are distinct; no public project writes/imports were added. The proposed ID fits existing project validation and differs from canonical `yaw-001`/`yaw-002`; no live namespace inventory was performed. |
| Privileges/storage | All nine new functions revoke PUBLIC execution. Invoker/table/default privileges remain an activation gate, not a tenant-isolation guarantee against privileged SQL. Individual storage bounds do not enforce aggregate quotas. |

| Future architectural boundary | Compatibility and deferred work |
| --- | --- |
| Shared application, independent DAOs | A common project-keyed relational table and founder checks support many Yawrds. No per-project application, database or infrastructure provisioning exists. DAO binding remains a later verified association. |
| Testnet/Mainnet configuration | Public IDs contain no network, account, factory or display-name material. The immutable network scopes founder/source identity. P1 deliberately accepts only Testnet; coordinated network-aware schema/authentication/adapter evolution is required before Mainnet writes. |
| Relational authorization | Future project-owned tables can reference the stable ID, with `(network,id)` available as a composite reference. Participant membership or Steward status must not automatically grant private Creation access. |
| Vercel/Neon environments | Injected `Query` contains no endpoint, branch, Vercel coupling or database-per-Yawrd assumption. Environment-specific trusted composition can use the existing server adapter. Deployment environment and chain network must be configured independently; Production is not synonymous with Mainnet. |
| Optional GitHub links | No repository, token or credential is embedded in identity/configuration. Later project-linked repository metadata and separately authorized, server-held credentials can be added without changing the Creation ID or founder authorization. |
| Versioned policies | C2 intake and public-text consent are versioned; factory, contract, fee and inference policies are absent. Add immutable version/snapshot references at later consequential transitions. P1 review approves none of those policies. |
| Atomic/auditable recovery | SQL functions provide atomic private mutations, immutable origin and revision-based recovery. Add append-only revision/transition evidence before deployments, payments or inference; P1 does not supply a complete edit/review audit journal. |

Safe evolution requires coordinated changes, rather than simply widening the network
CHECK: keep v1 functions Testnet-scoped, introduce network-aware functions/mappers
and authentication, and revise the named-account constraints for the selected network.
The current mapper hardcodes `testnet` and threshold 2; it must never read newly enabled
unsupported records. Add an explicit configuration/policy version (existing rows are
v1), retain v1 interpretation, and make old entry points reject unsupported versions
before enabling new governance configurations. New normalized Steward/configuration
records can be additive; no existing founder, ID or approved content needs rewriting.

Keep existing Testnet records and network identities unchanged. Mainnet founders must
be authenticated for Mainnet; a matching account string is not a cross-network owner
proof. If one logical Yawrd later spans networks, add network-specific deployment and
authorization associations to its stable identity instead of retagging its immutable
P1 network or allocating replacement public IDs. Specify that relationship before
implementation; P1 itself models a single network-bound Creation.

No Mainnet boundary reviewed here forces destructive data migration or a substantial
rewrite of P1. The required work is constrained schema/API evolution and new lifecycle
tables. A revised ID format must continue accepting existing IDs, not regenerate them.
Uniqueness is local to the canonical database registry, not globally coordinated across
independent Neon environments; future import/finalization must check conflicts against
existing project identities and abort on conflict while preserving both records.

Deferred limits remain material: full PostgreSQL/role/rollback/race verification;
streaming request bounds, deadlines, atomic quotas and rate limits; namespace/format
approval; and retention/erasure rules. The delete/initial-intake guards deliberately
prevent ordinary erasure today. A later retention policy needs an explicitly reviewed
guard/schema change and identity/source tombstones; it must not drop the registry to
remove private payload. Intermediate edits not recorded by P1 cannot be reconstructed
later. Add audit history before any requirement to retain those edits takes effect.

The review reran `npm test` (334, including 32 persistence tests), contribution tests
(194), payout tests (39), public/template/Genesis source guards (23), local build and
typecheck. All passed with the same isolated environment and no live services.
Review logs use `/tmp/yawrd-p1-review-{unit,contributions,payout,public,build,typecheck}.log`.
Only this handoff changed during final review; implementation, SQL and tests were
accepted unchanged. The checkpoint includes exactly the seven source files listed
above, excluding the dependency symlink and generated artifacts. No activation,
Mainnet functionality, route, merge, push or Production change is authorized here.
