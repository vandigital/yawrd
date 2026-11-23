-- ADDITIVE DEVELOPMENT PROPOSAL ONLY. DO NOT EXECUTE AUTOMATICALLY.
-- Install after phase2_creation_preparation.sql and
-- phase2_creation_preparation_generation.sql, in the same owner-controlled
-- Development transaction. Historical accepted migrations remain unchanged.
DO $$ BEGIN
  IF current_database()<>'neondb' OR current_user='yawrd_07b_runtime' THEN
    RAISE EXCEPTION 'development_installation_target_required';
  END IF;
  IF to_regclass('yawrd.creation_preparation_attempts') IS NULL
    OR to_regprocedure('yawrd.creation_preparation_reserve(text,text,uuid,bigint,text,text,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'preparation_generation_installation_required';
  END IF;
END $$;

CREATE FUNCTION yawrd.creation_intake_preparation_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,yawrd AS $$
BEGIN
  -- UPDATE already holds the Creation row lock. creation_save additionally takes
  -- that lock before its existing owner/session/CAS checks. Reservation takes the
  -- same lock through creation_preparation_access -> creation_fee_lock ->
  -- creation_deployment_lock. At the runtime's READ COMMITTED isolation, this
  -- VOLATILE trigger sees reservations committed before a waiting save proceeds.
  -- Every attempt consumes the initial source, including failed/unknown attempts.
  IF EXISTS(SELECT 1 FROM yawrd.creation_preparation_attempts WHERE creation_id=OLD.id) THEN
    RAISE EXCEPTION 'creation_intake_locked';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER guard_creation_intake_preparation BEFORE UPDATE ON yawrd.creation_drafts
  FOR EACH ROW WHEN (OLD.intake IS DISTINCT FROM NEW.intake)
  EXECUTE FUNCTION yawrd.creation_intake_preparation_guard();

REVOKE ALL ON FUNCTION yawrd.creation_intake_preparation_guard() FROM PUBLIC;
-- No new runtime grant: the trigger runs with the existing trusted server role.
-- No replacement of creation_save, public configuration guard, deployment or fee
-- operations. A rejected statement preserves intake, revision and review fields.
-- No allowance reset, automatic recovery, backfill, or existing-row mutation.
