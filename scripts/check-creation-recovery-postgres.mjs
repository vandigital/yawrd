// Founder-operated P3.5R rollback acceptance ONLY. No provider imports or calls.
// Reuses the accepted pinned target/input guard; credentials arrive privately on stdin.
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {acceptanceTarget} from './check-creation-preparation-postgres.mjs';
import {preparationArtifacts} from '../test/fixtures/preparation.ts';
import {validatePreparation,preparationIssues} from '../src/creation/preparation-contract.ts';

const ROOT='/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117';
const ID='yawrd-uorgr4yy5sxu',FOUNDER='yawrd1.testnet',ROLE='yawrd_07b_runtime',CONSENT='creation-partner-recovery-v1';
const sha=v=>createHash('sha256').update(v).digest('hex');
const token=()=>sha(randomBytes(32));
class Failure extends Error {constructor(code){super(code);this.code=code;}}
const need=(ok,code)=>{if(!ok)throw new Failure(code);};
const safe=e=>e instanceof Failure?e.code:/^[0-9A-Z]{5}$/.test(e?.code??'')?'postgres_'+e.code:'transport_or_driver_unavailable';

async function main(){
  let client,worker,connected=false,begun=false,workerBegun=false,rollback=false,workerRollback=false,baseline,after,failure,stage='input';
  const challenges=[],sessions=[],passed=[];
  const q=(sql,args=[])=>client.query(sql,args);
  async function one(sql,args=[]){const r=await q(sql,args);need(r.rows.length===1,'expected_one_row');return r.rows[0];}
  const emit=(name,details={})=>{passed.push(name);console.log(JSON.stringify({status:'PASS',name,...details}));};
  async function reject(sql,args,state,message){
    await q('SAVEPOINT p35r_rejection');let error;
    try{await q(sql,args);}catch(e){error=e;}
    await q('ROLLBACK TO SAVEPOINT p35r_rejection');await q('RELEASE SAVEPOINT p35r_rejection');
    need(error?.code===state&&(!message||error.message===message),'expected_rejection_not_observed');
  }
  async function begin(c){
    need((await c.query('BEGIN ISOLATION LEVEL READ COMMITTED')).command==='BEGIN','begin_not_acknowledged');
    await c.query("SET LOCAL statement_timeout='10s'");await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
    const {rows:[r]}=await c.query("SELECT current_user AS role,session_user AS login,current_database() AS db,pg_backend_pid() AS pid,txid_current()::text AS xid,current_setting('transaction_isolation') AS isolation");
    need(r.role===ROLE&&r.login===ROLE&&r.db==='neondb'&&r.isolation==='read committed','runtime_identity_mismatch');return r;
  }
  async function session(c,account){
    const challenge=randomBytes(32).toString('base64url'),hash=token();challenges.push(challenge);sessions.push(hash);
    await c.query(`INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
      VALUES($1,$2,$3,'testnet','https://p35r-rollback.invalid','SYNTHETIC recovery acceptance','P3.5R rollback check',$4,
      statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp())`,[challenge,token(),account,randomBytes(32).toString('base64')]);
    await c.query(`INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash,created_at,expires_at)
      VALUES($1,$2,'testnet',$3,'synthetic-key',1,'synthetic-block',statement_timestamp(),statement_timestamp()+interval '1 hour')`,[hash,challenge,account]);return hash;
  }
  async function snapshot(){
    // Compute fingerprints in PostgreSQL; no private intake/output is returned.
    const result={};
    for(const t of ['creation_drafts','creation_deployments','creation_platform_fees','creation_preparation_attempts','creation_preparation_recoveries','creation_preparation_versions','creation_preparation_approvals']){
      const key=t==='creation_drafts'?'id':'creation_id';
      result[t]=await one(`SELECT count(*)::int AS n,md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) AS digest FROM yawrd.${t} r WHERE ${key}=$1`,[ID]);
    }return result;
  }
  const read='SELECT yawrd.creation_preparation_recovery_read($1,$2) AS recovery';
  const reserve='SELECT yawrd.creation_preparation_recovery_reserve($1,$2,$3::uuid,$4::uuid,$5,$6) AS won';
  const stageSql='SELECT yawrd.creation_preparation_recovery_stage($1,$2,$3::uuid,$4,$5::jsonb,$6)';
  const complete='SELECT yawrd.creation_preparation_recovery_complete($1,$2,$3::uuid,$4,$5::jsonb)';
  try{
    need(process.argv.slice(2).join(' ')==='--development-rollback','explicit_rollback_flag_required');need(resolve(process.cwd())===ROOT,'worktree_mismatch');
    let input='';process.stdin.setEncoding('utf8');for await(const chunk of process.stdin){input+=chunk;need(Buffer.byteLength(input)<=4096,'runtime_input_too_large');}
    const url=acceptanceTarget(input.trim(),process.env);need(typeof WebSocket==='function','native_websocket_required');
    const {Client}=await import('@neondatabase/serverless');
    client=new Client({connectionString:url,connectionTimeoutMillis:10000,query_timeout:15000,application_name:'yawrd-p35r-rollback-check'});client.on('error',()=>{});
    stage='connect';await client.connect();connected=true;begun=true;const tx=await begin(client);
    stage='recovery_eligibility';baseline=await snapshot();
    need(baseline.creation_preparation_recoveries.n===0&&baseline.creation_preparation_versions.n===0&&baseline.creation_preparation_approvals.n===0,'unexpected_existing_recovery_or_artifact');
    const own=await session(client,FOUNDER),foreign=await session(client,'p35r-foreign-'+randomBytes(6).toString('hex')+'.testnet');
    const info=(await one(read,[own,ID])).recovery;
    need(info.eligible===true&&info.attempt===null&&info.originalAttempt.state==='failed'&&info.originalAttempt.errorCode==='generation_output_incomplete','recovery_not_eligible');
    const parent=info.originalAttempt.id;
    const binding=(await one('SELECT yawrd.creation_preparation_access($1,$2) AS binding',[own,ID])).binding;
    need(binding.founderAccountId===FOUNDER&&binding.daoAccountId==='xfheozm6d1tb.factory.yawrd.testnet','paid_founder_binding_mismatch');
    need(Number((await one('SELECT revision FROM yawrd.creation_drafts WHERE id=$1',[ID])).revision)===7,'source_revision_mismatch');
    emit(stage,{revision:7,confirmedFailureEligible:true,existingPaidBinding:true});

    stage='original_failure_immutable';
    await reject("UPDATE yawrd.creation_preparation_attempts SET state='reserved' WHERE creation_id=$1",[ID],'P0001','generation_attempt_conflict');
    await reject('UPDATE yawrd.creation_preparation_attempts SET source_text=source_text WHERE creation_id=$1',[ID],'42501');
    need((await snapshot()).creation_preparation_attempts.digest===baseline.creation_preparation_attempts.digest,'original_attempt_changed');emit(stage,{originalPreserved:true});

    stage='founder_consent_and_source_binding';
    await reject(read,[foreign,ID],'P0001','creation_not_found');
    await reject(reserve,[foreign,ID,randomUUID(),parent,CONSENT,token()],'P0001','creation_not_found');
    await reject(reserve,[own,ID,randomUUID(),parent,'unapproved',token()],'P0001','generation_consent_required');
    await reject(reserve,[own,ID,randomUUID(),randomUUID(),CONSENT,token()],'P0001','recovery_not_eligible');
    await reject(`INSERT INTO yawrd.creation_preparation_recoveries(creation_id,id,parent_attempt_id,authorized_by,source_creation_revision,source_text,request_digest,model,prompt_version,consent_version)
      SELECT creation_id,$2::uuid,id,'yawrd1.testnet',7,'{}',$3,'openai/gpt-6.1-sol','creation-source-aware-recovery-v1','creation-partner-recovery-v1'
      FROM yawrd.creation_preparation_attempts WHERE creation_id=$1`,[ID,randomUUID(),token()],'P0001','recovery_not_eligible');
    emit(stage,{foreignFounderDenied:true,explicitConsentRequired:true,wrongParentAndForgedSourceDenied:true});

    stage='duplicate_recovery_reservation';const attempt=randomUUID(),digest=token();
    need((await one(reserve,[own,ID,attempt,parent,CONSENT,digest])).won===true,'first_reservation_failed');
    need((await one(reserve,[own,ID,randomUUID(),parent,CONSENT,token()])).won===false,'duplicate_reservation_won');
    const copy=await one(`SELECT r.parent_attempt_id=$2::uuid AS parent,r.authorized_by='yawrd1.testnet' AS founder,
      r.source_creation_revision=7 AND r.source_creation_revision=o.source_creation_revision AS revision,
      r.source_text=o.source_text AND r.source_digest=o.source_digest AS exact_source,
      r.output_token_limit=16000 AND r.provider_timeout_ms=420000 AS limits,
      r.deadline_at>r.reserved_at+interval '449 seconds' AND r.deadline_at<r.reserved_at+interval '451 seconds' AS deadline
      FROM yawrd.creation_preparation_recoveries r JOIN yawrd.creation_preparation_attempts o ON o.id=r.parent_attempt_id WHERE r.creation_id=$1`,[ID,parent]);
    need(Object.values(copy).every(v=>v===true),'recovery_source_or_limits_mismatch');emit(stage,{oneReservedRecovery:true,exactSourceCopied:true,dispatches:0});

    stage='atomic_generated_result';
    await q(stageSql,[own,ID,attempt,'waiting',null,null]);await q(stageSql,[own,ID,attempt,'checking',null,null]);
    const artifact=preparationArtifacts();artifact.privateNotes='';const checked=validatePreparation(artifact);need(preparationIssues(checked).length===0,'synthetic_artifact_contract_invalid');const text=JSON.stringify(checked);
    const usage={protocol:'responses',requestedModel:'openai/gpt-6.1-sol',returnedModel:'gpt-6.1-sol',responseId:'synthetic-recovery-acceptance',finishReason:'stop',tokens:{input:100,output:9000,reasoning:1000,cached:0},durationMs:1};
    // This late CHECK fails after version INSERT. PostgreSQL must undo the INSERT.
    await reject(complete,[own,ID,attempt,text,JSON.stringify({...usage,padding:'x'.repeat(9000)})],'23514');
    need((await one('SELECT count(*)::int AS n FROM yawrd.creation_preparation_versions WHERE creation_id=$1',[ID])).n===0,'partial_artifact_survived_failed_completion');
    need((await one('SELECT state FROM yawrd.creation_preparation_recoveries WHERE creation_id=$1',[ID])).state==='checking','failed_completion_changed_state');
    await q(complete,[own,ID,attempt,text,JSON.stringify(usage)]);await q(complete,[own,ID,attempt,text,JSON.stringify(usage)]);
    const saved=await one(`SELECT r.state='saved' AND r.result_revision=1 AS terminal,
      v.content_digest=$2 AND v.origin='ai-generated' AND v.author_account_id IS NULL AS artifact,
      v.generation->>'recoveryOf'=$3 AND v.generation->>'attemptId'=$4 AND v.generation->>'sourceDigest'=r.source_digest AS provenance
      FROM yawrd.creation_preparation_recoveries r JOIN yawrd.creation_preparation_versions v ON v.creation_id=r.creation_id AND v.revision=r.result_revision WHERE r.creation_id=$1`,[ID,sha(text),parent,attempt]);
    need(Object.values(saved).every(v=>v===true),'atomic_saved_result_mismatch');
    need((await one('SELECT count(*)::int AS n FROM yawrd.creation_preparation_versions WHERE creation_id=$1',[ID])).n===1,'completion_not_idempotent');
    emit(stage,{lateFailureRolledBack:true,resultAndStatusAtomic:true,completionIdempotent:true});

    // Remove only the synthetic test writes to allow the independent lock probe.
    // No original row is reset: roll back the entire primary transaction.
    need((await one('SELECT txid_current()::text AS xid')).xid===tx.xid,'primary_transaction_changed');
    need((await q('ROLLBACK')).command==='ROLLBACK','rollback_not_acknowledged');begun=false;rollback=true;

    stage='concurrent_recovery_reservation';
    begun=true;rollback=false;const lockTx=await begin(client),lockSession=await session(client,FOUNDER);
    need((await one(reserve,[lockSession,ID,randomUUID(),parent,CONSENT,token()])).won===true,'lock_probe_reservation_failed');
    worker=new Client({connectionString:url,connectionTimeoutMillis:10000,query_timeout:15000,application_name:'yawrd-p35r-lock-worker'});worker.on('error',()=>{});await worker.connect();
    workerBegun=true;const workerTx=await begin(worker),workerSession=await session(worker,FOUNDER);
    const pending=worker.query(reserve,[workerSession,ID,randomUUID(),parent,CONSENT,token()]).then(value=>({value}),error=>({error}));
    let blocked=false;for(let i=0;i<20;i++){if((await one('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[lockTx.pid,workerTx.pid])).blocked){blocked=true;break;}await delay(50);}
    need(blocked,'competing_reservation_not_serialized');
    need((await q('ROLLBACK')).command==='ROLLBACK','lock_probe_rollback_not_acknowledged');begun=false;rollback=true;
    const outcome=await pending;need(!outcome.error&&outcome.value.rows[0]?.won===true,'waiter_did_not_observe_rollback');
    need((await worker.query('ROLLBACK')).command==='ROLLBACK','worker_rollback_not_acknowledged');workerBegun=false;workerRollback=true;
    emit(stage,{blockedByCreationLock:true,waiterWonOnlyAfterRollback:true,committedWinnerRaceUntested:true,dispatches:0});
  }catch(e){failure={stage,code:safe(e)};}
  finally{
    if(begun&&client)try{need((await q('ROLLBACK')).command==='ROLLBACK','rollback_not_acknowledged');rollback=true;}catch(e){failure??={stage:'rollback',code:safe(e)};}
    if(workerBegun&&worker)try{need((await worker.query('ROLLBACK')).command==='ROLLBACK','worker_rollback_not_acknowledged');workerRollback=true;}catch(e){failure??={stage:'worker_rollback',code:safe(e)};}
    if(connected&&rollback&&baseline)try{
      after=await snapshot();need(JSON.stringify(after)===JSON.stringify(baseline),'existing_records_or_collections_changed');
      const remaining=await one(`SELECT (SELECT count(*)::int FROM yawrd.sessions WHERE token_hash=ANY($1::text[])) AS sessions,
        (SELECT count(*)::int FROM yawrd.auth_challenges WHERE id=ANY($2::text[])) AS challenges`,[sessions,challenges]);
      need(Object.values(remaining).every(n=>n===0),'synthetic_auth_records_remain');
      need(after.creation_preparation_recoveries.n===0&&after.creation_preparation_versions.n===0,'synthetic_recovery_or_artifact_remains');
    }catch(e){failure??={stage:'rollback_preservation',code:safe(e)};}
    for(const c of [worker,client])if(c)try{await c.end();}catch{failure??={stage:'close',code:'connection_close_failed'};}
  }
  if(failure){console.log(JSON.stringify({status:'FAIL',...failure,rollbackAcknowledged:rollback,workerRollbackAcknowledged:workerRollback,credentials:'suppressed'}));process.exitCode=1;return;}
  need(rollback&&workerRollback&&after,'rollback_verification_missing');
  emit('rollback_preservation',{syntheticRowsRemaining:0,realCreationDeploymentPaymentOriginalFailureUnchanged:true,recoveryAllowanceUnused:true});
  console.log(JSON.stringify({status:'PASS',scope:'P3.5R recovery-only PostgreSQL rollback acceptance',checks:passed.length,inference:false,spending:false,committedPersistenceUntested:true,committedWinnerRaceUntested:true}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.log(JSON.stringify({status:'FAIL',stage:'runner',code:'check_unavailable',credentials:'suppressed'}));process.exitCode=1;});
