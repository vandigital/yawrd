-- Read-only catalog assertions; no fee/Creation/session fixture writes.
-- Included in the same installation transaction; a failure rolls it all back.
DO $$
DECLARE count_functions integer; public_grants integer;
BEGIN
  IF current_database()<>'neondb' THEN RAISE EXCEPTION 'development_database_required'; END IF;
  SELECT count(*) INTO count_functions FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='yawrd' AND NOT p.prosecdef AND has_function_privilege('yawrd_07b_runtime',p.oid,'EXECUTE') AND p.proname IN ('creation_fee_guard','creation_fee_lock',
      'creation_fee_review','creation_fee_read','creation_fee_open','creation_fee_claim','creation_fee_note','creation_fee_complete');
  IF count_functions<>8 THEN RAISE EXCEPTION 'fee_function_contract_missing'; END IF;
  SELECT count(*) INTO public_grants FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
    LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE n.nspname='yawrd' AND p.proname LIKE 'creation_fee_%' AND a.grantee=0 AND a.privilege_type='EXECUTE';
  IF public_grants<>0 THEN RAISE EXCEPTION 'fee_public_execute_forbidden'; END IF;
  IF NOT has_table_privilege('yawrd_07b_runtime','yawrd.creation_platform_fees','SELECT')
    OR NOT has_column_privilege('yawrd_07b_runtime','yawrd.creation_platform_fees','evidence','UPDATE')
    OR NOT has_function_privilege('yawrd_07b_runtime','yawrd.creation_fee_complete(text,text,bigint,jsonb)','EXECUTE')
    OR NOT has_function_privilege('yawrd_07b_runtime','yawrd.creation_deployment_lock(text,text,bigint)','EXECUTE')
    OR has_table_privilege('yawrd_07b_runtime','yawrd.creation_platform_fees','DELETE')
    OR has_table_privilege('yawrd_07b_runtime','yawrd.creation_platform_fees','TRUNCATE')
    OR has_column_privilege('yawrd_07b_runtime','yawrd.creation_platform_fees','request','UPDATE')
    OR has_column_privilege('yawrd_07b_runtime','yawrd.creation_platform_fees','founder_account_id','UPDATE')
    THEN RAISE EXCEPTION 'fee_runtime_privileges_incorrect'; END IF;
END $$;
SELECT 'PASS: P3.4 table, invoker functions and restricted grants installed. Wallet activation remains separate.' AS result;
