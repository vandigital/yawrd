// Explicit verification-branch command. Never loads application/operator env files.
// Requires owner/runtime verification URLs and an independently confirmed endpoint pin.
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';

const branch = 'yaw-001-pg-verification';
const ownerRole = 'neondb_owner';
const role = 'yawrd_07b_runtime';
const tables = ['projects', 'restricted_content', 'auth_challenges', 'sessions', 'applications', 'review_decisions', 'auth_rate_limits'];
const insertColumns = ['network', 'id', 'creator_account_id', 'dao_account_id', 'name', 'description', 'objectives', 'participation', 'rewards'];
const results = [];
let stage = 'connection_guard';
let cleanup;
let migrationStatus = 'not_executed';
let verificationComplete = false;

function requireCheck(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}
function safeCode(error) {
  return typeof error?.code === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(error.code) ? error.code : 'verification_failed';
}
async function check(name, operation) {
  stage = name;
  try {
    await operation();
    results.push({ name, status: 'passed' });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', code: safeCode(error) });
    throw error;
  }
}
const normalize = value => value.replace(/\s+/g, ' ').trim();
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

function verificationConnection(value, endpoint, expectedRole, prefix = '') {
  let url;
  try { url = new URL(value); } catch { requireCheck(false, `${prefix}invalid_verification_url`); }
  requireCheck(['postgres:', 'postgresql:'].includes(url.protocol) && url.username && url.password, `${prefix}explicit_database_credentials_required`);
  requireCheck(url.hostname.endsWith('.neon.tech') && url.hostname.split('.')[0].replace(/-pooler$/, '') === endpoint, `${prefix}verification_endpoint_mismatch`);
  requireCheck((!url.port || url.port === '5432') && url.pathname === '/neondb' && !url.hash, `${prefix}verification_database_or_port_mismatch`);
  requireCheck(['require', 'verify-full'].includes(url.searchParams.get('sslmode')), `${prefix}verification_tls_required`);
  for (const key of url.searchParams.keys()) {
    requireCheck(['sslmode', 'channel_binding', 'connect_timeout', 'application_name'].includes(key), `${prefix}unexpected_connection_override`);
    requireCheck(url.searchParams.getAll(key).length === 1, `${prefix}duplicate_connection_override`);
  }
  let username;
  try { username = decodeURIComponent(url.username); } catch { requireCheck(false, `${prefix}invalid_database_role`); }
  requireCheck(username === expectedRole, `${prefix}verification_role_mismatch`);
  return url;
}

