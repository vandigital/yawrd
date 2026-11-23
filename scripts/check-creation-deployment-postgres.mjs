// Founder-operated P3.2 acceptance only: one connection, one transaction, always
// ROLLBACK. No migration, grant, RPC, HTTP, wallet, owner login or committed seed.
// Use the existing silent load-environment.mjs preloader in the command below.
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { integrationDatabaseUrl } from '../src/participants/database-config.ts';
import { generatePublicId } from '../src/project-identity.ts';
import { generateDaoIdentifier } from '../src/creation/dao-identifier.ts';
import { createEmptyYawrdIntakeDraft } from '../src/yawrd-intake.ts';
import { prepareCreation } from '../src/creation-integration.ts';
import { testnetFactorySettings } from '../src/testnet-factory-settings.ts';

const ENDPOINT='ep-twilight-voice-aorpfrbm', DATABASE='neondb', ROLE='yawrd_07b_runtime';
const ROOT='/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117';
class CheckFailure extends Error { constructor(code){super(code);this.code=code;} }
const need=(value,code)=>{if(!value)throw new CheckFailure(code);};
const digest=value=>createHash('sha256').update(value).digest('hex');

// Pure guard, independently pinned to the founder-confirmed Development target.
// Never print the URL, user-supplied environment, SQL parameters or raw errors.
export function deploymentCheckTarget(env=process.env){
  need(env.YAWRD_TEST_DATABASE_DEVELOPMENT==='1' && env.YAWRD_TEST_DATABASE_DISPOSABLE!=='1','development_opt_in_required');
  need(env.YAWRD_DEV_DATABASE_ENDPOINT===ENDPOINT,'development_endpoint_confirmation_required');
  let value,url;
  try{value=integrationDatabaseUrl(env);url=new URL(value);}catch{throw new CheckFailure('runtime_database_configuration_unavailable');}
  need(url.hostname.endsWith('.neon.tech') && url.hostname.split('.')[0].replace(/-pooler$/,'')===ENDPOINT,'wrong_development_endpoint');
  need(url.pathname==='/'+DATABASE && (!url.port||url.port==='5432') && !url.hash,'wrong_database');
  need(decodeURIComponent(url.username)===ROLE,'restricted_runtime_login_required');
  for(const key of url.searchParams.keys())
    need(['sslmode','channel_binding','connect_timeout','application_name'].includes(key) && url.searchParams.getAll(key).length===1,'connection_override_forbidden');
  return value;
}
const safeCode=error=>error instanceof CheckFailure?error.code:/^[0-9A-Z]{5}$/.test(error?.code??'')?'postgres_'+error.code:'transport_or_driver_unavailable';

