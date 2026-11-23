import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { Client } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { ENDPOINT, MIGRATION_SHA256, publicationCheckTarget, publicationContract, syntheticFixture, safeFailure, runPublicationAcceptance, requirePasswordTerminal, ownerConnectionOptions, ownerFailure, passwordPrompt, acceptanceProgress, FUNCTIONAL_CASES, assertPublicViewContract, PUBLIC_VIEW_CATALOG_SQL } from '../scripts/check-creation-publication-postgres.mjs';

const hostname = ENDPOINT + '.c-1.ap-southeast-1.aws.neon.tech';
test('acceptance plan permits only the explicit direct Development host and fixed owner/database', () => {
  assert.deepEqual(publicationCheckTarget(hostname), {hostname, endpoint:ENDPOINT, database:'neondb', role:'neondb_owner'});
  for (const value of [undefined,'',hostname.replace(ENDPOINT,'ep-other'),hostname.replace(ENDPOINT,ENDPOINT+'-pooler'),
    hostname+':5432',hostname+'/neondb',hostname+'?options=unsafe','postgresql://secret@'+hostname,hostname+'\n',hostname.replace('.neon.tech','.example')])
    assert.throws(() => publicationCheckTarget(value));
});
test('installed-contract expectations are pinned to the existing migration without creating or installing anything', async () => {
  const sql = await readFile(new URL('../docs/proposals/migrations/phase2_creation_publication.sql',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(sql).digest('hex'),MIGRATION_SHA256);
  assert.deepEqual([...publicationContract(sql).keys()],['context','issue','receipt','ticket','publish']);
  assert.throws(()=>publicationContract(sql+'\n'),/local_publication_artifact_changed/);
});
test('fixtures are fresh synthetic identities and exercise selected/excluded dependencies plus private-field exclusion', () => {
  const a=syntheticFixture(),b=syntheticFixture();
  assert.notEqual(a.id,b.id);assert.notEqual(a.founder,b.founder);assert.notEqual(a.sessions[0],b.sessions[0]);
  assert.match(a.id,/^yawrd-[a-z2-7]{12}$/);assert.match(a.founder,/^p38b-check-a-[a-f0-9]{20}\.testnet$/);
  assert.deepEqual(a.expected.tasks.map(t=>t.id),['review','report']);
  assert.deepEqual(a.expected.tasks[1].dependencies,[{included:false,title:'Excluded prerequisite'},{included:true,title:'Review measurements'}]);
  assert.equal(a.expected.tasks[0].rewardTerms,'private-unpaid-choice');
  assert.ok(a.expected.tasks.every(t=>t.allocation==='unallocated'));assert.doesNotMatch(JSON.stringify(a.expected),/PRIVATE_/);
  assert.match(JSON.stringify(a.artifacts),/PRIVATE_NOTES_|PRIVATE_SKILL_|PRIVATE_REFERENCE_|PRIVATE_EVIDENCE_/);
  assert.equal(a.expected.progress.accepted,null);
  for(const value of [a.deploymentHash,a.paymentHash,a.receiptHash])assert.match(value,/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
});
test('a wrong connected role/database fails before BEGIN, fixtures or any write', async () => {
  const sql=await readFile(new URL('../docs/proposals/migrations/phase2_creation_publication.sql',import.meta.url),'utf8');
  for(const [role,database] of [['neondb_owner','otherdb'],['yawrd_publication_writer','neondb'],['yawrd_07b_runtime','neondb']]){
    const calls=[];
    const client={query:async text=>{calls.push(text);assert.match(text,/^SELECT current_user/);return {rows:[{role,login:role,database,pid:42}]};}};
    const result=await runPublicationAcceptance(client,publicationCheckTarget(hostname),sql);
    assert.equal(result.status,'FAIL');assert.equal(result.code,'connected_identity_mismatch');assert.equal(result.rollbackVerified,false);
    assert.equal(calls.length,1);assert.equal(result.realFounderLaunchReady,false);
  }
});
test('evidence suppresses raw credential-bearing errors and never promotes SQL-only acceptance to launch clearance', async () => {
  assert.equal(safeFailure({message:'postgresql://owner:SECRET@host',detail:'SECRET'}),'verification_or_connection_failed');
  assert.equal(safeFailure({code:'42501',message:'SECRET'}),'postgres_42501');
  const script=await readFile(new URL('../scripts/check-creation-publication-postgres.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(script,/process\.env|load-environment|load-migration-environment|SET ROLE|DISABLE TRIGGER|session_replication_role|client\.query\(['"]COMMIT/);
  assert.match(script,/requirePasswordTerminal\(input, output\)/);assert.match(script,/setRawMode\(true\)/);
  assert.match(script,/await client\.query\('ROLLBACK'\)/);assert.match(script,/postrollback_cleanup_not_verified/);
  assert.match(script,/BLOCKED_REQUIRES_ISOLATED_COMMITTED_FIXTURE/);assert.match(script,/realFounderLaunchReady: false/);
});


test('password input requires an interactive terminal with echo-control capability', () => {
  const tty={isTTY:true,setRawMode(){}};
  assert.doesNotThrow(()=>requirePasswordTerminal(tty,{isTTY:true}));
  for(const [input,output] of [[{isTTY:false,setRawMode(){}},{isTTY:true}],[{isTTY:true},{isTTY:true}],[tty,{isTTY:false}]])
    assert.throws(()=>requirePasswordTerminal(input,output),/interactive_terminal_required/);
});


test('old URI construction demonstrably changes percent escapes; raw owner options preserve credentials', () => {
  const target=publicationCheckTarget(hostname), password='synthetic%40literal%25: /@?#🌱';
  const url=new URL('postgresql://'+hostname+'/neondb?sslmode=verify-full');url.username='neondb_owner';url.password=password;
  const old=new Client({connectionString:url.href});
  assert.notEqual(old.connectionParameters.password,password);
  for(const value of [password,'  synthetic spaces  ','synthetic:colon/@?#','synthetic%41','synthetic-unicode-🌱']){
    const options=ownerConnectionOptions(target,value),client=new Client(options);
    assert.equal(client.connectionParameters.password,value);
    assert.equal(client.connectionParameters.user,'neondb_owner');assert.equal(client.connectionParameters.host,hostname);
    assert.equal(client.connectionParameters.database,'neondb');assert.equal(client.connectionParameters.port,5432);
    assert.equal(client.connectionParameters.ssl.rejectUnauthorized,true);
    assert.equal(Object.hasOwn(options,'connectionString'),false);
  }
  assert.throws(()=>ownerConnectionOptions({...target,role:'yawrd_publication_writer'},'synthetic'));
  assert.throws(()=>ownerConnectionOptions(target,''));
});
function terminal() {
  const input=new EventEmitter();input.isTTY=true;input.isRaw=false;
  input.setRawMode=v=>input.isRaw=v;input.setEncoding=()=>{};input.resume=()=>{};input.pause=()=>input.paused=true;
  const output={isTTY:true,text:'',write(s){this.text+=s;}};
  return {input,output};
}
test('hidden prompt preserves pasted text, spaces, Unicode and edits without echo, and restores terminal state',async()=>{
  const {input,output}=terminal(), pending=passwordPrompt(input,output);
  input.emit('data','  synthetic%40🌱');input.emit('data','x\u007f!  \r');
  assert.equal(await pending,'  synthetic%40🌱!  ');assert.equal(input.isRaw,false);assert.equal(input.paused,true);
  assert.equal(input.listenerCount('data'),0);assert.doesNotMatch(output.text,/synthetic/);
});
test('empty or cancelled password prompts fail locally and restore terminal state',async()=>{
  for(const [chunk,reason] of [['\r','password_required'],['\u0003','cancelled'],['\u001b','invalid_password_input']]){
    const {input,output}=terminal(),pending=passwordPrompt(input,output);input.emit('data',chunk);
    await assert.rejects(pending,new RegExp(reason));assert.equal(input.isRaw,false);assert.equal(input.listenerCount('data'),0);
  }
});
test('authentication diagnostics identify only the owner role, stage and sanitized SQLSTATE',()=>{
  const result=ownerFailure({code:'28P01',message:'SECRET',detail:'postgresql://owner:SECRET@host'},'owner_connect');
  assert.deepEqual(result,{status:'FAIL',stage:'owner_connect',role:'neondb_owner',code:'postgres_28P01',credentials:'suppressed'});
  assert.doesNotMatch(JSON.stringify(result),/SECRET|postgresql/);
});


test('report distinguishes a read-only preflight rollback from actual fixture removal',()=>{
  const base={fixtureWritesAttempted:false,fixturesCreated:false,fixtureSetupComplete:false,rollbackVerified:true,fixtureRowsAbsentVerified:true,checks:[{name:'connected_identity'}],failed:true};
  const preflight=acceptanceProgress(base);
  assert.equal(preflight.fixtureCreationState,'not_started');
  assert.equal(acceptanceProgress({...base,fixtureWritesAttempted:true}).fixtureCreationState,'first_write_unconfirmed_or_rejected');
  assert.equal(preflight.cleanupVerified,false);assert.equal(preflight.syntheticFixturesRemoved,false);
  assert.equal(preflight.fixtureRowsAbsentVerified,true);assert.deepEqual(preflight.functionalChecksCompleted,[]);
  const partial=acceptanceProgress({...base,fixtureWritesAttempted:true,fixturesCreated:true});
  assert.equal(partial.cleanupVerified,true);assert.equal(partial.fixtureSetupComplete,false);assert.equal(partial.functionalAcceptanceComplete,false);
  const lost=acceptanceProgress({...base,fixturesCreated:true,rollbackVerified:false,fixtureRowsAbsentVerified:false});
  assert.equal(lost.cleanupVerified,false);
  const complete=acceptanceProgress({...base,fixtureWritesAttempted:true,fixturesCreated:true,fixtureSetupComplete:true,failed:false,checks:FUNCTIONAL_CASES.map(name=>({name}))});
  assert.equal(complete.functionalAcceptanceComplete,true);
});

test('actual preflight failure output never claims fixtures were created or publication cases completed',async()=>{
  const sql=await readFile(new URL('../docs/proposals/migrations/phase2_creation_publication.sql',import.meta.url),'utf8');
  for(const partial of [false,true]){
    let writes=0;const calls=[];
    const client={query:async text=>{
      calls.push(text);
      if(text.startsWith('SELECT current_user'))return {rows:[{role:'neondb_owner',login:'neondb_owner',database:'neondb'}]};
      if(text.startsWith('BEGIN'))return {command:'BEGIN'};
      if(text.startsWith('SET LOCAL'))return {};
      if(text.includes('SELECT p.proname'))return {rows:[...publicationContract(sql)].map(([proname,prosrc])=>({proname,prosrc,prosecdef:true,owner:'neondb_owner',proconfig:['search_path=pg_catalog, pg_temp']}))};
      if(text===PUBLIC_VIEW_CATALOG_SQL)return {rows:[viewCatalog(partial?NEON_VIEW:'SELECT contradictory_definition')]};
      if(text.includes('AS challenges'))return {rows:[{challenges:0,sessions:0,creations:0}]};
      if(text.startsWith('INSERT INTO yawrd.auth_challenges')){writes++;return {command:'INSERT',rowCount:1};}
      if(text.startsWith('INSERT INTO yawrd.sessions'))throw {code:'23514'};
      if(text==='ROLLBACK')return {command:'ROLLBACK'};
      if(text.includes('AS remaining'))return {rows:[{remaining:'0'}]};
      assert.fail('Unexpected control-flow SQL');
    }};
    const result=await runPublicationAcceptance(client,publicationCheckTarget(hostname),sql);
    assert.equal(result.status,'FAIL');assert.equal(result.rollbackVerified,true);assert.equal(result.fixtureRowsAbsentVerified,true);
    assert.equal(result.fixturesCreated,partial);assert.equal(result.cleanupVerified,partial);assert.equal(result.fixtureSetupComplete,false);
    assert.equal(writes,partial?1:0);assert.deepEqual(result.functionalChecksCompleted,[]);assert.equal(result.functionalAcceptanceComplete,false);
  }
});


const NEON_VIEW = ` SELECT creation_id AS id,
     founder AS creator_account_id,
     payload,
     published_at
   FROM yawrd_publication.publications;`;
function viewCatalog(definition=NEON_VIEW) {
  return {kind:'v',owner:'neondb_owner',definition,
    columns:['id','creator_account_id','payload','published_at'].map(name=>({name,typeMatches:true})),
    dependencies:['creation_id','founder','payload','published_at'].map(column=>({column,allowed:true}))};
}
test('view assertion accepts exact verified Neon deparser output and harmless qualification/whitespace/semicolon differences',()=>{
  for(const sql of [NEON_VIEW,NEON_VIEW.trim().replace(/;$/,''),'\n'+NEON_VIEW+'\n',
    'SELECT publications.creation_id AS id, publications.founder AS creator_account_id, publications.payload, publications.published_at FROM yawrd_publication.publications;'])
    assert.doesNotThrow(()=>assertPublicViewContract(viewCatalog(sql)));
});
test('view assertion rejects altered sources, expressions, projections, clauses and additional statements',()=>{
  for(const sql of [NEON_VIEW.replace('yawrd_publication.publications','yawrd_publication.tickets'),
    NEON_VIEW.replace('yawrd_publication.publications','private.publications'),
    NEON_VIEW.replace('payload,','evidence AS payload,'),NEON_VIEW.replace('payload,',"payload || '{}'::jsonb AS payload,"),
    NEON_VIEW.replace('founder AS creator_account_id','creation_id AS creator_account_id'),
    NEON_VIEW.replace('payload,','payload, evidence,'),NEON_VIEW.replace('payload,',''),
    NEON_VIEW.replace('payload,','published_at,'),NEON_VIEW+' SELECT 1;',NEON_VIEW.replace(';',' WHERE false;'),
    NEON_VIEW.replace(';',' UNION SELECT * FROM private.data;')])
    assert.throws(()=>assertPublicViewContract(viewCatalog(sql)),/installed_public_view_definition_mismatch/);
});
test('view catalogs enforce exact ordered names, type identities, owner and four allowed source-column dependencies',()=>{
  const changed=[];
  let v=viewCatalog();v.columns.reverse();changed.push(v);
  v=viewCatalog();v.columns.push({name:'evidence',typeMatches:true});changed.push(v);
  v=viewCatalog();v.columns[3].typeMatches=false;changed.push(v);
  v=viewCatalog();v.owner='other';changed.push(v);
  v=viewCatalog();v.kind='m';changed.push(v);
  v=viewCatalog();v.dependencies[0].allowed=false;changed.push(v);
  v=viewCatalog();v.dependencies.push({column:'evidence',allowed:true});changed.push(v);
  v=viewCatalog();v.dependencies[0].column='session_hash';changed.push(v);
  v=viewCatalog();v.dependencies.pop();changed.push(v);
  for(const row of changed)assert.throws(()=>assertPublicViewContract(row));
  for(const spelling of ['timestamptz','timestamp with time zone']) {
    v=viewCatalog();v.columns[3].displayType=spelling;assert.doesNotThrow(()=>assertPublicViewContract(v));
  }
  assert.match(PUBLIC_VIEW_CATALOG_SQL,/a\.atttypid=CASE/);
  assert.match(PUBLIC_VIEW_CATALOG_SQL,/'pg_catalog\.timestamptz'::regtype/);
  assert.match(PUBLIC_VIEW_CATALOG_SQL,/d\.refobjid='yawrd_publication\.publications'::regclass/);
});
