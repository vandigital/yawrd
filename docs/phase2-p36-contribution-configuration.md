# P3.6 private contribution configuration

This checkpoint connects approved generalized Creation preparation to a private
configuration draft. It does not create participant tasks, assignments, rewards,
funding commitments or public projects.

After Blueprint approval, **Configure contributions** opens
`/create/[id]/contributions`. Existing approved configuration remains accessible
while later preparation derivatives are unapproved. The workspace selects the
highest **approved** version, rather than the latest preparation draft or the
limited version history returned to the Blueprint editor.

The founder chooses task inclusion and writes participation/reward notes.
Compensation defaults to undecided even if generated text proposes unpaid work.
Every unpaid choice requires explicit acknowledgement. Excluded dependencies are
reported, but do not prevent saving a private draft. Source task content is never
rewritten by configuration.

Configuration revisions are append-only and bind to an approved preparation
revision/digest. Reads retain the saved source alongside the latest approved
source. A new approval leaves old settings intact; the founder explicitly enters
review to carry matching task IDs forward. New tasks default to undecided and
unpaid acknowledgement is reset during carry-forward. Saving the new source
requires review acknowledgement. Changes to task definitions with the same IDs
are displayed for founder review; matching IDs are not evidence of unchanged work.

The proposal serializes saves and preparation approvals with the existing Creation
lock, checks the expected configuration revision, and supports identical receipt
retries without duplicate revisions. Runtime privileges allow selected INSERT
columns and SELECT; timestamps/digests are server-derived. No UPDATE, DELETE or
TRUNCATE grants are added. The established trusted-server/direct-SQL limitation
remains unchanged; this is not per-wallet RLS.

## Deferred database activation

`docs/proposals/migrations/phase2_creation_contribution_configuration.sql` is an
**unapplied additive Development proposal** requiring the accepted P3.5
preparation schema/functions, existing `prevent_mutation()` and runtime role
`yawrd_07b_runtime`. It adds one table, three functions and two triggers. It must
be reviewed and installed only under separate founder authorization. Existing
migrations and records are not modified. Missing schema returns a clear storage
installation message; no local-storage persistence fallback is used.

Real PostgreSQL durability, locking and rollback acceptance are pending that
authorized installation. Offline contract models and SQL assertions are not live
database acceptance.

## Focused offline checks

```
node --import ./test/register-contributions.mjs --test --test-isolation=none test/creation-contribution-configuration.test.ts test/creation-preparation.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none test/creation-contribution-configuration.browser.test.mjs
```

The browser check bundles the actual Blueprint/contribution components with
global Account controls in the existing offline harness pattern. It uses synthetic
API fixtures and a disposable Chromium profile, blocks external traffic, and does
not start Next Development, access a database or enable inference. It checks
navigation, save/reload, Saved/dirty/error feedback, explicit unpaid acknowledgement,
new-source review, stale private responses, responsive layout and reduced motion.
