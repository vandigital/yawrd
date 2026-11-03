import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyDatabase } from '../scripts/verify-database.mjs';
import { verifyRuntime } from '../scripts/verify-runtime.mjs';
import { GENESIS_YAW_001 as g } from '../src/genesis/yaw-001.ts';

// Offline catalog/probe doubles only: these do not establish PostgreSQL grants,
// row authorization or publication behavior. No environment loader is imported.
const permissions = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const insertColumns = ['network', 'id', 'creator_account_id', 'dao_account_id', 'name', 'description', 'objectives', 'participation', 'rewards'];
const updates = { auth_challenges: ['consumed_at'], sessions: ['revoked_at'], auth_rate_limits: ['attempts', 'resets_at'] };
const tableColumns = {
  applications: ['id', 'network', 'project_id', 'account_id', 'introduction', 'consent_version', 'consented_at', 'created_at'],
  auth_challenges: ['id', 'browser_hash', 'account_id', 'network', 'origin', 'message', 'recipient', 'nonce', 'issued_at', 'expires_at', 'consumed_at'],
  auth_rate_limits: ['account_id', 'attempts', 'resets_at'],
  projects: [...insertColumns, 'published_at', 'created_at'],
  restricted_content: ['network', 'project_id', 'content'],
  review_decisions: ['application_id', 'network', 'project_id', 'reviewer_account_id', 'decision', 'decided_at'],
  sessions: ['token_hash', 'challenge_id', 'network', 'account_id', 'public_key', 'block_height', 'block_hash', 'created_at', 'expires_at', 'revoked_at'],
};
const tables = Object.keys(tableColumns);
const inserts = tables.filter(table => !['projects', 'restricted_content'].includes(table));
const stamp = '2026-11-03T08:00:00.123Z';
const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
function canonical(published_at = null) {
  return { network: g.network, id: g.id, creator_account_id: g.creatorAccountId, dao_account_id: g.daoAccountId,
    name: g.name, description: g.description, objectives: [...g.objectives], participation: g.participation, rewards: g.rewards, published_at };
}

function fixture({ publication = false, insert = true, applied = true, rows = [] } = {}) {
  const base = source('migrations/001_participants.sql');
  const migration = source('migrations/003_genesis_draft_linking.sql');
  const columns = tableColumns.projects.filter(name => applied || name !== 'dao_account_id').map(column_name => ({
    column_name, data_type: column_name === 'objectives' ? 'jsonb' : 'text', is_nullable: 'YES', column_default: null,
  }));
  const tableGrants = tables.flatMap(table_name => permissions.map(permission => ({ table_name, permission,
    allowed: permission === 'SELECT' || (permission === 'INSERT' && inserts.includes(table_name)) })));
  const columnGrants = tables.flatMap(table_name => tableColumns[table_name].filter(name => applied || name !== 'dao_account_id').map(column_name => ({
    table_name, column_name,
    ins: table_name === 'projects' ? insert && insertColumns.includes(column_name) : inserts.includes(table_name),
    upd: (updates[table_name] ?? []).includes(column_name) || (publication && table_name === 'projects' && column_name === 'published_at'),
  })));
  const triggers = ['creator_review', 'immutable_applications', 'immutable_decisions', 'immutable_project_identity'];
  const ledger = [{ version: '001_participants.sql', checksum: sha(base) }];
  if (applied) ledger.push({ version: '003_genesis_draft_linking.sql', checksum: sha(migration) });
  const constraints = [{ contype: 'p', convalidated: true, definition: 'PRIMARY KEY (network, id)' }];
  if (applied) constraints.push(
    { conname: 'project_dao_unique', contype: 'u', convalidated: true, definition: 'UNIQUE (network, dao_account_id)' },
    { conname: 'project_dao_account_id', contype: 'c', convalidated: true,
      definition: 'CHECK (dao_account_id IS NULL OR (dao_account_id ~ \'^[a-z0-9]+([._-][a-z0-9]+)*$\' AND length(dao_account_id) >= 2 AND length(dao_account_id) <= 64))' },
  );
  const ownerRows = [tables.map(table_name => ({ table_name })), triggers.map(tgname => ({ tgname, tgenabled: 'O' })),
    [{ contype: 'p', count: 7, validated: true }], ledger,
    [{ expected_database: true, expected_owner: true, read_only_transaction: true, can_create: true, owns_projects: true, owns_identity_function: true, can_record_migrations: true }],
    columns, constraints, [{ prosrc: (applied ? migration : base).match(/CREATE (?:OR REPLACE )?FUNCTION yawrd\.protect_creator\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$/)[1] }], rows];
  const runtimeRows = [[{ expected_database: true, expected_runtime: true, read_only_transaction: true, restricted: true }], tableGrants, columnGrants];
  const queries = [];
  const sql = result => ({
    query(text, args) { assert.match(text, /^SELECT /); queries.push({ text, args }); return { text, args }; },
    async transaction(statements, options) {
      assert.equal(options.readOnly, true);
      assert.equal(statements.length, result.length);
      return result;
    },
  });
  return { owner: sql(ownerRows), runtime: sql(runtimeRows), tableGrants, columnGrants, rows, queries };
}
const verify = (f, options) => verifyDatabase(f.owner, f.runtime, options);

