// Database-free safety tests. Importing the runner loads built-ins only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import {
  BASELINE, PROPOSAL_HASH, REQUIRED_TESTS, parseArguments, creationTargets,
  verifyProposal, assertWriteGate, safeCode, evidenceEvent, rollbackProbe,
  verifyCreation, offlineSummary, isHttpTransportFailure, failureStatus, createHttpOutcomeGuard,
  assertYawrdInventory, assertOperationalTablesEmpty, failureDetails,
  checkBaseGrants, assertExistingGrantsUnchanged,
} from '../scripts/verify-creation-postgres.mjs';

const now=Date.parse('2026-11-18T06:00:00Z');
const host='ep-jolly-pond-aovq4jhw.synthetic.aws.neon.tech';
const secret='FAKE_PASSWORD_FOR_OFFLINE_TESTS';
function options() {
  return {mode:'--apply-and-test','project-id':'synthetic-project-123','branch-id':'br-synthetic-123',hostname:host,
    'expires-at':new Date(now+7200000).toISOString(),'console-confirmed-at':new Date(now-1000).toISOString(),
    schemaOnly:true,'evidence-dir':'/tmp/private-p2-evidence'};
}
function credentials() {
  return {
    P2_OWNER_DATABASE_URL:`postgresql://neondb_owner:${secret}@${host}/neondb?sslmode=require`,
    P2_RUNTIME_DATABASE_URL:`postgresql://yawrd_07b_runtime:${secret}@${host}/neondb?sslmode=verify-full`,
  };
}
function rejected(fn) {
  assert.throws(fn,error=>{
    assert.doesNotMatch(error.message,/FAKE_PASSWORD|postgresql:|synthetic\.aws/);
    return true;
  });
}

test('independently pinned target accepts distinct roles without exposing credentials in confirmation',()=>{
  const result=creationTargets(options(),credentials(),now);
  assert.notEqual(result.ownerUrl,result.runtimeUrl);
  assert.equal(result.confirmation.branch,'p2-creation-verify-20261118');
  assert.equal(result.confirmation.endpoint,'ep-jolly-pond-aovq4jhw');
  assert.doesNotMatch(JSON.stringify(result.confirmation),/FAKE_PASSWORD|postgresql:|ownerUrl|runtimeUrl/);
});
for (const [key,role] of [['P2_OWNER_DATABASE_URL','owner'],['P2_RUNTIME_DATABASE_URL','runtime']]) {
  test(`direct ${role} URL accepted without normalization`,()=>{
    const env=credentials(), result=creationTargets(options(),env,now);
    assert.equal(result[role+'Url'],env[key]);
  });
  test(`pooled ${role} URL rejected rather than normalized`,()=>{
    const env=credentials();env[key]=env[key].replace(host,host.replace('aovq4jhw','aovq4jhw-pooler'));
    assert.throws(()=>creationTargets(options(),env,now),error=>safeCode(error)==='direct_connection_required');
  });
}