async function main(){
  if(process.argv.slice(2).join(' ')==='--help'){
    console.log('From the P3 worktree, using the existing restricted runtime configuration:');
    console.log('YAWRD_TEST_DATABASE_DEVELOPMENT=1 YAWRD_DEV_DATABASE_ENDPOINT='+ENDPOINT+' node --import ./scripts/load-environment.mjs scripts/check-creation-deployment-postgres.mjs --development-rollback');
    return;
  }
  let client,connected=false,begun=false,rollbackVerified=false,failure,stage='target';
  const passed=[];
  // All IDs are fresh and planned before any INSERT. No existing founder ID,
  // session, Creation, or deployment record is selected for mutation.
  const run=randomBytes(10).toString('hex'),a='p32-check-a-'+run+'.testnet',b='p32-check-b-'+run+'.testnet';
  const ids=[generatePublicId(),generatePublicId()];
  const challenges=Array.from({length:3},()=>randomBytes(32).toString('base64url'));
  const sessions=Array.from({length:3},()=>digest(randomBytes(32)));
  const identifier=generateDaoIdentifier(),otherIdentifier=generateDaoIdentifier();
  const q=(sql,values=[])=>client.query(sql,values);
  async function one(sql,values){const result=await q(sql,values);need(result.rows.length===1,'expected_one_synthetic_row');return result.rows[0];}
  async function rejected(sql,values,sqlstate,message){
    await q('SAVEPOINT p32_expected_rejection');
    let observed;
    try{await q(sql,values);}catch(error){observed=error;}
    // Also undo an unexpectedly successful negative probe before stopping.
    await q('ROLLBACK TO SAVEPOINT p32_expected_rejection');
    await q('RELEASE SAVEPOINT p32_expected_rejection');
    need(observed?.code===sqlstate && (!message||observed.message===message),'expected_rejection_not_observed');
  }
  try{
    need(process.argv.slice(2).join(' ')==='--development-rollback','use_development_rollback_flag');
    need(resolve(process.cwd())===ROOT && resolve(fileURLToPath(new URL('../',import.meta.url)))===ROOT,'worktree_mismatch');
    const url=deploymentCheckTarget();
    need(typeof WebSocket==='function','native_websocket_required');
    const {Client}=await import('@neondatabase/serverless');
    client=new Client({connectionString:url,connectionTimeoutMillis:10000,query_timeout:15000,application_name:'yawrd-p32-rollback-check'});
    client.on('error',()=>{}); // Suppress credential-bearing raw driver diagnostics.
    stage='connect';await client.connect();connected=true;
    const identity=await one('SELECT current_user AS role,session_user AS login,current_database() AS database');
    need(identity.role===ROLE && identity.login===ROLE && identity.database===DATABASE,'runtime_identity_mismatch');
    await q('BEGIN ISOLATION LEVEL READ COMMITTED');begun=true;
    await q("SET LOCAL statement_timeout='10s'");
    await q("SET LOCAL lock_timeout='3s'");
    await q("SET LOCAL idle_in_transaction_session_timeout='30s'");

    stage='synthetic_fixtures';
    const before=await one('SELECT count(*)::integer AS count FROM yawrd.creation_drafts WHERE id=ANY($1::text[])',[ids]);
    need(before.count===0,'synthetic_id_collision');
    // Three synthetic, transaction-local sessions: A, another session of A, B.
    // These are fixtures, never real wallet proofs or application session cookies.
    for(let i=0;i<3;i++){
      const account=i===2?b:a;
      await q(`INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
        VALUES($1,$2,$3,'testnet','https://p32-rollback.invalid','SYNTHETIC P3.2 rollback fixture','P3.2 rollback check',$4,
          statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp())`,
        [challenges[i],digest(randomBytes(32)),account,randomBytes(32).toString('base64')]);
      await q(`INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash,created_at,expires_at)
        VALUES($1,$2,'testnet',$3,'synthetic-key',1,'synthetic-block',statement_timestamp(),statement_timestamp()+interval '1 hour')`,
        [sessions[i],challenges[i],account]);
    }
    const creations=[];
    for(let i=0;i<2;i++){
      const intake=createEmptyYawrdIntakeDraft('p32-rollback-'+run+'-'+i,new Date().toISOString());
      const created=await one('SELECT * FROM yawrd.creation_start($1,$2,$3::jsonb)',[sessions[0],ids[i],JSON.stringify(intake)]);
      need(created.id===ids[i] && created.founder_account_id===a,'unexpected_fixture_creation');
      const config={publicName:'P3.2 synthetic rollback',publicDescription:'Synthetic persistence check; no deployment.',accountLabel:'',secondSteward:b,threshold:2};
      creations.push(await one('SELECT * FROM yawrd.creation_save($1,$2,$3,NULL,$4::jsonb)',[sessions[0],ids[i],created.revision,JSON.stringify(config)]));
    }
    const c=creations[0],read='SELECT * FROM yawrd.creation_deployment_read($1,$2)';
    const reserve='SELECT * FROM yawrd.creation_deployment_reserve($1,$2,$3,$4)';
    const prepare='SELECT * FROM yawrd.creation_deployment_prepare($1,$2,$3,$4,$5::jsonb,$6::jsonb)';
    const claim='SELECT * FROM yawrd.creation_deployment_claim($1,$2,$3,$4,$5::bigint,$6)';
    const note='SELECT * FROM yawrd.creation_deployment_note($1,$2,$3,$4,$5)';
    const p=prepareCreation({projectName:c.public_name,projectPurpose:c.public_description,projectAccountLabel:identifier,
      creatorAccountId:a,initialStewardAccountIds:[b],stewardApprovalThreshold:2,factoryAccountId:testnetFactorySettings.factoryAccountId},
      testnetFactorySettings,{accountId:a,network:'testnet'});
    const request=JSON.stringify(p),costs=JSON.stringify({setupDepositYocto:testnetFactorySettings.setupDepositYocto,createGas:testnetFactorySettings.createGas,
      observedGasPriceYocto:'100000000',attachedGasAtObservedPriceYocto:'30000000000000000000000',blockHash:'1'.repeat(32),blockHeight:'1',costConfirmation:'SYNTHETIC rollback fixture only'});

    stage='durable_reservation_and_uniqueness';
    const reserved=await one(reserve,[sessions[0],c.id,c.revision,identifier]);
    need(reserved.dao_identifier===identifier && /^[a-z0-9]{12}$/.test(identifier) && reserved.state==='reserved','reservation_mismatch');
    need(reserved.dao_account_id===identifier+'.factory.yawrd.testnet','reserved_address_mismatch');
    const resumed=await one(reserve,[sessions[1],c.id,c.revision,otherIdentifier]);
    need(resumed.dao_identifier===identifier && resumed.revision===reserved.revision,'reservation_not_durable');
    const loaded=await one(read,[sessions[1],c.id]);
    need(loaded.dao_identifier===identifier,'session_resume_mismatch');
    const collision=await q(reserve,[sessions[0],ids[1],creations[1].revision,identifier]);
    need(collision.rows.length===0,'identifier_collision_not_rejected');
    // Exercise the actual DB unique constraints, not just a function branch.
    await rejected('INSERT INTO yawrd.creation_deployments(creation_id,dao_identifier,source_revision) VALUES($1,$2,$3)',
      [ids[1],identifier,creations[1].revision],'23505');
    await rejected('INSERT INTO yawrd.creation_deployments(creation_id,dao_identifier,source_revision) VALUES($1,$2,$3)',
      [c.id,otherIdentifier,c.revision],'23505');
    need((await q(read,[sessions[0],ids[1]])).rows.length===0,'collision_created_extra_intent');
    passed.push(stage);

    stage='founder_ownership_isolation';
    await rejected(read,[sessions[2],c.id],'P0001','creation_not_found');
    await rejected(reserve,[sessions[2],c.id,c.revision,otherIdentifier],'P0001','creation_not_found');
    await rejected(prepare,[sessions[2],c.id,c.revision,reserved.revision,request,costs],'P0001','creation_not_found');
    await rejected(claim,[sessions[2],c.id,c.revision,reserved.revision,'1','creation-deployment-v1'],'P0001','creation_not_found');
    await rejected(note,[sessions[2],c.id,reserved.revision,1,null],'P0001','creation_not_found');
    passed.push(stage);

    stage='revision_cas_and_duplicate_attempt';
    await rejected(reserve,[sessions[0],c.id,Number(c.revision)-1,otherIdentifier],'P0001','creation_revision_conflict');
    const ready=await one(prepare,[sessions[0],c.id,c.revision,reserved.revision,request,costs]);
    need(ready.state==='prepared' && ready.attempt===0 && Number(ready.revision)===Number(reserved.revision)+1,'prepare_transition_mismatch');
    await rejected(prepare,[sessions[0],c.id,c.revision,reserved.revision,request,costs],'P0001','deployment_revision_conflict');
    await rejected(claim,[sessions[0],c.id,Number(c.revision)-1,ready.revision,'1','creation-deployment-v1'],'P0001','creation_revision_conflict');
    await rejected(claim,[sessions[0],c.id,c.revision,reserved.revision,'1','creation-deployment-v1'],'P0001','deployment_revision_conflict');
    const claimed=await one(claim,[sessions[0],c.id,c.revision,ready.revision,'1','creation-deployment-v1']);
    need(claimed.state==='wallet-requested' && claimed.attempt===1 && Number(claimed.revision)===Number(ready.revision)+1,'claim_increment_mismatch');
    await rejected(claim,[sessions[1],c.id,c.revision,ready.revision,'1','creation-deployment-v1'],'P0001','deployment_revision_conflict');
    await rejected(claim,[sessions[1],c.id,c.revision,claimed.revision,'1','creation-deployment-v1'],'P0001','deployment_unresolved');
    const unknown=await one(note,[sessions[1],c.id,claimed.revision,1,null]);
    need(unknown.state==='unknown' && unknown.attempt===1,'unresolved_attempt_incremented');
    await rejected(claim,[sessions[0],c.id,c.revision,unknown.revision,'1','creation-deployment-v1'],'P0001','deployment_unresolved');
    passed.push(stage);

    stage='frozen_deployment_request';
    const changed=JSON.stringify({...p,input:{...p.input,projectName:'SYNTHETIC forbidden edit'}});
    await rejected(prepare,[sessions[0],c.id,c.revision,unknown.revision,changed,costs],'P0001','deployment_unresolved');
    await rejected("UPDATE yawrd.creation_deployments SET prepared=jsonb_set(prepared,'{input,projectName}',to_jsonb('SYNTHETIC forbidden edit'::text)) WHERE creation_id=$1",
      [c.id],'P0001','deployment_identity_frozen');
    await rejected('UPDATE yawrd.creation_deployments SET source_revision=source_revision+1 WHERE creation_id=$1',[c.id],'P0001','deployment_identity_frozen');
    const frozen=await one(read,[sessions[1],c.id]);
    need(JSON.stringify(frozen.prepared)===JSON.stringify(ready.prepared) && frozen.request_digest===ready.request_digest
      && frozen.source_revision===ready.source_revision && frozen.dao_identifier===identifier && frozen.attempt===1,'frozen_request_changed');
    passed.push(stage);
  }catch(error){failure={stage,code:safeCode(error)};}
  finally{
    if(begun){try{const result=await q('ROLLBACK');need(result.command==='ROLLBACK','rollback_not_acknowledged');rollbackVerified=true;}catch(error){failure??={stage:'rollback',code:safeCode(error)};}}
    if(connected && rollbackVerified){
      try{
        const counts=await one(`SELECT
          (SELECT count(*)::integer FROM yawrd.creation_deployments WHERE creation_id=ANY($1::text[])) AS deployments,
          (SELECT count(*)::integer FROM yawrd.creation_drafts WHERE id=ANY($1::text[])) AS creations,
          (SELECT count(*)::integer FROM yawrd.sessions WHERE token_hash=ANY($2::text[])) AS sessions,
          (SELECT count(*)::integer FROM yawrd.auth_challenges WHERE id=ANY($3::text[])) AS challenges`,[ids,sessions,challenges]);
        need(Object.values(counts).every(value=>value===0),'synthetic_rows_remain');
      }catch(error){failure??={stage:'rollback_verification',code:safeCode(error)};}
    }
    if(client){try{await client.end();}catch{failure??={stage:'close',code:'connection_close_failed'};}}
  }
  if(failure){console.log(JSON.stringify({status:'FAIL',...failure,rollbackVerified,credentials:'suppressed'}));process.exitCode=1;return;}
  for(const name of passed)console.log(JSON.stringify({status:'PASS',name}));
  console.log(JSON.stringify({status:'PASS',name:'rollback_verified_no_synthetic_rows',endpoint:ENDPOINT,database:DATABASE}));
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(()=>{console.log(JSON.stringify({status:'FAIL',code:'check_unavailable',credentials:'suppressed'}));process.exitCode=1;});
}
