// Real CSS/layout in Chromium; synthetic project only, no wallet, RPC or database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { registerHooks } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { GENESIS_YAW_001 } from '../src/genesis/yaw-001.ts';
import { publicWordWake } from '../src/launch/wordwake-public.ts';
import { publicWordWakeRow } from './fixtures/wordwake-public.ts';
import type { ProposedYawrdPreview } from '../src/creation/yawrd-preview.ts';

const require=createRequire(import.meta.url);
test('all public project types share compact responsive heroes and uniform Discover covers', {timeout:90000}, async()=>{
  const hook=registerHooks({load(url,context,next){
    if(url.endsWith('.module.css')){
      const prefix=basename(new URL(url).pathname,'.module.css').replaceAll('-','_')+'__';
      return {format:'module',shortCircuit:true,source:'export default new Proxy({}, {get:(_,key)=>'+JSON.stringify(prefix)+'+key});'};
    }
    return next(url,context);
  }});
  const {GenesisProjectPresentation}=await import('../app/components/genesis-project.tsx');
  const {WordWakeProjectPresentation}=await import('../app/components/wordwake-project.tsx');
  const {YawrdIdentityPresentation}=await import('../app/components/yawrd-identity-presentation.tsx');
  const {DiscoveryCarousel}=await import('../app/components/discovery-carousel.tsx');
  const temporary=await mkdtemp('/tmp/yawrd-r37-presentation-');
  const synthetic:ProposedYawrdPreview={name:'Synthetic community workshop',description:'A synthetic public project for responsive presentation verification.',
    fundingPlan:'none-planned',progress:{accepted:null,planned:1},tasks:[{id:'T1',title:'First synthetic deliverable',summary:'A synthetic public summary.',
      dependencies:[],deliverables:['Synthetic guide'],allocation:'unallocated',rewardTerms:'undecided'}]};
  const wordwake=(await publicWordWake(async()=>[publicWordWakeRow()]))!;
  const pages={genesis:renderToStaticMarkup(<GenesisProjectPresentation project={{...GENESIS_YAW_001,objectives:[...GENESIS_YAW_001.objectives]}}/>),
    wordwake:renderToStaticMarkup(<WordWakeProjectPresentation project={wordwake}/>),
    generalized:renderToStaticMarkup(<YawrdIdentityPresentation project={synthetic} creatorAccountId="synthetic-founder.testnet"/>)};
  const cards=renderToStaticMarkup(<DiscoveryCarousel projects={[
    {id:'yaw-001',name:'Build Progress',description:'Completed Genesis work.',status:'Completed · Applications closed',lifecycle:'completed',image:'/landing/build-progress.webp'},
    {id:'yaw-002',name:'WordWake',description:'Reviewed WordWake plan.',status:'Join applications open · Tasks not activated',lifecycle:'actionable',image:'/landing/build-progress.webp'},
    {id:'yawrd-aaaaaaaaaaaa',name:synthetic.name,description:synthetic.description,status:'Published · Applications closed',lifecycle:'planned',image:'/landing/build-progress.webp'}]}/>);
  const utility=(await require('postcss')([require('@tailwindcss/postcss')()]).process(await readFile('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css;
  // Match the CSS Module class mapping used by the offline loader above.
  const css=await Promise.all(['project-space-shell','genesis-project','yawrd-identity-presentation','discovery-carousel'].map(async name=>{
    const parsed=require('postcss').parse(await readFile('app/components/'+name+'.module.css','utf8'));
    const prefix=name.replaceAll('-','_')+'__';
    parsed.walkRules((rule:any)=>{if(rule.parent?.type==='atrule' && /keyframes/.test(rule.parent.name))return;
      rule.selector=rule.selector.replace(/\.([_a-zA-Z][\w-]*)/g,(_:string,key:string)=>'.'+prefix+key);});
    return parsed.toString();
  }));
  const server=createServer(async(req,res)=>{
    if(req.url?.startsWith('/brand/')||req.url?.startsWith('/landing/')){
      const path=String(req.url);if(!['/brand/yawrd-buoy.webp','/landing/build-progress.webp'].includes(path)){res.statusCode=404;res.end();return;}
      res.setHeader('content-type','image/webp');res.end(await readFile('public'+path));return;
    }
    const key=req.url?.slice(1) as keyof typeof pages;
    if(!Object.hasOwn(pages,key)){res.statusCode=404;res.end();return;}
    res.setHeader('content-type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${utility}\n${css.join('\n')}\nbody{background:#001819;color:#e8f3f0}.review{max-width:1240px;margin:auto;padding:16px;min-width:0}</style></head><body><main class="review"><div class="project">${pages[key]}</div><div id="cards">${cards}</div></main><script>
    addEventListener('load',()=>{
      const measure=selector=>[...document.querySelectorAll(selector)].map(e=>Math.round(e.getBoundingClientRect().height));
      const result={width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,compact:!!document.querySelector('.project_space_shell__shell.project_space_shell__compact'),
        heroHeight:measure('.project_space_shell__hero')[0],bannerHeights:measure('#cards .discovery_carousel__banner'),cardHeights:measure('#cards .discovery_carousel__card'),
        bannerArtwork:[...document.querySelectorAll('#cards .discovery_carousel__banner')].map(e=>e.innerHTML),
        cardOrder:[...document.querySelectorAll('#cards .discovery_carousel__card a')].map(a=>a.getAttribute('href')),
        missingAnchors:[...document.querySelectorAll('.project_space_shell__anchorNav a')].filter(a=>!document.querySelector(a.getAttribute('href'))).map(a=>a.getAttribute('href'))};
      // ParticipantPanel renders this target separately on persisted pages.
      result.missingAnchors=result.missingAnchors.filter(h=>h!=='#crew-title');
      const out=document.createElement('pre');out.id='result';out.textContent=JSON.stringify(result);document.body.append(out);
    });</script></body></html>`);
  });
  let browser:ReturnType<typeof spawn>|undefined,ws:WebSocket|undefined,sequence=0;
  const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
  function call(method:string,params:object={}):Promise<any>{return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});ws!.send(JSON.stringify({id,method,params}));});}
  try{
    await new Promise<void>((ready,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',ready);});
    const address=server.address();assert.ok(address&&typeof address==='object');
    browser=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--disable-extensions','--disable-background-networking',
      '--disable-component-update','--no-first-run','--no-default-browser-check','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--user-data-dir='+temporary+'/profile','--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
    let port=0;
    for(let i=0;i<150;i++){try{port=Number((await readFile(temporary+'/profile/DevToolsActivePort','utf8')).split('\n')[0]);break;}catch{await delay(30);}}
    assert.ok(port,'offline Chromium started');
    const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws=new WebSocket(tabs.find((tab:any)=>tab.type==='page').webSocketDebuggerUrl);
    await new Promise<void>(ready=>ws!.addEventListener('open',()=>ready(),{once:true}));
    ws.addEventListener('message',event=>{const msg=JSON.parse(String(event.data));if(msg.id){const job=pending.get(msg.id);if(job){pending.delete(msg.id);msg.error?job.reject(Error(msg.error.message)):job.resolve(msg.result);}}});
    await call('Page.enable');await call('Runtime.enable');
    const measurements=[];
    for(const key of Object.keys(pages))for(const width of [390,1440]){
      const screenshot=`/tmp/yawrd-r37-${key}-${width}.png`;
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
      await call('Page.navigate',{url:'http://127.0.0.1:'+address.port+'/'+key});
      let result:any;
      for(let i=0;i<150;i++){
        const evaluated=await call('Runtime.evaluate',{expression:"document.getElementById('result')?.textContent",returnByValue:true});
        if(evaluated.result.value){result=JSON.parse(evaluated.result.value);break;}await delay(30);
      }
      assert.ok(result,key+' layout result');assert.equal(result.width,width,'actual viewport matches requested width');
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
      await writeFile(screenshot,Buffer.from(shot.data,'base64'));
      if(key==='generalized'){
        const box=await call('Runtime.evaluate',{expression:"(()=>{const r=document.getElementById('cards').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()",returnByValue:true});
        const coverShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:box.result.value});
        await writeFile(`/tmp/yawrd-r37-discover-${width}.png`,Buffer.from(coverShot.data,'base64'));
      }
      assert.equal(result.compact,true);assert.equal(result.overflow,false,key+' '+width);
      assert.ok(result.heroHeight<340,key+' compact hero height');
      assert.equal(new Set(result.bannerArtwork).size,1,'all project types use the same branded cover');
      assert.ok(result.bannerArtwork.every((art:string)=>art.includes('<img')&&art.includes('/landing/build-progress.webp')));
      assert.deepEqual(result.bannerHeights,Array(3).fill(width<500?112:144));assert.equal(new Set(result.cardHeights).size,1);
      assert.deepEqual(result.cardOrder,['/yawrd/yaw-002','/yawrd/yawrd-aaaaaaaaaaaa','/yawrd/yaw-001']);
      assert.deepEqual(result.missingAnchors,[]);measurements.push({project:key,requestedWidth:width,screenshot,...result});
    }
    await writeFile('/tmp/yawrd-r37-presentation-results.json',JSON.stringify(measurements,null,2)+'\n');
  }finally{hook.deregister();ws?.close();if(browser&&browser.exitCode===null){const exited=new Promise(done=>browser!.once('exit',done));browser.kill('SIGKILL');await exited;}await new Promise<void>(done=>server.close(()=>done()));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
