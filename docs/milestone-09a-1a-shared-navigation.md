# Milestone 09A.1a — Shared Navigation Foundation

## A. Implementation summary

Implemented in `/tmp/yawrd-m09a-1a-navigation` on `feature/m09a-1a-shared-navigation-20261109`, based exactly on `5ff772e8fe8ff317496abfb39fd14b16ea111d3c` from `release/hackathon-public-prep-2026-11-09`.

Source reference: the completed 09A.0 assessment supplied in the task conversation. Its 09A.1b recommendations are deferred under this task's narrower authorization.

One root header replaces landing, creation, docs and project headers. It reuses the existing Bob asset, sea-green/mint styling and wordmark. Discover links to `/#discover`; Docs links to `/docs`. Testnet, brand and Account stay on one row at 320px. Mobile Menu and Account are separate native disclosures. Escape returns focus to the disclosure trigger; outside pointer interaction and route changes dismiss disclosures. Account panels scroll within the viewport.

Original development status entries match the starting snapshot. The publication branch/worktree stays at the supplied baseline. No commits, pushes, merges, deployments, dependency installations or live wallet operations were performed. Local validation reuses installed dependencies through ignored `node_modules` links. No auth endpoints, policies, database schemas, canonical Genesis records, contract code or payout logic changed.

## B. Files changed

| Full path | Responsibility |
| --- | --- |
| `/tmp/yawrd-m09a-1a-navigation/app/components/global-navigation.tsx` | Persistent shared header; native account/navigation disclosures; wallet-only fallback controls. |
| `/tmp/yawrd-m09a-1a-navigation/app/components/global-navigation.module.css` | Landing-derived visual styling, mobile breakpoints, focus indicators and viewport-safe panels. |
| `/tmp/yawrd-m09a-1a-navigation/app/components/route-account-controls.tsx` | Presentation portal for route-owned account controls; occupancy registration and sign-in disclosure entry. |
| `/tmp/yawrd-m09a-1a-navigation/app/use-testnet-wallet.ts` | One root wallet owner and context consumers; existing wallet operations retained. |
| `/tmp/yawrd-m09a-1a-navigation/app/layout.tsx` | Mounts the wallet provider and navigation shell once above route content. |
| `/tmp/yawrd-m09a-1a-navigation/app/components/participant-panel.tsx` | Places existing account UI in the header while retaining challenge, verification, logout and workspace ownership. |
| `/tmp/yawrd-m09a-1a-navigation/app/components/project-wallet-controls.tsx` | Provider-neutral action labels; distinct connected-wallet and verified-account presentation; removes obsolete project header. |
| `/tmp/yawrd-m09a-1a-navigation/app/create/creation-builder.tsx` | Removes local header and duplicate connection alerts; existing functional steps and creator account selection retained. |
| `/tmp/yawrd-m09a-1a-navigation/app/docs/layout.tsx` | Removes local header; documentation navigation and content retained. |
| `/tmp/yawrd-m09a-1a-navigation/app/page.tsx` | Removes local header; landing content, footer brand and featured project retained. |
| `/tmp/yawrd-m09a-1a-navigation/app/yawrd/[projectId]/page.tsx` | Removes conditional local header; routing, authorization, fixtures and unavailable handling retained. |
| `/tmp/yawrd-m09a-1a-navigation/test/participants.test.ts` | Wraps render fixtures in the wallet provider; participants assertions also reflect account labels and root-owned header. |
| `/tmp/yawrd-m09a-1a-navigation/test/contribution-ux.test.ts` | Wraps existing render fixtures in the root wallet provider. |
| `/tmp/yawrd-m09a-1a-navigation/test/contributions.test.ts` | Wraps existing render fixtures in the root wallet provider. |
| `/tmp/yawrd-m09a-1a-navigation/test/reward-payout.test.ts` | Wraps existing render fixtures in the root wallet provider. |
| `/tmp/yawrd-m09a-1a-navigation/test/task-b-refinement.test.ts` | Wraps existing render fixtures in the root wallet provider. |
| `/tmp/yawrd-m09a-1a-navigation/test/global-account.browser.test.mjs` | Offline Chromium integration of real UI/provider with mocked routing, wallet and auth responses. |
| `/tmp/yawrd-m09a-1a-navigation/test/global-navigation.browser.test.mjs` | Built-candidate Chromium route, responsive, keyboard and client-navigation checks. |
| `/tmp/yawrd-m09a-1a-navigation/docs/milestone-09a-1a-shared-navigation.md` | Implementation report and precise deferred dependencies. |

## C. Shared navigation architecture

`RootLayout → TestnetWalletProvider → NavigationShell → route children` keeps the wallet owner mounted across App Router navigation. The existing connector singleton, session wrapper, event handling and signing implementations are retained. Consumers of `useTestnetWallet` read the same root snapshot instead of creating separate wrappers/listeners.

Public route content remains server-rendered. No root cookie read or shared participation fetch is introduced. The header remains outside conditional project rendering, covering fixtures, unavailable projects and the project's existing not-found boundary.

`ParticipantPanel` keeps its existing state and operations. `RouteAccountControls` portals only its account presentation into the persistent header panel. Its occupancy registration removes the fallback controls while project controls are mounted. Closing the disclosure does not unmount project controls, sign-in state, workspaces or payout providers. Project-to-wallet navigation opens the disclosure before following the existing anchor.

## D. Account menu behavior

On every targeted route, wallet connection, disconnection, account selection, loading/unavailable states and wallet errors are accessible. Connection is explicitly distinguished from sign-in. Outside a persisted project, the menu explains that verified account status is available inside a Yawrd. It contains no project-specific sign-in promotion. It does not infer authentication from connection or claim that a session is absent.

