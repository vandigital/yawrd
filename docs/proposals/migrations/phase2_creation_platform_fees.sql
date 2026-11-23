-- P3.4 PROPOSAL ONLY. Not discovered by the migration runner. DO NOT EXECUTE
-- without separate Development installation approval. Run schema + grants in
-- one operator-controlled transaction. No existing rows/tables are modified.
-- SECURITY INVOKER, trusted server verifier inputs, as in accepted P1/P3.2.
DO $$ BEGIN
  IF current_database()<>'neondb' OR current_user='yawrd_07b_runtime' THEN
    RAISE EXCEPTION 'development_installation_target_required';
  END IF;
END $$;

CREATE TABLE yawrd.creation_platform_fees (
  creation_id text PRIMARY KEY REFERENCES yawrd.creation_deployments(creation_id),
  network text NOT NULL DEFAULT 'testnet' CHECK (network='testnet'),
  founder_account_id text NOT NULL CHECK (founder_account_id<>'yawrd.testnet'),
  dao_account_id text NOT NULL UNIQUE,
  deployment_transaction text NOT NULL UNIQUE CHECK (deployment_transaction ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  deployment_digest text NOT NULL CHECK (deployment_digest ~ '^[a-f0-9]{64}$'),
  deployment_final_height bigint NOT NULL CHECK (deployment_final_height>0),
  recipient text NOT NULL DEFAULT 'yawrd.testnet' CHECK (recipient='yawrd.testnet'),
  amount_yocto numeric(39,0) NOT NULL DEFAULT 500000000000000000000000 CHECK (amount_yocto=500000000000000000000000),
  policy_version text NOT NULL DEFAULT 'testnet-platform-fee-v1' CHECK (policy_version='testnet-platform-fee-v1'),
  request jsonb NOT NULL CHECK (jsonb_typeof(request)='object'),
  security_review jsonb NOT NULL CHECK (jsonb_typeof(security_review)='object'),
  not_before_height bigint NOT NULL CHECK (not_before_height>=deployment_final_height),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740990),
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','wallet-requested','unknown','paid')),
  attempt smallint NOT NULL DEFAULT 0 CHECK (attempt IN (0,1)),
  claimed_at timestamptz,
  claim_height bigint CHECK (claim_height>=not_before_height),
  claim_review jsonb,
  consent_version text CHECK (consent_version='creation-platform-fee-v1'),
  transaction_hash text CHECK (transaction_hash ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  -- Candidate hashes are untrusted: only verified evidence reserves a hash
  -- globally, so another founder cannot squat on someone else's public hash.
  verified_transaction_hash text GENERATED ALWAYS AS (CASE WHEN state='paid' THEN transaction_hash END) STORED UNIQUE,
  evidence jsonb CHECK (jsonb_typeof(evidence)='object'),
  receipt_id text GENERATED ALWAYS AS (evidence->>'receiptId') STORED UNIQUE,
  generation_budget integer NOT NULL DEFAULT 0 CHECK (generation_budget=0),
  consumption_enabled boolean NOT NULL DEFAULT false CHECK (consumption_enabled=false),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state='prepared' AND attempt=0 AND claimed_at IS NULL AND claim_height IS NULL AND claim_review IS NULL AND consent_version IS NULL AND transaction_hash IS NULL)
    OR (state<>'prepared' AND attempt=1 AND claimed_at IS NOT NULL AND claim_height IS NOT NULL AND claim_review IS NOT NULL AND consent_version IS NOT NULL)),
  CHECK ((state='paid' AND transaction_hash IS NOT NULL AND evidence IS NOT NULL
      AND COALESCE(evidence->>'txHash'=transaction_hash AND evidence->>'receiptId' ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
        AND evidence->>'evidenceDigest' ~ '^[a-f0-9]{64}$' AND (evidence->>'blockHeight')::bigint>claim_height,false))
    OR (state<>'paid' AND evidence IS NULL))
);

