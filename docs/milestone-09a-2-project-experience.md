# Milestone 09A.2 — YAW-001 Project Experience Redesign

## A. Implementation summary

Implemented for product-owner visual review in `/tmp/yawrd-m09a-2-project-experience`, on `feature/m09a-2-project-experience-20261109`, based exactly on accepted commit `99537e8c408086d93a3260d1e7cf567959986d7f`. HEAD remains that commit; all implementation changes are uncommitted.

YAW-001 now presents a compact project showcase: reduced-height existing banner artwork and Bob branding, **Build Progress**, the approved tagline, completed Testnet status, a short overview, a prominent **Follow the Build** link, and compact accepted Task A / Task B evidence. Original persisted title, description, objectives and participation context remain available in a native disclosure. The original Genesis descriptor and stored data were not rewritten.

One responsive identity panel contains the preset creator avatar, accepted creator account reference, recorded Task B reward of **1 NEAR on Testnet**, receipt-derived settlement status, completed participation state, and disclosures for reward verification and project evidence. The allocation is explicitly separate from Project Funds and future funding. Task A retains its accepted outcome with no allocation.

The new public component remains a Server Component passed through the existing client/provider boundaries as children. Only the existing payout status and participant/workspace controllers need client execution. The root header, wallet owner and navigation remain unchanged.

The user confirmed that the uncommitted 09A.0 assessment is incorporated into the task specification; the accepted 09A.1a implementation and supplied 09A.2 instructions are the authoritative references. No recovery of that earlier chat was required.

Source preservation checks:

- Original development checkout has the same modified/untracked status entries recorded before work.
- `release/hackathon-public-prep-2026-11-09` remains at `5ff772e8fe8ff317496abfb39fd14b16ea111d3c`.
- Accepted 09A.1a checkpoint remains at `99537e8c408086d93a3260d1e7cf567959986d7f`.
- Existing publication-validation artifacts were not changed. New screenshots/logs are isolated under this worktree's ignored verification directory.
- No commit, push, merge, deployment, rebase, visibility change, dependency installation, schema change, contract change or wallet transaction was performed.

## B. Changed files

Paths are relative to `/tmp/yawrd-m09a-2-project-experience`.

| Path | Responsibility |
| --- | --- |
| `app/components/genesis-project.tsx` | New server-rendered Genesis showcase; public facts, accepted evidence, original-context disclosures and one identity panel. |
| `app/components/genesis-project.module.css` | Scoped landing-derived styling, compact banner, responsive two-column/single-column hierarchy, contrast and focus styles. |
| `app/components/persisted-yawrd.tsx` | Routes the existing canonical identity match to the new showcase; retains provider placement and other persisted-project presentation. |
| `app/components/participant-panel.tsx` | Suppresses closed-project application forms; keeps header account controls, historical decisions, restricted information and existing operational workspaces. |
| `app/components/reward-payout.tsx` | Adds compact identity presentation and a testable rendering component; retains the existing provider, chain verification, settlement computation, receipt destinations and workspace behavior. |
| `src/genesis/participation.ts` | Narrow canonical Testnet project-ID policy for application closure and completion presentation. |
| `src/participants/repository.ts` | Rejects YAW-001 application calls before any database operation. |
| `package.json` | Includes the seven new focused checks in the established core test command. Dependencies and lockfile are unchanged. |
| `test/project-experience.test.ts` | Focused closure, API response, other-project behavior, historical access, public privacy, evidence and settlement presentation tests. |
| `test/project-experience.browser.test.mjs` | Styled offline Chromium harness; responsive hierarchy, keyboard disclosures, mounted payout flow, receipt verification states, private workspace transitions and screenshots. |
| `test/contribution-ux.browser.test.mjs` | Updates the session-revocation expectation to the completed project's workspace sign-in copy; private-state removal assertions remain. |
| `test/global-account.browser.test.mjs` | Waits for React's account-slot fallback update before asserting restored controls, avoiding an effect timing race. |
| `test/contribution-ux.test.ts` | Updates the reward label and identity-region boundary for the redesigned panel. |
| `test/task-b-refinement.test.ts` | Updates the reward label and identity-region boundary; retains public privacy/allocation assertions. |
| `test/reward-payout.test.ts` | Updates the recorded-reward label; retains single-allocation and receipt-derived status checks. |
| `test/participants.test.ts` | Names the retained persisted-copy test to reflect its disclosure placement; assertions remain intact. |
| `docs/milestone-09a-2-project-experience.md` | This implementation and validation report. |

