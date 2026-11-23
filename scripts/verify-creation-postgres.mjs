// Owner-operated, disposable P2 verification ONLY. No environment loaders,
// migration loader, application database singleton, cleanup SQL or Neon API.
// Future use (only after separate live-write approval):
// node scripts/verify-creation-postgres.mjs --preflight [confirmation arguments]
// node scripts/verify-creation-postgres.mjs --apply-and-test [same arguments]
// Required non-secret arguments: --project-id, --branch-id, --hostname,
// --expires-at, --console-confirmed-at, --schema-only-confirmed, --evidence-dir.
// The operator confirms Console provenance/expiry; SQL cannot prove branch IDs.
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, open, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const BASELINE = '0ecf38f53436c887895dacb67fe3612cdf4d4ce5';
export const PROPOSAL_HASH = 'f4a1ab4d3aa4f276f7d9c94d9fd4c5c37848fe4eacc406bf3a7aeb71dac72b8a';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const EXPECTED_ROOT = '/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117';
const BRANCH = 'p2-creation-verify-20261118';
const ENDPOINT = 'ep-jolly-pond-aovq4jhw';
const OWNER = 'neondb_owner', RUNTIME = 'yawrd_07b_runtime';
const BASE_TABLES = ['applications','auth_challenges','auth_rate_limits','projects','restricted_content','review_decisions','sessions'];
// Product-owner tolerance for this disposable P2 branch only. These names do
// not approve historical definitions or Production compatibility. No grants
// or mutations on these tables are introduced by this runner.
const TOLERATED_TABLES=['agent_associations','yaw001_contribution_events','project_draft_reviews',
  'project_task_drafts','reviewed_project_packages','wordwake_reward_allocations','wordwake_reward_plans',
  'blueprint_events','blueprint_workspaces'];
const ALLOWED_TABLES=[...BASE_TABLES,...TOLERATED_TABLES];
// Only fixed runner check names may enter evidence, never database error text.
const PREFLIGHT_FAILURE_CODES=new Set([
  'server_identity_mismatch','additional_database_requires_review','unexpected_yawrd_inventory',
  'unexpected_user_inventory','inherited_operational_data','runtime_migration_ledger_access',
  'creation_objects_already_present','baseline_dependency_missing','dependency_columns_mismatch',
  'dependency_column_type_mismatch','delete_guard_mismatch','dependency_constraints_invalid',
  'dependency_constraints_mismatch','unexpected_authentication_trigger','unsafe_runtime_role',
  'owner_setup_privileges_missing','existing_project_grants_mismatch','existing_table_grants_mismatch',
  'existing_insert_grants_mismatch','existing_update_grants_mismatch',
]);
const INSERT = ['id','founder_account_id','source_draft_id','initial_intake','intake'];
const UPDATE = ['intake','public_name','public_description','account_label','second_steward','threshold','reviewed_revision','reviewed_public_text_digest','public_text_consent_version','public_text_reviewed_at'];
const FUNCTIONS = ['creation_text_digest(text,text)','creation_guard()','creation_founder(text)','creation_find_start(text,jsonb)','creation_start(text,text,jsonb)','creation_read(text,text)','creation_list(text,text,integer)','creation_save(text,text,bigint,jsonb,jsonb)','creation_review_public_text(text,text,bigint,text,text)'];
const CONSENT = 'creation-public-text-v1';
const METHODS = ['repository_http','sql_client','catalog_read_only','offline_source','response_loss_simulation'];
export const REQUIRED_TESTS = [
  ['concurrent_starts','repository_http'], ['source_lock_races','sql_client'],
  ['imports_and_collisions','repository_http'], ['revision_conflicts','repository_http'],
  ['save_and_review_lock_races','sql_client'], ['sessions_and_ownership','repository_http'],
  ['session_lock_timing','sql_client'], ['public_review','repository_http'],
  ['identity_and_origin','sql_client'], ['transaction_rollback','sql_client'],
  ['postcommit_recovery','response_loss_simulation'], ['runtime_denials','sql_client'],
  ['direct_sql_limitation','sql_client'], ['final_state','catalog_read_only'],
  ['offline_regressions','offline_source'],
];
const GATES = ['identity','inventory','dependencies','permissions','creation_absent'];
const REPO_ERRORS = new Set(['sign_in_required','creation_not_found','creation_import_conflict','creation_revision_conflict','creation_draft_identity_conflict','public_text_review_conflict','public_text_required','invalid_creation_configuration','public_text_review_required','invalid_creation_input','invalid_creation_limit','invalid_creation_revision','public_id_collision_limit']);
class Stop extends Error { constructor(code,sqlstate) { super(code); this.code=code; this.sqlstate=sqlstate; } }
function need(ok, code) { if (!ok) throw new Stop(code); }
const hash = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.replace(/\s+/g,' ').trim();
const same = isDeepStrictEqual;
const quote = name => '"'+name.replaceAll('"','""')+'"';
const inside = (parent, child) => { const r=relative(parent,child); return r==='' || (!r.startsWith('..'+sep) && r!=='..' && !isAbsolute(r)); };

export function parseArguments(args) {
  const result={};
  const keys=new Set(['project-id','branch-id','hostname','expires-at','console-confirmed-at','evidence-dir']);
  for (let i=0;i<args.length;i++) {
    const arg=args[i];
    if (['--preflight','--apply-and-test'].includes(arg)) {
      need(!result.mode,'one_mode_required'); result.mode=arg;
    } else if (arg==='--schema-only-confirmed') {
      need(!result.schemaOnly,'duplicate_argument'); result.schemaOnly=true;
    } else {
      const key=arg.startsWith('--')?arg.slice(2):'';
      need(keys.has(key) && !Object.hasOwn(result,key),'invalid_argument');
      need(typeof args[i+1]==='string' && !args[i+1].startsWith('--'),'argument_value_required');
      result[key]=args[++i];
    }
  }
  need(result.mode,'one_mode_required');
  return result;
}

// No I/O or driver loading. Tests supply synthetic credential strings only.
export function creationTargets(options, credentials, now=Date.now()) {
  need(['--preflight','--apply-and-test'].includes(options.mode),'invalid_mode');
  need(/^[a-z][a-z0-9-]{2,100}$/.test(options['project-id']??''),'console_project_required');
  need(/^br-[a-z0-9-]{3,100}$/.test(options['branch-id']??''),'console_branch_required');
  const hostname=options.hostname;
  need(typeof hostname==='string' && hostname.length<254 &&
    hostname.startsWith(ENDPOINT+'.') && /^[a-z0-9.-]+\.neon\.tech$/.test(hostname) &&
    hostname.split('.').every(label=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)), 'console_hostname_required');
  need(options.schemaOnly===true,'schema_only_confirmation_required');
  const confirmed=Date.parse(options['console-confirmed-at']);
  const expiration=Date.parse(options['expires-at']);
  for (const key of ['console-confirmed-at','expires-at']) need(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(options[key]??''),'explicit_timestamp_required');
  need(Number.isFinite(confirmed) && confirmed<=now && now-confirmed<=900000,'recent_console_confirmation_required');
  need(Number.isFinite(expiration) && expiration-now>=3600000,'one_hour_test_window_required');
  need(isAbsolute(options['evidence-dir']??'') && !/[\u0000\r\n]/.test(options['evidence-dir']),'private_evidence_directory_required');
  const urls=['P2_OWNER_DATABASE_URL','P2_RUNTIME_DATABASE_URL'].map((key,index)=>{
    let u;
    try { u=new URL(credentials[key]); } catch { throw new Stop(index?'runtime_url_required':'owner_url_required'); }
    need(['postgres:','postgresql:'].includes(u.protocol) && u.password,'explicit_credentials_required');
    // Client transactions require one stable backend; never rewrite pooled URLs.
    need(!u.hostname.split('.')[0].endsWith('-pooler'),'direct_connection_required');
    need(u.hostname===hostname,'endpoint_mismatch');
    need(u.pathname==='/neondb' && (!u.port || u.port==='5432') && !u.hash,'database_or_port_mismatch');
    let user;
    try { user=decodeURIComponent(u.username); } catch { throw new Stop('role_mismatch'); }
    need(user===(index?RUNTIME:OWNER),'role_mismatch');
    need(['require','verify-full'].includes(u.searchParams.get('sslmode')),'tls_required');
    for (const [k,v] of u.searchParams) {
      need(['sslmode','channel_binding','connect_timeout'].includes(k) && u.searchParams.getAll(k).length===1,'connection_override_forbidden');
      if (k==='channel_binding') need(['require','prefer'].includes(v),'connection_override_forbidden');
      if (k==='connect_timeout') need(/^(?:[1-9]|10)$/.test(v),'connection_override_forbidden');
    }
    return u.href;
  });
  return {ownerUrl:urls[0],runtimeUrl:urls[1],confirmation:{projectId:options['project-id'],branchId:options['branch-id'],branch:BRANCH,endpoint:ENDPOINT,hostname,database:'neondb',schemaOnlyConfirmed:true,confirmedAt:new Date(confirmed).toISOString(),expiresAt:new Date(expiration).toISOString()}};
}

