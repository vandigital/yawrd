# P3.3 — Creation governance hardening

Baseline: `/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117`,
branch `feature/phase2-private-creation-p2-postgres-20261117`, HEAD
`0ecf38f53436c887895dacb67fe3612cdf4d4ce5`. Existing modified/untracked P3 work
and the corrected SQL proposals were preserved. Original checkouts were read only.

## Delivered experience

Open `/create/yawrd-uorgr4yy5sxu/secure`, or choose **Secure your Yawrd** from
Setup costs and next steps after deployment verification. This Development-only
page uses the existing NEP-413 session and Meteor connector.

**Secure your Yawrd — review next action** runs current finalized checks and may
ask the founder to choose their account in Meteor. That connection submits no
transaction. After a separate review/consent, **Create security proposal in
Meteor** opens the exact factory-info opt-out request. Creating the proposal
casts no vote. The first approval and the second, executing approval are separate
personal wallet actions by the saved Stewards. Both use the same security-only
URL and their own sign-in. No founder intake is selected or returned to either
Steward through this endpoint; unrelated accounts are refused.

The workflow resumes the existing on-chain proposal instead of generating a new
one. Already hardened state requires the expected code/config/policy, finalized
`auto_update:false`, and an Approved matching proposal with both saved Steward
votes. Duplicate/conflicting proposals, unexpected policy/code, stale reviews,
insufficient balance and changed sessions withhold signing.

## Reuse and safeguards

The accepted Genesis hardening kind and WordWake C3C implementation were inspected
in the earlier Yawrd worktree. Reused behavior: `FactoryInfoUpdate`, exact 50 Tgas
operations, zero proposal bond, separate `VoteApprove` calls, runtime profile
`804f4b2890ad8b6902e8d526f4de9b4b02f8e36a9639743040b7cc27f8a34c0e`, normalized
policy comparisons, storage/fee reserve checks, native keyless Meteor account
selection, receipt graphs and actual historical signing-key permission checks.
No WordWake account, Steward pair, proposal ID or hash is used as Creation
identity. The immutable finalized deployment supplies those bindings.

FASTNEAR remains the RPC endpoint. Only the two C3C read methods
`EXPERIMENTAL_protocol_config` and `gas_price` were added to existing read-only
allowlists; deadlines and the broadcast prohibition remain. The existing
synchronous reserved authorization window and one-use prepared Meteor adapter
are reused. Preparation and reconciliation recheck session and Creation/intent
revisions after network reads. No wallet callback establishes completion.

The database keeps the accepted immutable deployment and its receipt history.
The DAO's own proposals, votes and setting are the durable governance evidence,
joined to the Creation through its unique saved DAO binding. Public transaction
hashes, proposal IDs and pending/verified history are kept in Creation/DAO-scoped
browser storage using the accepted C3C pattern. Web Locks and unresolved browser
history prevent duplicate local submissions; they are not a cross-device server
lock. Unknown outcomes retain the hash before read-only receipt verification;
no error, reload or callback automatically retries signing or deletes history.
No new SQL table, migration or database write was introduced.

Platform fee, Project Funds and publication stay unavailable even after the
security setting is verified; their separate requirements were not activated.
Stale deployment wallet waiting messages are suppressed after a returned/verified
result. Security progress clears when reads or wallet work finish.

## Actual read-only Development evidence

Creation `yawrd-uorgr4yy5sxu`, DAO `xfheozm6d1tb.factory.yawrd.testnet`:
intent revision 14, attempt 2, `deployed-hardening-required`, recorded finalized
creation transaction `JDbvZKgY6yKLcXh2UG12LWkKSUTQ3tLnCjzPFButBoEJ`.

At finalized block 278243807, actual DAO code matched the accepted code hash;
configuration matched the saved public deployment; Stewards were
`yawrd1.testnet` and `keelbase.testnet`, policy 2-of-2, proposal bond zero,
`auto_update:true`, and proposal count zero.

A read-only preparation at block 278244707 passed the existing runtime/key/
balance checks and produced a proposal targeting this DAO, factory
`factory.yawrd.testnet`, `auto_update:false`, 50 Tgas and zero deposit. The checked
fee reserve was 0.011 Testnet NEAR including price headroom; Meteor must show its
actual fees. This was an unsigned preview, not a wallet request or proposal.

The actual Development page returned HTTP 200; anonymous API access returned
401 `sign_in_required`. No governance transaction was initiated or executed.

## Targeted validation

- `test/creation-hardening.test.ts`: 9 passed, covering Creation/DAO binding,
  second-Steward-only public access, unrelated/expired session denial, CAS,
  pending/resume/conflict handling, code/policy/runtime checks, finalized receipt
  and signer evidence, browser-history integrity and closed downstream gates.
- Eight affected wallet tests passed, covering unchanged Creation signing,
  synchronous prepared calls, reserved-window routing, native Steward selection
  and refusal of app-key/account changes.
- Existing Chromium harness passed the added security-only journey: Strict Mode
  loading, explicit founder review, persistent unknown hash recovery, second
  Steward executing-approval review, final-state rendering and unrelated-account
  denial. No real signing occurred.
- TypeScript and `git diff --check` passed. No broad/P2 suites were run.
- Screenshot: `/tmp/yawrd-intake-recovery-evidence/creation-security-ready.png`
  (synthetic browser data).

## Files touched

- `src/creation/hardening.ts`, `src/creation/hardening-http.ts`
- `app/api/creations/[id]/hardening/route.ts`
- `app/create/[id]/secure/page.tsx`, `hardening-panel.tsx`
- `app/create/setup/deployment-review.tsx`, `founder-dashboard.tsx`
- `app/wallet-session.ts`, `app/use-testnet-wallet.ts`
- `src/creation-integration.ts`, `src/platform-fee/verification.ts`
- `test/creation-hardening.test.ts`, `test/wallet-session.test.ts`,
  `test/creation-intake.browser.test.mjs`, `test/fixtures/creation-hardening-protocol.json`
- `package.json` (existing test list), this report.

No code-level blocker remains for the founder to begin. Real proposal creation,
two approvals and post-execution live verification remain founder-controlled
wallet work; none was performed by the implementation or tests.
