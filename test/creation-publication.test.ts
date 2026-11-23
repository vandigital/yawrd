import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PublicationRepository } from '../src/creation/publication-repository.ts';
import { publicationDatabaseUrl } from '../src/creation/publication-database.ts';
import { publicationText } from '../src/creation/publication.ts';
import { publicGeneralizedYawrd, discoverGeneralizedYawrds } from '../src/creation/publication-public.ts';
import { serializeNep413 } from '../src/identity/nep413.ts';
import type { IdentityChallenge, IdentityProof } from '../src/identity/types.ts';
import type { Query } from '../src/participants/database.ts';
import { preparationView } from './fixtures/preparation.ts';
import type { PublicationReview } from '../src/creation/publication.ts';
import { GET as participantGet, POST as participantPost } from '../app/api/yawrd/[projectId]/[action]/route.ts';

const id='yawrd-aaaaaaaaaaaa', account='founder.testnet', origin='https://yawrd.example', hash='a'.repeat(64);
// Ephemeral generated test key. Never reads wallet material.
function keypair() {
  const pair=generateKeyPairSync('ed25519'), bytes=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32);
  let n=BigInt('0x'+bytes.toString('hex')), encoded='';
  while(n){encoded='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Number(n%BigInt(58))]+encoded;n/=BigInt(58);}
  for(const b of bytes){if(b)break;encoded='1'+encoded;}
  return {privateKey:pair.privateKey,publicKey:'ed25519:'+encoded};
}
const pair=keypair();
function proof(c:IdentityChallenge, key=pair): IdentityProof {
  return {accountId:c.accountId,publicKey:key.publicKey,signature:sign(null,createHash('sha256').update(serializeNep413(c.message,Buffer.from(c.nonce,'base64'),c.recipient)).digest(),key.privateKey).toString('base64')};
}
/** Offline protocol/storage model. Does NOT certify PostgreSQL execution or privileges. */
function harness() {
  const binding=preparationView(hash).binding;
  const source:PublicationReview['source']={binding,governanceRevision:1,configurationSource:{contributionRevision:1,contributionDigest:'b'.repeat(64),preparationRevision:1,preparationDigest:'c'.repeat(64)},publicName:'Reviewed title',publicDescription:'Reviewed overview',profileSource:{revision:1,digest:'c'.repeat(64),nameField:'blueprint.title',descriptionField:'blueprint.summary'}};
  const payload:PublicationReview['proposed']={name:source.publicName,description:source.publicDescription,fundingPlan:'none-planned',progress:{accepted:null,planned:0},tasks:[]};
  let now=1000000, changed=false, session=hash, rpcFailure=false, checked=0,writes=0;
  const tickets=new Map<string,{challenge:IdentityChallenge;sourceText:string;payloadText:string;published:boolean}>();
  let receipt:unknown=null, publishedTicket:string|null=null;
  const calls:string[]=[];
  const query:Query=async(sql,args=[])=>{
    calls.push(sql);
    if(sql.startsWith('SELECT current_user'))return [{role:'yawrd_publication_writer',allowed:true}];
    if(args[0]!==session)throw {code:'P0001',message:'sign_in_required'};
    if(args[2]!==account)throw {code:'P0001',message:'creation_not_found'};
    if(sql.includes('publication.issue')){
      const c=JSON.parse(String(args[3]));tickets.set(c.id,{challenge:c,sourceText:String(args[4]),payloadText:String(args[5]),published:false});return [];
    }
    if(sql.includes('publication.ticket'))return [{ticket:structuredClone(tickets.get(String(args[3])))}];
    if(sql.includes('publication.receipt'))return [{receipt}];
    if(sql.includes('publication.publish')){
      if(changed)throw {code:'P0001',message:'launch_source_changed'};
      if(publishedTicket && publishedTicket!==args[3])throw {code:'P0001',message:'launch_already_published'};
      if(!receipt){writes++;publishedTicket=String(args[3]);receipt={creationId:id,url:'/yawrd/'+id,publishedAt:'2026-11-23T00:00:00Z'};tickets.get(publishedTicket)!.published=true;}
      return [{receipt}];
    }
    throw Error('Unexpected SQL');
  };
  const repo=new PublicationRepository(query,async(a,k)=>{checked++;assert.equal(a,account);if(rpcFailure||k!==pair.publicKey)throw Error('unauthorized_key');return {blockHeight:42,blockHash:'B'.repeat(43)};},()=>now);
  return {repo,query,source,payload,tickets,calls,setTime:(n:number)=>now=n,change:()=>changed=true,revoke:()=>session='',failRpc:()=>rpcFailure=true,
    counts:()=>({checked,writes}),issue:()=>repo.issue(hash,id,account,origin,{source,proposed:payload}),
    publish:(c:IdentityChallenge,p=proof(c),a=account,o=origin)=>repo.publish(hash,id,a,o,c.id,p)};
}

