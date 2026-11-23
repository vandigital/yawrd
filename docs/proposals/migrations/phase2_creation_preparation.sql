-- P3.5A ADDITIVE PROPOSAL ONLY. Never run automatically.
-- Requires installed accepted Creation/deployment/platform-fee functions and
-- yawrd.prevent_mutation(). Separate owner approval is required for installation.
-- Trusted server / SECURITY INVOKER, matching accepted Creation persistence.
DO $$ BEGIN
  IF current_database()<>'neondb' OR current_user='yawrd_07b_runtime' THEN
    RAISE EXCEPTION 'development_installation_target_required';
  END IF;
END $$;

CREATE TABLE yawrd.creation_preparation_versions (
  creation_id text NOT NULL REFERENCES yawrd.creation_platform_fees(creation_id),
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740990),
  parent_revision bigint,
  origin text NOT NULL CHECK (origin IN ('ai-generated','founder-edited')),
  author_account_id text,
  -- Model metadata belongs only to original generated versions, never edits.
  generation jsonb,
  artifact_text text NOT NULL CHECK (octet_length(artifact_text)<=262144),
  artifacts jsonb GENERATED ALWAYS AS (artifact_text::jsonb) STORED,
  content_digest text NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (creation_id,revision),
  FOREIGN KEY (creation_id,parent_revision) REFERENCES yawrd.creation_preparation_versions(creation_id,revision),
  CHECK ((revision=1 AND parent_revision IS NULL) OR (revision>1 AND parent_revision IS NOT NULL AND parent_revision=revision-1)),
  CHECK ((origin='ai-generated' AND generation IS NOT NULL AND jsonb_typeof(generation)='object' AND author_account_id IS NULL)
    OR (origin='founder-edited' AND generation IS NULL AND author_account_id IS NOT NULL AND parent_revision IS NOT NULL)),
  CHECK (COALESCE(jsonb_typeof(artifacts)='object' AND artifacts->>'schemaVersion'='yawrd.creation-preparation.v1',false))
);

CREATE TABLE yawrd.creation_preparation_approvals (
  creation_id text NOT NULL,
  revision bigint NOT NULL,
  content_digest text NOT NULL CHECK (content_digest ~ '^[a-f0-9]{64}$'),
  approved_by text NOT NULL,
  consent_version text NOT NULL CHECK (consent_version='creation-preparation-review-v1'),
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (creation_id,revision),
  FOREIGN KEY (creation_id,revision) REFERENCES yawrd.creation_preparation_versions(creation_id,revision)
);

CREATE FUNCTION yawrd.creation_preparation_access(_session text,_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE d yawrd.creation_deployments; f yawrd.creation_platform_fees; actor text;
BEGIN
  -- Existing lock order and founder-only authorization, including session recheck.
  d:=yawrd.creation_fee_lock(_session,_id,NULL,NULL);
  actor:=yawrd.creation_founder(_session);
  SELECT * INTO f FROM yawrd.creation_platform_fees WHERE creation_id=_id FOR SHARE;
  PERFORM yawrd.creation_founder(_session);
  IF NOT COALESCE(f.state='paid' AND f.founder_account_id=actor AND f.network='testnet'
    AND f.dao_account_id=d.dao_account_id AND f.deployment_transaction=d.transaction_hash
    AND f.deployment_digest=d.evidence->>'evidenceDigest'
    AND f.transaction_hash=f.evidence->>'txHash' AND f.receipt_id IS NOT NULL
    AND f.amount_yocto=500000000000000000000000 AND f.recipient='yawrd.testnet'
    AND f.policy_version='testnet-platform-fee-v1',false) THEN
    RAISE EXCEPTION 'preparation_payment_required';
  END IF;
  RETURN jsonb_build_object('creationId',_id,'founderAccountId',actor,'daoAccountId',f.dao_account_id,
    'deploymentTransaction',f.deployment_transaction,'deploymentDigest',f.deployment_digest,
    'paymentTransaction',f.transaction_hash,'paymentDigest',f.evidence->>'evidenceDigest');
END $$;

CREATE FUNCTION yawrd.creation_preparation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE founder text; v yawrd.creation_preparation_versions;
BEGIN
  SELECT founder_account_id INTO founder FROM yawrd.creation_platform_fees WHERE creation_id=NEW.creation_id AND state='paid';
  IF founder IS NULL THEN RAISE EXCEPTION 'preparation_payment_required'; END IF;
  IF TG_TABLE_NAME='creation_preparation_versions' THEN
    NEW.content_digest:=encode(sha256(convert_to(NEW.artifact_text,'UTF8')),'hex');
    IF NEW.origin='founder-edited' AND NEW.author_account_id IS DISTINCT FROM founder THEN
      RAISE EXCEPTION 'preparation_binding_conflict';
    END IF;
  ELSE
    SELECT * INTO v FROM yawrd.creation_preparation_versions WHERE creation_id=NEW.creation_id AND revision=NEW.revision;
    IF NEW.approved_by IS DISTINCT FROM founder OR NEW.content_digest IS DISTINCT FROM v.content_digest THEN
      RAISE EXCEPTION 'preparation_binding_conflict';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bind_creation_preparation_version BEFORE INSERT ON yawrd.creation_preparation_versions
  FOR EACH ROW EXECUTE FUNCTION yawrd.creation_preparation_guard();
CREATE TRIGGER bind_creation_preparation_approval BEFORE INSERT ON yawrd.creation_preparation_approvals
  FOR EACH ROW EXECUTE FUNCTION yawrd.creation_preparation_guard();
CREATE TRIGGER preserve_creation_preparation_version BEFORE UPDATE OR DELETE ON yawrd.creation_preparation_versions
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();
CREATE TRIGGER preserve_creation_preparation_approval BEFORE UPDATE OR DELETE ON yawrd.creation_preparation_approvals
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();

CREATE FUNCTION yawrd.creation_preparation_read(_session text,_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE binding jsonb; versions jsonb;
BEGIN
  binding:=yawrd.creation_preparation_access(_session,_id);
  -- Root provenance plus the latest twenty versions. Historical rows stay immutable.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('revision',v.revision,'parentRevision',v.parent_revision,
    'digest',v.content_digest,'artifacts',v.artifacts,'origin',v.origin,'generation',v.generation,
    'authorAccountId',v.author_account_id,'createdAt',v.created_at,
    'approval',CASE WHEN a.revision IS NULL THEN NULL ELSE jsonb_build_object('digest',a.content_digest,
      'approvedBy',a.approved_by,'approvedAt',a.approved_at,'consentVersion',a.consent_version) END) ORDER BY v.revision),'[]'::jsonb)
  INTO versions FROM yawrd.creation_preparation_versions v
  LEFT JOIN yawrd.creation_preparation_approvals a USING(creation_id,revision)
  WHERE v.creation_id=_id AND (v.revision=1 OR v.revision IN
    (SELECT revision FROM yawrd.creation_preparation_versions WHERE creation_id=_id ORDER BY revision DESC LIMIT 20));
  PERFORM yawrd.creation_founder(_session);
  RETURN jsonb_build_object('binding',binding,'versions',versions,'generationEnabled',false);
