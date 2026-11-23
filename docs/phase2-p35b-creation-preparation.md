# P3.5B — generalized AI preparation, offline implementation

Date: 2026-11-19 (Asia/Manila). No installation, inference, wallet action or deployment.

## Baseline and implementation boundary

Target worktree: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
Initial status: 24 modified tracked files, 63 untracked files, including P3.5A.
The 87 initial changed/untracked files were fingerprinted before editing. Only the
explicit P3.5B integration files are modified; unrelated accepted work is preserved.

New implementation:

- `src/creation/preparation-context.ts`: scoped source-aware preparation from the
  founder-owned saved intake, frozen deployment public details and paid evidence.
- `src/creation/preparation-provider.ts`: bounded Qwen Chat Completions and premium
  Responses adapters using the historical transport/parser methods, generalized
  prompt and P3.5A output contract. No SDK or dependency was introduced.
- `src/creation/preparation-generation-contract.ts`: model/consent/limit contracts,
  persisted stage observations and deadline-derived uncertainty.
- `src/creation/preparation-generation.ts`: one-attempt policy, source preparation,
  durable reservation, provider dispatch and atomic generated-original writer.
- `app/create/[id]/blueprint/generation-progress.tsx`: real stage checklist,
  partner disclosure, finite-request consent, failure/unknown states and status read.
- `docs/proposals/migrations/phase2_creation_preparation_generation.sql`: unapplied
  additive attempt/status/result proposal, used after the unchanged P3.5A proposal.
- Focused unit and browser generation tests, plus this handoff.

Existing integration changes are limited to the preparation view/HTTP/API route,
review panel, the paid payment-page continuation, and the P3.5A source assertion
which previously prohibited the then-unimplemented `generate` action. The P3.5A
review/edit/approval lifecycle and schema are retained. Its repository remains
unchanged. P3.4 payment authorization, verification, persistence, amounts, wallet
submission, and Account/authentication implementations are unchanged.

The payment page exposes “Continue to AI preparation” only when the separate server
preparation flag is enabled and its existing fee view is verified paid. This is
navigation only; visiting it or the preparation page never calls inference. No
additional payment, wallet prompt, task activation, funding or publication is added.

## Source-aware first pass

Applied the actual existing `/tmp/yawrd-milestone-10a/docs/wordwake/yaw-002/`
`INTAKE_PREPARATION_PLAYBOOK.md`, generation playbook, traceability and quality
review methods. The reviewed `yaw-002-wordwake-ww-v1-r1` package was not copied.
Its 14/14 was same-author offline editorial review, not an automated-generation
result or an independent readiness certificate.

The prepared snapshot separates:

1. Verbatim founder requirements by paragraph/field, confirmed outcome and provenance.
2. Minimal historically verified setup/payment facts, with source and observation time.
3. A policy for proposing reversible, resource-appropriate defaults with rationale.
4. Material decisions about money, rights, authority and conflicting scope, with gates.
5. Activation details such as baseline/access/tooling/people which remain unverified.

The source retains current intake and immutable original-intake digests, Creation
revision, binding digest and the exact derived input used. It does not send raw
sessions, keys, configuration payloads, private preparation notes or unrelated
projects. Founder-reported resources do not establish actual access. Stored payment
does not establish Project Funds or reward entitlement. No live chain freshness is
invented. Differing planning names and frozen public details are preserved rather
than silently reconciled. Oversized input fails before reservation or spending,
without truncating founder text.

One request must produce the Blueprint, embedded contributor Skill and task briefs.
The generalized instructions demand concrete, justified interfaces/protocols and
fixtures, honest dependencies, scoped deliverables and observable checks/evidence.
There is no fixed two-task split, forced independence, architecture/framework, or
invented reward amount. Missing reward terms stay undecided; explicit unpaid terms
are supported. Routine technical choices should be reviewable defaults rather than
questions requiring the founder to author a package manually.

Private source/binding record identifiers and digests remain in the durable server
snapshot. The provider receives an explicit allowlist of project context fields,
without the snapshot's provenance object. Founder content remains untrusted data.

