import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {prepareCreation} from '../src/creation-integration.ts';
import {testnetFactorySettings} from '../src/testnet-factory-settings.ts';
import {preparationArtifacts} from './fixtures/preparation.ts';

const patchPath='docs/proposals/migrations/phase2_creation_preparation_hosted_sol.sql';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const patch=read(patchPath),base=read('docs/proposals/migrations/phase2_creation_preparation_generation.sql');
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const q=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const json=(v:unknown)=>q(JSON.stringify(v))+'::jsonb';
const ids=['a','b','c','d'].map(c=>'yawrd-'+c.repeat(12));
const founder='r42c-founder.testnet',other='r42c-other.testnet';
const own="repeat('1',64)",foreign="repeat('2',64)";
const sol='openai/gpt-6.1-sol',qwen='Qwen/Qwen3.8-27B',hosted='creation-hosted-sol-v1',legacy='creation-source-aware-v1',partner='creation-partner-preparation-v1';
const attempt=(i:number)=>q('00000000-0000-4000-8000-'+String(i).padStart(12,'0'))+'::uuid';
const reserve=(id:string,i:number,model=sol,prompt=hosted,consent=partner,session=own)=>
  `SELECT yawrd.creation_preparation_reserve(${session},${q(id)},${attempt(i)},2,pg_temp.source(${q(id)}),${q(model)},${q(prompt)},${q(consent)},repeat('d',64))`;
const stage=(id:string,i:number,state:string,error:string|null=null)=>
  `SELECT yawrd.creation_preparation_stage(${own},${q(id)},${attempt(i)},${q(state)},NULL,${error?q(error):'NULL'})`;
const artifact=preparationArtifacts();artifact.privateNotes='';
const complete=(id:string,i:number,output:number,model=sol)=>`SELECT yawrd.creation_preparation_complete(${own},${q(id)},${attempt(i)},${q(JSON.stringify(artifact))},${json({protocol:model===sol?'responses':'chat-completions',requestedModel:model,returnedModel:model,responseId:'r42c-synthetic',finishReason:'stop',tokens:{input:100,output,reasoning:0,cached:0},durationMs:1})})`;
const reject=(sql:string,code:string,message?:string)=>`SELECT pg_temp.reject(${q(sql)},${q(code)},${message?q(message):'NULL'});`;

