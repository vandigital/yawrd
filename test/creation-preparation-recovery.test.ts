import assert from 'node:assert/strict';
import test,{mock} from 'node:test';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createEmptyYawrdIntakeDraft,updateYawrdIntakeDraft} from '../src/yawrd-intake.ts';
import {prepareContext} from '../src/creation/preparation-context.ts';
import {PreparationGenerationService,PREMIUM_TEST_BINDING} from '../src/creation/preparation-generation.ts';
import {generatePreparation,preparationWire} from '../src/creation/preparation-provider.ts';
import {RECOVERY_CONSENT,RECOVERY_LIMITS,PREMIUM_MODEL,QWEN_MODEL,PREMIUM_CONSENT,type GenerationAttempt,type GenerationUsage} from '../src/creation/preparation-generation-contract.ts';
import {preparationRequest} from '../src/creation/preparation-http.ts';
import {preparationDigest} from '../src/creation/preparation-repository.ts';
import {SESSION_COOKIE,sessionHash} from '../src/participants/auth.ts';
import {WorkflowError} from '../src/participants/repository.ts';
import {preparationArtifacts,preparationView} from './fixtures/preparation.ts';
import type {Query} from '../src/participants/database.ts';
import type {PrivateCreation} from '../src/creation/repository.ts';
import {GenerationProgress} from '../app/create/[id]/blueprint/generation-progress.tsx';

