-- UNAPPLIED P3.2 PROPOSAL. One private extension to accepted P1.
-- No migration loader, grants, activation, backfill or existing-table changes.
-- Trusted-server SECURITY INVOKER pattern, exactly as P1; not an untrusted SQL API.
CREATE TABLE yawrd.creation_deployments (
  creation_id text PRIMARY KEY REFERENCES yawrd.creation_drafts(id),
  network text NOT NULL DEFAULT 'testnet' CHECK (network = 'testnet'),
  factory_account_id text NOT NULL DEFAULT 'factory.yawrd.testnet' CHECK (factory_account_id = 'factory.yawrd.testnet'),
  dao_identifier text NOT NULL CHECK (dao_identifier ~ '^[a-z0-9]{12}$'),
  dao_account_id text GENERATED ALWAYS AS (dao_identifier || '.' || factory_account_id) STORED,
  source_revision bigint NOT NULL CHECK (source_revision BETWEEN 1 AND 9007199254740990),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740990),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','prepared','wallet-requested','unknown','failed','deployed-hardening-required')),
  prepared jsonb,
  request_digest text CHECK (request_digest ~ '^[a-f0-9]{64}$'),
  costs jsonb,
  prepared_at timestamptz,
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  claimed_at timestamptz,
  not_before_height bigint CHECK (not_before_height > 0),
  consent_version text CHECK (consent_version = 'creation-deployment-v1'),
  transaction_hash text CHECK (transaction_hash ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  verified_transaction_hash text UNIQUE CHECK (verified_transaction_hash ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  evidence jsonb,
  evidence_attempt integer,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (network, factory_account_id, dao_identifier),
  CHECK ((prepared IS NULL AND state = 'reserved' AND request_digest IS NULL AND costs IS NULL AND prepared_at IS NULL)
    OR (prepared IS NOT NULL AND request_digest IS NOT NULL AND costs IS NOT NULL AND prepared_at IS NOT NULL
      AND jsonb_typeof(prepared) = 'object' AND octet_length(prepared::text) <= 131072 AND jsonb_typeof(costs) = 'object')),
  CHECK ((attempt = 0 AND claimed_at IS NULL AND not_before_height IS NULL AND consent_version IS NULL)
    OR (attempt > 0 AND claimed_at IS NOT NULL AND not_before_height IS NOT NULL AND consent_version IS NOT NULL)),
  CHECK ((evidence IS NULL AND verified_transaction_hash IS NULL AND evidence_attempt IS NULL)
    OR (evidence IS NOT NULL AND verified_transaction_hash IS NOT NULL AND evidence_attempt IS NOT NULL AND evidence_attempt BETWEEN 1 AND attempt
      AND jsonb_typeof(evidence) = 'object')),
  CHECK (state NOT IN ('failed','deployed-hardening-required') OR (evidence IS NOT NULL AND evidence_attempt = attempt)),
  CHECK (state NOT IN ('wallet-requested','unknown','failed','deployed-hardening-required') OR attempt > 0)
);

CREATE FUNCTION yawrd.creation_deployment_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, yawrd AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.creation_id,NEW.network,NEW.factory_account_id,NEW.dao_identifier,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.creation_id,OLD.network,OLD.factory_account_id,OLD.dao_identifier,OLD.created_at)
      OR (OLD.attempt > 0 AND ROW(NEW.prepared,NEW.source_revision) IS DISTINCT FROM ROW(OLD.prepared,OLD.source_revision)) THEN
      RAISE EXCEPTION 'deployment_identity_frozen';
    END IF;
    IF NOT ((OLD.state = 'reserved' AND NEW.state IN ('reserved','prepared'))
      OR (OLD.state = 'prepared' AND NEW.state IN ('prepared','wallet-requested'))
      OR (OLD.state IN ('wallet-requested','unknown') AND NEW.state IN ('unknown','failed','deployed-hardening-required'))
      OR (OLD.state = 'failed' AND NEW.state = 'prepared')) THEN RAISE EXCEPTION 'deployment_transition_conflict'; END IF;
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
CREATE TRIGGER guard_creation_deployment BEFORE INSERT OR UPDATE ON yawrd.creation_deployments
  FOR EACH ROW EXECUTE FUNCTION yawrd.creation_deployment_guard();
CREATE TRIGGER preserve_creation_deployment BEFORE DELETE ON yawrd.creation_deployments
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();

