// Offline one-page Launch review and synthetic publication UI. No database or real wallet actions.
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

test('saved governance continues to Launch review, founder authorization, publication safeguards and public success',{timeout:90000},async()=>{
  const temporary=await mkdtemp('/tmp/yawrd-contributions-browser-');
  let server,browser,ws,sequence=0;
  const pending=new Map(),blocked=[],errors=[];
  function call(method,params={}){return new Promise((resolveCall,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},10000);
    pending.set(id,{resolve:v=>{clearTimeout(timer);resolveCall(v);},reject});ws.send(JSON.stringify({id,method,params}));
  });}
  async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}).catch(e=>{throw Error(e.message+' while evaluating: '+expression);});assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;}
  async function waitFor(expression){for(let k=0;k<150;k++){if(await evaluate(expression))return;await delay(30);}assert.fail('Browser condition timed out: '+expression);}
  const click=label=>evaluate(`window.clickButton(${JSON.stringify(label)})`);
  try{
    await writeFile(temporary+'/tsx-loader.cjs','const ts=require('+JSON.stringify(require.resolve('typescript'))+');module.exports=source=>ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;');
    await writeFile(temporary+'/css-loader.cjs',`const path=require('node:path');module.exports=function(){const prefix=path.relative(process.cwd(),this.resourcePath).replace(/[^A-Za-z0-9]/g,'_')+'__';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,key)=>'+JSON.stringify(prefix)+'+key})}';};`);
    const entry=String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import Panel from ${JSON.stringify(resolve('app/create/[id]/contributions/contribution-panel.tsx'))};
import Launch from ${JSON.stringify(resolve('app/create/[id]/launch/launch-panel.tsx'))};
import Governance from ${JSON.stringify(resolve('app/create/[id]/governance/governance-panel.tsx'))};
import Blueprint from ${JSON.stringify(resolve('app/create/[id]/blueprint/preparation-panel.tsx'))};
import {NavigationShell} from ${JSON.stringify(resolve('app/components/global-navigation.tsx'))};
import {TestnetWalletProvider,useTestnetWallet} from ${JSON.stringify(resolve('app/use-testnet-wallet.ts'))};
import {preparationView} from ${JSON.stringify(resolve('test/fixtures/preparation.ts'))};
import {publicationMessage,publicationText,PUBLICATION_RECIPIENT} from ${JSON.stringify(resolve('src/creation/publication.ts'))};
import {YawrdIdentityPresentation} from ${JSON.stringify(resolve('app/components/yawrd-identity-presentation.tsx'))};
import {proposedYawrdPreview} from ${JSON.stringify(resolve('src/creation/yawrd-preview.ts'))};
import {initialContributionConfiguration} from ${JSON.stringify(resolve('src/creation/contribution-configuration.ts'))};
window.React=React;window.sessionAccount='founder.testnet';window.audit=[];window.publicationAvailable=sessionStorage.getItem('publication-enabled')==='1';window.publicationReceipt=JSON.parse(sessionStorage.getItem('publication-receipt')||'null');
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
 if(url.endsWith('/preparation')||url.endsWith('/contributions')||url.endsWith('/governance')||url.endsWith('/launch')){
  if(window.sessionAccount!=='founder.testnet')return Response.json({error:window.sessionAccount?'creation_not_found':'sign_in_required'},{status:window.sessionAccount?404:401});
  if(options.headers['x-yawrd-account']!==window.sessionAccount)return Response.json({error:'creation_session_changed'},{status:409});
  if(url.endsWith('/preparation')){if(data)throw Error('No preparation mutation authorized');return Response.json(window.blueprint);}
  if(url.endsWith('/launch')){
   const approved=window.blueprint.versions.filter(v=>v.approval).at(-1);
   const source={binding:window.blueprint.binding,governanceRevision:window.governance.revision,configurationSource:window.governance.source,
    publicName:approved.artifacts.blueprint.title,publicDescription:approved.artifacts.blueprint.summary,
    profileSource:{revision:approved.revision,digest:approved.digest,nameField:'blueprint.title',descriptionField:'blueprint.summary'}};
   if(data){
    if(!window.publicationAvailable)throw Error('Blocked Launch must never submit in this browser');
    if(data.action==='publish'){
      if(window.failPublication)return Response.json({error:'launch_source_changed'},{status:409});
      window.publicationReceipt={creationId:'yawrd-aaaaaaaaaaaa',url:'/yawrd/yawrd-aaaaaaaaaaaa',publishedAt:'2026-11-23T00:00:00Z'};
      sessionStorage.setItem('publication-receipt',JSON.stringify(window.publicationReceipt));
      return Response.json({published:window.publicationReceipt});
    }
    sessionStorage.setItem('published-payload',JSON.stringify(data.payload));
    const c={id:'a'.repeat(43),accountId:window.sessionAccount,origin:location.origin,network:'testnet',nonce:btoa('a'.repeat(32)),recipient:PUBLICATION_RECIPIENT,issuedAt:Date.now(),expiresAt:Date.now()+300000};c.expiresAt=c.issuedAt+300000;
    const sha=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(publicationText(v))))).map(b=>b.toString(16).padStart(2,'0')).join('');
    c.message=publicationMessage(c,'yawrd-aaaaaaaaaaaa',await sha(data.source),await sha(data.payload));return Response.json({challenge:c});
   }
   const snapshot={binding:window.blueprint.binding,title:window.records.source.title,deployment:{name:'Historical deployed identity',description:'Historical deployed purpose',daoAccountId:window.blueprint.binding.daoAccountId},source,current:!window.staleLaunch&&approved.revision===window.records.source.revision,fundingPlan:window.fundingUnresolved?'unresolved':'none-planned',publicationEnabled:!!window.publicationAvailable,published:window.publicationReceipt,proposed:proposedYawrdPreview({name:source.publicName,description:source.publicDescription},window.records,window.fundingUnresolved?'unresolved':'none-planned'),funds:{status:'observed',amountYocto:'1000000000000000000000000',lockedYocto:'0',blockHeight:42,blockHash:'B'.repeat(43)}};
   if(window.deferLaunch){window.deferLaunch=false;return new Promise(resolve=>{window.resolveLaunch=()=>resolve(Response.json(snapshot));});}
   return Response.json(snapshot);
  }
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
function Observer(){window.latestWallet=useTestnetWallet();
 if(window.publicationAvailable){
  window.latestWallet.getContext=()=>({accountId:window.sessionAccount,network:'testnet'});
  window.latestWallet.signIdentity=async params=>{window.syntheticSigned=params;window.signatureCount=(window.signatureCount||0)+1;
    if(window.rejectSignature)throw Error('Wallet approval cancelled.');
    if(window.deferSignature)return new Promise(resolve=>window.resolveSignature=()=>resolve({accountId:params.signerId,publicKey:'synthetic',signature:'synthetic'}));
    return {accountId:params.signerId,publicKey:'synthetic',signature:'synthetic'};};
 }return null;}
