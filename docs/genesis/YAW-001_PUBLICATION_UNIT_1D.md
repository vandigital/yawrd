# YAW-001 Unit 1D — creator-authorized publication

November 3, 2026 (Asia/Manila). Code-only work in
`/tmp/yawrd-yaw001-activation-assessment-20261103`, based on accepted HEAD
`4d0d4198fa3e4486a5e5ff9fb9cc30d814481358` and its preserved Genesis overlay.
No database connection, permission change, migration or publication was performed.

**Status update — November 3, 2026:** The public Genesis preview is live and
Testnet deployment/governance hardening evidence is accepted. Draft persistence
passed the owner-accepted 16-check isolated PostgreSQL verification; publication
remains code-only, offline-tested, not PostgreSQL-verified and not activated.
The previously required publication-aware preflight correction is now implemented behind
`YAWRD_ENABLE_GENESIS_PUBLICATION=1`; default draft checks remain intact.
The canonical participation wording is now owner-approved and aligned in source:
"Applications are reviewed by the project creator. Participation requires separate
authorization." Existing genuine project rows, if any, require separately
authorized reconciliation if they retain the previous value; exact comparisons
continue to reject mismatches. No database access or reconciliation occurred here.
Genuine YAW-001 participation, independent agent contributions, Build Progress
integration and reward settlement remain undemonstrated. The original unit report
and its then-pending gates are preserved below as historical evidence.

## Assessed existing boundaries

The project is `yawrd.projects`, keyed by `(network,id)`. Migration 003 adds unique
`(network,dao_account_id)` linkage and extends creator/identity immutability.
`published_at` is the existing nullable timestamp used by public project reads,
participant state, applications, reviews and agent associations. The runtime
database role is `yawrd_07b_runtime`, with existing SELECT and nine-column project
INSERT permissions. Publication UPDATE permission has not been applied here.

`PersistentAuth` establishes Testnet identity using Meteor NEP-413 and finalized
FullAccess-key verification. It consumes browser-bound challenges, hashes opaque
session tokens, and enforces expiry/revocation in database queries. The existing
one-hour sign-in is identity authentication; publication requires a separate POST
and publication consent. Wallet connection or browser account claims confer no
publication authority. The account key is verified at sign-in, not on every action.

## Local implementation

`POST /api/yawrd/yaw-001/genesis-publish` uses the existing dynamic route and
`participantRequest()` handler. The exact body is:

```json
{"consent":true,"consentVersion":"genesis-publication-v1"}
```

Consent version `genesis-publication-v1` means explicit authorization to publish
the stored canonical public project fields **and enable existing participant
applications**. It does not publish applications, restricted information or agent
associations, grant GitHub/governance permissions, accept work or authorize rewards.
No button, publication UI or application-eligibility redesign was added.

The handler retains origin/Host/Fetch Metadata checks, bounded exact JSON fields,
HttpOnly session cookies, private/no-store responses and sanitized errors. Only
the fixed project ID is accepted; GET and other HTTP methods cannot publish.
Client creator, DAO, network, approval, public-field and timestamp overrides fail.

`ParticipantRepository.publishGenesis()` checks affirmative versioned consent,
then uses one parameterized UPDATE to:

- Resolve a live, unrevoked Testnet session from its hashed token.
- Require its account to be `yawrd1.testnet`, equal to the stored project creator.
- Require `testnet`, `yaw-001`, `demo.factory.yawrd.testnet`, and exact canonical
  name, description, objective array, participation and rewards.
- Reject a conflicting association under another project ID.
- Update **only** a NULL `published_at` to `statement_timestamp()` and RETURN it.

Authorization, identity comparison and the state transition occur in the write;
there is no preliminary read used as authorization. A successful UPDATE returns
its timestamp directly. If it affects zero rows, a separate authorized read
distinguishes missing sessions (401), other accounts (403), missing projects
(404), canonical conflicts (409), and an already-published canonical record.
The latter returns the original timestamp without an additional mutation. The
new statement can see a concurrent winner after PostgreSQL resolves the UPDATE.

`matchesGenesisIdentity()` shares the exact public-identity comparison.
`matchesGenesisProject()` still separately requires unpublished state, preserving
the accepted draft-linking/status behavior. The publication response contains
only `published`, `projectId`, `network` and `publishedAt`.

## Proposed database privilege — NOT applied

Within the established trusted-runtime architecture, the minimum additional
permission is:

```sql
GRANT UPDATE (published_at) ON yawrd.projects TO yawrd_07b_runtime;
```

Existing SELECT permissions supply the predicates and RETURNING read. No table-wide
UPDATE, other column UPDATE, owner credential, new role or schema change is needed.
The project identity trigger continues to protect network, ID, creator and DAO.

This is a column boundary, not database-enforced per-human or per-project
authorization. Anyone directly controlling the trusted runtime credential could
issue other publication timestamp changes. A database-enforced Genesis-only,
creator-session-bound, first-timestamp rule would require a narrowly scoped
database function and EXECUTE-only authority instead of direct UPDATE. That
function would need separately reviewed privilege, search-path and ownership
configuration; none is implemented or installed in this code-only unit.

## Verification and limits

Targeted command:

```sh
node --import ./test/register-tsx.mjs --test --test-isolation=none --test-reporter=spec test/genesis-publication.test.ts test/genesis-draft.test.ts test/participants.test.ts test/agent-association.test.ts
```

Result: **102 passed, 0 failed, 0 skipped**: 20 publication cases and 82 existing
draft/participant/association cases. Focused strict ES2022/NodeNext TypeScript
checking and `git diff --check` passed. The publication cases cover creator
success, consent, denied sessions, canonical mismatches, missing projects,
retries/fresh repository instances, mock concurrency, write-time drift, permission
failure, response allowlisting and actual SQL predicate structure.

These tests use in-memory query adapters. PostgreSQL syntax/execution, locking,
permission behavior and real HTTP/session integration for this new operation
remain unverified. Earlier accepted Genesis persistence/database evidence is
unchanged and does not establish publication verification. A network failure can
leave the publication result uncertain; an authorized identical retry preserves
the first timestamp rather than resubmitting a different publication value.

## Gates before any live publication

- An actual canonical persisted project must exist; this unit did not inspect
  its current live presence or state.
- The new SQL and proposed permission require separately authorized PostgreSQL
  verification and owner review. With the existing permissions, publication
  fails closed through the sanitized 503 response.
- Existing draft-only database preflights require no project UPDATE and reject
  a published Genesis record. They must receive a separately scoped update before
  being used as publication-aware acceptance tools. Their expectations were not
  weakened or changed here.
- Publication currently opens participant applications. Canonical participation
  text still describes an unpublished project and closed applications. Owner
  review must reconcile that public wording with the intended launch behavior;
  this unit preserves all approved canonical text and existing eligibility logic.

Changed files: `src/genesis/yaw-001.ts`, `src/participants/repository.ts`,
`src/participants/http.ts`, `test/genesis-draft.test.ts`, new
`test/genesis-publication.test.ts`, `package.json`, and this report. The existing
dynamic route, authentication implementation, migrations, operator tools, public
page and preservation checkout were not modified. No new infrastructure,
dependency, DAO/factory call, wallet transaction, commit, push or deployment.
