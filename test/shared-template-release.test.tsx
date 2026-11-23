import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicWordWake } from '../src/launch/wordwake-public.ts';
import { publicWordWakeRow } from './fixtures/wordwake-public.ts';
import { PersistedYawrdContent } from '../app/components/persisted-yawrd.tsx';
import { GenesisProjectPresentation } from '../app/components/genesis-project.tsx';
import { GENESIS_YAW_001 } from '../src/genesis/yaw-001.ts';

const production='7e68e0ae5b60811cbb38723d00f67fc93a5c5835',exec=promisify(execFile);
test('Genesis retains Production content and links while adopting the accepted compact shared shell',async()=>{
  const {stdout:source}=await exec('git',['show',`${production}:app/components/genesis-project.tsx`]);
  const virtual=new URL('../app/components/genesis-project.tsx',import.meta.url).href+'?production-comparison';
  const hook=registerHooks({load(url,context,next){
    if(url===virtual)return {format:'module',shortCircuit:true,source:ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText};
    return next(url,context);
  }});
  try{
    const baseline=await import(virtual);
    const project={...GENESIS_YAW_001,objectives:[...GENESIS_YAW_001.objectives]};
    const current=renderToStaticMarkup(<GenesisProjectPresentation project={project}/>);
    assert.match(current, /class="shell compact"/);
    // Only opt into the existing compact presentation. All facts, evidence and links stay identical.
    assert.equal(current.replace('class="shell compact"','class="shell"'),renderToStaticMarkup(<baseline.GenesisProjectPresentation project={project}/>));
    for(const path of ['app/components/genesis-project.module.css','components/ProjectProgress.tsx']){
      const {stdout}=await exec('git',['show',`${production}:${path}`]);assert.equal(await readFile(path,'utf8'),stdout,path);
    }
    // Keep the historical digest tied to the accepted, committed R2 baseline.
    const {stdout:accepted}=await exec('git',['show','28301e16a46062b90197085e4b58e49bb34b0822:test/fixtures/shared-shell-r2.json']);
    assert.equal(await readFile('test/fixtures/shared-shell-r2.json','utf8'),accepted);
    const snapshot=JSON.parse(accepted);
    for(const [path,digest] of Object.entries(snapshot.files))
      assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),digest,path);
  }finally{hook.deregister();}
});

test('WordWake uses its own reviewed Blueprint/task summaries in the approved shared shell',async()=>{
  let query='';const project=await publicWordWake(async sql=>{query=sql;return [publicWordWakeRow()];});
  const html=renderToStaticMarkup(<PersistedYawrdContent project={project!}/>);
  for(const expected of ['YAW-002','WordWake','yawrd1.testnet','Published on Testnet','Join applications open','The Blueprint','Eight-neighbor adjacency','Puzzle engine + reference puzzle','Player experience + two additional puzzles','0/2','Not activated','Claiming closed'])assert.ok(html.includes(expected),expected);
  assert.doesNotMatch(html,/Genesis project|Task B · Recorded reward|Proof of Contribution|Reviewed PR|1 NEAR on Testnet<|T1-AC1|SKILL\.md|TASKS\.json/);
  assert.match(query,/review\.snapshot_sha256=pkg\.snapshot_sha256/);assert.match(query,/pkg\.review_record_sha256=\$5/);
  assert.match(query,/p\.published_at IS NOT NULL/);assert.doesNotMatch(query,/SELECT\s+(pkg\.snapshot|\*)\b/);
});

test('public summary reader rejects missing reviewed fields instead of filling in a fictional plan',async()=>{
  for(const key of ['t1_title','t2_summary','principles','contract_version','reviewed_on']){
    const row:any=publicWordWakeRow();delete row[key];await assert.rejects(()=>publicWordWake(async()=>[row]));
  }
  assert.equal(await publicWordWake(async()=>[]),null);
});

test('public projection keeps extra database fields private and enforces the fixed publication bindings', async () => {
  let statement = '', parameters: unknown[] = [];
  const project = await publicWordWake(async (sql, values) => {
    statement = sql; parameters = values ?? [];
    return [{ ...publicWordWakeRow(), snapshot: 'PRIVATE SNAPSHOT', intake: 'PRIVATE INTAKE',
      restricted_content: 'PRIVATE CREW', applications: [{ introduction: 'PRIVATE APPLICATION' }] }];
  });
  assert.doesNotMatch(JSON.stringify(project), /PRIVATE/);
  for (const key of ['snapshot', 'intake', 'restricted_content', 'applications'])
    assert.equal(Object.hasOwn(project!, key), false, key);
  assert.deepEqual(parameters, ['yaw-002', 'yawrd1.testnet', 'wordwake-build.factory.yawrd.testnet',
    'yaw-002-wordwake-ww-v1-r1', '1643a35631c87af8882134e23692fbdd862d0d62246eef064db8a1e57b8255f0', 'ww-v1']);
  for (const binding of ['p.published_at IS NOT NULL', 'pkg.founder_account_id=p.creator_account_id',
    'pkg.dao_account_id=p.dao_account_id', 'review.reviewer_account_id=p.creator_account_id',
    "encode(sha256(convert_to(pkg.snapshot_text,'UTF8')),'hex')", "t.publication_status='draft'"])
    assert.ok(statement.includes(binding), binding);
  assert.equal(await publicWordWake(async () => [publicWordWakeRow(), publicWordWakeRow()]), null);
});

