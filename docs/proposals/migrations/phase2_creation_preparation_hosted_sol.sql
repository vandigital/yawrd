-- R4.2C REVIEW-ONLY compatibility patch. No installation authorization implied.
-- Apply once, as the existing trusted function owner, after the accepted P3.5B
-- generation/intake-lock definitions. No experimental recovery dependency.
-- The operator independently confirms Preview or Production endpoint before use.
-- Hosted admission, environment pins, action enablement and partner consent remain
-- server enforced. SECURITY INVOKER SQL retains verified session/owner/paid binding;
-- a prompt marker is not an independent Vercel-environment attestation.
-- No rows/defaults/role memberships/ACLs are updated. Original schema files stay pinned.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
LOCK TABLE yawrd.creation_preparation_attempts IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE expected record; actual record;
BEGIN
  IF current_database()<>'neondb' OR current_user IN ('yawrd_07b_runtime','yawrd_publication_writer') THEN
    RAISE EXCEPTION 'hosted_sol_installation_target_required';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='yawrd.creation_preparation_attempts'::regclass
      AND conname='creation_preparation_hosted_sol_budget') THEN
    RAISE EXCEPTION 'hosted_sol_already_installed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='yawrd.creation_drafts'::regclass
      AND tgname='guard_creation_intake_preparation' AND NOT tgisinternal AND tgenabled IN ('O','A')
      AND tgfoid=to_regprocedure('yawrd.creation_intake_preparation_guard()')) THEN
    RAISE EXCEPTION 'accepted_intake_guard_required';
  END IF;
  -- Fail on unknown installed function versions rather than replacing local changes.
  FOR expected IN SELECT * FROM (VALUES
    ('creation_preparation_attempt_guard','491d6d2da92b069d3d56c643e6c6bf0b516b62a2dec03a433eba17136c18913b'),
    ('creation_preparation_attempt_read','9dcc28c5b84bab0d56cb4578c1c2e8a1d20a92b916f1721f1836542202e8fefc'),
    ('creation_preparation_reserve','f21329e25bf0dbae49073b2ca3a1de5ce399f5a31aa31107201b980c33ea227f'),
    ('creation_preparation_complete','c305b81d0c37a9760b9f7920ba0110762deb9c4483530e7427227b1ede0ce4cf')
  ) AS pinned(name,digest) LOOP
    SELECT p.*,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS digest INTO actual
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='yawrd' AND p.proname=expected.name;
    IF NOT FOUND OR actual.prosecdef OR actual.proowner<>current_user::regrole
      OR actual.digest<>expected.digest THEN RAISE EXCEPTION 'accepted_generation_definition_required'; END IF;
  END LOOP;
END $$;

-- Retain original defaults for old callers and every historical row. The insert
-- guard supplies the hosted profile; runtime receives no new column-write grant.
ALTER TABLE yawrd.creation_preparation_attempts
  DROP CONSTRAINT creation_preparation_attempts_prompt_version_check,
  DROP CONSTRAINT creation_preparation_attempts_output_token_limit_check,
  DROP CONSTRAINT creation_preparation_attempts_provider_timeout_ms_check,
  ADD CONSTRAINT creation_preparation_hosted_sol_budget CHECK (
    (prompt_version='creation-source-aware-v1' AND output_token_limit=8000 AND provider_timeout_ms=180000)
    OR (prompt_version='creation-hosted-sol-v1' AND model='openai/gpt-6.1-sol'
      AND consent_version='creation-partner-preparation-v1' AND output_token_limit=16000
      AND provider_timeout_ms=240000 AND deadline_at=reserved_at+interval '270 seconds')
  );

