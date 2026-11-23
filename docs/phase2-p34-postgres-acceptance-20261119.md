# P3.4 Development PostgreSQL acceptance — PASS

Verified 2026-11-19 (Asia/Manila) against founder-confirmed Development endpoint
`ep-twilight-voice-aorpfrbm`, database `neondb`, login/effective role
`yawrd_07b_runtime`. Installation was already complete and was not rerun.

Git baseline: `feature/phase2-private-creation-p2-postgres-20261117`, HEAD
`0ecf38f53436c887895dacb67fe3612cdf4d4ce5`. Accepted uncommitted work preserved.

## Actual PostgreSQL results

Ten PASS groups completed:

| Check | Observed result |
| --- | --- |
| Installed catalog | One fee table, 28 columns; eight SECURITY INVOKER functions with fixed search path and bodies matching accepted artifacts; two enabled triggers with correct functions/events. Creation primary/foreign keys and validated verified-transaction/receipt unique constraints present. |
| Restricted privileges | SELECT, nine allowed INSERT columns and eight allowed UPDATE columns. No table-wide INSERT/UPDATE, DELETE, TRUNCATE, TRIGGER or schema CREATE; no PUBLIC access. No elevated/inherited runtime role privileges. |
| Binding/security/resume | One frozen fee intent per synthetic deployed Creation, exact 0.5 Testnet NEAR to yawrd.testnet, preserved across two synthetic founder sessions. Missing approval, enabled auto-update and stale security snapshot rejected: P0001 fee_security_required. |
| Founder isolation | Foreign synthetic founder read/open/claim/note/complete rejected: P0001 creation_not_found. |
| CAS/unknown lock | Stale Creation/deployment/fee revisions and missing consent rejected. One claim sets attempt 1; duplicate and unknown-state claims denied. Two session identities exercised sequentially inside one transaction, not a multi-connection concurrency benchmark. |
| Immutability | Binding/request updates denied by column privileges (42501). Changed claim height/hash rejected (P0001 fee_identity_frozen). Attempt reset/reprepare rejected (P0001 fee_transition_conflict); DELETE denied (42501). |
| Completion | Mismatched hash, non-post-claim height and invalid digest rejected (P0001 fee_evidence_required). Synthetic trusted-server evidence completes once; identical completion with stale revision is idempotent. Attempt stays 1; generation budget 0 and consumption false. Paid evidence cannot be rewritten. |
| Uniqueness | Duplicate Creation, verified transaction and verified receipt rejected (23505); correct named evidence constraint checked independently. Untrusted candidate hashes do not reserve a globally unique payment. Losing records remain unknown with no paid evidence. |
| Sessions | Revoked synthetic session rejected: P0001 sign_in_required. |
| Rollback/preservation | ROLLBACK acknowledged; persistent fee count 0 before and 0 after. No synthetic fee, deployment, Creation, session or challenge rows remain. Existing fee evidence and Creation/deployment revision fingerprints unchanged. |

Actual final output:

```json
{"status":"PASS","name":"rollback_and_preservation","rollbackAcknowledged":true,"feeCountBefore":0,"feeCountAfter":0,"syntheticRowsRemaining":0,"existingCreationDeploymentRevisionsUnchanged":true,"existingFeeEvidenceUnchanged":true}
{"status":"PASS","endpoint":"ep-twilight-voice-aorpfrbm","database":"neondb","checks":10,"walletActivation":false,"payment":false,"chainEvidence":"synthetic_transaction_local_only"}
```

The initial catalog-only attempt stopped before fixture writes: the verifier
needed a name[] → text[] cast for driver decoding. It rolled back. Only the
verifier query was corrected; installed schema was valid. The final run passed.

## Bounded verification command

```bash
cd /home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117
YAWRD_TEST_DATABASE_DEVELOPMENT=1 YAWRD_DEV_DATABASE_ENDPOINT=ep-twilight-voice-aorpfrbm \
  node --import ./scripts/load-environment.mjs scripts/check-creation-fee-postgres.mjs --development-rollback
```

The check reuses the existing target guard, restricted runtime configuration,
silent loader and bounded single-connection transaction approach. It uses SET
LOCAL statement/lock/idle timeouts, savepoints and unconditional ROLLBACK, then
checks disappearance and preservation. Raw errors, credentials and SQL parameters
are suppressed. All mutation targets are fresh generated IDs. Supporting
Creation/deployment calls create synthetic prerequisites only; no P2 suite ran.

This proves installed SQL behavior with synthetic trusted-server chain snapshots
and receipt evidence inside the rolled-back transaction. It does not claim a
real transfer occurred or independently reverify chain finality. There were no
migrations, grants, installer calls, chain RPC calls, wallet actions or commits.
No persistent fee record was created. No activation setting was changed.

## Decision and files

**PASS: ready for a separate wallet-activation decision.** No material PostgreSQL
acceptance blocker was demonstrated. This result grants no payment authority.

Only `scripts/check-creation-fee-postgres.mjs` and this report were added for this
assignment. Application code, installer and all three installed SQL artifacts
are unchanged. Script syntax and diff checks passed.
