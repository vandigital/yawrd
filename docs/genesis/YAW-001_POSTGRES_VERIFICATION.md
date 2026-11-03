# YAW-001 Unit 1B — verification-branch handoff

Prepared November 3, 2026 (Asia/Manila) in the existing isolated worktree at
`4d0d4198fa3e4486a5e5ff9fb9cc30d814481358`.

**Status update — November 3, 2026:** The founder completed and accepted Unit 1B
with **16 real PostgreSQL checks passed** on the isolated verification branch.
The final runner uses independently guarded owner and direct restricted-runtime
connections (`YAWRD_PG_VERIFY_URL` and `YAWRD_PG_VERIFY_RUNTIME_URL`), verifies
existing grants, and does not depend on `SET LOCAL ROLE` or configure permissions.
The initial result and handoff below are historical; their role-switching,
role/grant-configuration instructions and 15-group count are superseded. This
acceptance covers draft persistence, not genuine Genesis activation or publication.
Migration 003 and the nine-column runtime INSERT grant were subsequently
owner-applied and verified on development. No database operation was performed
for this wording update; the earlier dated evidence remains unchanged below.

## Current result

`YAWRD_PG_VERIFY_URL` is absent from Codex's Rig execution environment. The
founder's successful WSL `psql` connection and branch catalog facts are accepted
owner reports, not PostgreSQL results executed by Codex. No database connection,
migration, role/grant change or synthetic insertion was performed here.

Local validation passed: runner syntax, `git diff --check`, and four connection
guard cases (missing URL, wrong branch, wrong endpoint, wrong database). These
guards fail before dependency loading or network access and are not PostgreSQL
behavior results. No unrelated suites were rerun.

Migration 003 fits the reported `projects` table with `published_at` and no DAO
column, provided the other baseline columns, composite primary key, existing
`protect_creator()` function and its enabled trigger are present. Those conditions
must still be checked against PostgreSQL. Empty migration-history tables do not
justify replaying migration 001. No application correction or new migration is
proposed.

## Exact WSL commands

Run from a private copy of this worktree accessible to WSL, containing the new
runner and the existing installed project dependencies. Rig's `/tmp` worktree is
not automatically visible from WSL. Use the WSL-visible path at the first prompt.
Use existing Node.js 22.18+ (the Rig checkout uses Node.js 26.12.1). No dependency
installation is part of this authorization.

The existing `YAWRD_PG_VERIFY_URL` must be the admin connection for **only**:
Yawrd / `yaw-001-pg-verification` / `neondb`. It remains an environment variable,
never a command-line argument or chat message. Obtain the non-secret `ep-...`
endpoint ID independently from that branch's compute endpoint in Neon Console;
do not derive the confirmation pin from the connection URL itself.

```bash
set +x
read -r -p 'Private verification worktree path in WSL: ' YAWRD_PG_VERIFY_WORKTREE
cd -- "$YAWRD_PG_VERIFY_WORKTREE"
export YAWRD_PG_VERIFY_URL
export YAWRD_PG_VERIFY_BRANCH='yaw-001-pg-verification'
read -r -p 'Verification branch endpoint ID from Neon Console (ep-...): ' YAWRD_PG_VERIFY_ENDPOINT
export YAWRD_PG_VERIFY_ENDPOINT
node scripts/verify-genesis-postgres.mjs --preflight
```

Proceed only if the last command exits successfully and reports
`preflight_passed`, after confirming its non-secret host/endpoint/database output
matches the intended branch. It performs SELECT/catalog checks only. It verifies
the existing baseline objects, empty operational tables, PostgreSQL 18, NULL
publication default, identity trigger/function, runtime role attributes and current
project grants. Missing tables or mismatched objects stop execution; it never
initializes or recreates the base schema.

Then run:

```bash
node scripts/verify-genesis-postgres.mjs --apply-and-test
```

This command repeats the guarded preflight, then performs the authorized branch-only
writes and focused checks. It applies the existing
`docs/proposals/migrations/003_genesis_draft_linking.sql` atomically when the DAO
column is absent, wrapped as one DDL statement like the established migration
runner. It does not run migration 001, the general migration loader or the
development-pinned runtime configuration command. It does not depend on a migration
ledger. A subsequent run with existing 003 checks the function/constraints and
behavior rather than replaying ALTER TABLE.

Return the sanitized PASS lines and final JSON summary for review. Do not return
the connection URL, passwords, shell environment dump or synthetic session tokens.
If a check fails, stop; the output identifies its stage and sanitized error code.
Do not retry against another branch or bypass a preflight check.

## What the runner checks

- Existing NULL-associated projects before/after 003 and concurrent first inserts.
- Canonical unpublished insertion through the existing `participantRequest()` and
  `ParticipantRepository`, identical retries, project/DAO conflicts and no overwrite.
- Actual PostgreSQL DAO uniqueness, creator/DAO immutability (including NULL
  transitions) and invalid-account CHECK constraints.
- Valid creator versus missing, expired, revoked and non-creator sessions;
  cross-origin and other-project requests; unpublished/restricted-data denial.
  Wrong-network session creation must fail the database CHECK constraint.
- Exact column INSERT permissions, lack of project UPDATE/publication/DELETE/DDL
  privileges, and denial of related restricted-content mutation.

The runner uses the existing Neon driver and injected Query interface. Every
runtime repository query executes in a transaction with
`SET LOCAL ROLE yawrd_07b_runtime`; no application credentials are read or changed.
If that role is absent, a restricted NOLOGIN test role with the same name is
created in the verification branch. The admin must be able to create it and SET
ROLE, or verification stops. The proposed grants are prepared only on this
branch. Schema and role/grant changes remain there after the run; synthetic
projects, restricted text, sessions and challenges are removed. Failure cleanup
is attempted and explicitly reported if incomplete.

The named checks include schema/migration/setup/cleanup as well as behavior. A
complete run currently contains 15 groups. **No pass count is claimed until the
actual PostgreSQL run produces its summary.**

## Boundaries and remaining verification

Runtime column grants permit arbitrary draft INSERT values to trusted server SQL;
they do not implement a Genesis-only database row whitelist. The narrow HTTP and
repository operations enforce the fixed ID, creator and DAO. If database-enforced
row restrictions beyond the accepted architecture are required, report that as a
separate security/design requirement rather than claiming these grants provide it.

Synthetic sessions are inserted by the verification admin, explicitly labelled as
test fixtures. They do not establish real Meteor authentication or human approval.
This checks the existing handler against real SQL, not a running Next.js server.
The existing route remains
`app/api/yawrd/[projectId]/[action]/route.ts`, which exports GET and POST through
`participantRequest()`. No route, UI, publication or Creation Builder changes were
made.

No production/development writes, DAO/factory calls or live activation are part of
these commands. **Readiness remains NOT READY pending actual verification-branch
results and owner review.**
