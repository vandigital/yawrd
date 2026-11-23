-- P3.5B ADDITIVE DEVELOPMENT PROPOSAL ONLY. DO NOT EXECUTE AUTOMATICALLY.
-- Install after the unchanged P3.5A proposal, in one owner-controlled transaction.
DO $$ BEGIN
  IF current_database()<>'neondb' OR current_user='yawrd_07b_runtime' THEN
    RAISE EXCEPTION 'development_installation_target_required';
  END IF;
END $$;
CREATE TABLE yawrd.creation_preparation_attempts (
  creation_id text PRIMARY KEY REFERENCES yawrd.creation_platform_fees(creation_id),
  id uuid NOT NULL UNIQUE,
  source_creation_revision bigint NOT NULL CHECK(source_creation_revision BETWEEN 1 AND 9007199254740990),
  source_text text NOT NULL CHECK(octet_length(source_text)<=24000),
  source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
  request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  model text NOT NULL CHECK(model IN ('Qwen/Qwen3.8-27B','openai/gpt-6.1-sol')),
  prompt_version text NOT NULL CHECK(prompt_version='creation-source-aware-v1'),
  consent_version text NOT NULL CHECK(consent_version IN ('creation-ai-preparation-v1','creation-partner-preparation-v1')),
  allowance smallint NOT NULL DEFAULT 1 CHECK(allowance=1),
  output_token_limit integer NOT NULL DEFAULT 8000 CHECK(output_token_limit=8000),
  provider_timeout_ms integer NOT NULL DEFAULT 180000 CHECK(provider_timeout_ms=180000),
  state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','waiting','checking','saved','failed','unknown')),
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '210 seconds'),
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
  CHECK((model='Qwen/Qwen3.8-27B' AND consent_version='creation-ai-preparation-v1')
    OR (model='openai/gpt-6.1-sol' AND consent_version='creation-partner-preparation-v1'))
);

