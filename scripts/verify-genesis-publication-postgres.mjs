// Owner-operated publication verification ONLY on a fresh schema-only Neon branch.
// No environment files, role switching, migrations or branch-management API calls.
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const branch = 'yaw-001-publication-verification';
const runtimeRole = 'yawrd_07b_runtime';
const migrationChecksum = 'ab6b41b1e54660f65835e5f078e990d3ed257d004ac490642588c6ff412fb676';
const oldParticipation = 'Participant applications are not open for this unpublished project. Crew Member approval, agent association, GitHub access and contribution acceptance require separate authorization.';
const newParticipation = 'Applications are reviewed by the project creator. Participation requires separate authorization.';
const tables = ['applications', 'auth_challenges', 'auth_rate_limits', 'projects', 'restricted_content', 'review_decisions', 'sessions'];
const insertTables = ['applications', 'review_decisions', 'auth_challenges', 'sessions', 'auth_rate_limits'];
const insertColumns = ['network', 'id', 'creator_account_id', 'dao_account_id', 'name', 'description', 'objectives', 'participation', 'rewards'];
const updates = { auth_challenges: ['consumed_at'], sessions: ['revoked_at'], auth_rate_limits: ['attempts', 'resets_at'] };
const origin = 'https://yawrd.publication-verification.invalid';
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), { code }); };
const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.replace(/\s+/g, ' ').trim();

export function publicationTargets(env = process.env) {
  need(env.YAWRD_PG_VERIFY_BRANCH === branch && env.YAWRD_PG_VERIFY_PARENT === 'development', 'fresh_branch_and_parent_confirmation_required');
  const endpoint = env.YAWRD_PG_VERIFY_ENDPOINT;
  need(/^ep-[a-z0-9-]+$/.test(endpoint ?? ''), 'independent_console_endpoint_pin_required');
  need(!['ep-twilight-voice-aorpfrbm', 'ep-red-haze-ao88m4zr'].includes(endpoint), 'development_or_historical_endpoint_forbidden');
  const urls = [env.YAWRD_MIGRATION_DATABASE_URL, env.DATABASE_URL].map((value, index) => {
    let url;
    try { url = new URL(value); } catch { need(false, index ? 'runtime_url_required' : 'owner_url_required'); }
    need(['postgres:', 'postgresql:'].includes(url.protocol) && url.password, 'explicit_credentials_required');
    need(url.hostname.endsWith('.neon.tech') && url.hostname.split('.')[0].replace(/-pooler$/, '') === endpoint, 'disposable_endpoint_mismatch');
    need(url.pathname === '/neondb' && (!url.port || url.port === '5432') && !url.hash, 'database_or_port_mismatch');
    need(['require', 'verify-full'].includes(url.searchParams.get('sslmode')), 'tls_required');
    for (const key of url.searchParams.keys()) {
      need(['sslmode', 'channel_binding', 'connect_timeout', 'application_name'].includes(key) && url.searchParams.getAll(key).length === 1, 'connection_override_forbidden');
    }
    let role;
    try { role = decodeURIComponent(url.username); } catch { need(false, 'invalid_role'); }
    need(role === (index ? runtimeRole : 'neondb_owner'), 'connection_role_mismatch');
    return url;
  });
  need(urls[0].hostname.replace(/-pooler(?=\.)/, '') === urls[1].hostname.replace(/-pooler(?=\.)/, ''), 'connection_targets_differ');
  return { endpoint, ownerUrl: urls[0].href, runtimeUrl: urls[1].href };
}

