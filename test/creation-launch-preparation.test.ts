import test from 'node:test';
import type { PublicationRepository } from '../src/creation/publication-repository.ts';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WordWakeProjectPresentation } from '../app/components/wordwake-project.tsx';
import { publicWordWake } from '../src/launch/wordwake-public.ts';
import { publicWordWakeRow } from './fixtures/wordwake-public.ts';
import { YawrdIdentityPresentation } from '../app/components/yawrd-identity-presentation.tsx';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LaunchPreparationRepository } from '../src/creation/launch-preparation-repository.ts';
import { launchPreparationRequest } from '../src/creation/launch-preparation-http.ts';
import { launchFundingPlan, publicLaunchPreview, sameLaunchSource } from '../src/creation/launch-preparation.ts';
import { proposedYawrdPreview } from '../src/creation/yawrd-preview.ts';
import { initialContributionConfiguration } from '../src/creation/contribution-configuration.ts';
import { preparationDigest, preparationText } from '../src/creation/preparation-repository.ts';
import { readLaunchFunds } from '../src/creation/launch-funds.ts';
import { preparationArtifacts, preparationView, PREPARATION_ID as id } from './fixtures/preparation.ts';
import { sessionHash, SESSION_COOKIE } from '../src/participants/auth.ts';
import type { Query } from '../src/participants/database.ts';
const token='a'.repeat(43),hash=sessionHash(token)!,origin='https://yawrd.example';
/** Offline contract model, not PostgreSQL durability or lock acceptance. */
function harness(publication?: PublicationRepository){
 const binding=preparationView('a'.repeat(64)).binding;
 const artifacts=preparationArtifacts();
 const taskSource={revision:1,digest:preparationDigest(preparationText(artifacts)),title:artifacts.blueprint.title,tasks:artifacts.tasks,references:artifacts.references};
 const configuration=initialContributionConfiguration(taskSource);
 const source={binding,governanceRevision:1,configurationSource:{contributionRevision:1,contributionDigest:preparationDigest(JSON.stringify(configuration)),preparationRevision:1,preparationDigest:taskSource.digest},publicName:artifacts.blueprint.title,publicDescription:artifacts.blueprint.summary,profileSource:{revision:1,digest:taskSource.digest,nameField:'blueprint.title' as const,descriptionField:'blueprint.summary' as const}};
 const governance={binding,title:'PRIVATE Blueprint title',contributionCurrent:true,source:source.configurationSource,saved:{revision:1,source:structuredClone(source.configurationSource)}};
 const deployment={name:'Deployed public name',description:'Deployed description',daoAccountId:binding.daoAccountId};
 let approvedOverride:{revision:number;artifacts:typeof artifacts}|null=null;
 const approvedRaw=()=>{const a=approvedOverride?.artifacts??artifacts;return {revision:approvedOverride?.revision??1,digest:preparationDigest(preparationText(a)),artifactText:preparationText(a)};};
 let session:string|null='founder.testnet',revoke=false,budget:unknown='no-money-needed';
 const calls:string[]=[];
 const query:Query=async(sql,args=[])=>{
  calls.push(sql);
  if(sql.startsWith('SELECT account_id'))return session?[{account_id:session}]:[];
  assert.match(sql,/jsonb_build_object|creation_contribution_read/);
  if(!session)throw {code:'P0001',message:'sign_in_required'};
  if(session!=='founder.testnet')throw {code:'P0001',message:'creation_not_found'};
  if(sql.startsWith('SELECT yawrd.creation_contribution_read')) {
   const raw={revision:1,digest:preparationDigest(preparationText(artifacts)),artifactText:preparationText(artifacts)};
   return [{workspace:{binding,approved:approvedRaw(),saved:{revision:1,source:raw,digest:preparationDigest(JSON.stringify(configuration)),configurationText:JSON.stringify(configuration),savedBy:binding.founderAccountId,savedAt:'2026-11-21T00:00:00Z'}}}];
  }
  const result=structuredClone({governance,source,budget,deployment,profile:approvedRaw()});if(revoke)session=null;return [{context:result}];
 };
 const repo=new LaunchPreparationRepository(query), payload=()=>({source:structuredClone(source),consent:true,payload:proposedYawrdPreview(publicLaunchPreview(source),{revision:1,source:taskSource,configuration,digest:source.configurationSource.contributionDigest,savedBy:binding.founderAccountId,savedAt:'2026-11-21T00:00:00Z'},launchFundingPlan(budget))});
 const send=(data?:object,account='founder.testnet',extra={})=>launchPreparationRequest(new Request(origin,{method:data?'POST':'GET',headers:{host:'yawrd.example',origin,cookie:SESSION_COOKIE+'='+token,'x-yawrd-account':account,'content-type':'application/json',...extra},body:data?JSON.stringify(data):undefined}),id,query,origin,undefined,publication);
 return {source,governance,configuration,artifacts,deployment,approve:(revision:number, a:typeof artifacts)=>approvedOverride={revision,artifacts:a},query,repo,payload,send,calls,session:(s:string|null)=>session=s,budget:(v:unknown)=>budget=v,revoke:()=>revoke=true};
}
test('exact public profile uses approved title/summary and excludes other planning fields',()=>{
 const h=harness();assert.deepEqual(publicLaunchPreview(h.source),{name:h.artifacts.blueprint.title,description:h.artifacts.blueprint.summary});
 assert.ok(sameLaunchSource(h.source,Object.fromEntries(Object.entries(h.source).reverse()) as typeof h.source));
 assert.doesNotMatch(JSON.stringify(publicLaunchPreview(h.source)),/PRIVATE|binding|governance/);
});
test('explicit no-money intake remains no-payout planning; other budget terms remain unresolved',async()=>{
 const h=harness();assert.equal((await h.repo.read(hash,id)).fundingPlan,'none-planned');
 for(const v of [null,'undecided','under-500','non-monetary','No funding allocated'])assert.equal(launchFundingPlan(v),'unresolved');
 h.budget('under-500');assert.equal((await h.repo.read(hash,id)).fundingPlan,'unresolved');
});
test('publication remains blocked server-side even for founder with exact consent and current source',async()=>{
 const h=harness(),response=await h.send(h.payload());assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'launch_publication_blocked'});
 assert.equal((await h.repo.read(hash,id)).publicationEnabled,false);
 assert.ok(h.calls.every(sql=>sql.startsWith('SELECT ')));assert.ok(h.calls.every(sql=>!sql.includes('creation_launch_preparations')));
});
test('explicit consent, exact source and current approvals are required before the blocked publication boundary',async()=>{
 const h=harness();assert.equal((await h.send({...h.payload(),consent:false})).status,400);
 assert.equal((await h.send({...h.payload(),source:{...h.source,publicName:'PRIVATE replacement'}})).status,409);
 assert.equal((await h.send({...h.payload(),source:{...h.source,extra:'forged'}})).status,409);
 h.governance.contributionCurrent=false;assert.equal((await h.send(h.payload())).status,409);
 assert.ok(h.calls.every(sql=>sql.startsWith('SELECT ')));
});
test('other founder, Steward, expired or switched Account never sees private readiness',async()=>{
 for(const s of ['other.testnet','steward.testnet',null]){const h=harness();h.session(s);for(const data of [undefined,h.payload()]){const response=await h.send(data,s??'founder.testnet');assert.equal(response.status,s?404:401);assert.doesNotMatch(await response.text(),/PRIVATE|Deployed/);}}
 const h=harness();assert.equal((await h.send(undefined,'other.testnet')).status,409);h.revoke();assert.equal((await h.send()).status,401);
});
test('HTTP rejects origin and extra fields; read is private no-store and has no draft persistence dependency',async()=>{
 const h=harness();assert.equal((await h.send(h.payload(),'founder.testnet',{origin:'https://other.example'})).status,403);
 assert.equal((await h.send({...h.payload(),publicationEnabled:true})).status,400);
 const response=await h.send();assert.match(response.headers.get('cache-control')!,/private, no-store/);assert.equal(response.status,200);
});
test('funding evidence is pinned to finalized Testnet account; zero differs from unknown and fees',async()=>{
 const calls:string[]=[],block={height:42,hash:'B'.repeat(43)};
 const rpc=async(method:string,params:any)=>{calls.push(method);if(method==='status')return {chain_id:'testnet'};if(method==='block')return {header:block};assert.equal(params.account_id,'seed.factory.yawrd.testnet');assert.equal(params.block_id,block.hash);return {amount:'0',locked:'0',block_height:42,block_hash:block.hash};};
 assert.deepEqual(await readLaunchFunds('seed.factory.yawrd.testnet',rpc),{status:'observed',amountYocto:'0',lockedYocto:'0',blockHeight:42,blockHash:block.hash});
 const positive=await readLaunchFunds('seed.factory.yawrd.testnet',async(m,p)=>m==='query'?{...(await rpc(m,p)),amount:'1000000000000000000000000'}:rpc(m,p));
 assert.equal(positive.status,'observed');
 assert.ok(calls.every(m=>['status','block','query'].includes(m)));

 assert.deepEqual(await readLaunchFunds('seed.factory.yawrd.testnet',async()=>{throw Error('offline')}),{status:'unknown'});
 assert.deepEqual(await readLaunchFunds('seed.factory.yawrd.testnet',async()=>({chain_id:'mainnet'})),{status:'unknown'});
 assert.deepEqual(await readLaunchFunds('seed.factory.yawrd.testnet',async(m,p)=>m==='query'?{...(await rpc(m,p)),block_hash:'C'.repeat(43)}:rpc(m,p)),{status:'unknown'});
});
test('unapplied preparation migration is explicitly superseded and direct-SQL blocker has existing evidence',()=>{
 const proposal=readFileSync(new URL('../docs/proposals/migrations/phase2_creation_launch_preparation.sql',import.meta.url),'utf8');assert.ok(proposal.startsWith('-- SUPERSEDED'));assert.ok(proposal.includes('DO NOT INSTALL'));
 const evidence=readFileSync(new URL('../scripts/verify-creation-postgres.mjs',import.meta.url),'utf8');
 for(const marker of ['direct_sql_limitation','direct_sql_mutation_not_demonstrated','direct_sql_review_not_demonstrated'])assert.ok(evidence.includes(marker));
});

