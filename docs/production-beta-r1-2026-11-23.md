# Production Beta R1 — Founder Creation Admission

November 23, 2026. Local implementation for founder review only. R0 is accepted.
No allowlist has been installed in a real application environment, no external beta account has
been activated, and no Production release is claimed.

## Baseline and preservation

Actual integration source is still
`/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`, branch
`feature/phase2-private-creation-p2-postgres-20261117`, HEAD
`0ecf38f53436c887895dacb67fe3612cdf4d4ce5`, with accepted uncommitted/untracked work.
R1 started with 37 tracked modified files and 134 individual untracked files.
The initial preservation checkout is not this source. A hash inventory of 334
source files captured R0 and the accepted generalized Creation baseline before
editing. Implementation and offline QA were first performed in an isolated
source copy, excluding environment files, credentials, Git state and runtime data.

Accepted YAW-001, YAW-002, P2 (including its documented non-blocking test-runtime
exception), P3.1–P3.8B and R0 remain the baseline. Community Tool Library remains
Development-only. Current Yawrd and New Yawrd remain separate; admission does not
import, select, rename or republish an existing public Yawrd.

## Behavior

`/create` reuses `AccountAuthentication`, the current shared Account component,
for the existing Meteor/NEP-413 sign-in. There is no new challenge, verifier,
wallet connector, cookie or session type. Connection alone does not admit a user.
After the existing verified sign-in dispatches its session-change event, Creation
checks server admission and automatically opens the existing generalized intake.
No additional onboarding or account-address entry is introduced.

Existing browser drafts restore under their account key. Back opens the saved
Creation controls; resume and explicit `step`/`draft`/preparation-return URLs retain
the existing workspace/repository behavior. Saving, recovery copies, version checks,
setup, Blueprint/configuration panels and public publication projection are reused.
Focus rechecks hide and suspend interaction without remounting valid private edits.
Expiry, sign-out, session changes and wallet mismatch clear or block private UI;
late admission responses cannot reopen a previous session's workspace. Failed
session checks fail closed and offer a retry. A valid server session can resume
without requiring a new wallet connection; any connected wallet must match it.

A signed-in nonmember sees exactly:

> Opening a Yawrd is currently invite-only.

The primary action is **Explore Yawrds**, linking to `/#discover`. There is no
waitlist, code entry or request-access form. A saved second Steward can still see
only their existing security links and use the separate security page.
The shared Creation layout covers direct navigation to the founder subroutes;
the security page retains its existing verified-Steward checks and Development
boundary. No private content is server-rendered by these existing page shells.

## Server configuration and enforcement

New non-public configuration key: `YAWRD_CREATION_FOUNDER_ALLOWLIST`.
Its format is a JSON array of exact, valid named Testnet account IDs. A synthetic
example for isolated tests only is `["founder.testnet","other.testnet"]`.
No real identities are hardcoded or selected by R1. Configuration values must be
supplied to the appropriate server environment through a separately authorized
configuration step; never use a `NEXT_PUBLIC_` variable.

Missing, empty, invalid JSON, wrong shape/types, duplicate identities, invalid
account syntax, non-Testnet entries, more than 100 entries, or more than 8192
characters deny founder admission. An empty array admits nobody. One invalid
entry invalidates the entire configuration; there are no partial/wildcard or
case-folded matches and no fallback to a historical founder. Configuration is
checked for each request, without a database table, admin UI or new service.
Removing membership denies private founder reads/resume and writes on subsequent
requests; it does not delete drafts, receipts or existing public pages. Existing
pending actions remain subject to their separate recovery/authorization gates.

`GET /api/creations/admission` reads only the live Testnet NEP-413 session cookie
and returns its account, expiry and that account's admission status. It returns no
allowlist, private Creation data, signing key or publication proof. It does not
mint or rotate a session. Responses are private/no-store.

