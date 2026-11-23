-- P3.8B UNAPPLIED PROPOSAL. No automatic migration discovery. DO NOT INSTALL without authorization.
-- Install AFTER accepted P3.5/P3.6/P3.7, NEVER P3.8A launch-preparation SQL.
-- Operator supplies a dedicated LOGIN yawrd_publication_writer with no membership in other roles,
-- NOCREATEDB NOCREATEROLE NOSUPERUSER NOREPLICATION NOBYPASSRLS. No password in this file.
-- Run as existing schema/table owner in ONE separately authorized transaction.
-- SECURITY DEFINER owner must remain an administrative principal inaccessible to runtime/writer.
-- The trusted migration owner may hold the sole ADMIN-only membership in the writer,
-- with INHERIT=false and SET=false (including provider-managed Neon membership).
-- Every other writer membership or additional membership row is rejected.
-- Resolve the trusted owner from current_user; do not pin a Development owner or grantor.
-- No Development endpoint, account identity, project name or Mainnet configuration is embedded.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='yawrd_publication_writer' AND rolcanlogin
    AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles writer
      ON writer.oid=m.roleid OR writer.oid=m.member
      WHERE writer.rolname='yawrd_publication_writer'
      HAVING count(*)>1 OR count(*) FILTER (WHERE NOT (
        m.roleid=writer.oid AND m.member=current_user::regrole
        AND m.admin_option IS TRUE AND m.inherit_option IS FALSE AND m.set_option IS FALSE))>0)
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='yawrd_07b_runtime' AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR current_user IN ('yawrd_07b_runtime','yawrd_publication_writer')
    OR pg_has_role('yawrd_07b_runtime',current_user,'MEMBER') THEN
    RAISE EXCEPTION 'publication_role_boundary_required';
  END IF;
END $$;

CREATE SCHEMA yawrd_publication;
REVOKE ALL ON SCHEMA yawrd_publication FROM PUBLIC,yawrd_07b_runtime,yawrd_publication_writer;
GRANT USAGE ON SCHEMA yawrd_publication TO yawrd_07b_runtime,yawrd_publication_writer;

