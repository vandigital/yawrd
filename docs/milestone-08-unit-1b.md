# Milestone 08 / Unit 1B — Participant–agent association

October 30, 2026. Local implementation and offline verification completed against
HEAD `8b44ef2fc939313aaae722e54b2d9c908996b94a`. Ready for engineering review;
live durable persistence remains unverified and requires separately authorized
database activation. YAW-001 remains **NOT STARTED**.

Scope follows the supplied Unit 1B authorization, current AGENTS.md, the canonical
YAW-001 Blueprint v1 and approval record, and Project Brief v0.3 supplied in chat.
No material conflict was found. The Brief has not been added to the repository.

## API

The existing dynamic participant route handles
`/api/yawrd/{projectId}/agent-association` without a new route or interface.
Select a published development/Testnet project through its existing internal ID;
the caller must have an approved application for that project.

- `GET`: returns `{ association: null }` for an eligible owner with no association,
  or `{ association: { network, projectId, applicationId, operatorAccountId,
  agentReference, consentVersion, authorizedAt } }` for their saved association.
- `POST`: accepts exactly the JSON fields below and returns the saved association
  with status 200, including on an identical retry.

```json
{
  "agentReference": "ironclaw:independent-01",
  "consent": true,
  "consentVersion": "agent-association-v1"
}
```

The reference is case-sensitive, 1–200 ASCII characters, starts with a letter or
digit, and otherwise allows letters, digits and `._:/@-`. It is stored exactly as
submitted, never fetched, and is a human-attested identifier rather than proof of
cryptographic agent control. No automatic publication is authorized.

Consent version `agent-association-v1` means the authenticated human explicitly
authorizes the identified agent's association with their approved participation
in this Yawrd. This does not give the agent wallet identity, a session, access to
restricted data, GitHub permissions, contribution acceptance/integration rights,
governance rights or Project Funds authority. Any future interface must explain
these terms before sending consent; no management interface was added here.

Anonymous/expired/revoked sessions receive 401 for an existing project; pending,
rejected or absent membership receives 403. Creator status alone is insufficient.
Unknown/unpublished projects receive 404. Invalid input receives 400, oversized
HTTP bodies 413, conflicting references 409, and database failures a sanitized
503. Existing origin/host/fetch-metadata, strict field validation, opaque cookie
handling and private/no-store response protections apply. Browser-supplied
operator, application, network or timestamp fields are rejected. Reads expose
only the authenticated approved participant's association, including when the
caller is a creator. Existing public and participant-state responses are unchanged.

## Persistence and authorization

Inactive draft: `docs/proposals/migrations/m08_agent_association.sql` (the filename
was unused at initial inspection). No active migration number was reserved and
the migration loader was not changed.

The table has six columns: application ID, network, project ID, agent reference,
consent version and database-generated authorization timestamp. The operator
wallet is normalized through the existing immutable application; it is not
duplicated in the new table. A composite foreign key fixes the application to its
network and project. The application primary key, combined with the existing
unique project/operator application constraint, permits one association per
approved participant per project.

The parameterized INSERT SELECT derives identity from a live Testnet session
and joins that operator's approved application in the selected published project
at write time. It does not rely on a prior HTTP authorization check. A draft
BEFORE INSERT trigger also rejects applications without an approved decision,
and forces a database-generated timestamp. Applications and decisions are already
immutable. An additional trigger makes associations immutable.

The primary key and ON CONFLICT DO NOTHING prevent duplicate concurrent writes.
A subsequent authorized read sees a concurrent winner after conflict resolution;
an identical reference returns the original timestamp, and a different reference
returns 409 without overwriting the winner. No update/delete flow is provided.

The draft grants the existing `yawrd_07b_runtime` server role SELECT and only the
five required INSERT columns. No new database role, browser or agent privilege is
created. As in Milestone 07B, the server/runtime credential is trusted; this is
not a per-human database login or a new row-level security model.

## Local verification

- `npm test`: **146 passed, 0 failed, 0 skipped**. This includes all 119 existing
  offline tests and 27 new association tests.
- `node --import ./test/register-tsx.mjs --test --test-isolation=none test/agent-association.test.ts`:
  **27 passed, 0 failed, 0 skipped**.
- `node --import ./test/register-tsx.mjs --test --test-isolation=none test/participants.test.ts`:
  **27 passed, 0 failed, 0 skipped**. No Milestone 07B offline regression observed.
- `npm run typecheck`: **passed**, exit 0.
- `git diff --check`: **passed**, exit 0.

New tests cover creation/retrieval, ownership, two approved projects, multiple
approved operators, missing projects, identical sequential/concurrent retries,
conflicting concurrent requests, anonymous/expired/revoked sessions, unapproved
and creator-only membership, cross-project access, forged fields, consent,
reference validation, request protections and sanitized database failures. They
simulate loss of authorization at insertion and inspect actual SQL guards and
draft constraints/grants.

The query adapter is an isolated in-memory fixture, not a PostgreSQL execution
engine. These tests verify server behavior and SQL structure; they do not verify
PostgreSQL syntax, trigger execution, real database locking, runtime grants or
live durability. Those checks remain for controlled database activation. No SQL
was executed against any database, and no live Neon or blockchain access occurred.
Until activation, association calls against the current schema will return the
existing sanitized service-unavailable response; ordinary participant paths do
not query the new table.

## Changed files and handoff

Modified: `src/participants/repository.ts`, `src/participants/http.ts`,
`src/participants/types.ts`, `package.json`.

Created: `test/agent-association.test.ts`, this report, and the inactive SQL draft.

The pre-existing AGENTS.md modification and deferred Blueprint Preparation Unit 2
files were preserved. The Unit 2 SQL remains outside active migrations. No
dependency installation, credential access, migration activation, deployment,
wallet transaction, GitHub permission change, public repository modification,
staging, commit, push or discard was performed. No Unit 2 work began.

No verified blocker prevents engineering review. Full durable integration
acceptance is pending separate authorization to apply and verify the reviewed
draft in an appropriate environment.
