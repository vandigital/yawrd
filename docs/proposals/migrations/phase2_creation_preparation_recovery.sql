-- P3.5R ADDITIVE DEVELOPMENT PROPOSAL ONLY. Never execute automatically.
-- Install once AFTER the three accepted P3.5 proposals, with separate founder
-- authorization, in one owner-controlled Development transaction. No backfill.
DO $$ BEGIN
  IF current_database()<>'neondb' OR current_user='yawrd_07b_runtime' THEN
    RAISE EXCEPTION 'development_installation_target_required'; END IF;
  IF to_regprocedure('yawrd.creation_intake_preparation_guard()') IS NULL THEN
    RAISE EXCEPTION 'preparation_installation_required'; END IF;
END $$;
CREATE TABLE yawrd.creation_preparation_recoveries (
  creation_id text PRIMARY KEY REFERENCES yawrd.creation_platform_fees(creation_id),
  id uuid NOT NULL UNIQUE,
  parent_attempt_id uuid NOT NULL UNIQUE REFERENCES yawrd.creation_preparation_attempts(id),
  authorized_by text NOT NULL CHECK(authorized_by='yawrd1.testnet'),
  source_creation_revision bigint NOT NULL CHECK(source_creation_revision=7),
  source_text text NOT NULL CHECK(octet_length(source_text)<=24000),
  source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
  request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  model text NOT NULL CHECK(model='openai/gpt-6.1-sol'),
  prompt_version text NOT NULL CHECK(prompt_version='creation-source-aware-recovery-v1'),
  consent_version text NOT NULL CHECK(consent_version='creation-partner-recovery-v1'),
  allowance smallint NOT NULL DEFAULT 1 CHECK(allowance=1),
  output_token_limit integer NOT NULL DEFAULT 16000 CHECK(output_token_limit=16000),
  provider_timeout_ms integer NOT NULL DEFAULT 420000 CHECK(provider_timeout_ms=420000),
  state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','waiting','checking','saved','failed','unknown')),
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '450 seconds'),
  dispatched_at timestamptz,response_at timestamptz,finished_at timestamptz,
  result_revision bigint,
  usage jsonb CHECK(usage IS NULL OR (jsonb_typeof(usage)='object' AND octet_length(usage::text)<=8192)),
  error_code text CHECK(error_code IS NULL OR error_code IN ('generation_output_invalid','generation_output_incomplete',
    'provider_access_unavailable','provider_billing_or_limit','provider_deadline_exceeded','provider_transport_failed',
    'provider_response_incomplete','provider_unavailable_no_retry','generation_completion_unknown')),
  FOREIGN KEY(creation_id,result_revision) REFERENCES yawrd.creation_preparation_versions(creation_id,revision),
  CHECK((state='saved' AND result_revision IS NOT NULL AND finished_at IS NOT NULL AND usage IS NOT NULL AND error_code IS NULL)
    OR (state<>'saved' AND result_revision IS NULL)),
  CHECK(state NOT IN ('failed','unknown') OR (finished_at IS NOT NULL AND error_code IS NOT NULL)),
  CHECK(state NOT IN ('waiting','checking','saved') OR dispatched_at IS NOT NULL),
  CHECK(state NOT IN ('checking','saved') OR response_at IS NOT NULL),
  CHECK(creation_id='yawrd-uorgr4yy5sxu')
);

