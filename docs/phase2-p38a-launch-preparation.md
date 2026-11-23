# P3.8A — Private funding and launch preparation

## Actual baseline

Worktree: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
The accepted working tree contained extensive modified/untracked P3.2–P3.7 work,
including the simplified contribution/governance screens. Those files, rather
than HEAD alone, were the baseline. Existing modifications were preserved. The
only existing file edited for P3.8A is the governance panel continuation.

P3.6 and P3.7 installed Development persistence/save-reload acceptance is taken
as accepted. No database was accessed to repeat that acceptance. The Community
Tool Library's differing deployed public identity and private Blueprint title
are intentional and are not reconciled or renamed by this change.

## Delivered behavior

Saved, current governance now links to `/create/[id]/launch`. Three sections show
Your Yawrd, Funding and Launch, using existing contribution styles.

- Identity comes from the frozen prepared deployment's initializer name/purpose,
  gated through accepted founder/deployment/payment/governance verification.
  It never substitutes private Blueprint text for the deployed identity. A title
  mismatch is shown explicitly. Advanced describes the historical snapshot limit.
- Read-only funding observation uses the existing canonical Testnet RPC transport
  (`https://test.rpc.fastnear.com`) with bounded calls. Network, finalized block,
  account amount/locked fields and returned block hash/height are checked.
  Zero funds, an observed balance and unavailable/unverified evidence are distinct.
  Amount plus locked balance is an account observation, including reserves, not a
  spendable reward budget, funding receipt or commitment. No transfer is built.
- Setup fees are explicitly separate from Project Funds. The founder can leave
  funding undecided or choose no funding/payouts planned for the demonstration.
  That choice is not unpaid-work consent and does not alter contribution terms.
- The founder can keep preparing privately or prepare for publication review.
  Neither choice grants publication consent. The preview includes only deployed
  name, plus deployed description if explicitly selected. All private Blueprint
  content, task detail, private notes and review/funding records are excluded.
- Saving writes only private launch choices. Publication consent, public release,
  applications, tasks, agent permissions, reward authorization and payouts remain
  inactive. No publication or funding action exists on this page.

## Reused capabilities and demonstrated P3.8B gaps

Reused `creation_governance_read`, `creation_deployment_read`, accepted
founder/session checks and verification bindings. Source contains the full
identity binding, governance revision, contribution/Blueprint revisions and
digests, and exact proposed deployed public text. The accepted client lifecycle
provides Account checks, owner checks, aborts, response epochs and visibility/focus
session checks. Routes retain Development-only and database-target guards.

Genesis publication in `ParticipantRepository.publishGenesis` is scoped to its
fixed canonical project and changes `published_at` under its own consent. WordWake
uses its specific publication package, public review and reward projection.
`toPublicYawrd` explicitly allowlists public fields. Existing landing discovery
adds fixed published Genesis/WordWake entries. These boundaries were inspected;
none of their identities, treasury assumptions or publication writes were reused
as a generalized activation mechanism.

The smallest remaining P3.8B connection is a separately authorized generalized
public projection and discovery connection, bound to the exact reviewed public
fields with explicit publication consent. It must preserve closed participation
and no reward entitlement unless independently authorized. No speculative
publication engine was built. The known trusted-server/direct-SQL cross-founder
limitation remains a third-party activation gate; P3.8A does not solve it.

## Unapplied SQL proposal and persistence limit

`docs/proposals/migrations/phase2_creation_launch_preparation.sql` is an unapplied
additive Development proposal: one private table, three functions and two triggers.
It depends on accepted Creation/deployment/contribution/governance functions and
runtime role, and the existing `prevent_mutation()` function.

Saves serialize through the existing Creation lock, recheck current governance
and contribution/Blueprint sources inside SQL, compare the full public-identity
snapshot, enforce expected revisions, preserve immutable history, and allow exact
lost-response retries. Runtime gets SELECT and specified INSERT columns only;
no timestamp override or mutable grants. No existing table is changed.

Before installation, the screen can read accepted state and display a preview,
but launch-choice saving is disabled. A missing table never becomes local-storage
persistence. Real durable save/reload and PostgreSQL locking/privilege acceptance
require separate installation authorization and subsequent founder acceptance.
No migration was installed and no database query or mutation was executed during
this implementation. Offline models do not certify PostgreSQL execution.

## Exact files changed

1. `app/create/[id]/governance/governance-panel.tsx` — saved-state continuation.
2. `app/create/[id]/launch/page.tsx` — private Development page.
3. `app/create/[id]/launch/launch-panel.tsx` — founder review, choices and preview.
4. `app/api/creations/[id]/launch/route.ts` — guarded GET/POST and read-only RPC.
5. `src/creation/launch-preparation.ts` — narrow choices/source/view/preview contract.
6. `src/creation/launch-preparation-repository.ts` — existing-state reads and private save adapter.
7. `src/creation/launch-preparation-http.ts` — origin, body, session and Account enforcement.
8. `src/creation/launch-funds.ts` — pinned read-only funding observations.
9. `docs/proposals/migrations/phase2_creation_launch_preparation.sql` — unapplied proposal.
10. `test/creation-launch-preparation.test.ts` — focused offline contract tests.
11. `test/creation-launch-preparation.browser.test.mjs` — existing offline browser harness reused.
12. `docs/phase2-p38a-launch-preparation.md` — implementation and evidence report.

## Focused results

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-launch-preparation.test.ts test/creation-governance-configuration.test.ts test/creation-contribution-configuration.test.ts test/creation-preparation.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none test/creation-launch-preparation.browser.test.mjs test/creation-governance-configuration.browser.test.mjs
git diff --check
```

45/45 tests passed, TypeScript passed, both browser journeys passed and tracked
whitespace checks passed. Checks cover public field allowlisting, identity/title
mismatch, explicit description selection, no-payout planning, save/reload/retry,
source changes and racing saves, conflicting stale writes, other founder/Steward
and expired sessions, post-read revocation, account switching with delayed private
responses, no storage fallback, funding zero/positive/unknown/wrong-network and
wrong-block evidence, layout at 320/390/768/1440px and reduced motion.

Browser tests use synthetic API records, a disposable profile and blocked external
traffic. No actual database, public RPC, wallet or inference calls are made by
these tests. Runtime RPC behavior is tested with injected responses. Screenshots
reviewed: `/tmp/yawrd-p38-desktop.png`, `/tmp/yawrd-p38-mobile.png`. The copied
fixture server does not serve the shared shell logo asset; no shell asset was
modified. Live founder persistence and live funding observations were not claimed
as tested. Obsolete RPC expectation tests were not rerun or changed.

## Remaining founder decisions

Choose whether to remain private or prepare for publication review; choose whether
the deployed description belongs in the proposed preview; leave funding undecided
or select the no-funding/no-payout demonstration. Any later change to deployed
identity, inclusion of private Blueprint material, real reward terms and actual
publication needs its own explicit review/authorization. None is inferred here.

No commits, pushes, merges, migration installation, wallet actions, spending,
inference, deployments, Production/Mainnet changes or YAW-003 activation occurred.
Work stops at P3.8A.