Output is validated locally against P3.5A's strict contract, completeness checks,
reference/dependency structure, exact supplied verified facts and private-note
exclusion. Known private provenance identifiers/digests cannot appear in the Skill
handoff. No substring guessing, semantic field repair, second AI judge, paid repair,
automatic approval or fallback model exists. Complete fenced JSON is accepted as
format normalization, preserving all values. Invalid/truncated output never becomes
a usable version. Structural validity cannot prove semantic fidelity or independence;
the seven-part rubric is provided as an unscored human review reference in Advanced.
Actual first-pass quality still needs the separately authorized genuine test.

## Provider compatibility verified without inference

On November 19, public, unauthenticated metadata was read from
[`GET /v1/models`](https://cloud-api.near.ai/v1/models); no key or inference was used.
It lists:

| Model | Context | Published maximum output | Sampling/feature evidence |
| --- | ---: | ---: | --- |
| `Qwen/Qwen3.8-27B` | 262,144 tokens | 65,536 tokens | `max_tokens`, temperature, reasoning feature |
| `openai/gpt-6.1-sol` | 1,050,000 tokens | 128,000 tokens | `max_tokens` sampling parameter, reasoning feature |

Our smaller bounds remain **24,000 UTF-8 bytes for the entire serialized request**,
**8,000 completion tokens including reasoning**, a **180-second provider deadline**
including body consumption, and a **256 KiB response transport cap**. Both wire
formats are measured including input, instructions, schema, escaping and framing.
No runtime metadata lookup is added. Published standard rates imply conservative
estimates at the configured token bounds of $0.01176 Qwen / $0.128 premium; actual
billing can differ. The input-byte bound is not an exact tokenizer measurement.

Qwen keeps exactly the proven top-level
`chat_template_kwargs: { enable_thinking: false }`, with `max_tokens:8000`, one
non-streaming Chat Completions request, no `extra_body` wrapper and no root-level
`enable_thinking`. The compatibility fix is separate from timeout configuration.

Premium reuses the historically tested Responses request: `model`, JSON `input`,
`instructions`, `store:false`, `stream:false`, `tools:[]`, `max_output_tokens:8000`.
It sends no Qwen thinking parameters, temperature, reasoning-effort override or
speculative GPT configuration. The public catalog advertises reasoning capability
but does not specify a model-specific effort-control field. The Responses reference
URL currently returns an error; an explicit GPT reasoning-control contract could
not be established. The adapter therefore retains the previously successful
provider-default reasoning configuration, records actual reasoning usage, and
rejects incomplete/exhausted output. No claim of disabled premium reasoning is made.

The [model page](https://near.ai/models/openai/gpt-6.1-sol) confirms the premium model
ID, `/v1/responses`, and partner-provider/Incognito routing. The
[stateless Responses guide](https://docs.near.ai/cloud/guides/stateless-responses)
confirms `store:false`, no response-history retrieval, and one inference when no
built-in tools are supplied. These sources were checked read-only. No OpenAI SDK,
direct OpenAI endpoint, alternate provider or public-model-selection API is added.

## Finite allowance, persistence and progress

The milestone's allowance is **one reserved request per paid Creation**, stored as
one primary-keyed attempt row. It is consumed before dispatch, including when the
provider response or database completion is lost. It is not renewed by time,
session changes, failures, repeated clicks or reloads. This is the bounded initial
preparation slice, not a new product-wide regeneration policy.

Reservation serializes using the existing founder/paid-Creation lock. It binds the
current source revision, immutable context/digest, request digest, server-selected
model, prompt version and disclosure consent. A losing concurrent request never
calls the provider. The source row and identity/allowance fields cannot be updated
by the runtime role; status updates are monotonic and timestamped by SQL guards.

Actual observations are reserved → waiting → checking → saved, with failed/unknown
outcomes. “Waiting” means dispatch initiation was recorded, not proof the remote
provider received the request. “Checking” follows complete body receipt. Completion
atomically inserts original AI version 1 and records the saved result; model/prompt/
response/source metadata stay on that original, not founder edits. P3.5A saves and
exact-version approvals continue unchanged. Sanitized usage can remain on a failed
response without a result. Raw reasoning, provider errors and invalid content are
not retained as metadata or logged.

The attempt has a 210-second overall observation deadline (180 seconds provider
plus a bounded allowance for validation/saving). Reads and the client derive unknown
completion after that deadline; they do not mutate the database or release the
allowance. A late atomic save for the same attempt can resolve uncertainty.
The browser polls read-only status every three seconds, at most 70 checks per
mounted attempt observation, with no overlapping automatic poll. Session/identity
guards from P3.5A also protect poll responses. No status GET starts inference.
Late earlier status responses cannot regress a newer stage, artifact revision or
approval. If completion commits between the artifact and attempt reads, the server
reloads the committed artifact before reporting saved.

Execution is still inside the HTTP request. The route declares `maxDuration=240`,
but the actual hosting limit needs verification before hosted activation. There is
no queue, worker, streaming or durable execution guarantee. Navigation, browser
closure, process termination, session expiry or storage failure can prevent result
persistence. The provider may still bill; no automatic retry/cancellation guarantee
or provider-history recovery is claimed. Existing global Account renewal stays on
the current route.

## Controlled premium authorization and exact remaining steps

No activation flag was enabled in this assignment. Normal selection is Qwen. The
controlled premium mode requires both server-only flags:

- `YAWRD_ENABLE_CREATION_PREPARATION=1`
- `YAWRD_ENABLE_CREATION_PREMIUM_TEST=1`

along with Development mode and the exact accepted public placeholder binding:
Creation `yawrd-uorgr4yy5sxu`, founder `yawrd1.testnet`, project account
`xfheozm6d1tb.factory.yawrd.testnet`. Premium mode disables generation for other
Creations. The browser cannot supply a model, endpoint, input snapshot or allowance.
Premium requires its distinct `creation-partner-preparation-v1` consent and clearly
discloses private-input routing to OpenAI through NEAR AI. The existing private
`YAWRD_NEAR_AI_API_KEY` configuration is reused server-side; it was not inspected,
requested, printed or modified here.

Before **one separately authorized Development installation**:

1. Independently confirm Development endpoint/database, migration owner and runtime
   role. The historical accepted target is `ep-twilight-voice-aorpfrbm` / `neondb` /
   `yawrd_07b_runtime`; this assignment did not reconnect or reverify it.
2. Review/install unchanged `phase2_creation_preparation.sql` followed by
   `phase2_creation_preparation_generation.sql` in one owner-controlled transaction.
   Do not rerun P3.4 or move these proposals into automatic migration discovery.
3. The B proposal adds one attempt table, five functions and two triggers, with
   scoped INSERT/status UPDATE/SELECT and function EXECUTE grants. No DELETE/reset,
   mutable source/model/time grants, new roles, extensions or P3.4 updates are added.
4. Perform separately authorized real PostgreSQL catalog/grant, founder isolation,
   expiry/revocation, stale-source, concurrent reservation, state/immutability,
   atomic completion/idempotence and rollback-preservation acceptance. Mocks and
   SQL-source assertions do not prove PostgreSQL syntax, locks or installed grants.

Before **one genuine premium inference test**, after database acceptance:

1. Obtain explicit founder authorization for one premium inference and partner
   disclosure; confirm the existing placeholder's saved payment/source binding and
   absence of an existing consumed attempt. Do not seed a synthetic result.
2. Confirm the existing provider account configuration/model access/credits without
   exposing credentials; enable the two server flags only for this authorized test.
   Confirm the Development request can remain alive for the configured duration.
3. Sign in through existing Account controls, open the existing verified-payment
   continuation, review the premium disclosure and authorize Prepare with AI once.
4. Record actual usage/finish status, saved version and source digest; reload without
   generating again. Human-review the seven rubric dimensions and standalone export.
   No automated 14/14 or semantic quality claim follows from a schema pass.
5. Keep failures/unknowns consumed for review. Disable the test activation afterward.
   Do not reauthorize, reset or regenerate automatically.

Known trusted-server/direct-SQL limitations remain a gate before third-party
activation. No general auth/RLS redesign, funding, publication or reward activation
is part of this milestone.

## Offline verification

Focused commands use existing dependencies and deterministic fixtures only:

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-preparation-generation.test.ts test/creation-preparation.test.ts
node --import ./test/register-tsx.mjs --test --test-isolation=none test/creation-preparation-generation.browser.test.mjs
```

Coverage includes exact provider wires/deadlines/caps, complete request boundary
sizes, malformed/refused/incomplete output, reasoning exhaustion, byte bounds,
source-aware SQL projection and freshness, known-provenance privacy, immutable
generated provenance, duplicate claims, source edits, finite failure/unknown locks,
session loss, premium pinning/partner consent, and observation-only progress.
The browser uses real payment/review/Account components with synthetic state
transitions, not simulated model-internal milestones. It checks paid continuation,
reservation/waiting/checking/saved, mid-attempt reload without generation, private
editing/approval/export, session-change delayed-response suppression and uncertainty.
All external browser requests are blocked. No fixture is inserted into a database.

Final verification:

| Check | Actual result |
| --- | --- |
| P3.5B focused tests | 18 passed, zero failed/skipped |
| Preserved P3.5A focused tests | 14 passed, zero failed/skipped |
| Existing configured offline suite, one file per process | 410 passed across 21 files, zero failing files |
| New paid-continuation/generation progress browser scenario | Passed, including late-status ordering and mid-attempt reload |
| Preserved P3.5A review browser scenario | Passed |
| Existing Account renewal browser scenario | Passed, stays on payment route |
| Existing P3.4 fee-review/Steward browser scenario | Passed |
| TypeScript and isolated Next.js 16.4.6 webpack build | Passed, including page/route generation |

The isolated build used `/tmp/yawrd-p35b-build`, existing installed dependencies,
a clean child environment and no copied environment files. No database/provider
configuration was loaded. The known shared-process test-runner interaction was
avoided by running each of the configured existing test files separately; the
accepted runner/package scripts were not changed. Logs remain under
`/tmp/yawrd-p35b-*`. The new browser fixture initially hit a Chromium profile cleanup
race; cleanup now waits for process exit and the final scenario passed.

The seven authorized baseline changes are the preparation contract/HTTP/API route,
review panel, payment page/continuation component and the P3.5A source assertion.
The other 80 initial changed/untracked files remain byte-for-byte unchanged. Nine
files are added. HEAD/branch, dependencies, Account code, P3.4 backend/payment SQL,
P3.5A repository/schema, accepted Genesis/WordWake packages and unrelated work are
preserved.

Installation, real model quality, latency and billing remain untested. No paid inference, database
mutation, migration execution, wallet action, commit, push, deployment or Production
change occurred. P3.5B stops at the bounded offline implementation.

## Intake completion boundary — 2026-11-20

The existing six questions, three sections, examples, copy/manual-copy fallback,
account-scoped draft backups and ordinary manual editing remain the intake flow.
The collapsed external AI helper sits immediately above each section's answers.
It downloads a human-readable intake/prompt file separately from the JSON backup.
Its single JSON paste area accepts only the project name and six answer fields;
preview and explicit Apply stage edits, and normal Save remains separate. Neither
opening help nor downloading, previewing or applying requests inference. Changed
outcome wording, including restored answers, withdraws the previous confirmation.
Placeholder checks reject only blank or obvious marker responses; they do not
measure quality or require technical detail. Concise honest answers remain valid.

### Paid-Creation intake revision continuation

Existing P1 `creation_save` preserves immutable `initial_intake`, source identity
and owner/revision checks. It can save the current private intake; the UI reports
the returned revision. P3.5B reads that saved revision and reserves its source
snapshot with a matching revision under the Creation lock. An edit that wins
before reservation therefore causes stale generation input to be rejected.

The preparation page offers “Review or edit project answers” before any attempt
or generated version exists. It opens the same founder-owned Creation in the
existing intake UI. Normal explicit Save reports the returned revision, and
“Return to AI preparation” preserves the paid Creation's identity. This route
does not enter deployment/setup configuration or make a payment or inference
request. Restoring answers remains scoped to this Creation in this continuation.

The new, unapplied `phase2_creation_preparation_intake_guard.sql` proposal adds a
trigger for changed intake on `creation_drafts`. The existing UPDATE/creation_save
row lock serializes with reservation's existing Creation lock. Under the runtime's
READ COMMITTED isolation, the VOLATILE trigger checks any committed attempt before
allowing the update. Reservation winning first rejects the save with
`creation_intake_locked`, rolling back all statement changes. Save winning first
advances the revision, so reservation with an earlier snapshot fails with
`generation_source_changed`. No-op intake saves retain existing behavior. Failed
and uncertain attempts keep intake locked; the one-attempt policy is unchanged.

The owner/session/CAS implementation of `creation_save`, immutable original,
frozen deployment/public text and payment evidence remain unchanged. The HTTP
adapter maps the lock to 409 and the intake UI explains that preparation started
and the attempted edits were not saved. Unsaved wording remains available to copy
or export. The preparation page hides the edit link after reservation and shows
the lock message. The SQL trigger remains authoritative for stale tabs and all
other existing intake paths.

### Development installation — founder-reported completion

The founder reports installation of these three proposals on the confirmed Neon
Development database, in dependency order:

1. `docs/proposals/migrations/phase2_creation_preparation.sql` (unchanged P3.5A).
2. `docs/proposals/migrations/phase2_creation_preparation_generation.sql` (unchanged P3.5B).
3. `docs/proposals/migrations/phase2_creation_preparation_intake_guard.sql` (new).

No historical migration or P3.4 SQL is modified, replaced or reinstalled. The new
proposal performs no backfill or existing-row update and grants no new runtime
privileges. Preparation availability now also requires the expected trigger and
function on `creation_drafts`, with the trigger enabled for normal execution.
Missing or disabled guard prevents both generation activation and its intake-edit
continuation. Provider selection, request limits, consent and one-attempt rules
are unchanged. The founder verified three empty preparation tables, seven enabled
triggers, PUBLIC EXECUTE revoked on all eleven expected functions, the four-column
attempt UPDATE allowlist, and no DELETE/TRUNCATE privileges.

**Documented installation exception:** the initial connection interruption caused
autocommit installation rather than the intended single transaction. Installation
succeeded; this exception is retained. No migration reinstallation or attempt to
reconstruct transactional installation history is performed during acceptance.

The remaining acceptance is rollback-contained real PostgreSQL checks for
owner/CAS preservation, a save before reservation using the latest source, and
both save/reservation orderings using separate sessions. Verify changed intake
rejection leaves intake, revision, original source, frozen deployment and payment
rows unchanged; rollback must leave no fixture/attempt/artifact behind. Use the
existing Development runtime isolation (READ COMMITTED). Offline fixtures model
these outcomes and inspect the SQL; they are not live database acceptance.

### Recovery product gate before YAW-003

A failed or interrupted preparation with no saved artifact must not permanently
strand its founder or require another project account deployment or platform fee.
Before YAW-003, decide explicit founder-authorized recovery after a confirmed
failure, separate handling of uncertain provider outcomes, and safeguards against
duplicate charges. Recovery must not introduce automatic retries or silent attempt
resets. The controlled Testnet experiment retains the current one-attempt rule;
this assignment implements no recovery mechanism.

### Focused offline evidence

TypeScript (`tsc --noEmit --incremental false`) passed. The focused unit/contract
files passed 93 tests: external assistance 7, existing intake 13, generation 22,
Creation persistence 32, Creation HTTP 5, and preparation review 14. Generation
fixtures exercise quoted injection/forged roles, exfiltration instructions, false
funding/permission claims and reward-authority fields through both request formats.
They verify unchanged trusted instructions, fixed model/endpoints, bounded inputs,
one mocked transport call and rejection of forged verified facts/paid task terms.
They cannot prove that a live model always follows instructions or preserves every
semantic requirement. The local validators do not make that claim.

The narrowly selected `YAWRD_BROWSER_INTAKE_ASSISTANCE=1` browser scenario passed:
collapsed help and toggles preserve answers; clipboard failure exposes manual
copy; download, malformed paste, preview and explicit Apply are separate from
server saving; changed outcomes require reconfirmation; revision 1/2 save and
reload preserve the original; account changes remove saved and pending private
text. The fixture blocks external requests and exercises no deployment, payment
or preparation endpoint. Mobile layout has no horizontal overflow. A fixture
selector quoting error was corrected before the passing run. No shared-process
runner troubleshooting or unrelated payment verification was performed.

All database behavior above is modeled contract evidence. No database connection,
SQL execution, migration, inference, wallet operation or deployment was performed.

### Paid-Creation editing correction evidence

The correction started at HEAD `0ecf38f53436c887895dacb67fe3612cdf4d4ce5` on the
expected feature branch, with 25 modified tracked files and 74 untracked files.
Those 99 files were fingerprinted before changes. Changes are restricted to the
continuation UI, lock error mapping, activation dependency, focused fixtures,
this handoff and the one new unapplied SQL proposal. All pre-existing SQL,
provider adapters, prompt/input-safety code and one-attempt policy are preserved.

Focused verification passed:

- Six selected contract tests: paid HTTP/CAS save preserves founder/original and
  frozen bindings; the saved revision becomes the reserved source; both modeled
  save/reservation orderings reject the losing operation; every attempt state
  locks changed intake with a 409 and no partial write; ownership/session/stale
  revisions retain rejection; SQL and activation checks require the guard.
- One browser scenario: preparation → existing paid intake → edit outcome and
  confirm again → Save revision 3 → reload → another tab reserves → stale Save
  rejected with the lock message → return to locked preparation. No inference,
  payment or deployment request occurs, and identities/frozen bindings persist.
- TypeScript (`tsc --noEmit --incremental false`) and diff whitespace checks.

Commands used for this correction:

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none --test-name-pattern='paid intake|latest confirmed saved intake' test/creation-preparation-generation.test.ts
YAWRD_BROWSER_PAID_INTAKE=1 node --test test/creation-preparation-generation.browser.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

The concurrent outcomes use deterministic query doubles plus SQL inspection;
they do not execute PostgreSQL or certify live database atomicity. Installation
and the rollback-contained concurrency checks above remain the exact database
activation dependency. The YAW-003 recovery gate and current one-attempt policy
remain unchanged; no recovery is implemented by this correction.

### Final PostgreSQL functional acceptance — accepted 2026-11-20

The existing deployment/payment harnesses do not cover P3.5. The bounded
`scripts/check-creation-preparation-postgres.mjs` reuses their pinned Development
target, restricted runtime connection, synthetic prerequisites, savepoints,
timeouts, redacted output and unconditional rollback conventions. It does not
import an environment loader, read credential stores, or inherit a founder's
terminal credentials. The founder supplies the runtime URL privately on stdin
through a hidden terminal prompt; inference flags must explicitly be disabled.
No application code or installed SQL definition changes for this check.

The harness checks installed function bodies, existing paid Creation/founder
bindings, denied runtime mutations, latest saved intake/stale reservation, source
locking through failed/unknown attempts, duplicate reservation, generated-result
atomicity on a forced late CHECK failure, exact approval and unapproved derivatives.
Two fresh synthetic paid fixtures remain inside the primary transaction. The
separate-session lock probe reserves only synthetic attempts against the existing
paid Creation; it never changes that Creation's intake, deployment or payment.
The waiter must block on the Creation lock and succeed after the first reservation
rolls back; it then rolls back too. Both transactions receive explicit ROLLBACK.
Global Creation/deployment/payment/preparation fingerprints and synthetic
session/challenge/Creation disappearance are checked afterward.

Limits: no synthetic data is committed. A committed-winner race and cross-request
post-commit durability, genuine AI output, HTTP/browser behavior, wallets and
provider billing are outside this database check. The trusted-server/direct-SQL
authorization limitation remains unchanged. Acceptance covers the reported real
PostgreSQL rollback scope only.

Syntax and offline input guards passed before execution. On November 20, 2026
(Asia/Manila), the founder reported all seven real Development PostgreSQL rollback
checks PASSED and accepted this milestone. This is founder-reported execution
evidence; Codex did not receive or inspect Development credentials. Rollback
preservation and the synthetic-row cleanup check are included in the reported
PASS. No further database harness work is required.

The autocommit installation exception remains documented above. Committed
persistence and the committed reservation race remain untested; this acceptance
does not remove those limitations or authorize inference.

### Founder intake editing with inference disabled

`YAWRD_ENABLE_CREATION_PREPARATION=1` enables consented provider requests in
Development; it is not an intake-only activation flag. Keep it and
`YAWRD_ENABLE_CREATION_PREMIUM_TEST` disabled for intake review/editing. The existing
Creation GET/PATCH route and intake UI do not require either flag. The preparation
page's edit link also depends on installed storage and no attempt/version, rather
than on generation activation. No flag or application change is needed.

On the existing Development site, the founder can open:

```text
/create?step=intake&draft=yawrd-uorgr4yy5sxu&returnTo=preparation
```

Use the existing Account controls as `yawrd1.testnet`, edit the saved private
answers, reconfirm the first outcome if changed, and choose Save intake. The
returned “Saved revision” confirms the durable server save; a reload should show
that saved wording. Creation identity, deployed account, frozen public details,
verified payment and immutable original intake stay attached. Opening and saving
intake does not dispatch generation. The founder subsequently confirmed durable
revision 7 through the actual UI. That confirmation is separate from the rollback
harness PASS.

## P3.5R — one controlled recovery, offline checkpoint (2026-11-20)

The founder's first live `openai/gpt-6.1-sol` request on
`yawrd-uorgr4yy5sxu` used source revision 7 and failed with
`generation_output_incomplete`: Responses finish `length`, 8,000 output tokens
including 1,445 reasoning tokens, 2,539 input tokens, duration 166.067 seconds.
No version was saved. These are founder-supplied sanitized Development results;
no raw response, reasoning text, credentials or private intake was retrieved.

### Output/time policy

The original attempt and its 8,000-token/180-second policy remain unchanged.
Qwen retains the exact top-level `chat_template_kwargs.enable_thinking=false`.
Only the explicitly authorized premium recovery uses:

| Bound | Recovery | Rationale |
| --- | ---: | --- |
| Complete serialized input | 24,000 UTF-8 bytes | Existing full-request bound; no source truncation. |
| Completion budget | 16,000 tokens, including reasoning | The original exhausted 8,000, with 6,555 non-reasoning tokens. More room without removing required handoff content. |
| Provider deadline | 420 seconds | Twice the observed duration is about 332 seconds; 420 adds headroom. This is a planning allowance, not a linear latency prediction. |
| Persisted observation deadline | 450 seconds after reservation | Provider window plus checking/saving margin; expiry means uncertain, not cancelled. |
| Browser wait / route maxDuration | 480 seconds | Request-bound execution and bounded polling (160 checks maximum) accommodate the larger window. |
| Response transport cap | 256 KiB | Existing cap and strict output validation remain. |

The recovery prompt version is `creation-source-aware-recovery-v1`. It asks for
interfaces/fixtures once in references, honest task references by ID, concise
actionable clauses and no duplicated Blueprint/task lists in Skill instructions.
It preserves every source constraint, complete handoff, dependency, deliverable
and observable acceptance/evidence check. No forced task count or architecture,
AI repair pass, fallback provider, GPT thinking override or automatic retry is
introduced. The provider request remains Responses with `store:false`, no tools
and no streaming. The same validators and exact supplied verified facts apply.

The actual Development host is founder-confirmed Rig `npm run dev`, localhost
port 3000. The installed local Next/Node server has no configured response/socket
timeout; the route's maxDuration declaration is not a durable execution worker.
The process/browser must remain alive. Model completeness and seven-minute
latency are not guaranteed offline, and hosted/proxy execution caps are not
certified. Slow database calls or interruptions can still produce uncertainty;
they never release an attempt. Existing original attempts retain their old bounds.

### Additive recovery and separate authorization

`docs/proposals/migrations/phase2_creation_preparation_recovery.sql` is an
**unapplied** proposal: one table, six SECURITY INVOKER functions and two triggers.
It is installed only after separate founder authorization, after the three
accepted P3.5 proposals, in one owner-controlled Development transaction. It does
not replace historical functions, migrate/reset/delete attempts, backfill rows or
change P3.4 data/grants. Runtime gets SELECT, scoped INSERT and only the four
status UPDATE columns. PUBLIC execution is revoked; DELETE/TRUNCATE is absent.
The existing trusted-server/direct-SQL limitation remains unchanged.

`creation_preparation_recoveries` has one row per Creation, a unique UUID and a
unique parent reference to the original attempt. Eligibility requires the exact
Creation, founder and DAO, current revision 7, no artifact, and the original
confirmed GPT Responses output-limit failure (finish length, 8,000 output tokens).
Unknown/interrupted original attempts are ineligible. The original source text
is reused byte-for-byte and its digest preserved; no private source reaches the
browser. Original failure, metadata and existing intake lock remain untouched.

Recovery requires explicit founder POST action `recover` with
`creation-partner-recovery-v1` consent through the existing preparation API. Both
existing preparation/premium flags and the pinned binding must authorize the
test. No additional flag or credential-management mechanism is added. The server
and SQL reject arbitrary browser models, parents, source revisions or limits.
Reservation uses the existing Creation lock; duplicate/concurrent actions lose
without dispatch. Recovery status and validated version-1 insertion commit
atomically in the proposed writer. Generated provenance records `recoveryOf`;
the existing founder edits/exact approval workflow follows without another call.

The UI offers recovery only after the expected new table/functions/enabled guard
are installed and the server declares eligibility. Failure alone does not enable
a new request. Once a recovery is reserved, every outcome consumes it; neither a
failed nor uncertain recovery exposes a second recovery. Late completion of the
same in-flight uncertain request can save a valid result, without new inference.
This controlled exception does not close the general recovery-policy gate before
YAW-003.

### Progress feedback

Only the currently observed active stage pulses; completed checkmarks use
`#c2dedd`, terminal states stop animation, and reduced-motion disables it. Failure
has the heading “Preparation failed — no Blueprint saved” and a failed final
indicator. The result/observation time of “Check preparation status” appears
directly below its control. Delayed status cannot regress an accepted stage or
replace recovery progress with an older original-failure projection.

Terminal state is applied before optional intake-summary work. Summary failures
do not suppress it. A POST only reports saved when a saved artifact is confirmed.
Saved versions automatically reveal the existing review/editor/approval view;
initial failure, preparing, saved and uncertainty have distinct feedback.

### Focused offline evidence and activation boundary

The new eight recovery tests plus 28 preparation-generation tests passed; the
14 preserved review/approval tests passed separately. TypeScript passed. One
targeted browser scenario passed using synthetic server state and blocked external
traffic: failed original, explicit recovery consent, one dispatch, status beside
its control despite optional-summary failure, active pulse/reduced motion,
waiting/checking/saved transitions, original metadata preserved, automatic review,
founder editing and exact-version approval. SQL assertions inspect constraints,
authorization/parent/source pins and atomic writer structure. Query doubles model
serialization and immutability; they do not prove installed PostgreSQL behavior.

Separate founder authorization is required for Development installation and a
narrow check of the new recovery objects (including duplicate reservation,
original-failure preservation and atomic result persistence). Do not rerun or
reinstall accepted database infrastructure. After that, founder authorization of
the recovery consent point is required before one genuine inference. The founder
will supply the different API key privately when restarting the local server;
Codex does not request, inspect, store or change it.

No live provider call, spending, database connection/mutation, migration execution,
wallet action, commit, push or deployment occurred during this offline assignment.