test('complete preview is projected from validated saved tasks and excludes private configuration/provenance',async()=>{
 const h=harness(),view=await h.repo.read(hash,id),project=view.proposed;
 assert.equal(project.tasks.length,3);assert.deepEqual(project.progress,{accepted:null,planned:3});
 assert.deepEqual(project.tasks.map(t=>t.title),h.artifacts.tasks.map(t=>t.title));
 assert.ok(h.calls.some(sql=>sql.includes('creation_contribution_read')));
 const html=renderToStaticMarkup(createElement(YawrdIdentityPresentation,{project,creatorAccountId:h.source.binding.founderAccountId}));
 assert.match(html,/<h1>Community seed survey<\/h1>/);assert.match(html,/Document germination observations/);assert.doesNotMatch(html,/Deployed public name|Deployed description/);
 assert.match(html,/Testnet · Planned work/);assert.doesNotMatch(html,/Unpublished|Founder preview/);assert.match(html,/Not started/);
 assert.match(html,/3 planned/);assert.match(html,/Collect observations/);assert.doesNotMatch(html,/Enter the negative-day fixture|Validation output with the fixture/);
 assert.match(html,/No contributor payouts planned/);assert.match(html,/Applications and task participation remain closed/);
 assert.doesNotMatch(JSON.stringify(project),/PRIVATE|governanceRevision|preparationDigest|savedBy|participationTerms|rewardNote|unpaidAcknowledged|Qwen|references|acceptanceCriteria|evidence/);
 assert.doesNotMatch(html,/PRIVATE|governanceRevision|seed.factory|0\/0|<button|<form/);
 assert.match(html,/Project sections/);assert.match(html,/Project Identity/);assert.match(html,/No public resources have been approved/);
 assert.match(html,/0 NEAR allocated/);assert.match(html,/Reward terms undecided/);
 assert.deepEqual(project.tasks.map(t=>t.allocation),['unallocated','unallocated','unallocated']);
 assert.deepEqual(project.tasks.map(t=>t.rewardTerms),['undecided','undecided','undecided']);
 assert.equal((html.match(/class="deliverableAccordion"/g)||[]).length,3);
 assert.deepEqual(Object.keys(publicLaunchPreview(h.source)),['name','description']);
 const unsafe=renderToStaticMarkup(createElement(YawrdIdentityPresentation,{project:{...project,name:'<script>name</script>',description:'<img src=x onerror=alert(1)>'},creatorAccountId:h.source.binding.founderAccountId}));
 assert.doesNotMatch(unsafe,/<script>|onerror=alert\(1\)>/);assert.match(unsafe,/&lt;script&gt;/);
});
test('included tasks alone define the plan; excluded prerequisites and empty selection are explicit',async()=>{
 const h=harness(),view=await h.repo.read(hash,id);
 h.configuration.tasks[0].included=false;
 const saved={revision:1,source:{revision:1,digest:'a'.repeat(64),title:'PRIVATE',tasks:h.artifacts.tasks,references:h.artifacts.references},configuration:h.configuration,digest:'c'.repeat(64),savedBy:'founder.testnet',savedAt:'2026-11-21T00:00:00Z'};
 const p=proposedYawrdPreview(publicLaunchPreview(h.source),saved,'none-planned');
 assert.equal(p.tasks.length,2);assert.deepEqual(p.tasks[0].dependencies,[{title:'Excluded prerequisite',included:false}]);
 assert.doesNotMatch(JSON.stringify(p),/Collect observations|PRIVATE/);
 h.configuration.tasks.forEach(t=>t.included=false);assert.equal(proposedYawrdPreview(publicLaunchPreview(h.source),saved,'unresolved').progress.planned,0);
});
test('new accepted task content is projected without project-specific assumptions; mismatched saves fail closed',async()=>{
 const h=harness();h.artifacts.tasks[0].title='A different founder-approved task';
 h.source.configurationSource.preparationDigest=preparationDigest(preparationText(h.artifacts));
 h.governance.saved.source.preparationDigest=h.source.configurationSource.preparationDigest;
 assert.equal((await h.repo.read(hash,id)).proposed.tasks[0].title,'A different founder-approved task');
 h.configuration.tasks[0].included=false; // Configuration digest no longer matches the context snapshot.
 await assert.rejects(h.repo.read(hash,id),/launch_source_changed/);
 const corrupt=harness();corrupt.source.configurationSource.preparationDigest='f'.repeat(64);
 await assert.rejects(corrupt.repo.read(hash,id),/launch_source_changed/);
});