try {
  const mode = process.argv[2];
  requireCheck(process.argv.length === 3 && ['--preflight', '--apply-and-test'].includes(mode), 'use_preflight_or_apply_and_test');
  const value = process.env.YAWRD_PG_VERIFY_URL;
  requireCheck(value, 'YAWRD_PG_VERIFY_URL_missing');
  requireCheck(process.env.YAWRD_PG_VERIFY_BRANCH === branch, 'verification_branch_confirmation_missing');
  const endpoint = process.env.YAWRD_PG_VERIFY_ENDPOINT;
  requireCheck(endpoint && /^ep-[a-z0-9-]+$/.test(endpoint), 'independent_console_endpoint_pin_required');
  const url = verificationConnection(value, endpoint, ownerRole);
  const runtimeValue = process.env.YAWRD_PG_VERIFY_RUNTIME_URL;
  requireCheck(runtimeValue, 'YAWRD_PG_VERIFY_RUNTIME_URL_missing');
  const runtimeUrl = verificationConnection(runtimeValue, endpoint, role, 'runtime_');
  requireCheck(url.hostname.replace(/-pooler(?=\.)/, '') === runtimeUrl.hostname.replace(/-pooler(?=\.)/, ''), 'owner_runtime_target_mismatch');
  // An endpoint does not prove a branch name. The owner must obtain the pin from
  // the named verification branch in Neon Console, independently of this URL.
  console.log(JSON.stringify({ branchConfirmedByOwner: branch, endpoint, host: url.hostname, runtimeHost: runtimeUrl.hostname, port: 5432, database: 'neondb', credentials: 'suppressed' }));

  stage = 'load_existing_dependencies';
  const { neon } = await import('@neondatabase/serverless');
  const { ParticipantRepository } = await import('../src/participants/repository.ts');
  const { participantRequest } = await import('../src/participants/http.ts');
  const { GENESIS_YAW_001: g } = await import('../src/genesis/yaw-001.ts');
  const { SESSION_COOKIE, hashToken } = await import('../src/participants/auth.ts');
  const sql = neon(value);
  const runtimeSql = neon(runtimeValue);
  const fetchOptions = () => ({ signal: AbortSignal.timeout(30000), cache: 'no-store' });
  const owner = (text, values = []) => sql.query(text, values, { fetchOptions: fetchOptions() });
  const transaction = statements => sql.transaction(statements, { fetchOptions: fetchOptions() });
  const runtime = (text, values = []) => runtimeSql.query(text, values, { fetchOptions: fetchOptions() });
  // All destructive/negative probes roll back even if a missing guard allows SQL.
  async function denied(text, values, expected, asRuntime = false) {
    let actual = 'unexpected_success';
    try {
      const client = asRuntime ? runtimeSql : sql;
      await client.transaction([
        client.query(text, values),
        client.query("DO $$ BEGIN RAISE EXCEPTION 'verification_probe_rollback'; END $$"),
      ], { fetchOptions: fetchOptions() });
    } catch (error) { actual = safeCode(error); }
    requireCheck(actual === expected, `expected_${expected}_received_${actual}`);
  }

  await check('direct_connection_roles_read_only', async () => {
    const identityQuery = "SELECT current_database() AS database,current_user=$1 AS expected_role,current_setting('server_version_num')::int AS version";
    for (const [client, expectedRole, label] of [[sql, ownerRole, 'owner'], [runtimeSql, role, 'runtime']]) {
      const [identity] = await client.transaction([client.query(identityQuery, [expectedRole])], { readOnly: true, fetchOptions: fetchOptions() });
      requireCheck(identity[0].expected_role === true, `${label}_connection_role_mismatch`);
      requireCheck(identity[0].database === 'neondb' && identity[0].version >= 180000 && identity[0].version < 190000, `${label}_connection_database_or_version_mismatch`);
    }
  });

  const draft = await source('../docs/proposals/migrations/003_genesis_draft_linking.sql');
  const draftFunction = draft.match(/CREATE OR REPLACE FUNCTION yawrd\.protect_creator\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$/)?.[1];
  requireCheck(draftFunction, 'reviewed_identity_function_missing');
  let hasDao;
  let hadRole;
  await check('read_only_schema_and_role_preflight', async () => {
    const [server, columns, triggers, functions, counts, roles, constraints] = await sql.transaction([
      sql.query("SELECT current_database() AS database, current_setting('server_version_num')::int AS version, has_schema_privilege(current_user,'yawrd','CREATE') AS schema_admin, current_user <> $1 AS separate_admin", [role]),
      sql.query("SELECT table_name,column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='yawrd'"),
      sql.query("SELECT t.tgname,t.tgenabled,p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='yawrd.projects'::regclass AND NOT t.tgisinternal"),
      sql.query("SELECT prosrc FROM pg_proc WHERE oid='yawrd.protect_creator()'::regprocedure"),
      sql.query(`SELECT ${tables.map(t => `(SELECT count(*)::int FROM yawrd.${t}) AS ${t}`).join(',')}`),
      sql.query('SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=$1', [role]),
      sql.query("SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='yawrd.projects'::regclass"),
    ], { readOnly: true, fetchOptions: fetchOptions() });
    requireCheck(server[0].database === 'neondb' && server[0].version >= 180000 && server[0].version < 190000, 'expected_neondb_postgres18');
    requireCheck(server[0].schema_admin && server[0].separate_admin, 'separate_schema_admin_required');
    requireCheck(Object.values(counts[0]).every(count => count === 0), 'schema_only_branch_must_have_no_operational_records');
    const required = {
      projects: ['network','id','creator_account_id','name','description','objectives','participation','rewards','published_at','created_at'],
      restricted_content: ['network','project_id','content'],
      auth_challenges: ['id','browser_hash','account_id','network','origin','message','recipient','nonce','issued_at','expires_at','consumed_at'],
      sessions: ['token_hash','challenge_id','network','account_id','public_key','block_height','block_hash','created_at','expires_at','revoked_at'],
      applications: ['id','network','project_id','account_id','introduction','consent_version','consented_at','created_at'],
      review_decisions: ['application_id','network','project_id','reviewer_account_id','decision','decided_at'],
      auth_rate_limits: ['account_id','attempts','resets_at'],
    };
    for (const [table, names] of Object.entries(required)) {
      requireCheck(names.every(name => columns.some(c => c.table_name === table && c.column_name === name)), `base_columns_missing_${table}`);
    }
    const published = columns.find(c => c.table_name === 'projects' && c.column_name === 'published_at');
    requireCheck(published.is_nullable === 'YES' && published.column_default === null, 'published_default_must_be_null');
    requireCheck(triggers.some(t => t.tgname === 'immutable_project_identity' && t.proname === 'protect_creator' && t.tgenabled === 'O'), 'identity_trigger_mismatch');
    requireCheck(constraints.some(c => c.contype === 'p' && normalize(c.definition) === 'PRIMARY KEY (network, id)'), 'project_primary_key_mismatch');
    requireCheck(constraints.every(c => c.convalidated), 'unvalidated_project_constraints');
    hasDao = columns.some(c => c.table_name === 'projects' && c.column_name === 'dao_account_id');
    requireCheck(hasDao, 'migration003_must_already_be_applied');
    requireCheck(normalize(functions[0].prosrc) === normalize(draftFunction), 'identity_function_mismatch_requires_review');
    if (hasDao) {
      requireCheck(columns.some(c => c.table_name === 'projects' && c.column_name === 'dao_account_id' && c.is_nullable === 'YES'), 'dao_column_must_remain_nullable');
      requireCheck(constraints.some(c => c.conname === 'project_dao_unique' && normalize(c.definition) === 'UNIQUE (network, dao_account_id)'), 'existing_dao_uniqueness_mismatch');
      requireCheck(constraints.some(c => c.conname === 'project_dao_account_id' && c.contype === 'c'), 'existing_dao_check_missing');
    }
    hadRole = roles.length === 1;
    if (hadRole) requireCheck(!roles[0].rolsuper && !roles[0].rolcreatedb && !roles[0].rolcreaterole && !roles[0].rolreplication && !roles[0].rolbypassrls && !roles[0].rolinherit, 'existing_runtime_role_attributes_require_review');
    const inherited = hadRole ? await owner('SELECT count(*)::int AS count FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)', [role]) : [{ count: 0 }];
    requireCheck(inherited[0].count === 0, 'runtime_role_memberships_require_review');
    if (hadRole) {
      const privileges = await owner("SELECT has_table_privilege($1,'yawrd.projects','SELECT') AS project_select,has_table_privilege($1,'yawrd.projects','INSERT') AS project_table_insert,has_table_privilege($1,'yawrd.projects','UPDATE') AS project_table_update,has_table_privilege($1,'yawrd.projects','DELETE') AS project_delete", [role]);
      const columnPrivileges = await owner("SELECT column_name,has_column_privilege($1,'yawrd.projects',column_name,'INSERT') AS ins,has_column_privilege($1,'yawrd.projects',column_name,'UPDATE') AS upd FROM information_schema.columns WHERE table_schema='yawrd' AND table_name='projects' ORDER BY ordinal_position", [role]);
      console.log(JSON.stringify({ existingRuntimeTableGrants: privileges[0], existingRuntimeColumnGrants: columnPrivileges }));
    }
    // A schema-only clone may have no migration ledger rows. No ledger drives DDL.
    console.log(JSON.stringify({ baseSchema: 'present', operationalRecords: 'empty', migration001: 'not_reexecuted', daoColumn: hasDao ? 'present' : 'absent', runtimeRole: hadRole ? 'present_restricted' : 'absent', migration003Sha256: createHash('sha256').update(draft).digest('hex') }));
  });
  if (mode === '--preflight') {
    console.log(JSON.stringify({ status: 'preflight_passed', databaseWrites: false, postgresBehaviorTests: 'not_run' }));
  } else {
    const fixtureIds = [g.id, 'verify-null-before', 'verify-null-after', 'verify-dao-conflict', 'verify-column-insert'];
    const challengeIds = [];
    const hashes = [];
    cleanup = async () => {
      await transaction([
        sql.query('DELETE FROM yawrd.restricted_content WHERE network=$1 AND project_id=ANY($2::text[])', ['testnet', fixtureIds]),
        sql.query('DELETE FROM yawrd.projects WHERE network=$1 AND id=ANY($2::text[])', ['testnet', fixtureIds]),
        sql.query('DELETE FROM yawrd.sessions WHERE token_hash=ANY($1::text[])', [hashes]),
        sql.query('DELETE FROM yawrd.auth_challenges WHERE id=ANY($1::text[])', [challengeIds]),
      ]);
    };
    const insertFixture = (id, dao = null, creator = 'verify-owner.testnet') => owner(`INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards${hasDao ? ',dao_account_id' : ''}) VALUES ('testnet',$1,$2,'Synthetic verification only','Synthetic isolated-branch fixture','[]','No applications','No rewards'${hasDao ? ',$3' : ''})`, hasDao ? [id, creator, dao] : [id, creator]);
    await check('migration003_and_existing_null_associations', async () => {
      await insertFixture('verify-null-before');
      migrationStatus = '003_already_present_preflight_checked';
      const [legacy] = await owner("SELECT dao_account_id FROM yawrd.projects WHERE id='verify-null-before'");
      requireCheck(legacy.dao_account_id === null, 'legacy_null_association_changed');
      await insertFixture('verify-null-after');
      const [count] = await owner('SELECT count(*)::int AS count FROM yawrd.projects WHERE dao_account_id IS NULL');
      requireCheck(count.count === 2, 'multiple_null_associations_rejected');
    });

    await check('verify_existing_runtime_grants_read_only', async () => {
      requireCheck(hadRole, 'existing_runtime_role_required');
      const permissions = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
      const insertTables = ['applications', 'review_decisions', 'auth_challenges', 'sessions', 'auth_rate_limits'];
      const updateColumns = { auth_challenges: ['consumed_at'], sessions: ['revoked_at'], auth_rate_limits: ['attempts', 'resets_at'] };
      const [tableGrants, columnGrants, schemaGrants] = await runtimeSql.transaction([
        runtimeSql.query("SELECT t.table_name,p.permission,has_table_privilege(current_user,format('%I.%I',t.table_schema,t.table_name),p.permission) AS allowed FROM information_schema.tables t CROSS JOIN unnest($1::text[]) AS p(permission) WHERE t.table_schema='yawrd' AND t.table_name=ANY($2::text[])", [permissions, tables]),
        runtimeSql.query("SELECT table_name,column_name,has_column_privilege(current_user,format('%I.%I',table_schema,table_name),column_name,'INSERT') AS ins,has_column_privilege(current_user,format('%I.%I',table_schema,table_name),column_name,'UPDATE') AS upd FROM information_schema.columns WHERE table_schema='yawrd' AND table_name=ANY($1::text[])", [tables]),
        runtimeSql.query("SELECT has_schema_privilege(current_user,'yawrd','USAGE') AS usage,has_schema_privilege(current_user,'yawrd','CREATE') AS ddl"),
      ], { readOnly: true, fetchOptions: fetchOptions() });
      requireCheck(schemaGrants[0].usage && schemaGrants[0].ddl === false, 'existing_runtime_schema_grants_mismatch');
      for (const table of tables) {
        const grants = tableGrants.filter(row => row.table_name === table);
        requireCheck(grants.length === permissions.length && permissions.every(permission => grants.some(row => row.permission === permission)), 'existing_runtime_table_catalog_incomplete');
        for (const row of grants) {
          const expected = row.permission === 'SELECT' || (row.permission === 'INSERT' && insertTables.includes(table));
          requireCheck(row.allowed === expected, `existing_runtime_table_grants_mismatch_${table}_${row.permission}`);
        }
        const columns = columnGrants.filter(row => row.table_name === table);
        const updates = updateColumns[table] ?? [];
        requireCheck(columns.length > 0 && updates.every(name => columns.some(row => row.column_name === name)), 'existing_runtime_column_catalog_incomplete');
        if (table === 'projects') requireCheck(insertColumns.every(name => columns.some(row => row.column_name === name)), 'existing_runtime_project_columns_missing');
        for (const row of columns) {
          const insert = table === 'projects' ? insertColumns.includes(row.column_name) : insertTables.includes(table);
          requireCheck(row.ins === insert && row.upd === updates.includes(row.column_name), `existing_runtime_column_grants_mismatch_${table}_${row.column_name}`);
        }
      }
    });

    async function session(account, kind = 'valid') {
      const id = randomBytes(32).toString('base64url');
      const token = randomBytes(32).toString('base64url');
      const hash = hashToken(token);
      challengeIds.push(id); hashes.push(hash);
      await transaction([
        sql.query(`INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
          VALUES ($1,$2,$3,'testnet','https://yawrd.pg-verification.invalid','Synthetic SQL fixture; not a human signature','Isolated verification',$4,statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp())`, [id, hashToken(randomBytes(32).toString('base64url')), account, randomBytes(32).toString('base64')]),
        sql.query(`INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash,created_at,expires_at,revoked_at)
          VALUES ($1,$2,'testnet',$3,'synthetic-key-not-authentication-evidence',1,'synthetic-block',
          statement_timestamp() - CASE WHEN $4 THEN interval '2 hours' ELSE interval '0' END,
          statement_timestamp() + CASE WHEN $4 THEN -interval '1 hour' ELSE interval '1 hour' END,
          CASE WHEN $5 THEN statement_timestamp() END)`, [hash, id, account, kind === 'expired', kind === 'revoked']),
      ]);
      return { hash, token, id };
    }
    stage = 'synthetic_session_setup';
    const creator = await session(g.creatorAccountId);
    const other = await session('yawrd.testnet');
    const expired = await session(g.creatorAccountId, 'expired');
    const revoked = await session(g.creatorAccountId, 'revoked');
    const repo = new ParticipantRepository(runtime);
    const http = (method, token, id = g.id, requestOrigin = 'https://yawrd.pg-verification.invalid') => {
      const origin = 'https://yawrd.pg-verification.invalid';
      return participantRequest(new Request(`${origin}/api/yawrd/${id}/genesis-draft`, {
        method, headers: { host: 'yawrd.pg-verification.invalid', origin: requestOrigin, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) },
        ...(method === 'POST' ? { body: '{}' } : {}),
      }), id, 'genesis-draft', repo, origin);
    };
    const canonical = () => owner('SELECT * FROM yawrd.projects WHERE network=$1 AND id=$2', ['testnet', g.id]);
    const removeCanonical = () => owner('DELETE FROM yawrd.projects WHERE network=$1 AND id=$2', ['testnet', g.id]);

    await check('canonical_unpublished_insertion_through_existing_handler', async () => {
      const response = await http('POST', creator.token);
      requireCheck(response.status === 200, `canonical_http_${response.status}`);
      const result = await response.json();
      const rows = await canonical();
      requireCheck(result.linked && rows.length === 1, 'canonical_single_record_missing');
      const p = rows[0];
      requireCheck(p.id === g.id && p.creator_account_id === g.creatorAccountId && p.network === g.network && p.dao_account_id === g.daoAccountId && p.published_at === null, 'canonical_identity_or_publication_mismatch');
    });
    await check('identical_retries_preserve_all_stored_fields', async () => {
      const original = JSON.stringify(await canonical());
      await repo.linkGenesis(creator.hash);
      await repo.linkGenesis(creator.hash);
      requireCheck(JSON.stringify(await canonical()) === original, 'retry_mutated_record');
    });
    await check('concurrent_first_inserts_have_one_postgres_winner', async () => {
      await removeCanonical();
      const linked = await Promise.all(Array.from({ length: 8 }, () => new ParticipantRepository(runtime).linkGenesis(creator.hash)));
      requireCheck((await canonical()).length === 1 && linked.every(r => r.linked && r.project.publishedAt === null), 'concurrent_duplicate_or_failed_insert');
      requireCheck(new Set(linked.map(r => r.project.createdAt)).size === 1, 'concurrent_timestamp_mismatch');
    });
    await check('conflicting_dao_and_project_id_associations_return409_without_overwrite', async () => {
      await removeCanonical();
      for (const [id, dao] of [['verify-dao-conflict', g.daoAccountId], [g.id, 'other.factory.yawrd.testnet']]) {
        await insertFixture(id, dao);
        const before = JSON.stringify(await owner('SELECT * FROM yawrd.projects WHERE id=$1', [id]));
        const response = await http('POST', creator.token);
        requireCheck(response.status === 409, 'conflict_not_rejected');
        requireCheck(JSON.stringify(await owner('SELECT * FROM yawrd.projects WHERE id=$1', [id])) === before, 'conflict_overwrote_record');
        await owner('DELETE FROM yawrd.projects WHERE id=$1', [id]);
      }
      await repo.linkGenesis(creator.hash);
    });
    await check('postgres_enforces_network_dao_uniqueness', async () => {
      await denied("INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards,dao_account_id) VALUES ('testnet','verify-dao-conflict','verify-owner.testnet','Synthetic','Synthetic','[]','None','None',$1)", [g.daoAccountId], '23505');
    });
    await check('owner_writes_cannot_reassign_creator_or_dao_including_null_transitions', async () => {
      for (const [field, value, id] of [['creator_account_id','other.testnet',g.id], ['dao_account_id','other.testnet',g.id], ['dao_account_id',null,g.id], ['dao_account_id','other.testnet','verify-null-before']]) {
        await denied(`UPDATE yawrd.projects SET ${field}=$1 WHERE id=$2`, [value, id], '23514');
      }
    });
    await check('postgres_rejects_invalid_dao_account_identifiers', async () => {
      for (const dao of ['a','UPPER.testnet','bad..testnet','.bad','bad.','bad name','a'.repeat(65),'bad\n']) {
        await denied("INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards,dao_account_id) VALUES ('testnet','verify-dao-conflict','verify-owner.testnet','Synthetic','Synthetic','[]','None','None',$1)", [dao], '23514');
      }
    });
    await check('session_and_origin_denials_with_actual_runtime_queries', async () => {
      const before = JSON.stringify(await canonical());
      for (const method of ['GET','POST']) {
        for (const [token, status] of [[null,401],[expired.token,401],[revoked.token,401],[other.token,403]]) {
          const response = await http(method, token);
          requireCheck(response.status === status, `session_denial_http_${response.status}_expected_${status}`);
          requireCheck(!JSON.stringify(await response.json()).includes(g.daoAccountId), 'unauthorized_draft_disclosure');
        }
        requireCheck((await http(method, creator.token, 'dev-yaw-001')).status === 404, 'other_project_id_accepted');
      }
      requireCheck((await http('POST', creator.token, g.id, 'https://evil.invalid')).status === 403, 'cross_origin_mutation_accepted');
      requireCheck(JSON.stringify(await canonical()) === before, 'unauthorized_operation_changed_record');
      await denied("INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash) VALUES ($1,$2,'mainnet',$3,'synthetic',1,'synthetic')", [hashToken(randomBytes(32).toString('base64url')),creator.id,g.creatorAccountId], '23514');
    });
    await check('unpublished_project_and_restricted_content_remain_inaccessible', async () => {
      await owner('INSERT INTO yawrd.restricted_content(network,project_id,content) VALUES ($1,$2,$3)', ['testnet',g.id,'SYNTHETIC_RESTRICTED_VERIFICATION_SENTINEL']);
      requireCheck(await repo.project(g.id) === null, 'unpublished_project_publicly_readable');
      for (const hash of [null,other.hash,expired.hash,revoked.hash]) {
        let error;
        try { await repo.view(g.id, hash); } catch (e) { error = e; }
        requireCheck(error?.code === 'not_found', 'unpublished_participant_view_disclosed');
      }
    });
    await check('runtime_privileges_are_exact_column_insert_and_no_project_update', async () => {
      const columns = await runtime("SELECT column_name,has_column_privilege(current_user,'yawrd.projects',column_name,'INSERT') AS ins,has_column_privilege(current_user,'yawrd.projects',column_name,'UPDATE') AS upd FROM information_schema.columns WHERE table_schema='yawrd' AND table_name='projects'");
      requireCheck(columns.length >= 11 && insertColumns.every(name => columns.some(c => c.column_name === name)), 'runtime_column_catalog_incomplete');
      requireCheck(columns.every(c => c.ins === insertColumns.includes(c.column_name) && c.upd === false), 'runtime_column_grants_mismatch');
      const [privileges] = await runtime("SELECT has_table_privilege(current_user,'yawrd.projects','INSERT') AS ins,has_table_privilege(current_user,'yawrd.projects','UPDATE') AS upd,has_table_privilege(current_user,'yawrd.projects','DELETE') AS del,has_schema_privilege(current_user,'yawrd','CREATE') AS ddl");
      requireCheck(Object.values(privileges).every(value => value === false), 'runtime_has_broad_project_privileges');
      // Column permissions are not a row whitelist. Existing server SQL supplies
      // the fixed Genesis identity and session authorization, not PostgreSQL RLS.
      await runtime("INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards) VALUES ('testnet','verify-column-insert','verify-owner.testnet','Synthetic','Synthetic','[]','None','None')");
      console.log('LIMIT runtime column grants permit trusted-server draft INSERT; Genesis row restrictions are enforced by repository/HTTP SQL, not RLS.');
    });
    await check('runtime_publication_update_and_unrelated_mutations_are_denied', async () => {
      for (const statement of [
        'UPDATE yawrd.projects SET name=name WHERE false',
        'UPDATE yawrd.projects SET creator_account_id=creator_account_id WHERE false',
        'UPDATE yawrd.projects SET dao_account_id=dao_account_id WHERE false',
        'UPDATE yawrd.projects SET published_at=clock_timestamp() WHERE false',
        'DELETE FROM yawrd.projects WHERE false',
        'TRUNCATE yawrd.projects CASCADE',
        'UPDATE yawrd.restricted_content SET content=content WHERE false',
        "INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards,published_at) VALUES ('testnet','verify-column-insert','verify-owner.testnet','Synthetic','Synthetic','[]','None','None',NULL)",
        "INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards,created_at) VALUES ('testnet','verify-column-insert','verify-owner.testnet','Synthetic','Synthetic','[]','None','None',clock_timestamp())",
      ]) await denied(statement, [], '42501', true);
    });
    await check('remove_only_synthetic_fixtures', async () => {
      await cleanup();
      cleanup = null;
      const [counts] = await owner(`SELECT ${tables.map(t => `(SELECT count(*)::int FROM yawrd.${t}) AS ${t}`).join(',')}`);
      requireCheck(Object.values(counts).every(count => count === 0), 'synthetic_cleanup_incomplete');
    });
    verificationComplete = true;
  }
} catch (error) {
  console.log(JSON.stringify({ status: 'blocked_or_failed', stage, code: safeCode(error), details: 'Connection values, credentials and raw database errors suppressed.' }));
  process.exitCode = 1;
} finally {
  if (cleanup) {
    try { await cleanup(); console.log('Synthetic fixture cleanup completed after failure.'); }
    catch { console.log('Synthetic cleanup incomplete; inspect only the verification branch.'); process.exitCode = 1; }
  }
  console.log(JSON.stringify({ passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length, complete: verificationComplete, migration: migrationStatus, productionOrDevelopmentWrites: false }));
}