CREATE TABLE yawrd_publication.tickets (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{43}$'),
  creation_id text NOT NULL REFERENCES yawrd.creation_drafts(id),
  founder text NOT NULL,
  session_hash text NOT NULL,
  challenge jsonb NOT NULL,
  source_text text NOT NULL CHECK (octet_length(source_text)<=65536),
  payload_text text NOT NULL CHECK (octet_length(payload_text)<=524288),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX publication_ticket_budget ON yawrd_publication.tickets(creation_id,issued_at);
CREATE TABLE yawrd_publication.publications (
  creation_id text PRIMARY KEY REFERENCES yawrd.creation_drafts(id),
  ticket_id text NOT NULL UNIQUE REFERENCES yawrd_publication.tickets(id),
  founder text NOT NULL,
  payload jsonb NOT NULL,
  evidence jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER publication_ticket_immutable BEFORE UPDATE OR DELETE ON yawrd_publication.tickets
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();
CREATE TRIGGER publication_receipt_immutable BEFORE UPDATE OR DELETE ON yawrd_publication.publications
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();

-- Internal helper: recompute exact current source and public allowlist under short
-- table SHARE locks. Direct SQL inserts can bypass the old Creation row-lock
-- convention, so relying ONLY on that convention would permit an approval race.
-- Locks last one SQL request; no lock spans a wallet prompt or RPC call.
CREATE FUNCTION yawrd_publication.context(_session text,_id text,_founder text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c yawrd.creation_drafts; d yawrd.creation_deployments; f yawrd.creation_platform_fees;
  a yawrd.creation_preparation_approvals; v yawrd.creation_preparation_versions;
  p yawrd.creation_contribution_configurations; g yawrd.creation_governance_configurations;
  binding jsonb; source jsonb; tasks jsonb; funding text;
BEGIN
  LOCK TABLE yawrd.sessions,yawrd.creation_drafts,yawrd.creation_deployments,yawrd.creation_platform_fees,
    yawrd.creation_preparation_versions,yawrd.creation_preparation_approvals,
    yawrd.creation_contribution_configurations,yawrd.creation_governance_configurations IN SHARE MODE;
  IF NOT EXISTS (SELECT 1 FROM yawrd.sessions WHERE token_hash=_session AND account_id=_founder AND network='testnet'
      AND revoked_at IS NULL AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'sign_in_required'; END IF;
  SELECT * INTO c FROM yawrd.creation_drafts WHERE id=_id AND network='testnet' AND founder_account_id=_founder;
  IF c.id IS NULL THEN RAISE EXCEPTION 'creation_not_found'; END IF;
  SELECT * INTO d FROM yawrd.creation_deployments WHERE creation_id=_id;
  SELECT * INTO f FROM yawrd.creation_platform_fees WHERE creation_id=_id;
  SELECT * INTO a FROM yawrd.creation_preparation_approvals WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
  SELECT * INTO v FROM yawrd.creation_preparation_versions WHERE creation_id=_id AND revision=a.revision;
  SELECT * INTO p FROM yawrd.creation_contribution_configurations WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
  SELECT * INTO g FROM yawrd.creation_governance_configurations WHERE creation_id=_id ORDER BY revision DESC LIMIT 1;
  binding:=jsonb_build_object('creationId',_id,'founderAccountId',_founder,'daoAccountId',f.dao_account_id,
    'deploymentTransaction',f.deployment_transaction,'deploymentDigest',f.deployment_digest,
    'paymentTransaction',f.transaction_hash,'paymentDigest',f.evidence->>'evidenceDigest');
  IF NOT COALESCE(f.state='paid' AND f.founder_account_id=_founder AND f.network='testnet'
    AND d.state='deployed-hardening-required' AND d.transaction_hash=d.verified_transaction_hash
    AND d.evidence_attempt=d.attempt AND d.evidence->>'transactionHash'=d.transaction_hash
    AND d.prepared#>>'{input,creatorAccountId}'=_founder AND d.prepared#>>'{plan,daoAccountId}'=d.dao_account_id
    AND f.dao_account_id=d.dao_account_id AND f.deployment_transaction=d.transaction_hash
    AND f.deployment_digest=d.evidence->>'evidenceDigest' AND f.transaction_hash=f.evidence->>'txHash'
    AND a.approved_by=_founder AND a.content_digest=v.content_digest
    AND p.saved_by=_founder AND p.preparation_revision=a.revision AND p.preparation_digest=a.content_digest
    AND g.saved_by=_founder AND g.binding=binding AND g.review_mode='founder-led'
    AND g.contribution_revision=p.revision AND g.contribution_digest=p.configuration_digest
    AND g.preparation_revision=a.revision AND g.preparation_digest=a.content_digest
    AND length(btrim(v.artifacts#>>'{blueprint,title}'))>0 AND length(btrim(v.artifacts#>>'{blueprint,summary}'))>0,false)
    THEN RAISE EXCEPTION 'launch_source_changed'; END IF;
  source:=jsonb_build_object('binding',binding,'governanceRevision',g.revision,
    'configurationSource',jsonb_build_object('contributionRevision',p.revision,'contributionDigest',p.configuration_digest,
      'preparationRevision',a.revision,'preparationDigest',a.content_digest),
    'publicName',v.artifacts#>>'{blueprint,title}','publicDescription',v.artifacts#>>'{blueprint,summary}',
    'profileSource',jsonb_build_object('revision',a.revision,'digest',a.content_digest,
      'nameField','blueprint.title','descriptionField','blueprint.summary'));
  funding:=CASE WHEN c.intake#>>'{answers,intendedBudget}'='no-money-needed' THEN 'none-planned' ELSE 'unresolved' END;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t->>'id','title',t->>'title','summary',t->>'brief',
    'deliverables',t->'deliverables','allocation',CASE WHEN funding='none-planned' THEN 'unallocated' ELSE 'not-set' END,
    'rewardTerms',CASE WHEN choice->>'rewardTerms'='undecided' THEN 'undecided' ELSE 'private-unpaid-choice' END,
    'dependencies',(SELECT COALESCE(jsonb_agg(jsonb_build_object('included',EXISTS(
      SELECT 1 FROM jsonb_array_elements(p.configuration->'tasks') cc WHERE cc->>'taskId'=dep AND cc->>'included'='true'),
      'title',CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(p.configuration->'tasks') cc WHERE cc->>'taskId'=dep AND cc->>'included'='true')
        THEN (SELECT tt->>'title' FROM jsonb_array_elements(v.artifacts->'tasks') tt WHERE tt->>'id'=dep)
        ELSE 'Excluded prerequisite' END) ORDER BY dep_order),'[]'::jsonb)
      FROM jsonb_array_elements_text(t->'dependencies') WITH ORDINALITY AS dependencies(dep,dep_order))) ORDER BY task_order),'[]'::jsonb)
    INTO tasks FROM jsonb_array_elements(v.artifacts->'tasks') WITH ORDINALITY AS planned(t,task_order)
    JOIN jsonb_array_elements(p.configuration->'tasks') choice ON choice->>'taskId'=t->>'id' AND choice->>'included'='true';
  RETURN jsonb_build_object('source',source,'payload',jsonb_build_object('name',source->>'publicName',
    'description',source->>'publicDescription','fundingPlan',funding,'progress',jsonb_build_object('accepted',NULL,'planned',jsonb_array_length(tasks)),'tasks',tasks));
END $$;

CREATE FUNCTION yawrd_publication.issue(_session text,_id text,_founder text,_challenge jsonb,_source text,_payload text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE ctx jsonb; issued timestamptz; expires timestamptz;
BEGIN
  ctx:=yawrd_publication.context(_session,_id,_founder);
  IF ctx->'source' IS DISTINCT FROM _source::jsonb OR ctx->'payload' IS DISTINCT FROM _payload::jsonb
    THEN RAISE EXCEPTION 'launch_source_changed'; END IF;
  issued:=to_timestamp((_challenge->>'issuedAt')::double precision/1000);
  expires:=to_timestamp((_challenge->>'expiresAt')::double precision/1000);
  IF NOT COALESCE(_challenge->>'accountId'=_founder AND _challenge->>'network'='testnet'
    AND _challenge->>'recipient'='Yawrd publication consent' AND length(_challenge->>'message') BETWEEN 1 AND 4000
    AND issued BETWEEN clock_timestamp()-interval '30 seconds' AND clock_timestamp()+interval '5 seconds'
    AND expires-issued=interval '5 minutes',false) THEN RAISE EXCEPTION 'launch_challenge_expired'; END IF;
  -- Serialize the bounded challenge budget, without involving source write locks.
  PERFORM pg_advisory_xact_lock(hashtextextended('publication:'||_id,0));
  IF (SELECT count(*) FROM yawrd_publication.tickets WHERE creation_id=_id AND issued_at>clock_timestamp()-interval '1 minute')>=5
    THEN RAISE EXCEPTION 'launch_rate_limited'; END IF;
  INSERT INTO yawrd_publication.tickets(id,creation_id,founder,session_hash,challenge,source_text,payload_text,expires_at)
    VALUES(_challenge->>'id',_id,_founder,_session,_challenge,_source,_payload,expires);
END $$;

CREATE FUNCTION yawrd_publication.receipt(_session text,_id text,_founder text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yawrd.sessions s JOIN yawrd.creation_drafts c ON c.founder_account_id=s.account_id
    WHERE s.token_hash=_session AND c.id=_id AND s.account_id=_founder AND s.network='testnet'
    AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'sign_in_required'; END IF;
  RETURN (SELECT jsonb_build_object('creationId',creation_id,'url','/yawrd/'||creation_id,'publishedAt',published_at)
    FROM yawrd_publication.publications WHERE creation_id=_id AND founder=_founder);
END $$;

CREATE FUNCTION yawrd_publication.ticket(_session text,_id text,_founder text,_ticket text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  PERFORM yawrd_publication.receipt(_session,_id,_founder);
  RETURN (SELECT jsonb_build_object('challenge',t.challenge,'sourceText',t.source_text,'payloadText',t.payload_text,
    'published',EXISTS(SELECT 1 FROM yawrd_publication.publications p WHERE p.ticket_id=t.id))
    FROM yawrd_publication.tickets t WHERE t.id=_ticket AND t.creation_id=_id AND t.founder=_founder AND t.session_hash=_session);
END $$;

CREATE FUNCTION yawrd_publication.publish(_session text,_id text,_founder text,_ticket text,_evidence jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE ctx jsonb; t yawrd_publication.tickets; p yawrd_publication.publications;
BEGIN
  -- This function is callable ONLY by the isolated wallet-verifying server login.
  -- _evidence is NEVER trusted from a request body or the shared SQL runtime.
  ctx:=yawrd_publication.context(_session,_id,_founder);
  PERFORM pg_advisory_xact_lock(hashtextextended('publication:'||_id,0));
  SELECT * INTO t FROM yawrd_publication.tickets WHERE id=_ticket AND creation_id=_id AND founder=_founder AND session_hash=_session;
  IF t.id IS NULL THEN RAISE EXCEPTION 'launch_challenge_required'; END IF;
  SELECT * INTO p FROM yawrd_publication.publications WHERE creation_id=_id;
  IF p.creation_id IS NOT NULL THEN
    IF p.ticket_id<>t.id OR p.evidence#>'{proof}' IS DISTINCT FROM _evidence->'proof' THEN RAISE EXCEPTION 'launch_already_published'; END IF;
    RETURN yawrd_publication.receipt(_session,_id,_founder);
  END IF;
  IF t.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'launch_challenge_expired'; END IF;
  IF ctx->'source' IS DISTINCT FROM t.source_text::jsonb OR ctx->'payload' IS DISTINCT FROM t.payload_text::jsonb
    THEN RAISE EXCEPTION 'launch_source_changed'; END IF;
  IF NOT COALESCE(_evidence#>>'{proof,accountId}'=_founder AND _evidence->>'consentVersion'='creation-publication-v1'
    AND (_evidence#>>'{key,blockHeight}')::bigint>0,false) THEN RAISE EXCEPTION 'launch_challenge_required'; END IF;
  INSERT INTO yawrd_publication.publications(creation_id,ticket_id,founder,payload,evidence)
    VALUES(_id,t.id,_founder,t.payload_text::jsonb,_evidence);
  RETURN yawrd_publication.receipt(_session,_id,_founder);
END $$;

-- ONLY this explicit projection is visible to shared SQL/public readers.
CREATE VIEW yawrd_publication.public_yawrds AS SELECT creation_id AS id,founder AS creator_account_id,payload,published_at
  FROM yawrd_publication.publications;
REVOKE ALL ON ALL TABLES IN SCHEMA yawrd_publication FROM PUBLIC,yawrd_07b_runtime,yawrd_publication_writer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA yawrd_publication FROM PUBLIC,yawrd_07b_runtime,yawrd_publication_writer;
GRANT SELECT ON yawrd_publication.public_yawrds TO yawrd_07b_runtime;
GRANT EXECUTE ON FUNCTION yawrd_publication.issue(text,text,text,jsonb,text,text),yawrd_publication.receipt(text,text,text),
  yawrd_publication.ticket(text,text,text,text),yawrd_publication.publish(text,text,text,text,jsonb) TO yawrd_publication_writer;
-- The writer gets NO source/auth privileges, table DML, schema CREATE, or membership in other roles.
-- Only the trusted migration owner may be its ADMIN-only member, without INHERIT or SET access.
-- Shared runtime receives NO ticket/receipt access, function EXECUTE, DML or SET ROLE path.

-- Effective privileges include inherited/default grants; an unexpected grant
-- aborts the operator's installation transaction instead of weakening isolation.
DO $$
DECLARE rel regclass; fn regprocedure;
BEGIN
  FOREACH rel IN ARRAY ARRAY['yawrd_publication.tickets'::regclass,'yawrd_publication.publications'::regclass] LOOP
    IF has_table_privilege('yawrd_07b_runtime',rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege('yawrd_07b_runtime',rel,'SELECT,INSERT,UPDATE,REFERENCES')
      OR has_table_privilege('yawrd_publication_writer',rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege('yawrd_publication_writer',rel,'SELECT,INSERT,UPDATE,REFERENCES')
      THEN RAISE EXCEPTION 'publication_table_privileges_unsafe'; END IF;
  END LOOP;
  FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='yawrd_publication' LOOP
    IF has_function_privilege('yawrd_07b_runtime',fn,'EXECUTE') THEN RAISE EXCEPTION 'publication_runtime_execute_unsafe'; END IF;
  END LOOP;
  FOREACH rel IN ARRAY ARRAY['yawrd.auth_challenges'::regclass,'yawrd.sessions'::regclass,'yawrd.creation_drafts'::regclass,
    'yawrd.creation_deployments'::regclass,'yawrd.creation_platform_fees'::regclass,'yawrd.creation_preparation_versions'::regclass,
    'yawrd.creation_preparation_approvals'::regclass,'yawrd.creation_contribution_configurations'::regclass,'yawrd.creation_governance_configurations'::regclass] LOOP
    IF has_table_privilege('yawrd_publication_writer',rel,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege('yawrd_publication_writer',rel,'SELECT,INSERT,UPDATE,REFERENCES')
      THEN RAISE EXCEPTION 'publication_writer_source_privileges_unsafe'; END IF;
  END LOOP;
  IF has_schema_privilege('yawrd_07b_runtime','yawrd_publication','CREATE')
    OR has_schema_privilege('yawrd_publication_writer','yawrd_publication','CREATE')
    OR has_schema_privilege('yawrd_07b_runtime','yawrd','CREATE')
    OR has_schema_privilege('yawrd_publication_writer','yawrd','CREATE')
    THEN RAISE EXCEPTION 'publication_schema_privileges_unsafe'; END IF;
END $$;