-- All mutations use session -> Creation -> intent lock ordering. The session is
-- checked again after waits. P1 configuration/intake save semantics are unchanged.
CREATE FUNCTION yawrd.creation_deployment_lock(_session text,_id text,_expected bigint)
RETURNS yawrd.creation_drafts LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE actor text; c yawrd.creation_drafts;
BEGIN
  actor := yawrd.creation_founder(_session);
  SELECT * INTO c FROM yawrd.creation_drafts WHERE id=_id AND network='testnet' AND founder_account_id=actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creation_not_found'; END IF;
  PERFORM yawrd.creation_founder(_session);
  IF _expected IS NOT NULL AND c.revision <> _expected THEN RAISE EXCEPTION 'creation_revision_conflict'; END IF;
  RETURN c;
END;
$$;
CREATE FUNCTION yawrd.creation_deployment_read(_session text,_id text)
RETURNS SETOF yawrd.creation_deployments LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
BEGIN
  PERFORM yawrd.creation_read(_session,_id);
  RETURN QUERY SELECT * FROM yawrd.creation_deployments WHERE creation_id=_id;
END;
$$;
CREATE FUNCTION yawrd.creation_deployment_reserve(_session text,_id text,_expected bigint,_identifier text)
RETURNS SETOF yawrd.creation_deployments LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE c yawrd.creation_drafts; d yawrd.creation_deployments;
BEGIN
  IF _expected IS NULL THEN RAISE EXCEPTION 'creation_revision_conflict'; END IF;
  c := yawrd.creation_deployment_lock(_session,_id,_expected);
  SELECT * INTO d FROM yawrd.creation_deployments WHERE creation_id=_id FOR UPDATE;
  IF FOUND THEN RETURN NEXT d; RETURN; END IF;
  -- Empty result means only a persistent identifier collision. A lost response
  -- propagates to the caller; recovery reads this row rather than minting anew.
  INSERT INTO yawrd.creation_deployments(creation_id,dao_identifier,source_revision)
    VALUES (_id,_identifier,c.revision) ON CONFLICT DO NOTHING RETURNING * INTO d;
  IF FOUND THEN RETURN NEXT d; END IF;
END;
$$;
CREATE FUNCTION yawrd.creation_deployment_prepare(_session text,_id text,_creation_revision bigint,_expected bigint,_prepared jsonb,_costs jsonb)
RETURNS SETOF yawrd.creation_deployments LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE c yawrd.creation_drafts; d yawrd.creation_deployments;
BEGIN
  IF _creation_revision IS NULL THEN RAISE EXCEPTION 'creation_revision_conflict'; END IF;
  c := yawrd.creation_deployment_lock(_session,_id,_creation_revision);
  SELECT * INTO d FROM yawrd.creation_deployments WHERE creation_id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deployment_not_found'; END IF;
  PERFORM yawrd.creation_founder(_session);
  IF _expected IS NULL OR d.revision <> _expected THEN RAISE EXCEPTION 'deployment_revision_conflict'; END IF;
  IF d.state NOT IN ('reserved','prepared','failed') THEN RAISE EXCEPTION 'deployment_unresolved'; END IF;
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
CREATE FUNCTION yawrd.creation_deployment_claim(_session text,_id text,_creation_revision bigint,_expected bigint,_height bigint,_consent text)
RETURNS SETOF yawrd.creation_deployments LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE c yawrd.creation_drafts; d yawrd.creation_deployments;
BEGIN
  IF _creation_revision IS NULL THEN RAISE EXCEPTION 'creation_revision_conflict'; END IF;
  c := yawrd.creation_deployment_lock(_session,_id,_creation_revision);
  SELECT * INTO d FROM yawrd.creation_deployments WHERE creation_id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deployment_not_found'; END IF;
  PERFORM yawrd.creation_founder(_session);
  IF _expected IS NULL OR d.revision <> _expected THEN RAISE EXCEPTION 'deployment_revision_conflict'; END IF;
  IF d.state <> 'prepared' THEN RAISE EXCEPTION 'deployment_unresolved'; END IF;
  IF d.prepared_at <= clock_timestamp()-interval '5 minutes' THEN RAISE EXCEPTION 'deployment_review_expired'; END IF;
  IF _height IS NULL OR _height <= 0 OR _consent IS DISTINCT FROM 'creation-deployment-v1' THEN RAISE EXCEPTION 'deployment_consent_required'; END IF;
  IF (d.not_before_height IS NOT NULL AND _height < d.not_before_height)
    OR (d.evidence IS NOT NULL AND _height < (d.evidence->>'finalHeight')::bigint) THEN
    RAISE EXCEPTION 'deployment_head_regressed';
  END IF;
  -- Recheck fields relevant to the frozen public request under the same Creation
  -- lock as P1 saves. Unrelated intake edits need not rewrite the old request.
  IF d.prepared#>>'{input,projectName}' IS DISTINCT FROM c.public_name
    OR d.prepared#>>'{input,projectPurpose}' IS DISTINCT FROM c.public_description
    OR d.prepared#>>'{input,initialStewardAccountIds,0}' IS DISTINCT FROM c.second_steward
    OR c.threshold <> 2 THEN RAISE EXCEPTION 'deployment_request_mismatch'; END IF;
  UPDATE yawrd.creation_deployments SET state='wallet-requested',attempt=attempt+1,claimed_at=clock_timestamp(),
    not_before_height=_height,consent_version=_consent,transaction_hash=NULL WHERE creation_id=_id RETURNING * INTO d;
  RETURN NEXT d;