export async function verifyPublication(mode, env = process.env) {
  need(['--preflight', '--apply-and-test'].includes(mode), 'use_preflight_or_apply_and_test');
  const targets = publicationTargets(env); // Must finish before loading a driver or connecting.
  need(typeof WebSocket === 'function', 'node_with_native_websocket_required');
  const { neon, Client } = await import('@neondatabase/serverless');
  const { ParticipantRepository } = await import('../src/participants/repository.ts');
  const { participantRequest } = await import('../src/participants/http.ts');
  const { GENESIS_YAW_001: g } = await import('../src/genesis/yaw-001.ts');
  const { SESSION_COOKIE, hashToken } = await import('../src/participants/auth.ts');
  need(g.participation === newParticipation, 'approved_wording_required');
  const ownerSql = neon(targets.ownerUrl), runtimeSql = neon(targets.runtimeUrl);
  const options = () => ({ fetchOptions: { cache: 'no-store', signal: AbortSignal.timeout(30000) } });
  const owner = (text, args = []) => ownerSql.query(text, args, options());
  const runtime = (text, args = []) => runtimeSql.query(text, args, options());
  const lock = new Client({ connectionString: targets.ownerUrl, connectionTimeoutMillis: 10000 });
  lock.on('error', () => {}); // Raw driver errors must never reach credential-bearing logs.
  const results = [];
  let stage = 'connect', connected = false, dirty = false, complete = false;
  const challengeIds = [], sessionHashes = [], fixtureIds = [g.id, 'unit1d-other'];
  const check = async (name, kind, fn) => {
    stage = name;
    try { await fn(); results.push({ name, kind, status: 'passed' }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, kind, status: 'failed' }); throw error; }
  };
  const empty = async () => {
    const [row] = await owner(`SELECT ${tables.map(table => `(SELECT count(*)::int FROM yawrd.${table}) AS ${table}`).join(',')}`);
    need(Object.values(row).every(value => value === 0), 'schema_only_empty_branch_required');
  };
  const cleanup = async () => {
    await ownerSql.transaction([
      ownerSql.query('DELETE FROM yawrd.restricted_content WHERE network=$1 AND project_id=ANY($2::text[])', ['testnet', fixtureIds]),
      ownerSql.query('DELETE FROM yawrd.projects WHERE network=$1 AND id=ANY($2::text[])', ['testnet', fixtureIds]),
      ownerSql.query('DELETE FROM yawrd.sessions WHERE token_hash=ANY($1::text[])', [sessionHashes]),
      ownerSql.query('DELETE FROM yawrd.auth_challenges WHERE id=ANY($1::text[])', [challengeIds]),
    ], options());
    await empty(); dirty = false;
  };
  const grants = async publication => {
    const [tableRows, columns, identity] = await runtimeSql.transaction([
      runtimeSql.query("SELECT t.table_name,p.permission,has_table_privilege(current_user,format('%I.%I',t.table_schema,t.table_name),p.permission) AS allowed FROM information_schema.tables t CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p(permission) WHERE t.table_schema='yawrd' AND t.table_name=ANY($1::text[])", [tables]),
      runtimeSql.query("SELECT table_name,column_name,has_column_privilege(current_user,format('%I.%I',table_schema,table_name),column_name,'INSERT') AS ins,has_column_privilege(current_user,format('%I.%I',table_schema,table_name),column_name,'UPDATE') AS upd FROM information_schema.columns WHERE table_schema='yawrd' AND table_name=ANY($1::text[])", [tables]),
      runtimeSql.query(`SELECT rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)
        AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid)
        AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relowner=r.oid)
        AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proowner=r.oid)
        AND has_schema_privilege(current_user,'yawrd','USAGE')
        AND NOT has_schema_privilege(current_user,'yawrd','CREATE')
        AND NOT has_schema_privilege(current_user,'public','CREATE')
        AND NOT has_database_privilege(current_user,current_database(),'CREATE')
        AND NOT has_database_privilege(current_user,current_database(),'TEMP') AS safe
        FROM pg_roles r WHERE rolname=current_user`),
    ], { ...options(), readOnly: true });
    need(identity.length === 1 && identity[0].safe === true, 'unsafe_runtime_role');
    for (const table of tables) {
      need(tableRows.filter(row => row.table_name === table).length === 7, 'table_grant_catalog_incomplete');
      for (const row of tableRows.filter(row => row.table_name === table)) need(row.allowed === (row.permission === 'SELECT' || (row.permission === 'INSERT' && insertTables.includes(table))), 'table_grant_mismatch');
      const cols = columns.filter(row => row.table_name === table);
      need(cols.length > 0, 'column_grant_catalog_incomplete');
      for (const row of cols) {
        need(row.ins === (table === 'projects' ? insertColumns.includes(row.column_name) : insertTables.includes(table)), 'insert_grant_mismatch');
        need(row.upd === (table === 'projects' ? publication && row.column_name === 'published_at' : (updates[table] ?? []).includes(row.column_name)), 'update_grant_mismatch');
      }
      if (table === 'projects') for (const name of [...insertColumns, 'published_at', 'created_at']) need(cols.some(row => row.column_name === name), 'project_column_missing');
    }
  };
  const denied = async text => {
    let code;
    try { await runtimeSql.transaction([runtimeSql.query(text), runtimeSql.query("DO $$ BEGIN RAISE EXCEPTION 'probe_rollback'; END $$")], options()); }
    catch (error) { code = error?.code; }
    need(code === '42501', 'expected_insufficient_privilege');
  };
  console.log(JSON.stringify({ branchConfirmedByOwner: branch, parentConfirmedByOwner: 'development', endpoint: targets.endpoint, database: 'neondb', roles: ['neondb_owner', runtimeRole], credentials: 'suppressed' }));
  try {
    await check('separate_connection_identities', 'preflight', async () => {
      for (const [sql, role] of [[ownerSql, 'neondb_owner'], [runtimeSql, runtimeRole]]) {
        const [[row]] = await sql.transaction([sql.query("SELECT current_user=$1 AS role_ok,current_database()=$2 AS database_ok,current_setting('server_version') AS version", [role, 'neondb'])], { ...options(), readOnly: true });
        need(row.role_ok && row.database_ok, 'server_identity_mismatch');
        console.log(JSON.stringify({ verifiedRole: role, database: 'neondb', postgresql: row.version }));
      }
      await lock.connect(); connected = true;
      const { rows: [row] } = await lock.query("SELECT current_user='neondb_owner' AND current_database()='neondb' AS valid");
      need(row.valid, 'lock_connection_identity_mismatch');
    });
    await check('existing_schema_and_migration_003', 'preflight', async () => {
      const migration = await readFile(new URL('../migrations/003_genesis_draft_linking.sql', import.meta.url), 'utf8');
      const base = await readFile(new URL('../migrations/001_participants.sql', import.meta.url), 'utf8');
      need(hash(migration) === migrationChecksum, 'migration_checksum_mismatch');
      const [[schema], [fn], constraints, triggers] = await ownerSql.transaction([
        ownerSql.query("SELECT array_agg(table_name::text ORDER BY table_name) AS names FROM information_schema.tables WHERE table_schema='yawrd'"),
        ownerSql.query("SELECT prosrc FROM pg_proc WHERE oid='yawrd.protect_creator()'::regprocedure"),
        ownerSql.query("SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='yawrd.projects'::regclass"),
        ownerSql.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='yawrd.projects'::regclass AND tgname='immutable_project_identity' AND tgfoid='yawrd.protect_creator()'::regprocedure"),
      ], { ...options(), readOnly: true });
      need(JSON.stringify(schema.names) === JSON.stringify(tables), 'unexpected_schema');
      need(normalize(fn.prosrc) === normalize(migration.match(/AS \$\$([\s\S]*?)\$\$/)[1]), 'migration_function_mismatch');
      need(triggers.length === 1 && triggers[0].tgenabled === 'O', 'identity_trigger_mismatch');
      need(constraints.every(row => row.convalidated) && constraints.some(row => row.conname === 'project_dao_unique' && normalize(row.definition) === 'UNIQUE (network, dao_account_id)') && constraints.some(row => row.conname === 'project_dao_account_id'), 'migration_constraints_mismatch');
      const [{ ledger }] = await owner("SELECT to_regclass('public.yawrd_migrations')::text AS ledger");
      if (ledger) {
        const rows = await owner('SELECT version,checksum FROM public.yawrd_migrations');
        for (const row of rows) need(row.checksum === ({ '001_participants.sql': hash(base), '003_genesis_draft_linking.sql': migrationChecksum })[row.version], 'migration_ledger_mismatch');
      } // A schema-only branch may legitimately have no ledger rows. Never replay migrations.
    });
    await check('fresh_schema_only_branch', 'preflight', empty);
    await check('existing_runtime_permissions', 'preflight', () => grants(false));
    if (mode === '--preflight') return;

    await check('publication_denied_before_grant', 'test', () => denied('UPDATE yawrd.projects SET published_at=statement_timestamp() WHERE false'));
    await check('branch_only_publication_column_grant', 'setup', async () => {
      await owner('GRANT UPDATE (published_at) ON yawrd.projects TO yawrd_07b_runtime');
      await grants(true);
    });
    const session = async (account, kind = 'valid') => {
      const id = randomBytes(32).toString('base64url'), token = randomBytes(32).toString('base64url'), tokenHash = hashToken(token);
      challengeIds.push(id); sessionHashes.push(tokenHash); dirty = true;
      await ownerSql.transaction([
        ownerSql.query(`INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
          VALUES ($1,$2,$3,'testnet',$4,'SYNTHETIC publication test; not a human signature','Isolated verification',$5,statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp())`, [id, hashToken(randomBytes(32).toString('base64url')), account, origin, randomBytes(32).toString('base64')]),
        ownerSql.query(`INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash,created_at,expires_at,revoked_at)
          VALUES ($1,$2,'testnet',$3,'synthetic-key',1,'synthetic-block',statement_timestamp()-CASE WHEN $4 THEN interval '2 hours' ELSE interval '0' END,
          statement_timestamp()+CASE WHEN $4 THEN -interval '1 hour' ELSE interval '1 hour' END,CASE WHEN $5 THEN statement_timestamp() END)`, [tokenHash, id, account, kind === 'expired', kind === 'revoked']),
      ], options());
      return token;
    };
    let creator, other, expired, revoked;
    await check('synthetic_session_setup', 'setup', async () => {
      creator = await session(g.creatorAccountId); other = await session('unit1d-other.testnet');
      expired = await session(g.creatorAccountId, 'expired'); revoked = await session(g.creatorAccountId, 'revoked');
    });
    const reset = async (changes = {}, present = true) => {
      dirty = true;
      await ownerSql.transaction([
        ownerSql.query('DELETE FROM yawrd.restricted_content WHERE network=$1 AND project_id=ANY($2::text[])', ['testnet', fixtureIds]),
        ownerSql.query('DELETE FROM yawrd.projects WHERE network=$1 AND id=ANY($2::text[])', ['testnet', fixtureIds]),
      ], options());
      if (present) {
        const p = { id: g.id, creator_account_id: g.creatorAccountId, dao_account_id: g.daoAccountId, name: g.name, description: g.description, objectives: [...g.objectives], participation: g.participation, rewards: g.rewards, ...changes };
        await ownerSql.transaction([
          ownerSql.query("INSERT INTO yawrd.projects(network,id,creator_account_id,dao_account_id,name,description,objectives,participation,rewards) VALUES ('testnet',$1,$2,$3,$4,$5,$6::jsonb,$7,$8)", [p.id,p.creator_account_id,p.dao_account_id,p.name,p.description,JSON.stringify(p.objectives),p.participation,p.rewards]),
          ownerSql.query("INSERT INTO yawrd.restricted_content(network,project_id,content) VALUES ('testnet',$1,'SYNTHETIC_PRIVATE_SENTINEL')", [p.id]),
        ], options());
      }
    };
    const repo = new ParticipantRepository(runtime);
    const call = (token = creator, body = { consent: true, consentVersion: 'genesis-publication-v1' }, id = g.id, requestOrigin = origin) => participantRequest(new Request(`${origin}/api/yawrd/${id}/genesis-publish`, {
      method: 'POST', headers: { host: new URL(origin).host, origin: requestOrigin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}) }, body: JSON.stringify(body),
    }), id, 'genesis-publish', repo, origin);
    const snapshot = async () => (await owner("SELECT row_to_json(p)::text AS value FROM yawrd.projects p WHERE network='testnet' AND id=ANY($1::text[]) ORDER BY id", [fixtureIds])).map(row => row.value).join('\n');
    const timestamp = async () => (await owner("SELECT published_at::text AS exact,to_char(published_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS iso FROM yawrd.projects WHERE network='testnet' AND id=$1", [g.id]))[0];
    await check('unpublished_project_privacy', 'test', async () => {
      await reset(); need(await repo.project(g.id) === null, 'unpublished_project_exposed');
    });
    await check('forbidden_callers_and_requests', 'test', async () => {
      const before = await snapshot();
      for (const [token, expected] of [[null,401],[randomBytes(32).toString('base64url'),401],[other,403],[expired,401],[revoked,401]]) need((await call(token)).status === expected, 'caller_denial_mismatch');
      need((await call(creator, { consent: false, consentVersion: 'genesis-publication-v1' })).status === 400, 'consent_denial_missing');
      need((await call(creator, { consent: true, consentVersion: 'genesis-publication-v1', network: 'mainnet' })).status === 400, 'client_identity_accepted');
      need((await call(creator, undefined, 'unit1d-other')).status === 404, 'other_project_accepted');
      need((await call(creator, undefined, g.id, 'https://forbidden.invalid')).status === 403, 'origin_denial_missing');
      need(await snapshot() === before, 'forbidden_request_changed_project');
    });
    await check('canonical_identity_and_public_field_mismatches', 'test', async () => {
      for (const changes of [{ id: 'unit1d-other' }, { creator_account_id: 'unit1d-other.testnet' }, { dao_account_id: 'wrong.factory.yawrd.testnet' }, { name: 'Changed' }, { description: 'Changed' }, { objectives: [] }, { participation: 'Changed' }, { rewards: 'Changed' }]) {
        await reset(changes); const before = await snapshot();
        need((await call()).status === 409 && await snapshot() === before, 'canonical_mismatch_not_rejected');
      }
    });
    await check('legacy_and_approved_participation', 'test', async () => {
      for (const published of [false, true]) {
        await reset({ participation: oldParticipation });
        if (published) await owner("UPDATE yawrd.projects SET published_at=statement_timestamp() WHERE network='testnet' AND id=$1", [g.id]);
        const before = await snapshot();
        need((await call()).status === 409 && await snapshot() === before, 'legacy_wording_not_rejected');
      }
      await reset(); need((await call()).status === 200, 'approved_wording_not_accepted');
    });
    await check('missing_project_not_created', 'test', async () => {
      await reset({}, false); need((await call()).status === 404 && await snapshot() === '', 'missing_project_created');
    });
    await check('publication_idempotency_and_exact_timestamp', 'test', async () => {
      await reset(); const response = await call(); need(response.status === 200, 'creator_publication_failed');
      const receipt = await response.json(), first = await timestamp(), before = await snapshot();
      need(receipt.published === true && receipt.projectId === g.id && receipt.network === 'testnet' && receipt.publishedAt === first.iso, 'publication_receipt_mismatch');
      for (let i = 0; i < 3; i++) need(JSON.stringify(await (await call()).json()) === JSON.stringify(receipt), 'retry_receipt_mismatch');
      need((await call(other)).status === 403 && (await call(null)).status === 401, 'published_retry_authorization_bypass');
      need((await timestamp()).exact === first.exact && await snapshot() === before, 'first_timestamp_or_fields_changed');
    });
    await check('concurrent_publication_behind_held_row_lock', 'test', async () => {
      await reset();
      await lock.query('BEGIN');
      let pending = [];
      try {
        await lock.query("SET LOCAL idle_in_transaction_session_timeout='25s'");
        await lock.query("SELECT id FROM yawrd.projects WHERE network='testnet' AND id=$1 FOR UPDATE", [g.id]);
        pending = [call(), call()];
        // Attach rejection handlers immediately; do not release the lock until both
        // runtime backends are visibly waiting in PostgreSQL, rather than guessing.
        const all = Promise.all(pending); all.catch(() => {});
        const deadline = Date.now() + 15000;
        let waiting = 0;
        while (Date.now() < deadline && waiting < 2) {
          const [row] = await owner('SELECT count(DISTINCT l.pid)::int AS waiting FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE NOT l.granted AND a.usename=$1 AND a.datname=current_database()', [runtimeRole]);
          waiting = row.waiting;
          if (waiting < 2) await new Promise(resolve => setTimeout(resolve, 150));
        }
        need(waiting >= 2, 'two_runtime_lock_waiters_not_observed');
        await lock.query('COMMIT');
        const responses = await all; need(responses.every(response => response.status === 200), 'concurrent_publication_failed');
        const receipts = await Promise.all(responses.map(response => response.json()));
        need(JSON.stringify(receipts[0]) === JSON.stringify(receipts[1]), 'concurrent_timestamps_differ');
        const first = await timestamp(); need(first.iso === receipts[0].publishedAt, 'concurrent_stored_timestamp_mismatch');
        need((await call()).status === 200 && (await timestamp()).exact === first.exact, 'concurrent_timestamp_changed_on_retry');
        console.log(JSON.stringify({ heldRowLockObserved: true, runtimeLockWaiters: waiting, identicalReceipts: true, exactStoredTimestampPreserved: true }));
      } finally {
        await lock.query('ROLLBACK').catch(() => {});
        await Promise.allSettled(pending);
      }
    });
    await check('negative_project_and_participant_permissions', 'test', async () => {
      await grants(true);
      for (const column of [...insertColumns, 'created_at']) await denied(`UPDATE yawrd.projects SET ${column}=${column} WHERE false`);
      for (const statement of [
        'DELETE FROM yawrd.projects WHERE false',
        "INSERT INTO yawrd.projects(network,id,creator_account_id,name,description,objectives,participation,rewards,published_at) VALUES ('testnet','unit1d-denied','unit1d.testnet','Synthetic','Synthetic','[]','None','None',NULL)",
        'UPDATE yawrd.restricted_content SET content=content WHERE false',
        'UPDATE yawrd.applications SET introduction=introduction WHERE false',
        'DELETE FROM yawrd.applications WHERE false',
        'UPDATE yawrd.review_decisions SET decision=decision WHERE false',
        'UPDATE yawrd.sessions SET account_id=account_id WHERE false',
      ]) await denied(statement);
    });
    await check('published_public_read_keeps_participant_data_private', 'test', async () => {
      need((await repo.project(g.id))?.participation === newParticipation, 'published_project_unavailable');
      for (const tokenHash of [null, hashToken(other), hashToken(expired), hashToken(revoked)]) {
        const view = await repo.view(g.id, tokenHash);
        need(view.role === 'public' && view.restrictedContent === null && view.applications.length === 0 && view.application === null, 'participant_data_exposed');
      }
    });
    await check('synthetic_fixture_cleanup', 'cleanup', cleanup);
    complete = true;
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Za-z0-9_]{1,100}$/.test(error.code) ? error.code : 'verification_failed';
    console.log(JSON.stringify({ status: 'blocked_or_failed', stage, code, details: 'Raw errors and connection values suppressed.' }));
    process.exitCode = 1;
  } finally {
    if (connected) { await lock.query('ROLLBACK').catch(() => {}); await lock.end().catch(() => {}); }
    if (dirty) {
      try { await cleanup(); console.log('Synthetic cleanup completed after failure.'); }
      catch { console.log('Synthetic cleanup incomplete; delete ONLY the confirmed disposable branch.'); process.exitCode = 1; }
    }
    console.log(JSON.stringify({ status: complete ? 'publication_verification_passed' : process.exitCode ? 'failed' : 'preflight_passed', complete,
      passed: results.filter(row => row.status === 'passed').length, failed: results.filter(row => row.status === 'failed').length,
      behaviorChecksPassed: results.filter(row => row.kind === 'test' && row.status === 'passed').length,
      syntheticCleanup: dirty ? 'incomplete' : 'complete_or_not_needed', branchDeletionRequired: true,
      productionOrDevelopmentWrites: false, genuinePublication: false }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    need(process.argv.length === 3, 'one_mode_argument_required');
    await verifyPublication(process.argv[2]);
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Za-z0-9_]{1,100}$/.test(error.code) ? error.code : 'verification_stopped';
    console.log(JSON.stringify({ status: 'stopped_before_verification', code, credentials: 'suppressed' }));
    process.exitCode = 1;
  }
}