// This runner accepts ONLY an explicitly created local disposable cluster socket.
// It never reads a URL/password/env file, connects to Neon, or creates a server.
const socket=process.env.YAWRD_R42C_DISPOSABLE_SOCKET;
function script(){
  const manifest=JSON.parse(read('docs/releases/production-beta-r2/schema-manifest.json'));
  const steps=manifest.steps.map((s:{path:string;sha256:string;hasOwnTransaction:boolean})=>{
    const text=read(s.path);assert.equal(sha(text),s.sha256);
    return s.hasOwnTransaction?text:'BEGIN;\n'+text+'\nCOMMIT;';
  }).join('\n');
  const fixtures=ids.map((id,i)=>{
    const identifier=('r42c'+String(i+1)).padEnd(12,'a');
    const prepared=prepareCreation({projectName:'Synthetic SQL fixture',projectPurpose:'Disposable post-verification contract test',projectAccountLabel:identifier,creatorAccountId:founder,initialStewardAccountIds:[other],stewardApprovalThreshold:2,factoryAccountId:testnetFactorySettings.factoryAccountId},testnetFactorySettings,{accountId:founder,network:'testnet'});
    return `DO $$ DECLARE c yawrd.creation_drafts; d yawrd.creation_deployments; f yawrd.creation_platform_fees;
    review jsonb:=${json({verified:true,autoUpdate:false,proposalId:0,proposalStatus:'Approved',votes:{[founder]:'Approve',[other]:'Approve'},blockHeight:10,blockHash:'B'.repeat(43)})}||jsonb_build_object('checkedAt',clock_timestamp());
    BEGIN
      SELECT * INTO c FROM yawrd.creation_start(${own},${q(id)},${json({schemaVersion:'yawrd.intake-draft.v1',draftId:'r42c-'+id})});
      SELECT * INTO c FROM yawrd.creation_save(${own},${q(id)},c.revision,NULL,${json({publicName:'Synthetic SQL fixture',publicDescription:'Disposable post-verification contract test',accountLabel:'',secondSteward:other,threshold:2})});
      SELECT * INTO d FROM yawrd.creation_deployment_reserve(${own},${q(id)},c.revision,${q(identifier)});
      SELECT * INTO d FROM yawrd.creation_deployment_prepare(${own},${q(id)},c.revision,d.revision,${json(prepared)},'{"syntheticOnly":true}');
      SELECT * INTO d FROM yawrd.creation_deployment_claim(${own},${q(id)},c.revision,d.revision,1,'creation-deployment-v1');
      SELECT * INTO d FROM yawrd.creation_deployment_note(${own},${q(id)},d.revision,1,${q(String(i+1).repeat(43))});
      SELECT * INTO d FROM yawrd.creation_deployment_finish(${own},${q(id)},d.revision,1,'deployed-hardening-required',${json({transactionHash:String(i+1).repeat(43),evidenceDigest:'d'.repeat(64),transactionBlockHeight:'2',finalHeight:'3',autoUpdate:true})});
      ${i===3?'':`SELECT * INTO f FROM yawrd.creation_fee_open(${own},${q(id)},c.revision,d.revision,review);
      SELECT * INTO f FROM yawrd.creation_fee_claim(${own},${q(id)},c.revision,d.revision,f.revision,review,'creation-platform-fee-v1');
      SELECT * INTO f FROM yawrd.creation_fee_note(${own},${q(id)},f.revision,${q(String(i+5).repeat(43))});
      SELECT * INTO f FROM yawrd.creation_fee_complete(${own},${q(id)},f.revision,${json({txHash:String(i+5).repeat(43),blockHeight:'11',receiptId:('R'+String(i+1)).padEnd(43,'R'),evidenceDigest:'e'.repeat(64)})});`}
    END $$;`;
  }).join('\n');
  return `\\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database()<>'neondb' OR inet_server_addr() IS NOT NULL
    OR current_user<>'r42c_owner' OR current_setting('application_name')<>'yawrd-r42c-disposable'
    OR to_regnamespace('yawrd') IS NOT NULL OR to_regnamespace('yawrd_publication') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('yawrd_07b_runtime','yawrd_publication_writer'))
    THEN RAISE EXCEPTION 'empty_local_disposable_cluster_required'; END IF;
END $$;
CREATE ROLE yawrd_07b_runtime LOGIN NOINHERIT;
CREATE ROLE yawrd_publication_writer LOGIN NOINHERIT;
${read('migrations/001_participants.sql')}
GRANT USAGE ON SCHEMA yawrd TO yawrd_07b_runtime;
GRANT SELECT,INSERT ON yawrd.auth_challenges,yawrd.sessions,yawrd.auth_rate_limits TO yawrd_07b_runtime;
GRANT UPDATE(revoked_at) ON yawrd.sessions TO yawrd_07b_runtime;
${steps}
CREATE FUNCTION pg_temp.check(_ok boolean,_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF _ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'check failed: %',_label; END IF; END $$;
CREATE FUNCTION pg_temp.reject(_sql text,_code text,_message text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE code text; message text;
BEGIN
  BEGIN EXECUTE _sql;
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE,message=MESSAGE_TEXT;
    IF code=_code AND (_message IS NULL OR message=_message) THEN RETURN; END IF;
    RAISE EXCEPTION 'wrong rejection: % %',code,message;
  END;
  RAISE EXCEPTION 'expected rejection absent';
END $$;
CREATE FUNCTION pg_temp.source(_id text) RETURNS text LANGUAGE sql AS $$
  SELECT jsonb_build_object('provenance',jsonb_build_object('creationId',id,'creationRevision',revision),'fixture','SYNTHETIC SQL ONLY')::text
    FROM yawrd.creation_drafts WHERE id=_id
$$;
INSERT INTO yawrd.auth_challenges(id,browser_hash,account_id,network,origin,message,recipient,nonce,issued_at,expires_at,consumed_at)
SELECT repeat(i::text,43),repeat(i::text,64),CASE i WHEN 1 THEN ${q(founder)} ELSE ${q(other)} END,'testnet','https://disposable.invalid','SYNTHETIC','SQL test','SYNTHETIC',statement_timestamp(),statement_timestamp()+interval '5 minutes',statement_timestamp() FROM generate_series(1,2)i;
INSERT INTO yawrd.sessions(token_hash,challenge_id,network,account_id,public_key,block_height,block_hash)
SELECT repeat(i::text,64),repeat(i::text,43),'testnet',CASE i WHEN 1 THEN ${q(founder)} ELSE ${q(other)} END,'synthetic-key',1,'synthetic-block' FROM generate_series(1,2)i;
${fixtures}
SET ROLE yawrd_07b_runtime;
${reserve(ids[0],1,qwen,legacy,'creation-ai-preparation-v1')};
RESET ROLE;
CREATE TEMP TABLE r42c_historical AS SELECT to_jsonb(a) AS row FROM yawrd.creation_preparation_attempts a;
CREATE TEMP TABLE r42c_acl AS
SELECT 'relation' AS kind,c.oid,c.relowner AS owner,c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('yawrd','yawrd_publication')
UNION ALL SELECT 'function',p.oid,p.proowner,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('yawrd','yawrd_publication');
${patch}
SELECT pg_temp.check((SELECT row FROM r42c_historical)=(SELECT to_jsonb(a) FROM yawrd.creation_preparation_attempts a WHERE creation_id=${q(ids[0])}),'historical row byte-for-byte JSON unchanged');
SELECT pg_temp.check(NOT EXISTS(SELECT 1 FROM r42c_acl b LEFT JOIN (
  SELECT 'relation' AS kind,c.oid,c.relowner AS owner,c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('yawrd','yawrd_publication')
  UNION ALL SELECT 'function',p.oid,p.proowner,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('yawrd','yawrd_publication')) a USING(kind,oid)
  WHERE a.oid IS NULL OR ROW(a.owner,a.acl) IS DISTINCT FROM ROW(b.owner,b.acl)),'owners and runtime/writer ACLs unchanged');
SET ROLE yawrd_07b_runtime;
${reject(reserve(ids[1],2,sol,legacy),'P0001','generation_consent_required')}
${reject(reserve(ids[1],2,sol,hosted,'creation-ai-preparation-v1'),'P0001','generation_consent_required')}
${reject(reserve(ids[1],2,sol,hosted,partner,foreign),'P0001','creation_not_found')}
${reject(reserve(ids[3],4),'P0001','preparation_payment_required')}
SELECT pg_temp.check((${reserve(ids[1],2)}),'hosted Sol reserved');
SELECT pg_temp.check((SELECT output_token_limit=16000 AND provider_timeout_ms=240000 AND deadline_at=reserved_at+interval '270 seconds' FROM yawrd.creation_preparation_attempts WHERE creation_id=${q(ids[1])}),'persisted hosted budget/deadline');
SELECT pg_temp.check(NOT (${reserve(ids[1],22)}),'duplicate reservation loses');
${stage(ids[1],2,'waiting')};${stage(ids[1],2,'checking')};
${reject(complete(ids[1],2,16001),'P0001','generation_attempt_conflict')}
SELECT pg_temp.check((SELECT count(*)=0 FROM yawrd.creation_preparation_versions WHERE creation_id=${q(ids[1])}),'over-budget completion leaves no partial artifact');
${complete(ids[1],2,16000)};${complete(ids[1],2,16000)};
SELECT pg_temp.check((SELECT count(*)=1 FROM yawrd.creation_preparation_versions WHERE creation_id=${q(ids[1])}),'16000 saved once');
${reject(`UPDATE yawrd.creation_preparation_attempts SET state='reserved' WHERE creation_id=${q(ids[1])}`,'P0001','generation_attempt_conflict')}
SELECT pg_temp.check(NOT (${reserve(ids[1],23)}),'saved allowance remains consumed');
${reserve(ids[2],3)};${stage(ids[2],3,'waiting')};${stage(ids[2],3,'failed','provider_access_unavailable')};
SELECT pg_temp.check(NOT (${reserve(ids[2],33)}),'failed allowance remains consumed');
${reject(`UPDATE yawrd.creation_preparation_attempts SET state='reserved' WHERE creation_id=${q(ids[2])}`,'P0001','generation_attempt_conflict')}
${reject(`UPDATE yawrd.creation_preparation_attempts SET output_token_limit=8000 WHERE creation_id=${q(ids[2])}`,'42501')}
${reject(`DELETE FROM yawrd.creation_preparation_attempts WHERE creation_id=${q(ids[2])}`,'42501')}
${stage(ids[0],1,'waiting')};${stage(ids[0],1,'checking')};
${reject(complete(ids[0],1,8001,qwen),'P0001','generation_attempt_conflict')}
${complete(ids[0],1,8000,qwen)};
SELECT pg_temp.check((yawrd.creation_preparation_attempt_read(${own},${q(ids[0])})->>'outputTokensLimit')::int=8000,'historical Qwen recorded allowance remains 8000');
RESET ROLE;
${reject(`UPDATE yawrd.creation_preparation_attempts SET deadline_at=clock_timestamp() WHERE creation_id=${q(ids[2])}`,'P0001','generation_attempt_conflict')}
SET ROLE yawrd_publication_writer;
${reject(`SELECT * FROM yawrd.creation_preparation_attempts`,'42501')}
${reject(reserve(ids[1],99),'42501')}
RESET ROLE;
DO $$ BEGIN RAISE NOTICE 'R4.2C SQL checks passed'; END $$;
`;
}

