# P3.8 one-step Launch revision — implemented review, blocked publication

## Baseline

Worktree: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
The accepted working tree included modified and untracked P3.5–P3.8A work.
Those changes were preserved as the baseline. No branch switch, commit, push,
merge, database access, installation, transaction, inference or publication ran.

## Delivered revision

The existing `/create/[id]/launch` page now has the requested heading/subtitle,
one compact readiness summary, a collapsed exact name/description preview, one
publication-consent checkbox and one Launch action. No extra page or confirmation
modal was added. Ordinary content fits the tested 1440×900 desktop viewport.
Account/reserve observations, source metadata and technical explanations remain
in Advanced. Existing contribution styles provide focus and reduced-motion rules.

The verified deployment name remains separate from the private Blueprint title.
Both name and description in the proposed public payload come exclusively from
the deployed initializer snapshot. The preview includes exactly those two fields;
private Blueprint text, tasks, notes and intake are excluded. Consent is cleared
on reload/readiness refresh or Account change and is never automatically restored.

The server reads only the current intake's `answers.intendedBudget` for funding
classification through existing founder-authorized `creation_read`. The explicit
`no-money-needed` value yields “No contributor payouts planned.” All other values
remain unresolved, including declared budget ranges; a project budget is not a
reward commitment. No name/ID-specific override, free-text inference, balance-based
budget or unpaid-work consent was introduced. The intake answer is not added to
the public preview. Live Community Tool Library records were not queried.

The uninstalled P3.8A preparation table is no longer read or written by runtime.
Draft choices, selectors, Save action and draft success state were removed. Its
SQL proposal is retained with a **SUPERSEDED / DO NOT INSTALL** header. No replacement
publication schema was proposed because publication implementation reached the
explicit security stopping condition below. Accepted P3.5–P3.7 SQL is unchanged.

## Demonstrated publication blocker and stopping condition

Existing evidence, inspected as source rather than re-executed:

- `scripts/verify-creation-postgres.mjs:929` contains `direct_sql_limitation`.
  It first checks that the repository rejects another founder, then explicitly
  demonstrates cross-founder SELECT, mutation and forged public-text review under
  the shared runtime role. Its rollback is part of the existing test; this task
  did not run that database test.
- `docs/phase2-private-creation-p1.md:104` describes the trusted-server boundary:
  SECURITY INVOKER functions need underlying table privileges and have no RLS
  protection against the privileged runtime. `creation_founder` authorizes through
  the session table, not an independently isolated database principal.
- Existing P3.5/P3.7 grants likewise retain the accepted direct-SQL boundary.
  Reusing their review records as publication authority would not resolve it.

The user explicitly designated this limitation a real activation gate and required
stopping the affected implementation if it prevents safe publication. Therefore
**generalized publication/discovery writes were not implemented or enabled**.
The Launch button remains disabled with a visible blocker; checking consent cannot
enable it. The HTTP POST path checks session, founder access, exact field allowlist,
explicit consent and current source, then unconditionally rejects publication with
`launch_publication_blocked` (409). No caller-supplied field or environment flag can
turn this into a write. There is no simulated success or public link.

This means the genuine publication/discoverability acceptance criterion is **not
met**. Safe review UX is complete; real publication remains blocked. No claim is
made about publication idempotency, durable consent receipts or actual visibility.

The smallest corrective scope is an authorization boundary for publication whose
founder consent and source approval cannot be forged through the existing shared
runtime's cross-founder direct-SQL access. Its verification must turn the existing
cross-founder read/mutation/forged-review demonstration into denial for the evidence
and write path used by publication. An extra checkbox, consent version, or invoker
function over the same forgeable evidence is insufficient. This correction needs
separate targeted implementation and authorized database acceptance; it was not
expanded into a general architecture redesign or changes to accepted schemas.

After that gate, the remaining publication connection is a single immutable
consent/publication receipt bound to exact payload and current source, plus a
closed-participation public projection and discovery entry. No second private
preparation record is needed. This connection was stopped, not implemented here.

## Existing publication capabilities inspected

Genesis `ParticipantRepository.publishGenesis` uses exact canonical identity/text,
explicit consent, a NULL `published_at` guard and retry receipts, but is fixed to
Genesis. WordWake public projection checks its specific publication/review package.
Neither can safely be called for arbitrary Creations. `toPublicYawrd` provides a
public-field allowlist, but is presentation rather than authorization/persistence.
The landing discovery in `app/page.tsx` explicitly adds Genesis/WordWake. The public
project route and participant repository also serve existing participant behavior;
blindly creating an ordinary project row could expose applications. These routes
were not modified, and no existing published project was altered.

## Exact files changed in this revision

1. `app/create/[id]/governance/governance-panel.tsx` — continuation says “Continue to launch”.
2. `app/create/[id]/launch/page.tsx` — updated page title.
3. `app/create/[id]/launch/launch-panel.tsx` — compact review/consent UI and truthful disabled Launch.
4. `src/creation/launch-preparation.ts` — exact public payload, intake funding classification; removed draft types.
5. `src/creation/launch-preparation-repository.ts` — existing-state/intake read; removed preparation storage/save path.
6. `src/creation/launch-preparation-http.ts` — source/consent checks and unconditional publication gate.
7. `docs/proposals/migrations/phase2_creation_launch_preparation.sql` — superseded header only; historical SQL retained.
8. `test/creation-launch-preparation.test.ts` — revised offline contracts and security-gate checks.
9. `test/creation-launch-preparation.browser.test.mjs` — revised one-page browser journey.
10. `docs/phase2-p38-one-step-launch.md` — this report, superseding the earlier P3.8A behavior report.

## Focused evidence

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-launch-preparation.test.ts test/creation-governance-configuration.test.ts test/creation-contribution-configuration.test.ts test/creation-preparation.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none test/creation-launch-preparation.browser.test.mjs test/creation-governance-configuration.browser.test.mjs
git diff --check
```

Results: 45 focused unit/contract tests passed; TypeScript passed; both browser
journeys passed; tracked whitespace checks passed. The browser harness required
permission to bind its disposable loopback server after the sandbox denied that
bind; the authorized rerun passed. All browser external traffic is blocked and
API records are synthetic. No live database, RPC or wallet actions were performed.
The obsolete RPC endpoint test was not run or changed.

Tests cover exact public preview, intake no-funding vs unresolved terms, mandatory
consent/source/readiness checks, unconditional server publication denial, no
preparation table dependency, other-founder/Steward/expired session denial,
stale private responses after Account changes, consent reset on reload, default
collapsed details, keyboard focus, reduced motion, no overflow at 320/390/768/1440px,
and ordinary workflow within a desktop viewport. The eight revised launch tests
are included in the 45 total. The existing funding-reader injected-response test
continues to pass; balances are shown only under Advanced.

Screenshot reviewed: `/tmp/yawrd-p38-revision-desktop.png`. The fixture server does
not serve the shared shell logo asset; no shell asset changes were made.

## Before a real Launch

No further founder-facing stage is required. The founder still needs to review
and authorize the exact deployed public name/description once safe publication is
available. The security gate needs resolution and authorized acceptance before a
real Launch can be offered. The known no-payout decision does not need repeating
and grants no unpaid-work consent. Nothing publishes Community Tool Library,
activates applications/tasks, promises later funding, authorizes payments, or
executes YAW-003. Work stops at this revision and evidence.
