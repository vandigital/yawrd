# P3.8 founder preview v3 — accepted template correction

## Verified baseline

Worktree: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
The modified/untracked working tree, including accepted P3.5–P3.7 and the v2
projection/preview, was preserved as the implementation baseline.

## Template reuse and corrected presentation

The generalized visitor presentation now uses the same `ProjectSpaceShell`
main/sidebar grid and section navigation as Genesis/WordWake. It directly reuses
`genesis-project.module.css` for overview sections, serif headings, section kickers,
sidebar information, reward amount treatment, governance/participation blocks,
resource empty state and detail disclosures. The existing `ProjectCover` is retained.

The inspected published implementations use `ProjectDeliverableCard` with native
details elsewhere for contextual evidence. The requested thin task accordions are
a small new shared primitive, `ProjectDeliverableAccordion`, alongside that card
in `project-space-shell.tsx`. They reuse the shell palette, borders and focus rules.
No published caller was switched to the accordion and no published page was cloned.

The approved compact header is unchanged: deployed identity on the left, status,
right-side Accepted deliverables indicator and sea-green cover. The large buoy
remains omitted. The tested desktop header stays within 180–220px. The indicator
still says **Not started**, with the actual selected planned count and no invented
accepted count. Preparation/configuration approval is never completion evidence.

The page has:

- Overview/description disclosure without repeating full description by default.
- Planned work as a full-width, single-column native accordion list. Collapsed rows
  show task number/title, planned/not-active status, allocation and reward-term
  state, and an expand indicator. Expanded rows show full summary once, prominent
  deliverables and dependencies. They do not truncate expanded content.
- A Project information sidebar with public name/network, total allocation,
  reward-allocation disclosure, intended founder review and closed participation.
- Project Resources with a truthful empty state. No approved public-resource source
  is connected, so private references or Skill contents are not substituted.
- Build Progress with Not started and selected planned-task count.
- Read-only Participation. No Join/Apply/Claim/Submit or payout actions exist.

Founder/unpublished/publication-approval notices remain in the existing outer
preview toolbar. `YawrdIdentityPresentation` contains visitor-facing content and
has no founder-preview mode or authorization behavior. The same projection and
component can be used by a future authorized public caller without a parallel
visual implementation. No publication caller was created in this task.

## Allocation and privacy semantics

The existing intake-derived `none-planned` funding state produces **0 NEAR
allocated** per task and total, following the prominent amount convention already
used in WordWake. These are zero allocations, not agreed reward amounts or bounty
claims. The actual saved P3.6 `rewardTerms` is projected separately:

- `undecided` becomes **Reward terms undecided**.
- A saved private unpaid choice becomes **Participation terms need public review**;
  private acknowledgement/notes are not projected as public agreements.

For unresolved funding, allocation is **Not set**. No generalized verified reward
allocation reader exists in this path; no nonzero amount is rendered or invented.
WordWake's fixed allocation/identity/task IDs are never imported into generalized
projection code. DAO account observations and setup fees are not used as allocations.
The existing no-payout status remains explicit and creates no unpaid-work consent.

The v2 authenticated readers/source checks remain unchanged:
`LaunchPreparationRepository.read` → `ContributionConfigurationRepository.read`
→ `creation_contribution_read`, followed by `proposedYawrdPreview`. Included
approved-source tasks, deliverables and dependencies come from those readers, not
hardcoded project text or test fixtures. No fresh database inspection was performed.

The proposed projection now excludes **both internal acceptance checks and full
acceptance evidence**, because neither is approved for visitor presentation. It
also continues to exclude raw Blueprint/intake/configuration, source digests,
private notes, reference contents, Skill, reward notes and model provenance. The
UI accurately notes that acceptance criteria are not published. Task names and
content remain proposed, founder-only material pending explicit expanded-publication
approval; this assignment does not grant that approval.

The current publication payload remains deployed name/description only. The
existing Launch review still shows the private/deployed-name discrepancy. There
is no rewriting of the supplied live identity (`Yawrd Public Beta Test` / `Public
evidence of the Yawrd creation process`) or substitution of the private Community
Tool Library title. Actual live values continue to come from verified runtime
readers; they were not queried or hardcoded here.

## Exact files changed in v3

1. `app/components/yawrd-identity-presentation.tsx` — accepted section/sidebar composition and task disclosures.
2. `app/components/yawrd-identity-presentation.module.css` — small content/allocation typography helpers; removed v2 card-grid design.
3. `app/components/project-space-shell.tsx` — added the shared read-only `ProjectDeliverableAccordion`; existing shell/card callers unchanged.
4. `app/components/project-space-shell.module.css` — appended disclosure-row styles; compact header and accepted public styles unchanged.
5. `src/creation/yawrd-preview.ts` — separate allocation/reward-term labels; removed internal acceptance checks/evidence from the proposed projection.
6. `test/creation-launch-preparation.test.ts` — template/privacy/allocation regression assertions.
7. `test/creation-launch-preparation.browser.test.mjs` — sidebar/navigation/accordion/allocation checks and v3 screenshots; existing session/stale-response checks retained.
8. `docs/phase2-p38-founder-preview-v3.md` — this report.

No API, authorization, source-reader, schema, persistence, public route, discovery,
Genesis or WordWake implementation was modified. The server-side
`launch_publication_blocked` response and disabled Launch remain intact.

## Before/after screenshots

| Size | Before (v2) | After (v3) |
| --- | --- | --- |
| Desktop | `/tmp/yawrd-founder-preview-v3-before-desktop.png` | `/tmp/yawrd-founder-preview-v3-desktop.png` |
| Mobile | `/tmp/yawrd-founder-preview-v3-before-mobile.png` | `/tmp/yawrd-founder-preview-v3-mobile.png` |

Screenshots were visually reviewed. They use the offline synthetic seed-survey
records to show the template correction, not the live Community Tool Library.
The runtime has no fixture imports. These screenshots and tests are **not founder
live visual acceptance**; that acceptance remains with the founder.

## Focused verification

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-launch-preparation.test.ts test/public-yawrd.test.ts test/project-experience.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none test/creation-launch-preparation.browser.test.mjs
git diff --check
```

Results: **29/29 presentation/authorization tests passed; TypeScript passed; browser
journey passed; tracked whitespace check passed.** The browser check verifies:

- Three included tasks as thin, same-width, vertically stacked disclosures.
- Task number, inactive state, zero allocation and undecided reward terms.
- Expanded deliverables/dependencies; internal acceptance fixtures absent from DOM.
- Project sidebar, section navigation (including Resources anchor), resource empty
  state, compact 180–220px header and right-side progress.
- 320/390/768/1440px layouts, reduced motion, focus and return navigation.
- Other-founder/Steward denial, expired session, Account switching with preview open,
  delayed stale responses, and still-disabled Launch with no publication POST.

The presentation tests additionally verify excluded/empty tasks, unknown funding
as Not set, private unpaid choices not being presented as public agreements, exact
name/description publication projection, private-field exclusion, arbitrary accepted
task wording and stale/mismatched source rejection. Existing Genesis/public fixture
checks and direct WordWake render regressions pass. No new test infrastructure was
added; query adapters and browser records remain synthetic and external browser
traffic is blocked.

No genuine implementation blocker remains for this bounded template correction.
No database access/mutations, migrations, commits, pushes, deployments, inference,
wallet operations, publication, spending or YAW-003 execution occurred. Work stops
at v3 implementation and focused evidence; live acceptance is pending founder review.