CREATE FUNCTION yawrd.creation_preparation_recovery_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM yawrd.creation_preparation_attempts o WHERE o.id=NEW.parent_attempt_id AND o.creation_id=NEW.creation_id
      AND o.state='failed' AND o.error_code='generation_output_incomplete' AND o.model='openai/gpt-6.1-sol'
      AND o.source_creation_revision=7 AND o.source_text=NEW.source_text
      AND o.usage->>'protocol'='responses' AND o.usage->>'requestedModel'='openai/gpt-6.1-sol'
      AND o.usage->>'returnedModel' IN ('openai/gpt-6.1-sol','gpt-6.1-sol') AND o.usage->>'finishReason'='length' AND o.usage#>>'{tokens,output}'='8000') THEN RAISE EXCEPTION 'recovery_not_eligible'; END IF;
    IF NEW.state<>'reserved' OR NEW.dispatched_at IS NOT NULL OR NEW.response_at IS NOT NULL
      OR NEW.finished_at IS NOT NULL OR NEW.result_revision IS NOT NULL OR NEW.usage IS NOT NULL OR NEW.error_code IS NOT NULL THEN
      RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
    NEW.source_digest:=encode(sha256(convert_to(NEW.source_text,'UTF8')),'hex');
  ELSE
    IF ROW(NEW.creation_id,NEW.id,NEW.parent_attempt_id,NEW.authorized_by,NEW.source_creation_revision,NEW.source_text,NEW.source_digest,NEW.request_digest,
      NEW.model,NEW.prompt_version,NEW.consent_version,NEW.allowance,NEW.output_token_limit,NEW.provider_timeout_ms,NEW.reserved_at,NEW.deadline_at)
      IS DISTINCT FROM ROW(OLD.creation_id,OLD.id,OLD.parent_attempt_id,OLD.authorized_by,OLD.source_creation_revision,OLD.source_text,OLD.source_digest,OLD.request_digest,
      OLD.model,OLD.prompt_version,OLD.consent_version,OLD.allowance,OLD.output_token_limit,OLD.provider_timeout_ms,OLD.reserved_at,OLD.deadline_at)
      OR NOT ((OLD.state='reserved' AND NEW.state IN ('waiting','unknown'))
        OR (OLD.state='waiting' AND NEW.state IN ('checking','failed','unknown'))
        OR (OLD.state='checking' AND NEW.state IN ('saved','failed','unknown'))
        OR (OLD.state='unknown' AND NEW.state='saved')) THEN RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
    -- Observation timestamps are supplied only by this guard.
    NEW.dispatched_at:=CASE WHEN OLD.state='reserved' AND NEW.state='waiting' THEN clock_timestamp() ELSE OLD.dispatched_at END;
    NEW.response_at:=CASE WHEN NEW.state='checking' THEN clock_timestamp() ELSE OLD.response_at END;
    NEW.finished_at:=CASE WHEN NEW.state IN ('saved','failed','unknown') THEN clock_timestamp() ELSE OLD.finished_at END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_creation_preparation_recovery BEFORE INSERT OR UPDATE ON yawrd.creation_preparation_recoveries
  FOR EACH ROW EXECUTE FUNCTION yawrd.creation_preparation_recovery_guard();
CREATE TRIGGER preserve_creation_preparation_recovery BEFORE DELETE ON yawrd.creation_preparation_recoveries
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();


