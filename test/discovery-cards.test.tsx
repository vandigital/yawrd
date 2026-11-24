// R3.8: offline public projections and rendering only; no database or live records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiscoveryCarousel, sortDiscoveryProjects, type DiscoveryProject } from '../app/components/discovery-carousel.tsx';
import { discoverGeneralizedYawrds, publicGeneralizedYawrd } from '../src/creation/publication-public.ts';
import { publicWordWakeRow } from './fixtures/wordwake-public.ts';
import type { Query } from '../src/participants/database.ts';

const card=(id:string,fields:Partial<DiscoveryProject>={}):DiscoveryProject=>({id,name:id,description:'Public project summary',image:'/landing/build-progress.webp',lifecycle:'active',...fields});
const ids=(rows:DiscoveryProject[])=>rows.map(p=>p.id);

test('active publications sort newest first; completed entries sort last by completion then publication',()=>{
  const input=[card('completed-published',{lifecycle:'completed',publishedAt:'2026-11-20T00:00:00Z'}),
    card('active-old',{publishedAt:'2026-11-16T00:00:00Z'}),card('active-new',{publishedAt:'2026-11-25T00:00:00Z'}),
    card('completed-recent',{lifecycle:'completed',completedAt:'2026-11-24T00:00:00Z',publishedAt:'2026-11-01T00:00:00Z'})];
  const original=ids(input);
  assert.deepEqual(ids(sortDiscoveryProjects(input)),['active-new','active-old','completed-recent','completed-published']);
  assert.deepEqual(ids(input),original,'caller array is unchanged');
});

test('missing/invalid legacy timestamps stay deterministic without invented dates',()=>{
  const input=[card('legacy-z'),card('legacy-a',{publishedAt:'bad'}),card('known',{publishedAt:'2026-11-20T00:00:00Z'}),
    card('tie-z',{publishedAt:'2026-11-19T00:00:00Z'}),card('tie-a',{publishedAt:'2026-11-19T00:00:00Z'}),
    card('done-z',{lifecycle:'completed'}),card('done-a',{lifecycle:'completed'}),
    card('done-known',{lifecycle:'completed',completedAt:'bad',publishedAt:'2026-11-18T00:00:00Z'})];
  assert.deepEqual(ids(sortDiscoveryProjects(input)),['known','tie-a','tie-z','legacy-a','legacy-z','done-known','done-a','done-z']);
  assert.equal(input[0].publishedAt,undefined);
});

