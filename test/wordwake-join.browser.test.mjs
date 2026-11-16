// Exercise the existing hydrated participation UI through a temporary localhost
// fixture page. It is created exclusively, guarded, and removed after the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, unlink, rmdir, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { publicWordWake } from '../src/launch/wordwake-public.ts';
import { publicWordWakeRow } from './fixtures/wordwake-public.ts';
import { GENESIS_YAW_001 } from '../src/genesis/yaw-001.ts';

test('C5 Join UI: anonymous viewing, application consent, pending, founder decisions and private information', {timeout:150000},async()=>{
  const origin='http://localhost:4317',dir=await mkdtemp('/tmp/yawrd-c5-join-'),slug='c5-join-fixture-'+Date.now();
  const fixtureDir='app/dev/'+slug,fixturePath=fixtureDir+'/page.tsx';
  const project=await publicWordWake(async()=>[publicWordWakeRow()]);
  project.rewardPlan={revision:1,total:'2',T1:'1',T2:'1'};
  const empty={accountId:null,role:'public',application:null,applications:[],restrictedContent:null};
  await mkdir(fixtureDir);await writeFile(fixturePath,`import {notFound} from 'next/navigation';
import {headers} from 'next/headers';
import {PersistedYawrdPresentation} from '../../components/persisted-yawrd';
import styles from '../../create/create.module.css';
export const dynamic='force-dynamic';
export default async function Fixture({searchParams}){if(process.env.NODE_ENV!=='development'||(await headers()).get('host')!=='localhost:4317')notFound();return <main className={styles.page}><div className={styles.container}><PersistedYawrdPresentation project={(await searchParams).reference==='genesis'?${JSON.stringify({...GENESIS_YAW_001,objectives:[...GENESIS_YAW_001.objectives]})}:${JSON.stringify(project)}} view={${JSON.stringify(empty)}}/></div></main>;}`,{flag:'wx'});
  let server,serverLog='';
  try{await fetch(origin+'/create',{signal:AbortSignal.timeout(1000)});}catch{
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','localhost','--port','4317'],{stdio:['ignore','pipe','pipe']});
    server.stdout.on('data',data=>{serverLog=(serverLog+data).slice(-12000);});server.stderr.on('data',data=>{serverLog=(serverLog+data).slice(-12000);});
  }
  let browser,ws,seq=0,role='public',applyPosts=0,reviewPosts=0;
  const pending=new Map(),unexpected=[];
  const applications=[{id:'11111111-1111-4111-8111-111111111111',accountId:'crew-one.testnet',introduction:'I can help with the puzzle engine.',status:'pending',reviewerAccountId:null},
    {id:'22222222-2222-4222-8222-222222222222',accountId:'crew-two.testnet',introduction:'I can help with the player.',status:'pending',reviewerAccountId:null}];
  let applied=false;
  const state=()=>role==='creator'?{...empty,accountId:project.creatorAccountId,role:'creator',applications:applied?applications:[],restrictedContent:'PRIVATE CREW INFORMATION'}
    :role==='applicant'?{...empty,accountId:'crew-one.testnet',role:applied&&applications[0].status==='approved'?'participant':'public',application:applied?applications[0]:null,restrictedContent:applied&&applications[0].status==='approved'?'PRIVATE CREW INFORMATION':null}:empty;
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},15000);timer.unref();pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async expression=>{for(let i=0;i<300;i++){if(await evaluate('Boolean('+expression+')'))return;await delay(40);}assert.fail('Timed out '+expression+'; '+await evaluate('document.body.innerText.slice(-1500)'));};
  const click=label=>evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
  const text=()=>evaluate('document.body.innerText');
  try{
    let ready=false;for(let i=0;i<120;i++){try{const r=await fetch(origin+'/dev/'+slug,{signal:AbortSignal.timeout(1000)});if(r.ok){ready=true;break;}}catch{}await delay(250);}assert.ok(ready,serverLog);
    browser=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--disable-extensions','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+dir,'about:blank'],{stdio:'ignore'});
    let port;for(let i=0;i<150;i++){try{port=(await readFile(dir+'/DevToolsActivePort','utf8')).split('\n')[0];break;}catch{await delay(40);}}assert.ok(port);
    const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}}
      if(m.method==='Fetch.requestPaused')void(async()=>{
        const {requestId,request}=m.params,u=new URL(request.url);
        if(u.origin!==origin){await call('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});return;}
        if(!u.pathname.startsWith('/api/')){await call('Fetch.continueRequest',{requestId});return;}
        let body,status=200;
        if(u.pathname==='/api/yawrd/yaw-002/state')body=state();
        else if(u.pathname==='/api/yawrd/yaw-002/apply'){
          applyPosts++;const d=JSON.parse(request.postData);assert.equal(role,'applicant');assert.equal(d.consent,true);assert.ok(d.introduction.trim());assert.deepEqual(Object.keys(d).sort(),['consent','introduction']);applied=true;body=state();
        }else if(u.pathname==='/api/yawrd/yaw-002/review'){
          reviewPosts++;assert.equal(role,'creator');const d=JSON.parse(request.postData),a=applications.find(a=>a.id===d.applicationId);assert.equal(a.status,'pending');a.status=d.decision;a.reviewerAccountId=project.creatorAccountId;body=state();
        }else if(u.pathname==='/api/auth/session')body={accountId:state().accountId};
        else{unexpected.push(u.pathname);status=503;body={error:'unexpected'};}
        await call('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
      })().catch(e=>unexpected.push(e.message));
    });
    await call('Page.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]});
    const metrics=[];
    for(const [label,suffix,heading] of [['genesis','?reference=genesis','Build Progress'],['wordwake','','WordWake']]) {
      await call('Page.navigate',{url:origin+'/dev/'+slug+suffix});
      await wait(`document.querySelector('h1')?.textContent===${JSON.stringify(heading)}`);
      await wait(`getComputedStyle(document.querySelector('h1')).fontFamily.includes('Georgia')`);
      for(const width of [1440,390]) {
        await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(100);
        const style=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('h1'));return {font:s.fontFamily,size:s.fontSize,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
        assert.equal(style.overflow,false);metrics.push({label,width,...style});
        if(process.env.YAWRD_BROWSER_EVIDENCE_DIR) {
          await mkdir(process.env.YAWRD_BROWSER_EVIDENCE_DIR,{recursive:true});
          const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
          await writeFile(process.env.YAWRD_BROWSER_EVIDENCE_DIR+'/'+label+'-'+width+'.png',Buffer.from(screenshot.data,'base64'));
        }
      }
    }
    for(const width of [1440,390]) {
      const a=metrics.find(m=>m.label==='genesis'&&m.width===width),b=metrics.find(m=>m.label==='wordwake'&&m.width===width);
      for(const property of ['font','size','lineHeight','letterSpacing'])assert.equal(b[property],a[property],property+' at '+width);
    }
    console.log(JSON.stringify({sharedTemplateMetrics:metrics,content:'synthetic public records; actual candidate Next components and CSS'}));
    await wait(`document.body.innerText.includes('Sign in to take part')`);
    await wait(`Object.keys([...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh status')).some(k=>k.startsWith('__reactProps'))`);
    assert.match(await text(),/WordWake/);assert.equal((await text()).split('Approved task reward: 1 Testnet NEAR').length-1,2);assert.match(await text(),/closed to claiming/);assert.doesNotMatch(await text(),/PRIVATE CREW INFORMATION|crew-two.testnet|TASKS.json|SKILL.md/);
    for(const width of [1440,768,390]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await delay(80);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
    role='applicant';await click('Refresh status');await wait(`!!document.querySelector('textarea')`);
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Apply to Join').disabled`),true);
    await evaluate(`const i=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(i,'I can help with the puzzle engine.');i.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('form input[type=checkbox]').click()`);
    await click('Apply to Join');await wait(`document.body.innerText.includes('Application pending')`);assert.equal(applyPosts,1);assert.equal(await evaluate('document.querySelectorAll("textarea").length'),0);assert.doesNotMatch(await text(),/PRIVATE CREW INFORMATION|crew-two.testnet/);
    role='creator';await click('Refresh status');await wait(`document.body.innerText.includes('crew-two.testnet')`);await click('Approve');await wait(`[...document.querySelectorAll('article')].some(a=>a.textContent.includes('crew-one.testnet')&&a.textContent.includes('Reviewed by'))`);await click('Reject');await wait(`document.body.innerText.includes('Rejected')`);assert.equal(reviewPosts,2);
    role='applicant';await click('Refresh status');await wait(`document.body.innerText.includes('Application approved')`);assert.match(await text(),/PRIVATE CREW INFORMATION/);assert.doesNotMatch(await text(),/crew-two.testnet|Apply to Join|Claim task/);
    role='public';await click('Refresh status');await wait(`document.body.innerText.includes('Sign in to take part')`);assert.doesNotMatch(await text(),/PRIVATE CREW INFORMATION|crew-one.testnet|crew-two.testnet/);
    assert.deepEqual(unexpected,[]);console.log(JSON.stringify({applyPosts,reviewPosts,realWrites:0,transport:'hydrated existing participant UI; simulated verified sessions and APIs',temporaryFixtureRemoved:true}));
  }finally{
    ws?.close();if(browser){const exit=new Promise(r=>browser.once('exit',r));browser.kill('SIGKILL');await exit;}
    await unlink(fixturePath);await rmdir(fixtureDir);await delay(300);
    // Next retains generated route validators after an ephemeral page is removed.
    // Delete only this test's unique validator, never the shared development cache.
    const typesDir='.next/dev/types/app/dev/'+slug;
    await unlink(typesDir+'/page.ts').catch(e=>{if(e.code!=='ENOENT')throw e;});
    await rmdir(typesDir).catch(e=>{if(!['ENOENT','ENOTEMPTY'].includes(e.code))throw e;});
    server?.kill('SIGTERM');await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