CREATE FUNCTION yawrd.creation_preparation_recovery_read(_session text,_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE original jsonb; r yawrd.creation_preparation_recoveries; eligible boolean;
BEGIN
  PERFORM yawrd.creation_preparation_access(_session,_id);
  original:=yawrd.creation_preparation_attempt_read(_session,_id);
  SELECT * INTO r FROM yawrd.creation_preparation_recoveries WHERE creation_id=_id;
  SELECT EXISTS(SELECT 1 FROM yawrd.creation_preparation_attempts o JOIN yawrd.creation_drafts c ON c.id=o.creation_id
    WHERE o.creation_id=_id AND _id='yawrd-uorgr4yy5sxu' AND c.founder_account_id='yawrd1.testnet'
      AND c.revision=7 AND o.source_creation_revision=7 AND o.state='failed' AND o.error_code='generation_output_incomplete'
      AND o.model='openai/gpt-6.1-sol' AND o.usage->>'protocol'='responses' AND o.usage->>'requestedModel'='openai/gpt-6.1-sol'
      AND o.usage->>'returnedModel' IN ('openai/gpt-6.1-sol','gpt-6.1-sol') AND o.usage->>'finishReason'='length' AND o.usage#>>'{tokens,output}'='8000'
      AND NOT EXISTS(SELECT 1 FROM yawrd.creation_preparation_versions WHERE creation_id=_id)) INTO eligible;
  PERFORM yawrd.creation_founder(_session);
  RETURN jsonb_build_object('eligible',eligible AND r.id IS NULL,'originalAttempt',original,
    'attempt',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('id',r.id,'state',r.state,'model',r.model,'sourceDigest',r.source_digest,
    'reservedAt',r.reserved_at,'dispatchedAt',r.dispatched_at,'responseAt',r.response_at,'finishedAt',r.finished_at,
    'deadlineAt',r.deadline_at,'resultRevision',r.result_revision,'errorCode',r.error_code,'usage',r.usage) END);
END $$;

CREATE FUNCTION yawrd.creation_preparation_recovery_source(_session text,_id text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE info jsonb; source text;
BEGIN
  info:=yawrd.creation_preparation_recovery_read(_session,_id);
  IF NOT COALESCE((info->>'eligible')::boolean,false) THEN RAISE EXCEPTION 'recovery_not_eligible'; END IF;
  SELECT source_text INTO source FROM yawrd.creation_preparation_attempts WHERE creation_id=_id;
  RETURN source;
END $$;

CREATE FUNCTION yawrd.creation_preparation_recovery_reserve(_session text,_id text,_attempt uuid,_parent uuid,_consent text,_request_digest text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE info jsonb; binding jsonb; o yawrd.creation_preparation_attempts;
BEGIN
  binding:=yawrd.creation_preparation_access(_session,_id);
  IF EXISTS(SELECT 1 FROM yawrd.creation_preparation_recoveries WHERE creation_id=_id) THEN RETURN false; END IF;
  info:=yawrd.creation_preparation_recovery_read(_session,_id);
  IF NOT COALESCE((info->>'eligible')::boolean,false) THEN RAISE EXCEPTION 'recovery_not_eligible'; END IF;
  IF _consent IS DISTINCT FROM 'creation-partner-recovery-v1' THEN RAISE EXCEPTION 'generation_consent_required'; END IF;
  IF binding->>'founderAccountId'<>'yawrd1.testnet' OR binding->>'daoAccountId'<>'xfheozm6d1tb.factory.yawrd.testnet' THEN
    RAISE EXCEPTION 'preparation_binding_conflict'; END IF;
  SELECT * INTO o FROM yawrd.creation_preparation_attempts WHERE creation_id=_id;
  IF o.id IS DISTINCT FROM _parent THEN RAISE EXCEPTION 'recovery_not_eligible'; END IF;
  INSERT INTO yawrd.creation_preparation_recoveries(creation_id,id,parent_attempt_id,authorized_by,source_creation_revision,source_text,request_digest,model,prompt_version,consent_version)
    VALUES(_id,_attempt,o.id,binding->>'founderAccountId',7,o.source_text,_request_digest,'openai/gpt-6.1-sol','creation-source-aware-recovery-v1',_consent);
  RETURN true;
END $$;
CREATE FUNCTION yawrd.creation_preparation_recovery_stage(_session text,_id text,_attempt uuid,_state text,_usage jsonb,_error text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE a yawrd.creation_preparation_recoveries;
BEGIN
  PERFORM yawrd.creation_preparation_access(_session,_id);
  SELECT * INTO a FROM yawrd.creation_preparation_recoveries WHERE creation_id=_id FOR UPDATE;
  IF a.id IS NULL OR a.id<>_attempt THEN RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
  IF a.state IN ('saved','failed','unknown') THEN RETURN; END IF;
  IF _state NOT IN ('waiting','checking','failed','unknown') THEN RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
  IF a.state=_state THEN RETURN; END IF;
  UPDATE yawrd.creation_preparation_recoveries SET state=_state,usage=COALESCE(_usage,usage),error_code=_error WHERE creation_id=_id;
END $$;

CREATE FUNCTION yawrd.creation_preparation_recovery_complete(_session text,_id text,_attempt uuid,_text text,_usage jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE a yawrd.creation_preparation_recoveries; digest text;
BEGIN
  PERFORM yawrd.creation_preparation_access(_session,_id);
  SELECT * INTO a FROM yawrd.creation_preparation_recoveries WHERE creation_id=_id FOR UPDATE;
  IF a.id IS NULL OR a.id<>_attempt THEN RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
  digest:=encode(sha256(convert_to(_text,'UTF8')),'hex');
  IF a.state='saved' THEN
    IF EXISTS(SELECT 1 FROM yawrd.creation_preparation_versions WHERE creation_id=_id AND revision=a.result_revision AND content_digest=digest) THEN RETURN; END IF;
    RAISE EXCEPTION 'generation_attempt_conflict';
  END IF;
  IF a.state NOT IN ('checking','unknown') OR EXISTS(SELECT 1 FROM yawrd.creation_preparation_versions WHERE creation_id=_id)
    OR NOT COALESCE(_usage->>'requestedModel'=a.model AND _usage->>'finishReason'='stop'
      AND (_usage#>>'{tokens,input}')::integer BETWEEN 0 AND 24000
      AND (_usage#>>'{tokens,output}')::integer BETWEEN 0 AND 16000
      AND ((_usage->>'returnedModel'=a.model) OR (a.model='openai/gpt-6.1-sol' AND _usage->>'returnedModel'='gpt-6.1-sol'))
      AND _usage->>'responseId' ~ '^[A-Za-z0-9/._:-]{1,160}$',false) THEN RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
  -- Only trusted server code reaches this after strict output/completeness validation.
  INSERT INTO yawrd.creation_preparation_versions(creation_id,revision,parent_revision,origin,author_account_id,generation,artifact_text)
    VALUES(_id,1,NULL,'ai-generated',NULL,jsonb_build_object('provider','near-ai-cloud','model',_usage->>'returnedModel',
      'promptVersion',a.prompt_version,'responseId',_usage->>'responseId','sourceDigest',a.source_digest,'attemptId',a.id,'recoveryOf',a.parent_attempt_id,'usage',_usage),_text);
  UPDATE yawrd.creation_preparation_recoveries SET state='saved',usage=_usage,result_revision=1,error_code=NULL WHERE creation_id=_id;
END $$;

REVOKE ALL ON yawrd.creation_preparation_recoveries FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_preparation_recovery_guard(),yawrd.creation_preparation_recovery_read(text,text),
  yawrd.creation_preparation_recovery_source(text,text),yawrd.creation_preparation_recovery_reserve(text,text,uuid,uuid,text,text),
  yawrd.creation_preparation_recovery_stage(text,text,uuid,text,jsonb,text),yawrd.creation_preparation_recovery_complete(text,text,uuid,text,jsonb) FROM PUBLIC;
GRANT SELECT ON yawrd.creation_preparation_recoveries TO yawrd_07b_runtime;
GRANT INSERT(creation_id,id,parent_attempt_id,authorized_by,source_creation_revision,source_text,request_digest,model,prompt_version,consent_version)
  ON yawrd.creation_preparation_recoveries TO yawrd_07b_runtime;
GRANT UPDATE(state,usage,error_code,result_revision) ON yawrd.creation_preparation_recoveries TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_preparation_recovery_read(text,text),yawrd.creation_preparation_recovery_source(text,text),
  yawrd.creation_preparation_recovery_reserve(text,text,uuid,uuid,text,text),yawrd.creation_preparation_recovery_stage(text,text,uuid,text,jsonb,text),
  yawrd.creation_preparation_recovery_complete(text,text,uuid,text,jsonb) TO yawrd_07b_runtime;
-- Original failed row, paid evidence, deployment and intake guards are unchanged.
-- No DELETE/TRUNCATE/reset grants, automatic retries, or uncertain-outcome recovery.
