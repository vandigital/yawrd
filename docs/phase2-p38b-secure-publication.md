# P3.8B — Secure generalized publication implementation candidate

Worktree: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD, before and after: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
The task started from the accepted, extensively modified/untracked P3.2–P3.8
working tree. Its contents, rather than HEAD alone, were the baseline. Ten
baseline files were changed for this task; seven files were added, including
this report. No baseline files were deleted. Hash comparison confirms that
all other baseline files, including the shared presentation and deferred
migration proposals, remain unchanged.

The application implementation and unapplied SQL proposal are available for
operator review and a separately authorized Development installation/acceptance
session. **They are not cleared for a real launch.** PostgreSQL execution,
effective-role denials, projection parity and lock/concurrency behavior have
not been tested against a database. No database, environment file, credential
store or wallet material was read. No database installation/mutation, inference,
RPC request, wallet transaction, deployment, commit, push, merge, publication,
Production/Mainnet operation or YAW-003 execution occurred.

## Publication authorization

The existing `direct_sql_limitation` evidence in
`scripts/verify-creation-postgres.mjs:929` demonstrates cross-founder access,
public-text mutation and forged review fields under `yawrd_07b_runtime`.
P3.5–P3.7 records and session records likewise assume a trusted server; their
presence is not independent proof of a human review. Rechecking those records
through another invoker function would preserve the demonstrated defect.
The evidence was inspected, not rerun. No broad security audit was undertaken.

The new boundary adds fresh publication-specific NEP-413 wallet consent and
an isolated, function-only database login in the existing database:

1. Existing origin, session, selected Account, founder, source-integrity and
   readiness checks authorize the private review. The existing Creation guard
   makes its ID and founder identity immutable to the shared runtime.
2. One Launch action requests a short-lived publication challenge for the exact
   approved title/summary and selected planned task projection already displayed
   in the full preview. No second private preparation stage is introduced.
3. The challenge binds the founder, Testnet, origin, Creation ID, consent version,
   expiry, nonce, SHA-256 of the canonical complete `LaunchSource`, and SHA-256
   of the canonical complete public payload. Source includes Blueprint revision
   and digest, contribution revision and digest, governance revision and verified
   deployment/payment binding. Array order and every reviewed string are retained.
4. The browser reconstructs that message from its reviewed view, then requests
   one explicit Meteor message approval. Account/response epochs and wallet
   context checks surround the wallet prompt and final request. The disclosure
   states that this costs no gas and sends no transaction.
5. Node verifies the publication signature using the existing NEP-413 verifier,
   and freshly checks the signing key is FullAccess for the exact founder at
   finalized Testnet state through `https://test.rpc.fastnear.com`. Session key
   evidence and caller-supplied review flags are not used for this check. A sign-in
   signature cannot authorize publication.
6. Only the isolated login can invoke the protected publication functions.
   SQL recomputes the exact current source and allowlisted public projection,
   compares both with the protected challenge, and inserts one immutable receipt.
   The old shared runtime cannot issue/read tickets, invoke the internal helper
   or publication write, or directly read/write private publication tables.

Fresh signed consent is the publication review evidence. Historical approval
flags remain source/readiness inputs and are **not upgraded to cryptographic
proof of their original author**. Forging those flags or a session cannot
produce the current founder's publication signature. Changing a source or public
field after the challenge invalidates publication. Private reads and writes in
the accepted older Creation systems retain their documented shared-SQL limitation;
this change does not claim to repair that broader boundary.

The isolated server verifier is trusted. PostgreSQL does not itself verify
Ed25519: it accepts verified evidence exclusively through its restricted writer
login. Compromise of that login, arbitrary application-server execution or a
database administrator is outside the demonstrated shared-role SQL threat.
The new credential must remain server-only, distinct from the shared runtime,
and inaccessible through SQL role membership. The installation proposal rejects
unsafe effective privileges and role memberships instead of compensating for
them with application checks.

## Persistence, visibility and retries

`yawrd_publication.tickets` holds immutable private challenge/source/payload text;
`yawrd_publication.publications` holds one immutable publication per Creation,
its ticket, signature, consent version, finalized key observation and timestamp.
Primary/unique keys and a short transaction advisory lock arbitrate repeated and
concurrent publication requests. An exact signed retry returns the original
receipt, including after ticket expiry if that ticket already published. Another
ticket cannot create a second record. Key verification and session authorization
still apply to retries. A reload reads the durable receipt and shows its public
link; cancellation, storage failures and rejected writes never report success.

