import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PREPARATION_CONSENT, preparationIssues, preparationSkill, validatePreparation } from '../src/creation/preparation-contract.ts';
import { PreparationRepository, preparationDigest, preparationText } from '../src/creation/preparation-repository.ts';
import { preparationRequest } from '../src/creation/preparation-http.ts';
import { PreparationReview } from '../app/create/[id]/blueprint/preparation-content.tsx';
import { SESSION_COOKIE, sessionHash } from '../src/participants/auth.ts';
import { WorkflowError } from '../src/participants/repository.ts';
import type { Query } from '../src/participants/database.ts';
import { PREPARATION_ID as id, preparationArtifacts, preparationView } from './fixtures/preparation.ts';

const origin='https://yawrd.example',token='a'.repeat(43),hash=sessionHash(token)!;
function harness(){
  const sessions=new Map([[hash,'founder.testnet'],[sessionHash('b'.repeat(43))!,'other.testnet'],[sessionHash('s'.repeat(43))!,'steward.testnet']]);
  const stored=preparationView(preparationDigest(preparationText(preparationArtifacts()))),calls:string[]=[];
  let paid=true,deployed=true,revokeAfterRead=false;
  const query:Query=async(sql,values=[])=>{
    calls.push(sql);const actor=sessions.get(String(values[0]));
    if(sql.startsWith('SELECT account_id'))return actor?[{account_id:actor}]:[];
    if(!actor)throw {code:'P0001',message:'sign_in_required'};
    if(actor!==stored.binding.founderAccountId||values[1]!==id)throw {code:'P0001',message:'creation_not_found'};
    if(!deployed)throw {code:'P0001',message:'creation_deployment_unverified'};
    if(!paid)throw {code:'P0001',message:'preparation_payment_required'};
    const head=stored.versions.at(-1);
    if(sql.includes('creation_preparation_save')){
      if(!head)throw {code:'P0001',message:'preparation_version_required'};
      const [, , expected,digest,text]=values;
      const parent=stored.versions.find(v=>v.revision===expected);
      const repeated=head.origin==='founder-edited'&&head.parentRevision===expected&&parent?.digest===digest&&preparationText(head.artifacts)===text;
      if(!repeated){
        if(head.revision!==expected||head.digest!==digest)throw {code:'P0001',message:'preparation_revision_conflict'};
        if(preparationText(head.artifacts)!==text)stored.versions.push({revision:head.revision+1,parentRevision:head.revision,digest:preparationDigest(String(text)),artifacts:JSON.parse(String(text)),origin:'founder-edited',generation:null,authorAccountId:actor,createdAt:'2026-11-19T01:00:00.000Z',approval:null});
      }
    }else if(sql.includes('creation_preparation_approve')){
      if(!head||head.revision!==values[2]||head.digest!==values[3])throw {code:'P0001',message:'preparation_revision_conflict'};
      head.approval??={digest:head.digest,approvedBy:actor,approvedAt:'2026-11-19T02:00:00.000Z',consentVersion:PREPARATION_CONSENT};
    }else assert.match(sql,/creation_preparation_read/);
    const result=structuredClone(stored);
    if(revokeAfterRead){sessions.delete(hash);revokeAfterRead=false;}
    return [{workspace:result}];
  };
  const repo=new PreparationRepository(query);
  const send=(data?:object,identityToken:string|null=token,account='founder.testnet',extra:Record<string,string>={},search='')=>preparationRequest(new Request(origin+'/api/creations/'+id+'/preparation'+search,{method:data?'POST':'GET',headers:{host:'yawrd.example',origin,...(identityToken?{cookie:SESSION_COOKIE+'='+identityToken}:{}),'x-yawrd-account':account,...(data?{'content-type':'application/json'}:{}),...extra},body:data?JSON.stringify(data):undefined}),id,query,origin);
  return {repo,stored,calls,sessions,query,send,unpay:()=>{paid=false;},undeploy:()=>{deployed=false;},revokeDuringRead:()=>{revokeAfterRead=true;}};
}
const save=(h:ReturnType<typeof harness>,artifacts=preparationArtifacts())=>h.send({action:'save',expectedRevision:1,expectedDigest:h.stored.versions[0]?.digest??preparationDigest(preparationText(preparationArtifacts())),artifacts});

