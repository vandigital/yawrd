-- UNAPPLIED P3.4 restricted Development grants. Same trusted-server invoker
-- boundary as P1/P3.2. No owner/superuser/DDL/delete rights; no legacy grants.
REVOKE ALL ON TABLE yawrd.creation_platform_fees FROM yawrd_07b_runtime;
GRANT SELECT ON yawrd.creation_platform_fees TO yawrd_07b_runtime;
GRANT INSERT (creation_id,founder_account_id,dao_account_id,deployment_transaction,deployment_digest,
  deployment_final_height,request,security_review,not_before_height) ON yawrd.creation_platform_fees TO yawrd_07b_runtime;
GRANT UPDATE (state,attempt,claimed_at,claim_height,claim_review,consent_version,transaction_hash,evidence)
  ON yawrd.creation_platform_fees TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_fee_guard() TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_fee_lock(text,text,bigint,bigint) TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_fee_review(yawrd.creation_deployments,jsonb) TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_fee_read(text,text) TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_fee_open(text,text,bigint,bigint,jsonb) TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_fee_claim(text,text,bigint,bigint,bigint,jsonb,text) TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_fee_note(text,text,bigint,text) TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_fee_complete(text,text,bigint,jsonb) TO yawrd_07b_runtime;
