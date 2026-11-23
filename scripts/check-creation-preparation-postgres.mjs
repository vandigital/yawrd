// Founder-operated P3.5 acceptance. Restricted Development runtime only.
// Credentials arrive on stdin, never from an environment loader or argv.
// Synthetic fixtures are transaction-local. Every connection explicitly rolls back.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { deploymentCheckTarget } from './check-creation-deployment-postgres.mjs';
import { generatePublicId } from '../src/project-identity.ts';
import { generateDaoIdentifier } from '../src/creation/dao-identifier.ts';
import { createEmptyYawrdIntakeDraft, updateYawrdIntakeDraft } from '../src/yawrd-intake.ts';
import { prepareCreation, canonical } from '../src/creation-integration.ts';
import { testnetFactorySettings } from '../src/testnet-factory-settings.ts';
import { preparationArtifacts } from '../test/fixtures/preparation.ts';
import { validatePreparation, preparationIssues } from '../src/creation/preparation-contract.ts';

const ROOT='/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117';
const REAL={id:'yawrd-uorgr4yy5sxu',founder:'yawrd1.testnet',dao:'xfheozm6d1tb.factory.yawrd.testnet'};
const ROLE='yawrd_07b_runtime',MODEL='Qwen/Qwen3.8-27B',CONSENT='creation-ai-preparation-v1';
const tables=['creation_preparation_versions','creation_preparation_approvals','creation_preparation_attempts'];
const sha=s=>createHash('sha256').update(s).digest('hex');
const token=()=>sha(randomBytes(32)),hash=()=>randomBytes(24).toString('hex').replaceAll('0','1').slice(0,44);
class Failure extends Error {constructor(code){super(code);this.code=code;}}
const need=(ok,code)=>{if(!ok)throw new Failure(code);};
const safe=e=>e instanceof Failure?e.code:/^[0-9A-Z]{5}$/.test(e?.code??'')?'postgres_'+e.code:'transport_or_driver_unavailable';

export function acceptanceTarget(raw,env){
  need(env.YAWRD_ENABLE_CREATION_PREPARATION==='0'&&env.YAWRD_ENABLE_CREATION_PREMIUM_TEST==='0','inference_flags_must_be_disabled');
  need(typeof raw==='string'&&raw.length>0&&raw.length<=4096,'explicit_runtime_input_required');
  const url=deploymentCheckTarget({DATABASE_URL:raw,YAWRD_TEST_DATABASE_DEVELOPMENT:env.YAWRD_TEST_DATABASE_DEVELOPMENT,YAWRD_DEV_DATABASE_ENDPOINT:env.YAWRD_DEV_DATABASE_ENDPOINT});
  need(new URL(url).password.length>0,'explicit_runtime_password_required');
  return url;
}

