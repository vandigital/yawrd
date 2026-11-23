## Current reconciliation — hold the functional rerun

The full runner has been statically reconciled against the exact P3.8B artifact
and its P1/P3.2/P3.4/P3.5/P3.6/P3.7 prerequisites. Migration SHA-256 remains
`0aaecec79a4783e41591687b28963269bb1faf192e5ed5f801f0260261d3b4bb`.
No database connection, SQL execution, credential access or application/migration
change was performed. Authentication, provisioning and accepted permission
evidence were not reopened.

**A functional acceptance rerun is not yet justified.** The latest supplied live
result proves the connected-identity check passed and the view assertion failed;
it supplies neither the deparsed definition nor dependencies needed to classify
the mismatch. Run only the catalog query below in the already authenticated owner
psql session on the confirmed Development database, and return its metadata result.
The older write-capable command later in this document remains on hold.

```sql
WITH v AS (
  SELECT to_regclass('yawrd_publication.public_yawrds') AS oid
)
SELECT
  (SELECT relkind FROM pg_catalog.pg_class WHERE oid=v.oid) AS relation_kind,
  pg_catalog.pg_get_viewdef(v.oid, true) AS reconstructed_definition,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'position',a.attnum,'name',a.attname,
      'type',pg_catalog.format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum)
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid=v.oid AND a.attnum>0 AND NOT a.attisdropped
  ),'[]'::jsonb) AS columns,
  COALESCE((
    SELECT jsonb_agg(DISTINCT pg_catalog.pg_describe_object(
      d.refclassid,d.refobjid,d.refobjsubid))
    FROM pg_catalog.pg_rewrite r
    JOIN pg_catalog.pg_depend d
      ON d.classid='pg_catalog.pg_rewrite'::regclass AND d.objid=r.oid
    WHERE r.ev_class=v.oid AND r.rulename='_RETURN'
      AND NOT (d.refclassid='pg_catalog.pg_class'::regclass AND d.refobjid=v.oid)
  ),'[]'::jsonb) AS dependencies
FROM v;
```

This is one read-only SELECT over catalogs: no table data, function invocation
from the application, role checks, view recreation or temporary objects. Expected
relation kind is `v`; columns are exactly `id text`, `creator_account_id text`,
`payload jsonb`, `published_at timestamptz`, in that order. The only source relation
must be `yawrd_publication.publications`, projecting `creation_id`, `founder`,
`payload`, `published_at`. There must be no private evidence/session/configuration
source or unexpected function expression. Dependency listings may include normal
catalog/type dependencies; inspect the definition together with those dependencies.

### Finding and representation inventory

The failing assertion obtains `pg_get_viewdef(...,true)`, collapses whitespace,
then compares it to a hand-written SELECT string. A PostgreSQL reconstruction
need not preserve aliasing, qualification, casts or equivalent expression spelling.
The check is brittle, but **whitespace/newlines alone cannot explain the observed
failure**, because its normalization already collapses them. The live definition
is needed to distinguish an equivalent reconstruction from actual drift. The
assertion is deliberately unchanged until that evidence arrives; its security
requirements have not been relaxed.

Other representation-dependent comparisons were traced as follows:

- Local whole-file SHA-256 is an intentional exact artifact/version pin.
- Function `prosrc` is stored PL/pgSQL body text, not deparsed SQL. The runner's
  whitespace-normalized body comparison, function inventory, definer and owner
  checks are intentional source-contract checks. Normalization is not a general
  semantic-equivalence proof and can also normalize whitespace inside literals.
  No contradictory body evidence was supplied; the earlier live run reached the
  later view assertion. These checks remain unchanged.
- `proconfig` removes spaces from the fixed `search_path` string; the two named
  schemas and their order are meaningful. The view-column array uses ordinal
  position intentionally. Public row key comparison sorts keys; JSON comparisons
  use structural equality, not JSONB key order. Those are not SQL-format assertions.
