// Offline P3.7 journey with real contribution/governance components and global Account.
// Synthetic API records remain in this disposable browser only. All external traffic is blocked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { resolve,relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const require=createRequire(import.meta.url);

test('saved contributions continue to governance; save/reload, stale source, session changes and responsive layout',{timeout:90000},async()=>{
  const temporary=await mkdtemp('/tmp/yawrd-contributions-browser-');
  let server,browser,ws,sequence=0;
  const pending=new Map(),blocked=[],errors=[];
  function call(method,params={}){return new Promise((resolveCall,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},10000);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolveCall(v);},reject});ws.send(JSON.stringify({id,method,params}));
  });}
  async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;}
  async function waitFor(expression){for(let k=0;k<150;k++){if(await evaluate(expression))return;await delay(30);}assert.fail('Browser condition timed out: '+expression);}
  const click=label=>evaluate(`window.clickButton(${JSON.stringify(label)})`);
  try{
    await writeFile(temporary+'/tsx-loader.cjs','const ts=require('+JSON.stringify(require.resolve('typescript'))+');module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;');
    await writeFile(temporary+'/css-loader.cjs',`const path=require('node:path');module.exports=function(){const prefix=path.relative(process.cwd(),this.resourcePath).replace(/[^A-Za-z0-9]/g,'_')+'__';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,key)=>'+JSON.stringify(prefix)+'+key})}';};`);
    const entry=String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import Panel from ${JSON.stringify(resolve('app/create/[id]/contributions/contribution-panel.tsx'))};
import Governance from ${JSON.stringify(resolve('app/create/[id]/governance/governance-panel.tsx'))};
import Blueprint from ${JSON.stringify(resolve('app/create/[id]/blueprint/preparation-panel.tsx'))};
import {NavigationShell} from ${JSON.stringify(resolve('app/components/global-navigation.tsx'))};
import {TestnetWalletProvider,useTestnetWallet} from ${JSON.stringify(resolve('app/use-testnet-wallet.ts'))};
import {preparationView} from ${JSON.stringify(resolve('test/fixtures/preparation.ts'))};
import {initialContributionConfiguration} from ${JSON.stringify(resolve('src/creation/contribution-configuration.ts'))};
window.React=React;window.sessionAccount='founder.testnet';window.audit=[];
window.blueprint=JSON.parse(sessionStorage.getItem('p36-blueprint')||'null')||preparationView('a'.repeat(64));
window.blueprint.versions[0].approval={digest:window.blueprint.versions[0].digest,approvedBy:'founder.testnet',approvedAt:'2026-11-20T00:00:00Z',consentVersion:'creation-preparation-review-v1'};
window.records=JSON.parse(sessionStorage.getItem('p36-configuration')||'null');
window.governance=JSON.parse(sessionStorage.getItem('p37-governance')||'null');
function source(v){return {revision:v.revision,digest:v.digest,title:v.artifacts.blueprint.title,tasks:v.artifacts.tasks,references:v.artifacts.references};}
const persist=()=>{sessionStorage.setItem('p36-configuration',JSON.stringify(window.records));sessionStorage.setItem('p36-blueprint',JSON.stringify(window.blueprint));};
window.derivative=approved=>{const parent=window.blueprint.versions.at(-1),revision=parent.revision+1,digest=String(revision).repeat(64);window.blueprint.versions.push({...structuredClone(parent),revision,parentRevision:parent.revision,digest,origin:'founder-edited',generation:null,authorAccountId:'founder.testnet',approval:approved?{digest,approvedBy:'founder.testnet',approvedAt:'2026-11-20T01:00:00Z',consentVersion:'creation-preparation-review-v1'}:null});persist();};
window.switchSession=account=>{window.sessionAccount=account;window.dispatchEvent(new Event('yawrd:session-changed'));};
window.__nearMock={NearConnector:class{constructor(){this.network='testnet';this.availableWallets=[];this.whenManifestLoaded=Promise.resolve();this.events={};}on(e,f){this.events[e]=f;}off(e){delete this.events[e];}async getConnectedWallet(){throw Error('Disconnected');}}};
window.fetch=async(url,options={})=>{
 const data=options.body?JSON.parse(options.body):null;window.audit.push({url,method:options.method||'GET',data});
 if(url==='/api/auth/session')return Response.json({accountId:window.sessionAccount});
 if(url==='/api/auth/logout'){window.sessionAccount=null;return Response.json({});}
 if(url.endsWith('/preparation')||url.endsWith('/contributions')||url.endsWith('/governance')){
  if(window.sessionAccount!=='founder.testnet')return Response.json({error:window.sessionAccount?'creation_not_found':'sign_in_required'},{status:window.sessionAccount?404:401});
  if(options.headers['x-yawrd-account']!==window.sessionAccount)return Response.json({error:'creation_session_changed'},{status:409});
  if(url.endsWith('/preparation')){if(data)throw Error('No preparation mutation authorized');return Response.json(window.blueprint);}
  if(url.endsWith('/governance')){
   const source={contributionRevision:window.records.revision,contributionDigest:window.records.digest,preparationRevision:window.records.source.revision,preparationDigest:window.records.source.digest};
   if(data){
    if(window.failGovernance)return Response.json({error:'governance_revision_conflict'},{status:409});
    if(data.expectedRevision!==(window.governance?.revision??0)||JSON.stringify(data.source)!==JSON.stringify(source))return Response.json({error:'governance_source_changed'},{status:409});
    if(data.confirmed!==true)throw Error('Missing founder confirmation');
    window.governance={revision:(window.governance?.revision??0)+1,source,binding:window.blueprint.binding,reviewMode:'founder-led',consentVersion:'creation-founder-governance-v1',savedBy:'founder.testnet',savedAt:'2026-11-21T00:00:00Z'};
    sessionStorage.setItem('p37-governance',JSON.stringify(window.governance));
   }
   const approved=window.blueprint.versions.filter(v=>v.approval).at(-1);
   const snapshot={binding:window.blueprint.binding,title:window.records.source.title,source,contributionCurrent:approved.revision===source.preparationRevision&&approved.digest===source.preparationDigest,saved:structuredClone(window.governance)};
   if(window.deferGovernance){window.deferGovernance=false;return new Promise(resolve=>{window.resolveGovernance=()=>resolve(Response.json(snapshot));});}
   return Response.json(snapshot);
  }
  const approved=source(window.blueprint.versions.filter(v=>v.approval).at(-1));
  if(data){
   if(window.failSave)return Response.json({error:'contribution_revision_conflict'},{status:409});
   if(data.expectedRevision!==(window.records?.revision??0)||data.preparationRevision!==approved.revision||data.preparationDigest!==approved.digest)return Response.json({error:'contribution_source_changed'},{status:409});
   if(data.configuration.tasks.some(t=>t.rewardTerms==='unpaid'&&!t.unpaidAcknowledged))throw Error('Missing unpaid acknowledgement');
   window.records={revision:(window.records?.revision??0)+1,source:approved,configuration:data.configuration,digest:'c'.repeat(64),savedBy:'founder.testnet',savedAt:'2026-11-20T02:00:00Z'};persist();
  }
  const snapshot={binding:window.blueprint.binding,approved,saved:structuredClone(window.records)};
  if(window.deferConfiguration){window.deferConfiguration=false;return new Promise(resolve=>{window.resolveConfiguration=()=>resolve(Response.json(snapshot));});}
  return Response.json(snapshot);
 }
 throw Error('Unexpected request '+url);
};
window.clickButton=label=>{if(label==='Check saved configuration'){const a=[...document.querySelectorAll('main > details')].find(d=>d.querySelector('summary').textContent.startsWith('Advanced'));if(a)a.open=true;}const b=[...document.querySelectorAll('button')].find(b=>b.textContent===label);if(!b||b.disabled)throw Error('Button unavailable: '+label);b.click();};
window.change=(label,value)=>{const l=[...document.querySelectorAll('main label')].find(l=>[...l.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('')===label);const el=l?.querySelector('textarea,select');if(!el)throw Error('Field missing: '+label);Object.getOwnPropertyDescriptor(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLTextAreaElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));};
window.check=label=>{const l=[...document.querySelectorAll('main label')].find(l=>l.textContent.includes(label));if(!l)throw Error('Checkbox missing '+label);l.querySelector('input').click();};
function Observer(){window.latestWallet=useTestnetWallet();return null;}
const Current=location.pathname.endsWith('/governance')?Governance:location.pathname.endsWith('/contributions')?Panel:Blueprint;
createRoot(document.getElementById('root')).render(<TestnetWalletProvider><NavigationShell><Observer/><React.StrictMode><Current creationId="yawrd-aaaaaaaaaaaa"/></React.StrictMode></NavigationShell></TestnetWalletProvider>);
`;
    await writeFile(temporary+'/entry.tsx',entry);
    const webpack=require('next/dist/compiled/webpack/webpack').webpack;
    await new Promise((resolveBuild,reject)=>{
      const compiler=webpack({mode:'development',devtool:false,target:'web',cache:false,entry:temporary+'/entry.tsx',output:{path:temporary,filename:'bundle.js'},
        resolve:{extensions:['.tsx','.ts','.js'],modules:[resolve('node_modules'),'node_modules']},
        externals:[({request},callback)=>callback(null,request==='@hot-labs/near-connect'?'window __nearMock':request==='next/link'?'window __nextLink':request==='next/navigation'?'window __nextNavigation':undefined)],
        module:{rules:[{test:/\.tsx?$/,use:temporary+'/tsx-loader.cjs'},{test:/\.module\.css$/,use:temporary+'/css-loader.cjs'}]}});
      compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolveBuild()));
    });
    const bundle=await readFile(temporary+'/bundle.js');
    const files=['app/components/global-navigation.module.css','app/create/[id]/blueprint/preparation.module.css','app/create/[id]/contributions/contributions.module.css','app/create/welcome.module.css'];
    const css=(await Promise.all(files.map(async file=>{
      const prefix=relative(resolve('.'),resolve(file)).replace(/[^A-Za-z0-9]/g,'_')+'__';
      return (await require('postcss')([{postcssPlugin:'scope-offline-css',Rule(rule){rule.selector=rule.selector.replace(/\.([a-zA-Z_][\w-]*)/g,(_,name)=>'.'+prefix+name);}}]).process(await readFile(file,'utf8'),{from:resolve(file)})).css;
    }))).join('\n');
    const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#001b1d;color:#d8e7e2;font-family:Arial,sans-serif}*{box-sizing:border-box}${css}</style><div id="root"></div><script>window.__nextNavigation={usePathname:()=>location.pathname};window.__nextLink=p=>window.React.createElement('a',p,p.children);</script><script src="/bundle.js"></script>`;
    server=createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle);}else{res.setHeader('content-type','text/html');res.end(html);}});
    await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
    const local='http://127.0.0.1:'+server.address().port;
    browser=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-extensions','--disable-gpu','--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--remote-debugging-port=0','--user-data-dir='+temporary+'/profile','about:blank'],{stdio:'ignore'});
    let port;
    for(let k=0;k<150;k++){try{port=Number((await readFile(temporary+'/profile/DevToolsActivePort','utf8')).split('\n')[0]);break;}catch{await delay(30);}}
    assert.ok(port);
    const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data);
      if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}
      if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);
      if(m.method==='Fetch.requestPaused'){const {requestId,request}=m.params,allowed=request.url.startsWith(local+'/');if(!allowed)blocked.push(request.url);void call(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId}:{requestId,errorReason:'BlockedByClient'});}
    });
    await call('Page.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]});await call('Page.navigate',{url:local+'/create/yawrd-aaaaaaaaaaaa/blueprint'});
    await waitFor("document.querySelector('main')?.textContent.includes('This saved version is founder approved')");
    assert.equal(await evaluate("document.querySelector('main a[href$=\"/contributions\"]')?.textContent"),'Configure contributions');
    await evaluate("document.querySelector('main a[href$=\"/contributions\"]').click()");
    await waitFor("location.pathname.endsWith('/contributions')&&document.body.innerText.includes('Anything else contributors should know?')");
    assert.ok(await evaluate("document.querySelector('main').textContent.includes('03 Build your Blueprint')&&document.querySelector('main').textContent.includes('Later · unavailable')"));
    assert.equal(await evaluate("[...document.querySelectorAll('main select')].every(s=>s.value==='undecided')"),true);
    assert.equal(await evaluate("document.querySelector('main h1').textContent"),'Choose what gets built');
    assert.equal(await evaluate("document.querySelectorAll('main article').length"),3);
    assert.equal(await evaluate("[...document.querySelectorAll('main details')].every(d=>!d.open)"),true);
    assert.equal(await evaluate("document.body.innerText.includes('Source digest:')||document.body.innerText.includes('Compensation for')||document.body.innerText.includes('configuration revision')"),false);
    assert.equal(await evaluate("document.querySelectorAll('main input[aria-label^=Include]').length"),3);
    assert.equal(await evaluate("document.body.innerText.includes('3 of 3 tasks selected')"),true);
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    assert.ok(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Save draft').getBoundingClientRect().bottom<=innerHeight+64"),'compact desktop default reaches Save draft near the first viewport');
    const desktop=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await writeFile('/tmp/yawrd-p36-ux-desktop.png',Buffer.from(desktop.data,'base64'));
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
    const mobile=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await writeFile('/tmp/yawrd-p36-ux-mobile.png',Buffer.from(mobile.data,'base64'));
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Save draft').disabled"),true);
    await evaluate("window.check('I reviewed the selected tasks')");
    await evaluate("window.change('Anything else contributors should know?','Private demonstration; no work activation.')");
    await evaluate("window.check('Collect observations')");
    await evaluate("document.querySelector('main > details:not([class*=advanced])').open=true");
    await waitFor("document.body.innerText.includes('Review measurements depends on Collect observations.')");
    assert.equal(await evaluate("document.body.innerText.includes('2 of 3 tasks selected')"),true);
    await evaluate("[...document.querySelectorAll('main article')].find(a=>a.querySelector('label').textContent==='Review measurements').querySelector('details').open=true");
    await evaluate("window.change('Compensation for Review measurements','unpaid')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Save draft').disabled"),true);
    await evaluate("window.check('I explicitly choose voluntary unpaid work for Review measurements')");
    await evaluate("window.change('Draft reward notes for Review measurements','Keep this saved reward note.')");
    await click('Save draft');
    await waitFor("document.querySelector('main [role=status]')?.textContent==='✓ Saved. You can safely leave this page.'");
    assert.equal(await evaluate("window.records.revision===1&&window.records.configuration.tasks[0].included===false&&window.records.configuration.tasks[1].unpaidAcknowledged"),true);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Save draft').disabled"),true);
    await call('Page.reload');await waitFor("document.querySelector('main [role=status]')?.textContent==='✓ Saved. You can safely leave this page.'");
    assert.equal(await evaluate("document.querySelector('main textarea[placeholder]').value"),'Private demonstration; no work activation.');
    assert.equal(await evaluate("[...document.querySelectorAll('main select')][1].value"),'unpaid');
    assert.equal(await evaluate("[...document.querySelectorAll('main article')][1].querySelector('textarea').value"),'Keep this saved reward note.');
    assert.equal(await evaluate("[...document.querySelectorAll('main article details')].every(d=>!d.open)"),true);

    assert.equal(await evaluate("document.querySelector('main a[href$=\"/governance\"]')?.textContent"),'Continue to work approval');
    await evaluate("document.querySelector('main a[href$=\"/governance\"]').click()");
    await waitFor("location.pathname.endsWith('/governance')&&document.querySelector('main h1')?.textContent==='Who approves the work?'&&!!document.querySelector('main input[type=checkbox]')");
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('founder.testnet')"),false);
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('seed.factory.yawrd.testnet')||document.querySelector('main').innerText.includes('consentVersion')"),false);
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('Any future payments require approval')"),true);
    assert.equal(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Confirm & save').disabled"),true);
    assert.equal(await evaluate("document.querySelectorAll('main section').length"),1);
    assert.equal(await evaluate("document.querySelector('main details').open"),false);
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    assert.ok(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Confirm & save').getBoundingClientRect().bottom<innerHeight"),'ordinary workflow fits a desktop viewport');
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await evaluate("document.querySelector('main input[type=checkbox]').focus()");
    assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle"),'solid');
    await evaluate("window.check('I understand and confirm these review arrangements.')");await click('Confirm & save');
    await waitFor("document.querySelector('main [role=status]')?.textContent.includes('Saved. You can safely continue later.')");
    assert.equal(await evaluate('window.governance.revision'),1);
    await call('Page.reload');await waitFor("document.querySelector('main [role=status]')?.textContent.includes('Saved. You can safely continue later.')");
    assert.equal(await evaluate("document.querySelector('main input[type=checkbox]').checked"),true);
    assert.equal(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Confirm & save').disabled"),true);
    for(const width of [320,390,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'no overflow at '+width);}
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await evaluate("getComputedStyle(document.querySelector('main button')).animationName"),'none');
    await evaluate("document.querySelector('main details').open=true");
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('seed.factory.yawrd.testnet')"),true);
    await evaluate("document.querySelector('main details').open=false");
    const governanceDesktop=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/yawrd-p37-desktop.png',Buffer.from(governanceDesktop.data,'base64'));
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
    const governanceMobile=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/yawrd-p37-mobile.png',Buffer.from(governanceMobile.data,'base64'));

    await evaluate("window.records.revision++;window.records.digest='d'.repeat(64);window.failGovernance=true");await click('Check saved settings');
    await waitFor("document.querySelector('main').textContent.includes('Your earlier confirmation is preserved')");
    assert.equal(await evaluate("document.querySelector('main input[type=checkbox]').checked"),false);
    await evaluate("window.check('I understand and confirm these review arrangements.')");await click('Confirm & save');
    await waitFor("document.querySelector('main [role=alert]')?.textContent.includes('Another tab saved newer settings')");
    assert.equal(await evaluate("document.querySelector('main [role=status]').textContent.includes('Saved. You can safely continue later.')"),false);
    assert.equal(await evaluate('window.governance.revision'),1);
    await evaluate('window.failGovernance=false');await click('Confirm & save');await waitFor("document.querySelector('main [role=status]')?.textContent.includes('Saved. You can safely continue later.')");
    assert.equal(await evaluate('window.governance.revision'),2);
    await evaluate("window.records.revision++;window.records.digest='e'.repeat(64)");await click('Check saved settings');
    await waitFor("!document.querySelector('main input[type=checkbox]').checked");
    await evaluate("window.check('I understand and confirm these review arrangements.');window.deferGovernance=true");await click('Confirm & save');await waitFor('!!window.resolveGovernance');
    await evaluate("window.switchSession('other.testnet')");await waitFor("document.querySelector('main').textContent.includes('unavailable for your signed-in account')");
    await evaluate('window.resolveGovernance()');await delay(100);
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Community seed survey')"),false);
    await evaluate("window.switchSession('founder.testnet')");await waitFor("document.querySelector('main [role=status]')?.textContent.includes('Saved. You can safely continue later.')");
    assert.equal(await evaluate('window.governance.revision'),3);
    await evaluate('window.resolveGovernance=null');
    await evaluate('window.derivative(true)');await click('Check saved settings');
    await waitFor("document.querySelector('main').textContent.includes('Review your contribution choices first')");
    assert.equal(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Confirm & save').disabled"),true);
    assert.equal(await evaluate('window.governance.source.preparationRevision'),1);
    await evaluate("window.deferGovernance=true");await click('Check saved settings');await waitFor('!!window.resolveGovernance');
    await evaluate("window.switchSession('steward.testnet')");await waitFor("document.querySelector('main').textContent.includes('unavailable for your signed-in account')");
    await evaluate('window.resolveGovernance()');await delay(100);
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Community seed survey')"),false);
    await evaluate("window.switchSession('founder.testnet')");await waitFor("document.querySelector('main').textContent.includes('Community seed survey')");
    await evaluate('window.deferGovernance=true;window.resolveGovernance=null');await click('Check saved settings');await waitFor('!!window.resolveGovernance');
    await evaluate('window.switchSession(null)');await waitFor("document.querySelector('main').textContent.includes('Sign in or renew')");
    await evaluate('window.resolveGovernance()');await delay(100);
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Community seed survey')"),false);
    await evaluate("window.switchSession('founder.testnet')");await waitFor("document.querySelector('main').textContent.includes('Community seed survey')");
    await evaluate("window.sessionAccount=null;window.dispatchEvent(new Event('focus'))");await waitFor("document.querySelector('main').textContent.includes('Sign in or renew')&&!document.querySelector('main').textContent.includes('Community seed survey')");
    const audit=await evaluate('window.audit');assert.ok(audit.every(a=>['/api/auth/session','/api/auth/logout','/api/creations/yawrd-aaaaaaaaaaaa/preparation','/api/creations/yawrd-aaaaaaaaaaaa/contributions','/api/creations/yawrd-aaaaaaaaaaaa/governance'].includes(a.url)));
    assert.ok(audit.filter(a=>a.method==='POST').every(a=>a.url.endsWith('/contributions')||a.url.endsWith('/governance')),'only private configuration writes');
    assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
  }finally{
    ws?.close();browser?.kill();await new Promise(r=>server?server.close(r):r());await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