export function verifyProposal(source) { need(hash(source)===PROPOSAL_HASH,'proposal_hash_mismatch'); return source; }
export function assertWriteGate(mode, gates) {
  need(mode==='--apply-and-test','write_mode_required');
  need(gates.proposal===PROPOSAL_HASH && GATES.every(key=>gates[key]===true),'preflight_incomplete');
}
export function safeCode(error) {
  if (error instanceof Stop) return error.code;
  if (/^[0-9A-Z]{5}$/.test(error?.code??'')) return error.code;
  if (REPO_ERRORS.has(error?.code)) return error.code;
  if (REPO_ERRORS.has(error?.message)) return error.message;
  return 'verification_failed';
}
// Neon 1.2.0 src/http/index.ts wraps fetch exceptions in sourceError; SQL
// responses instead populate code. Follow native cause chains, but give a known
// SQLSTATE or verifier assertion precedence over transport-looking metadata.
export function isHttpTransportFailure(error) {
  const chain=[], seen=new Set(), queue=[error];
  while (queue.length && chain.length<32) {
    const current=queue.shift();
    if (!current || typeof current!=='object' || seen.has(current)) continue;
    seen.add(current); chain.push(current); queue.push(current.sourceError,current.cause);
  }
  const transportCodes=new Set(['ABORT_ERR','ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','ENOTFOUND','EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET']);
  if (chain.some(e=>e instanceof Stop || e.code==='ERR_ASSERTION' ||
    (typeof e.code==='string' && /^[0-9A-Z]{5}$/.test(e.code) && !transportCodes.has(e.code)))) return false;
  return chain.some(e=>['AbortError','TimeoutError'].includes(e.name) || transportCodes.has(e.code) ||
    (e instanceof TypeError && e.message==='fetch failed') ||
    (e.name==='NeonDbError' && (e.sourceError instanceof Error ||
      /^Server error \(HTTP status \d{3}\):/.test(e.message??''))));
}
export function failureStatus(error) {
  return isHttpTransportFailure(error) || (error instanceof Stop &&
    ['offline_regressions_unavailable','required_lock_wait_not_observed','run_deadline_or_interrupt',
      'unknown_http_write_outcome','http_request_incomplete','read_only_reconciliation_required'].includes(error.code))
    ? 'INCOMPLETE':'FAIL';
}

// Only controlled counters enter the manifest: no SQL, values, errors or tokens.
// Pending is durably recorded BEFORE dispatch, so interruption/storage failure
// cannot leave evidence claiming that an unacknowledged write never happened.
export function createHttpOutcomeGuard(persist=async()=>{}) {
  const state={pending:0,unknown:0};
  const unresolved=()=>state.pending+state.unknown;
  function assertWritable() { need(state.unknown===0,'read_only_reconciliation_required'); }
  function evidence() {
    return {unknownWriteOutcome:unresolved()>0,reconciliationRequired:unresolved()>0,
      pendingHttpWrites:state.pending,unknownHttpWrites:state.unknown};
  }
  return {state,assertWritable,evidence,
    reportStatus:status=>unresolved()>0?'INCOMPLETE':status,
    async dispatch(mutation,send) {
      assertWritable();
      if (mutation) {state.pending++;await persist();}
      let result;
      try {assertWritable();result=await send();}
      catch (error) {
        const transport=isHttpTransportFailure(error);
        if (mutation) {state.pending--;if(transport) state.unknown++;await persist();}
        // There is deliberately no retry or reset. Reconcile retained fixtures
        // read-only before a separately authorized attempt; initialized branches
        // remain blocked by the existing preflight inventory/absence gates.
        if (transport) throw new Stop(mutation?'unknown_http_write_outcome':'http_request_incomplete');
        throw error;
      }
      if (mutation) {state.pending--;await persist();}
      return result;
    },
  };
}
export function failureDetails(error) {
  const code=safeCode(error),transport=isHttpTransportFailure(error),sqlstate=transport?undefined:error?.sqlstate??code;
  return {code,sqlstate,
    errorCategory:error instanceof Stop?'guard_rejection':transport?'transport_error':
      /^[0-9A-Z]{5}$/.test(sqlstate)?'postgres_error':'verification_error',
    ...(error instanceof Stop && code==='unexpected_yawrd_inventory'?error.inventory:{}),
  };
}
// Require the original seven dependencies and allow only the nine explicitly
// tolerated additions. Catalog ordering does not change table membership.
// Diagnostics suppress unexpected names.
export function assertYawrdInventory(relations) {
  const names=relations.filter(r=>r.nspname==='yawrd').map(r=>r.relname);
  const missingExpectedRelations=BASE_TABLES.filter(name=>!names.includes(name));
  const unexpectedRelationCount=names.filter(name=>!ALLOWED_TABLES.includes(name)).length;
  if (missingExpectedRelations.length===0 && unexpectedRelationCount===0 && new Set(names).size===names.length) return;
  const error=new Stop('unexpected_yawrd_inventory');
  error.inventory={expectedRelationCount:BASE_TABLES.length,observedRelationCount:names.length,
    unexpectedRelationCount,missingExpectedRelations,
    inventoryOrderMismatch:false};
  throw error;
}
// Called only within the owner's read-only preflight transaction, after relation
// kind/RLS validation. Every present operational table, including tolerated ones,
// must be empty. No historical definitions or records are read into evidence.
export async function assertOperationalTablesEmpty(client,relations) {
  assertYawrdInventory(relations);
  for (const r of relations.filter(r=>r.nspname==='yawrd')) {
    const {rows:[count]}=await client.query(`SELECT EXISTS(SELECT 1 FROM ${quote(r.nspname)}.${quote(r.relname)}) AS populated`);
    need(count.populated===false,'inherited_operational_data');
  }
}
export function evidenceEvent(name,status,mechanism,details={}) {
  need((REQUIRED_TESTS.some(t=>t[0]===name) || ['preflight','schema_setup','fixture_setup','connections_closed'].includes(name)) &&
    ['PASS','FAIL','INCOMPLETE'].includes(status) && METHODS.includes(mechanism),'invalid_evidence_event');
  const event={name,status,mechanism};
  for (const key of ['revision','distinctIds','rowCount','attempts','blockedWorkers','rollbackVerified','digestMatches','reviewInvalidated','fixtureCount','connectionsClosed','unknownWriteOutcome','reconciliationRequired','pendingHttpWrites','unknownHttpWrites','expectedRelationCount','observedRelationCount','unexpectedRelationCount','inventoryOrderMismatch']) {
    const value=details[key];
    if (typeof value==='boolean' || (Number.isSafeInteger(value) && value>=0)) event[key]=value;
  }
  if (PREFLIGHT_FAILURE_CODES.has(details.code)) event.code=details.code;
  if (['guard_rejection','postgres_error','transport_error','verification_error'].includes(details.errorCategory)) event.errorCategory=details.errorCategory;
  if (Array.isArray(details.missingExpectedRelations) && details.missingExpectedRelations.length<=BASE_TABLES.length &&
    details.missingExpectedRelations.every(name=>BASE_TABLES.includes(name))) event.missingExpectedRelations=details.missingExpectedRelations;
  if (/^[0-9A-Z]{5}$/.test(details.sqlstate??'')) event.sqlstate=details.sqlstate;
  if (Array.isArray(details.workerPids) && details.workerPids.length<=32 && details.workerPids.every(p=>Number.isSafeInteger(p) && p>0)) event.workerPids=details.workerPids;
  return event;
}
export function offlineSummary(output,allowSkipped=false) {
  const value=key=>Number([...output.matchAll(new RegExp(`^# ${key} (\\d+)$`,'gm'))].at(-1)?.[1]??NaN);
  const total=value('tests'),passed=value('pass'),failed=value('fail'),skipped=value('skipped');
  need(Number.isSafeInteger(total) && total>0 && Number.isSafeInteger(passed) && passed>0 && failed===0 && Number.isSafeInteger(skipped),'offline_regressions_unavailable');
  need(allowSkipped || skipped===0,'offline_regressions_unavailable');
  return {passed,skipped};
}

// Even an unexpectedly successful destructive probe is rolled back. Never send
// BEGIN on a Client and then pretend an HTTP query joins that transaction.
export async function rollbackProbe(client,sql,values=[],expected='42501',expectedMessage) {
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  let actual='unexpected_success', message;
  try { await client.query(sql,values); }
  catch (error) { actual=safeCode(error); message=error?.message; }
  finally { await client.query('ROLLBACK'); }
  if (actual!==expected || (expectedMessage && message!==expectedMessage)) throw new Stop('negative_probe_mismatch',actual);
  return {sqlstate:actual,rollbackVerified:true};
}