test('published WordWake retains its existing public shell, completion and reviewed work',async()=>{
 const project=await publicWordWake(async()=>[publicWordWakeRow()]);assert.ok(project);
 const html=renderToStaticMarkup(createElement(WordWakeProjectPresentation,{project}));
 assert.match(html,/Published on Testnet · Join applications open/);
 assert.match(html,/0 of 2 deliverables accepted/);assert.match(html,/Project identity/);
 assert.match(html,/id="deliverables"/);assert.match(html,/Project sections/);
 assert.doesNotMatch(html,/identityHero|identityLayout|Founder preview/);
});

test('allocation and compensation terms are distinct; unfunded is not unpaid and unverified ranges stay Not set',async()=>{
 const h=harness();h.configuration.tasks[1].rewardTerms='unpaid';h.configuration.tasks[1].unpaidAcknowledged=true;
 h.source.configurationSource.contributionDigest=preparationDigest(JSON.stringify(h.configuration));
 h.governance.saved.source.contributionDigest=h.source.configurationSource.contributionDigest;
 const p=(await h.repo.read(hash,id)).proposed;
 assert.equal(p.tasks[1].rewardTerms,'private-unpaid-choice');assert.equal(p.tasks[1].allocation,'unallocated');
 h.budget('under-500');const future=(await h.repo.read(hash,id)).proposed;
 assert.ok(future.tasks.every(t=>t.allocation==='not-set'));
 const html=renderToStaticMarkup(createElement(YawrdIdentityPresentation,{project:future,creatorAccountId:h.source.binding.founderAccountId}));
 assert.match(html,/Not set/);assert.doesNotMatch(html,/0 NEAR allocated|1 Testnet NEAR|2 Testnet NEAR|claimable bounty<\//);
});

test('profile fields are traced to approved summary/title; deployment identity is historical and unchanged',async()=>{
 const h=harness(),before=structuredClone(h.deployment),view=await h.repo.read(hash,id);
 assert.equal(view.source.publicName,h.artifacts.blueprint.title);assert.equal(view.source.publicDescription,h.artifacts.blueprint.summary);
 assert.notEqual(view.source.publicDescription,h.artifacts.blueprint.outcome);
 assert.deepEqual(view.source.profileSource,{revision:1,digest:preparationDigest(preparationText(h.artifacts)),nameField:'blueprint.title',descriptionField:'blueprint.summary'});
 assert.deepEqual(publicLaunchPreview(view.source),{name:view.proposed.name,description:view.proposed.description});
 assert.deepEqual(view.deployment,before);assert.deepEqual(h.deployment,before);
 assert.doesNotMatch(JSON.stringify(view),/artifactText|privateNotes|PRIVATE planning note|Qwen/);
});
test('later approved profile invalidates prior review, while tasks retain saved approved configuration binding',async()=>{
 const h=harness(),prior=await h.repo.read(hash,id),approved=structuredClone(h.artifacts);
 approved.blueprint.title='New approved project title';approved.blueprint.summary='New approved overview.';
 h.approve(2,approved);
 const next=await h.repo.read(hash,id);assert.equal(next.source.publicName,approved.blueprint.title);assert.equal(next.source.publicDescription,approved.blueprint.summary);
 assert.equal(next.source.profileSource.revision,2);assert.equal(next.current,false);
 assert.deepEqual(next.proposed.tasks,prior.proposed.tasks);assert.equal(next.source.configurationSource.preparationRevision,1);
 assert.equal(sameLaunchSource(prior.source,next.source),false);
 const response=await h.send({...h.payload(),source:prior.source});assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'launch_source_changed'});
 assert.deepEqual(next.deployment,prior.deployment);
});
test('a later approval with identical text still changes the consent binding',async()=>{
 const h=harness(),prior=await h.repo.read(hash,id);h.approve(2,structuredClone(h.artifacts));const next=await h.repo.read(hash,id);
 assert.deepEqual(publicLaunchPreview(prior.source),publicLaunchPreview(next.source));assert.equal(sameLaunchSource(prior.source,next.source),false);
});
test('blank approved summary has no deployment/intake/outcome fallback or new persistence',async()=>{
 const h=harness(),approved=structuredClone(h.artifacts);approved.blueprint.summary='';h.approve(2,approved);
 await assert.rejects(h.repo.read(hash,id),/launch_profile_required/);
 assert.ok(h.calls.every(sql=>sql.startsWith('SELECT ')));
});
test('profile is selected by the existing approved-source function rather than latest draft/intake metadata',async()=>{
 const h=harness();const view=await h.repo.read(hash,id);
 assert.equal(view.proposed.description,h.artifacts.blueprint.summary);assert.notEqual(view.proposed.name,h.governance.title);
 const sql=h.calls.find(q=>q.includes('jsonb_build_object'))!;assert.ok(sql.includes("'profile',p.v->'approved'"));
 assert.match(sql,/creation_contribution_read\(\$1,\$2\)/);
 const existing=readFileSync(new URL('../docs/proposals/migrations/phase2_creation_contribution_configuration.sql',import.meta.url),'utf8');
 assert.ok(existing.includes('JOIN yawrd.creation_preparation_approvals p USING (creation_id,revision)'));
 assert.ok(existing.includes('ORDER BY v.revision DESC LIMIT 1'));
});