## C. Desktop and mobile design

Desktop places title, overview, Follow the Build, accepted contribution rows and original-context disclosure in the primary column. A single identity panel sits alongside them. The existing project artwork and Bob asset are reused in a 144px banner.

Below 700px, the order is title → identity/participation panel → short overview → Follow the Build → accepted contribution evidence → original-context disclosure → authorized workspaces. The banner is 112px. Full transaction hashes remain in closed disclosures. The same identity component serves both layouts.

Screenshot directory: `/tmp/yawrd-m09a-2-project-experience/docs/verification/milestone-09a-2/`.

| Screenshot | State |
| --- | --- |
| [Desktop, receipt verified](verification/milestone-09a-2/project-receipt-verified-1440.png) | 1440px, successful mocked receipts processed by the existing verifier. |
| [Mobile, receipt verified](verification/milestone-09a-2/project-receipt-verified-390.png) | 390px, same verified-receipt fixture. |
| [Small mobile](verification/milestone-09a-2/project-320.png) | 320px, approval recorded but transfer settlement unverified. |
| [Mobile](verification/milestone-09a-2/project-390.png) | 390px, unresolved settlement. |
| [Tablet](verification/milestone-09a-2/project-768.png) | 768px, two-column layout, unresolved settlement. |
| [Desktop](verification/milestone-09a-2/project-1440.png) | 1440px, unresolved settlement. |

All screenshots visibly state **OFFLINE REVIEW**. They use existing canonical public project facts and evidence references with mocked role and RPC responses. The successful-receipt fixture reuses the transaction/receipt identifiers already present in the accepted payout browser tests. These images do not establish current live settlement or Production database state. Desktop, 390px and 320px screenshots were visually inspected.

No approved public roster exists in the current data boundary. The participant application and agent-association consents do not authorize a public crew roster. The avatar row is omitted; no private identity was repurposed or invented.

## D. Application closure

`genesisApplicationsClosed` checks the authoritative reserved project ID `yaw-001` within the existing Testnet namespace. It does not compare names, descriptions or other editable display copy. `ParticipantRepository` already scopes its project/application SQL to Testnet.

`ParticipantRepository.apply` checks this policy before validation, queries or writes. A YAW-001 application call, including a historical retry, throws `WorkflowError('applications_closed', 409)`. The existing API preserves its origin, cookie, method and signed-in-session requirements and serializes the failure as:

```json
{"error":"applications_closed"}
```

The client maps this to “This Yawrd is complete. Applications are closed.” It offers no new application form for YAW-001. Anonymous visitors can still open the header account controls to access historical workspaces. Existing application records remain available through the unchanged state/review methods.

The public **Completed · Applications closed** label uses the same policy as server enforcement. The canonical showcase additionally retains its prior ID/network/creator identity check. Completion does not imply payment settlement.

Focused tests verify zero database calls on closed application attempts, the real API response, retained authentication guards, unchanged atomic insert/consent behavior for another project, unchanged historical reads and creator reviews, and preserved role-sensitive Join behavior on other projects. No lifecycle state machine or migration was introduced.

## E. Preserved functionality

