// P3.4 only. Existing bounded runtime check conventions, one connection,
// explicitly ROLLBACK all synthetic fixtures. No migration, grants, RPC, wallet,
// owner credential, COMMIT, persistent seed or mutation of existing records.
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentCheckTarget } from './check-creation-deployment-postgres.mjs';
import { generatePublicId } from '../src/project-identity.ts';
import { generateDaoIdentifier } from '../src/creation/dao-identifier.ts';
import { createEmptyYawrdIntakeDraft } from '../src/yawrd-intake.ts';
import { prepareCreation, canonical } from '../src/creation-integration.ts';
import { testnetFactorySettings } from '../src/testnet-factory-settings.ts';
const ROOT='/home/vanrig01/yawrd-integration/private-creation-p2-postgres-20261117';
const TABLE='yawrd.creation_platform_fees',ROLE='yawrd_07b_runtime';
const digest=v=>createHash('sha256').update(v).digest('hex');
class Failure extends Error { constructor(code){super(code);this.code=code;} }
const need=(ok,code)=>{if(!ok)throw new Failure(code);};
const safe=e=>e instanceof Failure?e.code:/^[0-9A-Z]{5}$/.test(e?.code??'')?'postgres_'+e.code:'transport_or_driver_unavailable';
const normalize=s=>s.replace(/\s+/g,' ').trim();
const insertColumns=['creation_id','founder_account_id','dao_account_id','deployment_transaction','deployment_digest','deployment_final_height','request','security_review','not_before_height'];
const updateColumns=['state','attempt','claimed_at','claim_height','claim_review','consent_version','transaction_hash','evidence'];
const ids=Array.from({length:3},()=>generatePublicId());
const run=randomBytes(8).toString('hex'),a='p34-check-a-'+run+'.testnet',b='p34-check-b-'+run+'.testnet';
const sessions=Array.from({length:3},()=>digest(randomBytes(32))),challenges=Array.from({length:3},()=>randomBytes(32).toString('base64url'));
const hash=()=>randomBytes(24).toString('hex').replace(/0/g,'1').slice(0,44); // Synthetic base58-compatible text only.
const paymentHash=hash(),otherHash=hash(),receipt=hash();
let client,begun=false,connected=false,rolledBack=false,stage='target',failure,before,after;
const passed=[],emit=(name,details={})=>{passed.push(name);console.log(JSON.stringify({status:'PASS',name,...details}));};
const q=(sql,args=[])=>client.query(sql,args);
async function one(sql,args=[]){const r=await q(sql,args);need(r.rows.length===1,'expected_one_row');return r.rows[0];}
async function reject(sql,args,state,message,constraint){
  await q('SAVEPOINT p34_rejection');let observed;
  try{await q(sql,args);}catch(e){observed=e;}
  await q('ROLLBACK TO SAVEPOINT p34_rejection');await q('RELEASE SAVEPOINT p34_rejection');
  need(observed?.code===state && (!message||observed.message===message) && (!constraint||observed.constraint===constraint),'expected_rejection_not_observed');
}
async function snapshot(){return one(`SELECT
  (SELECT count(*)::int FROM yawrd.creation_platform_fees) AS fee_count,
  (SELECT md5(COALESCE(jsonb_agg(to_jsonb(f) ORDER BY creation_id)::text,'[]')) FROM yawrd.creation_platform_fees f) AS fee_digest,
  (SELECT md5(COALESCE(string_agg(id||':'||revision::text,',' ORDER BY id),'')) FROM yawrd.creation_drafts) AS creation_revisions,
  (SELECT md5(COALESCE(string_agg(creation_id||':'||revision::text,',' ORDER BY creation_id),'')) FROM yawrd.creation_deployments) AS deployment_revisions`);}
const sql={read:'SELECT * FROM yawrd.creation_fee_read($1,$2)',open:'SELECT * FROM yawrd.creation_fee_open($1,$2,$3,$4,$5::jsonb)',
  claim:'SELECT * FROM yawrd.creation_fee_claim($1,$2,$3,$4,$5,$6::jsonb,$7)',note:'SELECT * FROM yawrd.creation_fee_note($1,$2,$3,$4)',
  complete:'SELECT * FROM yawrd.creation_fee_complete($1,$2,$3,$4::jsonb)'};
