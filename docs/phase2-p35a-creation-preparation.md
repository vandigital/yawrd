# P3.5A — private Creation preparation review foundation

Implemented locally on 2026-11-19 (Asia/Manila). No database installation or provider activation.

## Baseline and preservation

Target: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
Initial worktree: 24 modified tracked files and 50 untracked files. All 74 are
preserved byte-for-byte; this milestone adds files only. No existing navigation,
Account, payment, deployment, dependency, test script or migration-runner file changes.

## Implemented boundary

- `src/creation/preparation-contract.ts`: bounded, versioned review content;
  incomplete draft validation, structural approval checks and standalone Skill renderer.
- `src/creation/preparation-repository.ts`: injected trusted-server Query adapter,
  canonical content hashing/integrity checks, immutable edit/approval operations.
- `src/creation/preparation-http.ts`: existing cookie sessions, origin/Host/Fetch
  Metadata checks, exact fields, bounded JSON, stale-account header guard,
  authorization before body parsing and session recheck before disclosure.
- `app/api/creations/[id]/preparation/route.ts`: Development-only Node route using
  the existing independently pinned database target guard.
- `app/create/[id]/blueprint/{page.tsx,preparation-panel.tsx,preparation-content.tsx,preparation.module.css}`:
  private client-loaded review/editor, concise default presentation, Advanced
  Markdown/JSON/provenance, global Account integration and guarded resume.
- `docs/proposals/migrations/phase2_creation_preparation.sql`: unapplied additive SQL.
- `test/creation-preparation.test.ts`, `test/creation-preparation.browser.test.mjs`,
  `test/fixtures/preparation.ts`: deterministic synthetic evidence only.

The workspace is a logical view over the founder's accepted paid Creation and
immutable preparation versions. Every operation uses existing founder-only
Creation/deployment locking and requires matching saved paid evidence. A second
Steward receives no private draft access. No live chain call is needed for editing
or resuming an already verified binding; P3.4 evidence is unchanged.

P3.5A does **not** create a blank manual workspace, seed a production artifact,
import an arbitrary model result, call a provider or expose a generation action.
When no prepared version exists, the direct Development review page honestly says
there is nothing to review yet. Existing founder navigation has no link to it.
The default journey remains payment → AI preparation → review/edit/save/approve.
The initial authenticated AI-result writer belongs to P3.5B, with its spending and
request-status gates. Until then the review lifecycle is tested using synthetic
records in test doubles and a disposable browser, never real saved rows.

## Versions, lineage and handoff

Content uses `yawrd.creation-preparation.v1`. Canonical text is formed by strict
field-by-field validation and ordered JSON serialization. SQL stores the exact
text, derives JSONB and SHA-256 (in the insert guard), and supplies server timestamps. Founder edits have
their own author, parent revision and digest, and **no model metadata**. The
original generated version retains provider/model/prompt/response/source-digest
metadata. The root plus latest twenty versions are returned for bounded review;
all historical versions remain stored and immutable.

SQL locks the existing Creation before selecting the latest preparation revision.
Save requires exact expected revision/digest; a lost-response retry of the exact
last save returns that version. Unchanged saves do not manufacture revisions.
Approval is an immutable event tied to the exact current version/digest and
`creation-preparation-review-v1` consent. SQL rechecks it under the same lock after
the trusted server's completeness check. Edits after approval create an unapproved
derivative. Preparation approval grants no task activation, publication, access,
reward entitlement or spending authority.

Draft saves allow missing prose, incomplete tasks and unresolved dependency/input
references. Approval requires complete overview/scope/boundaries/Skill, task
deliverables and observable checks/evidence, embedded references, valid dependencies
and an acyclic graph. Task count is bounded for storage, with no fixed two-task or
parallel-track assumption. These are structural checks and founder attestations,
not semantic quality certification or proof that dependencies are truthful.

Reported verified facts carry their own source/time and are labeled as recorded
claims. Proposed defaults with rationale, founder decisions and activation-time
details occupy separate fields. Editing a recorded fact does not reverify it.
Shared interfaces and fixtures are embedded by identifier/content, and the Skill
renderer includes them alongside overview, outcome, boundaries, instructions,
deliverables, dependencies, acceptance evidence and unresolved questions.

`privateNotes`, raw intake, binding identifiers and provider provenance are excluded
from `SKILL.md`; private JSON remains inside Advanced. Download of the reviewed
Skill is offered only for the approved, unchanged current version. Its download is
private and performs no publication. The founder explicitly reviews handoff
completeness; structural validation cannot detect every inaccessible prose
reference. A future public-contribution workflow must separately authorize public
material. This milestone adds no public projection or publication consent.

Task terms support explicit unpaid wording and undecided status, with no positive
reward amount or payment-claim fields. Missing information stays undecided; editing
and export preserve explicit voluntary/no-reward language. No reward-plan or funding
implementation is changed.

The client aborts/invalidates outstanding work on session events, wallet selection,
route changes and unmount, and checks session identity before and after private
requests. Focus/visibility and a 30-second visible-page check detect session loss.
Identity changes clear all displayed/private editor state, including unsaved edits.
Late responses cannot repopulate it. Existing global Account controls handle renewal
on this page; no new authentication controls or browser draft storage are added.

## Exact deferred database activation

Only after separate human authorization, an operator must independently confirm the
Development database/endpoint and install the single proposal with a migration-owner
connection in **one transaction**, including its REVOKE/GRANT statements. Do not
reapply accepted P1/P3.2/P3.4 migrations or move this proposal into automatic
numbered migration discovery.

