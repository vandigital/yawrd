// Explicit owner-operated development schema activation. No project insertion.
// Importing this module neither loads credentials nor connects to a database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { developmentTargets, verifyDatabase } from './verify-database.mjs';

const endpoint = 'ep-twilight-voice-aorpfrbm';
const version = '003_genesis_draft_linking.sql';
const expectedChecksum = 'ab6b41b1e54660f65835e5f078e990d3ed257d004ac490642588c6ff412fb676';
const runtimeRole = 'yawrd_07b_runtime';
const insertColumns = ['network', 'id', 'creator_account_id', 'dao_account_id', 'name', 'description', 'objectives', 'participation', 'rewards'];
const literal = value => `'${value.replace(/'/g, "''")}'`;
const checksum = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.replace(/\s+/g, ' ').trim();

export function activationTargets(env = process.env) {
  assert.equal(env.YAWRD_DEV_DATABASE_ENDPOINT, endpoint, 'Only the authorized development endpoint is allowed');
  return developmentTargets(env);
}

export async function activateGenesisDevelopment(createClient, env = process.env) {
  const { ownerUrl, runtimeUrl } = activationTargets(env);
  const [baseSource, migration] = await Promise.all([
    readFile(new URL('../migrations/001_participants.sql', import.meta.url), 'utf8'),
    readFile(new URL(`../migrations/${version}`, import.meta.url), 'utf8'),
  ]);
  assert.equal(checksum(migration), expectedChecksum, 'Migration 003 checksum differs from the accepted version');
  assert.ok(!migration.includes('$yawrd_migration$'), 'Reserved migration delimiter');
  const baseBody = baseSource.match(/CREATE FUNCTION yawrd\.protect_creator\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$/)?.[1];
  assert.ok(baseBody, 'Reviewed migration 001 identity function missing');
  const sql = createClient(ownerUrl);
  const runtimeSql = createClient(runtimeUrl);
  const preflight = await verifyDatabase(sql, runtimeSql);
  assert.equal(preflight.genesis.associations, 0, 'Genesis project already exists; no schema activation will be attempted');
  const result = status => ({ status, endpoint, database: 'neondb', migration: version,
    checksum: expectedChecksum, runtimeInsertColumns: insertColumns, projectInserted: false, published: false });
  if (preflight.genesis.migration === 'applied') {
    assert.equal(preflight.genesis.runtimeInsert, 'enabled', 'Recorded 003 is missing its authorized grant; owner review required');
    return result('already_applied');
  }
  assert.equal(preflight.genesis.migration, 'pending');
  assert.equal(preflight.genesis.runtimeInsert, 'disabled');

  // Use the established migration lock, dollar delimiter, ledger version/checksum
  // and ledger timestamp default. Never create or repair a missing base schema.
  await sql.transaction([
    sql.query("SET LOCAL lock_timeout = '5s'"),
    sql.query("SET LOCAL statement_timeout = '30s'"),
    sql.query('SELECT pg_advisory_xact_lock(707071)'),
    sql.query(`DO $yawrd_migration$
    BEGIN
      IF current_database() <> 'neondb' OR current_user <> 'neondb_owner' THEN
        RAISE EXCEPTION 'yawrd_003_wrong_database_or_owner';
      END IF;
      LOCK TABLE public.yawrd_migrations IN SHARE ROW EXCLUSIVE MODE;
      LOCK TABLE yawrd.projects IN ACCESS EXCLUSIVE MODE;
      IF NOT EXISTS (SELECT 1 FROM public.yawrd_migrations
        WHERE version = '001_participants.sql' AND checksum = ${literal(checksum(baseSource))}) THEN
        RAISE EXCEPTION 'yawrd_003_base_migration_mismatch';
      END IF;
      IF EXISTS (SELECT 1 FROM public.yawrd_migrations WHERE version = ${literal(version)} AND checksum <> ${literal(expectedChecksum)}) THEN
        RAISE EXCEPTION 'yawrd_003_recorded_checksum_mismatch';
      END IF;
      IF EXISTS (SELECT 1 FROM public.yawrd_migrations WHERE version = ${literal(version)}) THEN
        RAISE EXCEPTION 'yawrd_003_state_changed_repeat_preflight';
      END IF;
      IF EXISTS (SELECT 1 FROM public.yawrd_migrations WHERE version <> '001_participants.sql')
        OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='yawrd.projects'::regclass AND attname='dao_account_id' AND NOT attisdropped)
        OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='yawrd.projects'::regclass AND conname IN ('project_dao_unique','project_dao_account_id'))
        OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='yawrd.protect_creator()'::regprocedure
          AND btrim(regexp_replace(prosrc, '[[:space:]]+', ' ', 'g')) = ${literal(normalize(baseBody))})
        OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='yawrd.projects'::regclass
          AND tgname='immutable_project_identity' AND tgfoid='yawrd.protect_creator()'::regprocedure AND tgenabled='O') THEN
        RAISE EXCEPTION 'yawrd_003_schema_state_mismatch';
      END IF;
      IF EXISTS (SELECT 1 FROM yawrd.projects WHERE network='testnet' AND id='yaw-001') THEN
        RAISE EXCEPTION 'yawrd_003_genesis_project_exists';
      END IF;
      IF EXISTS (SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p(permission)
          WHERE has_table_privilege('${runtimeRole}', 'yawrd.projects', p.permission))
        OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='yawrd.projects'::regclass AND attnum>0 AND NOT attisdropped
          AND (has_column_privilege('${runtimeRole}', 'yawrd.projects', attname, 'INSERT')
            OR has_column_privilege('${runtimeRole}', 'yawrd.projects', attname, 'UPDATE'))) THEN
        RAISE EXCEPTION 'yawrd_003_runtime_project_permissions_mismatch';
      END IF;

      ${migration}
      GRANT INSERT (${insertColumns.join(', ')}) ON yawrd.projects TO ${runtimeRole};
      INSERT INTO public.yawrd_migrations(version, checksum) VALUES (${literal(version)}, ${literal(expectedChecksum)});

      IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='yawrd.projects'::regclass AND attnum>0 AND NOT attisdropped
        AND (has_column_privilege('${runtimeRole}', 'yawrd.projects', attname, 'INSERT') IS DISTINCT FROM
          (attname::text = ANY(ARRAY[${insertColumns.map(literal).join(', ')}]))
          OR has_column_privilege('${runtimeRole}', 'yawrd.projects', attname, 'UPDATE')))
        OR EXISTS (SELECT 1 FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p(permission)
          WHERE has_table_privilege('${runtimeRole}', 'yawrd.projects', p.permission)) THEN
        RAISE EXCEPTION 'yawrd_003_runtime_postcondition_failed';
      END IF;
    END;
    $yawrd_migration$`),
  ], { fetchOptions: { cache: 'no-store', signal: AbortSignal.timeout(45000) } });
  return result('applied');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.argv.length, 2, 'This command accepts no migration selection or override arguments');
    await import('./load-migration-environment.mjs');
    const { neon } = await import('@neondatabase/serverless');
    console.log(JSON.stringify(await activateGenesisDevelopment(neon), null, 2));
  } catch (error) {
    const reason = typeof error?.message === 'string' && /^yawrd_003_[a-z_]+$/.test(error.message) ? error.message : 'activation_stopped';
    console.error(JSON.stringify({ status: 'stopped', reason,
      recovery: 'Do not assume rollback after a connection failure. Run the read-only development verifier before retrying. No project insertion or publication is performed by this command.' }));
    process.exitCode = 1;
  }
}
