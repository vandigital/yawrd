# P3.8 — Founder preview of the actual Yawrd presentation

## Baseline

Worktree: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`.
Branch: `feature/phase2-private-creation-p2-postgres-20261117`.
HEAD: `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
The existing modified/untracked working tree was the accepted baseline, including
P3.5–P3.7 and the one-step Launch review. Existing uncommitted work was preserved.

## Delivered experience and reused boundary

The Launch screen now offers **Preview your Yawrd**. It rechecks existing
founder/session authorization using the authenticated Launch GET, then opens a
full-width unpublished presentation within the same screen. **Back to Launch**
returns to the final review/consent flow and restores focus to the preview button.
There is no additional route, public draft URL, mandatory stage or modal.

The smallest practical public-page boundary is `ProjectSpaceShell`, already used
by both `GenesisProjectPresentation` and `WordWakeProjectPresentation`. The preview
uses that exact shell, `ProjectCover`, and existing local Yawrd brand artwork,
through the small presentational `YawrdIdentityPresentation`. It uses the same
`publicLaunchPreview` name/description projection as the exact publication details
on Launch. This shares the accepted public layout instead of cloning historical
project pages or importing their tasks/rewards/participant controls.

The shared shell now permits omitted completion/sidebar inputs and an empty
section-navigation list, so the preview does not fabricate progress counts,
creator profiles, contributions or rewards. Existing Genesis and WordWake supply
the same props as before and retain their existing layout and content. New shell
CSS applies only to the identity-only variant. No accepted project content,
participant behavior, public route or discovery route was changed.

The default cover uses the existing dark/sea-green gradient, public shell header
and local `/brand/yawrd-buoy.webp` asset. The existing artwork slot remains the
extension point for a future approved custom cover, without restructuring the
page. No upload, generated imagery, media store or theme configuration was added.

Only verified deployed public name and description are passed into the preview
component. Private Blueprint title, private tasks/notes, configuration and source
records are absent from its props/rendered content. The preview has an explicit
unpublished founder indicator and says applications, tasks and rewards are not
active. It publishes no contributors or fictional activity. The Launch discrepancy
notice and exact-field details remain available after returning.

## Authorization and boundaries

This adds no API or authorization mechanism. The existing Development-only
Launch page/API and verified Creation authorization remain authoritative. Opening
the preview requires a fresh successful Launch response, the existing before/after
session checks, Account/founder/Creation match and response epoch checks. Other
founders, expired sessions or switched Accounts cannot enter it. Session change
and visibility/focus checks clear an already open preview. Delayed responses from
a prior Account cannot reopen it. Preview opening clears publication consent;
no consent is saved or automatically restored.

The preview is client state inside the authenticated Launch screen, not a new
public draft URL. It does not make the project discoverable. The disabled Launch
action, current-source requirements and unconditional server publication blocker
remain unchanged. The known SQL activation gate is not addressed by this UX
assignment. No persistence, schema or migrations are needed, and the superseded
preparation SQL remains untouched and uninstalled.

## Exact changed files

1. `app/create/[id]/launch/launch-panel.tsx` — preview entry/return, fresh authorized read, state clearing and focus handling.
2. `app/create/[id]/launch/preview.module.css` — scoped preview container, return toolbar, focus and reduced motion.
3. `app/components/yawrd-identity-presentation.tsx` — small public-identity composition using the accepted shell/cover/brand.
4. `app/components/project-space-shell.tsx` — allow omission of unavailable progress, sidebar and section navigation.
5. `app/components/project-space-shell.module.css` — identity-only layout variant; published variants unchanged.
6. `test/creation-launch-preparation.test.ts` — actual shell rendering/private-field exclusion and WordWake regression.
7. `test/creation-launch-preparation.browser.test.mjs` — preview navigation/authentication/layout checks; serve the existing local brand asset in the offline fixture.
8. `docs/phase2-p38-founder-preview.md` — this implementation/evidence report.

## Focused verification

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-launch-preparation.test.ts test/public-yawrd.test.ts test/project-experience.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none test/creation-launch-preparation.browser.test.mjs
git diff --check
```

Results: **26/26 focused tests passed**, **TypeScript passed**, **browser journey
passed**, and **tracked whitespace checks passed**. The offline test query adapters
and browser API fixtures use synthetic records; no actual database, RPC or wallet
operations were run. All external browser traffic is blocked. The local fixture
serves existing brand artwork and the actual relevant CSS Modules.

Checks cover fresh authorization on preview entry, exact deployed identity,
private-field exclusion and escaping, no invented counts/profiles/actions,
return navigation/focus, retained disabled Launch, consent clearing, other founder
and Steward denial, expired session on focus, Account switching with preview open,
and delayed preview responses after Account changes. Responsive checks cover
320/390/768/1440px without document overflow; reduced motion and keyboard focus
remain supported. Existing public-fixture/Genesis checks and a direct WordWake
render verify their accepted presentation remains intact.

Reviewed screenshots: `/tmp/yawrd-founder-preview-desktop.png` and
`/tmp/yawrd-founder-preview-mobile.png`. These are synthetic offline renders,
not evidence of publication or a live database acceptance test. Final generalized
publication is still blocked and was not implemented here.

No genuine blocker remains for this private-preview deliverable. No commits,
pushes, deployments, database access/mutations, SQL installation, inference,
spending, wallet transactions, public activation or YAW-003 execution occurred.
Work stops at the private preview.
