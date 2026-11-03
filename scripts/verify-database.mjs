// Explicit, read-only catalog verification on the owner-confirmed dev endpoint.
// Importing for offline tests does not load credentials or connect.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { developmentDatabaseUrl, developmentMigrationDatabaseUrl } from '../src/participants/database-config.ts';
import { GENESIS_YAW_001 as genesis, matchesGenesisIdentity, matchesGenesisProject } from '../src/genesis/yaw-001.ts';

const runtimeRole = 'yawrd_07b_runtime';
const baseVersion = '001_participants.sql';
const genesisVersion = '003_genesis_draft_linking.sql';
const genesisChecksum = 'ab6b41b1e54660f65835e5f078e990d3ed257d004ac490642588c6ff412fb676';
const expectedTables = ['applications', 'auth_challenges', 'auth_rate_limits', 'projects', 'restricted_content', 'review_decisions', 'sessions'];
const expectedTriggers = ['creator_review', 'immutable_applications', 'immutable_decisions', 'immutable_project_identity'];
const insertColumns = ['network', 'id', 'creator_account_id', 'dao_account_id', 'name', 'description', 'objectives', 'participation', 'rewards'];
const permissions = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const insertTables = ['applications', 'review_decisions', 'auth_challenges', 'sessions', 'auth_rate_limits'];
const updateColumns = { auth_challenges: ['consumed_at'], sessions: ['revoked_at'], auth_rate_limits: ['attempts', 'resets_at'] };
const normalize = value => value.replace(/\s+/g, ' ').trim();
const checksum = value => createHash('sha256').update(value).digest('hex');
const readOnly = () => ({ readOnly: true, fetchOptions: { cache: 'no-store', signal: AbortSignal.timeout(30000) } });

export function developmentTargets(env = process.env) {
  const ownerUrl = developmentMigrationDatabaseUrl(env);
  const runtimeUrl = developmentDatabaseUrl(env);
  const owner = new URL(ownerUrl), runtime = new URL(runtimeUrl);
  for (const [url, role] of [[owner, 'neondb_owner'], [runtime, runtimeRole]]) {
    assert.equal(decodeURIComponent(url.username), role, 'Unexpected development connection role');
    assert.ok(url.password && url.pathname === '/neondb' && (!url.port || url.port === '5432') && !url.hash, 'Unexpected development database or port');
    for (const key of url.searchParams.keys()) {
      assert.ok(['sslmode', 'channel_binding', 'connect_timeout', 'application_name'].includes(key), 'Unexpected connection override');
      assert.equal(url.searchParams.getAll(key).length, 1, 'Duplicate connection override');
    }
  }
  assert.equal(owner.hostname.replace(/-pooler(?=\.)/, ''), runtime.hostname.replace(/-pooler(?=\.)/, ''), 'Development connection targets differ');
  return { ownerUrl, runtimeUrl };
}

