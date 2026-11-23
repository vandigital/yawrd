-- R2 REVIEW PACKET ONLY. No automatic discovery or execution.
-- Derived from accepted P2 grants and the P3.2 invoker SQL's exact write columns.
-- Apply only with separately authorized target/inventory review, after the two
-- accepted table/function definitions, as trusted owner in an operator transaction.
-- No auth/Genesis/WordWake/publication grants are changed here.
REVOKE ALL ON yawrd.creation_drafts,yawrd.creation_deployments FROM yawrd_07b_runtime;
GRANT SELECT ON yawrd.creation_drafts,yawrd.creation_deployments TO yawrd_07b_runtime;
GRANT INSERT(id,founder_account_id,source_draft_id,initial_intake,intake)
  ON yawrd.creation_drafts TO yawrd_07b_runtime;
GRANT UPDATE(intake,public_name,public_description,account_label,second_steward,threshold,
  reviewed_revision,reviewed_public_text_digest,public_text_consent_version,public_text_reviewed_at)
  ON yawrd.creation_drafts TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_text_digest(text,text),yawrd.creation_founder(text),
  yawrd.creation_find_start(text,jsonb),yawrd.creation_start(text,text,jsonb),yawrd.creation_read(text,text),
  yawrd.creation_list(text,text,integer),yawrd.creation_save(text,text,bigint,jsonb,jsonb),
  yawrd.creation_review_public_text(text,text,bigint,text,text) TO yawrd_07b_runtime;
GRANT INSERT(creation_id,dao_identifier,source_revision) ON yawrd.creation_deployments TO yawrd_07b_runtime;
GRANT UPDATE(prepared,costs,prepared_at,state,source_revision,attempt,claimed_at,not_before_height,
  consent_version,transaction_hash,evidence,evidence_attempt,verified_transaction_hash)
  ON yawrd.creation_deployments TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_deployment_lock(text,text,bigint),
  yawrd.creation_deployment_read(text,text),yawrd.creation_deployment_reserve(text,text,bigint,text),
  yawrd.creation_deployment_prepare(text,text,bigint,bigint,jsonb,jsonb),
  yawrd.creation_deployment_claim(text,text,bigint,bigint,bigint,text),
  yawrd.creation_deployment_note(text,text,bigint,integer,text),
  yawrd.creation_deployment_finish(text,text,bigint,integer,text,jsonb) TO yawrd_07b_runtime;
-- No DELETE/TRUNCATE/DDL, role membership or table-wide INSERT/UPDATE is granted.
-- This preserves the explicitly accepted trusted-runtime Testnet-beta exception.
