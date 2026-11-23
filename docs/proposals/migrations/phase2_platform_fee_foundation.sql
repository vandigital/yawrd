-- DEFERRED PROPOSAL ONLY. Never place in migrations/ or execute without review.
-- Requires separately verified projects/sessions schema including immutable DAO
-- association (003_genesis_draft_linking.sql). No production compatibility assumed.
-- No grants, activation flags, backfill, existing-row updates, or runtime wiring.
-- All proof arguments are trusted SERVER verifier outputs, never client JSON.

CREATE TABLE yawrd.fee_deployments (
  network text NOT NULL CHECK (network = 'testnet'),
  project_id text NOT NULL,
  founder text NOT NULL CHECK (founder <> 'yawrd.testnet'),
  dao_id text NOT NULL,
  creation_hash text NOT NULL CHECK (creation_hash ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  final_height bigint NOT NULL CHECK (final_height > 0),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (network, project_id),
  UNIQUE (network, dao_id),
  UNIQUE (network, creation_hash),
  UNIQUE (network, project_id, founder, dao_id, creation_hash),
  FOREIGN KEY (network, project_id) REFERENCES yawrd.projects(network, id)
);
CREATE TABLE yawrd.fee_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL CHECK (network = 'testnet'),
  project_id text NOT NULL,
  founder text NOT NULL CHECK (founder <> recipient),
  dao_id text NOT NULL,
  creation_hash text NOT NULL,
  amount_yocto numeric(39,0) NOT NULL CHECK (amount_yocto = 500000000000000000000000),
  recipient text NOT NULL CHECK (recipient = 'yawrd.testnet'),
  policy_version text NOT NULL CHECK (policy_version = 'testnet-platform-fee-v1'),
  not_before_height bigint NOT NULL CHECK (not_before_height > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (network, project_id), -- one immutable, recoverable intent per Yawrd
  UNIQUE (id, network, project_id),
  FOREIGN KEY (network, project_id, founder, dao_id, creation_hash)
    REFERENCES yawrd.fee_deployments(network, project_id, founder, dao_id, creation_hash)
);
CREATE TABLE yawrd.fee_payments (
  intent_id uuid PRIMARY KEY,
  network text NOT NULL CHECK (network = 'testnet'),
  project_id text NOT NULL,
  tx_hash text NOT NULL CHECK (tx_hash ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  block_height bigint NOT NULL CHECK (block_height > 0),
  receipt_id text NOT NULL CHECK (receipt_id ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (network, tx_hash), -- durable across all founders, Yawrds, and workers
  UNIQUE (network, receipt_id),
  UNIQUE (network, project_id),
  FOREIGN KEY (intent_id, network, project_id) REFERENCES yawrd.fee_intents(id, network, project_id)
);
CREATE TABLE yawrd.fee_entitlements (
  intent_id uuid PRIMARY KEY REFERENCES yawrd.fee_payments(intent_id),
  state text NOT NULL DEFAULT 'verified-payment-held' CHECK (state = 'verified-payment-held'),
  generation_budget integer NOT NULL DEFAULT 0 CHECK (generation_budget = 0),
  consumption_enabled boolean NOT NULL DEFAULT false CHECK (consumption_enabled = false),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE VIEW yawrd.fee_intent_evidence AS
  SELECT i.*, d.final_height, d.evidence_digest AS deployment_digest
  FROM yawrd.fee_intents i JOIN yawrd.fee_deployments d
    USING (network, project_id, founder, dao_id, creation_hash);
CREATE VIEW yawrd.fee_payment_evidence AS
  SELECT p.*, e.state AS entitlement_state, e.generation_budget, e.consumption_enabled
  FROM yawrd.fee_payments p JOIN yawrd.fee_entitlements e USING (intent_id);

-- Identity is rechecked under shared row locks; concurrent identity/session
-- changes cannot cross an authorized write. Project creation is NOT added here.
CREATE FUNCTION yawrd.fee_lock_project(_session text, _project text)
RETURNS yawrd.projects LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE p yawrd.projects;
BEGIN
  SELECT projects.* INTO p FROM yawrd.projects projects
    JOIN yawrd.sessions s ON s.network = projects.network AND s.account_id = projects.creator_account_id
    WHERE projects.network = 'testnet' AND projects.id = _project
      AND projects.dao_account_id IS NOT NULL AND projects.creator_account_id <> 'yawrd.testnet'
      AND s.token_hash = _session AND s.network = 'testnet'
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp()
    FOR SHARE OF projects, s;
  IF NOT FOUND THEN RAISE EXCEPTION 'founder_project_required'; END IF;
  RETURN p;
END;
$$;
CREATE FUNCTION yawrd.fee_record_deployment(_session text, _project text, _founder text,
  _dao text, _creation text, _height bigint, _digest text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE p yawrd.projects; d yawrd.fee_deployments;
BEGIN
  p := yawrd.fee_lock_project(_session, _project);
  IF p.creator_account_id <> _founder OR p.dao_account_id <> _dao THEN
    RAISE EXCEPTION 'deployment_identity_mismatch';
  END IF;
  INSERT INTO yawrd.fee_deployments(network, project_id, founder, dao_id, creation_hash, final_height, evidence_digest)
    VALUES ('testnet', _project, _founder, _dao, _creation, _height, _digest) ON CONFLICT DO NOTHING;
  -- Separate statement observes the winner after a unique-constraint wait.
  SELECT * INTO d FROM yawrd.fee_deployments WHERE network = 'testnet' AND project_id = _project;
  IF NOT FOUND OR d.founder <> _founder OR d.dao_id <> _dao OR d.creation_hash <> _creation THEN
    RAISE EXCEPTION 'deployment_binding_conflict';
  END IF;
END;
$$;
CREATE FUNCTION yawrd.fee_open_intent(_session text, _project text, _anchor bigint)
RETURNS SETOF yawrd.fee_intent_evidence LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE p yawrd.projects; d yawrd.fee_deployments;
BEGIN
  p := yawrd.fee_lock_project(_session, _project);
  SELECT * INTO d FROM yawrd.fee_deployments WHERE network = 'testnet' AND project_id = _project;
  IF NOT FOUND OR d.founder <> p.creator_account_id OR d.dao_id <> p.dao_account_id OR _anchor < d.final_height THEN
    RAISE EXCEPTION 'verified_creation_required';
  END IF;
  INSERT INTO yawrd.fee_intents(network, project_id, founder, dao_id, creation_hash, amount_yocto, recipient, policy_version, not_before_height)
    VALUES ('testnet', _project, d.founder, d.dao_id, d.creation_hash, 500000000000000000000000,
      'yawrd.testnet', 'testnet-platform-fee-v1', _anchor) ON CONFLICT (network, project_id) DO NOTHING;
  RETURN QUERY SELECT * FROM yawrd.fee_intent_evidence WHERE network = 'testnet' AND project_id = _project;
END;
$$;
CREATE FUNCTION yawrd.fee_claim(_session text, _intent uuid, _tx text, _height bigint, _receipt text, _digest text)
RETURNS SETOF yawrd.fee_payment_evidence LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE i yawrd.fee_intents; p yawrd.projects; pay yawrd.fee_payments; d yawrd.fee_deployments;
BEGIN
  -- This lock serializes same-intent claims. Global unique indexes arbitrate
  -- concurrent claims of the same transaction for different Yawrds.
  SELECT * INTO i FROM yawrd.fee_intents WHERE id = _intent FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'founder_intent_required'; END IF;
  p := yawrd.fee_lock_project(_session, i.project_id);
  SELECT * INTO d FROM yawrd.fee_deployments WHERE network = i.network AND project_id = i.project_id;
  IF NOT FOUND OR i.founder <> p.creator_account_id OR i.dao_id <> p.dao_account_id
    OR d.founder <> i.founder OR d.dao_id <> i.dao_id OR d.creation_hash <> i.creation_hash
    OR i.not_before_height < d.final_height OR _height <= i.not_before_height
    OR i.founder = i.recipient OR i.network <> 'testnet'
    OR i.amount_yocto <> 500000000000000000000000 OR i.recipient <> 'yawrd.testnet'
    OR i.policy_version <> 'testnet-platform-fee-v1' THEN
    RAISE EXCEPTION 'invalid_payment_binding';
  END IF;
  INSERT INTO yawrd.fee_payments(intent_id, network, project_id, tx_hash, block_height, receipt_id, evidence_digest)
    VALUES (i.id, i.network, i.project_id, _tx, _height, _receipt, _digest) ON CONFLICT DO NOTHING;
  SELECT * INTO pay FROM yawrd.fee_payments WHERE intent_id = i.id;
  IF NOT FOUND OR pay.tx_hash <> _tx THEN RAISE EXCEPTION 'transaction_or_intent_already_claimed'; END IF;
  -- Same function/statement/transaction: neither row can be committed alone.
  INSERT INTO yawrd.fee_entitlements(intent_id) VALUES (i.id) ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT * FROM yawrd.fee_payment_evidence WHERE intent_id = i.id;
END;
$$;

CREATE FUNCTION yawrd.fee_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable_fee_evidence'; END;
$$;
CREATE TRIGGER immutable_fee_deployment BEFORE UPDATE OR DELETE ON yawrd.fee_deployments FOR EACH ROW EXECUTE FUNCTION yawrd.fee_append_only();
CREATE TRIGGER immutable_fee_intent BEFORE UPDATE OR DELETE ON yawrd.fee_intents FOR EACH ROW EXECUTE FUNCTION yawrd.fee_append_only();
CREATE TRIGGER immutable_fee_payment BEFORE UPDATE OR DELETE ON yawrd.fee_payments FOR EACH ROW EXECUTE FUNCTION yawrd.fee_append_only();
CREATE TRIGGER immutable_fee_entitlement BEFORE UPDATE OR DELETE ON yawrd.fee_entitlements FOR EACH ROW EXECUTE FUNCTION yawrd.fee_append_only();
-- PostgreSQL defaults new functions to PUBLIC EXECUTE. Explicitly close that.
REVOKE ALL ON FUNCTION yawrd.fee_lock_project(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.fee_record_deployment(text,text,text,text,text,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.fee_open_intent(text,text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.fee_claim(text,uuid,text,bigint,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.fee_append_only() FROM PUBLIC;
-- No runtime grants. A future review must define a trusted server writer role;
-- invoker functions require table privileges and do not defend against a compromised
-- privileged application/DB owner. Never expose them through client SQL access.