CREATE OR REPLACE FUNCTION yawrd.creation_preparation_attempt_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state<>'reserved' OR NEW.dispatched_at IS NOT NULL OR NEW.response_at IS NOT NULL
      OR NEW.finished_at IS NOT NULL OR NEW.result_revision IS NOT NULL OR NEW.usage IS NOT NULL OR NEW.error_code IS NOT NULL THEN
      RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
    IF NEW.prompt_version='creation-hosted-sol-v1' AND NEW.model='openai/gpt-6.1-sol'
      AND NEW.consent_version='creation-partner-preparation-v1' THEN
      NEW.output_token_limit:=16000; NEW.provider_timeout_ms:=240000;
      NEW.deadline_at:=NEW.reserved_at+interval '270 seconds';
    END IF;
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

CREATE OR REPLACE FUNCTION yawrd.creation_preparation_attempt_read(_session text,_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE a yawrd.creation_preparation_attempts;
BEGIN
  PERFORM yawrd.creation_preparation_access(_session,_id);
  SELECT * INTO a FROM yawrd.creation_preparation_attempts WHERE creation_id=_id;
  PERFORM yawrd.creation_founder(_session);
  IF a.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',a.id,'state',a.state,'model',a.model,'sourceDigest',a.source_digest,
    'reservedAt',a.reserved_at,'dispatchedAt',a.dispatched_at,'responseAt',a.response_at,'finishedAt',a.finished_at,
    'deadlineAt',a.deadline_at,'outputTokensLimit',a.output_token_limit,'providerTimeoutMs',a.provider_timeout_ms,'resultRevision',a.result_revision,'errorCode',a.error_code,'usage',a.usage);
END $$;

CREATE OR REPLACE FUNCTION yawrd.creation_preparation_reserve(_session text,_id text,_attempt uuid,_revision bigint,_source text,
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
  IF NOT COALESCE((_model='Qwen/Qwen3.8-27B' AND _consent='creation-ai-preparation-v1' AND _prompt='creation-source-aware-v1')
    OR (_model='openai/gpt-6.1-sol' AND _consent='creation-partner-preparation-v1'
      AND _prompt='creation-source-aware-v1' AND _id='yawrd-uorgr4yy5sxu' AND binding->>'founderAccountId'='yawrd1.testnet'
      AND binding->>'daoAccountId'='xfheozm6d1tb.factory.yawrd.testnet')
    OR (_model='openai/gpt-6.1-sol' AND _consent='creation-partner-preparation-v1'
      AND _prompt='creation-hosted-sol-v1'),false) THEN
    RAISE EXCEPTION 'generation_consent_required'; END IF;
  INSERT INTO yawrd.creation_preparation_attempts(creation_id,id,source_creation_revision,source_text,request_digest,model,prompt_version,consent_version)
    VALUES(_id,_attempt,_revision,_source,_request_digest,_model,_prompt,_consent);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION yawrd.creation_preparation_complete(_session text,_id text,_attempt uuid,_text text,_usage jsonb) RETURNS void
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
      AND (_usage#>>'{tokens,output}')::integer BETWEEN 0 AND a.output_token_limit
      AND ((_usage->>'returnedModel'=a.model) OR (a.model='openai/gpt-6.1-sol' AND _usage->>'returnedModel'='gpt-6.1-sol'))
      AND _usage->>'responseId' ~ '^[A-Za-z0-9/._:-]{1,160}$',false) THEN RAISE EXCEPTION 'generation_attempt_conflict'; END IF;
  -- Only trusted server code reaches this after strict output/completeness validation.
  INSERT INTO yawrd.creation_preparation_versions(creation_id,revision,parent_revision,origin,author_account_id,generation,artifact_text)
    VALUES(_id,1,NULL,'ai-generated',NULL,jsonb_build_object('provider','near-ai-cloud','model',_usage->>'returnedModel',
      'promptVersion',a.prompt_version,'responseId',_usage->>'responseId','sourceDigest',a.source_digest,'attemptId',a.id,'usage',_usage),_text);
  UPDATE yawrd.creation_preparation_attempts SET state='saved',usage=_usage,result_revision=1,error_code=NULL WHERE creation_id=_id;
END $$;

-- CREATE OR REPLACE retains each function's owner/ACL. No GRANT or role changes.
COMMIT;