- Source/configuration digests hash the exact stored canonical text, not JSONB's
  reconstructed serialization. Blueprint canonicalization is the accepted
  `preparationText`; contribution digest uses the exact validated configuration
  text sent to SQL. No digest representation mismatch was found.
- PostgreSQL bigint revisions are returned as JSON numbers by the existing JSON
  readers; the fixture's revisions 1 and 2 are safely representable. Raw revision
  strings from row results are only passed back to bigint parameters.
- Receipt timestamp comparisons compare returned JSON to the same durable receipt;
  they do not assume a particular timezone spelling or invent a timestamp.
- SQLSTATE and fixed exception labels are deliberately exact behavioral contracts;
  error details/parameters remain suppressed.

### Stage-by-stage reconciliation

“Source reconciled” below means offline comparison to the installed artifact and
accepted prerequisites. It does not claim live functional acceptance.

| Stage | Static reconciliation / correction | Evidence status |
| --- | --- | --- |
| Owner authentication, endpoint/database, writer authentication/permissions | Preserve the accepted direct-credential path and nine permission checks plus `42501` denials; no role/provisioning changes. | Verified by supplied live evidence. |
| Publication schemas/tables/columns/constraints | Tickets: 43-character ID PK, Creation FK, required metadata, source/payload byte limits 65536/524288. Publications: Creation PK/FK, unique ticket FK, required founder/payload/evidence/timestamp. Fixture uses all required fields and default timestamps. These catalog details are implicit in subsequent real operations, not all independently attested by the initial body/view check. | Source reconciled; object persistence accepted; detailed runtime behavior unverified. |
| Public view | Four exact columns, only publications as source, no evidence fields. Current deparser-string equality cannot classify the observed mismatch. | Blocked on the single read-only query above; assertion unchanged. |
| Five publication functions | `context(text,text,text)→jsonb`; `issue(text,text,text,jsonb,text,text)→void`; `receipt(text,text,text)→jsonb`; `ticket(text,text,text,text)→jsonb`; `publish(text,text,text,text,jsonb)→jsonb`. All calls match those signatures. Existing inventory/body check does not separately attest argument/result catalog types; no source mismatch was found. | Source reconciled; preceding body check passed in supplied run; behavioral acceptance unverified. |
| Fixture sessions/Creation | Fresh random IDs/accounts, 43-character challenges, SHA-256 session/browser hashes; statement-time expiry arithmetic satisfies 5-minute challenge/1-hour session constraints. One Creation; no existing founder records read/copied for setup. | Source reconciled; live unverified. |
| Deployment/fee setup | Existing typed reserve/prepare/claim/note/finish and fee open/claim/note/complete signatures match. Claim height 1 < transaction height 2 ≤ final height 3 ≤ security review height 10 < payment height 11. Synthetic hashes are 44-character base58-compatible text. Prepared founder/second Steward and two approval votes bind correctly. Recovery changes preserve this normal first-attempt path. | Source reconciled; live unverified. |
| Preparation/contribution/governance setup | Root revision 1 has nullable parent/author and required synthetic generation object; installed guard derives digest. Real approval/save functions bind exact source. Contribution selection and unpaid acknowledgment match the accepted contract; governance is founder-led with matching binding and revision/digests. No inference or successful fake RPC verifier. | Source reconciled; live unverified. |
| Projection/privacy and funding | Selected `review/report` tasks; excluded `observe`; ordered excluded/included dependency labels. SQL and TypeScript use identical title/summary/brief/deliverables, reward/allocation labels and explicit no-money-needed mapping. Funding variant uses the existing intake helper; no generation-attempt row locks that synthetic intake. | Source reconciled; offline fixture checks pass; SQL parity unverified. |
| Failed/unauthorized attempts | `context` authorizes before ticket lookup; expected `P0001` reasons match function order for foreign founder, unknown/revoked session, unknown ticket, wrong consent/proof account. Each rejection rolls back its own savepoint. | Source reconciled; live unverified. |
| Stale Blueprint/contributions/governance | New approvals first fail current-source checks; reviewed new source then fails ticket-source equality despite identical public payload. Contribution changes are private-only; next valid direct governance append increments revision 1→2 because the normal same-source save is idempotent. | Source reconciled; live unverified. |
| Receipt/idempotency/public view | Two valid tickets stay below the 5/minute budget. Same ticket/proof returns original receipt; different ticket gets `P0001 launch_already_published`. Duplicate direct INSERT gets `23505`. Actual view row and public adapter must equal approved payload. | Source reconciled; live unverified. |
| Immutability | BEFORE UPDATE/DELETE triggers call existing `prevent_mutation`, which raises `23514 immutable_record`, including under owner login. This differs intentionally from already accepted restricted-role `42501` permissions. Ticket delete trigger runs before FK enforcement. | Source reconciled; live unverified. |
| Locks/savepoints/visibility | SHARE table locks persist until transaction/savepoint rollback, not merely function return. Each functional case begins before acquiring them and rolls back/releases before the next. All fixture DML is uncommitted on one backend; external readers cannot see it. Timeouts and deadline remain unchanged; no concurrency claim. | Source reconciled; real contention unverified. |
| Rollback/reporting | Corrected distinctions below. Cleanup is SELECT-only after mandatory rollback, over fresh fixture references; no DELETE, COMMIT, trigger disabling or transaction retry is introduced. | Reporting/control-flow verified offline; live fixture removal unverified. |
| Cross-session concurrency; real wallet/isolated-writer application path | Cannot be substituted by owner SQL calls, same-backend queuing or mocks. Separate committed disposable-branch acceptance and genuine wallet/key verification remain separate gates. | Intentionally deferred; Launch remains uncleared. |

