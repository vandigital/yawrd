-- INACTIVE DRAFT: engineering review only. Do not execute without separate authorization.
-- Operator identity is normalized through the immutable approved application.
-- Its UNIQUE(network, project_id, account_id) plus this primary key permit
-- exactly one association per operator per project, without an agent registry.
CREATE TABLE yawrd.agent_associations (
  application_id uuid PRIMARY KEY,
  network text NOT NULL CHECK (network = 'testnet'),
  project_id text NOT NULL,
  agent_reference text NOT NULL CHECK (
    length(agent_reference) BETWEEN 1 AND 200
    AND agent_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/@-]*$'
  ),
  consent_version text NOT NULL CHECK (consent_version = 'agent-association-v1'),
  authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (application_id, network, project_id)
    REFERENCES yawrd.applications(id, network, project_id)
);

-- Defense in depth: even direct INSERT cannot associate pending/rejected members.
-- Decisions and applications are immutable under migration 001.
CREATE FUNCTION yawrd.check_agent_association() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM yawrd.review_decisions d
    WHERE d.application_id = NEW.application_id AND d.network = NEW.network
      AND d.project_id = NEW.project_id AND d.decision = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved_participant_required' USING ERRCODE = '23514';
  END IF;
  NEW.authorized_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER approved_agent_association BEFORE INSERT ON yawrd.agent_associations
  FOR EACH ROW EXECUTE FUNCTION yawrd.check_agent_association();
CREATE TRIGGER immutable_agent_associations BEFORE UPDATE OR DELETE ON yawrd.agent_associations
  FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();

-- Existing server-side runtime role; no browser/agent database access is granted.
GRANT SELECT ON yawrd.agent_associations TO yawrd_07b_runtime;
GRANT INSERT (application_id, network, project_id, agent_reference, consent_version)
  ON yawrd.agent_associations TO yawrd_07b_runtime;
