import './load-environment.mjs';
import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';
import { developmentDatabaseUrl } from '../src/participants/database-config.ts';

export async function verifyRuntime(sql) {
  const [role] = await sql.query(`SELECT current_user='yawrd_07b_runtime' AS expected,
    NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) AS restricted,
    NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS no_memberships
    FROM pg_roles r WHERE rolname=current_user`);
  assert.ok(role.expected && role.restricted && role.no_memberships, 'Restricted runtime login required');
  const [privileges] = await sql.query(`SELECT
    has_schema_privilege(current_user,'yawrd','USAGE') AS schema_usage,
    NOT has_schema_privilege(current_user,'yawrd','CREATE') AS no_yawrd_create,
    NOT has_schema_privilege(current_user,'public','CREATE') AS no_public_create,
    NOT has_database_privilege(current_user,current_database(),'CREATE') AS no_database_create,
    NOT has_database_privilege(current_user,current_database(),'TEMP') AS no_temporary_objects,
    NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owns_no_relations,
    NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owns_no_functions`);
  assert.ok(Object.values(privileges).every(value => value === true), 'No runtime DDL privileges');
  const tables = {
    projects: ['SELECT'], restricted_content: ['SELECT'],
    applications: ['SELECT', 'INSERT'], review_decisions: ['SELECT', 'INSERT'],
    auth_challenges: ['SELECT', 'INSERT'], sessions: ['SELECT', 'INSERT'], auth_rate_limits: ['SELECT', 'INSERT'],
  };
  for (const [table, expected] of Object.entries(tables)) {
    for (const permission of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      const [row] = await sql.query('SELECT has_table_privilege(current_user,$1,$2) AS allowed', [`yawrd.${table}`, permission]);
      assert.equal(row.allowed, expected.includes(permission), `${table} ${permission}`);
    }
  }
  const columns = { auth_challenges: ['consumed_at'], sessions: ['revoked_at'], auth_rate_limits: ['attempts', 'resets_at'] };
  for (const [table, expected] of Object.entries(columns)) {
    const rows = await sql.query("SELECT column_name, has_column_privilege(current_user,table_schema||'.'||table_name,column_name,'UPDATE') AS allowed FROM information_schema.columns WHERE table_schema='yawrd' AND table_name=$1", [table]);
    assert.ok(rows.length);
    for (const row of rows) assert.equal(row.allowed, expected.includes(row.column_name), `${table}.${row.column_name} UPDATE`);
  }
  const denied = [
    ['create-schema', 'CREATE SCHEMA yawrd_07b_forbidden'],
    ['create-yawrd-table', 'CREATE TABLE yawrd.forbidden(id integer)'],
    ['create-public-table', 'CREATE TABLE public.yawrd_07b_forbidden(id integer)'],
    ['create-temporary-table', 'CREATE TEMPORARY TABLE yawrd_07b_forbidden(id integer)'],
    ['alter-schema', 'ALTER TABLE yawrd.projects ADD COLUMN forbidden integer'],
    ['disable-trigger', 'ALTER TABLE yawrd.review_decisions DISABLE TRIGGER creator_review'],
    ['create-role', 'CREATE ROLE yawrd_07b_forbidden NOLOGIN'],
    ['administer-role', 'ALTER ROLE yawrd_07b_runtime CREATEROLE'],
    ['assume-migration-role', 'SET ROLE neondb_owner'],
    ['grant-admin-membership', 'GRANT neon_superuser TO yawrd_07b_runtime'],
    ['read-migration-ledger', 'SELECT * FROM public.yawrd_migrations'],
    ['insert-project', "INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards) VALUES ('testnet','dev-forbidden','nobody.testnet','test','test','[]','test','test')"],
    ['update-project', "UPDATE yawrd.projects SET name=name WHERE false"],
    ['update-restricted-content', 'UPDATE yawrd.restricted_content SET content=content WHERE false'],
    ['update-application', 'UPDATE yawrd.applications SET introduction=introduction WHERE false'],
    ['delete-application', 'DELETE FROM yawrd.applications WHERE false'],
    ['update-decision', 'UPDATE yawrd.review_decisions SET decision=decision WHERE false'],
    ['delete-decision', 'DELETE FROM yawrd.review_decisions WHERE false'],
    ['truncate-applications', 'TRUNCATE yawrd.applications CASCADE'],
    ['change-session-identity', 'UPDATE yawrd.sessions SET account_id=account_id WHERE false'],
    ['extend-session', 'UPDATE yawrd.sessions SET expires_at=expires_at WHERE false'],
    ['change-challenge-message', 'UPDATE yawrd.auth_challenges SET message=message WHERE false'],
  ];
  for (const [label, statement] of denied) {
    let code;
    try {
      // Even an unexpected grant must never commit a destructive probe.
      await sql.transaction([sql.query(statement), sql.query("DO $$ BEGIN RAISE EXCEPTION 'probe_rollback'; END $$")]);
    } catch (error) { code = error?.code; }
    assert.equal(code, '42501', `${label} must fail with insufficient_privilege`);
  }
  return { role: 'yawrd_07b_runtime', tablePrivilegeChecks: 49, updateColumnAllowlist: 'passed', deniedOperations: denied.length, ddlAndRoleAdministration: 'denied' };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    const result = await verifyRuntime(neon(developmentDatabaseUrl()));
    console.log(JSON.stringify({ status: 'passed', ...result }, null, 2));
  } catch {
    console.error('Restricted development runtime verification failed; credentials and database details suppressed.');
    process.exitCode = 1;
  }
}