### Demonstrated corrections applied together

1. Early contract failure previously set `cleanupVerified=true` when a zero-row
   lookup merely proved that never-created fixtures were absent. It now records
   `fixtureWritesAttempted`, `fixturesCreated`, `fixtureSetupComplete`,
   `fixtureCreationState`, and `fixtureRowsAbsentVerified` separately. Creation
   state distinguishes not started, partial acknowledged setup, complete base
   fixture and an unconfirmed/rejected first write. Cleanup/removal is true only
   after an acknowledged fixture INSERT, outer rollback and confirmed row absence.
2. A functional case previously entered `checks` before its savepoint rollback
   completed. It now enters only after successful rollback and release.
3. `functionalChecksCompleted` lists only the seven functional cases, excluding
   identity/catalog/setup checks. `functionalAcceptanceComplete` requires every
   case, fixture cleanup and no failure. Success has explicit stage `complete`;
   failures retain their original stage. `realFounderLaunchReady` remains false.

No other deterministic fixture, call-signature, JSON/digest, SQLSTATE, retry or
reference-order mismatch was found in the full source preflight. This is not a
claim that unseen installed prerequisites or PostgreSQL runtime behavior passed.
No speculative “fix” to application behavior or the view was made.

### Files and verification

Only the runner, its existing focused test, and this operator procedure changed.
Runner changes are reporting/control-flow corrections; the focused tests cover
early contract failure with no fixture writes, partial acknowledged setup followed
by failure, absent-row versus removed-fixture reporting, unconfirmed outcomes,
and completion gating. They use fake query responses solely to test reporting,
not as database acceptance evidence.

`node --check scripts/check-creation-publication-postgres.mjs` and the focused
`test/creation-publication-postgres-plan.test.mjs` suite pass (**12/12**). Whitespace
checks pass. The migration and all application/UI code remain untouched.

The only justified next connected operation is the read-only catalog query above.
A corrected write-capable operator rerun command is deliberately withheld until
that result distinguishes view reconstruction from drift. No additional audit or
environment troubleshooting is proposed.

---

## Earlier operator procedure (write-capable command currently on hold)


# P3.8B — Operator-run PostgreSQL acceptance

This is a prepared procedure, **not a PostgreSQL acceptance result**. Codex has
not obtained credentials, connected to Neon or executed SQL. The founder will
run the connected command in Rig and return its sanitized JSON result.