const unsafeOptions=[
  ['missing mode',o=>delete o.mode],['unknown mode',o=>{o.mode='--cleanup';}],
  ['missing project ID',o=>delete o['project-id']],['missing branch ID',o=>delete o['branch-id']],
  ['invalid project ID',o=>{o['project-id']='postgresql://FAKE_PASSWORD';}],
  ['branch name substituted for ID',o=>{o['branch-id']='p2-creation-verify-20261118';}],
  ['missing hostname',o=>delete o.hostname],
  ['development endpoint',o=>{o.hostname='ep-twilight-voice-aorpfrbm.synthetic.aws.neon.tech';}],
  ['different region',o=>{o.hostname=host.replace('synthetic','other');}],
  ['hostname suffix attack',o=>{o.hostname=host+'.attacker.example';}],
  ['hostname empty label',o=>{o.hostname=host.replace('.synthetic.','..synthetic.');}],
  ['pooling inferred as independent pin',o=>{o.hostname=host.replace('aovq4jhw','aovq4jhw-pooler');}],
  ['schema-only unconfirmed',o=>delete o.schemaOnly],['schema-only string',o=>{o.schemaOnly='true';}],
  ['missing expiry',o=>delete o['expires-at']],['expired branch',o=>{o['expires-at']=new Date(now-1).toISOString();}],
  ['insufficient test window',o=>{o['expires-at']=new Date(now+3599999).toISOString();}],
  ['missing Console time',o=>delete o['console-confirmed-at']],
  ['stale Console time',o=>{o['console-confirmed-at']=new Date(now-900001).toISOString();}],
  ['future Console time',o=>{o['console-confirmed-at']=new Date(now+1).toISOString();}],
  ['timestamp without timezone',o=>{o['expires-at']='2026-11-18T08:00:00';}],
  ['missing evidence directory',o=>delete o['evidence-dir']],
  ['relative evidence directory',o=>{o['evidence-dir']='reports';}],
];
for (const [name,change] of unsafeOptions) test(`reject ${name}`,()=>{
  const o=options();change(o); rejected(()=>creationTargets(o,credentials(),now));
});
const unsafeUrls=[
  ['missing owner',e=>delete e.P2_OWNER_DATABASE_URL],['missing runtime',e=>delete e.P2_RUNTIME_DATABASE_URL],
  ['application credential fallback',e=>{e.DATABASE_URL=e.P2_RUNTIME_DATABASE_URL;delete e.P2_RUNTIME_DATABASE_URL;}],
  ['owner substituted for runtime',e=>{e.P2_RUNTIME_DATABASE_URL=e.P2_OWNER_DATABASE_URL;}],
  ['runtime substituted for owner',e=>{e.P2_OWNER_DATABASE_URL=e.P2_RUNTIME_DATABASE_URL;}],
  ['non-PostgreSQL protocol',e=>{e.P2_OWNER_DATABASE_URL=e.P2_OWNER_DATABASE_URL.replace('postgresql:','https:');}],
  ['different endpoint',e=>{e.P2_OWNER_DATABASE_URL=e.P2_OWNER_DATABASE_URL.replace('jolly-pond','wrong-endpoint');}],
  ['same endpoint label different host',e=>{e.P2_RUNTIME_DATABASE_URL=e.P2_RUNTIME_DATABASE_URL.replace('.synthetic.','.elsewhere.');}],
  ['wrong database',e=>{e.P2_OWNER_DATABASE_URL=e.P2_OWNER_DATABASE_URL.replace('/neondb?','/production?');}],
  ['encoded alternate database',e=>{e.P2_OWNER_DATABASE_URL=e.P2_OWNER_DATABASE_URL.replace('/neondb?','/%6eeondb?');}],
  ['wrong port',e=>{e.P2_RUNTIME_DATABASE_URL=e.P2_RUNTIME_DATABASE_URL.replace('/neondb',':9999/neondb');}],
  ['missing password',e=>{e.P2_OWNER_DATABASE_URL=e.P2_OWNER_DATABASE_URL.replace(':'+secret,'');}],
  ['missing TLS',e=>{e.P2_RUNTIME_DATABASE_URL=e.P2_RUNTIME_DATABASE_URL.replace('verify-full','disable');}],
  ['duplicate TLS',e=>{e.P2_OWNER_DATABASE_URL+='&sslmode=disable';}],
  ['connection options override',e=>{e.P2_RUNTIME_DATABASE_URL+='&options=-csearch_path%3Dpublic';}],
  ['hostname query override',e=>{e.P2_OWNER_DATABASE_URL+='&host=elsewhere';}],
  ['database query override',e=>{e.P2_OWNER_DATABASE_URL+='&dbname=production';}],
  ['unapproved application name',e=>{e.P2_OWNER_DATABASE_URL+='&application_name=unsafe';}],
  ['URL fragment',e=>{e.P2_OWNER_DATABASE_URL+='#hidden';}],
  ['invalid percent-encoded role',e=>{e.P2_RUNTIME_DATABASE_URL=e.P2_RUNTIME_DATABASE_URL.replace('yawrd_07b_runtime','%xx');}],
  ['unbounded connect timeout',e=>{e.P2_RUNTIME_DATABASE_URL+='&connect_timeout=0';}],
  ['disabled channel binding override',e=>{e.P2_RUNTIME_DATABASE_URL+='&channel_binding=disable';}],
];
for (const [name,change] of unsafeUrls) test(`reject ${name}`,()=>{
  const env=credentials();change(env);rejected(()=>creationTargets(options(),env,now));
});

test('CLI parser accepts only the two modes and explicit confirmation arguments',()=>{
  const parsed=parseArguments(['--preflight','--project-id','synthetic-project','--branch-id','br-synthetic','--hostname',host,'--expires-at',options()['expires-at'],'--console-confirmed-at',options()['console-confirmed-at'],'--schema-only-confirmed','--evidence-dir','/tmp/private-p2']);
  assert.equal(parsed.mode,'--preflight');assert.equal(parsed.schemaOnly,true);
  for (const args of [[],['--cleanup'],['--preflight','--apply-and-test'],['--preflight','--project-id'],['--preflight','--schema-only-confirmed','--schema-only-confirmed'],['--preflight','--owner-url',secret],['--preflight','--hostname',host,'--hostname',host]]) rejected(()=>parseArguments(args));
});