export async function verifyDatabase(ownerSql, runtimeSql, { requireGenesisLinking = false, genesisPublication = false } = {}) {
  const [baseSource, genesisSource] = await Promise.all([baseVersion, genesisVersion].map(file => readFile(new URL(`../migrations/${file}`, import.meta.url))));
  assert.equal(checksum(genesisSource), genesisChecksum, 'Genesis migration differs from the verified draft');
  const [ownerRows, runtimeRows] = await Promise.all([
    ownerSql.transaction([
      ownerSql.query("SELECT table_name FROM information_schema.tables WHERE table_schema='yawrd' ORDER BY table_name"),
      ownerSql.query("SELECT t.tgname,t.tgenabled FROM pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='yawrd'::regnamespace) AND NOT t.tgisinternal ORDER BY t.tgname"),
      ownerSql.query("SELECT contype, count(*)::int AS count, bool_and(convalidated) AS validated FROM pg_constraint WHERE connamespace='yawrd'::regnamespace GROUP BY contype ORDER BY contype"),
      ownerSql.query('SELECT version, checksum FROM public.yawrd_migrations ORDER BY version'),
      ownerSql.query(`SELECT current_database()='neondb' AS expected_database,
        current_user='neondb_owner' AS expected_owner,
        current_setting('transaction_read_only')='on' AS read_only_transaction,
        has_schema_privilege(current_user, 'yawrd', 'CREATE') AS can_create,
        has_table_privilege(current_user, 'yawrd.projects', 'INSERT') AS can_insert_projects,
        has_table_privilege(current_user, 'yawrd.projects', 'UPDATE') AS can_update_projects,
        has_table_privilege(current_user, 'yawrd.applications', 'TRUNCATE') AS can_truncate_applications,
        current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='yawrd.projects'::regclass) AS owns_projects,
        current_user=(SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='yawrd.protect_creator()'::regprocedure) AS owns_identity_function,
        has_table_privilege(current_user,'public.yawrd_migrations','INSERT') AS can_record_migrations`),
      ownerSql.query("SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='yawrd' AND table_name='projects' ORDER BY ordinal_position"),
      ownerSql.query("SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='yawrd.projects'::regclass"),
      ownerSql.query("SELECT prosrc FROM pg_proc WHERE oid='yawrd.protect_creator()'::regprocedure"),
      ownerSql.query(`SELECT id,network,creator_account_id,name,description,objectives,participation,rewards,published_at,
        to_jsonb(p)->>'dao_account_id' AS dao_account_id FROM yawrd.projects p
        WHERE network='testnet' AND (id=$1 OR to_jsonb(p)->>'dao_account_id'=$2)`, [genesis.id, genesis.daoAccountId]),
    ], readOnly()),
    runtimeSql.transaction([
      runtimeSql.query(`SELECT current_database()='neondb' AS expected_database,
        current_setting('transaction_read_only')='on' AS read_only_transaction,
        current_user=$1 AS expected_runtime,rolcanlogin,
        NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) AS restricted,
        NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS no_memberships,
        NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner=r.oid) AS owns_no_relations,
        NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner=r.oid) AS owns_no_functions,
        has_schema_privilege(current_user,'yawrd','USAGE') AS schema_usage,
        NOT has_schema_privilege(current_user,'yawrd','CREATE') AS no_schema_create,
        NOT has_schema_privilege(current_user,'public','CREATE') AS no_public_create,
        NOT has_database_privilege(current_user,current_database(),'CREATE') AS no_database_create,
        NOT has_database_privilege(current_user,current_database(),'TEMP') AS no_temporary_objects
        FROM pg_roles r WHERE rolname=current_user`, [runtimeRole]),
      runtimeSql.query("SELECT t.table_name,p.permission,has_table_privilege(current_user,format('%I.%I',t.table_schema,t.table_name),p.permission) AS allowed FROM information_schema.tables t CROSS JOIN unnest($1::text[]) AS p(permission) WHERE t.table_schema='yawrd' AND t.table_name=ANY($2::text[])", [permissions, expectedTables]),
      runtimeSql.query("SELECT table_name,column_name,has_column_privilege(current_user,format('%I.%I',table_schema,table_name),column_name,'INSERT') AS ins,has_column_privilege(current_user,format('%I.%I',table_schema,table_name),column_name,'UPDATE') AS upd FROM information_schema.columns WHERE table_schema='yawrd' AND table_name=ANY($1::text[])", [expectedTables]),
    ], readOnly()),
  ]);
  const [tables, triggers, constraints, ledger, role, columns, projectConstraints, identityFunction, candidates] = ownerRows;
  const [runtimeIdentity, tableGrants, columnGrants] = runtimeRows;
  assert.deepEqual(tables.map(row => row.table_name), expectedTables);
  assert.deepEqual(triggers.map(row => row.tgname), expectedTriggers);
  assert.ok(triggers.every(row => row.tgenabled === 'O'), 'Participant/identity trigger disabled');
  assert.ok(constraints.length && constraints.every(row => row.validated), 'Unvalidated constraints');
  assert.equal(role[0].expected_database, true);
  assert.equal(role[0].read_only_transaction, true);
  assert.equal(role[0].expected_owner, true, 'Wrong development owner connection');
  for (const field of ['can_create', 'owns_projects', 'owns_identity_function', 'can_record_migrations']) assert.equal(role[0][field], true, `Owner lacks ${field}`);
  assert.ok(ledger.length === 1 || ledger.length === 2, 'Unexpected migration ledger');
  assert.equal(ledger[0].version, baseVersion);
  assert.equal(ledger[0].checksum, checksum(baseSource), 'Migration 001 checksum mismatch');
  const applied = ledger.length === 2;
  if (genesisPublication) assert.ok(applied, 'Genesis publication requires migration 003');
  if (applied) {
    assert.equal(ledger[1].version, genesisVersion, 'Unreviewed migration in ledger');
    assert.equal(ledger[1].checksum, genesisChecksum, 'Migration 003 checksum mismatch');
  }
  const requiredColumns = ['network', 'id', 'creator_account_id', 'name', 'description', 'objectives', 'participation', 'rewards', 'published_at', 'created_at'];
  for (const name of requiredColumns) assert.ok(columns.some(c => c.column_name === name), `Missing project column ${name}`);
  const published = columns.find(c => c.column_name === 'published_at');
  assert.ok(published.is_nullable === 'YES' && published.column_default === null, 'Publication default is not NULL');
  const dao = columns.find(c => c.column_name === 'dao_account_id');
  assert.equal(Boolean(dao), applied, 'Migration 003 schema/ledger mismatch; reconcile without replaying 001');
  const pk = projectConstraints.find(c => c.contype === 'p');
  assert.equal(pk && normalize(pk.definition), 'PRIMARY KEY (network, id)');
  assert.ok(projectConstraints.every(c => c.convalidated), 'Unvalidated project constraint');
  if (applied) {
    assert.ok(dao.data_type === 'text' && dao.is_nullable === 'YES' && dao.column_default === null, 'DAO column mismatch');
    const unique = projectConstraints.find(c => c.conname === 'project_dao_unique');
    assert.ok(unique && unique.contype === 'u' && normalize(unique.definition) === 'UNIQUE (network, dao_account_id)', 'DAO uniqueness mismatch');
    const check = projectConstraints.find(c => c.conname === 'project_dao_account_id');
    assert.ok(check && check.contype === 'c' && check.definition.includes('dao_account_id IS NULL') && check.definition.includes('^[a-z0-9]+([._-][a-z0-9]+)*$')
      && /length\(dao_account_id\)\s*>=\s*2/.test(check.definition) && /length\(dao_account_id\)\s*<=\s*64/.test(check.definition), 'DAO account constraint mismatch');
  } else {
    assert.ok(!projectConstraints.some(c => ['project_dao_unique', 'project_dao_account_id'].includes(c.conname)), 'Pending migration has DAO constraints');
  }
  const functionSource = (applied ? genesisSource : baseSource).toString().match(/CREATE (?:OR REPLACE )?FUNCTION yawrd\.protect_creator\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$/)?.[1];
  assert.ok(functionSource && identityFunction.length === 1 && normalize(identityFunction[0].prosrc) === normalize(functionSource), 'Project identity/DAO immutability function mismatch');
  assert.equal(runtimeIdentity.length, 1, 'Missing runtime role');
  assert.ok(Object.values(runtimeIdentity[0]).every(value => value === true), 'Runtime identity, ownership or DDL privileges mismatch');
  const actualProjectColumns = columnGrants.filter(c => c.table_name === 'projects');
  assert.deepEqual(actualProjectColumns.map(c => c.column_name).sort(), columns.map(c => c.column_name).sort(), 'Incomplete runtime project column catalog');
  const inserted = actualProjectColumns.filter(c => c.ins).map(c => c.column_name).sort();
  const enabled = applied && inserted.length === insertColumns.length;
  assert.deepEqual(inserted, enabled ? [...insertColumns].sort() : [], 'Partial or excessive project INSERT grants');
  for (const table of expectedTables) {
    const grants = tableGrants.filter(row => row.table_name === table);
    assert.equal(grants.length, permissions.length, 'Incomplete runtime table catalog');
    for (const permission of permissions) {
      const grant = grants.find(row => row.permission === permission);
      assert.ok(grant, 'Missing runtime table permission');
      assert.equal(grant.allowed, permission === 'SELECT' || (permission === 'INSERT' && insertTables.includes(table)), `Unexpected ${table} ${permission}`);
    }
    const tableColumns = columnGrants.filter(c => c.table_name === table);
    const updates = genesisPublication && table === 'projects' ? ['published_at'] : updateColumns[table] ?? [];
    assert.ok(tableColumns.length && updates.every(name => tableColumns.some(c => c.column_name === name)), 'Incomplete runtime column catalog');
    for (const c of tableColumns) {
      assert.equal(c.ins, table === 'projects' ? enabled && insertColumns.includes(c.column_name) : insertTables.includes(table), `Unexpected ${table}.${c.column_name} INSERT`);
      assert.equal(c.upd, updates.includes(c.column_name), `Unexpected ${table}.${c.column_name} UPDATE`);
    }
  }
  const matches = row => genesisPublication
    ? matchesGenesisIdentity(row) && (row.published_at === null
      || ((typeof row.published_at === 'string' || row.published_at instanceof Date) && Number.isFinite(new Date(row.published_at).getTime())))
    : matchesGenesisProject(row);
  assert.ok(candidates.length <= 1 && (candidates.length === 0 || (applied && matches(candidates[0]))), 'Genesis project identity, DAO or publication conflict');
  const isPublished = candidates.length === 1 && candidates[0].published_at !== null;
  if (requireGenesisLinking) assert.ok(applied && enabled, 'Genesis migration/runtime INSERT grants are not ready');
  return {
    status: 'passed', tables: tables.map(row => row.table_name), triggers: triggers.map(row => row.tgname), constraints,
    migration: { version: baseVersion, checksumMatches: true },
    genesis: { migration: applied ? 'applied' : 'pending', checksumMatches: applied ? true : null, runtimeInsert: enabled ? 'enabled' : 'disabled',
      project: candidates.length ? (isPublished ? 'canonical_published' : 'canonical_unpublished') : 'absent', associations: candidates.length,
      canonicalUnpublished: isPublished ? 0 : candidates.length, linkingAvailable: applied && enabled && !isPublished,
      ...(genesisPublication ? { canonicalPublished: isPublished ? 1 : 0, publishedAt: isPublished ? new Date(candidates[0].published_at).toISOString() : null,
        runtimeUpdate: 'published_at_only', publicationAvailable: candidates.length === 1 && !isPublished } : {}) },
    runtimeSecurity: 'passed', role: role[0],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await import('./load-migration-environment.mjs');
    const { neon } = await import('@neondatabase/serverless');
    const { ownerUrl, runtimeUrl } = developmentTargets();
    const result = await verifyDatabase(neon(ownerUrl), neon(runtimeUrl), {
      requireGenesisLinking: process.env.YAWRD_ENABLE_GENESIS_DRAFT_LINKING === '1',
      genesisPublication: process.env.YAWRD_ENABLE_GENESIS_PUBLICATION === '1',
    });
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.error('Development database catalog verification failed; connection, project and credential details suppressed. No changes made.');
    process.exitCode = 1;
  }
}
