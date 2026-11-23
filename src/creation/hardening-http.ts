import { createHash } from 'node:crypto';
import type { Query } from '../participants/database.ts';
import { SESSION_COOKIE, sessionHash } from '../participants/auth.ts';
import { body, cookie, errorResponse, fields, json, sameOrigin } from '../participants/http.ts';
import { fail } from '../participants/repository.ts';
import { projectInput } from './validation.ts';
import { decodePublicKey } from '../identity/nep413.ts';
import { canonical, canonicalPolicy, CreationRpc, prepareCreation, type PreparedCreation, type Rpc } from '../creation-integration.ts';
import { boundedReadRpc, blockHeight } from '../platform-fee/verification.ts';
import { testnetFactorySettings } from '../testnet-factory-settings.ts';
import { HARDENING_DESCRIPTION, PROFILE_RUNTIME_HASH, hardeningKind, hardeningTransaction, hashOK, validateAttempt,
  type GovernanceProposal, type HardeningAttempt, type HardeningBinding, type HardeningView } from './hardening.ts';
const integer=(x:any):x is string=>typeof x==='string'&&/^\d+$/.test(x);
const publicKeyOK=(x:unknown):x is string=>typeof x==='string'&&/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x);
type Access={binding:HardeningBinding;p:PreparedCreation;accountId:string;identityKey:string};