test('founder publication verifies a fresh NEP-413 signature and records one receipt via the isolated SQL model',async()=>{
  const h=harness(),c=await h.issue();
  assert.equal(c.recipient,'Yawrd publication consent');assert.match(c.message,/Public payload SHA-256: [a-f0-9]{64}/);
  assert.match(c.message,/Applications, task participation, repository access, rewards and payments remain inactive/);
  const r=await h.publish(c);assert.equal(r.url,'/yawrd/'+id);assert.deepEqual(await h.repo.receipt(hash,id,account),r);
  assert.deepEqual(h.counts(),{checked:1,writes:1});
  assert.ok(h.calls.every(s=>s.startsWith('SELECT ')));assert.ok(h.calls.every(s=>!s.includes('INSERT INTO yawrd.projects')));
});
test('forged sessions and SQL review flags cannot replace a valid founder signature or authorized current key',async()=>{
  const h=harness(),c=await h.issue(),attacker=keypair();
  await assert.rejects(h.publish(c,{...proof(c),signature:Buffer.alloc(64).toString('base64')}),/invalid_signature/);
  await assert.rejects(h.publish(c,proof(c,attacker)),/unauthorized_key/);
  assert.equal(h.counts().writes,0);
});
test('substitution of payload, source, recipient, nonce, account or origin never records publication',async()=>{
  for(const field of ['payload','source','recipient','nonce'] as const){
    const h=harness(),c=await h.issue(),signed=proof(c),t=h.tickets.get(c.id)!;
    if(field==='payload')t.payloadText=publicationText({...h.payload,name:'Substitution'});
    if(field==='source')t.sourceText=publicationText({...h.source,governanceRevision:2});
    if(field==='recipient')t.challenge.recipient='Yawrd participant sign-in';
    if(field==='nonce')t.challenge.nonce=Buffer.alloc(32).toString('base64');
    await assert.rejects(h.publish(c,signed));assert.equal(h.counts().writes,0);
  }
  const h=harness(),c=await h.issue();
  await assert.rejects(h.publish(c,{...proof(c),accountId:'other.testnet'}),/wrong_account/);
  await assert.rejects(h.publish(c,proof(c),'other.testnet'),/creation_not_found/);
  await assert.rejects(h.publish(c,proof(c),account,'https://other.example'),/launch_challenge_required/);
});
test('a sign-in signature cannot serve as publication consent',async()=>{
  const h=harness(),c=await h.issue();
  const signin={...c,message:'Sign in to Yawrd for one hour.',recipient:'Yawrd participant sign-in'};
  await assert.rejects(h.publish(c,proof(signin)),/invalid_signature/);assert.equal(h.counts().writes,0);
});
test('expiry before and after RPC, unavailable keys, session revocation and late source changes fail closed',async()=>{
  const expired=harness(),c=await expired.issue();expired.setTime(c.expiresAt);await assert.rejects(expired.publish(c),/launch_challenge_expired/);
  const late=harness(),d=await late.issue();
  let now=d.issuedAt, rpcCalls=0;
  const slow=new PublicationRepository(late.query,async()=>{rpcCalls++;now=d.expiresAt;return {blockHeight:42,blockHash:'B'.repeat(43)};},()=>now);
  await assert.rejects(slow.publish(hash,id,account,origin,d.id,proof(d)),/launch_challenge_expired/);assert.equal(rpcCalls,1);
  for(const change of ['revoke','change','failRpc'] as const){const h=harness(),c=await h.issue();h[change]();await assert.rejects(h.publish(c));assert.equal(h.counts().writes,0);}
});
test('lost-response, expired exact retries and simultaneous identical requests preserve the first publication',async()=>{
  const h=harness(),c=await h.issue(),p=proof(c);
  const [a,b]=await Promise.all([h.publish(c,p),h.publish(c,p)]);assert.deepEqual(a,b);
  h.setTime(c.expiresAt+1);assert.deepEqual(await h.publish(c,p),a);assert.equal(h.counts().writes,1);
  const d=await h.issue();await assert.rejects(h.publish(d),/launch_already_published/);assert.equal(h.counts().writes,1);
});
test('database configuration requires the isolated writer login and the confirmed same Neon target',()=>{
  const base={DATABASE_URL:'postgresql://yawrd_07b_runtime:synthetic@ep-test.neon.tech/neondb?sslmode=require',YAWRD_DEV_DATABASE_ENDPOINT:'ep-test',YAWRD_PUBLICATION_DATABASE_ENDPOINT:'ep-test'};
  assert.throws(()=>publicationDatabaseUrl({...base,YAWRD_PUBLICATION_DATABASE_ENDPOINT:undefined}));
  const writer='postgresql://yawrd_publication_writer:synthetic@ep-test-pooler.neon.tech/neondb?sslmode=require';
  assert.equal(publicationDatabaseUrl({...base,YAWRD_PUBLICATION_DATABASE_URL:writer}),writer);
  for(const url of [undefined,base.DATABASE_URL,writer.replace('ep-test-pooler','ep-other'),writer.replace('/neondb','/other'),writer.replace('yawrd_publication_writer','neondb_owner')])
    assert.throws(()=>publicationDatabaseUrl({...base,YAWRD_PUBLICATION_DATABASE_URL:url}));
});
test('public route/discovery adapter returns only the protected public projection and omits private extras',async()=>{
  const h=harness(),calls:string[]=[];
  const query:Query=async sql=>{calls.push(sql);return [{id,creator_account_id:account,payload:{...h.payload,privateNotes:'PRIVATE',binding:h.source.binding},evidence:'PRIVATE'}];};
  const p=await publicGeneralizedYawrd(query,id);assert.deepEqual(p,{id,creatorAccountId:account,payload:h.payload});
  assert.deepEqual(await discoverGeneralizedYawrds(query),[p]);assert.doesNotMatch(JSON.stringify(p),/PRIVATE|binding|evidence|privateNotes/);
  assert.equal(await publicGeneralizedYawrd(query,'yaw-001'),null);
  assert.ok(calls.every(s=>s.includes('FROM yawrd_publication.public_yawrds')&&!s.includes('creation_')));
  assert.equal(await publicGeneralizedYawrd(async()=>{throw {code:'42P01'};},id),null);
  await assert.rejects(publicGeneralizedYawrd(async()=>{throw {code:'42501'};},id));
});
test('generalized participant, contribution and payout APIs remain closed for every action and method',async()=>{
  for(const action of ['apply','contributions','reward-payout','view'])for(const method of ['GET','POST']){
    const r=await (method==='GET'?participantGet:participantPost)(new Request(origin,{method}),{params:Promise.resolve({projectId:id,action})});
    assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'participation_closed'});
  }
});
test('unapplied SQL seals publication evidence from the old shared-role forgery path and compares current sources atomically',()=>{
  const sql=readFileSync(new URL('../docs/proposals/migrations/phase2_creation_publication.sql',import.meta.url),'utf8');
  assert.match(sql,/UNAPPLIED PROPOSAL/);assert.doesNotMatch(sql,/ep-[a-z0-9]|founder\.testnet|CREATE ROLE|PASSWORD\s+[\'"]|INSERT INTO yawrd\.projects/i);
  assert.match(sql,/REVOKE ALL ON ALL FUNCTIONS IN SCHEMA yawrd_publication FROM PUBLIC,yawrd_07b_runtime,yawrd_publication_writer/);
  assert.match(sql,/REVOKE ALL ON ALL TABLES IN SCHEMA yawrd_publication FROM PUBLIC,yawrd_07b_runtime,yawrd_publication_writer/);
  assert.match(sql,/GRANT SELECT ON yawrd_publication.public_yawrds TO yawrd_07b_runtime/);
  assert.match(sql,/SECURITY DEFINER SET search_path=pg_catalog,pg_temp/g);
  assert.match(sql,/IN SHARE MODE/);assert.match(sql,/ctx->'source' IS DISTINCT FROM t.source_text::jsonb/);
  assert.match(sql,/ctx->'payload' IS DISTINCT FROM t.payload_text::jsonb/);
  assert.match(sql,/creation_id text PRIMARY KEY/);assert.match(sql,/publication_receipt_immutable/);
  const grants=sql.split('\n').filter(l=>l.startsWith('GRANT '));
  assert.ok(grants.every(l=>l.startsWith('GRANT USAGE ON SCHEMA')||l.startsWith('GRANT SELECT ON yawrd_publication.public_yawrds')||l.startsWith('GRANT EXECUTE ON FUNCTION')));
});