test('committed proposal is accepted; even whitespace changes and substituted SQL are rejected',async()=>{
  const source=await readFile(new URL('../docs/proposals/migrations/phase2_private_creation_p1.sql',import.meta.url),'utf8');
  assert.equal(verifyProposal(source),source);
  assert.equal(BASELINE,'0ecf38f53436c887895dacb67fe3612cdf4d4ce5');
  assert.equal(PROPOSAL_HASH,'f4a1ab4d3aa4f276f7d9c94d9fd4c5c37848fe4eacc406bf3a7aeb71dac72b8a');
  rejected(()=>verifyProposal(source+'\n'));rejected(()=>verifyProposal('CREATE TABLE unsafe(id integer);'));
});
test('write gate requires write mode, exact source pin, and every completed live gate',()=>{
  const gates={proposal:PROPOSAL_HASH,identity:true,inventory:true,dependencies:true,permissions:true,creation_absent:true};
  assert.doesNotThrow(()=>assertWriteGate('--apply-and-test',gates));
  rejected(()=>assertWriteGate('--preflight',gates));
  rejected(()=>assertWriteGate('--apply-and-test',{}));
  rejected(()=>assertWriteGate('--apply-and-test',{...gates,proposal:'different'}));
  for (const key of ['identity','inventory','dependencies','permissions','creation_absent']) for (const value of [false,undefined,'true',1]) rejected(()=>assertWriteGate('--apply-and-test',{...gates,[key]:value}));
});

