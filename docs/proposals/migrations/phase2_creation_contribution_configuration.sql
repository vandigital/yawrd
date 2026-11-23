-- UNAPPLIED P3.6 Development proposal. Install only with separate authorization.
-- Requires accepted P3.5 preparation tables/functions and existing runtime role.
-- No public projects, tasks, rewards, payment or preparation rows are modified.
CREATE TABLE yawrd.creation_contribution_configurations (
  creation_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0 AND revision < 9007199254740991),
  preparation_revision bigint NOT NULL,
  preparation_digest text NOT NULL CHECK (preparation_digest ~ '^[a-f0-9]{64}$'),
  configuration_text text NOT NULL CHECK (octet_length(configuration_text) <= 131072),
  configuration jsonb GENERATED ALWAYS AS (configuration_text::jsonb) STORED,
  configuration_digest text NOT NULL CHECK (configuration_digest ~ '^[a-f0-9]{64}$'),
  saved_by text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (creation_id,revision),
  FOREIGN KEY (creation_id,preparation_revision) REFERENCES yawrd.creation_preparation_approvals(creation_id,revision)
);

CREATE FUNCTION yawrd.creation_contribution_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE a yawrd.creation_preparation_approvals; v yawrd.creation_preparation_versions;
  c jsonb; t jsonb; source_count integer; head bigint;
