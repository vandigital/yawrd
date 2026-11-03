# YAW-001 Activation Unit 1 — Genesis draft linking

November 3, 2026 (Asia/Manila). Implemented locally against accepted baseline
`4d0d4198fa3e4486a5e5ff9fb9cc30d814481358` in
`/tmp/yawrd-yaw001-activation-assessment-20261103`. HEAD and a clean source tree
were confirmed before implementation. The preservation checkout was not changed.

## Implemented locally

- `src/genesis/yaw-001.ts`: frozen canonical identity, selected public description
  and scope, repository, Blueprint references and accepted transaction evidence;
  exact stored-project comparison and draft response types. The evidence is
  owner-supplied, not a new blockchain audit or cryptographic approval assertion.
- `src/participants/repository.ts`: `linkGenesis()` and `genesisStatus()` reuse
  parameterized queries and the existing live-session predicate. Project field
  projection is shared with the existing published-project reader.
- `src/participants/http.ts`: the established participant route now handles
  `GET /api/yawrd/yaw-001/genesis-draft` for status and `POST` at the same URL with
  exactly `{}` for linking. No new route file or general-purpose dispatch system.
  Other project IDs, query parameters and additional body fields are rejected.
- `docs/proposals/migrations/003_genesis_draft_linking.sql`: inactive draft only.
  Active migrations contain only `001_participants.sql`. Deferred Blueprint work
  reserves `002` in the preserved checkout; that proposal remains untouched.
- `scripts/configure-development-runtime.mjs`: explicitly opted-in column INSERT
  grant preparation; no project UPDATE, publication or timestamp INSERT grant.
- `scripts/verify-runtime.mjs`: prepared project INSERT/UPDATE column checks,
  opt-in-aware verification and a denied published-project INSERT probe.
- `test/genesis-draft.test.ts`: 28 targeted offline tests; added to the existing
  `package.json` test command.
- This report: `docs/genesis/YAW-001_ACTIVATION_UNIT_1.md`.

## Persistence and authorization

The first database statement is an INSERT SELECT deriving the actor from a live,
unrevoked Testnet session, requiring `yawrd1.testnet`. Browser wallet connection,
local storage, purported receipts and approval claims confer no authority.
`published_at` is omitted and retains its existing NULL default. No project UPDATE
or external transport occurs in this path.

`ON CONFLICT DO NOTHING` covers both the existing `(network, id)` primary key and
the proposed `(network, dao_account_id)` unique constraint. A separate authorized
read can observe a concurrent winner after the insert waits. It checks both the
fixed ID and DAO: alternate-ID associations, differing creator/DAO/public fields,
multiple matching records, or a published record return sanitized HTTP 409.
Identical retries return the original stored values and creation timestamp.

Status is available only to the same creator. Its project JOIN is itself gated
by that account; unauthorized sessions cannot fetch unpublished project fields.
Absent/invalid sessions receive 401, other valid accounts 403, and storage errors
the existing sanitized 503. Missing cookie and forged request fields fail before
database access. Normal project/state readers retain their publication checks.
`dev-yaw-001` fixtures are neither converted nor associated with the Genesis DAO.

## Schema and runtime preparation — not applied

The inactive draft adds a nullable DAO account column with the established NEAR
account syntax and length checks, plus network/DAO uniqueness. Existing NULL
associations are retained and may coexist. Replacing `protect_creator()` retains
network/ID/creator guards and additionally rejects every DAO reassignment,
including transitions involving NULL. The existing trigger is reused. Migration
001 is unchanged; no tables, Blueprint registry or publication mechanism are added.

The configuration command remains SELECT-only for projects by default. A later,
separately authorized operator invocation may opt in with
`YAWRD_ENABLE_GENESIS_DRAFT_LINKING=1`, after the reviewed migration is applied.
Only network, ID, creator, DAO, name, description, objectives, participation and
rewards receive INSERT permission. Explicit column revocation clears a prior
opt-in on subsequent configuration. `published_at`, `created_at` and every project
UPDATE remain denied. Configuration and verification commands were not executed.

The flag controls operator grant preparation and verification, not an HTTP feature
toggle. Without the schema/grants the draft endpoint fails closed with sanitized
503. Deploying the endpoint or enabling these permissions requires later approval.

## Tested offline

Executed with a clean process environment and existing installed dependencies,
temporarily linked into the isolated worktree; no dependencies were installed.

```sh
node --import ./test/register-tsx.mjs --test --test-isolation=none --test-reporter=spec test/genesis-draft.test.ts test/participants.test.ts test/agent-association.test.ts
```

Final result: **82 passed, 0 failed, 0 skipped**: 28 Genesis tests and 54 existing
participant/agent-association tests. Coverage includes session denials, canonical
insertion, immutable retries, conflicts, concurrent mock requests, fixture
separation, field allowlisting, request protections, absence of publication and
factory transports, and static migration/privilege assertions.

Focused strict TypeScript checking of the descriptor, repository, HTTP handler and
new tests passed with ES2022/NodeNext and no emit. Both modified operator scripts
passed `node --check`. `git diff --check` passed. No full repository suite, build,
live acceptance runner, migration or database verifier was run.

The initial targeted run had one overly broad privacy-test assertion matching the
word “applications” in approved participation copy; it now checks serialized field
keys and the private sentinel. An initial standalone typecheck used ES2020 libs,
which lack the existing `Object.hasOwn`; ES2022 checking passed. No unresolved
test failures or local implementation blockers remain.

## Limits and next boundary

Offline mocks do not prove PostgreSQL syntax/execution, uniqueness, NULL behavior,
concurrent locking, trigger enforcement, runtime privileges or durable persistence.
Those properties remain pending separately authorized PostgreSQL verification.

The runtime credential remains trusted by the established architecture: column
grants are not per-human row authorization. The server's session-bound SQL supplies
that boundary. Existing sign-in checks keys at authentication time and sessions
last up to one hour; no fresh key/governance audit is added per operation. If a
session expires or is revoked between a successful insert and its status read,
the response can be 401 while the unpublished insert persists; a fresh authorized
retry reconciles it without mutation.

Only the project DAO association is stored as new database linkage. Factory,
Blueprint and transaction provenance remain version-controlled server descriptor
facts. They do not establish current on-chain state or publication consent.

**Local acceptance criteria met; not deployed or activated.** No database reads or
writes, migration execution, grant changes, wallet/contract actions, publication,
commits, pushes, merges or deployments occurred. The smallest next authorization
is owner review followed by a controlled PostgreSQL test of this draft migration,
column grants, concurrent retries and authorization against an explicitly approved
isolated test target. Genuine Genesis linking and publication require subsequent
separate authorization.