The internal SQL context uses short SHARE locks on the existing session and
source tables for its current-source check. A direct SQL append can bypass older
row-lock conventions, so those conventions alone are insufficient here. Locks
last one SQL request; no transaction spans the wallet prompt or RPC verification.
These locks can briefly delay unrelated source writes. Real PostgreSQL parity,
contention, deadlock/retry and simultaneous-save behavior remain acceptance gates.
There is no background worker or additional database.

Only the SELECT-only `yawrd_publication.public_yawrds` view exposes published
ID, creator account, public payload and timestamp to shared runtime readers.
The public adapter applies a further field allowlist. Public content includes
the approved title/summary, included task titles/briefs/deliverables, public
dependency labels and the already accepted cautious planning labels. It excludes
raw Blueprint JSON, intake, private notes, Skill contents, acceptance evidence,
references, configuration records, session hashes and publication evidence.

`/yawrd/[projectId]` reserves generalized Creation IDs for this protected public
projection; it never falls through to ordinary participant project rows. The
landing discovery reads the same projection. The public route renders the exact
accepted `YawrdIdentityPresentation` component used by founder preview. Its
component, shared shell and styles were not changed. The generalized namespace's
participant, contribution and reward-payout APIs return `participation_closed`.
No ordinary project/application/task/reward/payment records are created.
Genesis and WordWake retain their existing routes and publication paths.

## Unapplied migration and installation requirements

Proposal: `docs/proposals/migrations/phase2_creation_publication.sql`.
It is outside automatic migration discovery and contains no installation command.
It adds one schema, two tables, one explicit budget index, two immutable triggers, five functions
and one public view. No existing table, function, row or grant is altered.
The superseded P3.8A launch-preparation proposal remains **DO NOT INSTALL**.

An authorized operator must:

1. Independently confirm the intended Neon database/endpoint and installed
   accepted Creation/deployment/platform-fee/P3.5/P3.6/P3.7 dependencies.
2. Provision `yawrd_publication_writer` as a separate LOGIN with no memberships,
   superuser, create-role, create-database, replication or bypass-RLS privileges.
   Do not grant it source/auth table access or membership in the shared runtime.
   Do not grant the shared runtime membership in it or the function owner.
3. Review and install the proposal in one operator-controlled transaction as the
   existing trusted table/schema owner. That principal needs schema creation,
   table/view/function/trigger creation, source-table reads/SHARE locks, and grant
   authority. It remains the SECURITY DEFINER owner and must be inaccessible to
   either application login. Functions use a pinned catalog/temp search path and
   fully qualified objects, with no dynamic SQL.
4. Preserve the exact grants: shared runtime gets schema USAGE and public-view
   SELECT only; writer gets schema USAGE and EXECUTE on `issue`, `receipt`,
   `ticket`, `publish` only. Neither gets table DML, private-table SELECT, schema
   CREATE or EXECUTE on internal `context`. Effective inherited/default grants
   are checked by the proposal, including unexpected writer access to source/auth
   tables. An unsafe result must abort the installation transaction.
5. Through the existing server secret/configuration process, configure
   `YAWRD_PUBLICATION_DATABASE_URL` with that dedicated login and
   `YAWRD_PUBLICATION_DATABASE_ENDPOINT` with the separately confirmed endpoint.
   It must match the normal runtime's database and logical host, require TLS,
   and have the exact writer username. No shared/owner-login fallback exists.
   The existing Development endpoint guard still applies to the Launch route.

Before activation, use the existing PostgreSQL acceptance practices with
authorized disposable records. Required concrete probes under the shared login
are SELECT/INSERT/UPDATE/DELETE/TRUNCATE on both private tables, EXECUTE on all
five functions, schema CREATE, trigger changes and SET ROLE to the writer/owner:
all must be denied. Public-view SELECT must succeed, and its writes must be denied.
Under the writer login, source/auth-table access and direct private-table DML
must be denied; only the four granted functions may execute. Verify the expected
permission failures as SQLSTATE `42501`, without putting real founder signatures
or records in test logs.

Then verify SQL/TypeScript projection equality with included/excluded tasks and
dependencies, stale Blueprint/contribution/governance changes during a wallet
review, revoked sessions, immutable evidence, concurrent identical/different
tickets, a source append through direct SQL, and exact receipt recovery.
The installed legacy Creation guard's immutable founder protection is a required
dependency. Do not infer actual privilege/locking acceptance from the offline
models or static SQL checks below. No ready-to-launch claim is made here.

## Verification evidence

