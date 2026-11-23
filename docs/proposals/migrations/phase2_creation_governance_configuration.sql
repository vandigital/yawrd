-- UNAPPLIED additive P3.7 Development proposal. Separate installation authorization required.
-- Requires accepted P3.5/P3.6 functions, tables, prevent_mutation(), yawrd_07b_runtime.
-- Only private configuration is written. Existing authorizers and DAO policy are unchanged.
CREATE TABLE yawrd.creation_governance_configurations (
  creation_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0 AND revision < 9007199254740991),
  contribution_revision bigint NOT NULL,
  contribution_digest text NOT NULL CHECK (contribution_digest ~ '^[a-f0-9]{64}$'),
  preparation_revision bigint NOT NULL,
  preparation_digest text NOT NULL CHECK (preparation_digest ~ '^[a-f0-9]{64}$'),
  binding jsonb NOT NULL,
  review_mode text NOT NULL CHECK (review_mode='founder-led'),
  consent_version text NOT NULL CHECK (consent_version='creation-founder-governance-v1'),
  saved_by text NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (creation_id,revision),
  FOREIGN KEY (creation_id,contribution_revision) REFERENCES yawrd.creation_contribution_configurations(creation_id,revision),
  FOREIGN KEY (creation_id,preparation_revision) REFERENCES yawrd.creation_preparation_approvals(creation_id,revision)
);

CREATE FUNCTION yawrd.creation_governance_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE c yawrd.creation_contribution_configurations; a yawrd.creation_preparation_approvals;
  f yawrd.creation_platform_fees; head yawrd.creation_governance_configurations; verified jsonb;
BEGIN
  -- Shared with contribution saves and Blueprint approvals: source cannot race this insert.
  PERFORM 1 FROM yawrd.creation_drafts WHERE id=NEW.creation_id FOR UPDATE;
  SELECT * INTO c FROM yawrd.creation_contribution_configurations WHERE creation_id=NEW.creation_id ORDER BY revision DESC LIMIT 1;
  SELECT * INTO a FROM yawrd.creation_preparation_approvals WHERE creation_id=NEW.creation_id ORDER BY revision DESC LIMIT 1;
  IF c.creation_id IS NULL OR a.creation_id IS NULL OR c.revision IS DISTINCT FROM NEW.contribution_revision
    OR c.configuration_digest IS DISTINCT FROM NEW.contribution_digest
    OR c.preparation_revision IS DISTINCT FROM NEW.preparation_revision OR c.preparation_digest IS DISTINCT FROM NEW.preparation_digest
    OR a.revision IS DISTINCT FROM NEW.preparation_revision OR a.content_digest IS DISTINCT FROM NEW.preparation_digest THEN
    RAISE EXCEPTION 'governance_source_changed';
  END IF;
  SELECT * INTO f FROM yawrd.creation_platform_fees WHERE creation_id=NEW.creation_id;
  verified:=jsonb_build_object('creationId',NEW.creation_id,'founderAccountId',f.founder_account_id,'daoAccountId',f.dao_account_id,
    'deploymentTransaction',f.deployment_transaction,'deploymentDigest',f.deployment_digest,
    'paymentTransaction',f.transaction_hash,'paymentDigest',f.evidence->>'evidenceDigest');
  IF f.state IS DISTINCT FROM 'paid' OR NEW.binding IS DISTINCT FROM verified OR NEW.saved_by IS DISTINCT FROM f.founder_account_id
    OR c.saved_by IS DISTINCT FROM NEW.saved_by OR a.approved_by IS DISTINCT FROM NEW.saved_by THEN
    RAISE EXCEPTION 'governance_binding_changed';
  END IF;
  SELECT * INTO head FROM yawrd.creation_governance_configurations WHERE creation_id=NEW.creation_id ORDER BY revision DESC LIMIT 1;
  IF head.creation_id IS NOT NULL AND head.binding IS DISTINCT FROM NEW.binding THEN RAISE EXCEPTION 'governance_binding_changed'; END IF;
  IF NEW.revision IS DISTINCT FROM COALESCE(head.revision,0)+1 THEN RAISE EXCEPTION 'governance_revision_conflict'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER creation_governance_binding BEFORE INSERT ON yawrd.creation_governance_configurations
  FOR EACH ROW EXECUTE FUNCTION yawrd.creation_governance_guard();
CREATE TRIGGER creation_governance_immutable BEFORE UPDATE OR DELETE ON yawrd.creation_governance_configurations
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();