END $$;

CREATE FUNCTION yawrd.creation_preparation_save(_session text,_id text,_expected bigint,_digest text,_text text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE binding jsonb; head yawrd.creation_preparation_versions; parent yawrd.creation_preparation_versions;
BEGIN
  binding:=yawrd.creation_preparation_access(_session,_id);
  SELECT * INTO head FROM yawrd.creation_preparation_versions WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
  IF head.creation_id IS NULL THEN RAISE EXCEPTION 'preparation_version_required'; END IF;
  -- Idempotent recovery of the exact last save after a lost HTTP response.
  SELECT * INTO parent FROM yawrd.creation_preparation_versions WHERE creation_id=_id AND revision=_expected;
  IF head.origin='founder-edited' AND head.parent_revision=_expected AND parent.content_digest=_digest
    AND head.artifact_text=_text THEN RETURN yawrd.creation_preparation_read(_session,_id); END IF;
  IF _expected IS NULL OR _digest IS NULL OR head.revision<>_expected OR head.content_digest<>_digest THEN
    RAISE EXCEPTION 'preparation_revision_conflict';
  END IF;
  IF head.artifact_text=_text THEN RETURN yawrd.creation_preparation_read(_session,_id); END IF;
  INSERT INTO yawrd.creation_preparation_versions(creation_id,revision,parent_revision,origin,author_account_id,artifact_text)
    VALUES (_id,head.revision+1,head.revision,'founder-edited',binding->>'founderAccountId',_text);
  RETURN yawrd.creation_preparation_read(_session,_id);
END $$;

CREATE FUNCTION yawrd.creation_preparation_approve(_session text,_id text,_expected bigint,_digest text,_consent text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE binding jsonb; head yawrd.creation_preparation_versions;
BEGIN
  binding:=yawrd.creation_preparation_access(_session,_id);
  SELECT * INTO head FROM yawrd.creation_preparation_versions WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
  IF head.creation_id IS NULL OR _expected IS NULL OR _digest IS NULL OR head.revision<>_expected OR head.content_digest<>_digest THEN
    RAISE EXCEPTION 'preparation_revision_conflict';
  END IF;
  IF _consent IS DISTINCT FROM 'creation-preparation-review-v1' THEN RAISE EXCEPTION 'preparation_consent_required'; END IF;
  -- Completeness is validated by the trusted server contract before this call.
  INSERT INTO yawrd.creation_preparation_approvals(creation_id,revision,content_digest,approved_by,consent_version)
    VALUES (_id,head.revision,head.content_digest,binding->>'founderAccountId',_consent) ON CONFLICT DO NOTHING;
  RETURN yawrd.creation_preparation_read(_session,_id);
END $$;

REVOKE ALL ON yawrd.creation_preparation_versions,yawrd.creation_preparation_approvals FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_preparation_access(text,text),yawrd.creation_preparation_guard(),
  yawrd.creation_preparation_read(text,text),yawrd.creation_preparation_save(text,text,bigint,text,text),
  yawrd.creation_preparation_approve(text,text,bigint,text,text) FROM PUBLIC;
GRANT SELECT ON yawrd.creation_preparation_versions,yawrd.creation_preparation_approvals TO yawrd_07b_runtime;
GRANT INSERT(creation_id,revision,parent_revision,origin,author_account_id,generation,artifact_text)
  ON yawrd.creation_preparation_versions TO yawrd_07b_runtime;
GRANT INSERT(creation_id,revision,content_digest,approved_by,consent_version)
  ON yawrd.creation_preparation_approvals TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_preparation_access(text,text),yawrd.creation_preparation_read(text,text),
  yawrd.creation_preparation_save(text,text,bigint,text,text),yawrd.creation_preparation_approve(text,text,bigint,text,text)
  TO yawrd_07b_runtime;
-- No UPDATE/DELETE/TRUNCATE, supplied timestamps, publication, funding, migration
-- runner integration, provider function, generation allowance or P3.4 changes.
-- Direct runtime SQL remains a trusted-server security gate, not wallet RLS.
