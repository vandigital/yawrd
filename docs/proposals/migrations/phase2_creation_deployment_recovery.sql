-- UNAPPLIED, operator-reviewed function-only recovery proposal.
-- No table/column/constraint/privilege changes. Existing signatures/grants stay.
-- Does not authorize a new wallet attempt. Never reset attempt or delete history.
-- Trusted server must independently reverify all pinned/fresh chain observations
-- and obtain the founder confirmation before invoking creation_deployment_prepare.
BEGIN;
CREATE OR REPLACE FUNCTION yawrd.creation_deployment_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, yawrd AS $$
DECLARE retiring boolean; r jsonb; prior jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.creation_id,NEW.network,NEW.factory_account_id,NEW.dao_identifier,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.creation_id,OLD.network,OLD.factory_account_id,OLD.dao_identifier,OLD.created_at)
      OR (OLD.attempt > 0 AND ROW(NEW.prepared,NEW.source_revision) IS DISTINCT FROM ROW(OLD.prepared,OLD.source_revision)) THEN
      RAISE EXCEPTION 'deployment_identity_frozen';
    END IF;
    prior := COALESCE(OLD.costs->'retiredAttempts','[]'::jsonb);
    retiring := OLD.state IN ('wallet-requested','unknown') AND NEW.state='prepared';
    IF retiring THEN
      r := NEW.costs->'retiredAttempts'->-1;
      IF OLD.transaction_hash IS NOT NULL OR OLD.evidence IS NOT NULL OR OLD.attempt < 1
        OR jsonb_typeof(NEW.costs->'retiredAttempts') IS DISTINCT FROM 'array'
        OR (NEW.costs->'retiredAttempts') - (jsonb_array_length(NEW.costs->'retiredAttempts')-1) IS DISTINCT FROM prior
        OR (NEW.costs-'retiredAttempts') IS DISTINCT FROM (OLD.costs-'retiredAttempts')
        OR NOT COALESCE(r->>'attempt'=OLD.attempt::text AND r->>'revision'=OLD.revision::text
          AND r->>'state'=OLD.state AND r->>'claimedAt'=to_char(OLD.claimed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          AND r->>'sourceRevision'=OLD.source_revision::text
          AND r->>'preparedAt'=to_char(OLD.prepared_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          AND r->>'consentVersion'=OLD.consent_version AND r->'costs'=(OLD.costs-'retiredAttempts')
          AND r->>'notBeforeHeight'=OLD.not_before_height::text AND r->>'requestDigest'=OLD.request_digest
          AND r->>'confirmedBy'=OLD.prepared#>>'{transaction,signerId}'
          AND r->'transactionHash'='null'::jsonb
          AND r->>'confirmation'='closed-wallet-checked-testnet-no-approval-no-submission-v1'
          AND jsonb_array_length(r->'observations')=3
          AND (r#>>'{observations,0,blockHeight}')::bigint >= OLD.not_before_height
          AND (r#>>'{observations,1,blockHeight}')::bigint-(r#>>'{observations,0,blockHeight}')::bigint >= 20
          AND (r#>>'{observations,2,blockHeight}')::bigint >= (r#>>'{observations,1,blockHeight}')::bigint
          AND r#>>'{observations,0,blockHash}' ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
          AND r#>>'{observations,1,blockHash}' ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
          AND r#>>'{observations,2,blockHash}' ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$',false)
        THEN RAISE EXCEPTION 'deployment_recovery_evidence_required'; END IF;
    ELSIF COALESCE(NEW.costs->'retiredAttempts','[]'::jsonb) IS DISTINCT FROM prior THEN
      RAISE EXCEPTION 'deployment_recovery_history_frozen';
    END IF;
    IF NOT ((OLD.state = 'reserved' AND NEW.state IN ('reserved','prepared'))
      OR (OLD.state = 'prepared' AND NEW.state IN ('prepared','wallet-requested'))
      OR (OLD.state IN ('wallet-requested','unknown') AND NEW.state IN ('unknown','failed','deployed-hardening-required'))
      OR (OLD.state = 'failed' AND NEW.state = 'prepared') OR retiring) THEN RAISE EXCEPTION 'deployment_transition_conflict'; END IF;
    IF NEW.attempt <> OLD.attempt + ((OLD.state='prepared' AND NEW.state='wallet-requested')::integer) THEN
      RAISE EXCEPTION 'deployment_transition_conflict';
    END IF;
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := 1;
  END IF;
  NEW.request_digest := CASE WHEN NEW.prepared IS NULL THEN NULL ELSE encode(sha256(convert_to(NEW.prepared::text,'UTF8')),'hex') END;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION yawrd.creation_deployment_prepare(_session text,_id text,_creation_revision bigint,_expected bigint,_prepared jsonb,_costs jsonb)
RETURNS SETOF yawrd.creation_deployments LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE c yawrd.creation_drafts; d yawrd.creation_deployments;
BEGIN
  IF _creation_revision IS NULL THEN RAISE EXCEPTION 'creation_revision_conflict'; END IF;
  c := yawrd.creation_deployment_lock(_session,_id,_creation_revision);
  SELECT * INTO d FROM yawrd.creation_deployments WHERE creation_id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deployment_not_found'; END IF;
  PERFORM yawrd.creation_founder(_session);
  IF _expected IS NULL OR d.revision <> _expected THEN RAISE EXCEPTION 'deployment_revision_conflict'; END IF;
  IF d.state NOT IN ('reserved','prepared','failed') AND NOT
    (d.state IN ('wallet-requested','unknown') AND _costs->'retiredAttempts' IS DISTINCT FROM d.costs->'retiredAttempts')
    THEN RAISE EXCEPTION 'deployment_unresolved'; END IF;
  -- The trigger validates and archives the exact original claim on retirement.
  -- Normal quote refresh must retain all earlier retired attempt snapshots.
  IF d.state IN ('reserved','prepared','failed') AND d.costs ? 'retiredAttempts' THEN
    _costs := _costs || jsonb_build_object('retiredAttempts',d.costs->'retiredAttempts');
  END IF;
  IF d.attempt > 0 AND d.prepared IS DISTINCT FROM _prepared THEN RAISE EXCEPTION 'deployment_identity_frozen'; END IF;
  IF NOT COALESCE(_prepared#>>'{transaction,network}'='testnet'
    AND _prepared#>>'{transaction,signerId}'=c.founder_account_id
    AND _prepared#>>'{transaction,receiverId}'=d.factory_account_id
    AND _prepared#>>'{plan,daoAccountId}'=d.dao_account_id
    AND _prepared#>>'{transaction,actions,0,params,args,name}'=d.dao_identifier
    AND _prepared#>>'{input,projectName}'=c.public_name
    AND _prepared#>>'{input,projectPurpose}'=c.public_description
    AND _prepared#>>'{input,initialStewardAccountIds,0}'=c.second_steward
    AND _prepared#>>'{input,stewardApprovalThreshold}'='2',false) THEN RAISE EXCEPTION 'deployment_request_mismatch'; END IF;
  UPDATE yawrd.creation_deployments SET prepared=_prepared,costs=_costs,prepared_at=clock_timestamp(),state='prepared',
    source_revision=CASE WHEN attempt=0 THEN c.revision ELSE source_revision END
    WHERE creation_id=_id RETURNING * INTO d;
  RETURN NEXT d;
END;
$$;
COMMIT;
