# Fixed YAW-001 Task B Reward Payout

This candidate starts at deployed M08 application commit
`e391043f3fa136cc6ee08e5f6b28392ac0578152`. It adds no schema or contract changes.
The accepted contribution signing, acknowledgement and activation paths remain intact.

The Reward Payout section follows Creator Workspace. A signed-in `yawrd.testnet`
can also see it without applying for Crew membership. The existing session/HTTP
protection exposes only the fixed reward's acknowledgement boolean and recorded
timestamp to the two Stewards. Private contribution/application text stays private.
Every action checks that session and the currently selected Meteor account agree.

## Reviewed interfaces

The repository's public DAO source pin is
`near-daos/sputnik-dao-contract@5434a59dec23ee0c49df8c8c4350c208a7e75b0b`:

- [Proposal methods and native Transfer kind](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs)
- [Proposal view methods](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/views.rs)
- [Bounded action block log](https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/action_log.rs)

`add_proposal({proposal:{description,kind}})` creates without voting.
`act_proposal({id,action:"VoteApprove",proposal:kind,memo:null})` requires the full
kind, including `Transfer:{token_id:"",receiver_id,amount,msg:null}`.
`get_proposals({from_index,limit})` scans ID ranges (removed IDs leave holes), and
`get_proposal({id})` returns flattened proposal fields. All views in each scan
use one finalized block. The known zero bond and two-Steward decision are accepted
inputs; this implementation does not repeat treasury or policy investigation.

## Expected real wallet UX — requires separate founder authorization

1. `yawrd1.testnet` connects Meteor on Testnet and completes the existing sign-in.
   Review the fixed Task B terms: project `demo.factory.yawrd.testnet`, recipient
   `keelbase1.testnet`, 1 NEAR, PR #4 and merge
   `26d2d5e8b087749f47696ee27732a42f32929da7`.
2. Explicitly choose **Create Payout Proposal in Meteor**. This requests one
   `add_proposal` transaction with zero deposit and 200 Tgas maximum attached gas;
   Testnet network fees apply. The resulting proposal starts at **0/2** approvals.
3. The creator independently chooses **Approve Payout Proposal in Meteor** and
   authorizes a separate `act_proposal` transaction. The chain then shows **1/2**.
4. `yawrd.testnet` signs in using its own wallet/session and independently approves
   the same proposal. The second approval can execute the transfer. No account's
   vote is requested automatically or offered again after a recorded vote.
5. Inspect proposal ID, both actual vote entries, transaction links and the verified
   transfer receipt. **Paid** requires FINAL execution evidence connecting the
   matching Steward approval to the exact successful native transfer receipt.
   Proposal status **Approved** alone leaves settlement unverified.

## Reconciliation and limits

Only public attempt metadata is saved before opening Meteor. Reloads, redirects,
focus/account changes and periodic reads reconcile chain state without signing.
A missing wallet result leaves the attempt unresolved and blocks another request;
an existing matching proposal resolves creation without creating another.
Any other native transfer proposal for the recipient blocks creation for review.
If a previously confirmed proposal disappears, this browser also blocks creation.
The scan fails closed beyond 1,000 proposal IDs; this is a bounded fixed MVP flow.
It cannot enforce uniqueness against concurrent transactions from other devices
or external tools; there is no general duplicate-payment subsystem.

For settlement recovery on another browser, the contract's bounded action-block
log locates native transfer receipts; read-only block/chunk and
`EXPERIMENTAL_receipt_to_tx` queries recover transaction evidence. Some RPC nodes
may not retain history or support that experimental lookup. Then the UI explicitly
keeps settlement unverified and accepts the final Steward's transaction hash for
direct receipt verification. If transaction receipts themselves are unavailable,
it keeps settlement unverified; it does not infer payment from votes or balances.
See [NEAR transaction RPC](https://docs.near.org/api/rpc/transactions) and
[receipt-to-transaction RPC](https://docs.near.org/api-reference/post-experimental_receipt_to_tx).

No live RPC, database operation or wallet action was needed for mocked tests.
No Production environment or activation setting is changed by this candidate.
