-- INACTIVE DRAFT. No database execution is authorized by Activation Unit 1.
-- 002 is reserved by deferred Blueprint Preparation work in the preserved checkout.
-- Keep outside migrations/ until separately reviewed and authorized.
ALTER TABLE yawrd.projects
  ADD COLUMN dao_account_id text,
  ADD CONSTRAINT project_dao_account_id CHECK (
    dao_account_id IS NULL OR (
      dao_account_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
      AND length(dao_account_id) BETWEEN 2 AND 64
    )
  ),
  ADD CONSTRAINT project_dao_unique UNIQUE (network, dao_account_id);

-- Existing rows retain NULL; ordinary UNIQUE permits multiple NULL associations.
-- Replace the function behind the existing trigger, preserving its old guards.
CREATE OR REPLACE FUNCTION yawrd.protect_creator() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.network IS DISTINCT FROM OLD.network OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.creator_account_id IS DISTINCT FROM OLD.creator_account_id
    OR NEW.dao_account_id IS DISTINCT FROM OLD.dao_account_id THEN
    RAISE EXCEPTION 'immutable_project_identity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- No grants here. Reviewed column-level INSERT configuration is a separate,
-- explicit operator action. No project UPDATE or publication permission is added.