On persisted project pages, the header contains the existing challenge preparation, exact message review, explicit Meteor message approval, verification, sign-out and workspace links. Connected wallet and verified account remain distinct. Session-only and mismatch explanations remain. Disconnect retains the verified session; sign-out uses the existing logout handler. Account selection clears a prepared challenge. All existing pre/post-signature account/network guards are unchanged.

Cross-page verified-session display and logout are deferred: there is no general session reader in this baseline. No sign-in orchestration was extracted and no automatic message approval was introduced.

## E. Future wallet compatibility

The visual shell and disclosure mechanism do not select or construct Meteor. Concrete existing coupling remains in `wallet-session.ts`: `meteor-wallet` allowlisting, wallet identity checks, Meteor-specific errors and NEP-413 signing support. `use-testnet-wallet.ts` still fixes Testnet and uses `@hot-labs/near-connect` types. The project message-approval instructions name the actual provider, Meteor. A future connector migration must address those integration points; this implementation adds no connector abstraction or alternate wallet system.

## F. Validation results

All final checks passed:

| Actual command | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm test` | 240 passed, 0 failed. |
| `npm run test:contributions` | 194 passed, 0 failed. The established script retains its existing inactive-SQL exclusion. |
| `npm run test:payout` | 39 passed, 0 failed. |
| `npm run build` | Production webpack build passed, including TypeScript, static generation and trace collection. Sandbox initially blocked a build subprocess; the permitted rerun passed. |
| `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3091` | Local production candidate served for browser checks; stopped after validation. |
| `node --test test/global-navigation.browser.test.mjs test/global-account.browser.test.mjs test/contribution-ux.browser.test.mjs test/reward-payout.browser.test.mjs` | 19 passed, 0 failed, including nested checks. |
| `git diff --check` | Passed. |

Real Chromium checks ran at 320, 390, 768 and 1440 CSS-pixel widths. Built routes: `/`, `/create`, `/docs`, `/yawrd/yaw-001`, `/yawrd/the-common-table` and `/yawrd/unknown-project`. Checks covered one header/account disclosure, brand asset, Testnet text, compact height, no page/header horizontal overflow, viewport-contained panels, 44px wallet action, Enter activation, visible focus, Escape/focus return, separate mobile disclosures, outside dismissal, Discover/Docs destinations and client navigation retaining the root document. Landing screenshots were captured at all four widths; 320px and 1440px images were visually inspected (`/tmp/yawrd-navigation-320.png`, `/tmp/yawrd-navigation-1440.png`).

The styled offline account harness exercises the real header/provider/participant UI with mocked wallet and auth responses. It verifies connection without signing, explicit challenge/signature/verification, account-switch challenge invalidation, session persistence after disconnect, logout, fallback restoration and one connector with exactly three wallet-event subscriptions across route consumer changes. Prepared challenge/controls fit at all four widths. Existing offline contribution and payout browser checks preserve refresh, private-state revocation and explicit receipt-derived settlement behavior.

Limitations: no live Meteor approvals, wallet transactions, authenticated database-backed route, production deployment, live creation/application/reward mutation, screen-reader pass or 200% browser zoom check was performed. Database credentials were not loaded. YAW-001 and unknown-project browser routes exercised the real unavailable state; a database-confirmed 404 and a thrown route error were not induced. The existing project not-found presentation remains covered by render tests and sits beneath the shared root layout. Workflow evidence is automated/offline regression coverage, not a new live end-to-end acceptance claim.

## G. Minimal follow-up for 09A.1b

1. Separately authorize the minimal read-only session-status adapter described in 09A.0. Return only validated session identity/network with existing private/no-store protections; do not expose project participation payloads to navigation.
2. Extract the current challenge/sign/verify/logout client controller from `ParticipantPanel` only when implementing guided global sign-in, with shared status updates to the project view. Replace the presentation portal then if the new ownership makes it unnecessary.
3. Expose completion-aware connection from the existing wallet hook for explicit user-driven progression. Re-read account/network before creating a challenge; preserve cancellation, expiry, mismatch and late-response guards and independent signature approval.
4. Add focused status, reload, expiry, cancellation and overlap tests. Preserve disconnect/session separation, project authorization and mounted payout reconciliation.

No 09A.1b endpoint/controller work or YAW-001 body redesign was started.

## Product-owner final visual corrections — November 9, 2026

Applied only the approved corrections: removed the redundant landing-footer Docs link while retaining the brand and “A Keelbase Experience.”; replaced mobile Menu text with a hamburger icon named “Menu” for assistive technology and a minimum 44×44px target; removed the hardcoded YAW-001 sign-in link from the global account fallback. Project-specific challenge review, explicit NEP-413 signing, verification, logout and authorized workspaces are unchanged. No global guided authentication, server endpoint, permission or record changes were introduced.

Corrected the offline account fixture's CSS-module default export and UTF-8 metadata. Corrected the built navigation fixture to assert the actual mobile Discover/Docs destinations rather than invoke the hidden desktop link. The fixture now also checks the icon-only Menu trigger, minimum touch target, keyboard disclosure/focus behavior, absent footer Docs link, retained footer brand/copy and absence of the global YAW-001 promotion.

Final correction validation: `npm run typecheck` passed; `npm test` passed 240 tests; `npm run test:contributions` passed 194 tests; `npm run test:payout` passed 39 tests; `npm run build` passed. `node --test test/global-navigation.browser.test.mjs test/global-account.browser.test.mjs test/contribution-ux.browser.test.mjs test/reward-payout.browser.test.mjs` passed all 19 browser checks. `git diff --check` passed. Local browser states use mocked wallet/auth responses where needed; no live wallet or database mutation was performed.

The publication and preserved development checkout remain unchanged by this work. No commit, push, merge or deployment was performed. Stopped for final acceptance and local checkpoint authorization.