const Public=()=> <main><YawrdIdentityPresentation project={JSON.parse(sessionStorage.getItem('published-payload'))} creatorAccountId="founder.testnet"/></main>;
const Current=location.pathname.startsWith('/yawrd/')?Public:location.pathname.endsWith('/launch')?Launch:location.pathname.endsWith('/governance')?Governance:location.pathname.endsWith('/contributions')?Panel:Blueprint;
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
    const files=['app/components/global-navigation.module.css','app/create/[id]/blueprint/preparation.module.css','app/create/[id]/contributions/contributions.module.css','app/create/welcome.module.css','app/components/project-space-shell.module.css','app/components/yawrd-identity-presentation.module.css','app/components/genesis-project.module.css','app/create/[id]/launch/preview.module.css'];
    const css=(await Promise.all(files.map(async file=>{
      const prefix=relative(resolve('.'),resolve(file)).replace(/[^A-Za-z0-9]/g,'_')+'__';
      return (await require('postcss')([{postcssPlugin:'scope-offline-css',Rule(rule){rule.selector=rule.selector.replace(/\.([a-zA-Z_][\w-]*)/g,(_,name)=>'.'+prefix+name);}}]).process(await readFile(file,'utf8'),{from:resolve(file)})).css;
    }))).join('\n');
    const brand=await readFile('public/brand/yawrd-buoy.webp');
    const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#001b1d;color:#d8e7e2;font-family:Arial,sans-serif}*{box-sizing:border-box}.preview-art{background:radial-gradient(circle at 78% 0%,rgba(194,222,221,.24),transparent 45%),linear-gradient(115deg,#3d8c8a,#285650 70%,#193b36)}${css}</style><div id="root"></div><script>window.__nextNavigation={usePathname:()=>location.pathname};window.__nextLink=p=>window.React.createElement('a',p,p.children);</script><script src="/bundle.js"></script>`;
    server=createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle);}else if(req.url==='/brand/yawrd-buoy.webp'){res.setHeader('content-type','image/webp');res.end(brand);}else{res.setHeader('content-type','text/html');res.end(html);}});
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

    await evaluate("window.check('Collect observations');window.change('Compensation for Review measurements','undecided')");await click('Save draft');
    await waitFor("document.querySelector('main [role=status]')?.textContent==='✓ Saved. You can safely leave this page.'");
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
    assert.equal(await evaluate("document.querySelector('main a[href$=\"/launch\"]')?.textContent"),'Continue to launch');
    await evaluate("document.querySelector('main a[href$=\"/launch\"]').click()");
    await waitFor("document.querySelector('main h1')?.textContent==='Ready to launch?'&&document.querySelector('main').textContent.includes('Community seed survey')");
    assert.equal(await evaluate("document.querySelectorAll('main section').length"),1);
    assert.equal(await evaluate("document.querySelectorAll('main select').length"),0);
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('No contributor payouts planned')"),true);
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('Community seed survey')"),true);
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('account balance')"),false);
    assert.equal(await evaluate("[...document.querySelectorAll('main details')].every(d=>!d.open)"),true);
    await evaluate("document.querySelector('main > details').open=true");
    assert.equal(await evaluate("document.querySelector('main > details').innerText.includes('Community seed survey')&&document.querySelector('main > details').innerText.includes('Document germination observations for a shared seed library.')"),true);
    assert.equal(await evaluate("document.querySelector('main > details').innerText.includes('Community seed survey')"),true);
    await evaluate("document.querySelector('main > details').open=false");
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('Historical deployed identity')"),false);
    await evaluate("document.querySelector('main > details:last-child').open=true");
    assert.equal(await evaluate("document.querySelector('main > details:last-child').innerText.includes('Historical deployed identity')&&document.querySelector('main > details:last-child').innerText.includes('Historical deployed purpose')"),true);
    await evaluate("document.querySelector('main > details:last-child').open=false");

    assert.equal(await evaluate("document.querySelector('main input[type=checkbox]').checked"),false);
    await evaluate("window.check('I understand which project details will become public')");
    assert.equal(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Launch my Yawrd').disabled"),true);
    assert.equal(await evaluate("document.querySelector('main [role=status]').textContent.includes('Launch is blocked')"),true);
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    assert.ok(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Launch my Yawrd').getBoundingClientRect().bottom<innerHeight"),'ordinary flow fits desktop viewport');
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await evaluate("document.querySelector('main input[type=checkbox]').focus()");
    assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineStyle"),'solid');
    const launchDesktop=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/yawrd-p38-revision-desktop.png',Buffer.from(launchDesktop.data,'base64'));
    for(const width of [320,390,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'no overflow at '+width);}
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    assert.equal(await evaluate("getComputedStyle(document.querySelector('main button')).animationName"),'none');
    const beforePreview=await evaluate("window.audit.filter(a=>a.url.endsWith('/launch')).length");
    await click('Preview your Yawrd');await waitFor("document.querySelector('main h1')?.textContent==='Community seed survey'");
    assert.ok(await evaluate("window.audit.filter(a=>a.url.endsWith('/launch')).length")>beforePreview,'preview rechecks server access');
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),'Your unpublished Yawrd');
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('Document germination observations for a shared seed library.')&&document.querySelector('main').innerText.includes('Testnet · Planned work')"),true);
    assert.equal(await evaluate("/Historical deployed identity|Historical deployed purpose|governanceRevision|privateNotes|seed.factory|rewardNote/.test(document.querySelector('main').textContent)"),false);
    assert.equal(await evaluate("document.querySelectorAll('main aside').length"),1);
    assert.equal(await evaluate("document.querySelectorAll('main nav[aria-label=\"Project sections\"]').length"),1);
    assert.equal(await evaluate("document.querySelectorAll('main form, main pre').length"),0);
    assert.equal(await evaluate("document.querySelector('main article').innerText.includes('Unpublished')||document.querySelector('main article').innerText.includes('Founder preview')"),false);
    assert.equal(await evaluate("document.querySelectorAll('main img').length"),0);
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('Applications and task participation remain closed')"),true);
    assert.equal(await evaluate("document.querySelectorAll('main #deliverables > details').length"),3);
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('No contributor payouts planned.')"),true);
    assert.equal(await evaluate("[...document.querySelectorAll('main #deliverables > details')].every(d=>!d.open)"),true);
    await evaluate("document.querySelector('main #deliverables > details').open=true");
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('Three dated observation records')"),true);
    assert.equal(await evaluate("/negative-day fixture|Validation output with the fixture|acceptanceCriteria/.test(document.querySelector('main').textContent)"),false);
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('No public resources have been approved')"),true);
    assert.equal(await evaluate("[...document.querySelectorAll('main #deliverables > details > summary')].every(s=>s.textContent.includes('0 NEAR allocated')&&s.textContent.includes('Reward terms undecided'))"),true);
    await evaluate("document.querySelector('main #deliverables > details').open=false");
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    assert.ok(await evaluate("document.querySelector('main article > div').getBoundingClientRect().height>=180&&document.querySelector('main article > div').getBoundingClientRect().height<=220"),'compact desktop header is 180–220px');
    assert.ok(await evaluate("document.querySelector('main [aria-label^=\"Accepted deliverables\"]').getBoundingClientRect().left>document.querySelector('main h1').getBoundingClientRect().right"),'progress is to the right on desktop');
    const rows=await evaluate("[...document.querySelectorAll('main #deliverables > details')].map(d=>({top:d.getBoundingClientRect().top,left:d.getBoundingClientRect().left,width:d.getBoundingClientRect().width,height:d.getBoundingClientRect().height}))");
    assert.ok(rows.every((r,i)=>r.height<=100&&r.width===rows[0].width&&r.left===rows[0].left&&(!i||r.top>=rows[i-1].top+rows[i-1].height)),'thin, full-width, single-column rows: '+JSON.stringify(rows));
    await evaluate("document.querySelector('main nav a[href=\"#resources\"]').click()");
    assert.equal(await evaluate('location.hash'),'#resources');
    await evaluate('window.scrollTo(0,0)');
    assert.equal(await evaluate("document.querySelector('main aside').textContent.includes('Project Identity')&&document.querySelector('main aside').textContent.includes('Created by')&&document.querySelector('main aside').textContent.includes('founder.testnet')"),true);
    assert.equal(await evaluate("document.querySelector('main [aria-label=\"Generic creator avatar\"]').getBoundingClientRect().width"),40);
    assert.equal(await evaluate("[...document.querySelectorAll('main section h2, main section h3, main section summary, main #resources > p:first-child, main #build-progress > p:first-child, main #participation > p:first-child')].every(e=>getComputedStyle(e).color==='rgb(194, 222, 221)')"),true);
    // Stress a long title through the actual collapsed-row presentation, then capture that layout.
    await click('Back to Launch');
    await evaluate("window.records.source.tasks[0].title='Prepare a complete catalogue of shared tools with clear availability and borrowing information for local community members'");
    await click('Preview your Yawrd');await waitFor("document.querySelector('main #deliverables > details')?.textContent.includes('complete catalogue')");
    const assertSeparation=async()=>assert.ok(await evaluate("[...document.querySelectorAll('main #deliverables > details > summary')].every(s=>{const title=s.children[1].getBoundingClientRect(),allocation=s.children[2].getBoundingClientRect(),control=s.children[3].getBoundingClientRect();return (allocation.left>=title.right+8||allocation.top>=title.bottom)&&control.left>=title.right&&s.scrollWidth<=s.clientWidth+1;})"),'task identity, allocation and control stay separated');
    await assertSeparation();
    const previewDesktop=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/yawrd-founder-preview-polish-desktop.png',Buffer.from(previewDesktop.data,'base64'));
    for(const width of [320,390,768,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'preview no overflow at '+width);await assertSeparation();}
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
    const previewMobile=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/yawrd-founder-preview-polish-mobile.png',Buffer.from(previewMobile.data,'base64'));
    assert.equal(await evaluate("getComputedStyle(document.querySelector('main article')).animationName"),'none');
    await click('Back to Launch');await waitFor("document.querySelector('main h1')?.textContent==='Ready to launch?'");
    assert.equal(await evaluate("document.activeElement.textContent"),'Preview your Yawrd');
    assert.equal(await evaluate("document.querySelector('main input[type=checkbox]').checked"),false);
    assert.equal(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Launch my Yawrd').disabled"),true);
    await evaluate('window.records.configuration.tasks[0].included=false');await click('Preview your Yawrd');
    await waitFor("document.querySelector('main h1')?.textContent==='Community seed survey'");
    assert.equal(await evaluate("document.querySelectorAll('main #deliverables > details').length"),2);
    await evaluate("document.querySelector('main #deliverables > details').open=true");
    assert.equal(await evaluate("document.querySelector('main').innerText.includes('Excluded prerequisite')"),true);
    assert.equal(await evaluate("[...document.querySelectorAll('main #deliverables > details > summary strong')].some(h=>h.textContent==='Collect observations')"),false);
    await click('Back to Launch');await evaluate('window.records.configuration.tasks[0].included=true');
    await evaluate("window.sessionAccount='other.testnet'");await click('Preview your Yawrd');
    await waitFor("document.querySelector('main').textContent.includes('unavailable for your signed-in account')");
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Community seed survey')"),false);
    await evaluate("window.switchSession('founder.testnet')");await waitFor("document.querySelector('main').textContent.includes('Community seed survey')");
    await click('Preview your Yawrd');await waitFor("document.querySelector('main h1')?.textContent==='Community seed survey'");
    await evaluate("window.switchSession('steward.testnet')");await waitFor("document.querySelector('main').textContent.includes('unavailable for your signed-in account')");
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Community seed survey')"),false);
    await evaluate("window.switchSession('founder.testnet')");await waitFor("document.querySelector('main').textContent.includes('Community seed survey')");
    await click('Preview your Yawrd');await waitFor("document.querySelector('main h1')?.textContent==='Community seed survey'");
    await evaluate("window.sessionAccount=null;window.dispatchEvent(new Event('focus'))");await waitFor("document.querySelector('main').textContent.includes('Sign in or renew')");
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Community seed survey')"),false);
    await evaluate("window.switchSession('founder.testnet')");await waitFor("document.querySelector('main').textContent.includes('Community seed survey')");
    await evaluate('window.deferLaunch=true;window.resolveLaunch=null');await click('Preview your Yawrd');await waitFor('!!window.resolveLaunch');
    await evaluate("window.switchSession('other.testnet')");await waitFor("document.querySelector('main').textContent.includes('unavailable for your signed-in account')");
    await evaluate('window.resolveLaunch()');await delay(100);
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Community seed survey')"),false);
    await evaluate("window.switchSession('founder.testnet')");await waitFor("document.querySelector('main').textContent.includes('Community seed survey')");
    await call('Page.reload');await waitFor("document.querySelector('main h1')?.textContent==='Ready to launch?'&&!!document.querySelector('main input[type=checkbox]')");
    assert.equal(await evaluate("document.querySelector('main input[type=checkbox]').checked"),false);
    await evaluate("window.derivative(false);window.blueprint.versions.at(-1).artifacts.blueprint.title='UNAPPROVED project';window.blueprint.versions.at(-1).artifacts.blueprint.summary='UNAPPROVED overview';document.querySelector('main > details:last-child').open=true");await click('Refresh readiness');
    await waitFor("document.querySelector('main input[type=checkbox]')&&!document.querySelector('main').textContent.includes('UNAPPROVED project')");
    assert.equal(await evaluate("document.querySelector('main strong').textContent"),'Community seed survey');
    await evaluate("window.check('I understand which project details will become public');window.derivative(true);window.blueprint.versions.at(-1).artifacts.blueprint.title='New approved profile';window.blueprint.versions.at(-1).artifacts.blueprint.summary='New approved summary.'");await click('Refresh readiness');
    await waitFor("document.querySelector('main').textContent.includes('New approved profile')&&document.querySelector('main').textContent.includes('Your preparation changed')");
    assert.equal(await evaluate("document.querySelector('main input[type=checkbox]').checked"),false);
    await evaluate("document.querySelector('main > details').open=true");
    assert.equal(await evaluate("document.querySelector('main > details').innerText.includes('New approved summary.')"),true);
    assert.equal(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Launch my Yawrd').disabled"),true);
    await evaluate("window.fundingUnresolved=true;window.staleLaunch=true;document.querySelector('main > details:last-child').open=true");await click('Refresh readiness');
    await waitFor("document.querySelector('main').innerText.includes('Funding and payout terms unresolved')&&document.querySelector('main').innerText.includes('Your preparation changed')");
    await evaluate('window.deferLaunch=true');await click('Refresh readiness');await waitFor('!!window.resolveLaunch');
    await evaluate("window.switchSession('steward.testnet')");await waitFor("document.querySelector('main').textContent.includes('unavailable for your signed-in account')");
    await evaluate('window.resolveLaunch()');await delay(100);assert.equal(await evaluate("document.querySelector('main').textContent.includes('New approved profile')"),false);
    await evaluate("window.switchSession('founder.testnet')");await waitFor("document.querySelector('main').textContent.includes('New approved profile')");
    await evaluate("window.deferLaunch=true;window.resolveLaunch=null;document.querySelector('main > details:last-child').open=true");await click('Refresh readiness');await waitFor('!!window.resolveLaunch');
    await evaluate('window.switchSession(null)');await waitFor("document.querySelector('main').textContent.includes('Sign in or renew')");
    await evaluate('window.resolveLaunch()');await delay(100);assert.equal(await evaluate("document.querySelector('main').textContent.includes('New approved profile')"),false);
    const audit=await evaluate('window.audit');assert.equal(audit.some(a=>a.url.endsWith('/launch')&&a.method==='POST'),false);
    // Enable only synthetic publication responses after all accepted blocked-state checks.
    await evaluate("window.blueprint.versions=window.blueprint.versions.slice(0,1);sessionStorage.setItem('p36-blueprint',JSON.stringify(window.blueprint));sessionStorage.setItem('publication-enabled','1')");
    await call('Page.reload');await waitFor("document.querySelector('main h1')?.textContent==='Ready to launch?'");
    await evaluate("window.check('I understand which project details will become public')");
    assert.equal(await evaluate("[...document.querySelectorAll('main button')].find(b=>b.textContent==='Launch my Yawrd').disabled"),false);
    await evaluate('window.rejectSignature=true');await click('Launch my Yawrd');await waitFor("document.querySelector('main [role=alert]')?.textContent.includes('cancelled')");
    assert.equal(await evaluate("window.audit.filter(a=>a.data?.action==='publish').length"),0);
    await evaluate('window.rejectSignature=false;window.failPublication=true');await click('Launch my Yawrd');await waitFor("document.querySelector('main [role=alert]')?.textContent.includes('preparation changed')");
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Your Yawrd is public')"),false);
    await evaluate('window.failPublication=false;window.deferSignature=true');await click('Launch my Yawrd');await waitFor('!!window.resolveSignature');
    const beforeSwitch=await evaluate("window.audit.filter(a=>a.data?.action==='publish').length");
    await evaluate("window.switchSession('other.testnet');window.resolveSignature()");await waitFor("document.querySelector('main').textContent.includes('unavailable for your signed-in account')");
    assert.equal(await evaluate("window.audit.filter(a=>a.data?.action==='publish').length"),beforeSwitch);
    await evaluate("window.deferSignature=false;window.switchSession('founder.testnet')");await waitFor("!!document.querySelector('main input[type=checkbox]')");
    await evaluate("window.check('I understand which project details will become public')");await click('Launch my Yawrd');
    await waitFor("document.querySelector('main h1')?.textContent==='Your Yawrd is public'");
    assert.equal(await evaluate("document.querySelector('main a').getAttribute('href')"),'/yawrd/yawrd-aaaaaaaaaaaa');
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Applications, tasks, rewards and payments remain inactive')"),true);
    await call('Page.reload');await waitFor("document.querySelector('main h1')?.textContent==='Your Yawrd is public'");
    // The real public component receives only the reviewed projection in this fixture.
    await evaluate("document.querySelector('main a').click()");
    await waitFor("location.pathname.startsWith('/yawrd/')&&document.querySelector('main h1')?.textContent==='Community seed survey'");
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Applications and task participation remain closed')"),true);
    assert.equal(await evaluate("document.querySelectorAll('main form,main pre').length"),0);
    assert.equal(await evaluate("document.querySelectorAll('main #deliverables > details').length"),3);
    assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
  }finally{
    ws?.close();browser?.kill();await new Promise(r=>server?server.close(r):r());await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
