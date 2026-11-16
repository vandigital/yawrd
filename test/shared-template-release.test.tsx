import test from 'node:test';
import assert from 'node:assert/strict';
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

const production='e246d1094ebff7279dbc68b7b4245b7c08bdb2f4',exec=promisify(execFile);
test('Genesis markup is byte-identical to the verified Production baseline and shared styles are unchanged',async()=>{
  const {stdout:source}=await exec('git',['show',`${production}:app/components/genesis-project.tsx`]);
  const virtual=new URL('../app/components/genesis-project.tsx',import.meta.url).href+'?production-comparison';
  const hook=registerHooks({load(url,context,next){
    if(url===virtual)return {format:'module',shortCircuit:true,source:ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText};
    return next(url,context);
  }});
  try{
    const baseline=await import(virtual);
    const project={...GENESIS_YAW_001,objectives:[...GENESIS_YAW_001.objectives]};
    assert.equal(renderToStaticMarkup(<GenesisProjectPresentation project={project}/>),renderToStaticMarkup(<baseline.GenesisProjectPresentation project={project}/>));
    for(const path of ['app/components/genesis-project.module.css','app/components/project-space-shell.tsx','app/components/project-space-shell.module.css','components/ProjectProgress.tsx']){
      const {stdout}=await exec('git',['show',`${production}:${path}`]);assert.equal(await readFile(path,'utf8'),stdout,path);
    }
  }finally{hook.deregister();}
});

test('WordWake uses its own reviewed Blueprint/task summaries in the approved shared shell',async()=>{
  let query='';const project=await publicWordWake(async sql=>{query=sql;return [publicWordWakeRow()];});
  const html=renderToStaticMarkup(<PersistedYawrdContent project={project!}/>);
  for(const expected of ['YAW-002','WordWake','yawrd1.testnet','Published on Testnet','Join applications open','The Blueprint','Eight-neighbor adjacency','Puzzle engine + reference puzzle','Player experience + two additional puzzles','0/2','Not activated','Closed to claiming'])assert.ok(html.includes(expected),expected);
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
