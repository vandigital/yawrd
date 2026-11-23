# R2 environment/configuration packet — no values installed

Source baseline: founder-confirmed Production `7e68e0ae5b60811cbb38723d00f67fc93a5c5835`,
`yawrd-63hohlei9-keelbase.vercel.app`, Ready, November 17, 2026.

Each environment needs its own explicit settings. Configuration in this packet
is a contract for later approval; it is not a command or a configured environment.

| Setting | Preview | Controlled Production |
| --- | --- | --- |
| `NODE_ENV` / `VERCEL_ENV` | Vercel supplies `production` / `preview` | `production` / `production` |
| `YAWRD_ENABLE_CREATION_TESTNET_BETA` | `1` only for separately approved Preview | `1` only at approved activation |
| `YAWRD_CREATION_ENVIRONMENT` | `preview-testnet` | `production-testnet` |
| `YAWRD_APP_ORIGIN` | Exact HTTPS Preview `.vercel.app` origin, no path; configure the stable branch alias or rebuild for the actual origin | Exactly `https://yawrd.keelbase.io` |
| `DATABASE_URL` or existing `YAWRD_DATABASE_URL` | Independent Preview runtime connection | Production runtime connection |
| `YAWRD_CREATION_DATABASE_ENDPOINT` | Confirmed Preview endpoint ID, no `-pooler` suffix | Confirmed Production endpoint ID |
| `YAWRD_CREATION_PRODUCTION_ENDPOINT` | Confirmed Production endpoint reference, **different** from Preview | Must equal the current target pin |
| `YAWRD_CREATION_FOUNDER_ALLOWLIST` | Approved JSON array of exact Testnet IDs | Independently approved JSON array |
| `YAWRD_PUBLICATION_DATABASE_URL` | Dedicated Preview writer in the SAME Preview database | Dedicated Production writer in the SAME Production database |
| `YAWRD_PUBLICATION_DATABASE_ENDPOINT` | Must match that environment's target | Must match Production target |

Runtime connections must be TLS-required Neon PostgreSQL, database `neondb`,
username `yawrd_07b_runtime`; shared/owner connection conflicts fail closed.
Production cannot use the accepted Development endpoint. Preview cannot use the
Production pin or Development endpoint. The isolated publication login must be
`yawrd_publication_writer` with no runtime/owner fallback. No credentials were
read, generated, copied or installed in R2.

The founder allowlist grants only admission. Independently authorize each action:

| Switch (all off unless explicitly configured) | Scope |
| --- | --- |
| `YAWRD_ENABLE_CREATION_DEPLOYMENT=1` | Fresh first deployment attempt only, owner/allowlist bound; current revision and exact prepared request, fresh preflight, cost consent and durable CAS still required. Unknown/failed/retired attempts cannot sign again. |
| `YAWRD_ENABLE_CREATION_HARDENING=1` | Existing security POST actions, with saved two-Steward identity, proposal, consent and finalized-state checks. Read-only security status remains separate. |
| `YAWRD_ENABLE_CREATION_PLATFORM_FEE_PAYMENT=1` | Existing pinned 0.5 Testnet NEAR transfer workflow; receipt reads/reconciliation do not authorize another transfer. |
| `YAWRD_ENABLE_CREATION_PREPARATION=1` | Existing normal generation allowance/model (`Qwen/Qwen3.8-27B`), bounded context, explicit consent and one reserved request. Provider key remains server-only in the existing `YAWRD_NEAR_AI_API_KEY` setting. No request was made. |
| `YAWRD_ENABLE_CREATION_PUBLICATION=1` | Fresh exact-source/payload NEP-413 challenge and publication through isolated writer. When off, durable receipt recovery remains available, while new consent/writes are denied. |

Existing Development authorization/recovery pins remain Development-only.
`YAWRD_ENABLE_CREATION_PREMIUM_TEST` must be absent in release environments; its
single-Creation premium experiment and recovery cannot authorize Production or
Preview inference. A generalized premium/recovery policy is outside R2.
No browser-selected model, account, amount, recipient or enable flag is trusted.
No Mainnet path or new infrastructure is introduced.

Hosted normal preparation declares `maxDuration=300`: its provider deadline is
180 seconds, leaving validation/storage margin. The 420-second premium recovery
remains on the accepted local Development path. Confirm Vercel Fluid compute and
an effective duration of at least 300 seconds before generating the Preview
(the declared route duration must be supported), and before enabling generation.
[Vercel's duration documentation](https://vercel.com/docs/functions/configuring-functions/duration)
lists 300 seconds for Hobby Fluid compute and higher limits on other plans.
R2 does not assume the project's plan or change its hosting settings.

## Schema/privilege installation approval

First authorize a target-specific catalog inventory using `catalog-preflight.sql`.
It is read-only, has no founder queries or mutation probes, and is not a rerun of
P3.8B verification. No Production inventory was executed by R2. Compare installed
objects/privileges to `schema-manifest.json`; skip identical accepted definitions,
review any different definition, and install only missing dependencies in order.
Never run a Development installation/test runner against Production.

The ordered manifest covers P2 private Creation, P3.2 deployment plus its accepted
function correction, restricted runtime grants, P3.4 fee schema/grants, P3.5
preparation/generation/intake lock, P3.6 contribution configuration, P3.7 governance
configuration and P3.8B publication. The two early proposals deliberately omit
runtime grants; the included `private-runtime-grants.sql` supplies the exact
reviewable column/function scope needed by their invoker functions. That grants
file is a proposal, not a statement of verified effective Production permissions.
It leaves auth/Genesis/WordWake and publication grants unchanged.

Some accepted files have their own BEGIN/COMMIT; preserve those transaction units.
The installed database must be `neondb`, matching the existing SQL guards; owner
execution and separately confirmed target remain mandatory. The proposal headers
still record their historical Development status; they are not installation
approval. Do not wrap an internal COMMIT as though an outer transaction contains it.
No test fixtures, seeds, old attempts or Community Tool Library records belong in
this installation. Preview requires a separately approved isolated schema-only
target, not a copied Development runtime dataset.

Before the publication step, separately provision `yawrd_publication_writer` as a
nonprivileged LOGIN. Preserve the accepted P3.8B grants: writer gets schema USAGE
and EXECUTE on `issue`, `receipt`, `ticket`, `publish`; no source/auth reads, direct
publication table DML/SELECT, schema CREATE or `context` EXECUTE. Runtime gets only
schema USAGE and SELECT on `public_yawrds`; it cannot read private evidence,
invoke publication functions or SET ROLE into writer/owner. The trusted function
owner remains inaccessible to application logins. The accepted sole owner ADMIN
membership exception must have INHERIT=false/SET=false; do not broaden it.
P3.8B's SQL checks these effective boundaries. Reuse its accepted seven protected
Development checks and real signing evidence; do not rerun them as R2 work.

Excluded: superseded P3.8A launch SQL; the pinned Development premium recovery
experiment; unrelated legacy fee-foundation schema; all seeds and application data.
The shared-runtime SQL limitation is the founder-approved scoped Testnet-beta risk
exception. It is not a new R2 blocker and is not claimed repaired by admission.
Permissionless Testnet factory create is likewise outside platform admission.
