import { canonical } from '../creation-integration.ts';
import type { SputnikPolicy } from '../create-yawrd.ts';

// Accepted C3C operation and gas profile, bound to a saved Creation at runtime.
export const HARDENING_GAS = '50000000000000';
export const PROFILE_RUNTIME_HASH = '804f4b2890ad8b6902e8d526f4de9b4b02f8e36a9639743040b7cc27f8a34c0e';
export const HARDENING_DESCRIPTION = 'Yawrd: disable automatic factory updates before funding review';
export const hashOK = (s: unknown): s is string => typeof s === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
export type HardeningBinding = { creationId:string; creationRevision:number; intentRevision:number; daoAccountId:string;
  factoryAccountId:string; name:string; founderAccountId:string; members:string[]; creationTransaction:string };
export type HardeningTransaction = {network:'testnet';signerId:string;receiverId:string;
  actions:[{type:'FunctionCall';params:{methodName:'add_proposal'|'act_proposal';args:any;gas:string;deposit:string}}]};
export function hardeningKind(binding:Pick<HardeningBinding,'factoryAccountId'>) {
  return {FactoryInfoUpdate:{factory_info:{factory_id:binding.factoryAccountId,auto_update:false}}};
}
export function hardeningTransaction(binding:HardeningBinding,signer:string,id:number|null):HardeningTransaction {
  if(!binding.members.includes(signer)||(id!==null&&(!Number.isSafeInteger(id)||id<0||id>=1000)))throw Error('Invalid security action');
  if(id===null&&signer!==binding.founderAccountId)throw Error('Only the founder starts this security proposal');
  return {network:'testnet',signerId:signer,receiverId:binding.daoAccountId,actions:[{type:'FunctionCall',params:{
    methodName:id===null?'add_proposal':'act_proposal',args:id===null?{proposal:{description:HARDENING_DESCRIPTION,kind:hardeningKind(binding)}}:
      {id,action:'VoteApprove',proposal:hardeningKind(binding),memo:null},gas:HARDENING_GAS,deposit:'0'}}]};
}
export type GovernanceProposal={id:number;proposer:string;description:string;kind:any;status:string;submission_time:string;votes:Record<string,string>};
export type HardeningAttempt={creationId:string;daoAccountId:string;transaction:HardeningTransaction;
  phase:'pending'|'verified'|'failed';preparedAtBlock:number;createdAt:number;hash?:string;proposalId?:number};
export type HardeningView={binding:HardeningBinding;accountId:string;autoUpdate:boolean;verified:boolean;
  codeHash:string;policy:SputnikPolicy;
  blockHeight:number;blockHash:string;checkedAt:string;proposal:GovernanceProposal|null;reason:string;
  prepared:null|{transaction:HardeningTransaction;expiresAt:number;executing:boolean;feeReserveYocto:string};
  receipt?:{state:'pending'|'failed'|'verified';hash:string;proposalId:number|null};
  fundingEnabled:false;publicationEnabled:false;platformFeesEnabled:false};
export function attemptKey(creationId:string){return 'yawrd:creation:'+creationId+':hardening:v1';}
export function validateAttempt(binding:HardeningBinding,value:any):value is HardeningAttempt {
  try{
    const params=value.transaction.actions[0].params,id=params.methodName==='add_proposal'?null:params.args.id;
    return value.creationId===binding.creationId&&value.daoAccountId===binding.daoAccountId&&
      canonical(value.transaction)===canonical(hardeningTransaction(binding,value.transaction.signerId,id))&&
      ['pending','verified','failed'].includes(value.phase)&&Number.isSafeInteger(value.preparedAtBlock)&&value.preparedAtBlock>0&&
      Number.isSafeInteger(value.createdAt)&&value.createdAt>0&&(value.hash===undefined||hashOK(value.hash));
  }catch{return false;}
}
export function loadAttempts(store:Pick<Storage,'getItem'>,binding:HardeningBinding):HardeningAttempt[]{
  const raw=store.getItem(attemptKey(binding.creationId));if(raw===null)return [];
  if(raw.length>100000)throw Error('Security history needs review');const rows=JSON.parse(raw);
  if(!Array.isArray(rows)||rows.length>20||rows.some(r=>!validateAttempt(binding,r)))throw Error('Security history needs review');
  return rows;
}
export function saveAttempts(store:Pick<Storage,'setItem'>,binding:HardeningBinding,rows:HardeningAttempt[]){
  const raw=JSON.stringify(rows);loadAttempts({getItem:()=>raw},binding);store.setItem(attemptKey(binding.creationId),raw);
}
