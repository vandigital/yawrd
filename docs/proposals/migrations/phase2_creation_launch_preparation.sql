-- SUPERSEDED by the one-step P3.8 revision. DO NOT INSTALL.
-- Private launch-choice persistence is no longer used. Retained as an unapplied historical proposal.
-- UNAPPLIED additive P3.8A Development proposal. Separate installation authorization required.
-- No publication, funding, task, participant or reward records are written.
CREATE TABLE yawrd.creation_launch_preparations (
 creation_id text NOT NULL REFERENCES yawrd.creation_drafts(id),
 revision bigint NOT NULL CHECK (revision>0 AND revision<9007199254740991),
 source jsonb NOT NULL CHECK (jsonb_typeof(source)='object' AND octet_length(source::text)<=16384),
 choices jsonb NOT NULL CHECK (jsonb_typeof(choices)='object' AND octet_length(choices::text)<=1024),
 saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(creation_id,revision)
);
CREATE FUNCTION yawrd.creation_launch_context(_session text,_id text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
SELECT jsonb_build_object('governance',g.v,'source',jsonb_build_object(
  'binding',g.v->'binding','governanceRevision',g.v#>'{saved,revision}','configurationSource',g.v->'source',
  'publicName',d.prepared#>>'{plan,initializer,config,name}',
  'publicDescription',d.prepared#>>'{plan,initializer,config,purpose}')) AS context
FROM (SELECT yawrd.creation_governance_read(_session,_id) AS v) g
CROSS JOIN LATERAL yawrd.creation_deployment_read(_session,_id) d
$$;
CREATE FUNCTION yawrd.creation_launch_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE head bigint; g yawrd.creation_governance_configurations; c yawrd.creation_contribution_configurations; a yawrd.creation_preparation_approvals;
BEGIN
 PERFORM 1 FROM yawrd.creation_drafts WHERE id=NEW.creation_id FOR UPDATE;
 SELECT * INTO g FROM yawrd.creation_governance_configurations WHERE creation_id=NEW.creation_id ORDER BY revision DESC LIMIT 1;
 SELECT * INTO c FROM yawrd.creation_contribution_configurations WHERE creation_id=NEW.creation_id ORDER BY revision DESC LIMIT 1;
 SELECT * INTO a FROM yawrd.creation_preparation_approvals WHERE creation_id=NEW.creation_id ORDER BY revision DESC LIMIT 1;
 IF g.creation_id IS NULL OR NEW.source->'binding' IS DISTINCT FROM g.binding
  OR (NEW.source->>'governanceRevision')::bigint IS DISTINCT FROM g.revision
  OR NEW.source#>>'{configurationSource,contributionDigest}' IS DISTINCT FROM c.configuration_digest
  OR (NEW.source#>>'{configurationSource,contributionRevision}')::bigint IS DISTINCT FROM c.revision
  OR (NEW.source#>>'{configurationSource,preparationRevision}')::bigint IS DISTINCT FROM a.revision
  OR NEW.source#>>'{configurationSource,preparationDigest}' IS DISTINCT FROM a.content_digest
  OR g.contribution_revision IS DISTINCT FROM c.revision OR g.preparation_revision IS DISTINCT FROM a.revision THEN RAISE EXCEPTION 'launch_source_changed'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(NEW.choices))<>3 OR NOT NEW.choices ?& ARRAY['intent','fundingPlan','includeDescription']
  OR COALESCE(NEW.choices->>'intent','') NOT IN ('private','publication-review')
  OR COALESCE(NEW.choices->>'fundingPlan','') NOT IN ('undecided','none-planned')
  OR jsonb_typeof(NEW.choices->'includeDescription') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'launch_invalid_choices'; END IF;
 SELECT COALESCE(max(revision),0) INTO head FROM yawrd.creation_launch_preparations WHERE creation_id=NEW.creation_id;
 IF NEW.revision IS DISTINCT FROM head+1 THEN RAISE EXCEPTION 'launch_revision_conflict'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER creation_launch_binding BEFORE INSERT ON yawrd.creation_launch_preparations FOR EACH ROW EXECUTE FUNCTION yawrd.creation_launch_guard();
CREATE TRIGGER creation_launch_immutable BEFORE UPDATE OR DELETE ON yawrd.creation_launch_preparations FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();
CREATE FUNCTION yawrd.creation_launch_save(_session text,_id text,_expected bigint,_source jsonb,_choices jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE v jsonb; head yawrd.creation_launch_preparations;
BEGIN
 v:=yawrd.creation_launch_context(_session,_id);
 IF v#>'{governance,saved}' IS NULL OR v#>'{governance,saved}'='null'::jsonb THEN RAISE EXCEPTION 'launch_governance_required'; END IF;
 IF v#>>'{governance,contributionCurrent}' IS DISTINCT FROM 'true'
  OR v#>'{governance,saved,source}' IS DISTINCT FROM v#>'{governance,source}'
  OR v->'source' IS DISTINCT FROM _source THEN RAISE EXCEPTION 'launch_source_changed'; END IF;
 SELECT * INTO head FROM yawrd.creation_launch_preparations WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
 IF head.source=_source AND head.choices=_choices AND (_expected=head.revision OR _expected+1=head.revision) THEN RETURN; END IF;
 IF _expected IS NULL OR _expected<>COALESCE(head.revision,0) THEN RAISE EXCEPTION 'launch_revision_conflict'; END IF;
 INSERT INTO yawrd.creation_launch_preparations(creation_id,revision,source,choices) VALUES(_id,COALESCE(head.revision,0)+1,_source,_choices);
END $$;
REVOKE ALL ON yawrd.creation_launch_preparations FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_launch_context(text,text),yawrd.creation_launch_guard(),yawrd.creation_launch_save(text,text,bigint,jsonb,jsonb) FROM PUBLIC;
GRANT SELECT ON yawrd.creation_launch_preparations TO yawrd_07b_runtime;
GRANT INSERT(creation_id,revision,source,choices) ON yawrd.creation_launch_preparations TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_launch_context(text,text),yawrd.creation_launch_save(text,text,bigint,jsonb,jsonb) TO yawrd_07b_runtime;
-- Existing trusted-server/direct-SQL boundary remains. No per-wallet SQL isolation claim.