const token='a'.repeat(43),hash=sessionHash(token)!,origin='https://yawrd.example',id=PREMIUM_TEST_BINDING.creationId;
const date='2026-11-20T00:00:00.000Z';
function fixture(){
  const binding={...preparationView('a'.repeat(64)).binding,...PREMIUM_TEST_BINDING};
  const intake={...updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft('synthetic-source',date),{projectType:'community',startingPoint:'idea',availableResources:'None yet',successCriteria:'Review three seed observations.',initialOutcomeConfirmed:true,intendedBudget:'undecided',founderDescription:'A synthetic seed library. Work is explicitly voluntary and unpaid.'},date),projectName:'Synthetic recovery'};
  const creation:PrivateCreation={id,network:'testnet',founderAccountId:binding.founderAccountId,sourceDraftId:intake.draftId,revision:7,initialIntake:structuredClone(intake),intake,configuration:{publicName:'Frozen name',publicDescription:'Frozen description',accountLabel:'seed',secondSteward:'second.testnet',threshold:2},publicTextDigest:'b'.repeat(64),publicTextReview:null,createdAt:date,updatedAt:date};
  const source=prepareContext(creation,binding,{name:'Frozen name',description:'Frozen description',verifiedAt:date});
  const artifacts=preparationArtifacts();artifacts.context.verifiedFacts=source.verifiedFacts;artifacts.privateNotes='';
  return {binding,creation,source,artifacts};
}
const usage=(output=9000):GenerationUsage=>({protocol:'responses',requestedModel:PREMIUM_MODEL,returnedModel:'gpt-6.1-sol',responseId:'offline-response',finishReason:output===16000?'length':'stop',tokens:{input:2539,output,reasoning:1445,cached:0},durationMs:166067});
/** Behavioral query double, not live SQL/locking acceptance. */
function harness(){
  const f=fixture(),workspace={...preparationView('a'.repeat(64)),binding:f.binding,versions:[] as any[]};
  const original:GenerationAttempt={id:'11111111-1111-4111-8111-111111111111',state:'failed',model:PREMIUM_MODEL,sourceDigest:preparationDigest(JSON.stringify(f.source)),reservedAt:date,dispatchedAt:date,responseAt:date,finishedAt:date,deadlineAt:date,resultRevision:null,errorCode:'generation_output_incomplete',usage:{...usage(8000),finishReason:'length'}};
  const sessions=new Map([[hash,f.binding.founderAccountId],[sessionHash('b'.repeat(43))!,'other.testnet'],[sessionHash('s'.repeat(43))!,'second.testnet']]);
  const calls:{sql:string;args:unknown[]}[]=[];let record:GenerationAttempt|null=null,installed=true,paid=true,mode='valid',count=0,block:Promise<void>|null=null;
  const eligible=()=>original.state==='failed'&&original.errorCode==='generation_output_incomplete'&&f.creation.revision===7&&!workspace.versions.length&&!record;
  const dbError=(message:string):never=>{throw {code:'P0001',message};};
  const query:Query=async(sql,args=[])=>{
    calls.push({sql,args});
    if(sql.startsWith('SELECT to_regclass'))return [{installed:sql.includes('recoveries')?installed:true}];
    const actor=sessions.get(String(args[0]));if(sql.startsWith('SELECT account_id'))return actor?[{account_id:actor}]:[];
    if(!actor)dbError('sign_in_required');if(actor!==f.binding.founderAccountId||args[1]!==id)dbError('creation_not_found');if(!paid)dbError('preparation_payment_required');
    if(sql.includes('creation_preparation_read('))return [{workspace:structuredClone(workspace)}];
    if(sql.includes('creation_preparation_attempt_read('))return [{attempt:structuredClone(original)}];
    if(sql.includes('creation_preparation_recovery_read('))return [{recovery:{eligible:eligible(),originalAttempt:structuredClone(original),attempt:structuredClone(record)}}];
    if(sql.includes('creation_preparation_recovery_source(')){if(!eligible())dbError('recovery_not_eligible');return [{source:JSON.stringify(f.source)}];}
    if(sql.includes('creation_preparation_recovery_reserve(')){
      if(record)return [{won:false}];if(!eligible()||args[3]!==original.id)dbError('recovery_not_eligible');if(args[4]!==RECOVERY_CONSENT)dbError('generation_consent_required');
      record={...structuredClone(original),id:String(args[2]),state:'reserved',finishedAt:null,dispatchedAt:null,responseAt:null,deadlineAt:new Date(Date.now()+450000).toISOString(),errorCode:null,usage:null};return [{won:true}];
    }
    if(sql.includes('creation_preparation_recovery_stage(')){
      assert.equal(record!.id,args[2]);if(['failed','unknown','saved'].includes(record!.state))return [];
      record!.state=args[3] as GenerationAttempt['state'];if(args[3]==='waiting')record!.dispatchedAt=date;if(args[3]==='checking')record!.responseAt=date;
      if(args[3]==='failed'||args[3]==='unknown')record!.finishedAt=date;record!.usage=args[4]?JSON.parse(String(args[4])):record!.usage;record!.errorCode=args[5] as string|null;return [];
    }
    if(sql.includes('creation_preparation_recovery_complete(')){
      if(mode==='storage')throw Error('offline storage failure');assert.equal(record!.state,'checking');
      workspace.versions.push({revision:1,parentRevision:null,digest:preparationDigest(String(args[3])),artifacts:JSON.parse(String(args[3])),origin:'ai-generated',authorAccountId:null,generation:{provider:'near-ai-cloud',model:'gpt-6.1-sol',promptVersion:'creation-source-aware-recovery-v1',responseId:'offline-response',sourceDigest:original.sourceDigest,recoveryOf:original.id},createdAt:date,approval:null});
      record!.state='saved';record!.resultRevision=1;record!.finishedAt=date;record!.usage=JSON.parse(String(args[4]));return [];
    }
    throw Error('Unexpected fixture SQL');
  };
  const options={env:{NODE_ENV:'development',YAWRD_ENABLE_CREATION_PREPARATION:'1',YAWRD_ENABLE_CREATION_PREMIUM_TEST:'1'},key:()=> 'offline-placeholder',provider:async(_c:any,model:any,_key:any,progress:any,_transport?:any,limits?:any)=>{
    count++;assert.equal(model,PREMIUM_MODEL);assert.deepEqual(limits,RECOVERY_LIMITS);if(block)await block;
    if(mode==='transport')throw new WorkflowError('provider_transport_failed',503);
    await progress();if(mode==='revoke')sessions.delete(hash);
    return {artifacts:mode==='incomplete'?null:f.artifacts,usage:usage(mode==='incomplete'?16000:9000),failure:mode==='incomplete'?'generation_output_incomplete':null};
  }};
  const service=new PreparationGenerationService(query,options);
  const send=(data?:object,t=token,account:string=f.binding.founderAccountId)=>preparationRequest(new Request(origin+'/api/creations/'+id+'/preparation',{method:data?'POST':'GET',headers:{host:'yawrd.example',origin,cookie:SESSION_COOKIE+'='+t,'x-yawrd-account':account,...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),id,query,origin,service);
  return {...f,workspace,original,sessions,calls,service,send,options,get count(){return count;},get record(){return record;},uninstall:()=>{installed=false;},unpay:()=>{paid=false;},mode:(v:string)=>{mode=v;},block:(p:Promise<void>)=>{block=p;}};
}
const authorize={action:'recover',consent:true,consentVersion:RECOVERY_CONSENT};

test('recovery budget is premium-only, coherent and includes complete request byte boundaries with no thinking override',async()=>{
  const f=fixture();let calls=0;const timer=mock.method(AbortSignal,'timeout',(ms:number)=>{assert.equal(ms,420000);return new AbortController().signal;});
  try{const result=await generatePreparation(f.source,PREMIUM_MODEL,'offline',async()=>{},async(_url,options)=>{
    calls++;const body=JSON.parse(String(options?.body));assert.equal(body.max_output_tokens,16000);assert.equal(body.store,false);assert.deepEqual(body.tools,[]);assert.equal('reasoning' in body,false);assert.equal('chat_template_kwargs' in body,false);assert.match(body.instructions,/once in references/);
    return Response.json({id:'offline-response',object:'response',model:'gpt-6.1-sol',status:'completed',usage:{input_tokens:2539,output_tokens:9000,total_tokens:11539,output_tokens_details:{reasoning_tokens:1445}},output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(f.artifacts)}]}]});
  },RECOVERY_LIMITS);assert.ok(result.artifacts);assert.equal(calls,1);}finally{timer.mock.restore();}
  assert.throws(()=>preparationWire(f.source,QWEN_MODEL,RECOVERY_LIMITS),/generation_limits_invalid/);
  assert.throws(()=>preparationWire(f.source,PREMIUM_MODEL,{outputTokens:16000,providerTimeoutMs:180000}),/generation_limits_invalid/);
  const c=structuredClone(f.source);c.founderReportedResources.text='';const overhead=Buffer.byteLength(preparationWire(c,PREMIUM_MODEL,RECOVERY_LIMITS).body);c.founderReportedResources.text='x'.repeat(24000-overhead);
  assert.equal(Buffer.byteLength(preparationWire(c,PREMIUM_MODEL,RECOVERY_LIMITS).body),24000);c.founderReportedResources.text+='x';assert.throws(()=>preparationWire(c,PREMIUM_MODEL,RECOVERY_LIMITS),/generation_input_too_large/);
});
test('one explicitly consented recovery preserves original failure/source/bindings and writes a reviewable AI original',async()=>{
  const h=harness(),before=structuredClone(h.original),binding=structuredClone(h.binding),source=JSON.stringify(h.source);
  const initial=await(await h.send()).json();assert.equal(initial.generation.canGenerate,false);assert.equal(initial.generation.recovery.canRecover,true);assert.equal(initial.generation.outputTokensLimit,16000);
  assert.equal((await h.send({action:'generate',consent:true,consentVersion:PREMIUM_CONSENT})).status,200);assert.equal(h.count,0);
  const response=await h.send(authorize);assert.equal(response.status,200);const view=await response.json();assert.equal(view.generation.attempt.state,'saved');assert.equal(view.versions[0].approval,null);assert.equal(view.versions[0].origin,'ai-generated');assert.equal(view.versions[0].generation.recoveryOf,h.original.id);
  assert.deepEqual(h.original,before);assert.deepEqual(h.binding,binding);assert.equal(JSON.stringify(h.source),source);assert.equal(h.count,1);
  await h.send(authorize);assert.equal(h.count,1);assert.equal((await(await h.send()).json()).generation.recovery.canRecover,false);
});
test('concurrent recovery actions reserve once and dispatch once, without changing the failed original',async()=>{
  const h=harness(),before=structuredClone(h.original);let release!:()=>void;h.block(new Promise<void>(r=>{release=r;}));
  const first=h.send(authorize),second=h.send(authorize);for(let i=0;i<20&&h.count===0;i++)await new Promise(r=>setTimeout(r,0));assert.equal(h.count,1);release();
  const results=await Promise.all([first,second]);assert.ok(results.every(r=>r.status===200));assert.equal(h.count,1);assert.deepEqual(h.original,before);
});
test('uninstalled storage, missing consent, foreign/Steward sessions, changed revision, uncertainty and missing key cannot recover',async()=>{
  for(const mode of ['storage','consent','foreign','steward','revision','unknown','key','flags','payment','extra','expired']){
    const h=harness();let data:object={...authorize},t=token,account:string=h.binding.founderAccountId;
    if(mode==='storage')h.uninstall();if(mode==='consent')data={...authorize,consentVersion:PREMIUM_CONSENT};if(mode==='revision')h.creation.revision=8;if(mode==='unknown')h.original.state='unknown';if(mode==='key')h.options.key=()=>'';if(mode==='flags')h.options.env.YAWRD_ENABLE_CREATION_PREMIUM_TEST='0';if(mode==='payment')h.unpay();if(mode==='extra')data={...authorize,model:QWEN_MODEL};if(mode==='expired')h.sessions.delete(hash);
    if(mode==='foreign'||mode==='steward'){t=(mode==='foreign'?'b':'s').repeat(43);account=mode==='foreign'?'other.testnet':'second.testnet';}
    const response=await h.send(data,t,account);assert.ok(response.status>=400,mode);assert.equal(h.count,0,mode);assert.equal(h.record,null,mode);
  }
});
test('failed, incomplete, interrupted and uncertain-storage recoveries stay consumed without autonomous repair',async()=>{
  for(const mode of ['incomplete','transport','storage']){
    const h=harness(),before=structuredClone(h.original);h.mode(mode);const response=await h.send(authorize);assert.equal(response.status,200);const v=await response.json();assert.equal(v.generation.attempt.state,mode==='incomplete'?'failed':'unknown');assert.equal(v.versions.length,0);assert.equal(v.generation.recovery.canRecover,false);
    await h.send(authorize);assert.equal(h.count,1);assert.deepEqual(h.original,before);
  }
});
test('revoked session during recovery cannot persist or expose the generated result',async()=>{
  const h=harness();h.mode('revoke');const response=await h.send(authorize);assert.equal(response.status,401);assert.equal(h.workspace.versions.length,0);assert.equal(h.count,1);assert.doesNotMatch(await response.text(),/Synthetic|PRIVATE/);
});
test('progress animations track observed active states and terminal failure/status are visible beside the control',()=>{
  const h=harness(),base={installed:true,canGenerate:false,model:PREMIUM_MODEL,consentVersion:PREMIUM_CONSENT,partnerProvider:true,attempt:h.original,inputBytesLimit:24000,outputTokensLimit:16000,providerTimeoutMs:420000,allowance:1} as const;
  for(const state of ['reserved','waiting','checking','saved','failed','unknown'] as const){
    const html=renderToStaticMarkup(createElement(GenerationProgress,{generation:{...base,attempt:{...h.original,state,deadlineAt:new Date(Date.now()+450000).toISOString()}},running:false,onGenerate:()=>{throw Error('render generated');},onCheck:()=>{},statusFeedback:{text:'Observed '+state,at:date}}));
    assert.equal(html.includes('data-active="true"'),['reserved','waiting','checking'].includes(state),state);
    if(state==='failed'){assert.match(html,/Preparation failed — no Blueprint saved/);assert.match(html,/✕<\/span> Blueprint not saved/);assert.match(html,/Check preparation status<\/button><p[^>]*role="status"/);assert.doesNotMatch(html,/checking and saving/);}
  }
  const overdue=renderToStaticMarkup(createElement(GenerationProgress,{generation:{...base,attempt:{...h.original,state:'checking',deadlineAt:'2020-01-01T00:00:00.000Z'}},running:false,onGenerate:()=>{},onCheck:()=>{},statusFeedback:{text:'Preparing — checking',at:date}}));assert.match(overdue,/observation window expired/);assert.doesNotMatch(overdue,/Preparing — checking|data-active="true"/);
  const css=readFileSync('app/create/[id]/blueprint/preparation.module.css','utf8');assert.match(css,/#c2dedd/);assert.match(css,/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
});
test('recovery proposal is additive, preserves the original row, pins source/consent and atomically saves result',()=>{
  const sql=readFileSync('docs/proposals/migrations/phase2_creation_preparation_recovery.sql','utf8');
  for(const s of ['parent_attempt_id uuid NOT NULL UNIQUE REFERENCES yawrd.creation_preparation_attempts(id)','creation_id text PRIMARY KEY','source_creation_revision=7','16000','420000',"interval '450 seconds'","o.state='failed'","o.usage->>'finishReason'='length'","o.usage#>>'{tokens,output}'='8000'",'o.source_text=NEW.source_text',"binding->>'daoAccountId'<>'xfheozm6d1tb.factory.yawrd.testnet'",'creation-partner-recovery-v1'])assert.ok(sql.includes(s),s);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g,''),/UPDATE yawrd\.creation_preparation_attempts|DELETE FROM|TRUNCATE|ALTER TABLE|CREATE OR REPLACE|UPDATE yawrd\.creation_platform_fees|SECURITY DEFINER/);
  assert.match(sql,/creation_preparation_access\(_session,_id\)[\s\S]*IF EXISTS\(SELECT 1 FROM yawrd\.creation_preparation_recoveries[\s\S]*RETURN false/);
  assert.match(sql,/INSERT INTO yawrd\.creation_preparation_versions[\s\S]*UPDATE yawrd\.creation_preparation_recoveries SET state='saved'/);
  assert.match(sql,/GRANT UPDATE\(state,usage,error_code,result_revision\)/);assert.match(sql,/REVOKE ALL ON FUNCTION/);
});
