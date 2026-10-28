# Milestone 05.1 — Creation integration

October 28, 2026 (Asia/Manila).

## A. Status

**PASS — application implementation and local mocked verification.** Application
submission, recovery and mocked verification are implemented. All 45 tests,
type checking and the production build pass. Deployed factory identity, runtime
costs and live transaction execution remain unverified. Opening is disabled by
default until public settings are supplied; this is not a live-readiness PASS.

No dependencies installed, contracts changed/deployed, wallet signatures,
blockchain transactions, funding, commits, pushes or publication performed.

## B. Implementation summary

| File | Change |
| --- | --- |
| `src/create-yawrd.ts` | Exports the existing UTF-8 base64 encoder; builder behavior preserved. |
| `src/creation-integration.ts` | Validates the exact two-account route, prepares the factory action, performs read-only preflight, checks finalized receipts and project state, stores attempts and reconciles unresolved outcomes. Includes the subsequent FactoryInfoUpdate integration boundary. |
| `src/testnet-factory-settings.ts` | Public operator configuration boundary, intentionally `null`. No invented deployment identity or sufficient-cost estimate. |
| `app/wallet-session.ts` | Reuses Meteor's `signAndSendTransaction`, checking selected account, wallet identity, session revision and Testnet immediately before the request. |
| `app/use-testnet-wallet.ts` | Exposes current wallet context and the submission adapter. Connection still requests no transaction or access key. |
| `app/components/creation-panel.tsx` | Setup preflight, readable cost review, explicit acknowledgement and wallet button, pending/failure/success display, explorer link, reload/redirect recovery and manual read-only reconciliation. Uses Web Locks around signing across tabs. |
| `app/page.tsx`, `app/layout.tsx` | Adds the panel to the existing layout and updates copy; general builder membership/threshold previews still work. |
| `test/creation-integration.test.ts` | Focused mocked integration coverage. All factory names, code bytes, costs and hashes in these fixtures are mock-only. |
| `test/wallet-session.test.ts` | Adds adapter tests; preserves connection regression cases. |
| `docs/creation-builder-compatibility.md`, this report | Records integration scope, reproduction, compatibility and remaining limits. |

## C. Factory compatibility

Inspected local public Sputnik checkout HEAD
`5434a59dec23ee0c49df8c8c4350c208a7e75b0b`, its
`sputnikdao-factory2/src/{lib,factory_manager}.rs`, DAO initializer, policy,
views and upgrade types. Reviewed the supplied 04.2A compatibility findings,
04.2C host build report and 04.1D exact two-account plan/governance report.
No private fork/source inspected or assumed equivalent.

- Method: payable `create(name: AccountId, args: Base64VecU8)`.
- JSON: `{ "name": "single-label", "args": "base64(UTF-8 JSON initializer)" }`.
- Initializer: existing `{config:{name,purpose,metadata:""},policy:{...}}`.
- Resulting address: `<label>.<factoryAccountId>`, validated within 64 characters.
- Source minimum deposit: 10 millinear = 0.01 NEAR =
  `10000000000000000000000` yoctoNEAR. This is a lower bound, **not a verified
  sufficient setup amount**. The whole deposit is forwarded to the new account;
  the factory invokes `new` with zero attached deposit.
- Internal gas: 40 Tgas to initialization plus 10 Tgas to callback. Outer
  creation overhead is additional. Configuration must exceed 50 Tgas and be
  at most 300 Tgas; runtime sufficiency is not established by those bounds.
- Factory must be initialized, have the reviewed code stored locally and selected
  as default, and have successfully registered that code globally. Preflight
  hashes the returned factory WASM, checks `get_default_code_hash`, hashes the
  raw `get_code` bytes, and checks/hash-verifies `view_global_contract_code`.
- Creation reads the mutable factory default at execution time; there is no
  per-call code selector. Preflight repeats before wallet approval. Post-creation
  WASM verification detects a different deployed build; it cannot prevent the
  owner changing the default while the wallet is open.
- Factory `create` returns the initialization promise, not the separately
  scheduled `on_create` callback result. The verifier inspects actual receipt
  actions for `new` and matching `on_create`, finalized outcomes, callback
  `true`, registry membership and exact config/policy/factory info. It does not
  infer success from an empty return value or transaction hash.
- Callback failure schedules a deposit refund; scheduling does not prove payment
  settlement. Failure UI explicitly leaves refund settlement unconfirmed and
  distinguishes network fees.
- Initial factory auto-updates are `true`. Opt-out uses
  `{FactoryInfoUpdate:{factory_info:{factory_id,auto_update:false}}}` with two
  distinct approvals. No governance action is submitted in this milestone.

The previous illustrative `sputnik-dao.near` address is **not** treated as a
verified Testnet factory. It remains a preview fallback only; submission requires
matching `.testnet` factory configuration. Steward accounts are checked on the
Testnet RPC. There is no verified deployed address to compare against this source.