CREATE FUNCTION yawrd.creation_fee_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
BEGIN
  IF NEW.request IS DISTINCT FROM jsonb_build_object('network','testnet','signerId',NEW.founder_account_id,
    'receiverId','yawrd.testnet','actions',jsonb_build_array(jsonb_build_object('type','Transfer','params',
      jsonb_build_object('deposit','500000000000000000000000')))) THEN RAISE EXCEPTION 'fee_request_mismatch'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'prepared' OR NEW.attempt<>0 THEN RAISE EXCEPTION 'fee_transition_conflict'; END IF;
    NEW.revision:=1;
  ELSE
    IF ROW(NEW.creation_id,NEW.network,NEW.founder_account_id,NEW.dao_account_id,NEW.deployment_transaction,NEW.deployment_digest,
        NEW.deployment_final_height,NEW.recipient,NEW.amount_yocto,NEW.policy_version,NEW.request,NEW.security_review,NEW.not_before_height,NEW.created_at)
      IS DISTINCT FROM ROW(OLD.creation_id,OLD.network,OLD.founder_account_id,OLD.dao_account_id,OLD.deployment_transaction,OLD.deployment_digest,
        OLD.deployment_final_height,OLD.recipient,OLD.amount_yocto,OLD.policy_version,OLD.request,OLD.security_review,OLD.not_before_height,OLD.created_at)
      OR (OLD.attempt=1 AND ROW(NEW.claimed_at,NEW.claim_height,NEW.claim_review,NEW.consent_version)
        IS DISTINCT FROM ROW(OLD.claimed_at,OLD.claim_height,OLD.claim_review,OLD.consent_version))
      OR (OLD.transaction_hash IS NOT NULL AND NEW.transaction_hash IS DISTINCT FROM OLD.transaction_hash)
      THEN RAISE EXCEPTION 'fee_identity_frozen'; END IF;
    IF NOT ((OLD.state='prepared' AND NEW.state='wallet-requested')
      OR (OLD.state IN ('wallet-requested','unknown') AND NEW.state IN ('unknown','paid')))
      OR NEW.attempt<>OLD.attempt+((OLD.state='prepared' AND NEW.state='wallet-requested')::integer)
      THEN RAISE EXCEPTION 'fee_transition_conflict'; END IF;
    NEW.revision:=OLD.revision+1;
  END IF;
  NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER guard_creation_fee BEFORE INSERT OR UPDATE ON yawrd.creation_platform_fees
  FOR EACH ROW EXECUTE FUNCTION yawrd.creation_fee_guard();
CREATE TRIGGER preserve_creation_fee BEFORE DELETE ON yawrd.creation_platform_fees
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();

