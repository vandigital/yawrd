# P3.8 final preview presentation polish

Baseline: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`,
branch `feature/phase2-private-creation-p2-postgres-20261117`,
HEAD `0ecf38f53436c887895dacb67fe3612cdf4d4ce5`.
Existing accepted modified/untracked work was preserved.

## Changes

- Preview-scoped headings, section labels, disclosure labels and navigation use
  established `#c2dedd`. Task status/expand indicators use the same treatment.
  The main project name, typography and compact banner were not redesigned.
- Accordion rows retain separate number, flexible title/status, allocation/terms
  and expand-control columns. The reward column has more width/spacing and a
  subtle divider. Titles wrap naturally. On narrow layouts the allocation stacks
  below the task identity, with its own separator; the control stays independent.
  Existing allocation/term values and reward logic are unchanged.
- The sidebar is now **Project Identity**, with **Created by** and the verified
  founder account supplied directly by `view.binding.founderAccountId` in the
  existing authorized Launch response. No API or persistence contract was changed.
  A note distinguishes founder identity from Steward membership/review authority.
- The creator row uses the existing generic sea avatar, beside the account ID.
  No personal name/photo, profile lookup, upload or storage was introduced.

## Exact files changed

1. `app/components/yawrd-identity-presentation.tsx` — scoped presentation wrapper,
   Project Identity and binding-supplied creator/avatar row.
2. `app/components/yawrd-identity-presentation.module.css` — preview sea-green
   treatment and responsive creator/avatar styling.
3. `app/components/project-space-shell.module.css` — accordion-only title/allocation
   separation and responsive stacking; published Genesis/WordWake selectors and
   compact header unchanged.
4. `app/create/[id]/launch/launch-panel.tsx` — pass only the existing verified
   founder account to the presentation component.
5. `test/creation-launch-preparation.test.ts` — creator binding/fallback assertions
   and updated sidebar expectation.
6. `test/creation-launch-preparation.browser.test.mjs` — computed color checks,
   avatar/creator checks, long-title separation measurements and final screenshots.
7. `docs/phase2-p38-final-preview-polish.md` — this report.

## Verification

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-launch-preparation.test.ts test/public-yawrd.test.ts test/project-experience.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none test/creation-launch-preparation.browser.test.mjs
git diff --check
```

35/35 focused presentation tests passed; TypeScript passed; the existing browser
journey passed; tracked whitespace checks passed. Existing Genesis/WordWake,
public-profile mapping, task/source binding, allocation semantics and publication
blocker regression assertions pass. The browser verifies colors, 40px fallback
avatar, binding-supplied creator, compact banner, long-title wrapping and separation
at 320/390/768/1440px, focus/return, stale Account responses and disabled Launch.

Screenshots visually reviewed:

- `/tmp/yawrd-founder-preview-polish-desktop.png`
- `/tmp/yawrd-founder-preview-polish-mobile.png`

These show the requested colors, a deliberately long test task title, distinct
allocation/control columns and responsive creator fallback. They use synthetic
seed-survey records and `founder.testnet`; they are not live Community Tool Library
screenshots. The live founder account will come from the same existing verified
binding; `yawrd1.testnet` is not hardcoded into presentation logic.

No database/API/persistence/publication/wallet/reward-logic changes, database
operations, migrations, commits, pushes, deployments, inference, spending or
publication occurred. No new blocker was found. Work stops at this presentation
correction; live founder visual acceptance remains with the founder.