BEGIN
  -- Same Creation lock as preparation approval: serialize both source changes and saves.
  PERFORM 1 FROM yawrd.creation_drafts WHERE id=NEW.creation_id FOR UPDATE;
  SELECT * INTO a FROM yawrd.creation_preparation_approvals WHERE creation_id=NEW.creation_id ORDER BY revision DESC LIMIT 1;
  IF a.creation_id IS NULL OR a.revision IS DISTINCT FROM NEW.preparation_revision
    OR a.content_digest IS DISTINCT FROM NEW.preparation_digest OR a.approved_by IS DISTINCT FROM NEW.saved_by THEN
    RAISE EXCEPTION 'contribution_source_changed';
  END IF;
  SELECT * INTO v FROM yawrd.creation_preparation_versions WHERE creation_id=a.creation_id AND revision=a.revision;
  IF v.content_digest IS DISTINCT FROM a.content_digest THEN RAISE EXCEPTION 'contribution_source_changed'; END IF;
  SELECT COALESCE(max(revision),0) INTO head FROM yawrd.creation_contribution_configurations WHERE creation_id=NEW.creation_id;
  IF NEW.revision IS DISTINCT FROM head+1 THEN RAISE EXCEPTION 'contribution_revision_conflict'; END IF;
  c:=NEW.configuration_text::jsonb;
  IF jsonb_typeof(c) IS DISTINCT FROM 'object' OR
    (SELECT count(*) FROM jsonb_object_keys(c))<>3 OR NOT c ?& ARRAY['schemaVersion','participationTerms','tasks'] OR
    c->>'schemaVersion' IS DISTINCT FROM 'yawrd.creation-contribution-configuration.v1' OR
    jsonb_typeof(c->'participationTerms') IS DISTINCT FROM 'string' OR char_length(c->>'participationTerms')>4000 OR
    jsonb_typeof(c->'tasks') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_contribution_configuration'; END IF;
  source_count:=jsonb_array_length(v.artifacts->'tasks');
  IF jsonb_array_length(c->'tasks')<>source_count OR
    (SELECT count(DISTINCT x->>'taskId') FROM jsonb_array_elements(c->'tasks') x)<>source_count THEN
    RAISE EXCEPTION 'invalid_contribution_configuration';
  END IF;
  FOR t IN SELECT * FROM jsonb_array_elements(c->'tasks') LOOP
    IF jsonb_typeof(t) IS DISTINCT FROM 'object' OR
      (SELECT count(*) FROM jsonb_object_keys(t))<>5 OR NOT t ?& ARRAY['taskId','included','rewardTerms','unpaidAcknowledged','rewardNote'] OR
      jsonb_typeof(t->'taskId') IS DISTINCT FROM 'string' OR
      NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v.artifacts->'tasks') s WHERE s->>'id'=t->>'taskId') OR
      jsonb_typeof(t->'included') IS DISTINCT FROM 'boolean' OR
      jsonb_typeof(t->'unpaidAcknowledged') IS DISTINCT FROM 'boolean' OR
      COALESCE(t->>'rewardTerms','') NOT IN ('undecided','unpaid') OR
      (t->>'unpaidAcknowledged') IS DISTINCT FROM (CASE WHEN t->>'rewardTerms'='unpaid' THEN 'true' ELSE 'false' END) OR
      jsonb_typeof(t->'rewardNote') IS DISTINCT FROM 'string' OR char_length(t->>'rewardNote')>2000 THEN
      RAISE EXCEPTION 'invalid_contribution_configuration';
    END IF;
  END LOOP;
  NEW.configuration_digest:=encode(sha256(convert_to(NEW.configuration_text,'UTF8')),'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER creation_contribution_binding BEFORE INSERT ON yawrd.creation_contribution_configurations
  FOR EACH ROW EXECUTE FUNCTION yawrd.creation_contribution_guard();
CREATE TRIGGER creation_contribution_immutable BEFORE UPDATE OR DELETE ON yawrd.creation_contribution_configurations
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();

CREATE FUNCTION yawrd.creation_contribution_read(_session text,_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE binding jsonb; a yawrd.creation_preparation_versions; previous yawrd.creation_preparation_versions;
  c yawrd.creation_contribution_configurations; saved jsonb:=NULL;
BEGIN
  binding:=yawrd.creation_preparation_access(_session,_id);
  -- Approval, not the latest draft head. Many later unapproved derivatives are harmless.
  SELECT v.* INTO a FROM yawrd.creation_preparation_versions v
    JOIN yawrd.creation_preparation_approvals p USING (creation_id,revision)
    WHERE v.creation_id=_id AND p.content_digest=v.content_digest ORDER BY v.revision DESC LIMIT 1;
  IF a.creation_id IS NULL THEN RAISE EXCEPTION 'contribution_approval_required'; END IF;
  SELECT * INTO c FROM yawrd.creation_contribution_configurations WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
  IF c.creation_id IS NOT NULL THEN
    SELECT * INTO previous FROM yawrd.creation_preparation_versions WHERE creation_id=_id AND revision=c.preparation_revision;
    saved:=jsonb_build_object('revision',c.revision,'digest',c.configuration_digest,'configurationText',c.configuration_text,
      'savedBy',c.saved_by,'savedAt',c.saved_at,
      'source',jsonb_build_object('revision',previous.revision,'digest',previous.content_digest,'artifactText',previous.artifact_text));
  END IF;
  RETURN jsonb_build_object('binding',binding,
    'approved',jsonb_build_object('revision',a.revision,'digest',a.content_digest,'artifactText',a.artifact_text),'saved',saved);
END $$;

CREATE FUNCTION yawrd.creation_contribution_save(_session text,_id text,_expected bigint,_source bigint,_digest text,_reviewed boolean,_text text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE binding jsonb; a yawrd.creation_preparation_approvals; head yawrd.creation_contribution_configurations;
BEGIN
  binding:=yawrd.creation_preparation_access(_session,_id);
  SELECT * INTO a FROM yawrd.creation_preparation_approvals WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
  IF a.creation_id IS NULL THEN RAISE EXCEPTION 'contribution_approval_required'; END IF;
  IF a.revision IS DISTINCT FROM _source OR a.content_digest IS DISTINCT FROM _digest THEN
    RAISE EXCEPTION 'contribution_source_changed';
  END IF;
  SELECT * INTO head FROM yawrd.creation_contribution_configurations WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
  -- A retry of the exact accepted save is safe, including a lost HTTP response.
  IF head.revision=_expected+1 AND head.preparation_revision=_source AND head.preparation_digest=_digest AND head.configuration_text=_text THEN
    RETURN yawrd.creation_contribution_read(_session,_id);
  END IF;
  IF _expected IS NULL OR _expected<>COALESCE(head.revision,0) THEN RAISE EXCEPTION 'contribution_revision_conflict'; END IF;
  IF (head.creation_id IS NULL OR head.preparation_revision<>_source OR head.preparation_digest<>_digest) AND _reviewed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'contribution_review_required';
  END IF;
  IF head.configuration_text=_text AND head.preparation_revision=_source AND head.preparation_digest=_digest THEN
    RETURN yawrd.creation_contribution_read(_session,_id);
  END IF;
  INSERT INTO yawrd.creation_contribution_configurations(creation_id,revision,preparation_revision,preparation_digest,configuration_text,saved_by)
    VALUES (_id,COALESCE(head.revision,0)+1,_source,_digest,_text,binding->>'founderAccountId');
  RETURN yawrd.creation_contribution_read(_session,_id);
END $$;

REVOKE ALL ON yawrd.creation_contribution_configurations FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_contribution_guard(),yawrd.creation_contribution_read(text,text),
  yawrd.creation_contribution_save(text,text,bigint,bigint,text,boolean,text) FROM PUBLIC;
GRANT SELECT ON yawrd.creation_contribution_configurations TO yawrd_07b_runtime;
GRANT INSERT(creation_id,revision,preparation_revision,preparation_digest,configuration_text,saved_by)
  ON yawrd.creation_contribution_configurations TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_contribution_read(text,text),
  yawrd.creation_contribution_save(text,text,bigint,bigint,text,boolean,text) TO yawrd_07b_runtime;
-- Existing trusted-server boundary, not per-wallet SQL isolation. No UPDATE/DELETE/TRUNCATE grants.
-- No transaction-control commands: a separately authorized operator controls installation.