The accepted installed boundary and public presentation are unchanged. The
procedure reuses the existing Node/TypeScript loader, Neon `Client`, preparation
fixture, Creation/deployment/fee APIs, Launch reader, publication challenge/receipt
repository and public projection adapter. No dependency, migration, grants,
application code, UI or infrastructure is added or altered.

## Exact commands

Run from the founder's normal interactive Rig terminal. Do not use a Codex terminal,
pipe a password, source an environment file, export credentials, paste a password
into a command, or enable shell tracing. The program asks for the owner password
without echo and keeps it in process memory only. There is no environment,
password-file, shell-inheritance or connection-string-input fallback.

```sh
cd /home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117
node --import ./test/register-contributions.mjs scripts/check-creation-publication-postgres.mjs --plan
```

`--plan` is credential-free, performs no connection and writes no database data.
It validates the local installed-contract artifact and synthetic fixture shape.

In Neon Console, obtain the **direct, non-pooler hostname** for the already
authorized Development endpoint `ep-twilight-voice-aorpfrbm`. Replace only the
non-secret hostname placeholder below, retaining its full regional suffix:

```sh
node --import ./test/register-contributions.mjs scripts/check-creation-publication-postgres.mjs \
  --development-rollback \
  --hostname '<direct hostname for ep-twilight-voice-aorpfrbm from Neon Console>'
```

The only secret prompt is:

```text
Neon Development neondb_owner password (hidden):
```

The script rejects non-interactive stdin. It constructs its own TLS connection
for port 5432, database `neondb`, login `neondb_owner`, and the exact pinned
endpoint prefix; it does not accept arbitrary URI parameters. Before `BEGIN`
or any fixture mutation, it verifies both `current_user` and `session_user` are
`neondb_owner`, and `current_database()` is `neondb`. Hostname provenance comes
from the founder's Console confirmation and TLS connection; SQL does not claim
to independently identify a Neon Console branch. A pooled, other-endpoint,
wrong-role or wrong-database target must stop.

The trusted migration owner must be used because a second login cannot see
uncommitted fixtures. The ADMIN-only membership deliberately cannot SET ROLE
to the writer, and the procedure does not attempt it. The accepted nine effective
permission checks, writer login and two `42501` read denials are not repeated.

The script compares the five installed publication function bodies, definer
owner/search path, public-view definition and columns to the installed local contract before
any fixture INSERT. This is contract verification, not re-provisioning or a broad
privilege audit. The unchanged local migration SHA-256 is:

```text
0aaecec79a4783e41591687b28963269bb1faf192e5ed5f801f0260261d3b4bb
```

## Scope of the positive publication calls

All identities, account labels, sessions, transaction/receipt labels, preparation,
configuration and signatures are generated synthetic fixtures. The procedure
does not read or copy the real Community Tool Library or use the real founder's
account, session, Blueprint or keys. It generates an ephemeral local signing key
and verifies its NEP-413 signature locally; no private key is read or persisted.

Positive publication calls exercise the **installed SQL interface after server
verification**, using explicitly marked synthetic verifier evidence under the
existing trusted owner. They do not call `PublicationRepository.publish()` with a
success-returning fake access-key verifier, perform a wallet action, verify an
on-chain key, or prove a valid real application publication. Challenge creation
and receipt reading use the real repository with this transaction's SQL Query.
The unused access-key verifier fails closed if invoked. No production check,
function, grant or trigger is changed, disabled or replaced for the test.

This is important when interpreting `PASS_SQL_ONLY`: it can substantiate SQL
projection, stale-source rejection, receipt immutability and sequential retry
behavior. It cannot substantiate end-to-end founder wallet/key verification or
writer-login integration with uncommitted fixtures. The previously accepted
writer privileges/login remain accepted evidence, rather than being simulated
through owner membership.

## Every write operation

There is one `BEGIN ISOLATION LEVEL READ COMMITTED`; no COMMIT or cleanup DELETE
exists. The following are the only intended changes, always for the new random
fixture Creation and its new synthetic identities:

| Operation | Transaction-local writes |
| --- | --- |
| Session fixture setup | Two INSERTs each into `yawrd.auth_challenges` and `yawrd.sessions`. |
| Creation setup | `creation_start` inserts one Creation; `creation_save` updates only that new Creation's public configuration. |
| Deployment fixture | Existing `creation_deployment_reserve/prepare/claim/note/finish` routines insert/update the fixture deployment with synthetic evidence. No RPC, deployment or transaction occurs. |
| Fee fixture | Existing `creation_fee_open/claim/note/complete` routines insert/update the fixture fee record using synthetic evidence. No money is sent. |
| Preparation fixture | One synthetic root INSERT into `creation_preparation_versions`; existing `creation_preparation_approve` writes its exact approval. No generation attempt or inference is dispatched. |
| Configuration fixture | Existing `creation_contribution_save` and `creation_governance_save` append the fixture's first reviewed configuration and confirmation. |
| Test review | Existing `publication.issue` inserts a private ticket. |
| SQL publication case | Existing `publication.publish` inserts an uncommitted publication for the synthetic Creation. Ordinary Development readers cannot see it. |
| Stale-source cases | Existing preparation save/approve, contribution save and governance save append new fixture revisions. A direct next governance INSERT exercises the installed append/binding guard against the demonstrated direct-SQL threat; the normal save API treats an identical confirmation as a retry. |
| Funding variant | `creation_save` updates only the fixture intake budget within its savepoint. |
| Revocation case | UPDATE of only the fixture session's `revoked_at`. |
| Rejection probes | Attempted UPDATE/DELETE of fixture tickets/publication and attempted duplicate publication INSERT. Each is enclosed in a savepoint and undone even if it unexpectedly succeeds; an unexpected success fails the run. |
| Teardown | `ROLLBACK TO SAVEPOINT`, `RELEASE SAVEPOINT`, then mandatory outer `ROLLBACK`; no destructive cleanup is used. |

No ordinary participant project/application/task/reward/payment rows are created.
The procedure verifies there is no participant project for its fixture ID.
Synthetic fee/deployment evidence is database fixture data, never a claim of
real settlement or chain deployment.

The script has a 90-second operation budget, 5-second statement timeout,
1.5-second lock timeout, 20-second idle transaction timeout, and a 15-second
budget for each savepoint case. Publication source checks acquire table SHARE
locks; those are released by rolling back each case's savepoint, rather than
retaining them across the entire exercise. Existing source writes may briefly
wait during a case. A timeout fails the run and triggers rollback; it does not
retry or recreate the transaction.

## Checks and required interpretation of returned evidence

| Check | What an actual successful run would prove |
| --- | --- |
| Projection and privacy | SQL context equals the real Launch reader and independently generated approved TypeScript payload, including exact strings/Unicode/newline, two selected tasks, ordered included/excluded dependencies and private-field sentinels. |
| Funding variant | Both explicit no-payout and unresolved funding projections agree between SQL and TypeScript; unresolved allocations remain unset. |
| Stale Blueprint | A new approved revision rejects the old ticket both before and after contribution/governance renewal, including when the public payload is identical. |
| Stale contributions | New private configuration content/digest plus renewed governance rejects the old ticket even though the visible payload is identical. |
| Stale governance | A valid next governance revision rejects the old ticket. |
| Unauthorized/failed calls | Other synthetic founder, invalid session, missing ticket, wrong consent/account evidence and revoked session all leave zero public rows. |
| Receipt/retries | Sequential identical valid SQL calls return the same URL/timestamp/receipt and one publication; another ticket is rejected. This is not a cross-session concurrency result. |
| Immutability | Direct owner UPDATE/DELETE probes against actual fixture receipt/ticket rows hit the installed immutable trigger. This complements, without repeating, the already accepted writer/shared-role permissions. |
| Uniqueness | An attempted duplicate publication INSERT hits PostgreSQL's unique constraint. This supports the cardinality guarantee but does not prove race/lock behavior. |
| Public view | Actual view columns are only ID, creator account, payload and timestamp; actual payload and public adapter equal the approved projection and omit private sentinels. |