test('founder API save and fresh repository/session resume preserve artifacts, immutable source and paid bindings',async()=>{
  const h=harness(),original=structuredClone(h.stored),edited=preparationArtifacts();edited.blueprint.summary='Founder editorial correction';
  const result=await save(h,edited);assert.equal(result.status,200);const view=await result.json();
  assert.deepEqual(view.binding,original.binding);assert.equal(view.generationEnabled,false);assert.deepEqual(view.versions[0],original.versions[0]);
  assert.equal(view.versions[1].origin,'founder-edited');assert.equal(view.versions[1].generation,null);assert.equal(view.versions[1].parentRevision,1);assert.equal(view.versions[1].authorAccountId,'founder.testnet');
  h.sessions.set(sessionHash('c'.repeat(43))!,'founder.testnet');
  assert.deepEqual(await new PreparationRepository(h.query).read(sessionHash('c'.repeat(43))!,id),view);
  assert.equal((await save(h,edited)).status,200);assert.equal(h.stored.versions.length,2,'identical lost-response retry is idempotent');
});
test('another founder, second Steward, anonymous, expired and revoked sessions cannot read, save or approve',async()=>{
  const h=harness();
  for(const [t,a,status] of [[null,'founder.testnet',401],['x'.repeat(43),'founder.testnet',401],['b'.repeat(43),'other.testnet',404],['s'.repeat(43),'steward.testnet',404]] as const){
    for(const data of [undefined,{action:'save',expectedRevision:1,expectedDigest:h.stored.versions[0].digest,artifacts:preparationArtifacts()},{action:'approve',expectedRevision:1,expectedDigest:h.stored.versions[0].digest,consent:true,consentVersion:PREPARATION_CONSENT}]){
      const response=await h.send(data,t,a);assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/Community seed|PRIVATE|generation/);
    }
  }
  h.sessions.delete(hash);assert.equal((await h.send()).status,401);
  assert.equal(h.stored.versions.length,1);
});
test('session loss during a read never discloses private content',async()=>{
  const h=harness();h.revokeDuringRead();const response=await h.send();assert.equal(response.status,401);assert.doesNotMatch(await response.text(),/PRIVATE|Community seed/);
});
test('missing paid/deployment evidence blocks preparation without chain checks or inference',async()=>{
  for(const unbind of ['unpay','undeploy'] as const){const h=harness();h[unbind]();assert.equal((await h.send()).status,409);assert.equal((await save(h)).status,409);}
});
test('concurrent/stale saves and approvals cannot overwrite a newer version',async()=>{
  const h=harness(),base=h.stored.versions[0],first=preparationArtifacts(),second=preparationArtifacts();first.blueprint.summary='One';second.blueprint.summary='Two';
  const results=await Promise.allSettled([h.repo.save(hash,id,1,base.digest,first),h.repo.save(hash,id,1,base.digest,second)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(h.stored.versions.length,2);assert.equal(h.stored.versions[1].artifacts.blueprint.summary,'One');
  await assert.rejects(h.repo.approve(hash,id,1,base.digest,true,PREPARATION_CONSENT),/preparation_revision_conflict/);
  await assert.rejects(h.repo.save(hash,id,2,'0'.repeat(64),second),/preparation_revision_conflict/);
});
test('approval binds exact version/digest; derivative has no inherited approval or model attribution',async()=>{
  const h=harness(),root=h.stored.versions[0];
  await assert.rejects(h.repo.approve(hash,id,1,root.digest,false,PREPARATION_CONSENT),/preparation_consent_required/);
  const approved=await h.repo.approve(hash,id,1,root.digest,true,PREPARATION_CONSENT);assert.equal(approved.versions[0].approval?.digest,root.digest);
  assert.deepEqual(await h.repo.approve(hash,id,1,root.digest,true,PREPARATION_CONSENT),approved);
  const edited=preparationArtifacts();edited.skill.instructions.push('Preserve evidence in the report.');
  const saved=await h.repo.save(hash,id,1,root.digest,edited);assert.equal(saved.versions[1].approval,null);assert.equal(saved.versions[1].generation,null);assert.ok(saved.versions[0].approval);
  const final=await h.repo.approve(hash,id,2,saved.versions[1].digest,true,PREPARATION_CONSENT);assert.equal(final.versions[1].approval?.approvedBy,'founder.testnet');
});
test('a save racing between approval precheck and SQL approval is rejected',async()=>{
  const h=harness(),root=h.stored.versions[0],edited=preparationArtifacts();edited.blueprint.summary='A newer version';
  const racing:Query=async(sql,args)=>{
    if(sql.includes('creation_preparation_approve'))await h.repo.save(hash,id,1,root.digest,edited);
    return h.query(sql,args);
  };
  await assert.rejects(new PreparationRepository(racing).approve(hash,id,1,root.digest,true,PREPARATION_CONSENT),/preparation_revision_conflict/);
  assert.ok(h.stored.versions.every(v=>v.approval===null));
});
test('incomplete drafts save without AI calls; approval fails until checks are complete',async()=>{
  const h=harness(),draft=preparationArtifacts();draft.blueprint.title='';draft.tasks=[];draft.skill.instructions=[];
  const saved=await h.repo.save(hash,id,1,h.stored.versions[0].digest,draft);assert.ok(preparationIssues(saved.versions[1].artifacts).length);
  await assert.rejects(h.repo.approve(hash,id,2,saved.versions[1].digest,true,PREPARATION_CONSENT),/preparation_incomplete/);
  h.stored.versions=[];assert.equal((await h.send()).status,200);assert.equal((await save(h)).status,409);
});
test('graph and embedded reference checks permit real dependencies and different task counts',()=>{
  const a=preparationArtifacts();assert.deepEqual(preparationIssues(a),[]);
  const single=preparationArtifacts();single.tasks=single.tasks.slice(0,1);assert.deepEqual(preparationIssues(single),[]);
  a.tasks[0].dependencies=['report'];assert.ok(preparationIssues(a).some(v=>/circular/.test(v)));
  const missing=preparationArtifacts();missing.references=[];assert.ok(preparationIssues(missing).some(v=>/referenced/.test(v)));
  const blank=preparationArtifacts();blank.references[0].content='';assert.ok(preparationIssues(blank).length);
});
test('reviewed Skill embeds required context, interfaces, fixtures and evidence; excludes private planning/provenance',()=>{
  const a=preparationArtifacts(),rendered=preparationSkill(a,true);
  for(const value of [a.blueprint.summary,a.blueprint.outcome,...a.blueprint.boundaries,...a.skill.instructions,...a.references.map(r=>r.content),a.tasks[0].acceptanceCriteria[0].evidence,a.context.proposedDefaults[0].rationale,a.context.founderDecisions[0],a.context.activationDetails[0]])assert.ok(rendered.includes(value),value);
  assert.match(rendered,/Explicitly unpaid/);assert.match(rendered,/Undecided — no payment entitlement/);assert.match(rendered,/Voluntary contribution; no monetary reward/);
  assert.doesNotMatch(rendered,/PRIVATE|Qwen|responseId|original intake|chat history|WordWake|ww-v1/);
  assert.doesNotMatch(preparationSkill(a),/Founder reviewed this exact/);
  const edited=structuredClone(a);edited.tasks[0].brief+=' Keep voluntary terms unchanged.';assert.match(preparationSkill(validatePreparation(edited)),/Voluntary contribution; no monetary reward/);
});
test('strict validation rejects unknown fields, malformed text, payload overflow and forged approval/model metadata',async()=>{
  for(const mutate of [(a:any)=>{a.approved=true;},(a:any)=>{a.model='forged';},(a:any)=>{a.blueprint.title='\0';},(a:any)=>{a.skill.purpose='\ud800';},(a:any)=>{a.tasks[0].rewardTerms='paid';},(a:any)=>{a.tasks[1].id=a.tasks[0].id;},(a:any)=>{a.references[0].content='x'.repeat(12001);}]){const a=preparationArtifacts();mutate(a);assert.throws(()=>validatePreparation(a),/invalid_preparation/);}
  const a=preparationArtifacts();a.blueprint.scope=Array(40).fill('界'.repeat(4000));assert.throws(()=>validatePreparation(a));
  const h=harness();h.stored.versions[0].digest='0'.repeat(64);await assert.rejects(h.repo.read(hash,id),/preparation_integrity_error/);
  const badSource=harness();badSource.stored.versions[0].generation!.provider='forged' as 'near-ai-cloud';await assert.rejects(badSource.repo.read(hash,id),/preparation_integrity_error/);
});
test('HTTP exact-field, origin, identity, size, method and error protections remain enforced',async()=>{
  const h=harness(),base=h.stored.versions[0];
  for(const data of [{action:'generate'}, {action:'save',expectedRevision:1,expectedDigest:base.digest,artifacts:preparationArtifacts(),founder:'other'}, {action:'approve',expectedRevision:1,expectedDigest:base.digest,consent:true,consentVersion:PREPARATION_CONSENT,approvedAt:'forged'}])assert.equal((await h.send(data)).status,400);
  assert.equal((await h.send(undefined,token,'other.testnet')).status,409);
  assert.equal((await h.send(undefined,token,'founder.testnet',{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await h.send(undefined,token,'founder.testnet',{},'?founder=other')).status,400);
  assert.equal((await h.send({action:'save'},token,'founder.testnet',{origin:'https://other.example'})).status,403);
  assert.equal((await h.send({action:'save',value:'x'.repeat(270000)})).status,413);
  const response=await h.send();assert.match(response.headers.get('cache-control')!,/private, no-store/);assert.equal(response.headers.get('vary'),'Cookie');
  const unavailable:Query=async()=>{throw Error('PRIVATE raw database error');};
  const req=new Request(origin+'/api/creations/'+id+'/preparation',{headers:{host:'yawrd.example',cookie:SESSION_COOKIE+'='+token,'x-yawrd-account':'founder.testnet'}});
  assert.deepEqual(await (await preparationRequest(req,id,unavailable,origin)).json(),{error:'service_unavailable'});
  const noSchema:Query=async()=>{throw {code:'42883'};};await assert.rejects(new PreparationRepository(noSchema).read(hash,id),/preparation_storage_required/);
  const unsupported=new Request(origin+'/api/creations/'+id+'/preparation',{method:'DELETE',headers:{host:'yawrd.example',origin}});
  assert.equal((await preparationRequest(unsupported,id,h.query,origin)).status,405);
  assert.ok(h.calls.filter(sql=>sql.startsWith('SELECT account_id')).every(sql=>sql.includes('revoked_at IS NULL')&&sql.includes('expires_at>clock_timestamp()')));
});
test('concise review is readable and raw metadata belongs to Advanced; initial empty state offers no manual authoring',()=>{
  const markup=renderToStaticMarkup(createElement(PreparationReview,{content:preparationArtifacts()}));
  assert.match(markup,/Project overview and Blueprint/);assert.match(markup,/AI Contributor Skill/);assert.match(markup,/Depends on: Collect observations/);
  assert.doesNotMatch(markup,/responseId|sourceDigest|Qwen|yawrd-aaaaaaaaaaaa/);
  const panel=readFileSync(new URL('../app/create/[id]/blueprint/preparation-panel.tsx',import.meta.url),'utf8');
  assert.match(panel,/<summary>Advanced/);assert.match(panel,/ACCOUNT_SESSION_CHANGED/);assert.match(panel,/e!==epoch.current/);assert.doesNotMatch(panel,/localStorage|Create.*blank|Start.*manual/);
});
test('SQL proposal is additive, immutable, founder/paid bound, digest checked and timestamp restricted',()=>{
  const sql=readFileSync(new URL('../docs/proposals/migrations/phase2_creation_preparation.sql',import.meta.url),'utf8');
  assert.doesNotMatch(sql,/ALTER TABLE|DROP |UPDATE yawrd\.|DELETE FROM|SECURITY DEFINER/i);
  for(const value of ['creation_fee_lock(_session,_id,NULL,NULL)','f.state=\'paid\'','head.content_digest<>_digest','head.parent_revision=_expected','parent.content_digest=_digest','prevent_mutation()','REFERENCES yawrd.creation_preparation_versions(creation_id,revision)','generation IS NULL','ON CONFLICT DO NOTHING'])assert.ok(sql.includes(value),value);
  assert.doesNotMatch(sql,/GRANT INSERT\([^)]*(created_at|approved_at)/);
});