import { publicWordWakeRewards } from '../src/launch/wordwake-public-rewards.ts';
import { authFailureCategory, authRequest } from '../src/participants/http.ts';
import { PersistentAuth } from '../src/participants/auth.ts';
import { DiscoveryCarousel } from '../app/components/discovery-carousel.tsx';
test('reward projection reads only latest approved snapshot-bound terms and returns just allocations', async()=>{
  const snapshot='a'.repeat(64), row={revision:1,total:'2000000000000000000000000',t1:'1000000000000000000000000',t2:'1000000000000000000000000'};
  const result=await publicWordWakeRewards(async(sql,params)=>{
    assert.deepEqual(params,[snapshot,'yaw-002-wordwake-ww-v1-r1']);
    for(const guard of ['ORDER BY revision DESC LIMIT 1','r.snapshot_sha256=$1','r.approved_by=','r.terms_sha256=encode','wordwake_reward_allocations',"'taskId'"])assert.ok(sql.includes(guard));
    assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE/);return [{...row,terms_text:'PRIVATE REWARD RECORD'}];
  },snapshot);
  assert.deepEqual(result,{revision:1,total:'2',T1:'1',T2:'1'});
  for(const bad of [{...row,t2:'2'}, {...row,revision:0},{...row,t1:'-1'}]) assert.equal(await publicWordWakeRewards(async()=>[bad],snapshot),null);
  assert.equal(await publicWordWakeRewards(async()=>{throw Error('private connection');},snapshot),null);
  assert.equal(await publicWordWakeRewards(async()=>[],snapshot),null);
  const project=(await publicWordWake(async()=>[publicWordWakeRow()]))!;
  const html=renderToStaticMarkup(<PersistedYawrdContent project={{...project,rewardPlan:result}}/>);
  assert.equal(html.split('>Approved reward</p>').length-1,2);assert.equal(html.split('>1 Testnet NEAR</p>').length-1,2);assert.match(html,/2 Testnet NEAR/);assert.match(html,/2 reviewed tasks · 1 Testnet NEAR each/);assert.match(html,/<summary>Reward plan details<\/summary>/);assert.equal(html.split('Unassigned · Claiming closed').length-1,2);
});
test('auth diagnosis never serializes raw error details and origin failure performs no database work',async()=>{
  assert.equal(authFailureCategory(Object.assign(Error('postgresql://PRIVATE'),{code:'42501',detail:'PRIVATE'})),'database_42501');
  assert.equal(authFailureCategory(Error('PRIVATE SECRET')),'verification_or_storage_unavailable');
  const reports:unknown[]=[];
  const auth=new PersistentAuth(async()=>{assert.fail('No origin: must not query database');},async()=>{assert.fail('No RPC');});
  const response=await authRequest(new Request('https://preview.example/api/auth/challenge',{method:'POST',headers:{host:'preview.example',origin:'https://preview.example','content-type':'application/json'},body:'{}'}),'challenge',auth,null,x=>reports.push(x));
  assert.equal(response.status,503);assert.deepEqual(reports,[{stage:'origin',category:'origin_configuration_unavailable'}]);
  assert.deepEqual(await response.json(),{error:'service_unavailable'});
});
test('discovery is compact, navigable, and quiet when no published projects are eligible',()=>{
  assert.equal(renderToStaticMarkup(<DiscoveryCarousel projects={[]}/>),'');
  const html=renderToStaticMarkup(<DiscoveryCarousel projects={[{id:'yaw-001',name:'Build Progress',status:'Completed · Applications closed',description:'Accepted work',image:'/landing/build-progress.webp'},{id:'yaw-002',name:'WordWake',status:'Join applications open · Tasks not activated',description:'Reviewed work',image:'/brand/yawrd-buoy.webp'}]}/>);
  for(const expected of ['carousel','Previous Yawrd','Next Yawrd','Completed','Tasks not activated','/yawrd/yaw-002'])assert.ok(html.includes(expected));
});
