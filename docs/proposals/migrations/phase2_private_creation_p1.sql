-- DEFERRED P1 PROPOSAL. Not a migration; do not move into migrations/ or execute
-- without separate schema/role review and target-database authorization.
-- Requires 001 participants/sessions only. No DAO, fee, Blueprint or publication
-- dependency. No grants, activation, backfill, or existing-table changes.

CREATE TABLE yawrd.creation_drafts (
  id text PRIMARY KEY CHECK (id ~ '^yawrd-[a-z2-7]{12}$'), -- provisional; 60 bits
  network text NOT NULL DEFAULT 'testnet' CHECK (network = 'testnet'),
  founder_account_id text NOT NULL CHECK (founder_account_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' AND length(founder_account_id) BETWEEN 2 AND 64),
  source_draft_id text NOT NULL CHECK (length(btrim(source_draft_id)) BETWEEN 1 AND 200),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740990),
  initial_intake jsonb NOT NULL CHECK (jsonb_typeof(initial_intake) = 'object' AND octet_length(initial_intake::text) <= 524288),
  intake jsonb NOT NULL CHECK (jsonb_typeof(intake) = 'object' AND octet_length(intake::text) <= 524288),
  public_name text NOT NULL DEFAULT '' CHECK (length(public_name) <= 120),
  public_description text NOT NULL DEFAULT '' CHECK (length(public_description) <= 2000),
  account_label text NOT NULL DEFAULT '' CHECK (account_label = '' OR (length(account_label) BETWEEN 2 AND 63 AND account_label ~ '^[a-z0-9]+([-_][a-z0-9]+)*$')),
  second_steward text NOT NULL DEFAULT '' CHECK (second_steward = '' OR (length(second_steward) <= 64 AND second_steward ~ '^[a-z0-9]+([._-][a-z0-9]+)*\.testnet$' AND second_steward <> founder_account_id)),
  threshold smallint NOT NULL DEFAULT 2 CHECK (threshold = 2),
  public_text_digest text NOT NULL CHECK (public_text_digest ~ '^[a-f0-9]{64}$'),
  reviewed_revision bigint,
  reviewed_public_text_digest text,
  public_text_consent_version text,
  public_text_reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (network, id),
  UNIQUE (network, founder_account_id, source_draft_id),
  CHECK (COALESCE(initial_intake->>'schemaVersion' = 'yawrd.intake-draft.v1' AND initial_intake->>'draftId' = source_draft_id, false)),
  CHECK (COALESCE(intake->>'schemaVersion' = 'yawrd.intake-draft.v1' AND intake->>'draftId' = source_draft_id, false)),
  CHECK ((reviewed_revision IS NULL AND reviewed_public_text_digest IS NULL AND public_text_consent_version IS NULL AND public_text_reviewed_at IS NULL) OR
    (reviewed_revision IS NOT NULL AND reviewed_public_text_digest IS NOT NULL AND public_text_consent_version IS NOT NULL AND public_text_reviewed_at IS NOT NULL
      AND reviewed_revision = revision AND reviewed_public_text_digest = public_text_digest
      AND public_text_consent_version = 'creation-public-text-v1' AND public_name !~ '^[[:space:]]*$' AND public_description !~ '^[[:space:]]*$'))
);
CREATE INDEX creation_founder_list ON yawrd.creation_drafts(network, founder_account_id, id);

-- A digest of the exact two text values, not trimmed text and not private intake.
-- Callers use the digest returned by the repository; no cross-language JSON hash.
CREATE FUNCTION yawrd.creation_text_digest(_name text, _description text)
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog, yawrd AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(_name, _description)::text, 'UTF8')), 'hex')
$$;
CREATE FUNCTION yawrd.creation_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, yawrd AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.network IS DISTINCT FROM OLD.network
      OR NEW.founder_account_id IS DISTINCT FROM OLD.founder_account_id
      OR NEW.source_draft_id IS DISTINCT FROM OLD.source_draft_id OR NEW.initial_intake IS DISTINCT FROM OLD.initial_intake
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'immutable_creation_identity' USING ERRCODE = '23514';
    END IF;
    NEW.revision := OLD.revision;
    IF ROW(NEW.intake,NEW.public_name,NEW.public_description,NEW.account_label,NEW.second_steward,NEW.threshold)
      IS DISTINCT FROM ROW(OLD.intake,OLD.public_name,OLD.public_description,OLD.account_label,OLD.second_steward,OLD.threshold) THEN
      NEW.revision := OLD.revision + 1;
      NEW.reviewed_revision := NULL; NEW.reviewed_public_text_digest := NULL;
      NEW.public_text_consent_version := NULL; NEW.public_text_reviewed_at := NULL;
    END IF;
  ELSE
    NEW.revision := 1;
  END IF;
  NEW.public_text_digest := yawrd.creation_text_digest(NEW.public_name, NEW.public_description);
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_creation BEFORE INSERT OR UPDATE ON yawrd.creation_drafts FOR EACH ROW EXECUTE FUNCTION yawrd.creation_guard();
CREATE TRIGGER preserve_creation_identity BEFORE DELETE ON yawrd.creation_drafts FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();

