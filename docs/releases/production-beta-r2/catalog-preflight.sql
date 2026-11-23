-- REVIEW ONLY: authorized operator runs against the independently confirmed target.
-- Catalog/privilege inventory only. No founder rows, secrets or mutation probes.
BEGIN READ ONLY;
SELECT current_database() AS database,current_user AS role,version() AS postgres;
SELECT n.nspname,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('yawrd','yawrd_publication') ORDER BY 1,2;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,p.prosecdef
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='yawrd_publication' OR (n.nspname='yawrd' AND p.proname LIKE 'creation_%') ORDER BY 1,2,3;
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
 FROM pg_roles WHERE rolname IN ('yawrd_07b_runtime','yawrd_publication_writer');
SELECT parent.rolname AS role,member.rolname AS member,m.admin_option,m.inherit_option,m.set_option
 FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
 WHERE parent.rolname IN ('yawrd_07b_runtime','yawrd_publication_writer') OR member.rolname IN ('yawrd_07b_runtime','yawrd_publication_writer');
SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants
 WHERE table_schema='yawrd_publication' OR (table_schema='yawrd' AND table_name LIKE 'creation_%') ORDER BY 1,2,3,4;
SELECT table_schema,table_name,column_name,grantee,privilege_type FROM information_schema.role_column_grants
 WHERE table_schema='yawrd_publication' OR (table_schema='yawrd' AND table_name LIKE 'creation_%') ORDER BY 1,2,3,4,5;
SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,r.rolname,
 has_function_privilege(r.oid,p.oid,'EXECUTE') AS effective_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles r
 WHERE n.nspname='yawrd_publication' AND r.rolname IN ('yawrd_07b_runtime','yawrd_publication_writer') ORDER BY 1,2,3,4;
ROLLBACK;