| Functionality | Status and evidence |
| --- | --- |
| Existing participation and decisions | Existing repository reads and review SQL are unchanged; historical pending, approved and rejected presentation remains available. New tests exercise the canonical project's state/review API. |
| Creator review and approval history | Remains below the public showcase, including pending decisions and final review records. Core and focused tests pass. |
| Participant-specific information | Continues to use the existing server authorization query and role gates. Public showcase accepts only public project data. Browser revocation checks remove private contribution/workspace content. |
| Contribution submission and acknowledgement | Existing components, activation checks, signature flow, account-keyed state and APIs are retained. Contribution tests and existing browser regressions pass. |
| Steward governance controls | Both existing Steward accounts retain the separate payout workspace, including the Steward without creator/participant membership. No new role or spending authority is granted. |
| Reward verification and reconciliation | Existing `PayoutChain`, `PayoutFlow`, local attempt storage, focus/poll refresh and redirect recovery are unchanged. The provider wraps the presentation and workspaces outside disclosures. Browser instrumentation verifies disclosure toggles do not recreate its polling lifecycle. |
| Settlement evidence | Public “Paid” and receipt links use the existing verified snapshot. Approval without successful transfer receipts remains unverified; unknown, pending, failure, conflicts and unavailable verification remain distinct in tested states. Full identifiers are disclosed, with readable links outside. |
| Wallet authentication/navigation | Existing shared header, root wallet owner, explicit NEP-413 approvals, sign-out and account-switch guards are retained. Full navigation/account browser checks pass. |
| Public evidence and privacy | Follow the Build, PR #2, PR #4, creator/project/factory explorer links and creation/hardening transaction destinations are preserved. No private applications or agent associations enter the public identity panel. |
| Synthetic Build Progress | Not imported into the application. The combined Development preview remains outside this implementation. |

These are implementation and automated regression findings, not a new live end-to-end lifecycle acceptance.

## F. Validation

Commands ran from `/tmp/yawrd-m09a-2-project-experience` using the already installed dependencies. The temporary dependency symlink was removed after validation; no dependency installation or lockfile modification occurred.

| Actual command | Final result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm test` | 247 passed, 0 failed; includes the seven new focused tests. |
| `npm run test:contributions` | 194 passed, 0 failed; retains the established script's inactive-SQL exclusion. |
| `npm run test:payout` | 39 passed, 0 failed. |
| `node --import ./test/register-contributions.mjs --test --test-isolation=none test/project-experience.test.ts` | 7 passed, 0 failed. |
| `npm run build` | Final Production webpack build passed, including TypeScript, static generation and traces. |
| `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3091` | Served the local final build for browser checks; stopped afterward. |
| `node --test test/global-navigation.browser.test.mjs test/global-account.browser.test.mjs test/contribution-ux.browser.test.mjs test/reward-payout.browser.test.mjs test/project-experience.browser.test.mjs` | 20 passed, 0 failed, counting nested tests. |
| `git diff --check` | Passed. |

Chromium tested 320, 390, 768 and 1440 CSS-pixel widths. The actual built routes retain one header/account, correct navigation, focus/keyboard behavior and no horizontal overflow. Without configured database access, the real YAW-001 route preserves its honest unavailable state. The new styled offline harness separately exercises the redesigned content using real production components, generated utility CSS and scoped module styles, with mocked routing, role and RPC responses.

The project harness checks mobile/desktop hierarchy, no horizontal overflow with disclosures open or closed, visible keyboard focus, Enter activation, one identity panel, hidden technical hashes, public/private transitions, header account entry, receipt-derived links, unavailable verification and 200% root text scaling at 390px. The latter is a text-scaling check, not a browser zoom or screen-reader audit. External network requests are blocked in browser fixtures.

During development, browser tests caught a changed default payout link order; the original default order was restored while keeping the new compact panel. The contribution revocation assertion was updated for the closed-project copy. The existing account test now waits for its asynchronous fallback effect. All final regressions pass.

The sandbox initially prevented local build subprocesses and loopback listeners. Authorized local reruns passed. No validation action required Production credentials or wallet transactions.

Logs are copied into `docs/verification/milestone-09a-2/`: `typecheck.log`, `core.log`, `contributions.log`, `payout.log`, `focused.log`, `build.log`, and `browser.log`. This directory remains ignored, as in the existing repository.

## G. Outstanding issues

No implementation blocker remains. Product-owner visual acceptance is pending.

The implementation deliberately omits public crew avatars because no approved roster is available. Current live database content, Meteor approvals and live Testnet settlement were not queried or executed for this task. Verification against those systems remains outside this offline validation result. A screen-reader audit was not performed.

The new application restriction takes effect when this code is later approved and released; this work has not changed the currently deployed server. No landing discovery redesign, guided authentication, profile infrastructure or new feature development was started.

Stopping point: implementation, validation, screenshots and reporting complete; all changes remain uncommitted in the isolated worktree for product-owner review.