test('hosted SQL patch is pinned, additive, transactional, preserves original definitions and does not grant privileges',()=>{
  const manifest=JSON.parse(read('docs/releases/production-beta-r2/r42c-sol-manifest.json'));
  const disposableScript=script();assert.match(disposableScript,/empty_local_disposable_cluster_required/);
  assert.doesNotMatch(disposableScript,/CREATE TABLE yawrd\.creation_preparation_recoveries/);
  assert.equal(sha(patch),manifest.sha256);assert.match(patch,/\nBEGIN;[\s\S]*\nCOMMIT;\n$/);
  assert.equal((patch.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,4);
  for(const match of patch.matchAll(/\('([a-z_]+)','([a-f0-9]{64})'\)/g)){
    const body=base.match(new RegExp('CREATE FUNCTION yawrd\\.'+match[1]+'\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;'));
    assert.ok(body);assert.equal(sha(body[1]),match[2]);
  }
  assert.doesNotMatch(patch.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g,''),/^\s*(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|CREATE TABLE|UPDATE yawrd\.)/m);
  assert.match(patch,/BETWEEN 0 AND a.output_token_limit/);assert.match(patch,/NEW\.deadline_at:=NEW\.reserved_at\+interval '270 seconds'/);
  for(const step of JSON.parse(read('docs/releases/production-beta-r2/schema-manifest.json')).steps)assert.equal(sha(read(step.path)),step.sha256);
});
test('disposable PostgreSQL proves persisted budgets, historical compatibility, owner/payment denial, terminal claims and unchanged ACLs', {skip:!socket?'No authorized local disposable PostgreSQL socket available':false},()=>{
  assert.match(socket!,/^\/tmp\/yawrd-r42c-disposable-[a-zA-Z0-9_-]+\/socket$/);
  const result=execFileSync('psql',['-X','-w','-h',socket!,'-U','r42c_owner','-d','neondb','-v','ON_ERROR_STOP=1'],{
    input:script(),encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,
    env:{NODE_ENV:'test',PATH:process.env.PATH,PGAPPNAME:'yawrd-r42c-disposable'},stdio:['pipe','pipe','pipe']});
  assert.match(result,/CREATE FUNCTION/);
});
