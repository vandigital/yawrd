# P3.8 founder preview v2 — complete proposed project page

## Baseline

Worktree: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
Existing modified/untracked P3.5–P3.8 work, including the first founder preview,
was preserved as the baseline. No branches, commits or accepted milestones changed.

## Result

The existing founder preview now renders a complete proposed project page:

- Compact header with deployed name/description, Unpublished/Testnet status and
  a right-side Accepted deliverables indicator. The desktop browser check verifies
  header height between 180 and 220px. Mobile stacks the indicator beneath identity.
  The large buoy illustration is omitted; existing sea-green cover treatment remains.
- About this Yawrd uses deployed description, not the private Blueprint title.
- Included tasks become proposed, inactive cards with approved titles/briefs,
  dependency labels and collapsed deliverables/acceptance checks with evidence.
- Work progress says **Not started**, with the actual included planned-task count.
  The acceptance value is deliberately `null`: no generalized verified acceptance
  record source is connected. Blueprint approvals, saves and governance confirmations
  never become completed-work counts. No fictitious 0/0 or accepted record is shown.
- Participation describes intended founder-led review subject to verified authority,
  separately authorized payments, closed applications/task participation, and the
  intake-derived payout plan. No funding is interpreted as unpaid-work consent.

The reusable `ProjectSpaceShell`, `ProjectCover` and `YawrdIdentityPresentation`
remain the presentation boundary. The compact variant is opt-in. Existing
Genesis/WordWake callers do not select it and retain their existing presentation,
progress and participant behavior. No project-specific IDs or reward data were
imported into the generalized preview.

## Actual runtime data sources and projection

`LaunchPreparationRepository.read` continues to use `LAUNCH_CONTEXT_SQL`, calling
existing `creation_governance_read`, `creation_deployment_read`, and `creation_read`
under authenticated founder access. It obtains deployed `plan.initializer.config`
`name` and `purpose`, saved governance revision, contribution/Blueprint binding and
intake `answers.intendedBudget`. Governance remains founder-led; the explicit
`no-money-needed` budget maps to **No contributor payouts planned.** Other budget
selections leave funding/payout terms unresolved.

It now also calls the existing `ContributionConfigurationRepository.read`, backed
by `yawrd.creation_contribution_read(session,id)`. That established reader selects
saved configuration with its exact approved source and validates artifact digest,
configuration digest, task membership, founder and saved revision. It does not use
the latest unapproved Blueprint derivative as the task source.

The launch adapter checks that this read agrees with the readiness snapshot:
contribution revision/digest, preparation revision/digest and verified Creation
binding. Mixed revisions or identity fail with `launch_source_changed`. A newer
approved Blueprint without an updated configuration leaves readiness false and
shows the existing review-required message; it does not silently switch task text.

`proposedYawrdPreview` is a separate field-by-field presentation projection:

| Input field | Proposed presentation |
| --- | --- |
| Deployed name/purpose | `name`, `description` |
| Saved configuration `tasks[].included` / `taskId` | Select which approved-source tasks appear |
| Approved-source task `id`, `title`, `brief` | Card key, title, short clamped summary; full brief in details |
| Approved-source `dependencies` | Included task titles; excluded prerequisites get a generic explicit warning |
| Approved-source `deliverables` | Expanded deliverables list |
| Approved-source `acceptanceCriteria[].check/evidence` | Expanded checks and evidence |
| Selected task count | Planned count, not accepted count |
| Existing intake-derived funding classification | Payout planning status |

Excluded task definitions are not rendered as cards or copied into the proposed
projection. Their private titles/details are not leaked via dependency labels.
Source tasks/configuration are not rewritten. Private notes, raw Blueprint JSON,
reference contents, participation/reward notes, configuration receipts, intake,
source digests, model provenance and account bindings are excluded from props
passed to the presentation component.

There are no fixture imports, hardcoded Community Tool Library tasks or project
lookups in the runtime reader/projector/presentation. The test proves arbitrary
changed approved task wording reaches the preview, excluded/empty selections change
the plan, and mismatched saved digests fail closed. These are offline contract
checks using synthetic database adapters, not claims of live database acceptance.
The code will render three cards when the actual saved configuration includes
three tasks. The real Community Tool Library row was not read in this assignment.

