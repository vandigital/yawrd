# P3.7 private founder governance configuration

## Baseline and scope

Actual worktree: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
The worktree already contained substantial modified/untracked P3.2–P3.6 work,
including the accepted contribution page, persistence and simplified UX. Those
files were treated as the baseline, rather than interpreting HEAD alone as the
accepted state. Only the contribution panel continuation was added to an existing
file; the other ten P3.7 files below are new. The preservation worktree was not
modified. No commits, branch switches, pushes or merges were performed.

The founder's reported Community Tool Library acceptance (approved Blueprint 1,
contribution configuration 1) remains the accepted product baseline. No database
inspection was performed to rediscover that record. P3.6's earlier documentation
about pending installation is historical, not evidence that accepted P3.6 storage
is still uninstalled.

## Behavior and capabilities reused

After current contribution choices are saved, **Continue to work approval** opens
`/create/[id]/governance`. Unsaved edits and an unreviewed newer Blueprint hide
that continuation. The new screen has a single supported confirmation:
founder-led review, with existing Project Rules separately governing rewards.
No role picker, voting configuration or new reviewer authorizer is introduced.

The screen records an intended review arrangement, subject to verified authority
before actual acceptance. It does not claim that the private Creation already has
an active generalized contribution-acceptance endpoint. A deployed Steward role
is never treated as contribution-review permission. Founder acceptance, reward
authorization and verified treasury settlement remain separate.

Reused boundaries and patterns:

- `creation_preparation_access` and `creation_contribution_read` provide live
  founder/session enforcement and existing verified deployment/payment bindings.
- Genesis `ContributionRepository.acknowledge` restricts human acknowledgement to
  the verified project creator. `src/rewards/context.ts` and `payout.ts` separately
  require eligible Stewards, matching reward evidence, votes and causal settlement.
- WordWake's existing public projection checks founder/project bindings and says
  accepted work and separate Steward approval are required before payout. P3.7
  does not add a generalized WordWake or Genesis acceptance/payout workflow.
- The P3.6 Account header, session checks before/after private responses, owner
  checks, abort controllers, response epochs, focus/visibility rechecks and
  Development-only database routing are reused in the new component/API.
- The existing contribution stylesheet and Creation journey provide responsive
  layout, native labels, keyboard focus, status/alert feedback and reduced motion.

Only the founder account is exposed in the ordinary flow. Project contract IDs,
verification bindings, revisions and consent metadata are under closed Advanced
information. Saved verification evidence is described as historical binding,
not a fresh DAO membership/policy check. No actual authorization conflict was
found in the inspected paths; configuration itself grants no acceptance powers.

## Durable configuration and installation boundary

`docs/proposals/migrations/phase2_creation_governance_configuration.sql` is an
**unapplied additive Development SQL proposal**, requiring separately authorized
installation. It adds one private table, three functions and two triggers, using
existing P3.5/P3.6 schema, runtime role and `prevent_mutation()`.

Rows bind the fixed founder-led decision and explicit consent version to the
Creation, the exact saved contribution revision/digest, approved Blueprint
revision/digest, verified founder/project identity and deployment/payment evidence.
Source changes preserve earlier confirmations and require renewed confirmation.
Changed identity or verification bindings block rebinding. Blueprint changes must
first be reviewed and saved through accepted P3.6 behavior.

Saves reuse the existing Creation row lock, verify the expected governance
revision, recheck the exact current source inside SQL, and support identical
lost-response retries without duplicate revisions. Triggers enforce source and
binding consistency and immutable history. Runtime grants permit SELECT and only
specified INSERT columns; timestamps are database-derived. The existing trusted
server/direct-SQL boundary remains; no per-wallet RLS claim is made.

HTTP rechecks the current session and Account header before/after repository
operations, authorizes the owner before reading write bodies, rejects extra
fields and bounds bodies to 2048 bytes. No caller-supplied role, founder, project
account or reward permission is accepted. Missing schema fails closed with a
Development installation message; there is no local-storage persistence fallback.