function git(args) {
  try { return execFileSync('git',args,{cwd:ROOT,env:{PATH:'/usr/bin:/bin',LANG:'C'},encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
  catch { throw new Stop('git_checkpoint_unavailable'); }
}
function checkCheckpoint() {
  need(resolve(ROOT)===EXPECTED_ROOT,'worktree_mismatch');
  need(git(['rev-parse','HEAD'])===BASELINE,'head_mismatch');
  need(git(['branch','--show-current'])==='feature/phase2-private-creation-p2-postgres-20261117','branch_mismatch');
  const paths=git(['status','--porcelain=v1','--untracked-files=all']).split('\n').filter(Boolean);
  need(paths.every(line=>/^\?\? (scripts\/verify-creation-postgres\.mjs|test\/creation-postgres-guards\.test\.mjs)$/.test(line)), 'unexpected_worktree_changes');
}

async function evidenceFiles(directory,confirmation) {
  // Require an existing private parent; create a unique subdirectory so reports
  // cannot overwrite evidence from an earlier run or follow pre-existing files.
  const parent=await realpath(directory), info=await stat(parent);
  const common=await realpath(resolve(ROOT,git(['rev-parse','--git-common-dir'])));
  need(info.isDirectory() && (info.mode&0o077)===0 && info.uid===process.getuid(),'private_evidence_directory_required');
  need(!inside(await realpath(ROOT),parent) && !inside(resolve(common,'..'),parent),'evidence_inside_repository');
  const worktrees=git(['worktree','list','--porcelain']).split('\n').filter(line=>line.startsWith('worktree ')).map(line=>line.slice(9));
  need(worktrees.every(path=>!inside(resolve(path),parent)),'evidence_inside_repository');
  const runId=randomBytes(8).toString('hex');
  const location=resolve(parent,'yawrd-p2-'+runId);
  await mkdir(location,{mode:0o700});
  const handles={};
  try {
    for (const name of ['results.jsonl','summary.json','fixture-manifest.json','target-confirmation.json']) handles[name]=await open(resolve(location,name),'wx',0o600);
  } catch {
    await Promise.allSettled(Object.values(handles).map(h=>h.close()));
    throw new Stop('evidence_storage_unavailable');
  }
  // Concurrent starts must not truncate/write the fixture manifest in parallel.
  // Capture each projection now, then serialize writes to the same private files.
  let queue=Promise.resolve();
  const enqueue=fn=>{const operation=queue.then(fn);queue=operation.catch(()=>{});return operation;};
  const write=(name,value)=>{
    const data=JSON.stringify(value)+'\n';
    return enqueue(async()=>{await handles[name].truncate(0);await handles[name].write(data,0,'utf8');await handles[name].sync();});
  };
  await write('target-confirmation.json',confirmation);
  return {runId,write,append:value=>{
    const data=JSON.stringify(value)+'\n';
    return enqueue(async()=>{await handles['results.jsonl'].write(data);await handles['results.jsonl'].sync();});
  },close:async()=>{await queue;await Promise.all(Object.values(handles).map(h=>h.close()));}};
}

const PERMISSIONS=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
async function readOnly(client,fn) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL row_security=off");
    const value=await fn(); await client.query('COMMIT'); return value;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
async function grants(client) {
  const {rows:tables}=await client.query(`SELECT c.relname,p.permission,has_table_privilege($1,c.oid,p.permission) AS allowed
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN unnest($2::text[]) p(permission) WHERE n.nspname='yawrd' AND c.relkind='r' ORDER BY 1,2`,[RUNTIME,PERMISSIONS]);
  const {rows:columns}=await client.query(`SELECT c.relname,a.attname,
    has_column_privilege($1,c.oid,a.attnum,'INSERT') AS ins,has_column_privilege($1,c.oid,a.attnum,'UPDATE') AS upd
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='yawrd' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1,2`,[RUNTIME]);
  return {tables,columns};
}
async function baseCatalog(client) {
  const {rows}=await client.query(`SELECT kind,id,md5(definition) AS fingerprint FROM (
    SELECT 'column' AS kind,c.oid::text||':'||a.attnum::text AS id,
      concat_ws('|',a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) AS definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname='yawrd' AND c.relkind IN ('r','p') AND c.relname<>'creation_drafts' AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'constraint',k.oid::text,pg_get_constraintdef(k.oid)||k.convalidated::text FROM pg_constraint k
    JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='yawrd' AND c.relname<>'creation_drafts'
    UNION ALL SELECT 'index',i.indexrelid::text,pg_get_indexdef(i.indexrelid)||i.indisvalid::text||i.indisready::text FROM pg_index i
    JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='yawrd' AND c.relname<>'creation_drafts'
    UNION ALL SELECT 'trigger',t.oid::text,pg_get_triggerdef(t.oid)||t.tgenabled::text FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='yawrd' AND c.relname<>'creation_drafts' AND NOT t.tgisinternal
    UNION ALL SELECT 'function',p.oid::text,pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'') FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='yawrd' AND left(p.proname,9)<>'creation_'
  ) x ORDER BY kind,id`);
  return rows;
}
export function checkBaseGrants(snapshot) {
  // Validate only the original seven-table privilege contract. Keep the complete
  // snapshot intact so final verification still detects changes on all 16 tables.
  const tables=snapshot.tables.filter(row=>BASE_TABLES.includes(row.relname));
  const columns=snapshot.columns.filter(row=>BASE_TABLES.includes(row.relname));
  const inserts=['applications','review_decisions','auth_challenges','sessions','auth_rate_limits'];
  const updates={auth_challenges:['consumed_at'],sessions:['revoked_at'],auth_rate_limits:['attempts','resets_at']};
  const projectInsert=['network','id','creator_account_id','dao_account_id','name','description','objectives','participation','rewards'];
  // Recognize only the already documented all-or-none Genesis column INSERT
  // grant and optional published_at UPDATE; never create/expand either here.
  const project=columns.filter(c=>c.relname==='projects');
  const projectEnabled=project.some(c=>c.ins);
  if (projectEnabled) need(projectInsert.every(name=>project.some(c=>c.attname===name && c.ins)),'existing_project_grants_mismatch');
  for (const row of tables) need(row.allowed===(row.permission==='SELECT' || (row.permission==='INSERT' && inserts.includes(row.relname))), 'existing_table_grants_mismatch');
  for (const row of columns) {
    need(row.ins===(row.relname==='projects'?projectEnabled && projectInsert.includes(row.attname):inserts.includes(row.relname)),'existing_insert_grants_mismatch');
    need(row.upd===(row.relname==='projects'?row.attname==='published_at' && project.find(c=>c.attname==='published_at')?.upd:(updates[row.relname]??[]).includes(row.attname)),'existing_update_grants_mismatch');
  }
}

export function assertExistingGrantsUnchanged(after,before) {
  need(same(after.tables.filter(r=>r.relname!=='creation_drafts'),before.tables) &&
    same(after.columns.filter(r=>r.relname!=='creation_drafts'),before.columns),'existing_privileges_changed');
}

async function preflight(owner,runtime,baseSource) {
  const gates={};
  for (const [client,role] of [[owner,OWNER],[runtime,RUNTIME]]) await readOnly(client,async()=>{
    const {rows:[id]}=await client.query('SELECT current_database() AS database,current_user AS role,session_user AS login');
    need(id.database==='neondb' && id.role===role && id.login===role,'server_identity_mismatch');
  });
  gates.identity=true;
  const result=await readOnly(owner,async()=>{
    const {rows:dbs}=await owner.query("SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname");
    need(dbs.every(r=>['neondb','postgres'].includes(r.datname)),'additional_database_requires_review');
    const {rows:relations}=await owner.query(`SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','m','f','v') ORDER BY 1,2`);
    // Fail closed on unknown relations, including foreign tables/views. Their
    // classification needs owner review, never automatic deletion or execution.
    assertYawrdInventory(relations);
    need(relations.every(r=>r.relkind==='r' && !r.relrowsecurity && !r.relforcerowsecurity &&
      (r.nspname==='yawrd' || (r.nspname==='public' && r.relname==='yawrd_migrations'))),'unexpected_user_inventory');
    await assertOperationalTablesEmpty(owner,relations);
    if (relations.some(r=>r.nspname==='public')) {
      const {rows:[ledger]}=await owner.query("SELECT has_table_privilege($1,'public.yawrd_migrations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS accessible",[RUNTIME]);
      need(!ledger.accessible,'runtime_migration_ledger_access');
    }
    gates.inventory=true;
    const {rows:existing}=await owner.query("SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='yawrd' AND left(p.proname,9)='creation_'");
    const {rows:[absent]}=await owner.query("SELECT to_regclass('yawrd.creation_drafts') IS NULL AS absent");
    need(existing.length===0 && absent.absent,'creation_objects_already_present'); gates.creation_absent=true;
    const {rows:columns}=await owner.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='yawrd' AND table_name IN ('sessions','auth_challenges')");
    for (const table of ['sessions','auth_challenges']) {
      const definition=baseSource.match(new RegExp(`CREATE TABLE yawrd\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
      need(definition,'baseline_dependency_missing');
      const names=definition.split('\n').map(s=>s.match(/^  ([a-z_]+) (?:text|bigint|timestamptz)/)?.[1]).filter(Boolean);
      need(same(columns.filter(c=>c.table_name===table).map(c=>c.column_name).sort(),names.sort()),'dependency_columns_mismatch');
    }
    const {rows:types}=await owner.query(`SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
      WHERE table_schema='yawrd' AND table_name IN ('sessions','auth_challenges')`);
    for (const column of types) {
      const expected=/_at$/.test(column.column_name)?'timestamp with time zone':column.column_name==='block_height'?'bigint':'text';
      const nullable=['consumed_at','revoked_at'].includes(column.column_name);
      need(column.data_type===expected && column.is_nullable===(nullable?'YES':'NO'),'dependency_column_type_mismatch');
    }
    const {rows:[guard]}=await owner.query("SELECT prosrc,prosecdef,prorettype='trigger'::regtype AS trigger_type FROM pg_proc WHERE oid=to_regprocedure('yawrd.prevent_mutation()')");
    const body=baseSource.match(/CREATE FUNCTION yawrd\.prevent_mutation\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$/)?.[1];
    need(guard && !guard.prosecdef && guard.trigger_type && normalize(guard.prosrc)===normalize(body??''),'delete_guard_mismatch');
    const {rows:[sha]}=await owner.query("SELECT to_regprocedure('pg_catalog.sha256(bytea)') IS NOT NULL AS present");
    const {rows:constraints}=await owner.query(`SELECT conrelid::regclass::text AS relation,contype,convalidated,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid IN ('yawrd.sessions'::regclass,'yawrd.auth_challenges'::regclass)`);
    need(sha.present && constraints.every(c=>c.convalidated),'dependency_constraints_invalid');
    for (const fragment of ['PRIMARY KEY (token_hash)','UNIQUE (challenge_id)','FOREIGN KEY (challenge_id, network, account_id)','expires_at > created_at','1 hour','PRIMARY KEY (id)','UNIQUE (id, network, account_id)','5 mins','testnet']) {
      // PostgreSQL prints the five-minute interval as 00:05:00, not source SQL.
      const needle=fragment==='5 mins'?'00:05:00':fragment==='1 hour'?'01:00:00':fragment;
      need(constraints.some(c=>c.definition.includes(needle)),'dependency_constraints_mismatch');
    }
    const {rows:triggers}=await owner.query("SELECT tgname FROM pg_trigger WHERE tgrelid IN ('yawrd.sessions'::regclass,'yawrd.auth_challenges'::regclass) AND NOT tgisinternal");
    need(triggers.length===0,'unexpected_authentication_trigger'); gates.dependencies=true;
    // TEMP (including through PUBLIC) is tolerated for isolated trusted-server P2.
    // Permanent schema/database CREATE and every other role restriction remain.
    const {rows:[role]}=await owner.query(`SELECT rolcanlogin AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)
      AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE proowner=r.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=r.oid)
      AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datdba=r.oid)
      AND has_schema_privilege(r.oid,'yawrd','USAGE') AND NOT has_schema_privilege(r.oid,'yawrd','CREATE')
      AND NOT has_schema_privilege(r.oid,'public','CREATE') AND NOT has_database_privilege(r.oid,current_database(),'CREATE') AS safe FROM pg_roles r WHERE rolname=$1`,[RUNTIME]);
    need(role?.safe===true,'unsafe_runtime_role');
    const {rows:[admin]}=await owner.query(`SELECT has_schema_privilege(current_user,'yawrd','CREATE')
      AND has_function_privilege(current_user,'yawrd.prevent_mutation()','EXECUTE')
      AND has_table_privilege(current_user,'yawrd.auth_challenges','INSERT')
      AND has_table_privilege(current_user,'yawrd.sessions','INSERT')
      AND has_column_privilege(current_user,'yawrd.sessions','revoked_at','UPDATE') AS ready`);
    need(admin.ready,'owner_setup_privileges_missing');
    const snapshot=await grants(owner); checkBaseGrants(snapshot); gates.permissions=true;
    const {rows:defaults}=await owner.query('SELECT defaclrole::text,defaclnamespace::text,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY 1,2,3');
    return {snapshot,defaults,relations,catalog:await baseCatalog(owner)};
  });
  return {...result,gates};
}

const APPROVED_GRANTS=[
  `GRANT SELECT ON yawrd.creation_drafts TO ${RUNTIME}`,
  `GRANT INSERT (${INSERT.join(',')}) ON yawrd.creation_drafts TO ${RUNTIME}`,
  `GRANT UPDATE (${UPDATE.join(',')}) ON yawrd.creation_drafts TO ${RUNTIME}`,
  `GRANT EXECUTE ON FUNCTION ${FUNCTIONS.filter(f=>f!=='creation_guard()').map(f=>'yawrd.'+f).join(',')} TO ${RUNTIME}`,
];
async function creationGrants(owner) {
  const snapshot=await grants(owner);
  const table=snapshot.tables.filter(r=>r.relname==='creation_drafts');
  need(table.length===PERMISSIONS.length && table.every(r=>r.allowed===(r.permission==='SELECT')),'creation_table_grants_mismatch');
  const columns=snapshot.columns.filter(r=>r.relname==='creation_drafts');
  need(columns.length===19 && columns.every(c=>c.ins===INSERT.includes(c.attname) && c.upd===UPDATE.includes(c.attname)),'creation_column_grants_mismatch');
  for (const fn of FUNCTIONS) {
    const {rows:[r]}=await owner.query(`SELECT NOT p.prosecdef AS invoker,has_function_privilege($1,p.oid,'EXECUTE') AS runtime,
      NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_closed,
      NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname=$1)) OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND a.is_grantable)) AS grantees_safe
      FROM pg_proc p WHERE p.oid=to_regprocedure($2)`,[RUNTIME,'yawrd.'+fn]);
    need(r?.invoker && r.public_closed && r.grantees_safe && r.runtime===(fn!=='creation_guard()'),'creation_function_grants_mismatch');
  }
  const {rows:[unexpected]}=await owner.query(`SELECT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid='yawrd.creation_drafts'::regclass AND (a.grantee NOT IN (c.relowner,(SELECT oid FROM pg_roles WHERE rolname=$1)) OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1) AND a.is_grantable))) AS present`,[RUNTIME]);
  need(!unexpected.present,'unexpected_creation_grantee');
  const {rows:triggers}=await owner.query("SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid='yawrd.creation_drafts'::regclass AND NOT tgisinternal ORDER BY tgname");
  need(same(triggers.map(t=>t.tgname),['guard_creation','preserve_creation_identity']) && triggers.every(t=>t.tgenabled==='O'),'creation_triggers_mismatch');
  return snapshot;
}

export async function verifyCreation(options, credentials) {
  // These pure guards and the pinned source check finish before any driver is
  // imported. Do not add a caller-supplied connection/driver bypass here.
  const target=creationTargets(options,credentials);
  checkCheckpoint();
  const proposal=verifyProposal(await readFile(new URL('../docs/proposals/migrations/phase2_private_creation_p1.sql',import.meta.url),'utf8'));
  const baseSource=await readFile(new URL('../migrations/001_participants.sql',import.meta.url),'utf8');
  need(typeof WebSocket==='function','native_websocket_required');
  const evidence=await evidenceFiles(options['evidence-dir'],target.confirmation);
  const results=[], clients=[], pending=new Set(), regressionEvidence=[];
  const httpOutcomes=createHttpOutcomeGuard(()=>persist());
  const manifest={runId:evidence.runId,accounts:[],sessions:[],sources:[],candidates:[],schema:'not_submitted',httpWrites:httpOutcomes.state};
  const abort=new AbortController();
  let stage='preflight', finalStatus='INCOMPLETE', failureCode, setup=false, closure=true, deadline=Date.now()+900000;
  let owner,runtime,r1,r2,driver,CreationRepository,createEmptyYawrdIntakeDraft,updateYawrdIntakeDraft,generatePublicId;
  const persist=()=>evidence.write('fixture-manifest.json',manifest);
  const onSignal=()=>abort.abort();
  process.on('SIGINT',onSignal); process.on('SIGTERM',onSignal);
  const timer=setTimeout(onSignal,900000);
  function running() { httpOutcomes.assertWritable();need(!abort.signal.aborted && Date.now()<deadline,'run_deadline_or_interrupt'); }
  async function emit(name,status,mechanism,details) {
    const event=evidenceEvent(name,status,mechanism,details); results.push(event);
    await evidence.append(event); console.log(JSON.stringify(event));
  }
  async function check(name,mechanism,fn) {
    stage=name; running();
    try { const details=await fn();httpOutcomes.assertWritable();await emit(name,'PASS',mechanism,details); }
    catch (error) {
      await emit(name,failureStatus(error),mechanism,{...failureDetails(error),...httpOutcomes.evidence()}); throw error;
    }
  }
  async function connect(role) {
    const client=new driver.Client({connectionString:role===OWNER?target.ownerUrl:target.runtimeUrl,connectionTimeoutMillis:10000});
    client.on('error',()=>{abort.abort();}); clients.push(client);
    await client.connect();
    const query=client.query.bind(client);
    client.p2raw=query;
    client.query=(text,...args)=>{
      if (typeof text!=='string' || !/^ROLLBACK\b/.test(text)) running();
      return query(text,...args);
    };
    await client.query("SET statement_timeout='20s'");
    await client.query("SET lock_timeout='10s'");
    await client.query("SET idle_in_transaction_session_timeout='25s'");
    await client.query("SELECT set_config('application_name',$1,false)",['yawrd-p2-'+evidence.runId]);
    const {rows:[identity]}=await client.query('SELECT current_user AS role,session_user AS login,current_database() AS database,pg_backend_pid() AS pid');
    need(identity.role===role && identity.login===role && identity.database==='neondb','client_identity_mismatch');
    client.p2pid=identity.pid;
    return client;
  }
  try {
    // Imports have no environment-loader side effects. The repository's database
    // import is type-only; it receives exclusively the Query dependency below.
    driver=await import('@neondatabase/serverless');
    ({CreationRepository}=await import('../src/creation/repository.ts'));
    ({createEmptyYawrdIntakeDraft,updateYawrdIntakeDraft}=await import('../src/yawrd-intake.ts'));
    ({generatePublicId}=await import('../src/project-identity.ts'));
    owner=await connect(OWNER); runtime=await connect(RUNTIME);
    let baseline;
    await check('preflight','catalog_read_only',async()=>{
      baseline=await preflight(owner,runtime,baseSource);
      baseline.gates.proposal=PROPOSAL_HASH;
      await evidence.write('target-confirmation.json',{
        ...target.confirmation,
        postgresVersion:(await owner.query("SHOW server_version")).rows[0].server_version,
        rolesVerified:[OWNER,RUNTIME],operationalTablesEmpty:true,
        existingGenesisInsert:baseline.snapshot.columns.some(c=>c.relname==='projects' && c.ins),
        existingPublicationUpdate:baseline.snapshot.columns.some(c=>c.relname==='projects' && c.attname==='published_at' && c.upd),
      });
    });
    if (options.mode==='--preflight') { finalStatus='PREFLIGHT_PASS'; } else {
    // Revalidate wall-clock confirmation and test window immediately before DDL.
    creationTargets(options,credentials);
    assertWriteGate(options.mode,baseline.gates);
    await check('schema_setup','sql_client',async()=>{
      manifest.schema='submitted'; await persist();
      await owner.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      try {
        await owner.query(proposal);
        for (const sql of APPROVED_GRANTS) await owner.query(sql);
        await creationGrants(owner);
        await owner.query('COMMIT'); setup=true; manifest.schema='committed'; await persist();
      } catch (error) { await owner.query('ROLLBACK'); throw error; }
    });
    r1=await connect(RUNTIME); r2=await connect(RUNTIME);
    const neon=driver.neon(target.runtimeUrl);
    const a=`p2-a-${evidence.runId}.testnet`, b=`p2-b-${evidence.runId}.testnet`;
    manifest.accounts=[a,b]; await persist();
    let sourceCounter=0, startAttempts=0;
    function draft(label) {
      need(manifest.sources.length<128,'creation_fixture_ceiling');
      const id=`p2-${evidence.runId}-${++sourceCounter}-${label}`;
      manifest.sources.push(id);
      const now=new Date().toISOString();
      return {...updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft(id,now),{
        projectType:'community',startingPoint:'idea',intendedBudget:'undecided',availableResources:' Synthetic resources\n',
        successCriteria:'Synthetic outcome',initialOutcomeConfirmed:true,founderDescription:' Synthetic original — 🐳\n',
      },now),projectName:'Synthetic private name'};
    }
    async function candidate(id) {
      need(++startAttempts<=128,'creation_attempt_ceiling');
      if (!manifest.candidates.includes(id)) manifest.candidates.push(id);
      await persist();
    }
    const track=promise=>{pending.add(promise); promise.then(()=>pending.delete(promise),()=>pending.delete(promise)); return promise;};
    let httpMutations=0;
    function httpQuery(negative=false) {
      return async(sql,values=[])=>{
        running();
        const mutation=/yawrd\.creation_(start|save|review_public_text)\(/.test(sql);
        if (sql.includes('yawrd.creation_start(')) await candidate(values[1]);
        running();
        const statements=[neon.query("SET LOCAL statement_timeout='20s'"),neon.query("SET LOCAL lock_timeout='10s'"),
          neon.query("SELECT set_config('application_name',$1,true)",['yawrd-p2-'+evidence.runId]),neon.query(sql,values)];
        if (negative==='collision' && mutation) {
          // A confirmed collision returns zero rows normally. Permit that result,
          // but abort the HTTP transaction if a supposedly exhausted start inserts
          // its source. This preserves the allocator's real five-attempt behavior.
          need(sql.includes('yawrd.creation_start('),'invalid_collision_probe');
          statements.push(neon.query(`SELECT 1/(NOT EXISTS(SELECT 1 FROM yawrd.creation_drafts
            WHERE network='testnet' AND founder_account_id=$1 AND source_draft_id=$2))::integer`,[a,JSON.parse(values[2]).draftId]));
        } else if (negative && mutation) statements.push(neon.query("DO $$ BEGIN RAISE EXCEPTION 'p2_probe_unexpected_success'; END $$"));
        try {
          const result=await track(httpOutcomes.dispatch(mutation,()=>{
            running();
            return neon.transaction(statements,{isolationLevel:'ReadCommitted',fetchOptions:{cache:'no-store',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(25000)])}});
          }));
          if (mutation) httpMutations++;
          return result[3];
        } catch (error) {
          if (error?.message==='p2_probe_unexpected_success' || (negative==='collision' && error?.code==='22012')) throw new Stop('negative_repository_unexpected_success');
          throw error;
        }
      };
    }
    const query=httpQuery(), repo=new CreationRepository(query), negativeRepo=new CreationRepository(httpQuery(true));
    async function expectFailure(fn,code) {
      let actual='unexpected_success';
      try { await fn(); } catch (error) {
        if (failureStatus(error)==='INCOMPLETE') throw error;
        actual=safeCode(error);
      }
      need(actual===code,'expected_failure_mismatch');
    }
    async function session(account,kind='valid') {
      need(manifest.sessions.length<32,'session_fixture_ceiling');
      const id=randomBytes(32).toString('base64url'), tokenHash=hash(randomBytes(32));
      manifest.sessions.push({alias:`session-${manifest.sessions.length+1}`,challengeId:id,account,kind,state:'submitted'}); await persist();
      await owner.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      try {
        await owner.query(`INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
          VALUES($1,$2,$3,'testnet','https://p2-creation-verification.invalid','SYNTHETIC P2; no human signature','P2 verification',$4,statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp())`,[id,hash(randomBytes(32)),account,randomBytes(32).toString('base64')]);
        await owner.query(`INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash,created_at,expires_at,revoked_at)
          VALUES($1,$2,'testnet',$3,'synthetic-key',1,'synthetic-block',
            statement_timestamp()-CASE WHEN $4='expired' THEN interval '2 hours' ELSE interval '0' END,
            statement_timestamp()+CASE WHEN $4='expired' THEN -interval '1 hour' WHEN $4='short' THEN interval '5 seconds' ELSE interval '1 hour' END,
            CASE WHEN $4='revoked' THEN statement_timestamp() END)`,[tokenHash,id,account,kind]);
        await owner.query('COMMIT'); manifest.sessions.at(-1).state='committed'; await persist();
      } catch (error) { await owner.query('ROLLBACK'); throw error; }
      return tokenHash;
    }
    let ah,ah2,bh,expired,revoked;
    await check('fixture_setup','sql_client',async()=>{
      ah=await session(a);ah2=await session(a);bh=await session(b);
      expired=await session(a,'expired');revoked=await session(a,'revoked');
      return {fixtureCount:5};
    });
    const config=()=>({publicName:' Synthetic public name ',publicDescription:' Synthetic public description\n',accountLabel:'p2-project',secondSteward:'p2-steward.testnet',threshold:2});
    const review=row=>({expectedRevision:row.revision,publicTextDigest:row.publicTextDigest,consent:true,consentVersion:CONSENT});
    const sqlStart=async(client,h,id,input)=>{await candidate(id); return client.query('SELECT * FROM yawrd.creation_start($1,$2,$3::jsonb)',[h,id,JSON.stringify(input)]);};
    const sqlSave=(client,h,row,c=config())=>client.query('SELECT * FROM yawrd.creation_save($1,$2,$3,NULL,$4::jsonb)',[h,row.id,row.revision,JSON.stringify(c)]);
    const sqlReview=(client,h,row)=>client.query('SELECT * FROM yawrd.creation_review_public_text($1,$2,$3,$4,$5)',[h,row.id,row.revision,row.publicTextDigest,CONSENT]);
    const outcome=promise=>promise.then(value=>({value}),error=>({error}));
    async function rolledBack(client,fn) {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      try {return await fn();} finally {await client.query('ROLLBACK');}
    }
    async function blocked(workers) {
      const end=Date.now()+5000;
      while (Date.now()<end) {
        const {rows}=await owner.query('SELECT pid,cardinality(pg_blocking_pids(pid))>0 AS blocked FROM pg_stat_activity WHERE pid=ANY($1::integer[])',[workers.map(c=>c.p2pid)]);
        if (rows.length===workers.length && rows.every(r=>r.blocked)) return rows.length;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Stop('required_lock_wait_not_observed');
    }
    async function held(sql,values,fn) {
      const jobs=[];
      await owner.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      try { await owner.query(sql,values); return await fn(jobs); }
      finally { await owner.query('ROLLBACK'); await Promise.all(jobs); }
    }
    async function unchanged(id,fn) {
      const before=await repo.read(ah,id); await fn();
      need(same(await repo.read(ah,id),before),'denial_changed_creation');
    }
    let primary,original;
    await check('concurrent_starts','repository_http',async()=>{
      const rows=await Promise.all(Array.from({length:16},(_,i)=>repo.start(ah,draft('parallel-'+i))));
      need(new Set(rows.map(r=>r.id)).size===16 && rows.every(r=>/^yawrd-[a-z2-7]{12}$/.test(r.id)),'distinct_start_ids_failed');
      original=draft('shared');
      const shared=await Promise.all(Array.from({length:8},(_,i)=>repo.start(i%2?ah:ah2,original)));
      need(new Set(shared.map(r=>r.id)).size===1,'same_source_multiple_ids'); primary=shared[0];
      return {distinctIds:16,rowCount:1};
    });
    await check('source_lock_races','sql_client',async()=>{
      for (const mode of ['commit','conflict','rollback']) {
        const input=draft('held-'+mode), first=generatePublicId(), second=generatePublicId();
        await held('SELECT 1',[],async jobs=>{
          await sqlStart(owner,ah,first,input);
          const job=outcome(mode==='conflict'
            ?rolledBack(r1,()=>sqlStart(r1,ah2,second,{...input,projectName:'Different original'}))
            :sqlStart(r1,ah2,second,input)); jobs.push(job);
          await blocked([r1]);
          await owner.query(mode==='rollback'?'ROLLBACK':'COMMIT');
          const result=await job;
          if (mode==='conflict') need(result.error?.code==='P0001' && result.error.message==='creation_import_conflict','source_conflict_race_failed');
          else need(!result.error && result.value.rows.length===1 && result.value.rows[0].id===(mode==='rollback'?second:first),'source_race_winner_failed');
        });
      }
      return {blockedWorkers:1,workerPids:[r1.p2pid],rollbackVerified:true};
    });
    await check('imports_and_collisions','repository_http',async()=>{
      primary=await repo.updateIntake(ah,primary.id,primary.revision,{...original,projectName:'Edited current private name'});
      need(same(await repo.start(ah,original),primary),'original_import_did_not_recover_current');
      await unchanged(primary.id,()=>expectFailure(()=>negativeRepo.start(ah,{...original,projectName:'Different import'}),'creation_import_conflict'));
      const byte=randomBytes(1)[0]&31;
      const occupied=await new CreationRepository(query,n=>new Uint8Array(n).fill(byte)).start(bh,draft('collision-owner'));
      let attempts=0;
      const recovered=await new CreationRepository(query,n=>new Uint8Array(n).fill(attempts++===0?byte:(byte+1)%32)).start(ah,draft('collision-retry'));
      need(recovered.id!==occupied.id && attempts===2,'collision_retry_failed');
      attempts=0;
      await expectFailure(()=>new CreationRepository(httpQuery('collision'),n=>{attempts++;return new Uint8Array(n).fill(byte);}).start(ah,draft('collision-limit')),'public_id_collision_limit');
      need(attempts===5,'collision_retry_limit_failed');
      let unknownAttempts=0;
      const unknown=new CreationRepository(async(sql,args)=>{
        if (sql.includes('creation_start(')) {unknownAttempts++; throw new Stop('injected_unknown_outcome');}
        return query(sql,args);
      });
      await expectFailure(()=>unknown.start(ah,draft('unknown-no-submit')),'injected_unknown_outcome');
      need(unknownAttempts===1,'unknown_error_retried');
      return {attempts:5};
    });
    await check('revision_conflicts','repository_http',async()=>{
      const current=await repo.read(ah,primary.id);
      const results=await Promise.all([outcome(repo.updateConfiguration(ah,current.id,current.revision,config())),outcome(repo.updateConfiguration(ah2,current.id,current.revision,{...config(),publicName:'Other writer'}))]);
      need(results.filter(r=>r.value).length===1 && results.filter(r=>r.error?.code==='creation_revision_conflict').length===1,'revision_winner_failed');
      primary=await repo.read(ah,current.id); need(primary.revision===current.revision+1,'revision_increment_failed');
      const noop=await repo.updateConfiguration(ah,primary.id,primary.revision,primary.configuration);
      need(same(noop,primary),'noop_changed_state');
      await unchanged(primary.id,()=>expectFailure(()=>negativeRepo.updateConfiguration(ah,primary.id,current.revision,primary.configuration),'creation_revision_conflict'));
      return {revision:primary.revision};
    });
    await check('save_and_review_lock_races','sql_client',async()=>{
      let current=await repo.read(ah,primary.id);
      await held('SELECT id FROM yawrd.creation_drafts WHERE id=$1 FOR UPDATE',[current.id],async jobs=>{
        const first=outcome(sqlSave(r1,ah,current,{...config(),publicName:'Lock writer one'}));
        const second=outcome(sqlSave(r2,ah2,current,{...config(),publicName:'Lock writer two'})); jobs.push(first,second);
        await blocked([r1,r2]); await owner.query('COMMIT');
        const results=await Promise.all(jobs);
        need(results.filter(r=>r.value).length===1 && results.filter(r=>r.error?.message==='creation_revision_conflict').length===1,'sql_save_race_failed');
      });
      current=await repo.read(ah,current.id);
      await held('SELECT id FROM yawrd.creation_drafts WHERE id=$1 FOR UPDATE',[current.id],async jobs=>{
        jobs.push(outcome(sqlReview(r1,ah,current)),outcome(sqlSave(r2,ah2,current,{...config(),publicName:'Edit competing with review'})));
        await blocked([r1,r2]); await owner.query('COMMIT');
        const [reviewResult,saveResult]=await Promise.all(jobs);
        need(!saveResult.error && (!reviewResult.error || reviewResult.error.message==='creation_revision_conflict'),'review_save_race_failed');
      });
      primary=await repo.read(ah,current.id);
      need(primary.revision===current.revision+1 && primary.publicTextReview===null,'review_survived_concurrent_edit');
      return {blockedWorkers:2,workerPids:[r1.p2pid,r2.p2pid],reviewInvalidated:true};
    });
    await check('sessions_and_ownership','repository_http',async()=>{
      const row=await repo.read(ah,primary.id);
      const inputs=[null,hash(randomBytes(32)),expired,revoked];
      for (const h of inputs) {
        for (const call of [()=>negativeRepo.start(h,draft('denied')),()=>negativeRepo.read(h,row.id),()=>negativeRepo.list(h),()=>negativeRepo.updateIntake(h,row.id,row.revision,row.intake),()=>negativeRepo.updateConfiguration(h,row.id,row.revision,config()),()=>negativeRepo.reviewPublicText(h,row.id,review(row))])
          await unchanged(row.id,()=>expectFailure(call,'sign_in_required'));
      }
      for (const call of [()=>negativeRepo.read(bh,row.id),()=>negativeRepo.updateIntake(bh,row.id,row.revision,row.intake),()=>negativeRepo.updateConfiguration(bh,row.id,row.revision,config()),()=>negativeRepo.reviewPublicText(bh,row.id,review(row))])
        await unchanged(row.id,()=>expectFailure(call,'creation_not_found'));
      const other=await repo.start(bh,original); need(other.id!==row.id && other.founderAccountId===b,'same_source_cross_founder_binding');
      const items=[]; let cursor;
      do {const page=await repo.list(ah,{limit:2,...(cursor?{afterId:cursor}:{})});items.push(...page.items);cursor=page.nextAfterId;} while(cursor);
      need(new Set(items.map(r=>r.id)).size===items.length && !items.some(r=>r.id===other.id) && items.every(r=>!Object.hasOwn(r,'initialIntake') && !Object.hasOwn(r,'intake')),'list_isolation_failed');
      await rollbackProbe(owner,"UPDATE yawrd.sessions SET network='mainnet' WHERE token_hash=$1",[ah],'23514');
      const between=await session(a), input=draft('revoke-between-http-calls');
      const betweenRepo=new CreationRepository(async(sql,args)=>{
        const rows=await httpQuery(true)(sql,args);
        if (sql.includes('creation_find_start(')) await owner.query('UPDATE yawrd.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[between]);
        return rows;
      });
      await expectFailure(()=>betweenRepo.start(between,input),'sign_in_required');
      return {rowCount:items.length,rollbackVerified:true};
    });
    await check('session_lock_timing','sql_client',async()=>{
      const h=await session(a), current=await repo.read(ah,primary.id);
      await held('SELECT token_hash FROM yawrd.sessions WHERE token_hash=$1 FOR UPDATE',[h],async jobs=>{
        jobs.push(outcome(rolledBack(r1,()=>sqlSave(r1,h,current))));
        await blocked([r1]); await owner.query('UPDATE yawrd.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[h]); await owner.query('COMMIT');
        const result=await jobs[0];need(result.error?.message==='sign_in_required','revocation_wait_recheck_failed');
      });
      const short=await session(a,'short');
      await held('SELECT id FROM yawrd.creation_drafts WHERE id=$1 FOR UPDATE',[current.id],async jobs=>{
        jobs.push(outcome(rolledBack(r1,()=>sqlSave(r1,short,current))));
        await blocked([r1]);
        while (!(await owner.query('SELECT expires_at<=clock_timestamp() AS expired FROM yawrd.sessions WHERE token_hash=$1',[short])).rows[0].expired) await new Promise(resolve=>setTimeout(resolve,100));
        await owner.query('COMMIT'); const result=await jobs[0];need(result.error?.message==='sign_in_required','expiry_after_creation_wait_failed');
      });
      need(same(await repo.read(ah,current.id),current),'expired_or_revoked_mutation_persisted');
      const uniqueShort=await session(a,'short'), input=draft('expiry-unique-wait');
      const winningId=generatePublicId();
      await held('SELECT 1',[],async jobs=>{
        await sqlStart(owner,ah,winningId,input);
        jobs.push(outcome(rolledBack(r1,()=>sqlStart(r1,uniqueShort,generatePublicId(),input)))); await blocked([r1]);
        while (!(await owner.query('SELECT expires_at<=clock_timestamp() AS expired FROM yawrd.sessions WHERE token_hash=$1',[uniqueShort])).rows[0].expired) await new Promise(resolve=>setTimeout(resolve,100));
        await owner.query('COMMIT'); need((await jobs[0]).error?.message==='sign_in_required','expiry_after_unique_wait_failed');
      });
      need((await repo.start(ah,input)).id===winningId,'unique_wait_expiry_changed_winner');
      // Authentication first: runtime transaction holds FOR SHARE; revocation
      // must wait. This is an SQL-function transaction, never an HTTP transaction.
      const first=await session(a);
      await r1.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      let revoke;
      try {
        await r1.query('SELECT yawrd.creation_founder($1)',[first]);
        revoke=outcome(r2.query('UPDATE yawrd.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[first]));
        await blocked([r2]); await sqlSave(r1,first,current,{...config(),publicName:'Authenticated before revocation'}); await r1.query('COMMIT');
        need(!(await revoke).error,'serialized_revocation_failed');
      } finally {await r1.query('ROLLBACK');if(revoke) await revoke;}
      primary=await repo.read(ah,current.id);
      await expectFailure(()=>negativeRepo.read(first,current.id),'sign_in_required');
      return {blockedWorkers:1,workerPids:[r1.p2pid,r2.p2pid],rollbackVerified:true};
    });
    await check('public_review','repository_http',async()=>{
      const blank=await repo.start(ah,draft('blank-review'));
      await unchanged(blank.id,()=>expectFailure(()=>negativeRepo.reviewPublicText(ah,blank.id,review(blank)),'public_text_required'));
      primary=await repo.read(ah,primary.id);
      primary=await repo.updateConfiguration(ah,primary.id,primary.revision,config());
      const wrongDigest=(primary.publicTextDigest[0]==='0'?'1':'0')+primary.publicTextDigest.slice(1);
      for (const [input,code] of [[{...review(primary),consent:false},'public_text_review_required'],[{...review(primary),consentVersion:'unsupported'},'public_text_review_required'],[{...review(primary),publicTextDigest:wrongDigest},'public_text_review_conflict'],[{...review(primary),expectedRevision:primary.revision-1},'creation_revision_conflict']])
        await unchanged(primary.id,()=>expectFailure(()=>negativeRepo.reviewPublicText(ah,primary.id,input),code));
      await rollbackProbe(r1,'SELECT * FROM yawrd.creation_review_public_text($1,$2,$3,$4,$5)',[ah,primary.id,primary.revision,primary.publicTextDigest,'unsupported'],'P0001','public_text_review_conflict');
      const {rows:[digest]}=await owner.query("SELECT encode(sha256(convert_to(jsonb_build_array($1::text,$2::text)::text,'UTF8')),'hex')=$3 AS matches",[primary.configuration.publicName,primary.configuration.publicDescription,primary.publicTextDigest]);
      need(digest.matches,'stored_public_digest_mismatch');
      primary=await repo.reviewPublicText(ah,primary.id,review(primary));
      need(primary.publicTextReview?.revision===primary.revision && primary.publicTextReview.digest===primary.publicTextDigest,'review_binding_failed');
      const timestamp=(await owner.query('SELECT public_text_reviewed_at::text AS exact FROM yawrd.creation_drafts WHERE id=$1',[primary.id])).rows[0].exact;
      need(same(await repo.reviewPublicText(ah,primary.id,review(primary)),primary),'review_not_idempotent');
      need((await owner.query('SELECT public_text_reviewed_at::text AS exact FROM yawrd.creation_drafts WHERE id=$1',[primary.id])).rows[0].exact===timestamp,'review_timestamp_changed');
      need(same(await repo.updateConfiguration(ah,primary.id,primary.revision,primary.configuration),primary),'reviewed_noop_changed');
      const mutations=[
        r=>repo.updateConfiguration(ah,r.id,r.revision,{...r.configuration,publicName:r.configuration.publicName+' '}),
        r=>repo.updateConfiguration(ah,r.id,r.revision,{...r.configuration,publicDescription:r.configuration.publicDescription+' '}),
        r=>repo.updateIntake(ah,r.id,r.revision,{...r.intake,projectName:'Changed private name for review invalidation'}),
        r=>repo.updateConfiguration(ah,r.id,r.revision,{...r.configuration,accountLabel:'p2-changed'}),
        r=>repo.updateConfiguration(ah,r.id,r.revision,{...r.configuration,secondSteward:'p2-other-steward.testnet'}),
      ];
      for (const mutate of mutations) {
        const reviewed=await repo.reviewPublicText(ah,primary.id,review(primary));
        primary=await mutate(reviewed);
        need(primary.revision===reviewed.revision+1 && primary.publicTextReview===null,'content_edit_kept_review');
      }
      primary=await repo.reviewPublicText(ah,primary.id,review(primary));
      const before=primary.configuration;
      primary=await repo.updateConfiguration(ah,primary.id,primary.revision,{...before,publicName:'Temporary edit'});
      primary=await repo.updateConfiguration(ah,primary.id,primary.revision,before);
      need(primary.publicTextReview===null,'revert_restored_review');
      return {digestMatches:true,reviewInvalidated:true,revision:primary.revision};
    });
    await check('identity_and_origin','sql_client',async()=>{
      primary=await repo.read(ah,primary.id);
      need(primary.founderAccountId===a && same(primary.initialIntake,original),'original_snapshot_changed');
      const expressions={id:"'yawrd-zzzzzzzzzzzz'",network:"'mainnet'",founder_account_id:"'p2-different.testnet'",source_draft_id:"'replacement-source'",initial_intake:"jsonb_set(initial_intake,'{projectName}','\"changed\"'::jsonb)",created_at:"created_at+interval '1 second'"};
      for (const [column,value] of Object.entries(expressions)) {
        await rollbackProbe(owner,`UPDATE yawrd.creation_drafts SET ${column}=${value} WHERE id=$1`,[primary.id],'23514','immutable_creation_identity');
        await rollbackProbe(r1,`UPDATE yawrd.creation_drafts SET ${column}=${column} WHERE id=$1`,[primary.id]);
      }
      await rollbackProbe(owner,'DELETE FROM yawrd.creation_drafts WHERE id=$1',[primary.id],'23514','immutable_record');
      await rollbackProbe(owner,'UPDATE yawrd.creation_drafts SET threshold=1 WHERE id=$1',[primary.id],'23514');
      await rollbackProbe(owner,"UPDATE yawrd.creation_drafts SET public_name=repeat('x',121) WHERE id=$1",[primary.id],'23514');
      need(same(await repo.read(ah,primary.id),primary),'immutable_probe_changed_state');
      return {rollbackVerified:true};
    });
    const handle=row=>({id:row.id,revision:Number(row.revision),publicTextDigest:row.public_text_digest});
    await check('transaction_rollback','sql_client',async()=>{
      // Only SQL functions on this SAME restricted Client join these transactions.
      // HTTP CreationRepository operations are deliberately absent here.
      for (const forceError of [false,true]) {
        const input=draft(forceError?'atomic-error':'atomic-rollback'), id=generatePublicId();
        await r1.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        let code;
        try {
          let row=handle((await sqlStart(r1,ah,id,input)).rows[0]);
          row=handle((await sqlSave(r1,ah,row)).rows[0]);
          await sqlReview(r1,ah,row);
          if (forceError) await r1.query("DO $$ BEGIN RAISE EXCEPTION 'p2_forced_rollback'; END $$");
        } catch (error) {code=error?.message;}
        finally {await r1.query('ROLLBACK');}
        need(forceError?code==='p2_forced_rollback':code===undefined,'rollback_probe_failed_before_expected_point');
        need((await owner.query('SELECT count(*)::integer AS count FROM yawrd.creation_drafts WHERE id=$1',[id])).rows[0].count===0,'rolled_back_creation_persisted');
      }
      const before=await repo.read(ah,primary.id);
      await r1.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      try {const row=handle((await sqlSave(r1,ah,before,{...config(),publicName:'Rolled back edit'})).rows[0]);await sqlReview(r1,ah,row);}
      finally {await r1.query('ROLLBACK');}
      need(same(await repo.read(ah,primary.id),before),'rolled_back_edit_or_review_persisted');
      return {rollbackVerified:true};
    });
    await check('postcommit_recovery','response_loss_simulation',async()=>{
      const lostRepo=kind=>new CreationRepository(async(sql,args)=>{
        const rows=await query(sql,args);
        if (sql.includes(`yawrd.creation_${kind}(`)) throw new Stop('simulated_response_loss');
        return rows;
      });
      const input=draft('response-loss'); let count=httpMutations;
      await expectFailure(()=>lostRepo('start').start(ah,input),'simulated_response_loss');
      need(httpMutations===count+1,'uncertain_start_retried');
      const recovered=await new CreationRepository(query,()=>{throw new Stop('recovery_allocated_replacement');}).start(ah,input);
      count=httpMutations;
      await expectFailure(()=>lostRepo('save').updateConfiguration(ah,recovered.id,recovered.revision,config()),'simulated_response_loss');
      need(httpMutations===count+1,'uncertain_save_retried');
      const saved=await repo.read(ah,recovered.id);
      need(saved.id===recovered.id && saved.revision===recovered.revision+1 && same(saved.configuration,config()),'uncertain_save_read_recovery_failed');
      count=httpMutations;
      await expectFailure(()=>lostRepo('review_public_text').reviewPublicText(ah,saved.id,review(saved)),'simulated_response_loss');
      const reviewed=await repo.read(ah,saved.id);
      need(httpMutations===count+1 && reviewed.publicTextReview?.revision===saved.revision,'uncertain_review_read_recovery_failed');
      const newer=await repo.updateConfiguration(ah2,reviewed.id,reviewed.revision,{...config(),publicName:'Newer device edit'});
      await expectFailure(()=>negativeRepo.updateConfiguration(ah,newer.id,saved.revision,config()),'creation_revision_conflict');
      need(same(await repo.read(ah,newer.id),newer),'uncertain_recovery_overwrote_newer_revision');
      return {revision:newer.revision,attempts:3};
    });
    await check('runtime_denials','sql_client',async()=>{
      for (const sql of [
        'DELETE FROM yawrd.creation_drafts WHERE false','TRUNCATE yawrd.creation_drafts',
        'UPDATE yawrd.creation_drafts SET revision=revision WHERE false',
        'UPDATE yawrd.creation_drafts SET public_text_digest=public_text_digest WHERE false',
        'UPDATE yawrd.sessions SET account_id=account_id WHERE false',
        'UPDATE yawrd.sessions SET expires_at=expires_at WHERE false',
        'UPDATE yawrd.sessions SET created_at=created_at WHERE false',
        'DELETE FROM yawrd.projects WHERE false','TRUNCATE yawrd.projects',
        'UPDATE yawrd.projects SET creator_account_id=creator_account_id WHERE false',
        'UPDATE yawrd.restricted_content SET content=content WHERE false',
        'UPDATE yawrd.applications SET introduction=introduction WHERE false',
        'DELETE FROM yawrd.review_decisions WHERE false',
        'ALTER TABLE yawrd.creation_drafts DISABLE TRIGGER guard_creation',
        'CREATE TABLE yawrd.p2_forbidden(id integer)',
        'SET ROLE neondb_owner','SELECT yawrd.creation_guard()',
      ]) await rollbackProbe(r1,sql);
      await creationGrants(owner);
      return {sqlstate:'42501',rollbackVerified:true};
    });
    await check('direct_sql_limitation','sql_client',async()=>{
      let other=await repo.start(bh,draft('direct-sql-limit'));
      other=await repo.updateConfiguration(bh,other.id,other.revision,config());
      await expectFailure(()=>negativeRepo.read(ah,other.id),'creation_not_found');
      need((await r1.query('SELECT count(*)::integer AS count FROM yawrd.creation_drafts WHERE id=$1',[other.id])).rows[0].count===1,'expected_direct_sql_access_not_demonstrated');
      await r1.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      try {
        const changed=await r1.query("UPDATE yawrd.creation_drafts SET public_name='Synthetic direct SQL change' WHERE id=$1 RETURNING revision",[other.id]);
        need(changed.rowCount===1,'direct_sql_mutation_not_demonstrated');
        const forged=await r1.query(`UPDATE yawrd.creation_drafts SET reviewed_revision=revision,reviewed_public_text_digest=public_text_digest,
          public_text_consent_version=$2,public_text_reviewed_at=clock_timestamp() WHERE id=$1 RETURNING reviewed_revision`,[other.id,CONSENT]);
        need(forged.rowCount===1,'direct_sql_review_not_demonstrated');
      } finally {await r1.query('ROLLBACK');}
      need(same(await repo.read(bh,other.id),other),'direct_sql_probe_not_rolled_back');
      return {rowCount:1,rollbackVerified:true};
    });
    await check('final_state','catalog_read_only',async()=>{
      await creationGrants(owner);
      const after=await grants(owner);
      assertExistingGrantsUnchanged(after,baseline.snapshot);
      const {rows:defaults}=await owner.query('SELECT defaclrole::text,defaclnamespace::text,defaclobjtype,defaclacl::text FROM pg_default_acl ORDER BY 1,2,3');
      need(same(defaults,baseline.defaults),'default_privileges_changed');
      need(same(await baseCatalog(owner),baseline.catalog),'existing_schema_changed');
      const {rows:rows}=await owner.query('SELECT id,founder_account_id,source_draft_id FROM yawrd.creation_drafts');
      need(rows.length<=128 && rows.every(r=>manifest.candidates.includes(r.id) && manifest.accounts.includes(r.founder_account_id) && manifest.sources.includes(r.source_draft_id)),'unaccounted_creation_rows');
      need(new Set(rows.map(r=>r.id)).size===rows.length && new Set(rows.map(r=>r.founder_account_id+'|'+r.source_draft_id)).size===rows.length,'final_identity_uniqueness_failed');
      const {rows:challenges}=await owner.query('SELECT id FROM yawrd.auth_challenges');
      const {rows:sessions}=await owner.query('SELECT challenge_id FROM yawrd.sessions');
      const ids=manifest.sessions.filter(s=>s.state==='committed').map(s=>s.challengeId).sort();
      need(same(challenges.map(r=>r.id).sort(),ids) && same(sessions.map(r=>r.challenge_id).sort(),ids),'unaccounted_authentication_rows');
      for (const table of baseline.relations.filter(r=>r.nspname==='yawrd' && !['sessions','auth_challenges'].includes(r.relname)).map(r=>r.relname))
        need((await owner.query(`SELECT count(*)::integer AS count FROM yawrd.${quote(table)}`)).rows[0].count===0,'unrelated_operational_data_changed');
      manifest.confirmedCreationIds=rows.map(r=>r.id).sort(); await persist();
      return {rowCount:rows.length,fixtureCount:ids.length,distinctIds:rows.length};
    });
    // Pure regressions run in children with a clean environment, no P2 secrets
    // and no npm/config/environment loader. Output is inspected, never replayed.
    await check('offline_regressions','offline_source',async()=>{
      const {scripts}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
      const unit=scripts.test.split(' ');
      need(unit[0]==='node' && unit.slice(1).every(t=>!/["';&|]/.test(t)),'offline_regression_command_mismatch');
      const commands=[unit.slice(1),
        ['--import','./test/register-contributions.mjs','--test','--test-isolation=none','--test-skip-pattern=inactive SQL','test/contributions.test.ts','test/contribution-signing.test.ts','test/contribution-activation.test.ts','test/contribution-production-activation.test.ts','test/contribution-ux.test.ts','test/task-b-refinement.test.ts'],
        ['--import','./test/register-contributions.mjs','--test','--test-isolation=none','test/reward-payout.test.ts'],
        ['--import','./test/register-tsx.mjs','--test','--test-isolation=none','test/shared-template-release.test.tsx','test/genesis-publication-postgres-guards.test.mjs','test/creation-postgres-guards.test.mjs']];
      const {execFile}=await import('node:child_process');
      for (const [index,args] of commands.entries()) await new Promise((done,reject)=>{
        execFile(process.execPath,['--test-reporter=tap',...args],{cwd:ROOT,env:{PATH:dirname(process.execPath)+':/usr/bin:/bin',LANG:'C',CI:'1',NEXT_TELEMETRY_DISABLED:'1'},timeout:120000,maxBuffer:2097152,signal:abort.signal},(error,stdout,stderr)=>{
          if (error) {reject(new Stop(error.code==='EPERM' || /ERR_MODULE_NOT_FOUND|Cannot find package|Cannot find module/.test(stdout+stderr)?'offline_regressions_unavailable':'offline_regressions_failed'));return;}
          try {
            const counts=offlineSummary(stdout,index===1); // Existing contribution suite explicitly excludes inactive SQL.
            regressionEvidence.push({suite:['unit','contributions','payout','public_and_guards'][index],...counts});done();
          } catch (failure) {reject(failure);}
        });
      });
    });
    finalStatus='PASS';
    }
  } catch (error) {
    failureCode=safeCode(error);
    finalStatus=results.some(r=>r.status==='FAIL')?'FAIL':'INCOMPLETE';
  } finally {
    abort.abort(); clearTimeout(timer);
    await Promise.allSettled([...pending]);
    // Connection closure and rollback only. Committed synthetic fixtures and
    // new objects remain for diagnosis/disposal; there is no DROP/DELETE path.
    for (const client of clients.filter(c=>c!==owner)) {
      try {if(client.p2pid) await client.query('ROLLBACK'); await client.end();}
      catch {closure=false;}
    }
    if (owner?.p2pid) {
      try {
        await owner.p2raw('ROLLBACK');
        const end=Date.now()+22000; let active=1;
        while(active && Date.now()<end) {
          active=(await owner.p2raw('SELECT count(*)::integer AS count FROM pg_stat_activity WHERE application_name=$1 AND pid<>pg_backend_pid()',['yawrd-p2-'+evidence.runId])).rows[0].count;
          if(active) await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(active) closure=false;
        await owner.end();
      } catch {closure=false;}
    } else if(owner) {try {await owner.end();} catch {closure=false;}}
    process.off('SIGINT',onSignal); process.off('SIGTERM',onSignal);
    finalStatus=httpOutcomes.reportStatus(finalStatus);
    if (!closure && ['PASS','PREFLIGHT_PASS'].includes(finalStatus)) finalStatus='INCOMPLETE';
    await emit('connections_closed',closure?'PASS':'INCOMPLETE','sql_client',{connectionsClosed:closure});
    if (options.mode==='--apply-and-test') for (const [name,mechanism] of REQUIRED_TESTS)
      if (!results.some(r=>r.name===name)) await emit(name,'INCOMPLETE',mechanism);
    await persist();
    await evidence.write('summary.json',{
      status:finalStatus,stage,...(failureCode?{code:failureCode}:{}),baseline:BASELINE,proposalSha256:PROPOSAL_HASH,results,
      schemaState:manifest.schema,committedFixturesRetained:setup?true:manifest.schema==='submitted'?'UNKNOWN':false,
      connectionsClosed:closure,branchDeletionAuthorized:false,...httpOutcomes.evidence(),
      retryPolicy:'No automatic uncertain-write retry. Read-only reconciliation of retained fixtures is required before any separately authorized attempt; initialized branches cannot resume through this runner.',
      branchDisposal:'Separate founder approval; Console project/branch ID confirmation required. No automatic cleanup.',
      requiredP3Review:'Direct runtime SQL permits cross-founder access and review changes. Repository authorization is the accepted P2 boundary.',
      responseLoss:'Application-side discarded results after real HTTP commits; no actual network-failure claim.',
      regressionChecksExecuted:results.some(r=>r.name==='offline_regressions' && r.status==='PASS'),
      regressions:regressionEvidence,
    });
    await evidence.close();
    console.log(JSON.stringify({status:finalStatus,runId:evidence.runId,connectionsClosed:closure,fixturesRetained:setup?true:manifest.schema==='submitted'?'UNKNOWN':false,branchDeletionAuthorized:false,...httpOutcomes.evidence()}));
  }
  return finalStatus;
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    // Only these credential variables are read. No environment file or fallback.
    const status=await verifyCreation(parseArguments(process.argv.slice(2)),{
      P2_OWNER_DATABASE_URL:process.env.P2_OWNER_DATABASE_URL,
      P2_RUNTIME_DATABASE_URL:process.env.P2_RUNTIME_DATABASE_URL,
    });
    if (!['PASS','PREFLIGHT_PASS'].includes(status)) process.exitCode=1;
  } catch (error) {
    console.log(JSON.stringify({status:'INCOMPLETE',code:safeCode(error),credentials:'suppressed'}));
    process.exitCode=1;
  }
}