END;
$$;
CREATE FUNCTION yawrd.creation_deployment_note(_session text,_id text,_expected bigint,_attempt integer,_hash text)
RETURNS SETOF yawrd.creation_deployments LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE d yawrd.creation_deployments;
BEGIN
  PERFORM yawrd.creation_deployment_lock(_session,_id,NULL);
  SELECT * INTO d FROM yawrd.creation_deployments WHERE creation_id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deployment_not_found'; END IF;
  PERFORM yawrd.creation_founder(_session);
  IF _expected IS NULL OR d.revision <> _expected OR _attempt IS NULL OR d.attempt <> _attempt THEN RAISE EXCEPTION 'deployment_revision_conflict'; END IF;
  IF d.state NOT IN ('wallet-requested','unknown') THEN RAISE EXCEPTION 'deployment_unresolved'; END IF;
  -- Untrusted wallet errors/rejections are never permission to unlock or retry.
  IF d.state='unknown' AND (_hash IS NULL OR d.transaction_hash IS NOT DISTINCT FROM _hash) THEN RETURN NEXT d; RETURN; END IF;
  UPDATE yawrd.creation_deployments SET state='unknown',transaction_hash=COALESCE(_hash,transaction_hash)
    WHERE creation_id=_id RETURNING * INTO d;
  RETURN NEXT d;
END;
$$;
CREATE FUNCTION yawrd.creation_deployment_finish(_session text,_id text,_expected bigint,_attempt integer,_state text,_evidence jsonb)
RETURNS SETOF yawrd.creation_deployments LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE d yawrd.creation_deployments;
BEGIN
  PERFORM yawrd.creation_deployment_lock(_session,_id,NULL);
  SELECT * INTO d FROM yawrd.creation_deployments WHERE creation_id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'deployment_not_found'; END IF;
  PERFORM yawrd.creation_founder(_session);
  IF _expected IS NULL OR d.revision <> _expected OR _attempt IS NULL OR d.attempt <> _attempt THEN RAISE EXCEPTION 'deployment_revision_conflict'; END IF;
  IF d.state NOT IN ('wallet-requested','unknown') THEN RAISE EXCEPTION 'deployment_unresolved'; END IF;
  IF _state IS NULL OR _state NOT IN ('failed','deployed-hardening-required') OR NOT COALESCE(
    _evidence->>'transactionHash'=d.transaction_hash
    AND _evidence->>'evidenceDigest' ~ '^[a-f0-9]{64}$'
    AND (_evidence->>'transactionBlockHeight')::bigint > d.not_before_height
    AND (_evidence->>'finalHeight')::bigint >= (_evidence->>'transactionBlockHeight')::bigint,false)
    THEN RAISE EXCEPTION 'deployment_evidence_required'; END IF;
  UPDATE yawrd.creation_deployments SET state=_state,evidence=_evidence,evidence_attempt=attempt,
    verified_transaction_hash=_evidence->>'transactionHash' WHERE creation_id=_id RETURNING * INTO d;
  RETURN NEXT d;
END;
$$;

-- No privileges are granted by this proposal. Exact runtime privileges need
-- separate operator review; the SQL role and functions remain server-only.
REVOKE ALL ON TABLE yawrd.creation_deployments FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_deployment_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_deployment_lock(text,text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_deployment_read(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_deployment_reserve(text,text,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_deployment_prepare(text,text,bigint,bigint,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_deployment_claim(text,text,bigint,bigint,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_deployment_note(text,text,bigint,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_deployment_finish(text,text,bigint,integer,text,jsonb) FROM PUBLIC;
