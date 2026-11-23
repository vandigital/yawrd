# P3.8 — Correct proposed public-profile source mapping

## Baseline and scope

Worktree: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
The modified/untracked working tree, including the v3 template and accepted
P3.5–P3.7, was preserved. This is a source-mapping correction; no layout, styles,
shared public presentation, task reader, schema or authorization system changed.
This report supersedes prior P3.8 reports' deployed-name/description mapping.

The supplied live facts (intake revision 7, approved Blueprint 1, contribution
configuration 1 and the Community Tool Library title) remain the accepted context.
They are not hardcoded selectors. No database was accessed, no contradiction was
observed, and no PostgreSQL investigation was conducted.

## Authoritative contract and exact field mapping

`PreparationArtifacts` in `src/creation/preparation-contract.ts` defines:

| Artifact field | Meaning / use in this correction |
| --- | --- |
| `blueprint.title` | Authoritative approved project title → proposed public `name` |
| `blueprint.summary` | Approved project overview → proposed public `description`, copied exactly |
| `blueprint.outcome` | Intended result/objective; not used to generate or supplement description |
| `blueprint.scope`, `boundaries`, other planning fields | Not used for the public profile |

This interpretation also matches the accepted preparation Skill export, which
labels summary “Project overview” and outcome “Intended outcome.” Approval checks
require title, summary and outcome to be nonblank. No private notes, intake prose,
Skill purpose, deployment purpose or task text is concatenated or inferred into
the description. Exact whitespace/wording of the chosen approved fields is retained.

The proposed title therefore follows the approved Community Tool Library project
title when that approved artifact is read; it no longer comes from `Yawrd Public
Beta Test`. The actual description is the exact approved `blueprint.summary` value,
not an invented replacement description. Its live text was not queried here.

## Read path, latest approval and task consistency

The existing founder-authorized Launch context continues to obtain verified
Creation, deployment and governance state. It now selects `profile` from the
`approved` member of the existing `creation_contribution_read(session,id)` result.
That installed function's accepted SQL joins preparation versions with preparation
approvals, compares their content digests, and orders approved revisions descending.
It is not a latest-draft query, limited version-history lookup or intake fallback.
Later unapproved derivatives do not replace the approved profile.

The Launch adapter validates that approved artifact using the existing preparation
contract and recomputes its canonical SHA-256 digest before projecting title and
summary. Raw artifact JSON is discarded server-side and not returned to components.
Blank title/summary produces `launch_profile_required`, with guidance to edit and
approve the Blueprint. Invalid artifacts/checksums fail closed.

The separate existing `ContributionConfigurationRepository.read` remains unchanged.
Tasks still come from the exact approved source bound to saved P3.6 configuration.
The v2/v3 contribution revision/digest, preparation revision/digest and identity
checks remain. The profile's latest approved revision/digest must also agree with
the contribution reader's latest approved source, preventing mixed snapshots.

When a newer Blueprint is approved before contributions/governance are reviewed,
its profile can be shown as proposed content, while saved tasks remain tied to the
prior approved configuration. Readiness is false and the existing review-required
message is shown. There is no silent task carry-forward or configuration mutation.

## One profile in Launch review and complete preview

`LaunchSource.publicName/publicDescription` now hold the proposed profile from
approved title/summary. `publicLaunchPreview` still selects only those two public
fields, and that same result feeds `proposedYawrdPreview` for the full visitor page.
Thus Launch's title, exact-field disclosure, preview header and sidebar agree.
No visitor-facing component or v3 layout/CSS was changed.

The Launch copy identifies the approved Blueprint as the proposed profile source
and continues to say that expanded task publication needs separate review/consent.
Blueprint approval is not public-release authorization. The richer task projection
still excludes internal acceptance evidence/private planning and remains founder-only.

## Deployment history remains separate

The verified deployment initializer `plan.initializer.config.name` and `purpose`,
and verified `dao_account_id`, are now returned separately as `LaunchView.deployment`.
Their account must match the existing verified binding. They are explicitly shown
under Advanced as historical deployed name, historical purpose and project account.
They are never renamed or written. The proposed public profile does not change
the DAO or deployment metadata.

## Source changes and publication consent

The reviewed Launch source now includes `profileSource` with approved revision,
artifact digest, `nameField: blueprint.title` and `descriptionField: blueprint.summary`.
The existing server comparison of the complete source therefore rejects an old
payload after a new approval, even when the visible title/summary are unchanged.
The existing client clears consent on fresh reads/preview entry and on Account
change. Browser tests show that refresh after a new approval clears the checkbox
and keeps Launch disabled; unapproved derivatives leave the profile unchanged.

No public identity or durable publication consent exists to update in this slice.
Publication remains disabled and the existing server-side 409
`launch_publication_blocked` is unchanged. No public project/discovery write or
security-gate remediation was introduced.

## Exact files changed

1. `src/creation/launch-preparation.ts` — explicit profile source provenance and separate historical deployment metadata in private Launch view; profile projection documentation corrected.
2. `src/creation/launch-preparation-repository.ts` — approved artifact selection/validation, title/summary mapping, cross-read source checks and historical deployment separation.
3. `app/create/[id]/launch/launch-panel.tsx` — consistent proposed-profile wording and Advanced historical metadata; layout and publication blocker retained.
4. `test/creation-launch-preparation.test.ts` — field mapping, historical identity preservation, source-change/approval tests and updated projection expectations.
5. `test/creation-launch-preparation.browser.test.mjs` — review/preview agreement, Advanced deployment fields, unapproved-derivative handling and renewed consent after approval.
6. `docs/phase2-p38-public-profile-mapping.md` — this report.

`src/creation/yawrd-preview.ts`, accepted P3.6 readers/contracts, Genesis/WordWake,
public routes, schemas and migration proposals were not changed.

## Focused evidence

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-launch-preparation.test.ts test/creation-contribution-configuration.test.ts test/public-yawrd.test.ts test/project-experience.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none test/creation-launch-preparation.browser.test.mjs
git diff --check
```

Results: **48/48 focused tests passed; TypeScript passed; browser journey passed;
tracked whitespace checks passed.** Query adapters and browser records are synthetic;
no real database, public RPC, inference or wallet actions ran. The browser uses the
existing offline harness with external traffic blocked.

Evidence covers exact summary/title mapping without outcome/notes concatenation,
immutable historical deployment metadata, agreement between Launch and full
preview, continued saved-task source binding, new approvals with changed and
unchanged visible text invalidating prior sources, blank-summary failure without
fallback, approval-only selection, and the existing P3.6 many-unapproved-derivative
regression. Browser checks retain source/privacy, Account/session/stale-response,
responsive/template/accordion/funding/progress and disabled Launch assertions.
Existing public fixture, Genesis and WordWake rendering checks pass.

## Description and persistence requirements

There is no unresolved description-contract gap: approved `blueprint.summary` is
an identifiable suitable overview field. There is no need for separate durable
public-profile editing to implement this correction. The existing Blueprint edit,
save and approval flow can change title/summary, with its existing revision and
renewed contribution/governance review requirements. A missing overview would use
that same flow rather than a new table or a parallel source of truth.

The founder still must explicitly review the proposed name, summary and task
presentation before any future publication. Live visual acceptance remains with
the founder; offline fixtures do not replace it. No database access/mutations,
migrations, commits, pushes, deployments, inference, wallet transactions,
publication, spending or YAW-003 execution occurred. Work stops at this bounded
source-mapping correction.