RPC shapes/finality were checked against official
[transaction documentation](https://docs.near.org/api/rpc/transactions),
[receipt status schema](https://docs.near.org/api-reference/post-experimental_tx_status)
and [contract query documentation](https://docs.near.org/api/rpc/contracts).
The client uses public Testnet RPC and only `status`, `query`, and
`EXPERIMENTAL_tx_status` (`wait_until: FINAL`); no broadcast RPC is exposed.

## D. Local checks

```sh
npm run typecheck
npm test
node test/create-yawrd.test.ts
node test/wallet-session.test.ts
node test/creation-integration.test.ts
git diff --check
npm run build
```

Type checking passes. Suites: builder **9**, wallet **13**, creation integration
**23**; **45 passing cases**, zero failed. `npm test` reports all 45 passing cases
outside the sandbox; direct suites also pass inside it. Whitespace check passes.

The initial sandbox production build failed before compilation:
`Could not parse output from TypeScript's --showConfig.` Direct
`node node_modules/typescript/bin/tsc --showConfig` returns valid configuration.
A minimal `spawnSync` of that exact command returns status 0 and stdout length 0;
even a child Node `console.log(123)` returns empty captured stdout. This identifies
an environment subprocess-output limitation. Repeating the authorized local
`npm run build` outside the sandbox passes webpack compilation, TypeScript,
static page generation and trace collection. No tooling or dependency changes
were made. An initial parallel build/typecheck also encountered transient missing
generated `.next/types` files; subsequent sequential typechecks pass. Sandbox
`npm test` reports file totals rather than nested cases; the host run reports all
45 cases. The first sandbox dev-server smoke attempt failed to bind localhost
with `EPERM`; that is a sandbox socket restriction. Outside the sandbox,
`node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3033`
started successfully. A read-only localhost fetch returned HTTP 200 and confirmed
the builder's three steps, default preview and Meteor connection control in the
rendered page. The server was then stopped. This is an HTTP/render smoke check,
not a browser-wallet signing demonstration.

## E. Transaction readiness

The source and mocked flow are ready for review. Before a controlled live attempt,
replace `null` in `src/testnet-factory-settings.ts` with public reviewed values:

```ts
{
  network: "testnet",
  factoryAccountId: /* verified Testnet account */,
  expectedFactoryCodeHash: /* reviewed deployed factory WASM SHA-256, base58 */,
  expectedDaoCodeHash: /* reviewed DAO WASM SHA-256, base58 */,
  setupDepositYocto: /* confirmed sufficient setup deposit, decimal string */,
  createGas: /* confirmed outer gas limit, decimal string */,
  costConfirmation: /* evidence/reference for these reviewed cost settings */
}
```

Use the actual artifact identities, not a commit ID or hexadecimal hash string.
No build report hash is automatically asserted to be a deployed identity. The
browser must support durable localStorage, Web Locks and Web Crypto. Testnet
requires exactly two distinct existing Steward accounts and threshold 2. Existing
general builder fixtures remain supported for previews.

Real Meteor rejection codes/redirect behavior, public RPC/global-code behavior,
gas sufficiency and live receipt shapes have not been tested on-chain or through
a connected browser wallet. Missing receipt details or an unsupported RPC response
keeps the outcome unresolved. Mocked results do not establish live readiness.

## F. Security safeguards

- Checking setup is read-only. A separate acknowledged user click requests wallet
  approval with explicit signer, Testnet, receiver, method, arguments, deposit and
  gas. The app handles no private keys, seeds or wallet secrets.
- Reviewed input is compared again at submission; wallet and RPC network changes
  stop the request. The wallet adapter rechecks its active Meteor session after
  asynchronous account lookup.
- The pending record is saved **before** opening the wallet. It contains public
  request metadata, state and hash only. Reload or redirect restores unresolved
  state, with automatic read-only verification when a hash is available. Wallet
  callback hashes must match the complete saved transaction request via RPC.
- In-memory exclusion, a durable attempt record and a browser Web Lock prevent
  duplicate requests from double clicks, pending outcomes and tabs sharing the
  same origin. Clearing browser storage or using another browser/device bypasses
  that local coordination; no server-side idempotency is claimed.
- Known explicit rejection codes/names and the connector's exact `User rejected`
  message are distinct from failure. Ambiguous wallet
  exceptions, RPC timeouts and incomplete/mismatched receipt/state evidence remain
  unknown and block another request. A hash can be entered from wallet history
  for reconciliation without another signature. Corrupt saved data fails closed.
- Confirmed creation always displays **Hardening Required** and leaves additional
  Project Funds disabled, even if a later view reports auto-update false. This
  milestone does not verify all account access or execute joint governance.
  No escrow/protected-funds claim or project-funding action exists.
- Subsequent joint opt-out must be followed by verification of factory info,
  exact policy, code and account access. As recorded in 04.1D, opt-out also blocks
  the current factory-mediated self-upgrade route; proposal approval alone does
  not establish successful upgrade execution.

## G. Smallest next milestone

Complete the connected-browser review. Identify and read-only verify one compatible Testnet
factory, reviewed code identities, global registration and sufficient cost
settings. Then obtain explicit authorization for a bounded creation attempt and
two-account opt-out demonstration, including account IDs and spending limits.
Capture real finalized receipts and verify the resulting project. Wire only the
existing opt-out proposal plus its two separate approvals and post-state checks;
keep additional Project Funds disabled until that verification completes.

No live attempt or governance demonstration is authorized by this report.