## Publication and authorization boundaries

`publicLaunchPreview` remains the exact **name/description-only** publication
projection. The richer `proposed` field is founder-only proposed presentation,
not an expansion of the publication payload. Both the preview toolbar/planned-work
notice and Launch's exact-field disclosure explain that task publication still
needs separate explicit founder review and consent.

The server-side publication 409 blocker and disabled Launch action remain intact;
`launch-preparation-http.ts` was not changed. No public route, discovery entry,
publication state, participant task, application or reward record was created.
There is no new persistence or SQL proposal. The superseded preparation SQL was
not modified or installed. The separate SQL security gate remains out of scope.

The existing fresh authenticated preview read, Account matching, response epochs,
session expiry/focus checks, navigation state and return focus handling remain.
The additional contribution read reuses founder/session enforcement; another
founder or expired session cannot obtain the proposed task projection.

## Exact files changed in v2

1. `src/creation/yawrd-preview.ts` — narrow proposed-page projection (new).
2. `src/creation/launch-preparation.ts` — typed proposed presentation in the private Launch view; existing publication projection unchanged.
3. `src/creation/launch-preparation-repository.ts` — validated saved contribution read, cross-read binding checks and server projection.
4. `app/components/project-space-shell.tsx` — opt-in compact layout and explicit unavailable acceptance evidence handling.
5. `app/components/project-space-shell.module.css` — compact header/progress/layout styles only under the new variant.
6. `app/components/yawrd-identity-presentation.tsx` — About, planned tasks, progress and participation/reward sections.
7. `app/components/yawrd-identity-presentation.module.css` — scoped task cards and disclosure styles (new).
8. `app/create/[id]/launch/launch-panel.tsx` — use proposed projection and distinguish expanded preview from permitted publication payload.
9. `test/creation-launch-preparation.test.ts` — real adapter/projection, digest/source, exclusion and published-render regressions.
10. `test/creation-launch-preparation.browser.test.mjs` — three-task complete-page fixture, compact-header measurements, disclosures, excluded dependencies and existing auth/navigation checks.
11. `docs/phase2-p38-founder-preview-v2.md` — this report.

## Before/after screenshots

Before screenshots preserve the preceding identity-only preview. After screenshots
show the full proposed page, using the same offline synthetic seed-survey records.
They are not fabricated Community Tool Library evidence. All were visually reviewed.

| Size | Before | After |
| --- | --- | --- |
| Desktop | `/tmp/yawrd-founder-preview-before-desktop.png` | `/tmp/yawrd-founder-preview-v2-desktop.png` |
| Mobile | `/tmp/yawrd-founder-preview-before-mobile.png` | `/tmp/yawrd-founder-preview-v2-mobile.png` |

The old desktop header occupied approximately 475px in the saved render; the new
header satisfies the measured 180–220px target. The new focus ring in screenshots
reflects accessible keyboard focus on entering the preview.

## Focused verification

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-launch-preparation.test.ts test/public-yawrd.test.ts test/project-experience.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none test/creation-launch-preparation.browser.test.mjs
git diff --check
```

Results: **28/28 focused tests passed; TypeScript passed; browser journey passed;
tracked whitespace check passed.** Runtime data is read via injected SQL in tests;
no real database was accessed. Browser fixtures use the actual production
projection helper, selected approved-source tasks and the existing offline harness.
External browser traffic is blocked. No new testing framework was introduced.

Checks cover three included tasks, arbitrary approved task wording, excluded/empty
plans, dependency warnings, expandable acceptance evidence, exact name/description
publication payload, no invented acceptance, private-field exclusion, checksum and
cross-read source mismatch rejection, founder/Steward/other Account denial,
expiry, delayed stale responses, preview return/focus, unchanged blocked Launch,
compact right-side desktop progress, responsive 320/390/768/1440px layouts and
reduced motion. Existing Genesis/public-fixture tests and WordWake rendering pass.

No genuine implementation blocker remains for the complete private preview.
Live founder visual acceptance of Community Tool Library remains with the founder;
it was not substituted by offline fixtures. No database access/mutations, migrations,
publication, wallet transactions, inference, deployments, commits, pushes, spending
or YAW-003 actions occurred. Work stops at preview v2.
