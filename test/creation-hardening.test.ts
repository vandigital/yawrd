import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CreationRpc,prepareCreation,type Rpc} from '../src/creation-integration.ts';
import {testnetFactorySettings} from '../src/testnet-factory-settings.ts';
import {creationHardeningRequest,readCreationHardening,verifyCreationHardeningReceipt} from '../src/creation/hardening-http.ts';
import {hardeningKind,hardeningTransaction,HARDENING_DESCRIPTION,loadAttempts,saveAttempts,validateAttempt,type HardeningAttempt,type HardeningBinding} from '../src/creation/hardening.ts';
import {SESSION_COOKIE} from '../src/participants/auth.ts';
import {creationFeeRequest,creationSecurityLinksRequest} from '../src/creation/platform-fee-http.ts';
import {PLATFORM_FEE,type VerifiedTransfer} from '../src/platform-fee/policy.ts';
import {CREATION_FEE_CONSENT,creationFeeTransaction,type CreationFee,type FeeSecurityReview,type CreationFeeReview} from '../src/creation/platform-fee.ts';
import {PostgresCreationFeeStore,type CreationFeeStore} from '../src/creation/platform-fee-repository.ts';
import {submitCreationFee} from '../app/create/[id]/payment/payment-submit.ts';
import type {Query} from '../src/participants/database.ts';
import {WorkflowError} from '../src/participants/repository.ts';
const protocol=JSON.parse(await readFile('test/fixtures/creation-hardening-protocol.json','utf8'));
const key='ed25519:'+'1'.repeat(32),hash='T'.repeat(43),block='B'.repeat(43),included='C'.repeat(43),previous='D'.repeat(43);
const origin='https://yawrd.example';
function fixture(){
 const p=prepareCreation({projectName:'A new project',projectPurpose:'Explicit public description',projectAccountLabel:'a1b2c3d4e5f6',
   creatorAccountId:'founder.testnet',initialStewardAccountIds:['second.testnet'],stewardApprovalThreshold:2,factoryAccountId:testnetFactorySettings.factoryAccountId},
   testnetFactorySettings,{accountId:'founder.testnet',network:'testnet'});
 const binding:HardeningBinding={creationId:'yawrd-aaaaaaaaaaaa',creationRevision:6,intentRevision:14,daoAccountId:p.plan.daoAccountId,
   founderAccountId:p.input.creatorAccountId,members:p.plan.initializer.policy.roles[0].kind.Group,factoryAccountId:p.settings.factoryAccountId,name:p.input.projectName,creationTransaction:hash};
 const state={actor:'founder.testnet',active:true,policy:structuredClone(p.plan.initializer.policy),config:structuredClone(p.plan.initializer.config),auto:true,
   proposals:[] as any[],protocol:structuredClone(protocol),calls:[] as string[],permission:'FullAccess' as any,age:0,receipt:null as any,after:()=>{}};
 const query:Query=async(sql,args=[])=>{
   assert.doesNotMatch(sql,/\bintake\b|initial_intake|creation_read\(/);
   if(sql.includes('to_regclass'))return [{installed:false}];
   if(sql.includes('FROM yawrd.sessions'))return state.active?[{account_id:state.actor,public_key:key}]:[];
   assert.match(sql,/FROM yawrd.creation_deployments/);
   if(args[0]!==binding.creationId||!binding.members.includes(String(args[1])))return [];
   return [{id:binding.creationId,creation_revision:6,founder_account_id:binding.founderAccountId,intent_revision:14,
     dao_account_id:binding.daoAccountId,factory_account_id:binding.factoryAccountId,prepared:p,transaction_hash:hash,
     evidence:{transactionHash:hash,evidenceDigest:'a'.repeat(64)},attempt:2,evidence_attempt:2}];
 };
 const rpc:Rpc=async(method,args)=>{
   state.calls.push(method);state.after();
   if(method==='status')return {chain_id:'testnet'};
   if(method==='block')return {header:{hash:args.block_id??block,height:args.block_id===included?150:200,prev_hash:previous,
     timestamp_nanosec:String(BigInt(Date.now()-state.age)*BigInt(1000000))}};
   if(method==='EXPERIMENTAL_protocol_config')return state.protocol;
   if(method==='gas_price')return {gas_price:'100000000'};
   if(method==='EXPERIMENTAL_tx_status')return state.receipt;
   assert.equal(method,'query');
   if(args.request_type==='view_access_key')return {block_hash:args.block_id,permission:state.permission};
   if(args.request_type==='view_account')return {block_hash:args.block_id,amount:'10000000000000000000000000',locked:'0',storage_usage:200};
   const value=args.method_name==='get_config'?state.config:args.method_name==='get_policy'?state.policy:
     args.method_name==='get_factory_info'?{factory_id:binding.factoryAccountId,auto_update:state.auto}:
     args.method_name==='get_last_proposal_id'?state.proposals.length:args.method_name==='get_proposal'?state.proposals[0]:state.proposals;
   return {block_hash:args.block_id,result:[...Buffer.from(JSON.stringify(value))]};
 };
 const access=()=>({binding,p,accountId:state.actor,identityKey:key});
 const request=(data?:object,account=state.actor,cookie=true)=>new Request(origin+'/api/creations/'+binding.creationId+'/hardening',{
   method:data?'POST':'GET',headers:{host:'yawrd.example',origin,'content-type':'application/json','x-yawrd-account':account,
     ...(cookie?{cookie:SESSION_COOKIE+'='+'s'.repeat(43)}:{})},...(data?{body:JSON.stringify(data)}:{}),
 });
 const send=(data?:object,account=state.actor,cookie=true)=>creationHardeningRequest(request(data,account,cookie),binding.creationId,query,origin,rpc);
 const proposal=(votes:Record<string,string>={},status='InProgress')=>({id:0,proposer:binding.founderAccountId,description:HARDENING_DESCRIPTION,
   kind:hardeningKind(binding),status,submission_time:String(BigInt(Date.now())*BigInt(1000000)),votes});
 return {p,binding,state,query,rpc,access,send,proposal};
}
function code(t:any,f:ReturnType<typeof fixture>){t.mock.method(CreationRpc.prototype,'code',async(type:string,args:any,expected:string,id:string)=>{
 assert.equal(type,'view_code');assert.equal(args.account_id,f.binding.daoAccountId);assert.equal(expected,testnetFactorySettings.expectedDaoCodeHash);assert.equal(id,block);
});}
test('Creation hardening targets the saved DAO, exactly two saved Stewards and auto_update false',()=>{
 const f=fixture(),tx=hardeningTransaction(f.binding,f.binding.founderAccountId,null);
 assert.equal(tx.receiverId,f.p.plan.daoAccountId);assert.equal(tx.actions[0].params.gas,'50000000000000');assert.equal(tx.actions[0].params.deposit,'0');
 assert.deepEqual(tx.actions[0].params.args.proposal.kind,{FactoryInfoUpdate:{factory_info:{factory_id:f.binding.factoryAccountId,auto_update:false}}});
 const vote=hardeningTransaction(f.binding,'second.testnet',0);assert.equal(vote.actions[0].params.args.id,0);
 assert.throws(()=>hardeningTransaction(f.binding,'second.testnet',null));assert.throws(()=>hardeningTransaction(f.binding,'unrelated.testnet',0));
 assert.doesNotMatch(JSON.stringify(tx),/wordwake|keelbase|demo\.factory/);
});
test('authenticated Stewards get public governance only; missing, expired, changed and unrelated identities fail closed',async t=>{
 const f=fixture();code(t,f);
 assert.equal((await f.send(undefined,undefined,false)).status,401);
 f.state.actor='unrelated.testnet';assert.equal((await f.send()).status,404);assert.equal(f.state.calls.length,0);
 f.state.actor='second.testnet';const response=await f.send();assert.equal(response.status,200);const result=await response.json();
 assert.equal(result.accountId,'second.testnet');assert.equal(result.binding.daoAccountId,f.binding.daoAccountId);
 assert.equal(result.codeHash,testnetFactorySettings.expectedDaoCodeHash);assert.deepEqual(result.policy,f.state.policy);
 assert.equal('intake' in result,false);assert.equal('configuration' in result,false);assert.equal(result.prepared,null);
 assert.match(result.reason,/founder/);assert.equal((await f.send(undefined,'founder.testnet')).status,409);
 f.state.active=false;assert.equal((await f.send()).status,401);
});
test('founder can prepare a checked proposal; stale revisions and revocation during RPC cannot authorize it',async t=>{
 const f=fixture();code(t,f);const data={action:'prepare',expectedCreationRevision:6,expectedIntentRevision:14};
 const res=await f.send(data);assert.equal(res.status,200);const value=await res.json();
 assert.equal(value.prepared.transaction.receiverId,f.binding.daoAccountId);assert.equal(value.prepared.executing,false);
 assert.equal(value.prepared.feeReserveYocto,'11000000000000000000000');
 assert.equal(value.fundingEnabled,false);assert.equal(value.platformFeesEnabled,false);assert.equal(value.publicationEnabled,false);
 assert.equal((await f.send({...data,expectedCreationRevision:5})).status,409);
 assert.equal((await f.send({...data,confirmed:true})).status,400);
 f.state.after=()=>{f.state.active=false;};assert.equal((await f.send(data)).status,401);
});
test('existing proposal resumes both separate approvals; duplicate and conflicting proposals block new transactions',async t=>{
 const f=fixture();code(t,f);f.state.proposals=[f.proposal()];
 let r=await readCreationHardening(f.access(),f.rpc,true);assert.equal(r.prepared!.transaction.actions[0].params.methodName,'act_proposal');assert.equal(r.prepared!.executing,false);
 f.state.proposals=[f.proposal({'founder.testnet':'Approve'})];r=await readCreationHardening(f.access(),f.rpc,true);assert.equal(r.prepared,null);
 f.state.actor='second.testnet';r=await readCreationHardening(f.access(),f.rpc,true);assert.equal(r.prepared!.executing,true);
 assert.equal(r.prepared!.transaction.signerId,'second.testnet');
 f.state.proposals=[f.proposal(),{...f.proposal(),id:1}];r=await readCreationHardening(f.access(),f.rpc,true);assert.equal(r.prepared,null);
 f.state.proposals=[{...f.proposal(),kind:{UpgradeSelf:{hash:'other'}}}];r=await readCreationHardening(f.access(),f.rpc,true);assert.equal(r.prepared,null);
});
test('final hardened state requires matching code, unchanged policy and both actual approved votes; it enables no funds',async t=>{
 const f=fixture();code(t,f);f.state.auto=false;
 let r=await readCreationHardening(f.access(),f.rpc,true);assert.equal(r.verified,false);assert.equal(r.prepared,null);
 f.state.proposals=[f.proposal({'founder.testnet':'Approve','second.testnet':'Approve'},'Approved')];
 r=await readCreationHardening(f.access(),f.rpc,true);assert.equal(r.verified,true);assert.equal(r.prepared,null);
 assert.equal(r.fundingEnabled,false);assert.equal(r.platformFeesEnabled,false);assert.equal(r.publicationEnabled,false);
 f.state.policy.default_vote_policy.threshold='1';await assert.rejects(readCreationHardening(f.access(),f.rpc),/policy_changed/);
});
test('stale chain state, runtime drift and incorrect code do not prepare wallet actions',async t=>{
 const f=fixture();code(t,f);f.state.age=130000;await assert.rejects(readCreationHardening(f.access(),f.rpc,true),/stale/);
 f.state.age=0;f.state.protocol.protocol_version=89;await assert.rejects(readCreationHardening(f.access(),f.rpc,true),/runtime_changed/);
 t.mock.method(CreationRpc.prototype,'code',async()=>{throw Error('wrong code');});await assert.rejects(readCreationHardening(f.access(),f.rpc),/wrong code/);
});
function receiptFixture(){
 const f=fixture();f.state.proposals=[f.proposal()];const transaction=hardeningTransaction(f.binding,f.binding.founderAccountId,null);
 const a:HardeningAttempt={creationId:f.binding.creationId,daoAccountId:f.binding.daoAccountId,transaction,phase:'pending',preparedAtBlock:100,createdAt:Date.now(),hash};
 const params=transaction.actions[0].params,call={method_name:params.methodName,gas:params.gas,deposit:params.deposit,args:Buffer.from(JSON.stringify(params.args)).toString('base64')};
 f.state.receipt={final_execution_status:'FINAL',transaction:{hash,signer_id:transaction.signerId,receiver_id:transaction.receiverId,public_key:key,actions:[{FunctionCall:call}]},status:{SuccessValue:'MA=='},
 transaction_outcome:{id:hash,block_hash:included,outcome:{executor_id:transaction.signerId,receipt_ids:['R'.repeat(43)],status:{SuccessReceiptId:'R'.repeat(43)}}},
 receipts:[{receipt_id:'R'.repeat(43),predecessor_id:transaction.signerId,receiver_id:transaction.receiverId,receipt:{Action:{actions:[{FunctionCall:call}]}}}],
 receipts_outcome:[{id:'R'.repeat(43),block_hash:included,outcome:{executor_id:transaction.receiverId,receipt_ids:[],status:{SuccessValue:'MA=='}}}]};return {...f,a};
}
test('exact finalized receipt graph and actual historical signing permission verify the created proposal ID',async()=>{
 const f=receiptFixture(),r=await verifyCreationHardeningReceipt(f.binding,f.a,f.rpc);assert.equal(r.state,'verified');assert.equal(r.proposalId,0);
 f.state.receipt.final_execution_status='EXECUTED';assert.equal((await verifyCreationHardeningReceipt(f.binding,f.a,f.rpc)).state,'pending');
});
test('wallet callbacks, wrong recipients/actions, incomplete graphs and pre-review transactions cannot verify',async()=>{
 for(const mutate of [(f:any)=>f.state.receipt={success:true},(f:any)=>f.state.receipt.transaction.receiver_id='other.testnet',
   (f:any)=>f.state.receipt.transaction.actions[0].FunctionCall.gas='1',(f:any)=>f.state.receipt.receipts_outcome=[],
   (f:any)=>f.a.preparedAtBlock=200,(f:any)=>f.state.permission={FunctionCall:{receiver_id:'other.testnet',method_names:[]}}]){
   const f=receiptFixture();mutate(f);
   const r=await verifyCreationHardeningReceipt(f.binding,f.a,f.rpc).catch(()=>null);assert.notEqual(r?.state,'verified');
 }
});
test('pending history is Creation/DAO-bound, survives reload and cannot be silently overwritten by malformed content',()=>{
 const f=receiptFixture(),data=new Map<string,string>(),store={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 saveAttempts(store,f.binding,[f.a]);assert.deepEqual(loadAttempts(store,f.binding),[f.a]);
 assert.equal(loadAttempts(store,{...f.binding,creationId:'yawrd-bbbbbbbbbbbb'}).length,0);
 assert.equal(validateAttempt({...f.binding,daoAccountId:'other.testnet'},f.a),false);
 assert.throws(()=>saveAttempts(store,f.binding,[{...f.a,transaction:{...f.a.transaction,receiverId:'other.testnet'}}]));
 assert.deepEqual(loadAttempts(store,f.binding),[f.a]);
});

test('refresh after proposal creation preserves a zero-ID approval action and follows both Steward votes to verification',async t=>{
 const f=fixture();code(t,f);f.state.proposals=[f.proposal()];
 const data={action:'prepare',expectedCreationRevision:6,expectedIntentRevision:14};
 let response=await f.send();let view=await response.json();assert.equal(view.proposal.id,0);assert.deepEqual(view.proposal.votes,{});assert.equal(view.prepared,null);
 response=await f.send(data);view=await response.json();assert.equal(response.status,200);
 assert.equal(view.prepared.transaction.actions[0].params.methodName,'act_proposal');
 assert.deepEqual(view.prepared.transaction.actions[0].params.args,{id:0,action:'VoteApprove',proposal:hardeningKind(f.binding),memo:null});
 assert.equal(view.prepared.executing,false);
 f.state.proposals[0].votes={'founder.testnet':'Approve'};
 view=await (await f.send()).json();assert.equal(view.prepared,null);assert.match(view.reason,/other Steward/);
 assert.equal((await (await f.send(data)).json()).prepared,null,'refresh never offers the founder a duplicate approval');
 f.state.actor='second.testnet';view=await (await f.send(data)).json();
 assert.equal(view.prepared.transaction.signerId,'second.testnet');assert.equal(view.prepared.executing,true);assert.equal(view.prepared.transaction.actions[0].params.args.id,0);
 f.state.proposals[0].votes['second.testnet']='Approve';f.state.proposals[0].status='Approved';
 view=await (await f.send()).json();assert.equal(view.verified,false,'proposal approval alone does not prove the setting executed');
 f.state.auto=false;view=await (await f.send()).json();assert.equal(view.verified,true);assert.equal(view.prepared,null);
 assert.equal(view.fundingEnabled,false);assert.equal(view.publicationEnabled,false);assert.equal(view.platformFeesEnabled,false);
});

// P3.4 reuses the saved deployment authorization and finalized security reader.
// These cases exercise the new read-only review; payment proofs remain covered
// by platform-fee.test.ts, not by fabricated browser payment success.

function feeRequest(f:ReturnType<typeof fixture>,options:{method?:string;account?:string;cookie?:boolean;origin?:string}={}){
 return new Request(origin+'/api/creations/'+f.binding.creationId+'/platform-fee',{
  method:options.method??'GET',headers:{host:'yawrd.example',origin:options.origin??origin,
   'x-yawrd-account':options.account??f.state.actor,'sec-fetch-site':options.origin?'cross-site':'same-origin',
   ...(options.cookie===false?{}:{cookie:SESSION_COOKIE+'='+'s'.repeat(43)})},
 });
}
test('Creation fee review binds the frozen deployment, founder and exact separate transfer after hardening',async t=>{
 const f=fixture();code(t,f);f.state.auto=false;
 f.state.proposals=[f.proposal({'founder.testnet':'Approve','second.testnet':'Approve'},'Approved')];
 const result=await creationFeeRequest(feeRequest(f),f.binding.creationId,f.query,origin,f.rpc);
 assert.equal(result.status,200);assert.match(result.headers.get('cache-control')!,/no-store/);
 const value=await result.json();assert.deepEqual(value.binding,f.binding);assert.equal(value.securityVerified,true);
 assert.equal(value.amountYocto,PLATFORM_FEE.amountYocto);assert.equal(value.recipient,'yawrd.testnet');
 assert.deepEqual(value.transaction,{network:'testnet',signerId:'founder.testnet',receiverId:'yawrd.testnet',
  actions:[{type:'Transfer',params:{deposit:'500000000000000000000000'}}]});
 assert.equal(value.status,'storage-required');assert.equal(value.walletEnabled,false);
 assert.equal(value.fundingEnabled,false);assert.equal(value.publicationEnabled,false);assert.equal(value.blueprintEnabled,false);
 assert.equal('intake' in value,false);assert.equal('payment' in value,false);assert.equal('prepared' in value,false);
});
test('unhardened or unapproved Creation cannot prepare a platform transfer',async t=>{
 const f=fixture();code(t,f);
 for(const auto of [true,false]){
  f.state.auto=auto;
  const result=await creationFeeRequest(feeRequest(f),f.binding.creationId,f.query,origin,f.rpc);
  assert.equal(result.status,200);const value=await result.json();assert.equal(value.status,'security-required');
  assert.equal(value.transaction,null);assert.equal(value.walletEnabled,false);
 }
});
test('fee review denies missing, expired, foreign, second-Steward and mismatched sessions before RPC',async()=>{
 const f=fixture();
 const send=(o:Parameters<typeof feeRequest>[1]={})=>creationFeeRequest(feeRequest(f,o),f.binding.creationId,f.query,origin,f.rpc);
 assert.equal((await send({cookie:false})).status,401);
 f.state.active=false;assert.equal((await send()).status,401);f.state.active=true;
 f.state.actor='unrelated.testnet';assert.equal((await send()).status,404);
 f.state.actor='second.testnet';assert.equal((await send()).status,403);
 f.state.actor='founder.testnet';assert.equal((await send({account:'second.testnet'})).status,409);
 assert.equal(f.state.calls.length,0);
});
test('fee review rechecks session and revision after finalized RPC, rejects stale chain and never accepts a payment mutation',async t=>{
 const f=fixture();code(t,f);
 const send=(o:Parameters<typeof feeRequest>[1]={})=>creationFeeRequest(feeRequest(f,o),f.binding.creationId,f.query,origin,f.rpc);
 assert.equal((await send({method:'PUT'})).status,405);
 assert.equal((await send({origin:'https://other.example'})).status,403);
 f.state.age=130000;assert.equal((await send()).status,409);f.state.age=0;
 f.state.after=()=>{f.state.active=false;};assert.equal((await send()).status,401);
 f.state.active=true;f.state.after=()=>{};let reads=0;
 const changed:Query=async(sql,args)=>{const rows=await f.query(sql,args);
  if(sql.includes('FROM yawrd.creation_deployments')&&++reads===2)rows[0].creation_revision=7;return rows;};
 assert.equal((await creationFeeRequest(feeRequest(f),f.binding.creationId,changed,origin,f.rpc)).status,409);
});
test('Steward navigation returns only public security links for the verified session, never private draft access',async()=>{
 let active=true,actor='second.testnet';const actors:string[]=[];
 const query:Query=async(sql,args=[])=>{
  assert.doesNotMatch(sql,/\bintake\b|initial_intake|creation_read\(/);
  if(sql.includes('FROM yawrd.sessions'))return active?[{account_id:actor}]:[];
  assert.match(sql,/d\.state='deployed-hardening-required'/);
  assert.match(sql,/s\.expires_at>clock_timestamp\(\)/);
  assert.match(sql,/d\.prepared#>>'\{input,initialStewardAccountIds,0\}'/);
  actors.push(String(args[1]));
  return actor==='second.testnet'?[{id:'yawrd-aaaaaaaaaaaa',name:'Public project name',dao_account_id:'a1b2c3d4e5f6.factory.yawrd.testnet'}]:[];
 };
 const request=(account=actor)=>new Request(origin+'/api/creations/security',{headers:{host:'yawrd.example',origin,
  'x-yawrd-account':account,cookie:SESSION_COOKIE+'='+'s'.repeat(43)}});
 let response=await creationSecurityLinksRequest(request(),query,origin);assert.equal(response.status,200);
 assert.deepEqual((await response.json()).items,[{id:'yawrd-aaaaaaaaaaaa',name:'Public project name',daoAccountId:'a1b2c3d4e5f6.factory.yawrd.testnet'}]);
 assert.equal((await creationSecurityLinksRequest(request('founder.testnet'),query,origin)).status,409);
 actor='unrelated.testnet';response=await creationSecurityLinksRequest(request(),query,origin);assert.deepEqual((await response.json()).items,[]);
 active=false;assert.equal((await creationSecurityLinksRequest(request(),query,origin)).status,401);
 assert.deepEqual(actors,['second.testnet','unrelated.testnet']);
});

// Reference model of the proposed PostgreSQL functions, not live SQL proof.
// Each CAS decision happens synchronously before returning its promise.
class FeeModel implements CreationFeeStore {
 value:CreationFee|null=null; installed=true; claims=0; writes=0; loseClaim=false;loseComplete=false;
 readonly f:ReturnType<typeof fixture>;
 constructor(f:ReturnType<typeof fixture>){this.f=f;}
 auth(){assert.equal(this.f.state.active,true);assert.equal(this.f.state.actor,this.f.binding.founderAccountId);}
 async available(){return this.installed;}
 async read(){this.auth();return structuredClone(this.value);}
 async open(_s:string,b:HardeningBinding,r:FeeSecurityReview){
  this.auth();if(this.value)return structuredClone(this.value);
  this.value={creationId:b.creationId,revision:1,state:'prepared',attempt:0,network:'testnet',founderAccountId:b.founderAccountId,
   daoAccountId:b.daoAccountId,deploymentTransaction:b.creationTransaction,deploymentDigest:'a'.repeat(64),deploymentFinalHeight:'90',
   recipient:PLATFORM_FEE.recipient,amountYocto:PLATFORM_FEE.amountYocto,policyVersion:PLATFORM_FEE.version,
   transaction:creationFeeTransaction(b.founderAccountId),securityReview:structuredClone(r),notBeforeHeight:String(r.blockHeight),
   claimHeight:null,claimReview:null,claimedAt:null,transactionHash:null,evidence:null};this.writes++;return structuredClone(this.value);
 }
 cas(revision:number){this.auth();assert.ok(this.value);if(this.value.revision!==revision)throw new WorkflowError('fee_revision_conflict',409);return this.value;}
 async claim(_s:string,_b:HardeningBinding,revision:number,r:FeeSecurityReview){
  const v=this.cas(revision);if(v.state!=='prepared'||v.attempt!==0)throw new WorkflowError('fee_unresolved',409);
  Object.assign(v,{revision:v.revision+1,state:'wallet-requested',attempt:1,claimReview:structuredClone(r),claimHeight:String(r.blockHeight),claimedAt:new Date().toISOString()});
  this.claims++;this.writes++;if(this.loseClaim)throw Error('synthetic lost claim response');return structuredClone(v);
 }
 async note(_s:string,_id:string,revision:number,tx:string|null){
  const v=this.cas(revision);if(!['wallet-requested','unknown'].includes(v.state))throw new WorkflowError('fee_unresolved',409);
  if(v.transactionHash&&tx&&v.transactionHash!==tx)throw new WorkflowError('fee_identity_frozen',409);
  if(v.state==='unknown'&&(!tx||tx===v.transactionHash))return structuredClone(v);
  Object.assign(v,{revision:v.revision+1,state:'unknown',transactionHash:v.transactionHash??tx});this.writes++;return structuredClone(v);
 }
 async complete(_s:string,_id:string,revision:number,e:VerifiedTransfer){
  this.auth();const v=this.value!;
  if(v.state==='paid'&&JSON.stringify(v.evidence)===JSON.stringify(e))return structuredClone(v);
  this.cas(revision);assert.equal(e.txHash,v.transactionHash);assert.ok(BigInt(e.blockHeight)>BigInt(v.claimHeight!));
  Object.assign(v,{revision:v.revision+1,state:'paid',evidence:structuredClone(e)});this.writes++;
  if(this.loseComplete){this.loseComplete=false;throw Error('synthetic lost completion response');}return structuredClone(v);
 }
}
function durable(t:any){
 const f=fixture();code(t,f);f.state.auto=false;f.state.proposals=[f.proposal({'founder.testnet':'Approve','second.testnet':'Approve'},'Approved')];
 const store=new FeeModel(f);let authorized=true;
 const send=(data?:object,rpc=f.rpc)=>creationFeeRequest(new Request(origin+'/api/creations/'+f.binding.creationId+'/platform-fee',{
  method:data?'POST':'GET',headers:{host:'yawrd.example',origin,'x-yawrd-account':f.state.actor,'content-type':'application/json',cookie:SESSION_COOKIE+'='+'s'.repeat(43)},
  ...(data?{body:JSON.stringify(data)}:{})}),f.binding.creationId,f.query,origin,rpc,{authorized,store});
 const prepare=()=>send({action:'prepare',expectedCreationRevision:6,expectedDeploymentRevision:14});
 const begin=(revision=store.value?.revision)=>send({action:'begin',expectedCreationRevision:6,expectedDeploymentRevision:14,
  feeRevision:revision,consent:true,consentVersion:CREATION_FEE_CONSENT});
 return {f,store,send,prepare,begin,gate:(x:boolean)=>{authorized=x;}};
}
function feeReceipt(f:ReturnType<typeof fixture>,tx='U'.repeat(43)){
 return {final_execution_status:'FINAL',status:{SuccessValue:''},
  transaction:{hash:tx,signer_id:f.binding.founderAccountId,receiver_id:PLATFORM_FEE.recipient,actions:[{Transfer:{deposit:PLATFORM_FEE.amountYocto}}]},
  transaction_outcome:{id:tx,block_hash:included,outcome:{executor_id:f.binding.founderAccountId,receipt_ids:['R'.repeat(43)],status:{SuccessReceiptId:'R'.repeat(43)}}},
  receipts:[{receipt_id:'R'.repeat(43),predecessor_id:f.binding.founderAccountId,receiver_id:PLATFORM_FEE.recipient,
   receipt:{Action:{signer_id:f.binding.founderAccountId,actions:[{Transfer:{deposit:PLATFORM_FEE.amountYocto}}]}}}],
  receipts_outcome:[{id:'R'.repeat(43),block_hash:included,outcome:{executor_id:PLATFORM_FEE.recipient,receipt_ids:[],status:{SuccessValue:''}}}]};
}
test('durable fee prepare freezes one intent and exact request, with current signer permission and cost review',async t=>{
 const d=durable(t);let response=await d.prepare();assert.equal(response.status,200);const a=await response.json();
 assert.equal(a.fee.state,'prepared');assert.equal(a.fee.attempt,0);assert.equal(a.walletEnabled,true);
 assert.deepEqual(a.review.transaction,creationFeeTransaction('founder.testnet'));assert.ok(BigInt(a.review.feeEstimateYocto)>BigInt(0));
 assert.equal(BigInt(a.review.feeReserveYocto),BigInt(a.review.feeEstimateYocto)*BigInt(2));
 const original=structuredClone(d.store.value);await d.prepare();assert.deepEqual(d.store.value,original);assert.equal(d.store.writes,1);
 d.f.state.permission={FunctionCall:{receiver_id:'yawrd.testnet',method_names:[]}};
 assert.equal((await d.begin()).status,409);assert.equal(d.store.claims,0);
});
test('durable fee is gated before mutation and rejects stale revision, missing consent and changed Creation binding',async t=>{
 const d=durable(t);d.gate(false);assert.equal((await d.prepare()).status,403);assert.equal(d.store.writes,0);
 d.gate(true);await d.prepare();assert.equal((await d.begin(999)).status,409);
 assert.equal((await d.send({action:'begin',expectedCreationRevision:6,expectedDeploymentRevision:14,feeRevision:1,consent:false,consentVersion:CREATION_FEE_CONSENT})).status,400);
 d.store.value!.daoAccountId='another.factory.yawrd.testnet';assert.equal((await d.send()).status,409);assert.equal(d.store.claims,0);
});
test('durable fee CAS permits exactly one cross-session claim; new sessions cannot repeat unknown requests',async t=>{
 const d=durable(t);await d.prepare();const results=await Promise.all([d.begin(1),d.begin(1)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(d.store.claims,1);assert.equal(d.store.value!.attempt,1);
 const revision=d.store.value!.revision;
 assert.equal((await d.send({action:'report',feeRevision:revision,transactionHash:null})).status,200);
 assert.equal(d.store.value!.state,'unknown');const resumed=await (await d.send()).json();assert.equal(resumed.walletEnabled,false);
 assert.equal((await d.prepare()).status,409);assert.equal((await d.begin()).status,409);assert.equal(d.store.claims,1);
});
test('durable fee saves a hash before RPC and keeps unknown/invalid results locked with an immutable hash',async t=>{
 const d=durable(t);await d.prepare();await d.begin();
 const tx='U'.repeat(43),before=d.store.value!.transaction;
 const failing:Rpc=async()=>{assert.equal(d.store.value!.transactionHash,tx);throw Error('synthetic offline RPC');};
 let response=await d.send({action:'reconcile',feeRevision:d.store.value!.revision,transactionHash:tx},failing);
 assert.equal(response.status,200);let v=await response.json();assert.equal(v.status,'unknown');assert.equal(v.verification.state,'unknown');assert.equal(v.walletEnabled,false);
 response=await d.send({action:'reconcile',feeRevision:d.store.value!.revision,transactionHash:'V'.repeat(43)});
 assert.equal(response.status,409);assert.deepEqual(d.store.value!.transaction,before);
 d.f.state.receipt=feeReceipt(d.f);d.f.state.receipt.transaction.receiver_id='wrong.testnet';
 response=await d.send({action:'reconcile',feeRevision:d.store.value!.revision,transactionHash:tx});
 v=await response.json();assert.equal(v.verification.state,'invalid');assert.equal(v.fee.state,'unknown');assert.equal(d.store.value!.evidence,null);
});
test('durable fee finalized evidence records paid once, survives lost commit response and resumes without RPC or signing',async t=>{
 const d=durable(t);await d.prepare();await d.begin();const tx='U'.repeat(43);
 d.f.state.receipt=feeReceipt(d.f);const normal=d.f.rpc;
 // Payment must postdate the claim block 200; receipt is finalized at 250.
 const rpc:Rpc=async(method,args)=>method==='block'?{header:{hash:args.block_id??block,height:args.block_id?250:300}}:normal(method,args);
 d.store.loseComplete=true;
 let r=await d.send({action:'reconcile',feeRevision:d.store.value!.revision,transactionHash:tx},rpc);
 assert.equal(r.status,503);assert.equal(d.store.value!.state,'paid');const writes=d.store.writes;
 r=await d.send({action:'reconcile',feeRevision:1,transactionHash:tx},async()=>{throw Error('RPC not needed');});
 assert.equal(r.status,200);const v=await r.json();assert.equal(v.status,'paid');assert.equal(v.fee.evidence.txHash,tx);
 assert.equal(v.walletEnabled,false);assert.equal(v.fundingEnabled,false);assert.equal(v.publicationEnabled,false);assert.equal(v.blueprintEnabled,false);
 assert.equal(d.store.writes,writes);assert.equal((await d.begin()).status,409);assert.equal(d.store.claims,1);
});
test('durable fee reconciliation still works when current governance cannot be read',async t=>{
 const d=durable(t);await d.prepare();await d.begin();const tx='U'.repeat(43);d.f.state.receipt=feeReceipt(d.f);
 const rpc:Rpc=async(method,args)=>{
  if(method==='query')throw Error('current governance unavailable');
  if(method==='block')return {header:{hash:args.block_id??block,height:args.block_id?250:300}};
  return d.f.rpc(method,args);
 };
 assert.equal((await d.send({action:'reconcile',feeRevision:d.store.value!.revision,transactionHash:tx},rpc)).status,200);
 const v=await (await d.send(undefined,rpc)).json();assert.equal(v.status,'paid');assert.equal(v.walletEnabled,false);
});
test('durable fee adapter uses only parameterized invoker functions and safe availability reads',async()=>{
 const calls:{sql:string;args:unknown[]}[]=[];
 const store=new PostgresCreationFeeStore(async(sql,args=[])=>{calls.push({sql,args});return [{installed:false}];});
 assert.equal(await store.available(),false);assert.match(calls[0].sql,/to_regprocedure/);
 const f=fixture();
 const bad=new PostgresCreationFeeStore(async(sql,args=[])=>{calls.push({sql,args});throw new WorkflowError('fee_revision_conflict',409);});
 await assert.rejects(bad.note('a'.repeat(64),f.binding.creationId,9,null),/fee_revision_conflict/);
 assert.equal(calls[1].sql,'SELECT * FROM yawrd.creation_fee_note($1,$2,$3,$4)');assert.deepEqual(calls[1].args,['a'.repeat(64),f.binding.creationId,9,null]);
 const schema=await readFile('docs/proposals/migrations/phase2_creation_platform_fees.sql','utf8');
 assert.match(schema,/creation_id text PRIMARY KEY REFERENCES yawrd\.creation_deployments/);
 assert.match(schema,/verified_transaction_hash text GENERATED ALWAYS[\s\S]*?STORED UNIQUE/);assert.match(schema,/receipt_id text GENERATED ALWAYS[\s\S]*?STORED UNIQUE/);
 assert.match(schema,/::integer/);assert.doesNotMatch(schema,/SECURITY DEFINER|ALTER TABLE|DELETE FROM|DROP TABLE|UPDATE yawrd\.creation_deployments|UPDATE yawrd\.creation_drafts/);
});
test('durable fee submission never signs a lost or duplicate claim and reports wallet uncertainty without retry',async t=>{
 const d=durable(t),reviewed=await (await d.prepare()).json() as CreationFeeReview;let signatures=0;
 const request=async(data:object)=>{const r=await d.send(data);if(!r.ok)throw Error('request '+r.status);return r.json();};
 d.store.loseClaim=true;
 await assert.rejects(submitCreationFee({reviewed,request,getWallet:()=>({accountId:'founder.testnet',network:'testnet'}),sign:async()=>{signatures++;}}));
 assert.equal(signatures,0);assert.equal(d.store.claims,1);assert.equal(d.store.value!.state,'wallet-requested');
 d.store.loseClaim=false;
 await assert.rejects(submitCreationFee({reviewed,request,getWallet:()=>({accountId:'founder.testnet',network:'testnet'}),sign:async()=>{signatures++;}}));
 assert.equal(signatures,0);assert.equal(d.store.claims,1);
});
test('durable fee submission invokes only the exact reviewed Transfer after claim, then preserves a rejected wallet attempt',async t=>{
 const d=durable(t),reviewed=await (await d.prepare()).json() as CreationFeeReview;let signatures=0;
 const request=async(data:object)=>{const r=await d.send(data);if(!r.ok)throw Error('request '+r.status);return r.json();};
 await assert.rejects(submitCreationFee({reviewed,request,getWallet:()=>({accountId:'founder.testnet',network:'testnet'}),sign:async tx=>{
  signatures++;assert.equal(d.store.value!.state,'wallet-requested');assert.deepEqual(tx,reviewed.fee!.transaction);throw Error('synthetic rejection');}}),/synthetic rejection/);
 assert.equal(signatures,1);assert.equal(d.store.value!.state,'unknown');assert.equal((await d.send()).status,200);assert.equal(d.store.claims,1);
});

test('durable fee writes deny second Stewards, foreign founders and client-supplied payment evidence',async t=>{
 const d=durable(t);await d.prepare();const original=structuredClone(d.store.value);
 d.f.state.actor='second.testnet';assert.equal((await d.begin()).status,403);
 d.f.state.actor='unrelated.testnet';assert.equal((await d.begin()).status,404);
 d.f.state.actor='founder.testnet';
 assert.equal((await d.send({action:'begin',expectedCreationRevision:6,expectedDeploymentRevision:14,feeRevision:1,
  consent:true,consentVersion:CREATION_FEE_CONSENT,evidence:{paid:true}})).status,400);
 assert.deepEqual(d.store.value,original);assert.equal(d.store.claims,0);
});
test('durable fee rejects pre-claim transfers and nonfinal callbacks without recording a payment',async t=>{
 const d=durable(t);await d.prepare();await d.begin();const tx='U'.repeat(43);d.f.state.receipt=feeReceipt(d.f);
 let r=await d.send({action:'reconcile',feeRevision:d.store.value!.revision,transactionHash:tx});
 assert.equal(r.status,200);assert.equal((await r.json()).verification.reason,'payment_predates_intent');
 assert.equal(d.store.value!.state,'unknown');assert.equal(d.store.value!.evidence,null);
 d.f.state.receipt.final_execution_status='INCLUDED_FINAL';
 r=await d.send({action:'reconcile',feeRevision:d.store.value!.revision,transactionHash:tx});
 assert.equal((await r.json()).verification.state,'pending');assert.equal(d.store.value!.state,'unknown');assert.equal(d.store.claims,1);
});

test('durable fee rejects expired reviews and changed wallet context before any signing claim',async t=>{
 const d=durable(t),reviewed=await (await d.prepare()).json() as CreationFeeReview;
 const request=async()=>{throw Error('No request is permitted');};const sign=async()=>{throw Error('No signing is permitted');};
 await assert.rejects(submitCreationFee({reviewed,request,sign,getWallet:()=>({accountId:'founder.testnet',network:'testnet'}),now:()=>reviewed.review!.expiresAt+1}),/review/);
 await assert.rejects(submitCreationFee({reviewed,request,sign,getWallet:()=>({accountId:'other.testnet',network:'testnet'})}),/changed/);
 assert.equal(d.store.claims,0);
});
test('durable fee uniqueness violations return a controlled conflict without raw database detail',async()=>{
 const q:Query=async()=>{throw Object.assign(Error('synthetic private database details'),{code:'23505'});};
 const store=new PostgresCreationFeeStore(q);
 await assert.rejects(store.complete('a'.repeat(64),'yawrd-aaaaaaaaaaaa',3,{txHash:'U'.repeat(43),blockHeight:'250',receiptId:'R'.repeat(43),evidenceDigest:'d'.repeat(64)}),
  (error:any)=>error.code==='fee_transaction_already_claimed'&&error.status===409&&!error.message.includes('private database'));
});