-- Locks/rechecks the existing session, including after waiting for a row lock.
-- Actor is never accepted from JSON. These INVOKER functions assume trusted server
-- code and reviewed table/function privileges, not direct untrusted SQL access.
CREATE FUNCTION yawrd.creation_founder(_session text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE s yawrd.sessions;
BEGIN
  SELECT * INTO s FROM yawrd.sessions WHERE token_hash = _session AND network = 'testnet' FOR SHARE;
  IF NOT FOUND OR s.revoked_at IS NOT NULL OR s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'sign_in_required';
  END IF;
  RETURN s.account_id;
END;
$$;
CREATE FUNCTION yawrd.creation_find_start(_session text, _intake jsonb)
RETURNS SETOF yawrd.creation_drafts LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE actor text; p yawrd.creation_drafts;
BEGIN
  actor := yawrd.creation_founder(_session);
  SELECT * INTO p FROM yawrd.creation_drafts WHERE network = 'testnet' AND founder_account_id = actor AND source_draft_id = _intake->>'draftId';
  IF FOUND THEN
    IF p.initial_intake IS DISTINCT FROM _intake THEN RAISE EXCEPTION 'creation_import_conflict'; END IF;
    RETURN NEXT p;
  END IF;
END;
$$;
CREATE FUNCTION yawrd.creation_start(_session text, _id text, _intake jsonb)
RETURNS SETOF yawrd.creation_drafts LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE actor text; p yawrd.creation_drafts;
BEGIN
  actor := yawrd.creation_founder(_session);
  -- A separate SELECT after the unique-index wait sees the concurrent winner at
  -- READ COMMITTED. Never update an existing source binding to resolve a retry.
  INSERT INTO yawrd.creation_drafts(id,founder_account_id,source_draft_id,initial_intake,intake)
    VALUES (_id,actor,_intake->>'draftId',_intake,_intake) ON CONFLICT DO NOTHING;
  PERFORM yawrd.creation_founder(_session);
  SELECT * INTO p FROM yawrd.creation_drafts WHERE network = 'testnet' AND founder_account_id = actor AND source_draft_id = _intake->>'draftId';
  IF FOUND THEN
    IF p.initial_intake IS DISTINCT FROM _intake THEN RAISE EXCEPTION 'creation_import_conflict'; END IF;
    RETURN NEXT p;
  ELSIF NOT EXISTS (SELECT 1 FROM yawrd.creation_drafts WHERE id = _id) THEN
    -- Only a demonstrated ID collision may return zero rows and permit retry.
    RAISE EXCEPTION 'creation_start_unresolved';
  END IF;
END;
$$;
CREATE FUNCTION yawrd.creation_read(_session text, _id text)
RETURNS SETOF yawrd.creation_drafts LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE actor text;
BEGIN
  actor := yawrd.creation_founder(_session);
  RETURN QUERY SELECT * FROM yawrd.creation_drafts WHERE network = 'testnet' AND id = _id AND founder_account_id = actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'creation_not_found'; END IF;
END;
$$;
CREATE FUNCTION yawrd.creation_list(_session text, _after text, _limit integer)
RETURNS TABLE(id text, network text, revision bigint, display_name text, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE actor text;
BEGIN
  actor := yawrd.creation_founder(_session);
  IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 51 THEN RAISE EXCEPTION 'invalid_creation_limit'; END IF;
  RETURN QUERY SELECT c.id,c.network,c.revision,COALESCE(c.intake->>'projectName',''),c.created_at,c.updated_at
    FROM yawrd.creation_drafts c WHERE c.network = 'testnet' AND c.founder_account_id = actor
      AND (_after IS NULL OR c.id > _after) ORDER BY c.id LIMIT _limit;
END;
$$;
CREATE FUNCTION yawrd.creation_save(_session text, _id text, _expected bigint, _intake jsonb, _config jsonb)
RETURNS SETOF yawrd.creation_drafts LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE actor text; p yawrd.creation_drafts;
BEGIN
  actor := yawrd.creation_founder(_session);
  SELECT * INTO p FROM yawrd.creation_drafts WHERE network = 'testnet' AND id = _id AND founder_account_id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creation_not_found'; END IF;
  PERFORM yawrd.creation_founder(_session); -- recheck after the Creation lock wait
  IF _expected IS NULL OR p.revision <> _expected THEN RAISE EXCEPTION 'creation_revision_conflict'; END IF;
  IF (_intake IS NULL) = (_config IS NULL) THEN RAISE EXCEPTION 'invalid_creation_input'; END IF;
  IF _intake IS NOT NULL THEN
    IF (_intake->>'draftId') IS DISTINCT FROM p.source_draft_id THEN RAISE EXCEPTION 'creation_draft_identity_conflict'; END IF;
    IF p.intake IS DISTINCT FROM _intake THEN
      UPDATE yawrd.creation_drafts SET intake = _intake WHERE id = _id RETURNING * INTO p;
    END IF;
  ELSE
    IF _config->>'secondSteward' = actor THEN RAISE EXCEPTION 'invalid_creation_configuration'; END IF;
    IF ROW(p.public_name,p.public_description,p.account_label,p.second_steward,p.threshold)
      IS DISTINCT FROM ROW(_config->>'publicName',_config->>'publicDescription',_config->>'accountLabel',_config->>'secondSteward',(_config->>'threshold')::smallint) THEN
      UPDATE yawrd.creation_drafts SET public_name = _config->>'publicName',public_description = _config->>'publicDescription',
        account_label = _config->>'accountLabel',second_steward = _config->>'secondSteward',threshold = (_config->>'threshold')::smallint
        WHERE id = _id RETURNING * INTO p;
    END IF;
  END IF;
  RETURN NEXT p;
END;
$$;
CREATE FUNCTION yawrd.creation_review_public_text(_session text, _id text, _expected bigint, _digest text, _consent text)
RETURNS SETOF yawrd.creation_drafts LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, yawrd AS $$
DECLARE actor text; p yawrd.creation_drafts;
BEGIN
  actor := yawrd.creation_founder(_session);
  SELECT * INTO p FROM yawrd.creation_drafts WHERE network = 'testnet' AND id = _id AND founder_account_id = actor FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'creation_not_found'; END IF;
  PERFORM yawrd.creation_founder(_session);
  IF _expected IS NULL OR p.revision <> _expected THEN RAISE EXCEPTION 'creation_revision_conflict'; END IF;
  IF _digest IS DISTINCT FROM p.public_text_digest OR _consent IS DISTINCT FROM 'creation-public-text-v1' THEN RAISE EXCEPTION 'public_text_review_conflict'; END IF;
  IF p.public_name ~ '^[[:space:]]*$' OR p.public_description ~ '^[[:space:]]*$' THEN RAISE EXCEPTION 'public_text_required'; END IF;
  IF p.reviewed_revision IS NULL THEN
    UPDATE yawrd.creation_drafts SET reviewed_revision = revision,reviewed_public_text_digest = public_text_digest,
      public_text_consent_version = _consent,public_text_reviewed_at = clock_timestamp() WHERE id = _id RETURNING * INTO p;
  END IF;
  RETURN NEXT p;
END;
$$;

-- PostgreSQL defaults new functions to PUBLIC EXECUTE. Close every new function.
REVOKE ALL ON FUNCTION yawrd.creation_text_digest(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_founder(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_find_start(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_start(text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_read(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_list(text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_save(text,text,bigint,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION yawrd.creation_review_public_text(text,text,bigint,text,text) FROM PUBLIC;
-- C2 schema/field validation lives in the trusted server adapter. These functions
-- enforce storage/identity/ownership/revisions but do not validate the entire C2
-- JSON schema. No role or grant is approved here; INVOKER requires underlying table
-- privileges and cannot protect against a compromised runtime/DB owner. Review
-- quotas/rate limits and real PostgreSQL races/rollback/roles before activation.