Expected SQLSTATEs are collected from actual errors using nested savepoints:

- `P0001`: `creation_not_found`, `sign_in_required`, `launch_challenge_required`,
  `launch_source_changed`, `launch_already_published` at their specified probes.
- `23514`: `immutable_record` for direct owner UPDATE/DELETE of fixture evidence.
- `23505`: duplicate publication primary/unique constraint rejection.
- Previously accepted `42501` role denials are **not newly executed** by this run.

No values above are reported as observed until the founder returns actual output.
The script suppresses raw SQL messages/details, SQL parameters, signatures and
connection diagnostics. On a mismatched rejection it reports only the stage,
expected SQLSTATE and observed SQLSTATE, never the raw database error.

A completed result must include all expected check names and:

```json
{
  "status": "PASS_SQL_ONLY",
  "rollbackVerified": true,
  "cleanupVerified": true,
  "concurrency": "BLOCKED_REQUIRES_ISOLATED_COMMITTED_FIXTURE",
  "realWalletAndWriterIntegration": "NOT_TESTED",
  "realFounderLaunchReady": false,
  "credentials": "suppressed"
}
```

Each case is rolled back before the next. Immediately before outer rollback,
the procedure verifies the base fixture still exists and publication/ticket
counts are zero. It then requires PostgreSQL's `ROLLBACK` acknowledgement and
queries all touched fixture relations for zero remaining rows, including the
public view. No synthetic data is committed or left discoverable.

On `FAIL`, return the sanitized JSON and exit status, and stop. Do not provide
the password, environment, connection URL or a raw PostgreSQL error. If interrupted
or the connection drops, do not infer that rollback was acknowledged: the missing
cleanup evidence remains a blocker, even though disconnect normally aborts an
uncommitted transaction. Do not run manual cleanup or broaden privileges.

## Concurrency and remaining acceptance gates

**Cross-session concurrency is not safely executable on the current Development
branch under these restrictions.** An independent writer connection cannot see
the transaction-local Creation/session/source/ticket records. `Promise.all` on
one backend would only queue statements; it is not acceptable concurrency proof.
No existing real project is used to work around that restriction.

For a later, separately authorized exercise, use one isolated disposable Neon
branch based on Development, confirm its endpoint and a deletion/expiry plan,
and commit only synthetic fixture/source/ticket rows there. Then race two direct
writer-login connections with the same ticket and different tickets, verify one
publication and stable receipts, and race a guarded source append against
publication while observing backend lock waits. This would require a separately
reviewed branch-specific target configuration/procedure; the current runner must
not be repointed by changing its Development endpoint guard. No branch creation,
additional resource, cost, persistent test credential or committed fixture is
authorized or created here.

The real wallet/key check and actual writer/application path also remain outside
the owner-only rollback proof. No success-returning verifier override is proposed.
Until actual PostgreSQL results and the remaining safely isolated acceptance
evidence are returned, P3.8B is **not cleared for actual founder Launch**.

## Evidence available without credentials

The operator procedure's syntax check, credential-free `--plan`, and six new
offline safety tests pass. With the existing publication and role-contract tests,
**37/37 offline tests passed**. They check target pinning, early wrong-role/database
failure, generated fixture privacy/dependencies, exact local contract digest,
secret-safe evidence and explicit concurrency/launch limitations. They provide no
new PostgreSQL acceptance conclusion.

```sh
node --check scripts/check-creation-publication-postgres.mjs
node --import ./test/register-contributions.mjs --test --test-isolation=none \
  test/creation-publication-postgres-plan.test.mjs \
  test/creation-publication.test.ts \
  test/creation-publication-role-membership.test.mjs
```

Files added for this bounded exercise: the operator script, its focused offline
test and this procedure. The migration digest, publication implementation and
accepted UI remain unchanged. No new demonstrated product/security blocker has
been established by a database run here; the missing real results, concurrency
proof and full application integration remain explicit acceptance limits.