// Only public deployment fields are read. This endpoint never calls the founder
// intake repository or selects intake/configuration from the private draft.
export async function authorizeCreationHardening(query:Query,hash:string,id:string):Promise<Access>{
  projectInput(id);
  const [session]=await query(`SELECT account_id,public_key FROM yawrd.sessions WHERE token_hash=$1
    AND network='testnet' AND revoked_at IS NULL AND expires_at>clock_timestamp()`,[hash]);
  fail(session,'sign_in_required',401);
  const [r]=await query(`SELECT c.id,c.revision AS creation_revision,c.founder_account_id,d.revision AS intent_revision,
      d.dao_account_id,d.factory_account_id,d.prepared,d.transaction_hash,d.evidence,d.attempt,d.evidence_attempt
    FROM yawrd.creation_deployments d JOIN yawrd.creation_drafts c ON c.id=d.creation_id
    WHERE c.id=$1 AND c.network='testnet' AND d.network='testnet' AND d.state='deployed-hardening-required'
      AND ($2=c.founder_account_id OR $2=d.prepared#>>'{input,initialStewardAccountIds,0}')`,[id,session.account_id]);
  fail(r,'creation_not_found',404);
  const p=r.prepared as PreparedCreation;
  fail(p&&r.transaction_hash=== (r.evidence as any)?.transactionHash&&r.evidence_attempt===r.attempt&&
    hashOK(r.transaction_hash)&&/^[a-f0-9]{64}$/.test((r.evidence as any)?.evidenceDigest)&&
    p.plan.daoAccountId===r.dao_account_id&&p.settings.factoryAccountId===r.factory_account_id&&
    p.input.creatorAccountId===r.founder_account_id&&p.transaction.signerId===r.founder_account_id&&
    canonical(p.settings)===canonical(testnetFactorySettings)&&
    canonical(p)===canonical(prepareCreation(p.input,p.settings,{accountId:p.input.creatorAccountId,network:'testnet'})),
    'creation_deployment_unverified',409);
  const members=p.plan.initializer.policy.roles[0].kind.Group;
  fail(members.length===2&&new Set(members).size===2&&members.includes(String(session.account_id)), 'steward_sign_in_required',403);
  return {binding:{creationId:id,creationRevision:Number(r.creation_revision),intentRevision:Number(r.intent_revision),
    daoAccountId:String(r.dao_account_id),factoryAccountId:String(r.factory_account_id),name:p.plan.initializer.config.name,
    founderAccountId:p.input.creatorAccountId,members:[...members],creationTransaction:String(r.transaction_hash)},
    p,accountId:String(session.account_id),identityKey:String(session.public_key)};
}
function availableBalance(a:any,price:bigint){
  fail(integer(a?.amount)&&integer(a?.locked)&&Number.isSafeInteger(a?.storage_usage)&&a.storage_usage>=0,'balance_unavailable',503);
  const shortfall=BigInt(a.storage_usage)*price-BigInt(a.locked);
  return BigInt(a.amount)-(shortfall>BigInt(0)?shortfall:BigInt(0));
}
function keyPermits(permission:any,dao:string,method:string){
  if(permission==='FullAccess')return true;
  const p=permission?.FunctionCall;
  return !!p&&p.receiver_id===dao&&Array.isArray(p.method_names)&&(!p.method_names.length||p.method_names.includes(method));
}
export async function readCreationHardening(access:Access,transport:Rpc,prepare=false):Promise<HardeningView>{
  const rpc=boundedReadRpc(transport),reader=new CreationRpc(rpc),b=access.binding;
  await reader.network();const block=(await rpc('block',{finality:'final'}))?.header;
  fail(block&&hashOK(block.hash)&&Number.isSafeInteger(block.height)&&integer(block.timestamp_nanosec),'governance_unavailable',503);
  const time=Number(BigInt(block.timestamp_nanosec)/BigInt(1000000));
  fail(Date.now()-time<=120000&&time<=Date.now()+5000,'governance_stale',409);
  const view=async(method_name:string,args:object={})=>{
    const r=await reader.query('call_function',{account_id:b.daoAccountId,method_name,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')},block.hash);
    fail(r.block_hash===block.hash,'governance_unavailable',503);return JSON.parse(Buffer.from(r.result).toString());
  };
  const [config,policy,factory,count]=await Promise.all(['get_config','get_policy','get_factory_info','get_last_proposal_id'].map(m=>view(m)));
  await reader.code('view_code',{account_id:b.daoAccountId},access.p.settings.expectedDaoCodeHash,block.hash);
  fail(canonical(config)===canonical(access.p.plan.initializer.config)&&canonicalPolicy(policy)===canonicalPolicy(access.p.plan.initializer.policy),
    'governance_policy_changed',409);
  fail(factory?.factory_id===b.factoryAccountId&&typeof factory.auto_update==='boolean'&&Number.isSafeInteger(count)&&count>=0&&count<=1000,
    'governance_unavailable',503);
  const matches:GovernanceProposal[]=[],conflicts:number[]=[],seen=new Set<number>();
  for(let from=0;from<count;from+=50){
    const page=await view('get_proposals',{from_index:from,limit:50});
    fail(Array.isArray(page)&&page.length===Math.min(50,count-from),'proposal_history_incomplete',503);
    for(const p of page){
      fail(Number.isSafeInteger(p?.id)&&p.id>=from&&p.id<Math.min(from+50,count)&&!seen.has(p.id),'proposal_history_incomplete',503);seen.add(p.id);
      if(canonical(p.kind)===canonical(hardeningKind(b))){
        fail(p.votes&&typeof p.votes==='object'&&!Array.isArray(p.votes)&&integer(p.submission_time)&&typeof p.proposer==='string'&&typeof p.description==='string','governance_unavailable',503);
        matches.push(p);
      }else if((p.kind?.FactoryInfoUpdate||p.kind?.UpgradeSelf)&&['InProgress','Failed','Approved'].includes(p.status))conflicts.push(p.id);
    }
  }
  const proposal=matches.length===1?matches[0]:null;
  const complete=matches.some(p=>p.status==='Approved'&&b.members.every(m=>p.votes[m]==='Approve')&&Object.keys(p.votes).every(m=>b.members.includes(m)));
  const result:HardeningView={binding:b,accountId:access.accountId,autoUpdate:factory.auto_update,verified:!factory.auto_update&&complete,
    codeHash:access.p.settings.expectedDaoCodeHash,policy,
    blockHeight:block.height,blockHash:block.hash,checkedAt:new Date(time).toISOString(),proposal,reason:'',prepared:null,
    fundingEnabled:false,publicationEnabled:false,platformFeesEnabled:false};
  if(!factory.auto_update){result.reason=result.verified?'Security setting and both approvals verified at a finalized block. Other milestones remain unavailable.':
    'Automatic updates are disabled, but the two approved Steward votes need review. No redundant proposal is offered.';return result;}
  if(conflicts.length||matches.length>1){result.reason='Conflicting or duplicate security proposals need review. No wallet action is enabled.';return result;}
  if(proposal){
    if(proposal.proposer!==b.founderAccountId||proposal.description!==HARDENING_DESCRIPTION||proposal.status!=='InProgress'||
      BigInt(block.timestamp_nanosec)>BigInt(proposal.submission_time)+BigInt(policy.proposal_period)||
      Object.entries(proposal.votes).some(([m,v])=>!b.members.includes(m)||v!=='Approve')){
      result.reason='The existing security proposal needs review. No duplicate or retry is enabled.';return result;
    }
    if(Object.hasOwn(proposal.votes,access.accountId)){result.reason='Your approval is recorded. The other Steward must approve separately.';return result;}
  }else if(access.accountId!==b.founderAccountId){result.reason='The founder must create the security proposal first.';return result;}
  if(!prepare)return result;
  fail(publicKeyOK(access.identityKey),'identity_key_unavailable',409);decodePublicKey(access.identityKey);
  const [protocol,price,signer,dao,key]=await Promise.all([
    rpc('EXPERIMENTAL_protocol_config',{block_id:block.hash}),rpc('gas_price',[block.hash] as any),
    reader.query('view_account',{account_id:access.accountId},block.hash),reader.query('view_account',{account_id:b.daoAccountId},block.hash),
    reader.query('view_access_key',{account_id:access.accountId,public_key:access.identityKey},block.hash),
  ]);
  fail(protocol?.protocol_version===88&&createHash('sha256').update(canonical(protocol.runtime_config)).digest('hex')===PROFILE_RUNTIME_HASH,'profiled_runtime_changed',409);
  fail([signer,dao,key].every(r=>r.block_hash===block.hash)&&key.permission==='FullAccess'&&integer(price?.gas_price)&&BigInt(price.gas_price)>BigInt(0),'signer_permission_unavailable',409);
  const storage=BigInt(protocol.runtime_config.storage_amount_per_byte),fee=BigInt('55000000000000')*BigInt(price.gas_price)*BigInt(2);
  fail(availableBalance(signer,storage)>=fee&&availableBalance(dao,storage)>=storage*BigInt(1024),'insufficient_security_balance',409);
  result.prepared={transaction:hardeningTransaction(b,access.accountId,proposal?.id??null),expiresAt:time+60000,
    executing:!!proposal&&Object.values(proposal.votes).filter(v=>v==='Approve').length===1,feeReserveYocto:fee.toString()};
  fail(result.prepared.expiresAt>Date.now(),'governance_stale',409);return result;
}

/** C3C receipt graph and actual-key permission checks, parameterized by the
 * verified saved DAO/Stewards rather than WordWake facts or a predicted key. */
export async function verifyCreationHardeningReceipt(binding:HardeningBinding,attempt:HardeningAttempt,transport:Rpc):Promise<NonNullable<HardeningView['receipt']>>{
  fail(validateAttempt(binding,attempt)&&hashOK(attempt.hash),'invalid_transaction');
  const rpc=boundedReadRpc(transport),reader=new CreationRpc(rpc);await reader.network();
  const expected=attempt.transaction,params=expected.actions[0].params;
  const r=await rpc('EXPERIMENTAL_tx_status',{tx_hash:attempt.hash,sender_account_id:expected.signerId,wait_until:'FINAL'});
  if(r?.final_execution_status!=='FINAL')return {state:'pending',hash:attempt.hash!,proposalId:null};
  const tx=r.transaction,call=tx?.actions?.[0]?.FunctionCall;
  fail(tx?.hash===attempt.hash&&tx.signer_id===expected.signerId&&tx.receiver_id===binding.daoAccountId&&publicKeyOK(tx.public_key)&&
    tx.actions.length===1&&call?.method_name===params.methodName&&String(call.gas)===params.gas&&String(call.deposit)===params.deposit&&
    canonical(JSON.parse(Buffer.from(call.args,'base64').toString()))===canonical(params.args),'transaction_mismatch',409);
  decodePublicKey(tx.public_key);
  const root=r.transaction_outcome,receipts=r.receipts,outcomes=r.receipts_outcome;
  fail(root?.id===attempt.hash&&root.outcome?.executor_id===expected.signerId&&Array.isArray(root.outcome.receipt_ids)&&Array.isArray(receipts)&&Array.isArray(outcomes),'receipt_evidence_unavailable',503);
  const included=await rpc('block',{block_id:root.block_hash}),head=await rpc('block',{finality:'final'});
  fail(included?.header?.hash===root.block_hash&&Number.isSafeInteger(included.header.height)&&included.header.height>attempt.preparedAtBlock&&
    hashOK(included.header.prev_hash)&&head.header.height>=included.header.height,'transaction_predates_review',409);
  const access=await reader.query('view_access_key',{account_id:expected.signerId,public_key:tx.public_key},included.header.prev_hash);
  fail(access.block_hash===included.header.prev_hash&&keyPermits(access.permission,binding.daoAccountId,params.methodName),'actual_signer_permission_unavailable',409);
  const byId=new Map<string,any>(outcomes.map((o:any)=>[o.id,o])),seen=new Set<string>(),queue=[...root.outcome.receipt_ids];
  fail(byId.size===outcomes.length&&outcomes.length<=100&&receipts.length<=100,'receipt_evidence_unavailable',503);
  while(queue.length){const id=queue.pop()!;if(seen.has(id))continue;seen.add(id);const o=byId.get(id)?.outcome;
    if(!o&&receipts.some((x:any)=>x.receipt_id===id&&x.receipt?.Data))continue;
    fail(o&&Array.isArray(o.receipt_ids),'receipt_evidence_unavailable',503);queue.push(...o.receipt_ids);}
  fail(receipts.every((x:any)=>!x.receipt?.Action||(seen.has(x.receipt_id)&&byId.has(x.receipt_id)))&&outcomes.every((o:any)=>seen.has(o.id)), 'receipt_evidence_unavailable',503);
  const final=[root,...outcomes];
  for(const outcome of final){const height=await blockHeight(rpc,outcome.block_hash);fail(BigInt(height)>=BigInt(included.header.height)&&BigInt(height)<=BigInt(head.header.height),'receipt_not_final',409);}
  if(final.some((o:any)=>o.outcome?.status&&'Failure' in o.outcome.status)||r.status?.Failure)return {state:'failed',hash:attempt.hash!,proposalId:null};
  const success=(s:any)=>s&&('SuccessValue' in s||'SuccessReceiptId' in s);
  fail(success(r.status)&&final.every((o:any)=>success(o.outcome?.status)),'receipt_evidence_unavailable',503);
  const invoked=receipts.find((x:any)=>root.outcome.receipt_ids.includes(x.receipt_id)&&x.predecessor_id===expected.signerId&&x.receiver_id===binding.daoAccountId&&
    x.receipt?.Action?.actions?.length===1&&canonical(x.receipt.Action.actions[0].FunctionCall)===canonical(call));
  fail(invoked&&byId.get(invoked.receipt_id)?.outcome.executor_id===binding.daoAccountId,'receipt_evidence_unavailable',503);
  const id=params.methodName==='add_proposal'?JSON.parse(Buffer.from(r.status.SuccessValue,'base64').toString()):params.args.id;
  fail(Number.isSafeInteger(id)&&id>=0&&id<1000,'receipt_evidence_unavailable',503);
  const response=await reader.query('call_function',{account_id:binding.daoAccountId,method_name:'get_proposal',args_base64:Buffer.from(JSON.stringify({id})).toString('base64')},head.header.hash);
  fail(response.block_hash===head.header.hash,'proposal_evidence_mismatch',409);const p=JSON.parse(Buffer.from(response.result).toString());
  fail(p.id===id&&canonical(p.kind)===canonical(hardeningKind(binding))&&p.proposer===binding.founderAccountId&&p.description===HARDENING_DESCRIPTION&&
    ['InProgress','Approved'].includes(p.status)&&p.votes&&Object.entries(p.votes).every(([s,v])=>binding.members.includes(s)&&v==='Approve')&&
    (params.methodName==='add_proposal'?p.proposer===expected.signerId:p.votes[expected.signerId]==='Approve'),'proposal_evidence_mismatch',409);
  return {state:'verified',hash:attempt.hash!,proposalId:id};
}

export async function creationHardeningRequest(request:Request,id:string,query:Query,origin:string|null,transport:Rpc){
  try{
    const post=request.method==='POST';fail(post||request.method==='GET','method_not_allowed',405);sameOrigin(request,origin,post);
    fail(!new URL(request.url).search,'invalid_request');const hash=sessionHash(cookie(request,SESSION_COOKIE));fail(hash,'sign_in_required',401);
    const access=await authorizeCreationHardening(query,hash,id);
    fail(request.headers.get('x-yawrd-account')===access.accountId,'creation_session_changed',409);
    let prepare=false,receipt:HardeningView['receipt'];
    if(post){
      const data=await body(request);fail(data.action==='prepare'||data.action==='reconcile','invalid_request');
      fields(data,data.action==='prepare'?['action','expectedCreationRevision','expectedIntentRevision']:['action','expectedCreationRevision','expectedIntentRevision','attempt']);
      fail(data.expectedCreationRevision===access.binding.creationRevision&&data.expectedIntentRevision===access.binding.intentRevision,'creation_revision_conflict',409);
      prepare=data.action==='prepare';if(!prepare)receipt=await verifyCreationHardeningReceipt(access.binding,data.attempt as HardeningAttempt,transport);
    }
    const next=await readCreationHardening(access,transport,prepare),after=await authorizeCreationHardening(query,hash,id);
    fail(canonical(after.binding)===canonical(access.binding)&&after.accountId===access.accountId&&after.identityKey===access.identityKey,'creation_revision_conflict',409);
    return json({...next,...(receipt?{receipt}:{})});
  }catch(e){return errorResponse(e);}
}