CREATE FUNCTION yawrd.creation_governance_read(_session text,_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE v jsonb; c jsonb; source jsonb; g yawrd.creation_governance_configurations; saved jsonb:=NULL;
BEGIN
  -- Reuses verified founder/deployment/payment access and the existing Creation lock/session recheck.
  v:=yawrd.creation_contribution_read(_session,_id);
  c:=v->'saved';
  IF c IS NULL OR c='null'::jsonb THEN RAISE EXCEPTION 'governance_contributions_required'; END IF;
  source:=jsonb_build_object('contributionRevision',c->'revision','contributionDigest',c->'digest',
    'preparationRevision',c#>'{source,revision}','preparationDigest',c#>'{source,digest}');
  SELECT * INTO g FROM yawrd.creation_governance_configurations WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
  IF g.creation_id IS NOT NULL THEN
    IF g.binding IS DISTINCT FROM v->'binding' THEN RAISE EXCEPTION 'governance_binding_changed'; END IF;
    saved:=jsonb_build_object('revision',g.revision,'binding',g.binding,'reviewMode',g.review_mode,'consentVersion',g.consent_version,
      'savedBy',g.saved_by,'savedAt',g.saved_at,'source',jsonb_build_object(
        'contributionRevision',g.contribution_revision,'contributionDigest',g.contribution_digest,
        'preparationRevision',g.preparation_revision,'preparationDigest',g.preparation_digest));
  END IF;
  RETURN jsonb_build_object('binding',v->'binding','title',(c#>>'{source,artifactText}')::jsonb#>>'{blueprint,title}',
    'source',source,'contributionCurrent',c#>'{source,revision}'=v#>'{approved,revision}' AND c#>'{source,digest}'=v#>'{approved,digest}',
    'saved',saved);
END $$;

CREATE FUNCTION yawrd.creation_governance_save(_session text,_id text,_expected bigint,
  _contribution bigint,_contribution_digest text,_preparation bigint,_preparation_digest text,_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
DECLARE v jsonb; source jsonb; head yawrd.creation_governance_configurations;
BEGIN
  v:=yawrd.creation_governance_read(_session,_id);
  source:=jsonb_build_object('contributionRevision',_contribution,'contributionDigest',_contribution_digest,
    'preparationRevision',_preparation,'preparationDigest',_preparation_digest);
  IF _confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'governance_confirmation_required'; END IF;
  IF v->>'contributionCurrent' IS DISTINCT FROM 'true' OR v->'source' IS DISTINCT FROM source THEN RAISE EXCEPTION 'governance_source_changed'; END IF;
  SELECT * INTO head FROM yawrd.creation_governance_configurations WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
  -- Lost-response retries are idempotent, but only for the exact current source/binding.
  IF head.contribution_revision=_contribution AND head.contribution_digest=_contribution_digest
    AND head.preparation_revision=_preparation AND head.preparation_digest=_preparation_digest
    AND (_expected=head.revision OR _expected+1=head.revision) THEN RETURN v; END IF;
  IF _expected IS NULL OR _expected<>COALESCE(head.revision,0) THEN RAISE EXCEPTION 'governance_revision_conflict'; END IF;
  INSERT INTO yawrd.creation_governance_configurations(creation_id,revision,contribution_revision,contribution_digest,
    preparation_revision,preparation_digest,binding,review_mode,consent_version,saved_by)
    VALUES (_id,COALESCE(head.revision,0)+1,_contribution,_contribution_digest,_preparation,_preparation_digest,
      v->'binding','founder-led','creation-founder-governance-v1',v#>>'{binding,founderAccountId}');
  RETURN yawrd.creation_governance_read(_session,_id);
END $$;

REVOKE ALL ON yawrd.creation_governance_configurations FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_governance_guard(),yawrd.creation_governance_read(text,text),
  yawrd.creation_governance_save(text,text,bigint,bigint,text,bigint,text,boolean) FROM PUBLIC;
GRANT SELECT ON yawrd.creation_governance_configurations TO yawrd_07b_runtime;
GRANT INSERT(creation_id,revision,contribution_revision,contribution_digest,preparation_revision,preparation_digest,
  binding,review_mode,consent_version,saved_by) ON yawrd.creation_governance_configurations TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd.creation_governance_read(text,text),
  yawrd.creation_governance_save(text,text,bigint,bigint,text,bigint,text,boolean) TO yawrd_07b_runtime;
-- Existing trusted-server SQL boundary, not per-wallet RLS. No mutable grants or timestamp override.
-- No installation or transaction-control commands; a separately authorized operator controls installation.