Final focused command:

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none \
  test/creation-publication.test.ts test/creation-launch-preparation.test.ts \
  test/creation-preparation.test.ts test/creation-contribution-configuration.test.ts \
  test/creation-governance-configuration.test.ts test/creation-http.test.ts \
  test/creation-deployment.test.ts test/creation-hardening.test.ts \
  test/wallet-session.test.ts test/identity.test.ts test/genesis-publication.test.ts \
  test/public-yawrd.test.ts test/project-experience.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none \
  test/creation-launch-preparation.browser.test.mjs \
  test/creation-governance-configuration.browser.test.mjs
git diff --check
```

Results: **216/216 focused tests passed; TypeScript passed; both browser journeys
passed; tracked whitespace checks passed.** New tests use the existing Node and
Chromium infrastructure. Signature tests generate ephemeral synthetic Ed25519
keys and perform real local cryptography. SQL is an explicitly labelled offline
model/static contract check. Browser API responses and wallet approvals are
synthetic; external requests are blocked. The loopback server needed sandbox
permission, as in the accepted browser harness. The browser covers the unchanged
preview/layout checks plus cancellation, stale publication denial, Account switch
during approval, receipt-only success, reload, and public rendering of the exact
reviewed payload including its selected tasks.

An additional broader run including `test/shared-template-release.test.tsx`
reported **222/223 passed**. Its one failure is the existing assertion that shared
shell source/styles equal Production commit `e246d1094ebff7279dbc68b7b4245b7c08bdb2f4`.
The task baseline already contains accepted P3.8 shell changes. Hash comparison
confirms the shell, its CSS and that test are untouched by P3.8B. The failing test
was preserved. The other six checks in that file passed, including WordWake public
projection and rendering. This is not an all-green release certification.

## Exact files changed relative to the accepted working tree

| File | Change |
| --- | --- |
| `src/creation/publication.ts` | New shared canonical review/message contract and receipt types. |
| `src/creation/publication-database.ts` | New isolated, same-database, endpoint-pinned server connection. |
| `src/creation/publication-repository.ts` | New protected challenge/receipt operations and fresh founder signature/key verification. |
| `src/creation/publication-public.ts` | New allowlisted public route/discovery reader. |
| `src/creation/launch-preparation.ts` | Availability and durable receipt in existing Launch view. |
| `src/creation/launch-preparation-http.ts` | Existing review plus exact payload consent challenge and verified publication request. |
| `src/identity/nep413.ts` | Existing verifier's endpoint changed to canonical FastNEAR Testnet RPC. |
| `app/api/creations/[id]/launch/route.ts` | Inject isolated writer and existing key verifier; retain Development guard. |
| `app/create/[id]/launch/launch-panel.tsx` | One Launch action, wallet consent, Account safeguards and receipt-backed success/reload. |
| `app/yawrd/[projectId]/page.tsx` | Protected generalized route/metadata using accepted presentation; no legacy fallback. |
| `app/api/yawrd/[projectId]/[action]/route.ts` | Keep all generalized participation/contribution/payment actions closed. |
| `app/page.tsx` | Add protected generalized publications to discovery. |
| `docs/proposals/migrations/phase2_creation_publication.sql` | New additive, unapplied publication boundary proposal. |
| `test/creation-publication.test.ts` | New focused cryptographic, role-contract, projection and closed-API tests. |
| `test/creation-launch-preparation.test.ts` | Extend existing review contracts and HTTP publication handoff tests. |
| `test/creation-launch-preparation.browser.test.mjs` | Extend existing offline journey with publication and public-link checks. |
| `docs/phase2-p38b-secure-publication.md` | This implementation/evidence report. |

## Development → Production

Use the same reviewed additive schema after the accepted Creation dependencies,
with independently provisioned Production roles/credentials and independently
confirmed endpoint configuration. Never reuse a Development connection or install
P3.8A. There are no endpoint IDs, founder accounts, project names, automatic seeds
or environment-specific database names in the new SQL. The connection validator
has a publication-specific endpoint pin so it does not require labelling a
Production endpoint as Development.

The current Creation Launch endpoint deliberately retains its accepted
Development-only guard. Enabling it in a Production release requires separate
release authorization after Development database/role/concurrency acceptance and
resolution or explicit disposition of the existing shared-template release gate.
Other accepted Creation release gates still apply. This is not a Mainnet package;
wallet verification and the accepted public presentation remain Testnet-specific.
No new infrastructure, service, worker or orchestration is required.

The remaining real-launch gate is concrete PostgreSQL installation and acceptance
of this isolated boundary, plus its separate server configuration. Existing
offline evidence cannot prove those denials or a durable real launch. Community
Tool Library remains unpublished by this assignment. Stop here; installation,
publication and Production release need separate authorization.