test('cards expose only lifecycle metadata and truthful reviewed reward text, retaining artwork and routes',()=>{
  const html=renderToStaticMarkup(<DiscoveryCarousel projects={[
    card('yaw-001',{name:'Build Progress',lifecycle:'completed'}),
    card('yaw-002',{name:'WordWake',reward:{amount:'2',currency:'Testnet NEAR'}}),
    card('yawrd-aaaaaaaaaaaa',{name:'Synthetic public project'})]}/>);
  const articles=[...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map(m=>m[1]);
  assert.equal(articles.length,3);
  const text=articles.map(a=>a.replace(/<[^>]+>/g,'')).join(' ');
  assert.doesNotMatch(text,/YAW-001|YAW-002|YAWRD-|Published|Applications|Join|activated/);
  assert.equal((text.match(/Active/g)||[]).length,2);assert.equal((text.match(/Completed/g)||[]).length,1);
  assert.match(text,/Rewards: 2 Testnet NEAR/);assert.equal((text.match(/Rewards: Not set/g)||[]).length,2);
  for(const path of ['/yawrd/yaw-001','/yawrd/yaw-002','/yawrd/yawrd-aaaaaaaaaaaa'])assert.ok(html.includes(`href="${path}"`));
  assert.equal((html.match(/src="\/landing\/build-progress.webp"/g)||[]).length,3);
  assert.equal(renderToStaticMarkup(<DiscoveryCarousel projects={[]}/>),'');
});

const payload={name:'Synthetic published Yawrd',description:'Public summary only',fundingPlan:'none-planned',progress:{accepted:null,planned:0},tasks:[]};
test('Discover carries the persisted publication instant; the project-page projection stays unchanged',async()=>{
  for(const value of [new Date('2026-11-24T03:04:05.678Z'),'2026-11-24T11:04:05.678+08:00',undefined,'not-a-date']){
    const statements:string[]=[];
    const query:Query=async(sql)=>{statements.push(sql);return [{id:'yawrd-aaaaaaaaaaaa',creator_account_id:'synthetic.testnet',payload,published_at:value,privateNotes:'PRIVATE'}];};
    const rows=await discoverGeneralizedYawrds(query);
    assert.equal(rows[0].publishedAt,value instanceof Date||typeof value==='string'&&value!=='not-a-date'?'2026-11-24T03:04:05.678Z':null);
    assert.match(statements[0],/SELECT id,creator_account_id,payload,published_at FROM yawrd_publication.public_yawrds ORDER BY published_at DESC,id LIMIT 100/);
    const page=await publicGeneralizedYawrd(query,'yawrd-aaaaaaaaaaaa');assert.ok(page);assert.equal(Object.hasOwn(page,'publishedAt'),false);
    assert.doesNotMatch(JSON.stringify(rows),/PRIVATE|privateNotes/);
  }
});

// The real homepage/WordWake reward validator run against a query double, never Neon.
const host=globalThis as typeof globalThis&{__r38Query:Query};
registerHooks({resolve(specifier,context,next){
  if(specifier==='next/image')return {url:'data:text/javascript,export default function Image(){return null}',shortCircuit:true};
  return next(specifier,context);
},load(url,context,next){
  if(url===new URL('../src/participants/database.ts',import.meta.url).href)
    return {format:'module',shortCircuit:true,source:'export const database=(...args)=>globalThis.__r38Query(...args);'};
  return next(url,context);
}});
const {default:LandingPage}=await import('../app/page.tsx');

test('homepage preserves Production eligibility and reviewed WordWake rewards alongside generalized publications',async()=>{
  let denyRewards=false,empty=false;const statements:string[]=[];
  host.__r38Query=async(sql,params=[])=>{
    statements.push(sql);assert.doesNotMatch(sql,/\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
    if(empty)return [];
    if(sql.startsWith('SELECT id,published_at FROM yawrd.projects')){
      for(const guard of ["network='testnet'","id='yaw-001'","creator_account_id='yawrd1.testnet'","dao_account_id='demo.factory.yawrd.testnet'",'published_at IS NOT NULL'])assert.ok(sql.includes(guard));
      return [{id:'yaw-001',published_at:new Date('2026-11-01T00:00:00Z')}];
    }
    if(sql.includes('FROM yawrd.projects p JOIN yawrd.reviewed_project_packages')){
      assert.deepEqual(params,['yaw-002','yawrd1.testnet','wordwake-build.factory.yawrd.testnet','yaw-002-wordwake-ww-v1-r1','1643a35631c87af8882134e23692fbdd862d0d62246eef064db8a1e57b8255f0','ww-v1']);
      for(const guard of ['p.published_at IS NOT NULL','review.snapshot_sha256=pkg.snapshot_sha256','pkg.founder_account_id=p.creator_account_id'])assert.ok(sql.includes(guard));
      return [{...publicWordWakeRow(),snapshot_sha256:'c'.repeat(64)}];
    }
    if(sql.includes('FROM yawrd.wordwake_reward_plans')){
      assert.equal(params[0],'c'.repeat(64));
      if(denyRewards)throw Error('Synthetic unavailable reward evidence');
      return [{revision:1,total:'2000000000000000000000000',t1:'1000000000000000000000000',t2:'1000000000000000000000000'}];
    }
    if(sql.includes('FROM yawrd_publication.public_yawrds'))return [
      {id:'yawrd-aaaaaaaaaaaa',creator_account_id:'synthetic.testnet',payload,published_at:new Date('2026-11-24T00:00:00Z'),balance:'999999',fee:'0.5'},
      {id:'yawrd-bbbbbbbbbbbb',creator_account_id:'synthetic.testnet',payload:{...payload,name:'Earlier public Yawrd',fundingPlan:'unresolved'},published_at:'2026-11-17T00:00:00Z'}];
    assert.fail('Unexpected query: '+sql);
  };
  const html=renderToStaticMarkup(await LandingPage());
  const routes=[...html.matchAll(/href="(\/yawrd\/[^"#]+)"/g)].map(m=>m[1]);
  assert.deepEqual(routes,['/yawrd/yawrd-aaaaaaaaaaaa','/yawrd/yawrd-bbbbbbbbbbbb','/yawrd/yaw-002','/yawrd/yaw-001']);
  assert.match(html,/Rewards: 2 Testnet NEAR/);assert.equal((html.match(/Rewards: Not set/g)||[]).length,3);
  assert.doesNotMatch(html,/999999|Rewards: 0\.5|Rewards: 0 /);
  denyRewards=true;const unavailable=renderToStaticMarkup(await LandingPage());
  assert.ok(unavailable.includes('WordWake'));assert.equal((unavailable.match(/Rewards: Not set/g)||[]).length,4);
  empty=true;assert.doesNotMatch(renderToStaticMarkup(await LandingPage()),/id="discover"/);
});