test('preview creator uses the supplied verified binding account with a generic avatar, not a title-derived profile',async()=>{
 const h=harness(),v=await h.repo.read(hash,id);
 const html=renderToStaticMarkup(createElement(YawrdIdentityPresentation,{project:v.proposed,creatorAccountId:v.binding.founderAccountId}));
 assert.match(html,/Created by/);assert.match(html,/founder.testnet/);assert.match(html,/Generic creator avatar/);
 assert.doesNotMatch(html,/yawrd1.testnet|profile photo|Personal display name/);
 assert.match(html,/Steward membership and contribution-review permissions are separate/);
});


test('HTTP exposes availability only for isolated publication authority and issues consent for the exact full payload',async()=>{
 let issued=0;
 const authority={ready:async()=>true,receipt:async()=>null,issue:async(hash:string,creation:string,account:string,origin:string,review:any)=>{
  issued++;assert.equal(creation,id);assert.equal(account,'founder.testnet');assert.equal(review.proposed.name,review.source.publicName);
  return {id:'synthetic-challenge',accountId:account};
 }} as unknown as PublicationRepository;
 const h=harness(authority),read=await h.send();assert.equal((await read.json()).publicationEnabled,true);
 const response=await h.send(h.payload());assert.equal(response.status,200);assert.equal((await response.json()).challenge.id,'synthetic-challenge');assert.equal(issued,1);
 assert.equal((await h.send({...h.payload(),payload:{...h.payload().payload,name:'SUBSTITUTION'}})).status,409);assert.equal(issued,1);
 assert.equal((await h.send({...h.payload(),consent:false})).status,400);assert.equal(issued,1);
});
test('HTTP publication forwards only an exact proof request and renders success solely from the stored authority receipt',async()=>{
 let published=0;
 const receipt={creationId:id,url:'/yawrd/'+id,publishedAt:'2026-11-23T00:00:00Z'};
 const authority={ready:async()=>true,receipt:async()=>receipt,publish:async(hash:string,creation:string,account:string,origin:string,ticket:string,proof:any)=>{
  published++;assert.equal(creation,id);assert.equal(account,'founder.testnet');assert.equal(ticket,'synthetic');assert.equal(proof.accountId,account);return receipt;
 }} as unknown as PublicationRepository;
 const h=harness(authority),proof={accountId:'founder.testnet',publicKey:'synthetic',signature:'synthetic'};
 const data={action:'publish',challengeId:'synthetic',proof};
 assert.deepEqual(await (await h.send(data)).json(),{published:receipt});assert.equal(published,1);
 assert.deepEqual((await (await h.send()).json()).published,receipt);
 assert.equal((await h.send({...data,consent:true})).status,400);
 assert.equal((await h.send({...data,proof:{...proof,source:'FORGED'}})).status,400);assert.equal(published,1);
 h.session('other.testnet');assert.equal((await h.send(data,'other.testnet')).status,404);assert.equal(published,1);
});

test('release publication switch blocks new consent while preserving durable receipt recovery',async()=>{
 const receipt={creationId:id,url:'/yawrd/'+id,publishedAt:'2026-11-23T00:00:00Z'};
 const publication={ready:async()=>true,receipt:async()=>receipt,issue:async()=>assert.fail('Disabled publication cannot issue consent'),publish:async()=>assert.fail('Disabled publication cannot write')} as unknown as PublicationRepository;
 const h=harness(publication),request=(method:string,data?:object)=>new Request(origin,{method,headers:{host:'yawrd.example',origin,cookie:SESSION_COOKIE+'='+token,'x-yawrd-account':'founder.testnet','content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 const get=await launchPreparationRequest(request('GET'),id,h.query,origin,undefined,publication,false);
 assert.equal(get.status,200);const view=await get.json();assert.equal(view.publicationEnabled,false);assert.deepEqual(view.published,receipt);
 const post=request('POST',h.payload());const denied=await launchPreparationRequest(post,id,h.query,origin,undefined,publication,false);
 assert.equal(denied.status,403);assert.equal(post.bodyUsed,false);
});