// Awaitable query descriptors model the driver's lazy transaction API. Denial
// probes are inspected, never executed; an unexpected success is also tested.
function runtimeDouble(f, unexpectedSuccess = false) {
  const probes = [];
  const sql = {
    query(text, args = []) {
      return { text, args, then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (text.includes('FROM pg_roles')) return [{ expected: true, restricted: true, no_memberships: true }];
          if (text.includes('AS schema_usage')) return [{ schema_usage: true, no_yawrd_create: true, no_public_create: true, no_database_create: true, no_temporary_objects: true, owns_no_relations: true, owns_no_functions: true }];
          if (text.includes('has_table_privilege')) return [{ allowed: f.tableGrants.find(row => `yawrd.${row.table_name}` === args[0] && row.permission === args[1]).allowed }];
          if (text.includes('has_column_privilege')) {
            const insert = text.includes("'INSERT'");
            const table = insert ? 'projects' : args[0];
            return f.columnGrants.filter(row => row.table_name === table).map(row => ({ column_name: row.column_name, allowed: insert ? row.ins : row.upd }));
          }
          assert.fail('Unexpected awaited SQL');
        }).then(resolve, reject);
      } };
    },
    async transaction(statements) {
      assert.equal(statements.length, 2);
      assert.match(statements[1].text, /RAISE EXCEPTION 'probe_rollback'/);
      probes.push(statements[0].text);
      throw Object.assign(new Error('offline probe result'), { code: unexpectedSuccess ? 'P0001' : '42501' });
    },
  };
  return { sql, probes };
}

test('default database mode preserves pending/applied migration and draft reporting', async () => {
  for (const applied of [false, true]) {
    const result = await verify(fixture({ applied, insert: applied }));
    assert.deepEqual(result.genesis, { migration: applied ? 'applied' : 'pending', checksumMatches: applied ? true : null,
      runtimeInsert: applied ? 'enabled' : 'disabled', project: 'absent', associations: 0, canonicalUnpublished: 0, linkingAvailable: applied });
  }
  const result = await verify(fixture({ rows: [canonical()] }), { requireGenesisLinking: true });
  assert.equal(result.genesis.project, 'canonical_unpublished');
  assert.equal(result.genesis.canonicalUnpublished, 1);
  await assert.rejects(verify(fixture({ applied: false, insert: false }), { requireGenesisLinking: true }), /not ready/);
});

test('default database mode still rejects publication grants and published records', async () => {
  await assert.rejects(verify(fixture({ publication: true })), /projects.published_at UPDATE/);
  await assert.rejects(verify(fixture({ rows: [canonical(stamp)] })), /publication conflict/);
});

test('publication database mode reports absent, unpublished and published states accurately', async () => {
  for (const [rows, state] of [[[], 'absent'], [[canonical()], 'canonical_unpublished'], [[canonical(stamp)], 'canonical_published'], [[canonical(new Date(stamp))], 'canonical_published']]) {
    const result = await verify(fixture({ publication: true, rows }), { genesisPublication: true });
    assert.equal(result.genesis.project, state);
    assert.equal(result.genesis.associations, rows.length);
    assert.equal(result.genesis.canonicalUnpublished, state === 'canonical_unpublished' ? 1 : 0);
    assert.equal(result.genesis.canonicalPublished, state === 'canonical_published' ? 1 : 0);
    assert.equal(result.genesis.publishedAt, state === 'canonical_published' ? stamp : null);
    assert.equal(result.genesis.linkingAvailable, state !== 'canonical_published');
    assert.equal(result.genesis.publicationAvailable, state === 'canonical_unpublished');
    assert.equal(result.genesis.runtimeUpdate, 'published_at_only');
  }
});

test('publication database mode requires migration 003 and the exact publication grant', async () => {
  await assert.rejects(verify(fixture({ publication: true, applied: false, insert: false }), { genesisPublication: true }), /requires migration 003/);
  await assert.rejects(verify(fixture(), { genesisPublication: true }), /projects.published_at UPDATE/);
});

for (const field of ['id', 'network', 'creator_account_id', 'dao_account_id', 'name', 'description', 'objectives', 'participation', 'rewards', 'published_at']) {
  test(`publication database mode rejects mismatched ${field}`, async () => {
    const row = { ...canonical(stamp), [field]: field === 'objectives' ? [] : 'invalid' };
    await assert.rejects(verify(fixture({ publication: true, rows: [row] }), { genesisPublication: true }), /publication conflict/);
  });
}

