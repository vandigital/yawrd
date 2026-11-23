# P3.2 wallet launch correction and pending operator recovery

Baseline: `feature/phase2-private-creation-p2-postgres-20261117`,
`0ecf38f53436c887895dacb67fe3612cdf4d4ce5`. All earlier working changes were preserved.

The founder corrected the initial report: Meteor opened, but no transaction
approval screen appeared. They did not approve, sign or submit a transaction.

## Diagnosis and correction

P3 had regressed from the accepted November 12/13 implementation in
`/tmp/yawrd-milestone-10a`: Creation RPC still used `rpc.testnet.near.org`, and
its wallet flow lacked the prepared Meteor signer and exact-route, click-reserved
window. It awaited server preflight/claim and wallet/account lookups before the
connector call. The SDK then awaits sandbox dispatch and Meteor's transaction
transformation before requesting Web authorization. These asynchronous boundaries
can lose transient browser activation and stop at a shell/fallback rather than
reliably opening transaction approval. The recorded attempt has no historical
launch-stage telemetry; its exact terminal handoff stage cannot be reconstructed
from the deployment row alone. The founder's correction is not proof of signing.

The accepted one-shot Meteor window broker and prepared signer were reused.
The reservation is synchronous in the founder click, before any server claim.
A blocked popup and failed signer lookup consume no claim. After a successful
claim, the unchanged exact transaction reaches the prepared adapter without
another account lookup. The broker accepts only
`https://wallet.meteorwallet.app/connect/testnet/sign`, preserving the connector's
URL. Other origins, Mainnet, login and obsolete SDK-action routes cannot claim it.
Fixed-stage diagnostics distinguish connector invocation, requested navigation,
opened authorization route and returned/rejected requests; they contain no
payloads, accounts, descriptions, URLs or callback parameters.

Preparation, preflight and reconciliation now share the accepted free FASTNEAR
Testnet endpoint through the existing read-only Creation transport, retaining its
20-second abort and all code/finality/receipt checks. Meteor signer preparation
has a 10-second lookup deadline; its one-use, exact-wallet/transaction permit
expires after one minute. The 30-second launch observation never cancels or
retries a wallet request. A missing result remains unresolved.

Meteor's current public executor already configures its own Testnet provider as
FASTNEAR. It transforms transactions with a block lookup before the sign handoff;
changing Yawrd's RPC alone is not a fix for Meteor's internal navigation.
Source inspected read-only:
https://raw.githubusercontent.com/Meteor-Wallet/meteor_wallet_sdk/data-storage/storage/meteor-near-connect-latest.js

Identity authentication's separate RPC was not changed. No wallet authentication,
transaction framework, factory, deployment identity or finalized verifier was rebuilt.

## Read-only Development evidence

Creation: `yawrd-uorgr4yy5sxu`; founder: `yawrd1.testnet`;
DAO: `xfheozm6d1tb.factory.yawrd.testnet`.

The initial and final SELECTs agreed: state `unknown`, intent revision `5`,
attempt `1`, source revision `6`, no transaction hash, verified hash or evidence.
Claimed at `2026-11-18T10:37:46.126Z`, finalized lower-bound height `278230024`.
The original request digest remains
`d8dcc5332df50272b7c9739e0687761eed3f8c9e4abdc99d22bd46a867f55191`.

Independent pinned finalized FASTNEAR observations:

| Height | Hash | Observed UTC |
| --- | --- | --- |
| 278230724 | 49iRygb4jdcTEbUoh1GW9Rdts1nLusRvELMLnLBBsuV2 | 2026-11-18T10:44:47.833Z |
| 278230748 | GbeMqF1pSUZt8x7gE26L5JtBgfwyXmNXdpBC4P8AdqiQ | 2026-11-18T10:45:02.639Z |

Both independently passed existing factory/default/stored/global DAO code and
Steward checks, found the reserved account absent, and found no target entry in
the factory registry. They are 24 blocks apart. These observations show no
successful finalized creation at those snapshots; they do not prove no broadcast,
failed transaction, retained wallet request or later inclusion. No transaction
hash is known; any hash found in Meteor activity takes precedence and must use
normal finalized reconciliation.

## Prepared recovery boundary: not installed, enabled or executed

Read-only inspection of the installed guard confirmed the corrected integer cast
and no retirement branch. The installed SQL rejects a hashless `unknown` -> review transition. Fabricating
failed-transaction evidence or resetting/deleting the attempt would be unsafe.
The unapplied `proposals/migrations/phase2_creation_deployment_recovery.sql`
replaces only the existing guard and prepare functions, preserving their
signatures/grants, the corrected boolean-to-integer cast, all tables/constraints,
and the original installed proposal unchanged.

A separately authorized retirement re-verifies both canonical-height snapshots
and one fresh finalized snapshot with the frozen request. SQL then rechecks
session ownership, Creation/intent CAS and hash absence under locks, archives the
original state/revision/counter/claim time/head/source/preparation/quote/consent
and request digest in private `costs.retiredAttempts`, and returns to review.
The counter remains `1`; the exact request/DAO identity stay frozen. Quote
refresh cannot erase the archive. A future separately authorized claim would be
attempt `2`, never attempt `1` again. Retirement never enables signing; the
existing one-attempt deployment authorization remains spent.

The prepared authenticated action is `POST /api/creations/yawrd-uorgr4yy5sxu/deployment`:

```json
{
  "action": "retire",
  "expectedRevision": 6,
  "intentRevision": 5,
  "attempt": 1,
  "observations": [
    {"blockHeight": 278230724, "blockHash": "49iRygb4jdcTEbUoh1GW9Rdts1nLusRvELMLnLBBsuV2"},
    {"blockHeight": 278230748, "blockHash": "GbeMqF1pSUZt8x7gE26L5JtBgfwyXmNXdpBC4P8AdqiQ"}
  ],
  "founderConfirmed": true
}
```

The last read confirmed Creation revision 6 and intent revision 5; refresh them
before any authorized operation. This is a review payload, not authorization to
execute it. The running route denies
retirement with HTTP 403. Required authorization is: review/install the two
function replacements, then authorize exactly one retirement of this Creation's
revision-5/attempt-1 claim after the founder closes all unfinished Meteor windows,
checks Testnet activity for a hash, and confirms no approval/submission. Refresh
CAS revisions if changed. The server must recheck the snapshots and a fresh head
immediately before the mutation. No hash, uncertain RPC, changed record or
present account/registry entry may be ignored. A later wallet attempt requires
separate bounded founder authorization and all normal review/claim checks.

## Targeted evidence and changed files

- `test/creation-deployment.test.ts` and `test/wallet-session.test.ts`: 49 passed,
  using synthetic SQL/RPC/wallet fixtures. Recovery SQL itself was not executed.
- `test/creation-intake.browser.test.mjs`: Chromium passed, including a synthetic
  blocked popup consuming no claim. No actual signing button was dispatched to Meteor.
- TypeScript checking and `git diff --check`: passed.

Changed application files:
`src/creation-integration.ts`, `src/creation/deployment.ts`,
`src/creation/deployment-types.ts`, `src/creation/deployment-http.ts`,
`src/creation/repository.ts`, `app/wallet-session.ts`, `app/use-testnet-wallet.ts`,
`app/meteor-wallet-launch.ts` (reused accepted helper),
`app/create/setup/deployment-submit.ts`, `app/create/setup/deployment-review.tsx`.
The three test files above, this report, and the unapplied function proposal are
also changed/new. No live write, schema installation, grant, transaction, commit,
push, factory deployment or Production operation was performed.
