# Production Beta R2 — release candidate for founder review

November 23, 2026. **GO to the separately authorized isolated Preview step.**
No Production promotion or external account activation has occurred. This is a
reviewable source candidate, not permission to enable every action switch.

## 1. Exact source and candidate

- Confirmed Production source: `7e68e0ae5b60811cbb38723d00f67fc93a5c5835`.
  The founder verified in Vercel that `yawrd.keelbase.io` is assigned to Ready
  deployment `yawrd-63hohlei9-keelbase.vercel.app`, created November 17, source
  branch `main`, that full commit. This confirmation resolves the earlier alias
  uncertainty. The clean WordWake release checkout matches that commit.
- Independent read-only evidence: GitHub's current commits endpoint reports
  `7e68e0a`; its Vercel status is successful and links deployment record
  `ErbUULeK6GjSsecgUWV67yPg5ue2`. The public domain returned HTTP 200 and layout
  asset `app/layout-3f8ba80b8ba21606.js`. The founder's dashboard observation,
  rather than the cached refs or that status alone, establishes current assignment.
- Candidate: `/tmp/yawrd-production-beta-r2-20261123`.
- Integration source: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`,
  branch `feature/phase2-private-creation-p2-postgres-20261117`, HEAD
  `0ecf38f53436c887895dacb67fe3612cdf4d4ce5` plus the accepted working tree through
  R1. All 344 inventoried source files were fingerprinted before assembly.
- Assembly starts from the confirmed Production Git tree, overlays the complete
  accepted implementation, then makes only the release changes below. Source
  hashes/file inventories and the review patch are under `/tmp/yawrd-r2-*`.
  No branch, commit, push or deployment has been created. Candidate Git identity
  will be the reviewed future commit, not the integration HEAD alone.

The initial preservation checkout and every existing integration/release worktree
are untouched. No environment files, credentials, `.next` artifacts, Git state or
runtime records were copied into the source candidate. Installed dependencies are
reused locally through a symlink; they are not part of the release source.

## 2. Integrated functionality and resolved conflicts

The candidate includes accepted P3.1–P3.8B, R0 and R1, preserving Genesis and
WordWake, all current authorization/governance/fee checks, generalized private
Creation, preparation/version approval, planned work/governance review and exact
NEP-413 publication/public projection. The full integration inventory is retained;
Development SQL proposals are references and are not automatic migrations.

There were no unresolved source conflicts. Specific reconciliations:

- **Production Account/wallet/profile:** retain the confirmed release's shell,
  navigation links, menu dismissal, account selection and immediately visible
  route-owned project/profile controls. Shared sign-in renewal is a secondary
  disclosure on those project pages; other pages retain the accepted shared sign-in view. Restore an explicit
  independent **Disconnect wallet** action in `account-authentication.tsx` so an
  auth-service outage cannot prevent the original wallet-only disconnect. The
  accepted combined disconnect/sign-out action remains available. No authentication
  backend, wallet connector or profile data model is replaced.
- **Discover/public pages:** exact accepted R0 card source/CSS and publication
  mapping retained; Genesis/WordWake links and generalized namespace remain intact.
  No Community Tool Library or Development publication is hardcoded or seeded.
- **Shared-template historical assertion:** Genesis markup and unchanged styling
  still compare with confirmed release `7e68e0a`; the two intentionally updated
  shell files now compare with an explicit SHA-256 snapshot of the already accepted
  integration shell. This reconciles the old `e246d109` assertion without reverting
  accepted layout or silently removing the regression gate. All seven shared-template
  tests pass, including WordWake and public projection checks.
- **Documentation:** the founder walkthrough stays intact; availability wording
  describes invite-only Testnet release configuration without incorrectly promising
  activation or claiming the public builder can never advance beyond the old preview.

### Release-specific source changes

| Files | Change |
| --- | --- |
| `src/creation/release-environment.ts` (new) | Explicit development/Preview-Testnet/Production-Testnet policy, exact origins, endpoint/TLS/runtime-role pins, separate action switches. Server-only. |
| All 11 `app/api/creations/**/route.ts` files | Retain admission and existing handlers; use authorized environment and target-pinned queries instead of treating Production `NODE_ENV` as Development. |
| Six `app/create/[id]/*/page.tsx` files | Public shells available only under the authorized Testnet release mode; no private SSR data. |
| `src/creation/deployment.ts` | Release-only owner/allowlist/feature-switch authorization for current, exact, fresh first attempts. Existing fresh preflight, cost consent and durable claim remain. Development retry/recovery pins stay Development-only. |
| `src/creation/preparation-generation.ts` | Existing normal generation can run in explicitly enabled release mode; premium experiment/recovery remains Development-only. No new model/provider or automatic retry. |
| `src/creation/launch-preparation-http.ts`, Launch route | Separate publication action switch denies new challenges/writes while preserving existing durable receipt recovery. Fresh signature and isolated writer remain mandatory. |
| `src/creation/admission.ts`, two Creation client controllers | Server-derived security-link availability replaces client `NODE_ENV` hiding; saved second-Steward path remains independent of founder privileges. |
| `app/components/global-navigation.tsx`, `account-authentication.tsx` | Preserve primary route-owned profile controls, independent wallet disconnect and wallet-connection label; retain shared sign-in renewal. |
| Focused tests and `test/fixtures/shared-shell-r2.json` | Runtime/endpoint/action tests, actual Preview/Production route admission, receipt recovery with publication off, wallet-only disconnect during auth failure, reconciled accepted shell snapshot. |
| This directory | Readiness/configuration, ordered schema manifest, proposed exact early runtime grants, read-only catalog inventory. None applied. |

The complete per-file integrated/changed/new lists and SHA-256 values are in
`/tmp/yawrd-r2-source-manifest.json`; `/tmp/yawrd-r2-review.patch` represents the
candidate against confirmed Production. Build/test outputs are separate QA artifacts.

## 3. Actual verification

- TypeScript: passed (`tsc --noEmit --incremental false`).
- Optimized Production build: passed with installed Next.js 16.4.6/webpack,
  including its TypeScript phase and all routes. The build process had an empty
  environment except its tool path, `NODE_ENV=production`, and disabled telemetry;
  no credentials/Production settings were loaded or installed.
- Release-environment suite: **5/5 passed**. Covers absent/incorrect mode/origin,
  Preview versus Production target separation, Development endpoint exclusion,
  owner/TLS rejection, independent action switches, first-attempt deployment
  boundaries and nontransferable premium Development exceptions.
- Actual exported-route admission suite: **14/14 passed**, including R1 negatives
  across all 18 protected API methods and explicit Preview/Production modes.
  Unauthorized bodies stay unread; only session/minimal Steward checks occur.
  Approved intake/save/resume and original owner checks remain; allowlisting and
  release mode alone do not enable deployment.
- Relevant public/Creation regression suite: **97/97 passed**, including public
  projection privacy, Genesis/WordWake/shared-template rendering, existing private
  HTTP/preparation/configuration and cryptographic publication authorization.
  Publication-off testing verifies no new consent/write and preserved receipt recovery.
- Chromium: **2/2 journeys passed**. Actual components with synthetic identities,
  wallet/API responses and blocked external traffic: signed-out homepage CTA,
  connection-only denial, verified sign-in to intake, draft preservation, saved
  resume/reload, unapproved notice, direct route denial, expiry/mismatch/stale
  responses, original independent wallet disconnect during sign-out failure;
  Launch cancellation/source/account safeguards, synthetic receipt recovery and
  rendering the reviewed payload on the public project presentation. A synthetic
  participant fixture exercises the actual Production project-wallet component
  through its Account portal, participation link, immediate profile placement and
  Escape dismissal; no authenticated live Production session is claimed.
- Built-server HTTP smoke: **8/8 passed**, with no credentials or release opt-in.
  Homepage/Docs/Creation shells serve; private APIs are 404 and Development identity
  is closed. Closed Launch renders Next's not-found boundary. Next may stream it
  with HTTP 200 and embedded 404/noindex, as documented by the installed version;
  it does not expose Launch functionality. No configured data source was used.
- R0 responsive card evidence is reused; both card files and mapping remain the
  accepted source. No financial/DAO execution suite, database acceptance runner,
  external inference or live wallet operation was run.

These are source/build/offline and local HTTP results. They are not a hosted
Preview receipt, Production schema inventory or a new multi-founder concurrency
proof. The accepted real Meteor P3.8B signing, public/incognito checks and seven
protected PostgreSQL checks are reused without repetition.

## 4. Required database/configuration steps

`CONFIGURATION.md` gives the exact keys, required scope and default-off switches.
`schema-manifest.json` pins dependency paths/order/digests. `catalog-preflight.sql`
is ready for an independently confirmed target and separate read-only authorization.
`private-runtime-grants.sql` is a review proposal, not verified applied privileges.

The shortest controlled sequence is:

1. Approve an isolated Preview Neon target and its schema/configuration scope.
   Confirm target/role identity and current catalog; install only missing accepted
   definitions and scoped grants. No seeds/data export/import; no Development
   Community Tool Library records. Do not repoint Development test installers.
2. Provision the dedicated writer separately in that same Preview database. Retain
   P3.8B function-only access, source/auth/table denials, owner separation and accepted
   role-membership exception. Keep Production writer/configuration independent.
3. Configure the exact Preview origin/endpoint pins and approved Testnet allowlist.
   Build-time public shells contain no private data; server admission still requires
   the verified session. Keep all five action switches off for initial Preview review.
4. After Preview review and explicit action authorization, enable only the required
   Testnet actions on the approved environment. Generation additionally requires
   existing provider configuration and confirmed effective 300-second Fluid compute
   duration. No Vercel plan, settings, credentials or spending permission is assumed.
5. Separately authorize Production catalog/schema/roles/configuration and promotion.
   Inventory first; do not assume the target is missing or already has the objects.
   Install schema only. Public Genesis/WordWake grants and data remain untouched.

The earlier trusted-runtime SQL limitation is an explicitly approved scoped
Testnet-beta risk exception, not a new blocker. R2 neither repairs it nor expands
that exception to Mainnet. Permissionless Testnet factory creation is outside the
platform allowlist and is not a release blocker.

## 5. YAW-003 is separate

Already supported by accepted evidence: generalized intake/save/resume, verified
Testnet deployment/hardening/payment mechanisms, preparation/version approval,
contribution/governance configuration, exact-source NEP-413 publication, durable
receipt recovery, Discover/public-page/incognito access and the seven protected
PostgreSQL checks. These completed milestones do not need to be rerun for R2.
Community Tool Library is Development evidence, not a renamed YAW-003 acceptance.

Only an explicit YAW-003 recovery gate was located in the repository: after failed
or interrupted preparation with no artifact, a founder must not be permanently
stranded or forced into another deployment/payment. The accepted one-off premium
Development recovery is pinned to its historical Creation and does **not** establish
that generalized policy. Confirm the approved general recovery disposition and
uncertain-outcome/duplicate-charge safeguards before any YAW-003 execution. R2
preserves one-attempt rules and adds no retries.

No approved YAW-003-specific project/content acceptance checklist was supplied in
the accessible source; a focused clarification was requested. Do not invent extra
criteria or claim YAW-003 complete. Its actual project-specific execution and any
checklist-specific requirements remain separately authorized work. Committed
cross-session concurrency remains an explicitly undemonstrated evidence limit;
it is not silently recertified or turned into an additional R2 milestone.

## 6. Next authorization and decision

**GO for an isolated Vercel Preview candidate; NO-GO for Production promotion now.**
Source integration/build checks have passed. Remaining work is the explicit release
and environment authorization above, not another architecture investigation.

Requested next authorization, naming each action explicitly:

- Create branch `release/production-beta-r2-20261123` from confirmed Production
  `7e68e0a` in a new worktree, materialize exactly the reviewed candidate source,
  and leave the accepted integration working tree intact.
- Confirm the existing Vercel project supports the declared 300-second function
  duration; do not assume a plan or change settings without approval.
- Commit and push that isolated branch, then generate its Vercel Preview through
  the existing Git/Vercel integration or an available approved deployment tool.
  No Vercel CLI availability is assumed. Creating the Preview is a deployment
  action and requires that explicit authorization, even if a push auto-triggers it.
- Separately authorize the isolated Preview database/schema/configuration scope;
  confirm its returned URL/alias and exact `YAWRD_APP_ORIGIN` before functional
  sign-in/admission checks there. No Preview may borrow Production runtime/writer.

After the Preview and target-specific configuration are reviewed, Production
installation/configuration and controlled promotion require another explicit
approval. YAW-003 execution remains separate. R2 stops at this review packet.