test('publication database mode rejects multiple identity/DAO associations', async () => {
  await assert.rejects(verify(fixture({ publication: true, rows: [canonical(), canonical(stamp)] }), { genesisPublication: true }), /publication conflict/);
});

for (const publication of [false, true]) {
  test(`${publication ? 'publication' : 'draft'} database mode preserves permission denials`, async () => {
    const mutations = [
      f => { f.tableGrants.find(row => row.table_name === 'projects' && row.permission === 'UPDATE').allowed = true; },
      ...tableColumns.projects.filter(name => name !== 'published_at').map(name => f => { f.columnGrants.find(row => row.table_name === 'projects' && row.column_name === name).upd = true; }),
      f => { f.columnGrants.find(row => row.table_name === 'projects' && row.column_name === 'published_at').ins = true; },
      f => { f.columnGrants.find(row => row.table_name === 'sessions' && row.column_name === 'account_id').upd = true; },
      f => { f.tableGrants.find(row => row.table_name === 'applications' && row.permission === 'DELETE').allowed = true; },
      f => { f.columnGrants.find(row => row.table_name === 'restricted_content' && row.column_name === 'content').upd = true; },
    ];
    for (const mutate of mutations) {
      const f = fixture({ publication }); mutate(f);
      await assert.rejects(verify(f, { genesisPublication: publication }), /Unexpected|excessive/);
    }
  });

  test(`${publication ? 'publication' : 'draft'} runtime mode retains all 22 rollback-protected denial probes`, async () => {
    const runtime = runtimeDouble(fixture({ publication, insert: publication }));
    const result = await verifyRuntime(runtime.sql, { genesisPublication: publication });
    assert.equal(result.deniedOperations, 22);
    assert.equal(result.tablePrivilegeChecks, 49);
    assert.equal(runtime.probes.length, 22);
    assert.ok(runtime.probes.some(text => text.includes('SET name=name')));
    assert.ok(runtime.probes.some(text => text.includes('INSERT INTO yawrd.projects') && text.includes('published_at')));
    assert.ok(runtime.probes.some(text => text.includes('UPDATE yawrd.applications')));
    assert.ok(runtime.probes.some(text => text.includes('UPDATE yawrd.restricted_content')));
    assert.equal(result.genesisPublication, publication || undefined);
    const unexpected = runtimeDouble(fixture({ publication, insert: publication }), true);
    await assert.rejects(verifyRuntime(unexpected.sql, { genesisPublication: publication }), /must fail with insufficient_privilege/);
  });

  test(`${publication ? 'publication' : 'draft'} runtime mode rejects excessive project and participant privileges`, async () => {
    for (const [table, column, permission] of [...tableColumns.projects.filter(name => name !== 'published_at').map(name => ['projects', name, 'upd']), ['projects', 'published_at', 'ins'], ['sessions', 'account_id', 'upd']]) {
      const f = fixture({ publication, insert: publication });
      f.columnGrants.find(row => row.table_name === table && row.column_name === column)[permission] = true;
      await assert.rejects(verifyRuntime(runtimeDouble(f).sql, { genesisPublication: publication }), /UPDATE|INSERT/);
    }
    const f = fixture({ publication, insert: publication });
    f.tableGrants.find(row => row.table_name === 'projects' && row.permission === 'UPDATE').allowed = true;
    await assert.rejects(verifyRuntime(runtimeDouble(f).sql, { genesisPublication: publication }), /projects UPDATE/);
  });
}

test('runtime draft INSERT opt-in remains separate from publication UPDATE opt-in', async () => {
  await verifyRuntime(runtimeDouble(fixture()).sql, { genesisDraftLinking: true });
  await assert.rejects(verifyRuntime(runtimeDouble(fixture({ publication: true })).sql, { genesisDraftLinking: true }), /projects.published_at UPDATE/);
  await assert.rejects(verifyRuntime(runtimeDouble(fixture()).sql, { genesisPublication: true }), /projects.published_at UPDATE/);
  const f = fixture({ publication: true });
  f.columnGrants = f.columnGrants.filter(row => row.column_name !== 'published_at');
  await assert.rejects(verifyRuntime(runtimeDouble(f).sql, { genesisPublication: true }), /projects.published_at required/);
});

test('both CLI entry points select publication mode only with the explicit environment opt-in', () => {
  for (const file of ['scripts/verify-database.mjs', 'scripts/verify-runtime.mjs']) {
    const text = source(file);
    assert.match(text, /genesisPublication = false/);
    assert.match(text, /genesisPublication: process\.env\.YAWRD_ENABLE_GENESIS_PUBLICATION === '1'/);
    assert.doesNotMatch(text, /^import ['"].*load-.*environment/m);
  }
});