export async function runAcceptance(url){
  const run=randomBytes(8).toString('hex'),founder='p35-check-a-'+run+'.testnet',foreign='p35-check-b-'+run+'.testnet';
  const ids=[generatePublicId(),generatePublicId()],challenges=[],sessions=[],passed=[];
  let client,worker,connected=false,begun=false,workerBegun=false,rolledBack=false,workerRolledBack=false,baseline,after,stage='connect',failure;
  const emit=(name,details={})=>{passed.push(name);console.log(JSON.stringify({status:'PASS',name,...details}));};
  const q=(sql,args=[])=>client.query(sql,args);
  async function one(sql,args=[]){const r=await q(sql,args);need(r.rows.length===1,'expected_one_row');return r.rows[0];}
  async function rejected(sql,args,state,message){
    await q('SAVEPOINT p35_rejection');let error;
    try{await q(sql,args);}catch(e){error=e;}
    await q('ROLLBACK TO SAVEPOINT p35_rejection');await q('RELEASE SAVEPOINT p35_rejection');
    need(error?.code===state&&(!message||error.message===message),'expected_rejection_not_observed');
  }
  async function begin(c){
    need((await c.query('BEGIN ISOLATION LEVEL READ COMMITTED')).command==='BEGIN','begin_not_acknowledged');
    await c.query("SET LOCAL statement_timeout='10s'");await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL idle_in_transaction_session_timeout='30s'");
    const {rows:[s]}=await c.query("SELECT current_user AS role,session_user AS login,current_database() AS db,current_setting('transaction_isolation') AS isolation,pg_backend_pid() AS pid,txid_current()::text AS xid");
    need(s.role===ROLE&&s.login===ROLE&&s.db==='neondb'&&s.isolation==='read committed','runtime_transaction_identity_mismatch');return s;
  }
  async function session(c,account){
    const challenge=randomBytes(32).toString('base64url'),s=token();challenges.push(challenge);sessions.push(s);
    await c.query(`INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
      VALUES($1,$2,$3,'testnet','https://p35-rollback.invalid','SYNTHETIC rollback fixture','P3.5 rollback acceptance',$4,
      statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp())`,[challenge,token(),account,randomBytes(32).toString('base64')]);
    await c.query(`INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash,created_at,expires_at)
      VALUES($1,$2,'testnet',$3,'synthetic-key',1,'synthetic-block',statement_timestamp(),statement_timestamp()+interval '1 hour')`,[s,challenge,account]);return s;
  }
  async function snapshot(){
    const names=['creation_drafts','creation_deployments','creation_platform_fees',...tables];
    const result={};for(const name of names){const key=name==='creation_drafts'?'id':name==='creation_preparation_versions'||name==='creation_preparation_approvals'?'creation_id,revision':'creation_id';
      result[name]=await one(`SELECT count(*)::int AS n,md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY ${key})::text,'[]')) AS digest FROM yawrd.${name} r`);
    }return result;
  }
  const reserveSQL='SELECT yawrd.creation_preparation_reserve($1,$2,$3::uuid,$4,$5,$6,$7,$8,$9) AS won';
  const source=c=>JSON.stringify({provenance:{creationId:c.id,creationRevision:Number(c.revision)},fixture:'SYNTHETIC rollback-only preparation source; no inference'});
  const reserveArgs=(s,c,a=randomUUID())=>[s,c.id,a,c.revision,source(c),MODEL,'creation-source-aware-v1',CONSENT,sha('synthetic-request-'+a)];
  const stageSQL='SELECT yawrd.creation_preparation_stage($1,$2,$3::uuid,$4,$5::jsonb,$6)';
  const completeSQL='SELECT yawrd.creation_preparation_complete($1,$2,$3::uuid,$4,$5::jsonb)';
  try{
    const {Client}=await import('@neondatabase/serverless');
    client=new Client({connectionString:url,connectionTimeoutMillis:10000,query_timeout:15000,application_name:'yawrd-p35-rollback-check'});client.on('error',()=>{});
    await client.connect();connected=true;
    // No env loader, connection recovery, or transaction recreation after failure.
    begun=true;const tx=await begin(client);
    stage='installed_definitions';
    const sources=await Promise.all(['phase2_creation_preparation.sql','phase2_creation_preparation_generation.sql','phase2_creation_preparation_intake_guard.sql'].map(f=>readFile(new URL('../docs/proposals/migrations/'+f,import.meta.url),'utf8')));
    const normalize=s=>s.replace(/\s+/g,' ').trim(),expected=new Map(sources.flatMap(s=>[...s.matchAll(/CREATE FUNCTION yawrd\.(creation_(?:preparation_\w+|intake_preparation_guard))\([\s\S]*? AS \$\$([\s\S]*?)\$\$;/g)].map(m=>[m[1],normalize(m[2])])));
    need(expected.size===11,'artifact_inventory_mismatch');
    const functions=(await q(`SELECT p.proname,p.prosrc,p.prosecdef,has_function_privilege(current_user,p.oid,'EXECUTE') AS executable,
      EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='yawrd' AND p.proname=ANY($1::text[])`,[[...expected.keys()]])).rows;
    need(functions.length===11&&functions.every(f=>!f.prosecdef&&!f.public_execute&&normalize(f.prosrc)===expected.get(f.proname)&&(f.proname.endsWith('_guard')||f.executable)),'installed_function_definition_mismatch');
    const guard=await one(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname='guard_creation_intake_preparation' AND tgrelid='yawrd.creation_drafts'::regclass
      AND tgfoid='yawrd.creation_intake_preparation_guard()'::regprocedure AND tgenabled IN ('O','A') AND NOT tgisinternal`);need(guard.n===1,'intake_guard_not_enabled');
    baseline=await snapshot();need(tables.every(t=>baseline[t].n===0),'preparation_tables_not_empty');
    const real=await one(`SELECT c.founder_account_id=$2 AND c.network='testnet' AND c.source_draft_id=c.initial_intake->>'draftId' AS founder,
      d.dao_account_id=$3 AND f.dao_account_id=d.dao_account_id AND f.founder_account_id=c.founder_account_id AS identity,
      f.state='paid' AND f.transaction_hash=f.evidence->>'txHash' AND f.deployment_transaction=d.transaction_hash
        AND f.deployment_digest=d.evidence->>'evidenceDigest' AS paid
      FROM yawrd.creation_drafts c JOIN yawrd.creation_deployments d ON d.creation_id=c.id JOIN yawrd.creation_platform_fees f ON f.creation_id=c.id WHERE c.id=$1`,[REAL.id,REAL.founder,REAL.dao]);
    need(Object.values(real).every(v=>v===true),'existing_paid_creation_binding_mismatch');emit(stage,{functions:11,existingPaidCreationAndFounderIntact:true});
    stage='restricted_runtime_permissions';
    for(const t of tables){
      const p=await one(`SELECT has_table_privilege(current_user,$1,'DELETE') AS del,has_table_privilege(current_user,$1,'TRUNCATE') AS trunc`,['yawrd.'+t]);need(!p.del&&!p.trunc,'unexpected_destructive_permission');
      await rejected(`DELETE FROM yawrd.${t} WHERE creation_id=$1`,[ids[0]],'42501');await rejected('TRUNCATE yawrd.'+t,[],'42501');
    }
    const cols=(await q(`SELECT a.attname,has_column_privilege(current_user,a.attrelid,a.attname,'UPDATE') AS allowed FROM pg_attribute a
      WHERE a.attrelid='yawrd.creation_preparation_attempts'::regclass AND a.attnum>0 AND NOT a.attisdropped`)).rows;
    need(cols.every(c=>c.allowed===['state','result_revision','usage','error_code'].includes(c.attname)),'attempt_update_allowlist_mismatch');
    await rejected('UPDATE yawrd.creation_preparation_attempts SET source_text=source_text WHERE creation_id=$1',[ids[0]],'42501');
    await rejected('UPDATE yawrd.creation_preparation_versions SET artifact_text=artifact_text WHERE creation_id=$1',[ids[0]],'42501');emit(stage,{destructiveOperationsDenied:true,attemptUpdateAllowlist:true});
    stage='synthetic_paid_fixtures';const own=await session(client,founder),other=await session(client,foreign),realSession=await session(client,REAL.founder);
    const fixtures=[];
    for(const id of ids){
      let intake={...updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft('p35-'+run+'-'+id,new Date().toISOString()),{projectType:'research',startingPoint:'idea',availableResources:'None yet',successCriteria:'Review three seed observations.',initialOutcomeConfirmed:true,intendedBudget:'undecided',founderDescription:'A synthetic voluntary seed survey.'},new Date().toISOString()),projectName:'Synthetic P3.5 rollback'};
      let c=await one('SELECT * FROM yawrd.creation_start($1,$2,$3::jsonb)',[own,id,JSON.stringify(intake)]);
      const config={publicName:'Synthetic rollback public name',publicDescription:'Synthetic fixture only; no chain transaction.',accountLabel:'',secondSteward:foreign,threshold:2};
      c=await one('SELECT * FROM yawrd.creation_save($1,$2,$3,NULL,$4::jsonb)',[own,id,c.revision,JSON.stringify(config)]);
      const identifier=generateDaoIdentifier(),prepared=prepareCreation({projectName:c.public_name,projectPurpose:c.public_description,projectAccountLabel:identifier,creatorAccountId:founder,initialStewardAccountIds:[foreign],stewardApprovalThreshold:2,factoryAccountId:testnetFactorySettings.factoryAccountId},testnetFactorySettings,{accountId:founder,network:'testnet'});
      let d=await one('SELECT * FROM yawrd.creation_deployment_reserve($1,$2,$3,$4)',[own,id,c.revision,identifier]);
      d=await one('SELECT * FROM yawrd.creation_deployment_prepare($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[own,id,c.revision,d.revision,JSON.stringify(prepared),JSON.stringify({syntheticRollbackOnly:true})]);
      d=await one('SELECT * FROM yawrd.creation_deployment_claim($1,$2,$3,$4,$5,$6)',[own,id,c.revision,d.revision,1,'creation-deployment-v1']);
      const deploymentHash=hash();d=await one('SELECT * FROM yawrd.creation_deployment_note($1,$2,$3,$4,$5)',[own,id,d.revision,1,deploymentHash]);
      d=await one('SELECT * FROM yawrd.creation_deployment_finish($1,$2,$3,$4,$5,$6::jsonb)',[own,id,d.revision,1,'deployed-hardening-required',JSON.stringify({transactionHash:deploymentHash,evidenceDigest:sha('SYNTHETIC deployment '+id),transactionBlockHeight:'2',finalHeight:'3',autoUpdate:true})]);
      const review={verified:true,autoUpdate:false,proposalId:0,proposalStatus:'Approved',votes:{[founder]:'Approve',[foreign]:'Approve'},blockHeight:10,blockHash:hash(),checkedAt:new Date().toISOString()};
      let fee=await one('SELECT * FROM yawrd.creation_fee_open($1,$2,$3,$4,$5::jsonb)',[own,id,c.revision,d.revision,JSON.stringify(review)]);
      fee=await one('SELECT * FROM yawrd.creation_fee_claim($1,$2,$3,$4,$5,$6::jsonb,$7)',[own,id,c.revision,d.revision,fee.revision,JSON.stringify(review),'creation-platform-fee-v1']);
      const paymentHash=hash();fee=await one('SELECT * FROM yawrd.creation_fee_note($1,$2,$3,$4)',[own,id,fee.revision,paymentHash]);
      fee=await one('SELECT * FROM yawrd.creation_fee_complete($1,$2,$3,$4::jsonb)',[own,id,fee.revision,JSON.stringify({txHash:paymentHash,blockHeight:'11',receiptId:hash(),evidenceDigest:sha('SYNTHETIC receipt '+id)})]);
      const {rows:[binding]}=await q('SELECT yawrd.creation_preparation_access($1,$2) AS binding',[own,id]);fixtures.push({c,d,fee,binding:binding.binding});
    }
    const [f,g]=fixtures;
    stage='intake_before_reservation_and_owner_isolation';const original=canonical(f.c.initial_intake),bound=canonical(f.binding),oldRevision=f.c.revision;
    const revised=updateYawrdIntakeDraft(f.c.intake,{founderDescription:'Latest synthetic saved source, voluntary and unpaid.'},new Date().toISOString());
    f.c=await one('SELECT * FROM yawrd.creation_save($1,$2,$3,$4::jsonb,NULL)',[own,f.c.id,oldRevision,JSON.stringify(revised)]);
    need(Number(f.c.revision)===Number(oldRevision)+1&&canonical(f.c.initial_intake)===original&&canonical(f.c.intake)===canonical(revised),'intake_revision_or_original_mismatch');
    await rejected(reserveSQL,reserveArgs(own,{...f.c,revision:oldRevision}),'P0001','generation_source_changed');
    for(const statement of ['SELECT yawrd.creation_preparation_read($1,$2)','SELECT * FROM yawrd.creation_read($1,$2)'])await rejected(statement,[other,f.c.id],'P0001','creation_not_found');
    await rejected('SELECT * FROM yawrd.creation_save($1,$2,$3,$4::jsonb,NULL)',[other,f.c.id,f.c.revision,JSON.stringify(revised)],'P0001','creation_not_found');
    const ra=reserveArgs(own,f.c);need((await one(reserveSQL,ra)).won===true,'initial_reservation_failed');
    const reserved=await one('SELECT * FROM yawrd.creation_preparation_attempts WHERE creation_id=$1',[f.c.id]);need(Number(reserved.source_creation_revision)===Number(f.c.revision)&&reserved.source_text===ra[4]&&reserved.source_digest===sha(ra[4]),'reserved_source_mismatch');
    const assertLocked=async(c,s=own)=>{const before=await one('SELECT to_jsonb(c) AS row FROM yawrd.creation_drafts c WHERE id=$1',[c.id]);
      const changed=updateYawrdIntakeDraft(c.intake,{availableResources:'A changed synthetic answer.'},new Date().toISOString());
      await rejected('SELECT * FROM yawrd.creation_save($1,$2,$3,$4::jsonb,NULL)',[s,c.id,c.revision,JSON.stringify(changed)],'P0001','creation_intake_locked');
      need(canonical((await one('SELECT to_jsonb(c) AS row FROM yawrd.creation_drafts c WHERE id=$1',[c.id])).row)===canonical(before.row),'locked_save_partially_changed_creation');};
    await assertLocked(f.c);need((await one(reserveSQL,reserveArgs(own,f.c))).won===false,'duplicate_reservation_won');
    need(canonical((await one('SELECT yawrd.creation_preparation_access($1,$2) AS binding',[own,f.c.id])).binding)===bound,'frozen_paid_binding_changed');emit(stage,{latestSavedSource:true,staleReservationDenied:true,foreignFounderDenied:true,duplicateReservation:false});
    stage='terminal_attempt_intake_lock';
    for(const state of ['failed','unknown']){
      await q('SAVEPOINT p35_terminal');const r=reserveArgs(own,g.c);need((await one(reserveSQL,r)).won,'terminal_fixture_reservation_failed');
      await q(stageSQL,[own,g.c.id,r[2],'waiting',null,null]);await q(stageSQL,[own,g.c.id,r[2],state,null,state==='failed'?'generation_output_invalid':'generation_completion_unknown']);
      await assertLocked(g.c);need((await one(reserveSQL,reserveArgs(own,g.c))).won===false,'terminal_allowance_reopened');
      await q('ROLLBACK TO SAVEPOINT p35_terminal');await q('RELEASE SAVEPOINT p35_terminal');
    }emit(stage,{failedAndUnknownRemainLocked:true});
    stage='atomic_generated_version_and_exact_approval';
    await q(stageSQL,[own,f.c.id,ra[2],'waiting',null,null]);await q(stageSQL,[own,f.c.id,ra[2],'checking',null,null]);
    const artifact=preparationArtifacts();artifact.privateNotes='';const valid=validatePreparation(artifact);need(preparationIssues(valid).length===0,'offline_artifact_fixture_invalid');const text=JSON.stringify(valid);
    const usage={protocol:'chat-completions',requestedModel:MODEL,returnedModel:MODEL,responseId:'synthetic-p35-rollback',finishReason:'stop',tokens:{input:100,output:1000,reasoning:0,cached:0},durationMs:1};
    // Force a late CHECK failure after INSERT; the function must roll it back.
    await rejected(completeSQL,[own,f.c.id,ra[2],text,JSON.stringify({...usage,padding:'x'.repeat(9000)})],'23514');
    need((await one('SELECT count(*)::int AS n FROM yawrd.creation_preparation_versions WHERE creation_id=$1',[f.c.id])).n===0,'partial_generated_version_survived_failure');
    need((await one('SELECT state FROM yawrd.creation_preparation_attempts WHERE creation_id=$1',[f.c.id])).state==='checking','failed_completion_changed_attempt');
    await q(completeSQL,[own,f.c.id,ra[2],text,JSON.stringify(usage)]);await q(completeSQL,[own,f.c.id,ra[2],text,JSON.stringify(usage)]);
    const completed=await one('SELECT state,result_revision FROM yawrd.creation_preparation_attempts WHERE creation_id=$1',[f.c.id]);need(completed.state==='saved'&&Number(completed.result_revision)===1,'generated_completion_not_atomic');
    const root=await one('SELECT * FROM yawrd.creation_preparation_versions WHERE creation_id=$1 AND revision=1',[f.c.id]);need(root.origin==='ai-generated'&&root.author_account_id===null&&root.content_digest===sha(text)&&root.generation.sourceDigest===reserved.source_digest,'generated_provenance_mismatch');
    const approve='SELECT yawrd.creation_preparation_approve($1,$2,$3,$4,$5) AS workspace';
    await rejected(approve,[own,f.c.id,1,'0'.repeat(64),'creation-preparation-review-v1'],'P0001','preparation_revision_conflict');
    await one(approve,[own,f.c.id,1,root.content_digest,'creation-preparation-review-v1']);await one(approve,[own,f.c.id,1,root.content_digest,'creation-preparation-review-v1']);
    const arow=await one('SELECT * FROM yawrd.creation_preparation_approvals WHERE creation_id=$1',[f.c.id]);need(arow.content_digest===root.content_digest&&arow.approved_by===founder&&Number(arow.revision)===1,'exact_approval_mismatch');
    const derivative=structuredClone(valid);derivative.blueprint.summary='Founder-edited synthetic derivative.';
    const edited=await one('SELECT yawrd.creation_preparation_save($1,$2,$3,$4,$5) AS workspace',[own,f.c.id,1,root.content_digest,JSON.stringify(derivative)]);
    need(edited.workspace.versions.length===2&&edited.workspace.versions[1].approval===null&&edited.workspace.versions[1].origin==='founder-edited'&&edited.workspace.versions[1].generation===null,'derivative_approval_or_origin_mismatch');
    await rejected(approve,[own,f.c.id,1,root.content_digest,'creation-preparation-review-v1'],'P0001','preparation_revision_conflict');
    need((await one('SELECT count(*)::int AS n FROM yawrd.creation_preparation_approvals WHERE creation_id=$1',[f.c.id])).n===1,'duplicate_or_stale_approval_inserted');emit(stage,{lateFailureRolledBack:true,completionIdempotent:true,exactApproval:true,editsRemainUnapproved:true});
    // The live lock probe uses only synthetic auth/attempt rows against the paid
    // Creation. It never changes that Creation's intake or payment/deployment.
    stage='reservation_lock_between_sessions';
    const realCreation=await one('SELECT * FROM yawrd.creation_read($1,$2)',[realSession,REAL.id]),realArgs=reserveArgs(realSession,realCreation);
    need((await one(reserveSQL,realArgs)).won===true,'real_binding_rollback_reservation_failed');
    worker=new Client({connectionString:url,connectionTimeoutMillis:10000,query_timeout:15000,application_name:'yawrd-p35-lock-worker'});worker.on('error',()=>{});await worker.connect();
    workerBegun=true;const workerTx=await begin(worker);const workerSession=await session(worker,REAL.founder),workerArgs=reserveArgs(workerSession,realCreation);
    const pending=worker.query(reserveSQL,workerArgs).then(value=>({value}),error=>({error}));let blocked=false;
    for(let i=0;i<20;i++){const b=await one('SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked',[tx.pid,workerTx.pid]);if(b.blocked){blocked=true;break;}await delay(50);}
    need(blocked,'competing_reservation_not_blocked_on_creation');
    need((await one('SELECT txid_current()::text AS xid')).xid===tx.xid,'primary_transaction_changed');
    need((await q('ROLLBACK')).command==='ROLLBACK','rollback_not_acknowledged');begun=false;rolledBack=true;
    const outcome=await pending;need(!outcome.error&&outcome.value.rows[0]?.won===true,'worker_did_not_observe_rolled_back_reservation');
    need((await worker.query('ROLLBACK')).command==='ROLLBACK','worker_rollback_not_acknowledged');workerBegun=false;workerRolledBack=true;
    emit(stage,{twoSessions:true,blockedByCreationLock:true,waiterWonAfterRollback:true,committedRaceUntested:true});
  }catch(e){failure={stage,code:safe(e)};}
  finally{
    if(workerBegun&&worker)try{need((await worker.query('ROLLBACK')).command==='ROLLBACK','worker_rollback_not_acknowledged');workerRolledBack=true;}catch(e){failure??={stage:'worker_rollback',code:safe(e)};}
    if(begun&&client)try{need((await q('ROLLBACK')).command==='ROLLBACK','rollback_not_acknowledged');rolledBack=true;}catch(e){failure??={stage:'rollback',code:safe(e)};}
    if(connected&&rolledBack&&baseline)try{
      after=await snapshot();need(canonical(baseline)===canonical(after),'persistent_records_changed');
      const remains=await one(`SELECT (SELECT count(*)::int FROM yawrd.sessions WHERE token_hash=ANY($1::text[])) AS sessions,
        (SELECT count(*)::int FROM yawrd.auth_challenges WHERE id=ANY($2::text[])) AS challenges,
        (SELECT count(*)::int FROM yawrd.creation_drafts WHERE id=ANY($3::text[])) AS creations`,[sessions,challenges,ids]);
      need(Object.values(remains).every(n=>n===0),'synthetic_records_remain');
    }catch(e){failure??={stage:'rollback_preservation',code:safe(e)};}
    for(const c of [worker,client])if(c)try{await c.end();}catch{failure??={stage:'close',code:'connection_close_failed'};}
  }
  if(failure){console.log(JSON.stringify({status:'FAIL',...failure,rollbackVerified:rolledBack,workerRollbackVerified:workerRolledBack,credentials:'suppressed'}));return false;}
  need(rolledBack&&workerRolledBack&&after,'rollback_verification_missing');emit('rollback_preservation',{syntheticRowsRemaining:0,existingCreationDeploymentPaymentUnchanged:true,preparationTablesEmpty:true});
  console.log(JSON.stringify({status:'PASS',scope:'P3.5 Development PostgreSQL rollback acceptance',checks:passed.length,inference:false,wallet:false,committedPersistenceUntested:true,installationException:'founder-reported autocommit after initial connection interruption; not reinstalled'}));return true;
}

async function main(){
  try{
    need(process.argv.slice(2).join(' ')==='--development-rollback','explicit_rollback_flag_required');need(resolve(process.cwd())===ROOT,'worktree_mismatch');
    need(typeof WebSocket==='function','native_websocket_required');let input='';process.stdin.setEncoding('utf8');
    for await(const chunk of process.stdin){input+=chunk;need(Buffer.byteLength(input)<=4096,'runtime_input_too_large');}
    const url=acceptanceTarget(input.trim(),process.env);
    if(!await runAcceptance(url))process.exitCode=1;
  }catch(e){console.log(JSON.stringify({status:'FAIL',stage:'input_or_runner',code:safe(e),credentials:'suppressed'}));process.exitCode=1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))void main();