-- Reuse session -> Creation -> deployment -> fee lock order. No UPDATE of
-- accepted Creation/deployment rows occurs. NULL revisions are for recovery.
CREATE FUNCTION yawrd.creation_fee_lock(_session text,_id text,_creation_revision bigint,_deployment_revision bigint)
RETURNS yawrd.creation_deployments LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE c yawrd.creation_drafts; d yawrd.creation_deployments;
BEGIN
  c:=yawrd.creation_deployment_lock(_session,_id,_creation_revision);
  SELECT * INTO d FROM yawrd.creation_deployments WHERE creation_id=_id FOR SHARE;
  PERFORM yawrd.creation_founder(_session);
  IF d.creation_id IS NULL OR NOT COALESCE(d.network='testnet' AND d.state='deployed-hardening-required'
    AND d.evidence_attempt=d.attempt AND d.transaction_hash=d.verified_transaction_hash
    AND d.evidence->>'transactionHash'=d.transaction_hash
    AND d.prepared#>>'{input,creatorAccountId}'=c.founder_account_id
    AND d.prepared#>>'{plan,daoAccountId}'=d.dao_account_id,false)
    THEN RAISE EXCEPTION 'creation_deployment_unverified'; END IF;
  IF _deployment_revision IS NOT NULL AND d.revision<>_deployment_revision THEN RAISE EXCEPTION 'deployment_revision_conflict'; END IF;
  RETURN d;
END $$;

-- Trusted server snapshot from the accepted finalized security reader, not
-- browser JSON. Database validation supplements, never replaces, chain proof.
CREATE FUNCTION yawrd.creation_fee_review(_d yawrd.creation_deployments,_review jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
BEGIN
  IF NOT COALESCE(_review->>'verified'='true' AND _review->>'autoUpdate'='false'
    AND _review->>'proposalStatus'='Approved' AND (_review->>'proposalId')::bigint>=0
    AND _review->>'blockHash' ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    AND (_review->>'blockHeight')::bigint>=(_d.evidence->>'finalHeight')::bigint
    AND (_review->>'checkedAt')::timestamptz>clock_timestamp()-interval '120 seconds'
    AND (_review->>'checkedAt')::timestamptz<=clock_timestamp()+interval '5 seconds'
    AND _review->'votes'=jsonb_build_object(_d.prepared#>>'{input,creatorAccountId}','Approve',
      _d.prepared#>>'{input,initialStewardAccountIds,0}','Approve'),false)
    THEN RAISE EXCEPTION 'fee_security_required'; END IF;
END $$;

CREATE FUNCTION yawrd.creation_fee_read(_session text,_id text)
RETURNS SETOF yawrd.creation_platform_fees LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
BEGIN
  PERFORM yawrd.creation_fee_lock(_session,_id,NULL,NULL);
  RETURN QUERY SELECT * FROM yawrd.creation_platform_fees WHERE creation_id=_id;
END $$;

CREATE FUNCTION yawrd.creation_fee_open(_session text,_id text,_creation_revision bigint,_deployment_revision bigint,_review jsonb)
RETURNS SETOF yawrd.creation_platform_fees LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE d yawrd.creation_deployments; f yawrd.creation_platform_fees; actor text;
BEGIN
  IF _creation_revision IS NULL OR _deployment_revision IS NULL THEN RAISE EXCEPTION 'creation_revision_conflict'; END IF;
  d:=yawrd.creation_fee_lock(_session,_id,_creation_revision,_deployment_revision);
  actor:=yawrd.creation_founder(_session);
  SELECT * INTO f FROM yawrd.creation_platform_fees WHERE creation_id=_id FOR UPDATE;
  IF FOUND THEN RETURN NEXT f; RETURN; END IF;
  PERFORM yawrd.creation_fee_review(d,_review);
  INSERT INTO yawrd.creation_platform_fees(creation_id,founder_account_id,dao_account_id,deployment_transaction,
      deployment_digest,deployment_final_height,request,security_review,not_before_height)
    VALUES (_id,actor,d.dao_account_id,d.transaction_hash,d.evidence->>'evidenceDigest',(d.evidence->>'finalHeight')::bigint,
      jsonb_build_object('network','testnet','signerId',actor,'receiverId','yawrd.testnet',
        'actions',jsonb_build_array(jsonb_build_object('type','Transfer','params',jsonb_build_object('deposit','500000000000000000000000')))),
      _review,(_review->>'blockHeight')::bigint) RETURNING * INTO f;
  RETURN NEXT f;
END $$;

CREATE FUNCTION yawrd.creation_fee_claim(_session text,_id text,_creation_revision bigint,_deployment_revision bigint,_expected bigint,_review jsonb,_consent text)
RETURNS SETOF yawrd.creation_platform_fees LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE d yawrd.creation_deployments; f yawrd.creation_platform_fees;
BEGIN
  IF _creation_revision IS NULL OR _deployment_revision IS NULL THEN RAISE EXCEPTION 'creation_revision_conflict'; END IF;
  d:=yawrd.creation_fee_lock(_session,_id,_creation_revision,_deployment_revision);
  SELECT * INTO f FROM yawrd.creation_platform_fees WHERE creation_id=_id FOR UPDATE;
  PERFORM yawrd.creation_founder(_session);
  IF f.creation_id IS NULL THEN RAISE EXCEPTION 'fee_not_found'; END IF;
  IF _expected IS NULL OR f.revision<>_expected THEN RAISE EXCEPTION 'fee_revision_conflict'; END IF;
  IF f.state<>'prepared' OR f.attempt<>0 THEN RAISE EXCEPTION 'fee_unresolved'; END IF;
  IF _consent IS DISTINCT FROM 'creation-platform-fee-v1' THEN RAISE EXCEPTION 'fee_consent_required'; END IF;
  PERFORM yawrd.creation_fee_review(d,_review);
  UPDATE yawrd.creation_platform_fees SET state='wallet-requested',attempt=1,claimed_at=clock_timestamp(),
    claim_height=(_review->>'blockHeight')::bigint,claim_review=_review,consent_version=_consent
    WHERE creation_id=_id RETURNING * INTO f;
  RETURN NEXT f;
END $$;

CREATE FUNCTION yawrd.creation_fee_note(_session text,_id text,_expected bigint,_hash text)
RETURNS SETOF yawrd.creation_platform_fees LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE f yawrd.creation_platform_fees;
BEGIN
  PERFORM yawrd.creation_fee_lock(_session,_id,NULL,NULL);
  SELECT * INTO f FROM yawrd.creation_platform_fees WHERE creation_id=_id FOR UPDATE;
  PERFORM yawrd.creation_founder(_session);
  IF f.creation_id IS NULL THEN RAISE EXCEPTION 'fee_not_found'; END IF;
  IF _expected IS NULL OR f.revision<>_expected THEN RAISE EXCEPTION 'fee_revision_conflict'; END IF;
  IF f.state NOT IN ('wallet-requested','unknown') THEN RAISE EXCEPTION 'fee_unresolved'; END IF;
  IF _hash IS NOT NULL AND _hash !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN RAISE EXCEPTION 'invalid_transaction_hash'; END IF;
  IF f.transaction_hash IS NOT NULL AND _hash IS NOT NULL AND f.transaction_hash<>_hash THEN RAISE EXCEPTION 'fee_identity_frozen'; END IF;
  IF f.state='unknown' AND (_hash IS NULL OR f.transaction_hash=_hash) THEN RETURN NEXT f; RETURN; END IF;
  UPDATE yawrd.creation_platform_fees SET state='unknown',transaction_hash=COALESCE(f.transaction_hash,_hash)
    WHERE creation_id=_id RETURNING * INTO f;
  RETURN NEXT f;
END $$;

CREATE FUNCTION yawrd.creation_fee_complete(_session text,_id text,_expected bigint,_evidence jsonb)
RETURNS SETOF yawrd.creation_platform_fees LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE f yawrd.creation_platform_fees;
BEGIN
  PERFORM yawrd.creation_fee_lock(_session,_id,NULL,NULL);
  SELECT * INTO f FROM yawrd.creation_platform_fees WHERE creation_id=_id FOR UPDATE;
  PERFORM yawrd.creation_founder(_session);
  IF f.creation_id IS NULL THEN RAISE EXCEPTION 'fee_not_found'; END IF;
  -- Idempotent lost-response recovery, no UPDATE and no new payment authority.
  IF f.state='paid' AND f.evidence=_evidence THEN RETURN NEXT f; RETURN; END IF;
  IF _expected IS NULL OR f.revision<>_expected THEN RAISE EXCEPTION 'fee_revision_conflict'; END IF;
  IF f.state NOT IN ('wallet-requested','unknown') THEN RAISE EXCEPTION 'fee_unresolved'; END IF;
  IF NOT COALESCE(_evidence->>'txHash'=f.transaction_hash
    AND _evidence->>'receiptId' ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    AND _evidence->>'evidenceDigest' ~ '^[a-f0-9]{64}$'
    AND (_evidence->>'blockHeight')::bigint>f.claim_height,false) THEN RAISE EXCEPTION 'fee_evidence_required'; END IF;
  UPDATE yawrd.creation_platform_fees SET state='paid',evidence=_evidence WHERE creation_id=_id RETURNING * INTO f;
  RETURN NEXT f;
END $$;

REVOKE ALL ON TABLE yawrd.creation_platform_fees FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_fee_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_fee_lock(text,text,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_fee_review(yawrd.creation_deployments,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_fee_read(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_fee_open(text,text,bigint,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_fee_claim(text,text,bigint,bigint,bigint,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_fee_note(text,text,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_fee_complete(text,text,bigint,jsonb) FROM PUBLIC;