CREATE FUNCTION yawrd.creation_preparation_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'reserved' OR NEW.dispatched_at IS NOT NULL OR NEW.response_at IS NOT NULL
      OR NEW.finished_at IS NOT NULL OR NEW.result_revision IS NOT NULL OR NEW.usage IS NOT NULL OR NEW.error_code IS NOT NULL THEN
      RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
    NEW.source_digest:=encode(sha256(convert_to(NEW.source_text,'UTF8')),'hex');
  ELSE
    IF ROW(NEW.creation_id,NEW.id,NEW.source_creation_revision,NEW.source_text,NEW.source_digest,NEW.request_digest,
      NEW.model,NEW.prompt_version,NEW.consent_version,NEW.allowance,NEW.output_token_limit,NEW.provider_timeout_ms,NEW.reserved_at,NEW.deadline_at)
      IS DISTINCT FROM ROW(OLD.creation_id,OLD.id,OLD.source_creation_revision,OLD.source_text,OLD.source_digest,OLD.request_digest,
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
CREATE TRIGGER guard_creation_preparation_attempt BEFORE INSERT OR UPDATE ON yawrd.creation_preparation_attempts
  FOR EACH ROW EXECUTE FUNCTION yawrd.creation_preparation_attempt_guard();
CREATE TRIGGER preserve_creation_preparation_attempt BEFORE DELETE ON yawrd.creation_preparation_attempts
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();

CREATE FUNCTION yawrd.creation_preparation_attempt_read(_session text,_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE a yawrd.creation_preparation_attempts;
BEGIN
  PERFORM yawrd.creation_preparation_access(_session,_id);
  SELECT * INTO a FROM yawrd.creation_preparation_attempts WHERE creation_id=_id;
  PERFORM yawrd.creation_founder(_session);
  IF a.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',a.id,'state',a.state,'model',a.model,'sourceDigest',a.source_digest,
    'reservedAt',a.reserved_at,'dispatchedAt',a.dispatched_at,'responseAt',a.response_at,'finishedAt',a.finished_at,
    'deadlineAt',a.deadline_at,'resultRevision',a.result_revision,'errorCode',a.error_code,'usage',a.usage);
END $$;

CREATE FUNCTION yawrd.creation_preparation_reserve(_session text,_id text,_attempt uuid,_revision bigint,_source text,
  _model text,_prompt text,_consent text,_request_digest text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE c yawrd.creation_drafts; binding jsonb;
BEGIN
  binding:=yawrd.creation_preparation_access(_session,_id);
  -- All preparation mutations serialize on the existing Creation lock.
  IF EXISTS(SELECT 1 FROM yawrd.creation_preparation_attempts WHERE creation_id=_id) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM yawrd.creation_preparation_versions WHERE creation_id=_id) THEN RAISE EXCEPTION 'generation_allowance_used'; END IF;
  SELECT * INTO c FROM yawrd.creation_read(_session,_id);
  IF _revision IS NULL OR c.revision<>_revision OR NOT COALESCE((_source::jsonb#>>'{provenance,creationRevision}')::bigint=_revision
    AND _source::jsonb#>>'{provenance,creationId}'=_id,false) THEN RAISE EXCEPTION 'generation_source_changed'; END IF;
  IF NOT COALESCE((_model='Qwen/Qwen3.8-27B' AND _consent='creation-ai-preparation-v1')
    OR (_model='openai/gpt-6.1-sol' AND _consent='creation-partner-preparation-v1'
      AND _id='yawrd-uorgr4yy5sxu' AND binding->>'founderAccountId'='yawrd1.testnet'
      AND binding->>'daoAccountId'='xfheozm6d1tb.factory.yawrd.testnet'),false) THEN
    RAISE EXCEPTION 'generation_consent_required'; END IF;
  INSERT INTO yawrd.creation_preparation_attempts(creation_id,id,source_creation_revision,source_text,request_digest,model,prompt_version,consent_version)
    VALUES(_id,_attempt,_revision,_source,_request_digest,_model,_prompt,_consent);
  RETURN true;
END $$;

CREATE FUNCTION yawrd.creation_preparation_stage(_session text,_id text,_attempt uuid,_state text,_usage jsonb,_error text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE a yawrd.creation_preparation_attempts;
BEGIN
  PERFORM yawrd.creation_preparation_access(_session,_id);
  SELECT * INTO a FROM yawrd.creation_preparation_attempts WHERE creation_id=_id FOR UPDATE;
  IF a.id IS NULL OR a.id<>_attempt THEN RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
  IF a.state IN ('saved','failed','unknown') THEN RETURN; END IF;
  IF _state NOT IN ('waiting','checking','failed','unknown') THEN RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
  IF a.state=_state THEN RETURN; END IF;
  UPDATE yawrd.creation_preparation_attempts SET state=_state,usage=COALESCE(_usage,usage),error_code=_error WHERE creation_id=_id;
END $$;

CREATE FUNCTION yawrd.creation_preparation_complete(_session text,_id text,_attempt uuid,_text text,_usage jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE a yawrd.creation_preparation_attempts; digest text;
BEGIN
  PERFORM yawrd.creation_preparation_access(_session,_id);
  SELECT * INTO a FROM yawrd.creation_preparation_attempts WHERE creation_id=_id FOR UPDATE;
  IF a.id IS NULL OR a.id<>_attempt THEN RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
  digest:=encode(sha256(convert_to(_text,'UTF8')),'hex');
  IF a.state='saved' THEN
    IF EXISTS(SELECT 1 FROM yawrd.creation_preparation_versions WHERE creation_id=_id AND revision=a.result_revision AND content_digest=digest) THEN RETURN; END IF;
    RAISE EXCEPTION 'generation_attempt_conflict';
  END IF;
  IF a.state NOT IN ('checking','unknown') OR EXISTS(SELECT 1 FROM yawrd.creation_preparation_versions WHERE creation_id=_id)
    OR NOT COALESCE(_usage->>'requestedModel'=a.model AND _usage->>'finishReason'='stop'
      AND (_usage#>>'{tokens,input}')::integer BETWEEN 0 AND 24000
      AND (_usage#>>'{tokens,output}')::integer BETWEEN 0 AND 8000
      AND ((_usage->>'returnedModel'=a.model) OR (a.model='openai/gpt-6.1-sol' AND _usage->>'returnedModel'='gpt-6.1-sol'))
      AND _usage->>'responseId' ~ '^[A-Za-z0-9/._:-]{1,160}$',false) THEN RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
  -- Only trusted server code reaches this after strict output/completeness validation.
  INSERT INTO yawrd.creation_preparation_versions(creation_id,revision,parent_revision,origin,author_account_id,generation,artifact_text)
    VALUES(_id,1,NULL,'ai-generated',NULL,jsonb_build_object('provider','near-ai-cloud','model',_usage->>'returnedModel',
      'promptVersion',a.prompt_version,'responseId',_usage->>'responseId','sourceDigest',a.source_digest,'attemptId',a.id,'usage',_usage),_text);
  UPDATE yawrd.creation_preparation_attempts SET state='saved',usage=_usage,result_revision=1,error_code=NULL WHERE creation_id=_id;
END $$;

REVOKE ALL ON yawrd.creation_preparation_attempts FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_preparation_attempt_guard(),yawrd.creation_preparation_attempt_read(text,text),
  yawrd.creation_preparation_reserve(text,text,uuid,bigint,text,text,text,text,text),
  yawrd.creation_preparation_stage(text,text,uuid,text,jsonb,text),yawrd.creation_preparation_complete(text,text,uuid,text,jsonb) FROM PUBLIC;
GRANT SELECT ON yawrd.creation_preparation_attempts TO yawrd_07b_runtime;
GRANT INSERT(creation_id,id,source_creation_revision,source_text,request_digest,model,prompt_version,consent_version)
  ON yawrd.creation_preparation_attempts TO yawrd_07b_runtime;
GRANT UPDATE(state,usage,error_code,result_revision) ON yawrd.creation_preparation_attempts TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_preparation_attempt_read(text,text),
  yawrd.creation_preparation_reserve(text,text,uuid,bigint,text,text,text,text,text),
  yawrd.creation_preparation_stage(text,text,uuid,text,jsonb,text),yawrd.creation_preparation_complete(text,text,uuid,text,jsonb)
  TO yawrd_07b_runtime;
-- No reset/delete, automatic allowance renewal, P3.4 row update or provider call.
-- One row per Creation means one reserved request, including unknown outcomes.
-- Runtime role remains trusted-server-only, not a per-wallet SQL authorization role.
