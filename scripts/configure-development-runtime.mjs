// Explicit operator command for the already owner-confirmed development branch.
// Secrets are handled only in memory and in the ignored root environment file.
import './load-migration-environment.mjs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { databaseUrl, developmentDatabaseUrl } from '../src/participants/database-config.ts';

const role = 'yawrd_07b_runtime';
try {
  assert.equal(process.env.YAWRD_DEV_DATABASE_ENDPOINT, 'ep-twilight-voice-aorpfrbm');
  assert.equal(process.env.YAWRD_ACCEPTANCE_ORIGIN, 'http://localhost:3000');
  const owner = process.env.YAWRD_MIGRATION_DATABASE_URL || databaseUrl();
  developmentDatabaseUrl({ DATABASE_URL: owner, YAWRD_DEV_DATABASE_ENDPOINT: process.env.YAWRD_DEV_DATABASE_ENDPOINT });
  const sql = neon(owner);
  const [target] = await sql.query("SELECT current_database()='neondb' AS expected, current_user <> $1 AS separate", [role]);
  assert.ok(target.expected && target.separate);
  const existing = await sql.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
  let runtime;
  const statements = [];
  if (existing.length) {
    runtime = new URL(databaseUrl());
    assert.equal(decodeURIComponent(runtime.username), role, 'Existing role requires its previously saved connection');
    assert.equal(runtime.hostname, new URL(owner).hostname);
    assert.equal(runtime.pathname, new URL(owner).pathname);
  } else {
    const password = randomBytes(36).toString('base64url');
    runtime = new URL(owner);
    runtime.username = role;
    runtime.password = password;
    // Both interpolated values are repository constants or base64url random
    // bytes, never request input. PostgreSQL role DDL cannot bind a password.
    statements.push(sql.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`));
  }
  const [memberships] = await sql.query('SELECT count(*)::int AS count FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=$1', [role]);
  assert.equal(memberships.count, 0);
  statements.push(
    // PUBLIC privileges are additive. These development-only defaults must not
    // let a restricted login create objects via the public schema or TEMP.
    sql.query('REVOKE CREATE, TEMPORARY ON DATABASE neondb FROM PUBLIC'),
    sql.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC'),
    sql.query(`REVOKE ALL ON SCHEMA yawrd FROM ${role}`),
    sql.query(`REVOKE ALL ON ALL TABLES IN SCHEMA yawrd FROM ${role}`),
    sql.query(`GRANT CONNECT ON DATABASE neondb TO ${role}`),
    sql.query(`GRANT USAGE ON SCHEMA yawrd TO ${role}`),
    sql.query(`GRANT SELECT ON yawrd.projects, yawrd.restricted_content, yawrd.applications, yawrd.review_decisions, yawrd.auth_challenges, yawrd.sessions, yawrd.auth_rate_limits TO ${role}`),
    sql.query(`GRANT INSERT ON yawrd.applications, yawrd.review_decisions, yawrd.auth_challenges, yawrd.sessions, yawrd.auth_rate_limits TO ${role}`),
    sql.query(`GRANT UPDATE (consumed_at) ON yawrd.auth_challenges TO ${role}`),
    sql.query(`GRANT UPDATE (revoked_at) ON yawrd.sessions TO ${role}`),
    sql.query(`GRANT UPDATE (attempts, resets_at) ON yawrd.auth_rate_limits TO ${role}`),
  );
  // Table REVOKE alone does not clear column grants from a prior opt-in.
  // Default remains SELECT-only; enabling this requires the separately applied
  // Genesis draft migration. A missing DAO column makes the grant fail closed.
  statements.push(sql.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='yawrd' AND table_name='projects' AND column_name='dao_account_id') THEN
      REVOKE INSERT (network, id, creator_account_id, dao_account_id, name, description, objectives, participation, rewards)
        ON yawrd.projects FROM yawrd_07b_runtime;
    END IF;
  END $$`));
  if (process.env.YAWRD_ENABLE_GENESIS_DRAFT_LINKING === '1') {
    statements.push(sql.query(`GRANT INSERT (network, id, creator_account_id, dao_account_id, name, description, objectives, participation, rewards)
      ON yawrd.projects TO yawrd_07b_runtime`));
  }
  await sql.transaction(statements);
  const runtimeSql = neon(runtime.toString());
  const [attributes] = await runtimeSql.query(`SELECT current_user=$1 AS expected, NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) AS restricted FROM pg_roles WHERE rolname=current_user`, [role]);
  assert.ok(attributes.expected && attributes.restricted);
  // Update only the required root settings, preserving unrelated values without
  // printing or copying them elsewhere. The app receives only DATABASE_URL.
  const migrationPath = new URL('../.env.migrations.local', import.meta.url);
  const migrationTemporary = new URL('../.env.migrations.local.tmp', import.meta.url);
  await writeFile(migrationTemporary, JSON.stringify({ YAWRD_MIGRATION_DATABASE_URL: owner }) + '\n', { mode: 0o600, flag: 'wx' });
  await chmod(migrationTemporary, 0o600);
  await rename(migrationTemporary, migrationPath);
  const path = new URL('../.env.local', import.meta.url);
  let source = await readFile(path, 'utf8');
  const settings = {
    DATABASE_URL: runtime.toString(), YAWRD_DATABASE_URL: null,
    YAWRD_MIGRATION_DATABASE_URL: null,
    YAWRD_DEV_DATABASE_ENDPOINT: 'ep-twilight-voice-aorpfrbm',
    YAWRD_APP_ORIGIN: 'http://localhost:3000', YAWRD_ALLOW_HTTP_LOCALHOST: '1',
  };
  for (const [name, value] of Object.entries(settings)) {
    source = source.replace(new RegExp(`^(?:export\\s+)?${name}\\s*=.*(?:\\r?\\n|$)`, 'gm'), '');
    if (value !== null) source += `\n${name}=${JSON.stringify(value)}\n`;
  }
  const temporary = new URL('../.env.local.runtime.tmp', import.meta.url);
  await writeFile(temporary, source, { mode: 0o600, flag: 'wx' });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
  console.log('Development runtime role and confirmed localhost origin configured; migration login retained separately. No credentials logged.');
} catch {
  console.error('Development configuration failed; secrets and database details suppressed. No production target is allowed.');
  process.exitCode = 1;
}