Prerequisites: installed `yawrd.creation_platform_fees`, accepted
`creation_fee_lock(text,text,bigint,bigint)`, `creation_founder(text)` and
`prevent_mutation()`, plus the existing runtime role `yawrd_07b_runtime`.
The proposal adds exactly:

- Tables `creation_preparation_versions` and `creation_preparation_approvals`.
- Five functions: `creation_preparation_access`, `creation_preparation_guard`,
  `creation_preparation_read`, `creation_preparation_save`, `creation_preparation_approve`.
- Four binding/immutability triggers; parent/version foreign keys; generated JSONB
  and a server-derived digest; scoped SELECT/INSERT and helper EXECUTE grants.

No timestamp INSERT, UPDATE, DELETE or TRUNCATE grants, elevated functions, new
roles, extensions or P3.4 row updates are introduced. The runtime remains a trusted
server role. Direct-SQL cross-founder limitations remain the existing security
gate before third-party activation; completeness is also a trusted-server check.

Post-installation acceptance requires separately authorized real PostgreSQL tests
of catalog/privileges, paid binding, founder isolation, session expiry/revocation,
immutable rows/digests/parents, stale/concurrent writes, exact approval, and rollback
preservation. None have run here. Mocks and SQL source assertions do not prove
PostgreSQL syntax, actual locking, constraints or installed grants.

## Verification

Focused commands (use the existing installed dependencies; no environment loader):

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-preparation.test.ts
node --import ./test/register-tsx.mjs --test --test-isolation=none test/creation-preparation.browser.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Browser coverage uses the real preparation UI, global navigation/Account and wallet
provider, with mocked HTTP and synthetic browser-only records. It exercises
incomplete saves, exact-version approval, export, reload, subsequent unapproved
edits, 320/390/768/1440 widths, global sign-out, foreign-founder/Steward denial,
session expiry detection, and delayed read/save responses after identity changes.
External requests are blocked. The browser needs permission to open its disposable
localhost server and Chromium; the first sandboxed run stopped at `listen EPERM`.

Actual final results:

| Check | Result |
| --- | --- |
| New contract/repository/API/SQL-source/review tests | 14 passed, zero failed/skipped |
| New preparation browser test | 1 passed, all synthetic interactions; no external requests |
| Existing Account renewal browser test (`YAWRD_BROWSER_ACCOUNT_AUTH=1`) | 1 passed; stays on the payment page, no real signing/payment |
| Existing configured offline suite, one file per process with `--test-isolation=none` | 410 passed across 21 files, zero failed/skipped |
| TypeScript (`--incremental false`) | Passed |
| Isolated Next.js 16.4.6 webpack build | Passed compilation, TypeScript and page/route generation |
| New-file whitespace checks and preservation fingerprints | Passed; all 74 pre-existing files unchanged |

The build ran in `/tmp/yawrd-p35a-build` using existing dependencies, a clean child
environment and no copied environment files. It required no database/provider access.
The unchanged shared-process `npm test` command reported legacy Creation integration
failures and stalled; it was stopped. A process-isolation runner reported 21 passing
file wrappers; to avoid treating wrappers as individual assertion evidence, all 21
files were then executed separately with the existing `--test-isolation=none` setup,
yielding the 410 actual test passes above. The unchanged Creation integration file
also passed independently (23 tests). This milestone does not change the accepted
runner or diagnose that existing interaction. Logs are under `/tmp/yawrd-p35a-*`.

## P3.5B handoff — recorded only

Read-only design sources were the actual existing WordWake worktree at
`/tmp/yawrd-milestone-10a/docs/wordwake/yaw-002/`, particularly
`QUALITY_REVIEW.md`, `SOURCE_TRACEABILITY.md`, `BLUEPRINT_GENERATION_PLAYBOOK.md`
and reviewed derivative `yaw-002-wordwake-ww-v1-r1`. Original Qwen 6/14, original
GPT 9/14 and refined derivative 14/14 are historical offline rubric assessments;
the 14/14 is same-author editorial review, not automated generation or independent
certification. No project package or project-specific rules were copied.

Later provider integration must:

1. Prepare compact source-aware input, keeping immutable source/parent provenance.
2. Embed required context instead of relying on inaccessible intake/chat.
3. Propose reversible defaults with rationale; retain material founder decisions.
4. Supply shared interfaces/fixtures and honest dependencies, without fixed tracks.
5. Validate complete handoff exports and acceptance evidence; do not claim a quality
   score or semantic readiness merely from schema success.
6. Reuse the corrected NEAR AI Cloud `Qwen/Qwen3.8-27B` request with exact top-level
   `chat_template_kwargs: { enable_thinking: false }`, 180-second provider deadline,
   8,000-token completion cap and no automatic retries, repairs or fallback.
7. Recheck the **entire serialized request** against the 24,000-byte limit. The
   historical prepared package estimate reached 23,482 bytes; truncation is unsafe.
8. Add durable attempt/status evidence and finite approved spending bounds before
   dispatch. Database records alone do not give durable execution after HTTP/server
   termination. Preserve unknown outcomes and prevent automatic resubmission.

P3.5B, database activation, live inference, funding, publication and third-party
activation are deferred. No credentials, wallet transactions, commits, pushes,
deployments or Production resources were accessed or changed.