const openArgs=(f,r=f.review,s=sessions[0])=>[s,f.c.id,f.c.revision,f.d.revision,JSON.stringify(r)];
const claimArgs=(f,revision,r=f.review,s=sessions[0])=>[s,f.c.id,f.c.revision,f.d.revision,revision,JSON.stringify(r),'creation-platform-fee-v1'];
const frozen=row=>canonical(Object.fromEntries(['creation_id','network','founder_account_id','dao_account_id','deployment_transaction','deployment_digest',
  'deployment_final_height','recipient','amount_yocto','policy_version','request','security_review','not_before_height','created_at'].map(k=>[k,row[k]])));
async function main(){
 try{
  need(process.argv.slice(2).join(' ')==='--development-rollback','explicit_rollback_flag_required');
  need(resolve(process.cwd())===ROOT,'worktree_mismatch');const url=deploymentCheckTarget();
  need(typeof WebSocket==='function','native_websocket_required');
  const {Client}=await import('@neondatabase/serverless');
  client=new Client({connectionString:url,connectionTimeoutMillis:10000,query_timeout:15000,application_name:'yawrd-p34-rollback-check'});
  client.on('error',()=>{});stage='connect';await client.connect();connected=true;
  const identity=await one('SELECT current_user AS role,session_user AS login,current_database() AS database');
  need(identity.role===ROLE&&identity.login===ROLE&&identity.database==='neondb','runtime_identity_mismatch');
  await q('BEGIN ISOLATION LEVEL READ COMMITTED');begun=true;
  await q("SET LOCAL statement_timeout='10s'");await q("SET LOCAL lock_timeout='3s'");await q("SET LOCAL idle_in_transaction_session_timeout='30s'");
  stage='installed_catalog';
  const source=await readFile(new URL('../docs/proposals/migrations/phase2_creation_platform_fees.sql',import.meta.url),'utf8');
  const expected=new Map([...source.matchAll(/CREATE FUNCTION yawrd\.(creation_fee_\w+)\([\s\S]*? AS \$\$([\s\S]*?)\$\$;/g)].map(m=>[m[1],normalize(m[2])]));
  need(expected.size===8,'artifact_function_inventory_mismatch');
  const functions=(await q(`SELECT p.proname,p.prosecdef,p.prosrc,p.proconfig,has_function_privilege(current_user,p.oid,'EXECUTE') AS executable,
    EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='yawrd' AND p.proname=ANY($1::text[])`,[[...expected.keys()]])).rows;
  need(functions.length===8&&functions.every(f=>!f.prosecdef&&f.executable&&!f.public_execute&&
    f.proconfig?.some(v=>v.replaceAll(' ','')==='search_path=pg_catalog,yawrd')&&normalize(f.prosrc)===expected.get(f.proname)),'installed_function_contract_mismatch');
  const triggers=(await q(`SELECT t.tgname,t.tgenabled,t.tgtype,p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid=$1::regclass AND NOT t.tgisinternal ORDER BY t.tgname`,[TABLE])).rows;
  need(triggers.length===2&&triggers[0].tgname==='guard_creation_fee'&&triggers[0].proname==='creation_fee_guard'&&triggers[0].tgtype===23&&
    triggers[1].tgname==='preserve_creation_fee'&&triggers[1].proname==='prevent_mutation'&&triggers[1].tgtype===11&&
    triggers.every(t=>['O','A'].includes(t.tgenabled)),'installed_trigger_contract_mismatch');
  const columns=(await q(`SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attgenerated,
    pg_get_expr(d.adbin,d.adrelid) AS expression,has_column_privilege(current_user,a.attrelid,a.attname,'INSERT') AS ins,
    has_column_privilege(current_user,a.attrelid,a.attname,'UPDATE') AS upd
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped`,[TABLE])).rows;
  const names=new Set(columns.map(c=>c.attname));
  const expectedColumns=[...source.split('CREATE TABLE yawrd.creation_platform_fees (')[1].split('\n);')[0].matchAll(/^  (\w+) (?:text|numeric|bigint|jsonb|smallint|integer|boolean|timestamptz)\b/gm)].map(m=>m[1]);
  need(columns.length===expectedColumns.length&&expectedColumns.every(n=>names.has(n)),'installed_column_inventory_mismatch');
  need(columns.every(c=>c.ins===insertColumns.includes(c.attname)&&c.upd===updateColumns.includes(c.attname)),'runtime_column_grants_mismatch');
  need(columns.find(c=>c.attname==='verified_transaction_hash')?.attgenerated==='s'&&
    columns.find(c=>c.attname==='receipt_id')?.attgenerated==='s','generated_evidence_columns_missing');
  const constraints=(await q(`SELECT conname,contype,convalidated,pg_get_constraintdef(oid) AS definition,
    ARRAY(SELECT attname::text FROM unnest(conkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.num ORDER BY k.pos) AS columns
    FROM pg_constraint WHERE conrelid=$1::regclass`,[TABLE])).rows;
  need(constraints.every(c=>c.convalidated)&&constraints.some(c=>c.contype==='p'&&canonical(c.columns)===canonical(['creation_id']))&&
    constraints.some(c=>c.contype==='f'&&c.definition.includes('REFERENCES yawrd.creation_deployments(creation_id)')),'installed_key_constraints_mismatch');
  const unique=column=>{const c=constraints.find(c=>c.contype==='u'&&canonical(c.columns)===canonical([column]));need(c,'unique_evidence_constraint_missing');return c.conname;};
  const txUnique=unique('verified_transaction_hash'),receiptUnique=unique('receipt_id');unique('dao_account_id');unique('deployment_transaction');
  emit(stage,{functions:8,securityInvoker:true,matchingArtifactBodies:true,triggers:2,columns:columns.length,verifiedTransactionAndReceiptUnique:true});
  stage='restricted_runtime_privileges';
  const privileges=await one(`SELECT
    has_table_privilege(current_user,$1,'SELECT') AS sel,has_table_privilege(current_user,$1,'INSERT') AS ins,
    has_table_privilege(current_user,$1,'UPDATE') AS upd,has_table_privilege(current_user,$1,'DELETE') AS del,
    has_table_privilege(current_user,$1,'TRUNCATE') AS trunc,has_table_privilege(current_user,$1,'TRIGGER') AS trig,
    has_schema_privilege(current_user,'yawrd','CREATE') AS ddl,
    (SELECT NOT(rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit) FROM pg_roles WHERE rolname=current_user) AS restricted,
    NOT EXISTS(SELECT 1 FROM pg_class c,LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=$1::regclass AND a.grantee=0) AS no_public_table_grants`,[TABLE]);
  need(privileges.sel&&!privileges.ins&&!privileges.upd&&!privileges.del&&!privileges.trunc&&!privileges.trig&&!privileges.ddl&&privileges.restricted&&privileges.no_public_table_grants,'runtime_privileges_mismatch');
  emit(stage,{role:ROLE,select:true,insertColumns:9,updateColumns:8,delete:false,truncate:false,ddl:false,publicAccess:false});
  before=await snapshot();need((await one('SELECT count(*)::int AS n FROM yawrd.creation_drafts WHERE id=ANY($1::text[])',[ids])).n===0,'synthetic_id_collision');
  stage='synthetic_fee_fixtures';
  for(let i=0;i<3;i++){
    await q(`INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
      VALUES($1,$2,$3,'testnet','https://p34-rollback.invalid','SYNTHETIC rollback fixture','P3.4 rollback check',$4,
      statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp())`,[challenges[i],digest(randomBytes(32)),i===2?b:a,randomBytes(32).toString('base64')]);
    await q(`INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash,created_at,expires_at)
      VALUES($1,$2,'testnet',$3,'synthetic-key',1,'synthetic-block',statement_timestamp(),statement_timestamp()+interval '1 hour')`,[sessions[i],challenges[i],i===2?b:a]);
  }
  const fixtures=[];
  for(let i=0;i<3;i++){
    const intake=createEmptyYawrdIntakeDraft('p34-rollback-'+run+'-'+i,new Date().toISOString());
    const started=await one('SELECT * FROM yawrd.creation_start($1,$2,$3::jsonb)',[sessions[0],ids[i],JSON.stringify(intake)]);
    const config={publicName:'P3.4 synthetic rollback',publicDescription:'Synthetic fixture only; no chain transaction.',accountLabel:'',secondSteward:b,threshold:2};
    const c=await one('SELECT * FROM yawrd.creation_save($1,$2,$3,NULL,$4::jsonb)',[sessions[0],ids[i],started.revision,JSON.stringify(config)]);
    const identifier=generateDaoIdentifier(),p=prepareCreation({projectName:c.public_name,projectPurpose:c.public_description,projectAccountLabel:identifier,
      creatorAccountId:a,initialStewardAccountIds:[b],stewardApprovalThreshold:2,factoryAccountId:testnetFactorySettings.factoryAccountId},testnetFactorySettings,{accountId:a,network:'testnet'});
    let d=await one('SELECT * FROM yawrd.creation_deployment_reserve($1,$2,$3,$4)',[sessions[0],c.id,c.revision,identifier]);
    d=await one('SELECT * FROM yawrd.creation_deployment_prepare($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[sessions[0],c.id,c.revision,d.revision,JSON.stringify(p),JSON.stringify({syntheticRollbackOnly:true})]);
    d=await one('SELECT * FROM yawrd.creation_deployment_claim($1,$2,$3,$4,$5,$6)',[sessions[0],c.id,c.revision,d.revision,1,'creation-deployment-v1']);
    const deploymentHash=hash();d=await one('SELECT * FROM yawrd.creation_deployment_note($1,$2,$3,$4,$5)',[sessions[0],c.id,d.revision,1,deploymentHash]);
    d=await one('SELECT * FROM yawrd.creation_deployment_finish($1,$2,$3,$4,$5,$6::jsonb)',[sessions[0],c.id,d.revision,1,'deployed-hardening-required',
      JSON.stringify({transactionHash:deploymentHash,evidenceDigest:digest('SYNTHETIC rollback '+c.id),transactionBlockHeight:'2',finalHeight:'3',autoUpdate:true})]);
    const review={verified:true,autoUpdate:false,proposalId:0,proposalStatus:'Approved',votes:{[a]:'Approve',[b]:'Approve'},blockHeight:10,blockHash:hash(),checkedAt:new Date().toISOString()};
    fixtures.push({c,d,review});
  }
  const [f,g,h]=fixtures;
  stage='fee_binding_security_and_durable_resume';
  await reject(sql.open,openArgs(f,{...f.review,autoUpdate:true}),'P0001','fee_security_required');
  await reject(sql.open,openArgs(f,{...f.review,votes:{[a]:'Approve'}}),'P0001','fee_security_required');
  await reject(sql.open,openArgs(f,{...f.review,checkedAt:new Date(Date.now()-180000).toISOString()}),'P0001','fee_security_required');
  let fee=await one(sql.open,openArgs(f));const original=frozen(fee);
  need(fee.creation_id===f.c.id&&fee.founder_account_id===a&&fee.dao_account_id===f.d.dao_account_id&&fee.deployment_transaction===f.d.transaction_hash&&
    fee.recipient==='yawrd.testnet'&&String(fee.amount_yocto)==='500000000000000000000000'&&fee.state==='prepared'&&fee.attempt===0,'fee_binding_mismatch');
  need(canonical(fee.request)===canonical({network:'testnet',signerId:a,receiverId:'yawrd.testnet',actions:[{type:'Transfer',params:{deposit:'500000000000000000000000'}}]}),'fee_request_mismatch');
  const resumed=await one(sql.open,openArgs(f,{...f.review,blockHeight:11},sessions[1]));
  need(frozen(resumed)===original&&resumed.revision===fee.revision,'fee_intent_not_durable');
  emit(stage,{intentPreservedAcrossSessions:true,amount:'0.5 Testnet NEAR',recipient:'yawrd.testnet'});
  stage='founder_ownership_isolation';
  for(const [query,args] of [[sql.read,[sessions[2],f.c.id]],[sql.open,openArgs(f,f.review,sessions[2])],
    [sql.claim,claimArgs(f,fee.revision,f.review,sessions[2])],[sql.note,[sessions[2],f.c.id,fee.revision,null]],
    [sql.complete,[sessions[2],f.c.id,fee.revision,'{}']]])await reject(query,args,'P0001','creation_not_found');
  emit(stage,{foreignFounderReadWriteDenied:true});
  stage='revision_cas_duplicate_claim_and_unknown_lock';
  const staleOpen=openArgs(f);staleOpen[2]=Number(f.c.revision)+1;await reject(sql.open,staleOpen,'P0001','creation_revision_conflict');
  const staleDeploy=openArgs(f);staleDeploy[3]=Number(f.d.revision)+1;await reject(sql.open,staleDeploy,'P0001','deployment_revision_conflict');
  await reject(sql.claim,claimArgs(f,Number(fee.revision)+1),'P0001','fee_revision_conflict');
  const noConsent=claimArgs(f,fee.revision);noConsent[6]='unapproved';await reject(sql.claim,noConsent,'P0001','fee_consent_required');
  const preclaimRevision=fee.revision;fee=await one(sql.claim,claimArgs(f,fee.revision));const claimSnapshot=canonical([fee.claimed_at,fee.claim_height,fee.claim_review,fee.consent_version]);
  need(fee.state==='wallet-requested'&&fee.attempt===1&&Number(fee.revision)===Number(preclaimRevision)+1,'claim_transition_mismatch');
  await reject(sql.claim,claimArgs(f,preclaimRevision,f.review,sessions[1]),'P0001','fee_revision_conflict');
  await reject(sql.claim,claimArgs(f,fee.revision,f.review,sessions[1]),'P0001','fee_unresolved');
  fee=await one(sql.note,[sessions[1],f.c.id,fee.revision,null]);need(fee.state==='unknown'&&fee.attempt===1,'unknown_transition_mismatch');
  await reject(sql.claim,claimArgs(f,fee.revision),'P0001','fee_unresolved');
  const unknownRead=await one(sql.read,[sessions[1],f.c.id]);need(unknownRead.state==='unknown'&&unknownRead.attempt===1,'unknown_not_durable');
  emit(stage,{staleCreationDeploymentFeeRevisionsDenied:true,duplicateAndUnknownClaimsDenied:true,attempt:1});
  stage='frozen_request_claim_hash_and_no_reset';
  for(const column of ['request','founder_account_id','dao_account_id','recipient','amount_yocto','policy_version','security_review','not_before_height'])
    await reject(`UPDATE yawrd.creation_platform_fees SET ${column}=${column} WHERE creation_id=$1`,[f.c.id],'42501');
  await reject("UPDATE yawrd.creation_platform_fees SET claim_height=claim_height+1 WHERE creation_id=$1",[f.c.id],'P0001','fee_identity_frozen');
  await reject("UPDATE yawrd.creation_platform_fees SET attempt=0 WHERE creation_id=$1",[f.c.id],'P0001','fee_transition_conflict');
  await reject("UPDATE yawrd.creation_platform_fees SET state='prepared' WHERE creation_id=$1",[f.c.id],'P0001','fee_transition_conflict');
  await reject('DELETE FROM yawrd.creation_platform_fees WHERE creation_id=$1',[f.c.id],'42501');
  fee=await one(sql.note,[sessions[0],f.c.id,fee.revision,paymentHash]);
  await reject(sql.note,[sessions[0],f.c.id,fee.revision,otherHash],'P0001','fee_identity_frozen');
  const again=await one(sql.note,[sessions[0],f.c.id,fee.revision,paymentHash]);need(again.revision===fee.revision,'same_hash_not_idempotent');
  need(frozen(fee)===original&&canonical([fee.claimed_at,fee.claim_height,fee.claim_review,fee.consent_version])===claimSnapshot,'immutable_fields_changed');
  emit(stage,{bindingAndRequestProtected:true,claimFrozen:true,knownHashFrozen:true,resetDeleteDenied:true});
  stage='verified_completion_idempotence_and_closed_entitlement';
  const evidence={txHash:paymentHash,blockHeight:'11',receiptId:receipt,evidenceDigest:digest('SYNTHETIC receipt fixture')};
  await reject(sql.complete,[sessions[0],f.c.id,fee.revision,JSON.stringify({...evidence,txHash:otherHash})],'P0001','fee_evidence_required');
  await reject(sql.complete,[sessions[0],f.c.id,fee.revision,JSON.stringify({...evidence,blockHeight:String(fee.claim_height)})],'P0001','fee_evidence_required');
  await reject(sql.complete,[sessions[0],f.c.id,fee.revision,JSON.stringify({...evidence,evidenceDigest:'invalid'})],'P0001','fee_evidence_required');
  fee=await one(sql.complete,[sessions[0],f.c.id,fee.revision,JSON.stringify(evidence)]);
  const paid=await one(sql.complete,[sessions[1],f.c.id,1,JSON.stringify(evidence)]);
  need(fee.state==='paid'&&fee.verified_transaction_hash===paymentHash&&fee.receipt_id===receipt&&paid.revision===fee.revision&&
    fee.generation_budget===0&&fee.consumption_enabled===false&&frozen(fee)===original,'paid_evidence_or_idempotence_mismatch');
  await reject(sql.claim,claimArgs(f,fee.revision),'P0001','fee_unresolved');
  await reject(sql.complete,[sessions[0],f.c.id,fee.revision,JSON.stringify({...evidence,receiptId:hash()})],'P0001','fee_unresolved');
  await reject("UPDATE yawrd.creation_platform_fees SET evidence=evidence WHERE creation_id=$1",[f.c.id],'P0001','fee_transition_conflict');
  emit(stage,{paidEvidenceStored:true,idempotentCompletion:true,attemptPreserved:1,generationBudget:0,consumptionEnabled:false});
  stage='verified_transaction_receipt_and_creation_uniqueness';
  const insert=`INSERT INTO yawrd.creation_platform_fees(${insertColumns.join(',')}) SELECT ${insertColumns.join(',')} FROM yawrd.creation_platform_fees WHERE creation_id=$1`;
  await reject(insert,[f.c.id],'23505');
  for(const [fixture,tx,rcpt,constraint] of [[g,paymentHash,hash(),txUnique],[h,otherHash,receipt,receiptUnique]]){
    let row=await one(sql.open,openArgs(fixture));row=await one(sql.claim,claimArgs(fixture,row.revision));
    row=await one(sql.note,[sessions[0],fixture.c.id,row.revision,tx]);
    await reject(sql.complete,[sessions[0],fixture.c.id,row.revision,JSON.stringify({...evidence,txHash:tx,receiptId:rcpt})],'23505',null,constraint);
    const unchanged=await one(sql.read,[sessions[0],fixture.c.id]);need(unchanged.state==='unknown'&&unchanged.evidence===null,'duplicate_evidence_recorded');
  }
  emit(stage,{oneRecordPerCreation:true,verifiedTransactionUnique:true,verifiedReceiptUnique:true,untrustedCandidateDoesNotReservePayment:true});
  stage='expired_or_revoked_session';
  await q('UPDATE yawrd.sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[sessions[1]]);
  await reject(sql.read,[sessions[1],f.c.id],'P0001','sign_in_required');emit(stage,{revokedSessionDenied:true});
 }catch(e){failure={stage,code:safe(e)};}
 finally{
  if(begun){try{const r=await q('ROLLBACK');need(r.command==='ROLLBACK','rollback_not_acknowledged');rolledBack=true;}catch(e){failure??={stage:'rollback',code:safe(e)};}}
  if(connected&&rolledBack&&before){try{
    after=await snapshot();need(canonical(before)===canonical(after),'persistent_records_changed');
    const counts=await one(`SELECT
      (SELECT count(*)::int FROM yawrd.creation_platform_fees WHERE creation_id=ANY($1::text[])) AS fees,
      (SELECT count(*)::int FROM yawrd.creation_deployments WHERE creation_id=ANY($1::text[])) AS deployments,
      (SELECT count(*)::int FROM yawrd.creation_drafts WHERE id=ANY($1::text[])) AS creations,
      (SELECT count(*)::int FROM yawrd.sessions WHERE token_hash=ANY($2::text[])) AS sessions,
      (SELECT count(*)::int FROM yawrd.auth_challenges WHERE id=ANY($3::text[])) AS challenges`,[ids,sessions,challenges]);
    need(Object.values(counts).every(n=>n===0),'synthetic_records_remain');
  }catch(e){failure??={stage:'rollback_preservation_check',code:safe(e)};}}
  if(client)try{await client.end();}catch{failure??={stage:'close',code:'connection_close_failed'};}
 }
 if(failure){console.log(JSON.stringify({status:'FAIL',...failure,rollbackVerified:rolledBack,credentials:'suppressed'}));process.exitCode=1;return;}
 emit('rollback_and_preservation',{rollbackAcknowledged:rolledBack,feeCountBefore:before.fee_count,feeCountAfter:after.fee_count,
   syntheticRowsRemaining:0,existingCreationDeploymentRevisionsUnchanged:true,existingFeeEvidenceUnchanged:true});
 console.log(JSON.stringify({status:'PASS',endpoint:'ep-twilight-voice-aorpfrbm',database:'neondb',checks:passed.length,
   walletActivation:false,payment:false,chainEvidence:'synthetic_transaction_local_only'}));
}
main().catch(()=>{console.log(JSON.stringify({status:'FAIL',stage:'runner',code:'check_unavailable',credentials:'suppressed'}));process.exitCode=1;});