test('invalid live invocation stops before checkpoint, evidence, driver import or network access',async()=>{
  const previousFetch=globalThis.fetch;
  let networkCalls=0;
  globalThis.fetch=()=>{networkCalls++;throw new Error('OFFLINE_NETWORK_TRAP');};
  try {
    for (const mode of ['--preflight','--apply-and-test']) await assert.rejects(verifyCreation({...options(),mode,'console-confirmed-at':new Date().toISOString(),'expires-at':new Date(Date.now()+7200000).toISOString()},{}),error=>{
      assert.equal(safeCode(error),'owner_url_required');
      assert.doesNotMatch(error.message,/FAKE_PASSWORD|postgresql:/);return true;
    });
    assert.equal(networkCalls,0);
  } finally {globalThis.fetch=previousFetch;}
});
test('CLI missing credentials returns a sanitized nonzero result without dependencies or network',t=>{
  const probe=spawnSync(process.execPath,['-e','process.stdout.write("P2_CHILD_PROBE")'],{env:{PATH:'/usr/bin:/bin'},encoding:'utf8'});
  if (probe.error?.code==='EPERM' || probe.stdout!=='P2_CHILD_PROBE') {
    t.skip('Child execution/output unavailable; the invalid CLI must also be checked directly.');return;
  }
  const result=spawnSync(process.execPath,['scripts/verify-creation-postgres.mjs','--preflight'],{cwd:new URL('../',import.meta.url),env:{PATH:'/usr/bin:/bin'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if (result.error?.code==='EPERM') {t.skip('Sandbox denies child execution; check the CLI directly from the execution tool.');return;}
  assert.equal(result.error,undefined);assert.equal(result.status,1);
  const output=result.stdout+result.stderr;
  assert.match(output,/INCOMPLETE/);assert.doesNotMatch(output,/FAKE_PASSWORD|postgresql:|node_modules|ERR_MODULE_NOT_FOUND/);
});

test('evidence projection discards arbitrary payload, hashes, URLs, errors and nonnumeric detail',()=>{
  const event=evidenceEvent('runtime_denials','PASS','sql_client',{
    sqlstate:'42501',rollbackVerified:true,revision:2,workerPids:[123,456],
    ownerUrl:credentials().P2_OWNER_DATABASE_URL,error:new Error(secret),token:secret,
    sessionHash:'a'.repeat(64),payload:secret,parameters:[secret],rowCount:secret,
  });
  assert.deepEqual(event,{name:'runtime_denials',status:'PASS',mechanism:'sql_client',revision:2,rollbackVerified:true,sqlstate:'42501',workerPids:[123,456]});
  assert.doesNotMatch(JSON.stringify(event),/FAKE_PASSWORD|postgresql:|sessionHash|parameters/);
  rejected(()=>evidenceEvent(secret,'PASS','sql_client'));
  rejected(()=>evidenceEvent('runtime_denials',secret,'sql_client'));
  rejected(()=>evidenceEvent('runtime_denials','PASS',secret));
  assert.equal(safeCode({message:secret,detail:secret,code:secret}),'verification_failed');
  assert.equal(safeCode({code:'23514',message:secret}),'23514');
  assert.equal(safeCode({code:'creation_revision_conflict',message:secret}),'creation_revision_conflict');
});
test('empty, missing and skipped required regression results cannot be reported as passing',()=>{
  for (const text of ['',secret,'# tests 0\n# pass 0\n# fail 0\n# skipped 0\n','# tests 1\n# pass 0\n# fail 1\n# skipped 0\n','# tests 2\n# pass 1\n# fail 0\n# skipped 1\n']) rejected(()=>offlineSummary(text));
  assert.deepEqual(offlineSummary('# tests 2\n# pass 2\n# fail 0\n# skipped 0\n'),{passed:2,skipped:0});
  assert.deepEqual(offlineSummary('# tests 2\n# pass 1\n# fail 0\n# skipped 1\n',true),{passed:1,skipped:1});
});

for (const mode of ['denied','unexpected_success','wrong_sqlstate']) test(`negative mutation probe rolls back: ${mode}`,async()=>{
  const calls=[];
  const client={query:async(sql,args)=>{
    calls.push([sql,args]);
    if (sql==='PROBE' && mode!=='unexpected_success') throw Object.assign(new Error(secret),{code:mode==='denied'?'42501':'23514'});
  }};
  if (mode==='denied') assert.deepEqual(await rollbackProbe(client,'PROBE',[secret]),{sqlstate:'42501',rollbackVerified:true});
  else await assert.rejects(rollbackProbe(client,'PROBE',[secret]),error=>{assert.equal(safeCode(error),'negative_probe_mismatch');assert.doesNotMatch(error.message,/FAKE_PASSWORD/);return true;});
  assert.equal(calls[0][0],'BEGIN ISOLATION LEVEL READ COMMITTED');
  assert.equal(calls.at(-1)[0],'ROLLBACK');assert.equal(calls.filter(c=>c[0]==='COMMIT').length,0);
});
test('rollback failure cannot produce a successful negative-probe result',async()=>{
  const client={query:async sql=>{if(sql==='PROBE') throw Object.assign(new Error(secret),{code:'42501'});if(sql==='ROLLBACK') throw new Error(secret);}};
  await assert.rejects(rollbackProbe(client,'PROBE'),error=>safeCode(error)==='verification_failed');
});
test('SQLSTATE alone cannot mask a different expected workflow error',async()=>{
  const calls=[];
  const client={query:async sql=>{calls.push(sql);if(sql==='PROBE') throw Object.assign(new Error('different_workflow'),{code:'P0001'});}};
  await assert.rejects(rollbackProbe(client,'PROBE',[],'P0001','creation_import_conflict'));
  assert.equal(calls.at(-1),'ROLLBACK');
});

test('all required coverage is present and transaction tests are explicitly SQL-client tests',async()=>{
  const source=await readFile(new URL('../scripts/verify-creation-postgres.mjs',import.meta.url),'utf8');
  for (const [name,mechanism] of REQUIRED_TESTS) assert.ok(source.includes(`await check('${name}','${mechanism}'`),name);
  assert.equal(REQUIRED_TESTS.find(t=>t[0]==='transaction_rollback')[1],'sql_client');
  assert.equal(REQUIRED_TESTS.find(t=>t[0]==='postcommit_recovery')[1],'response_loss_simulation');
  assert.match(source,/No automatic cleanup/);
  assert.doesNotMatch(source,/import\s+['"].*(?:load-environment|load-migration-environment)|process\.env\.(?:DATABASE_URL|YAWRD_|NEON_)/);
  assert.doesNotMatch(source,/(?:DROP TABLE|DROP FUNCTION|DELETE FROM yawrd\.sessions|DELETE FROM yawrd\.auth_challenges)/);
});

// Match Neon 1.2.0's native error shape without importing a driver or networking:
// fetch failures carry sourceError; PostgreSQL responses carry code/severity.
function neonFailure(sourceError,code) {
  return Object.assign(new Error(secret),{name:'NeonDbError',sourceError,code,...(code?{severity:'ERROR'}:{})});
}
const abortController=new AbortController();abortController.abort();
const transportFailures=[
  ['native request abort',()=>abortController.signal.reason],
  ['driver-wrapped transport failure',()=>neonFailure(Object.assign(new Error(secret),{code:'ECONNRESET'}))],
  ['native request timeout',()=>new DOMException(secret,'TimeoutError')],
  ['driver-wrapped timeout',()=>neonFailure(new DOMException(secret,'TimeoutError'))],
  ['native fetch cause',()=>new TypeError('fetch failed',{cause:Object.assign(new Error(secret),{code:'EPIPE'})})],
  ['driver HTTP failure without SQL acknowledgement',()=>Object.assign(new Error('Server error (HTTP status 503): '+secret),{name:'NeonDbError'})],
];
for (const [name,makeError] of transportFailures) test(`${name}: unknown write is incomplete, persisted and never retried`,async()=>{
  const snapshots=[];
  const guard=createHttpOutcomeGuard(async()=>snapshots.push(structuredClone(guard.state)));
  let sends=0;
  const send=async()=>{sends++;throw makeError();};
  assert.equal(isHttpTransportFailure(makeError()),true);
  assert.equal(failureStatus(makeError()),'INCOMPLETE');
  await assert.rejects(guard.dispatch(true,send),error=>{
    assert.equal(failureStatus(error),'INCOMPLETE');
    assert.equal(safeCode(error),'unknown_http_write_outcome');
    assert.doesNotMatch(error.message,/FAKE_PASSWORD|postgresql:/);return true;
  });
  assert.deepEqual(snapshots,[{pending:1,unknown:0},{pending:0,unknown:1}]);
  assert.deepEqual(guard.evidence(),{unknownWriteOutcome:true,reconciliationRequired:true,pendingHttpWrites:0,unknownHttpWrites:1});
  const event=evidenceEvent('concurrent_starts','INCOMPLETE','repository_http',{...guard.evidence(),error:makeError(),ownerUrl:credentials().P2_OWNER_DATABASE_URL});
  assert.equal(event.unknownWriteOutcome,true);assert.equal(event.reconciliationRequired,true);
  assert.doesNotMatch(JSON.stringify(event),/FAKE_PASSWORD|postgresql:|sourceError|ownerUrl/);
  await assert.rejects(guard.dispatch(true,send),error=>safeCode(error)==='read_only_reconciliation_required');
  assert.equal(sends,1);
  assert.equal(guard.reportStatus('PASS'),'INCOMPLETE');
});

for (const code of ['23514','P0001','42501','57014']) test(`confirmed PostgreSQL ${code} remains FAIL even with transport metadata`,async()=>{
  const error=neonFailure(abortController.signal.reason,code), guard=createHttpOutcomeGuard();
  assert.equal(isHttpTransportFailure(error),false);
  assert.equal(failureStatus(error),'FAIL');
  await assert.rejects(guard.dispatch(true,async()=>{throw error;}),actual=>actual===error);
  assert.deepEqual(guard.state,{pending:0,unknown:0});
  assert.equal(guard.reportStatus('FAIL'),'FAIL');
});

test('confirmed assertion and invariant failures remain FAIL; NeonDbError name alone is insufficient',async()=>{
  let assertion;
  try {assert.fail(secret);} catch (error) {assertion=error;}
  let invariant;
  try {assertWriteGate('--preflight',{});} catch (error) {invariant=error;}
  for (const error of [assertion,invariant,neonFailure(undefined,undefined)]) {
    const guard=createHttpOutcomeGuard();
    assert.equal(isHttpTransportFailure(error),false);
    assert.equal(failureStatus(error),'FAIL');
    await assert.rejects(guard.dispatch(true,async()=>{throw error;}),actual=>actual===error);
    assert.deepEqual(guard.state,{pending:0,unknown:0});
  }
});

test('aborted HTTP read is incomplete without claiming an unknown write',async()=>{
  const guard=createHttpOutcomeGuard();
  await assert.rejects(guard.dispatch(false,async()=>{throw abortController.signal.reason;}),error=>{
    assert.equal(safeCode(error),'http_request_incomplete');assert.equal(failureStatus(error),'INCOMPLETE');return true;
  });
  assert.deepEqual(guard.evidence(),{unknownWriteOutcome:false,reconciliationRequired:false,pendingHttpWrites:0,unknownHttpWrites:0});
});

test('pending HTTP writes block a PASS report before a response and survive sanitization',async()=>{
  let finish;
  const guard=createHttpOutcomeGuard();
  const pending=guard.dispatch(true,()=>new Promise(resolve=>{finish=resolve;}));
  await Promise.resolve();
  assert.equal(guard.reportStatus('PASS'),'INCOMPLETE');
  const event=evidenceEvent('concurrent_starts','INCOMPLETE','repository_http',{
    ...guard.evidence(),error:neonFailure(new Error(secret)),sourceError:new Error(secret),
    cause:new Error(secret),sql:secret,parameters:[secret],ownerUrl:credentials().P2_OWNER_DATABASE_URL,
  });
  assert.deepEqual(event,{name:'concurrent_starts',status:'INCOMPLETE',mechanism:'repository_http',
    unknownWriteOutcome:true,reconciliationRequired:true,pendingHttpWrites:1,unknownHttpWrites:0});
  assert.doesNotMatch(JSON.stringify(event),/FAKE_PASSWORD|postgresql:|sourceError|cause|parameters|ownerUrl/);
  finish('confirmed');assert.equal(await pending,'confirmed');
  assert.equal(guard.reportStatus('PASS'),'PASS');
});

test('one confirmed concurrent response cannot clear another unknown write',async()=>{
  const guard=createHttpOutcomeGuard();
  let finish;
  const pending=guard.dispatch(true,()=>new Promise(resolve=>{finish=resolve;}));
  await Promise.resolve();
  await assert.rejects(guard.dispatch(true,async()=>{throw new DOMException(secret,'TimeoutError');}));
  finish('confirmed');await pending;
  assert.deepEqual(guard.state,{pending:0,unknown:1});
  assert.equal(guard.reportStatus('PASS'),'INCOMPLETE');
  assert.throws(guard.assertWritable,error=>safeCode(error)==='read_only_reconciliation_required');
});

test('the P1 allocator does not retry an uncertain HTTP mutation or allocate a replacement',async()=>{
  const {CreationRepository}=await import('../src/creation/repository.ts');
  const {createEmptyYawrdIntakeDraft}=await import('../src/yawrd-intake.ts');
  const guard=createHttpOutcomeGuard();
  let sends=0,allocations=0;
  const repo=new CreationRepository(sql=>guard.dispatch(sql.includes('creation_start('),async()=>{
    if (sql.includes('creation_find_start(')) return [];
    sends++;throw neonFailure(new TypeError('fetch failed'));
  }),size=>{allocations++;return new Uint8Array(size);});
  const input=createEmptyYawrdIntakeDraft('offline-unknown',new Date(now).toISOString());
  await assert.rejects(repo.start('a'.repeat(64),input),error=>safeCode(error)==='unknown_http_write_outcome');
  assert.equal(sends,1);assert.equal(allocations,1);
  await assert.rejects(repo.start('a'.repeat(64),input),error=>safeCode(error)==='read_only_reconciliation_required');
  assert.equal(sends,1);assert.equal(allocations,1);
});

const preflightRelations=()=>['applications','auth_challenges','auth_rate_limits','projects','restricted_content','review_decisions','sessions']
  .map(relname=>({nspname:'yawrd',relname}));
test('the exact preflight inventory remains accepted without new catalog queries',()=>{
  assert.doesNotThrow(()=>assertYawrdInventory(preflightRelations()));
});
for (const [name,relations,missing,unexpected,count,orderMismatch] of [
  ['missing expected relation',()=>preflightRelations().filter(r=>r.relname!=='sessions'),['sessions'],0,6,false],
  ['unexpected relation',()=>[...preflightRelations(),{nspname:'yawrd',relname:secret}],[],1,8,false],
]) test(`preflight ${name} remains blocked with a sanitized failed-check diagnostic`,()=>{
  assert.throws(()=>assertYawrdInventory(relations()),error=>{
    assert.equal(safeCode(error),'unexpected_yawrd_inventory');
    assert.equal(failureStatus(error),'FAIL');
    const event=evidenceEvent('preflight','FAIL','catalog_read_only',failureDetails(error));
    assert.deepEqual(event,{name:'preflight',status:'FAIL',mechanism:'catalog_read_only',
      expectedRelationCount:7,observedRelationCount:count,unexpectedRelationCount:unexpected,
      inventoryOrderMismatch:orderMismatch,code:'unexpected_yawrd_inventory',errorCategory:'guard_rejection',missingExpectedRelations:missing});
    assert.doesNotMatch(JSON.stringify(event),/FAKE_PASSWORD|postgresql:|stack|parameters/);
    return true;
  });
});
test('preflight PostgreSQL errors retain SQLSTATE and exclude arbitrary server detail',()=>{
  const error=Object.assign(new Error(secret),{code:'42501',detail:secret,query:secret,parameters:[secret]});
  assert.deepEqual(evidenceEvent('preflight','FAIL','catalog_read_only',failureDetails(error)),{
    name:'preflight',status:'FAIL',mechanism:'catalog_read_only',errorCategory:'postgres_error',sqlstate:'42501',
  });
});
test('preflight native verification errors have a fixed sanitized category',()=>{
  const event=evidenceEvent('preflight','FAIL','catalog_read_only',failureDetails(new TypeError(secret)));
  assert.deepEqual(event,{name:'preflight',status:'FAIL',mechanism:'catalog_read_only',errorCategory:'verification_error'});
});
test('diagnostic allowlists reject arbitrary codes, categories and unknown relation names',()=>{
  const event=evidenceEvent('preflight','FAIL','catalog_read_only',{
    code:secret,errorCategory:secret,missingExpectedRelations:['sessions',secret],message:secret,
    observedRelations:[secret],query:secret,parameters:[secret],cause:new Error(secret),
  });
  assert.deepEqual(event,{name:'preflight',status:'FAIL',mechanism:'catalog_read_only'});
});

test('native transport codes are not presented as PostgreSQL SQLSTATEs',()=>{
  const error=Object.assign(new Error(secret),{code:'EPIPE'});
  assert.deepEqual(evidenceEvent('preflight','INCOMPLETE','catalog_read_only',failureDetails(error)),{
    name:'preflight',status:'INCOMPLETE',mechanism:'catalog_read_only',errorCategory:'transport_error',
  });
});

const toleratedNames=['agent_associations','yaw001_contribution_events','project_draft_reviews','project_task_drafts',
  'reviewed_project_packages','wordwake_reward_allocations','wordwake_reward_plans','blueprint_events','blueprint_workspaces'];
const fullInventory=()=>[...preflightRelations(),...toleratedNames.map(relname=>({nspname:'yawrd',relname}))];
test('all sixteen named tables are accepted independently of catalog ordering',()=>{
  assert.doesNotThrow(()=>assertYawrdInventory(fullInventory()));
  assert.doesNotThrow(()=>assertYawrdInventory(fullInventory().reverse()));
  assert.doesNotThrow(()=>assertYawrdInventory(preflightRelations().reverse()));
});
for (const required of preflightRelations()) test(`tolerated additions cannot replace required ${required.relname}`,()=>{
  assert.throws(()=>assertYawrdInventory(fullInventory().filter(r=>r.relname!==required.relname)),
    error=>safeCode(error)==='unexpected_yawrd_inventory');
});
for (const extra of ['unapproved_table','creation_drafts']) test(`sixteen-table inventory still rejects ${extra}`,()=>{
  assert.throws(()=>assertYawrdInventory([...fullInventory(),{nspname:'yawrd',relname:extra}]),
    error=>safeCode(error)==='unexpected_yawrd_inventory');
});
test('record-presence checks cover all sixteen operational tables using SELECT EXISTS only',async()=>{
  const queries=[];
  await assertOperationalTablesEmpty({query:async sql=>{queries.push(sql);return {rows:[{populated:false}]};}},fullInventory());
  assert.deepEqual(queries,fullInventory().map(r=>`SELECT EXISTS(SELECT 1 FROM "yawrd"."${r.relname}") AS populated`));
});
for (const table of fullInventory()) test(`records in ${table.relname} block execution`,async()=>{
  const client={query:async sql=>({rows:[{populated:sql.includes('"'+table.relname+'"')} ]})};
  await assert.rejects(assertOperationalTablesEmpty(client,fullInventory()),error=>safeCode(error)==='inherited_operational_data');
});
test('unknown relations are rejected before any record query',async()=>{
  let queries=0;
  await assert.rejects(assertOperationalTablesEmpty({query:async()=>{queries++;}},[
    ...fullInventory(),{nspname:'yawrd',relname:'unapproved_table'},
  ]),error=>safeCode(error)==='unexpected_yawrd_inventory');
  assert.equal(queries,0);
});


test('runtime role guard tolerates TEMP while preserving every other security predicate',async()=>{
  const source=await readFile(new URL('../scripts/verify-creation-postgres.mjs',import.meta.url),'utf8');
  const roleQuery=source.match(/owner\.query\(`(SELECT rolcanlogin[\s\S]*?)`,\[RUNTIME\]\)/)?.[1];
  assert.ok(roleQuery);
  // Pin the actual SQL predicate; no SQL execution or synthetic role evaluator.
  const expected=`SELECT rolcanlogin AND NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)
    AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_proc WHERE proowner=r.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=r.oid)
    AND NOT EXISTS(SELECT 1 FROM pg_database WHERE datdba=r.oid)
    AND has_schema_privilege(r.oid,'yawrd','USAGE') AND NOT has_schema_privilege(r.oid,'yawrd','CREATE')
    AND NOT has_schema_privilege(r.oid,'public','CREATE') AND NOT has_database_privilege(r.oid,current_database(),'CREATE') AS safe FROM pg_roles r WHERE rolname=$1`;
  const normalize=value=>value.replace(/\s+/g,' ').trim();
  assert.equal(normalize(roleQuery),normalize(expected));
  assert.doesNotMatch(roleQuery,/TEMP/);
  assert.match(source,/need\(role\?\.safe===true,'unsafe_runtime_role'\)/);
});
test('runtime denial probes retain permanent CREATE denial and do not expect TEMP denial',async()=>{
  const source=await readFile(new URL('../scripts/verify-creation-postgres.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("'CREATE TABLE yawrd.p2_forbidden(id integer)'"));
  assert.doesNotMatch(source,/CREATE TEMP TABLE/);
  assert.ok(source.includes("'SET ROLE neondb_owner'"));
});


function grantSnapshot() {
  const insertTables=['applications','review_decisions','auth_challenges','sessions','auth_rate_limits'];
  const updateColumns={auth_challenges:['consumed_at'],sessions:['revoked_at'],auth_rate_limits:['attempts','resets_at']};
  const tables=[],columns=[];
  for (const {relname} of fullInventory()) {
    const tolerated=toleratedNames.includes(relname);
    for (const permission of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
      tables.push({relname,permission,allowed:permission==='SELECT' || (permission==='INSERT' && insertTables.includes(relname))});
    const names=relname==='projects'?['network','id','creator_account_id','dao_account_id','name','description','objectives','participation','rewards','created_at','published_at']:
      ['id',...(updateColumns[relname]??[])];
    for (const attname of names) columns.push({relname,attname,
      ins:tolerated || insertTables.includes(relname),upd:tolerated || (updateColumns[relname]??[]).includes(attname)});
  }
  return {tables,columns};
}
test('tolerated INSERT and UPDATE column grants pass without mutating the full snapshot',()=>{
  const snapshot=grantSnapshot(), before=structuredClone(snapshot);
  for (const row of [...snapshot.tables,...snapshot.columns]) Object.freeze(row);
  Object.freeze(snapshot.tables);Object.freeze(snapshot.columns);Object.freeze(snapshot);
  assert.doesNotThrow(()=>checkBaseGrants(snapshot));
  assert.deepEqual(snapshot,before);
  assert.equal(new Set(snapshot.tables.map(r=>r.relname)).size,16);
});
for (const {relname} of preflightRelations()) {
  for (const permission of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
    test(`baseline ${relname} ${permission} table privilege remains enforced`,()=>{
      const snapshot=grantSnapshot();
      const row=snapshot.tables.find(r=>r.relname===relname && r.permission===permission);row.allowed=!row.allowed;
      assert.throws(()=>checkBaseGrants(snapshot),error=>safeCode(error)==='existing_table_grants_mismatch');
    });
  for (const privilege of ['ins','upd']) test(`baseline ${relname} column ${privilege} remains enforced`,()=>{
    const snapshot=grantSnapshot();
    const row=snapshot.columns.find(r=>r.relname===relname);row[privilege]=!row[privilege];
    assert.throws(()=>checkBaseGrants(snapshot),error=>['existing_insert_grants_mismatch','existing_update_grants_mismatch','existing_project_grants_mismatch'].includes(safeCode(error)));
  });
}
test('the complete grant comparison detects INSERT, UPDATE and table-grant changes on all sixteen tables',()=>{
  const before=grantSnapshot();
  assert.doesNotThrow(()=>assertExistingGrantsUnchanged(structuredClone(before),before));
  for (const {relname} of fullInventory()) {
    for (const privilege of ['ins','upd']) {
      const after=structuredClone(before);
      const row=after.columns.find(r=>r.relname===relname);row[privilege]=!row[privilege];
      assert.throws(()=>assertExistingGrantsUnchanged(after,before),error=>safeCode(error)==='existing_privileges_changed');
    }
    const after=structuredClone(before);after.tables.find(r=>r.relname===relname).allowed=false;
    assert.throws(()=>assertExistingGrantsUnchanged(after,before),error=>safeCode(error)==='existing_privileges_changed');
  }
});
test('grant capture still includes every yawrd table and both column privileges',async()=>{
  const source=await readFile(new URL('../scripts/verify-creation-postgres.mjs',import.meta.url),'utf8');
  const capture=source.slice(source.indexOf('async function grants(client)'),source.indexOf('async function baseCatalog(client)'));
  assert.match(capture,/has_column_privilege[\s\S]*'INSERT'[\s\S]*'UPDATE'/);
  assert.doesNotMatch(capture,/BASE_TABLES|TOLERATED_TABLES|ALLOWED_TABLES/);
  assert.match(source,/assertExistingGrantsUnchanged\(after,baseline.snapshot\)/);
});