Every exported founder Creation API method now enters `withCreationAdmission`
before its original handler. The guard reuses exact Origin/Host protection,
opaque-cookie hashing, and the unexpired/unrevoked Testnet session query. It
checks the selected-account header only as equality against verified identity;
body fields, wallet connection and client flags cannot grant admission.

Covered paths: `/api/creations` GET/POST; `[id]` GET/PATCH; deployment,
platform-fee, preparation (including generation/recovery), contributions,
governance and Launch (including consent challenge/publish) GET/POST; founder
security actions are also guarded. Denial precedes private repository reads,
request-body consumption, RPC/provider/writer construction and action claims.
Original handlers/repositories still recheck session, ownership, revisions and
consent at their existing boundaries; admission is an additional necessary check.

The saved second-Steward exception is confined to `[id]/hardening`. A nonmember
must match that exact Creation's saved second Steward, differ from the founder,
and have a recorded deployed binding. Only the minimal identifier is selected
for admission; the original hardening handler then validates the exact prepared
request, deployment evidence, two distinct Stewards and governance permissions.
Security navigation lists only admitted founders or the saved second Steward.
The exception does not admit its holder to private drafts, deployment, fee,
preparation, configuration or publication. Even absent/invalid founder configuration
does not erase the separate verified second-Steward security path.

Allowlisting enables none of the following by itself: deployment submission or
retries, platform payment, inference/generation/recovery, Launch, participant Join,
task claiming or rewards. Existing environment/endpoint guards, exact Development
request pins, finite-attempt rules, fee flags and publication signature/writer
checks remain. In particular, Production Launch and the existing Development-only
routes remain closed. The factory is outside platform admission: direct payable
factory creation remains permissionless and no contract was changed.

## Security disposition before external founder activation

R1 implements platform admission, not tenant database isolation. The accepted
shared-runtime SQL probe demonstrates cross-founder private SELECT/mutation and
forged review fields under `yawrd_07b_runtime`. Ordinary wallet users are not given
that SQL login, and owner-checked API requests still reject other founders. A SQL
escape or compromised trusted runtime nevertheless has a wider private-data
boundary than the new allowlist. P3.8B's isolated writer and fresh publication
signature do not repair private Creation/session isolation.

**External founder activation still requires a separate, scoped remedy and its
acceptance, unless the founder explicitly approves a separate risk exception.**
The invite-only policy approval is not such an exception. The remedy must remove
or contain shared-runtime direct access to other founders' private Creation data
and prevent SQL-forgeable identity/review inputs from bypassing that boundary.
Acceptance must prove effective-role denials for cross-founder reads, writes and
forged review/identity use, not just HTTP ownership checks. The mechanism and any
schema/privilege changes require their own authorization; R1 does not prescribe
or implement a broader security redesign. No external accounts are activated.

## Files changed

| File(s) | Purpose |
| --- | --- |
| `src/creation/admission.ts` (new) | Server-only configuration parser, session-derived admission status and API guard with scoped second-Steward exception. |
| `app/api/creations/admission/route.ts` (new) | Read-only admission status route. |
| `app/api/creations/route.ts`, `[id]/route.ts` | Protect list/create/read/update. |
| `app/api/creations/[id]/{deployment,platform-fee,preparation,contributions,governance,launch,hardening}/route.ts` | Wrap the original handlers without removing their existing guards/permissions. |
| `src/creation/platform-fee-http.ts` | Narrow security navigation to admitted founders or saved second Stewards. |
| `app/create/creation-admission.tsx`, `app/create/layout.tsx` (new) | Shared route gate, existing sign-in component, mismatch/expiry/event handling and invite-only view. |
| `app/create/creation-welcome.tsx` | Remove its duplicated sign-in implementation; automatically enter existing intake and retain saved-draft controls. |
| `app/create/welcome.module.css` | Scoped admission/Explore styling. |
| `app/docs/page.tsx` | Reflect the approved local admission behavior while keeping Production inactive. |
| `test/creation-admission.test.ts` (new) | Actual exported route handlers with synthetic infrastructure; configuration, identity, denial, resume, ownership and action-guard coverage. |
| `test/creation-admission.browser.test.mjs` (new) | Synthetic browser sign-in, automatic intake/resume, rejection, direct URLs, expiry, mismatch and stale-response journey. |
| `test/creation-intake.browser.test.mjs` | Existing regression fixture updated for admission, automatic entry and shared Account sign-out; scoped selectors/current accepted disclosure. |
| This report (new) | Review evidence, configuration contract, security disposition and release dependencies. |

