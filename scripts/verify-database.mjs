// Explicit, read-only catalog verification on the owner-confirmed dev endpoint.
import './load-migration-environment.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { developmentMigrationDatabaseUrl } from '../src/participants/database-config.ts';

try {
  const sql = neon(developmentMigrationDatabaseUrl());
  const [tables, triggers, constraints, ledger, role] = await sql.transaction([
    sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema='yawrd' ORDER BY table_name"),
    sql.query("SELECT tgname FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='yawrd'::regnamespace) AND NOT tgisinternal ORDER BY tgname"),
    sql.query("SELECT contype, count(*)::int AS count, bool_and(convalidated) AS validated FROM pg_constraint WHERE connamespace='yawrd'::regnamespace GROUP BY contype ORDER BY contype"),
    sql.query('SELECT version, checksum FROM public.yawrd_migrations ORDER BY version'),
    sql.query(`SELECT current_database()='neondb' AS expected_database,
      current_setting('transaction_read_only')='on' AS read_only_transaction,
      has_schema_privilege(current_user, 'yawrd', 'CREATE') AS can_create,
      has_table_privilege(current_user, 'yawrd.projects', 'INSERT') AS can_insert_projects,
      has_table_privilege(current_user, 'yawrd.projects', 'UPDATE') AS can_update_projects,
      has_table_privilege(current_user, 'yawrd.applications', 'TRUNCATE') AS can_truncate_applications`),
  ], { readOnly: true });
  assert.deepEqual(tables.map(row => row.table_name), ['applications', 'auth_challenges', 'auth_rate_limits', 'projects', 'restricted_content', 'review_decisions', 'sessions']);
  assert.deepEqual(triggers.map(row => row.tgname), ['creator_review', 'immutable_applications', 'immutable_decisions', 'immutable_project_identity']);
  assert.ok(constraints.every(row => row.validated));
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].version, '001_participants.sql');
  const source = await readFile(new URL('../migrations/001_participants.sql', import.meta.url));
  assert.equal(ledger[0].checksum, createHash('sha256').update(source).digest('hex'));
  assert.equal(role[0].expected_database, true);
  assert.equal(role[0].read_only_transaction, true);
  console.log(JSON.stringify({ status: 'passed', tables: tables.map(row => row.table_name), triggers: triggers.map(row => row.tgname), constraints, migration: { version: ledger[0].version, checksumMatches: true }, role: role[0] }, null, 2));
} catch {
  console.error('Development database catalog verification failed; connection and database details suppressed.');
  process.exitCode = 1;
}