**Real founder persistence acceptance requires authorized installation of this
new SQL proposal and a subsequent founder save/reload check.** Offline model and
browser tests do not certify PostgreSQL function execution, durability, concurrent
locking or privileges. No database was accessed or mutated in this implementation.
The implementation is ready for that installation/review stage, with the existing
regression mismatch below recorded separately.

## Exact files changed for P3.7

| File | Change |
| --- | --- |
| `app/create/[id]/contributions/contribution-panel.tsx` | Add continuation only for saved, current choices. |
| `app/create/[id]/governance/page.tsx` | Development-only private route. |
| `app/create/[id]/governance/governance-panel.tsx` | Founder confirmation, Saved state, Account lifecycle and Advanced evidence. |
| `app/api/creations/[id]/governance/route.ts` | Development database guard and GET/POST routing. |
| `src/creation/governance-configuration.ts` | Narrow view/source/consent contract. |
| `src/creation/governance-configuration-repository.ts` | Read/save bindings, validation and safe errors. |
| `src/creation/governance-configuration-http.ts` | Founder session/Account/origin/body enforcement. |
| `docs/proposals/migrations/phase2_creation_governance_configuration.sql` | Unapplied additive persistence proposal. |
| `test/creation-governance-configuration.test.ts` | Nine offline repository/HTTP/SQL-contract tests. |
| `test/creation-governance-configuration.browser.test.mjs` | Existing Chromium harness adapted to the actual P3.7 journey. |
| `docs/phase2-p37-governance-configuration.md` | This evidence and installation boundary. |

## Focused evidence

All commands below ran without database access, inference, broadcasts or wallet
transactions. Browser records are synthetic and survive reload only in the
disposable test session; they are not a real persistence acceptance result.

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-governance-configuration.test.ts test/creation-contribution-configuration.test.ts test/creation-preparation.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none test/creation-governance-configuration.browser.test.mjs test/creation-contribution-configuration.browser.test.mjs
git diff --check
```

Results: **37/37 focused tests passed**, **TypeScript passed**, **2/2 browser
journeys passed**, and **tracked whitespace check passed**. Browser checks include
saved contribution navigation, checkbox gating, save/reload, hidden technical
metadata, newer contribution/Blueprint review, retained confirmation on conflicts,
delayed GET/POST responses after Account changes, other founder/Steward denial,
session expiry, no overflow at 320/390/768/1440px, and reduced motion. All external
traffic is blocked; API audits allow only auth and private configuration calls.

Reviewed screenshot artifacts: `/tmp/yawrd-p37-desktop.png` and
`/tmp/yawrd-p37-mobile.png`. These are offline harness renders; the shared shell's
logo asset is not served by that fixture server. No shell asset changes were made.

Additional existing contribution/payout regressions ran with:

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none --test-skip-pattern="inactive SQL" test/creation-governance-configuration.test.ts test/creation-contribution-configuration.test.ts test/creation-preparation.test.ts test/reward-payout.test.ts test/contributions.test.ts
```

Result: **112 passed, 1 failed** (113 executed). The unchanged test
`test/reward-payout.test.ts:335`, “read-only transport adds evidence reads without
permitting broadcasts,” asserts `https://rpc.testnet.near.org`. The pre-existing
uncommitted `src/creation-integration.ts:69` already uses
`https://test.rpc.fastnear.com`. The failure occurs in the mocked fetcher URL
assertion, with no real request. Neither file was changed for P3.7. This is a
verified baseline test mismatch, not a reason to alter the accepted RPC behavior
within the governance task. Other executed acceptance/reward tests passed.

No work activation, applications, publication, reward proposals, payouts,
contracts, Production resources or YAW-003 state were changed. There is no funding
or launch action on the new page. Work stops at this P3.7 implementation and
focused evidence.