## Verification

All tests are offline with synthetic identities and injected/mocked infrastructure.
No accepted P3.8B PostgreSQL verification was rerun.

- Admission suite: 12/12 tests passed. It invokes all 18 exported protected API
  methods for signed-out, expired, unapproved, missing-config, invalid-config and
  mismatched cases. Bodies remain unread and only session/minimal security checks
  occur; no private data, mutation or external transport is reached. Approved
  creation/resume under a replacement session, cross-owner denial, original
  deployment/Production guards and the second-Steward exception are exercised.
- Existing relevant focused suite: 193/193 passed across Creation HTTP,
  deployment, hardening/fees, preparation/generation/recovery, contribution and
  governance configuration, Launch/publication and wallet-session tests.
- New Chromium admission journey passed. It uses actual components/wallet-session
  code with synthetic wallet/API responses and blocks external requests. Verified
  homepage CTA → sign-in → automatic intake, connection-only denial, restored
  browser edits, saved setup resume/reload, sign-out, mismatch, nonmember notice,
  direct route denial, expiry and stale-response rejection. Invite-only view has
  no form and fits 390/1440 pixels; both screenshots were visually inspected.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false`.
- Existing full intake/recovery Chromium regression passed after updating its
  admission fixture, shared sign-out/navigation expectations, scoped form selectors,
  and stale assertions for the accepted Save/Saved/recovery controls. It covers
  long intake, export/restore, draft identity, saved configuration, revision conflicts,
  cross-founder clearing, recovery copies, resume/reload, synthetic deployment review
  and separate Steward approvals. No product code was changed to satisfy stale
  test labels or selectors.
- Tracked whitespace and final source-hash preservation checks passed: only the
  14 listed existing source/test/docs files changed, with seven new files including
  this report. All other 320 inventoried baseline source files remain unchanged.
  Global navigation/authentication, wallet code, public Discover/project pages,
  Genesis/WordWake participation, accepted templates and migration proposals are
  unchanged. No environment file was read or modified.

Reproducible focused commands (run the route-test infrastructure doubles in their
own process):

```sh
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-admission.test.ts
node --test --test-isolation=none test/creation-admission.browser.test.mjs
node --test --test-isolation=none test/creation-intake.browser.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

Evidence files are under `/tmp/yawrd-r1-*`, including admission/existing-suite TAP
logs and `invite-390.png` / `invite-1440.png`. These are local QA artifacts, not
Production records or activation receipts.

## Remaining Production dependencies

- Reconcile the actual deployed source and preserve its wallet/profile behavior.
  R1 reuses current integration authentication and does not modify global
  navigation, Account authentication, wallet-session code or the R0 cards.
- Approve the actual founder identities and separately configure the appropriate
  environment; no configuration is installed here. Missing configuration denies
  founder Creation. Security-only second-Steward access remains distinct.
- Resolve the private shared-SQL isolation disposition above before external
  founder activation. No risk acceptance is inferred from R0/R1 approval.
- Independently confirm Production schema/roles and publication-writer authority;
  never copy Development rows. Separately authorize Launch/environment changes,
  generation/payment/deployment permissions and eventual release.
- Retain the R0 shared-template historical snapshot disposition and the missing
  committed cross-session concurrency proof. R1 does not certify either.
- YAW-003 remains unexecuted and requires its own authorization. Stop after R1.
