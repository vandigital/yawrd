// Offline interaction checks with real preparation UI, global Account and wallet owner.
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

test(process.env.YAWRD_BROWSER_RECOVERY==='1'?'Recovery preserves failure, shows truthful progress and reveals saved review':process.env.YAWRD_BROWSER_BLUEPRINT_UX==='1'?'Blueprint page shows truthful saved context, disabled and enabled models, and session renewal':process.env.YAWRD_BROWSER_PAID_INTAKE==='1'?'Paid Creation reuses private intake editing and rejects saves after another tab reserves preparation':'AI preparation progress follows durable fixture transitions, resumes without regeneration, and retains private review',{timeout:90000},async()=>{
  const temporary=await mkdtemp('/tmp/yawrd-preparation-browser-');
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
import Panel from ${JSON.stringify(resolve('app/create/[id]/blueprint/preparation-panel.tsx'))};
import Welcome from ${JSON.stringify(resolve('app/create/creation-welcome.tsx'))};
import {createEmptyYawrdIntakeDraft,updateYawrdIntakeDraft} from ${JSON.stringify(resolve('src/yawrd-intake.ts'))};
import PaymentPanel from ${JSON.stringify(resolve('app/create/[id]/payment/payment-panel.tsx'))};
import {NavigationShell} from ${JSON.stringify(resolve('app/components/global-navigation.tsx'))};
import {TestnetWalletProvider,useTestnetWallet} from ${JSON.stringify(resolve('app/use-testnet-wallet.ts'))};
import {preparationView} from ${JSON.stringify(resolve('test/fixtures/preparation.ts'))};
window.React=React;
window.sessionAccount='founder.testnet';window.audit=JSON.parse(sessionStorage.getItem('preparation-audit')||'[]');
const intake={...updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft('existing-paid-source','2026-11-19T00:00:00.000Z'),{projectType:'research',startingPoint:'idea',intendedBudget:'undecided',availableResources:'A seed tray.',successCriteria:'Review three seed observations.',initialOutcomeConfirmed:true,founderDescription:'Help neighbors compare seed observations. Voluntary and unpaid work.'},'2026-11-19T00:00:00.000Z'),projectName:'Community seed survey'};
window.paidCreation=JSON.parse(sessionStorage.getItem('paid-creation')||'null')||{id:'yawrd-aaaaaaaaaaaa',network:'testnet',founderAccountId:'founder.testnet',sourceDraftId:intake.draftId,revision:2,initialIntake:structuredClone(intake),intake,configuration:{publicName:'Frozen public name',publicDescription:'Frozen public description',accountLabel:'seed',secondSteward:'second.testnet',threshold:2},publicTextDigest:'f'.repeat(64),publicTextReview:null,createdAt:intake.createdAt,updatedAt:intake.updatedAt};
const sourceVersion=preparationView('a'.repeat(64)).versions[0];
sourceVersion.artifacts.privateNotes='';
sourceVersion.generation.model='gpt-6.1-sol';
window.records=JSON.parse(sessionStorage.getItem('preparation-record')||'null')||{...preparationView('a'.repeat(64)),versions:[],generation:{installed:true,canGenerate:true,model:'openai/gpt-6.1-sol',consentVersion:'creation-partner-preparation-v1',partnerProvider:true,attempt:null,inputBytesLimit:24000,outputTokensLimit:8000,providerTimeoutMs:180000,allowance:1}};
window.generationCalls=Number(sessionStorage.getItem('generation-calls')||0);
if(${process.env.YAWRD_BROWSER_RECOVERY==='1'}){
 window.paidCreation.revision=7;window.records.versions=[];window.records.generation.canGenerate=false;
 const original={id:'original-failed',state:'failed',model:'openai/gpt-6.1-sol',sourceDigest:'a'.repeat(64),reservedAt:new Date().toISOString(),dispatchedAt:new Date().toISOString(),responseAt:new Date().toISOString(),finishedAt:new Date().toISOString(),deadlineAt:new Date().toISOString(),resultRevision:null,errorCode:'generation_output_incomplete',usage:{tokens:{output:8000,reasoning:1445}}};
 window.records.generation.attempt=original;window.records.generation.outputTokensLimit=16000;window.records.generation.providerTimeoutMs=420000;
 window.records.generation.recovery={installed:true,canRecover:true,originalAttempt:structuredClone(original),attempt:null};
}

if(${process.env.YAWRD_BROWSER_BLUEPRINT_UX==='1'}){window.records.generation.canGenerate=false;window.records.generation.model='Qwen/Qwen3.8-27B';window.records.generation.partnerProvider=false;window.paidCreation.revision=7;}
window.advance=state=>{
 const a=window.records.generation.attempt;a.state=state;
 if(state==='waiting')a.dispatchedAt=new Date().toISOString();
 if(state==='checking')a.responseAt=new Date().toISOString();
 if(state==='saved'){a.finishedAt=new Date().toISOString();a.resultRevision=1;window.records.versions=[sourceVersion];}
 if(state==='failed'){a.finishedAt=new Date().toISOString();a.errorCode='generation_output_incomplete';}
 if(window.records.generation.recovery?.attempt)window.records.generation.recovery.attempt=a;
 if(state==='unknown'){a.finishedAt=new Date().toISOString();a.errorCode='generation_completion_unknown';}
 sessionStorage.setItem('preparation-record',JSON.stringify(window.records));
 if(state==='saved')window.resolveGeneration?.(Response.json(structuredClone(window.records)));
};
const persist=()=>sessionStorage.setItem('preparation-record',JSON.stringify(window.records));
window.switchSession=account=>{window.sessionAccount=account;window.dispatchEvent(new Event('yawrd:session-changed'));};
window.__nearMock={NearConnector:class{
  constructor(){this.network='testnet';this.availableWallets=[];this.whenManifestLoaded=Promise.resolve();this.events={};}
  on(e,f){this.events[e]=f;}off(e){delete this.events[e];}async getConnectedWallet(){throw Error('Disconnected');}
}};
window.fetch=async(url,options={})=>{
  const data=options.body?JSON.parse(options.body):null;
  window.audit.push({url,method:options.method||'GET',data});
  sessionStorage.setItem('preparation-audit',JSON.stringify(window.audit));
  if(url==='/api/auth/session')return Response.json({accountId:window.sessionAccount});
  if(url==='/api/auth/logout'){window.sessionAccount=null;return Response.json({});}
  if(url==='/api/creations/security')return Response.json({items:[]});
  if(url==='/api/creations')return Response.json({items:[],nextAfterId:null});
  if(url==='/api/creations/yawrd-aaaaaaaaaaaa'){
    if(window.summaryFailure)return Response.json({error:'service_unavailable'},{status:503});
    const c=window.paidCreation;
    if(window.sessionAccount!==c.founderAccountId)return Response.json({error:'creation_not_found'},{status:404});
    if(options.headers['x-yawrd-account']!==window.sessionAccount)return Response.json({error:'creation_session_changed'},{status:409});
    if(data){
      if(window.intakeSaveError)return Response.json({error:'service_unavailable'},{status:503});
      if(data.expectedRevision!==c.revision)return Response.json({error:'creation_revision_conflict'},{status:409});
      if(window.records.generation.attempt)return Response.json({error:'creation_intake_locked'},{status:409});
      if(!data.intake||data.configuration||data.intake.draftId!==c.sourceDraftId)throw Error('Only existing private intake may change');
      window.paidCreation={...c,intake:data.intake,revision:c.revision+1};
      sessionStorage.setItem('paid-creation',JSON.stringify(window.paidCreation));
    }
    if(data&&window.deferIntakeSave)return new Promise(resolve=>{window.resolveIntakeSave=()=>resolve(Response.json({creation:structuredClone(window.paidCreation)}));});
    return Response.json({creation:structuredClone(window.paidCreation)});
  }
  if(url.endsWith('/platform-fee'))return Response.json({binding:{creationId:'yawrd-aaaaaaaaaaaa',name:'Community seed survey',daoAccountId:'seed.factory.yawrd.testnet',creationTransaction:'D'.repeat(43)},accountId:window.sessionAccount,securityVerified:true,status:'paid',blockHeight:100,blockHash:'B'.repeat(43),checkedAt:new Date().toISOString(),amountYocto:'500000000000000000000000',recipient:'yawrd.testnet',policyVersion:'testnet-platform-fee-v1',fee:{state:'paid',revision:4,attempt:1,transactionHash:'P'.repeat(43),evidence:null},storageInstalled:true,walletEnabled:false,transaction:null,review:null});
  if(url.endsWith('/preparation')){
    if(window.sessionAccount!=='founder.testnet')return Response.json({error:window.sessionAccount?'creation_not_found':'sign_in_required'},{status:window.sessionAccount?404:401});
    if(options.headers['x-yawrd-account']!==window.sessionAccount)return Response.json({error:'creation_session_changed'},{status:409});
    if(data?.action==='recover'){
      if(window.records.generation.recovery.attempt)return Response.json(structuredClone(window.records));
      if(!window.records.generation.recovery.canRecover||data.consentVersion!=='creation-partner-recovery-v1')throw Error('Recovery not authorized');
      window.generationCalls++;sessionStorage.setItem('generation-calls',String(window.generationCalls));
      const a={id:'recovery-attempt',state:'reserved',model:'openai/gpt-6.1-sol',sourceDigest:'a'.repeat(64),reservedAt:new Date().toISOString(),dispatchedAt:null,responseAt:null,finishedAt:null,deadlineAt:new Date(Date.now()+450000).toISOString(),errorCode:null,resultRevision:null,usage:null};
      window.records.generation.recovery.canRecover=false;window.records.generation.recovery.attempt=a;window.records.generation.attempt=a;
      persist();return new Promise(resolve=>{window.resolveGeneration=resolve;});
    }
    if(data?.action==='generate'){
      if(window.records.generation.attempt)return Response.json(structuredClone(window.records));
      window.generationCalls++;sessionStorage.setItem('generation-calls',String(window.generationCalls));
      window.records.generation.canGenerate=false;
      window.records.generation.attempt={id:'synthetic-attempt',state:'reserved',model:'openai/gpt-6.1-sol',sourceDigest:'a'.repeat(64),reservedAt:new Date().toISOString(),dispatchedAt:null,responseAt:null,finishedAt:null,deadlineAt:new Date(Date.now()+210000).toISOString(),errorCode:null,resultRevision:null,usage:null};
      persist();return new Promise(resolve=>{window.resolveGeneration=resolve;});
    }
    if(data){
      const head=window.records.versions.at(-1);
      if(head.revision!==data.expectedRevision||head.digest!==data.expectedDigest)return Response.json({error:'preparation_revision_conflict'},{status:409});
      if(data.action==='save')window.records.versions.push({...head,revision:head.revision+1,parentRevision:head.revision,digest:String(head.revision+1).repeat(64),artifacts:data.artifacts,origin:'founder-edited',generation:null,authorAccountId:'founder.testnet',approval:null});
      else if(data.action==='approve')head.approval={digest:head.digest,approvedBy:'founder.testnet',approvedAt:'2026-11-19T02:00:00.000Z',consentVersion:data.consentVersion};
      else throw Error('Unexpected preparation action');
      persist();
    }
    const snapshot=structuredClone(window.records);
    if(window.deferPreparation){window.deferPreparation=false;return new Promise(resolve=>{window.resolvePreparation=()=>resolve(Response.json(snapshot));});}
    return Response.json(snapshot);
  }
  throw Error('Unexpected request '+url);
};
window.clickButton=label=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent===label);if(!b||b.disabled)throw Error('Button unavailable: '+label);b.click();};
window.editField=(label,value)=>{const field=[...document.querySelectorAll('label')].find(l=>l.firstChild?.textContent===label)?.querySelector('textarea');if(!field)throw Error('Field missing: '+label);Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));};
URL.createObjectURL=blob=>{window.exportedSkill=blob;return 'blob:offline';};URL.revokeObjectURL=()=>{};
const anchorClick=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(!this.download)anchorClick.call(this);};
function Observer(){window.latestWallet=useTestnetWallet();return null;}
createRoot(document.getElementById('root')).render(<TestnetWalletProvider><NavigationShell><Observer/><React.StrictMode><>{location.pathname==='/create'?<Welcome/>:location.pathname.endsWith('/payment')?<PaymentPanel creationId="yawrd-aaaaaaaaaaaa" preparationAvailable/>:<Panel creationId="yawrd-aaaaaaaaaaaa"/>}</></React.StrictMode></NavigationShell></TestnetWalletProvider>);
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
    const files=['app/components/global-navigation.module.css','app/create/[id]/blueprint/preparation.module.css','app/create/intake/intake.module.css','app/create/welcome.module.css'];
    const css=(await Promise.all(files.map(async file=>{
      const prefix=relative(resolve('.'),resolve(file)).replace(/[^A-Za-z0-9]/g,'_')+'__';
      return (await require('postcss')([{postcssPlugin:'scope-offline-css',Rule(rule){rule.selector=rule.selector.replace(/\.([a-zA-Z_][\w-]*)/g,(_,name)=>'.'+prefix+name);}}]).process(await readFile(file,'utf8'),{from:resolve(file)})).css;
    }))).join('\n');
    const html=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#001b1d;color:#d8e7e2;font-family:Arial,sans-serif}*{box-sizing:border-box}${css}</style><div id="root"></div><script>window.__nextNavigation={usePathname:()=>'/create/yawrd-aaaaaaaaaaaa/blueprint'};window.__nextLink=p=>window.React.createElement('a',p,p.children);</script><script src="/bundle.js"></script>`;
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
    await call('Page.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]});await call('Page.navigate',{url:local+'/create/yawrd-aaaaaaaaaaaa/'+(process.env.YAWRD_BROWSER_RECOVERY==='1'||process.env.YAWRD_BROWSER_PAID_INTAKE==='1'||process.env.YAWRD_BROWSER_BLUEPRINT_UX==='1'?'blueprint':'payment')});
    if(process.env.YAWRD_BROWSER_RECOVERY==='1'){
      await waitFor('document.body.innerText.includes("Preparation failed — no Blueprint saved")');
      const original=await evaluate('structuredClone(window.records.generation.recovery.originalAttempt)');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-active="false"] span')).color`),'rgb(194, 222, 221)');
      for(const width of [390,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));}
      assert.equal(await evaluate(`document.querySelectorAll('[data-active="true"]').length`),0);
      assert.equal(await evaluate('document.body.innerText.includes("Saved to your private preparation")'),false);
      await evaluate('window.summaryFailure=true');await click('Check preparation status');
      await waitFor('[...document.querySelectorAll("main [role=status]")].some(p=>p.textContent.includes("Failed — no Blueprint saved")&&p.textContent.includes("Observed:"))');
      assert.equal(await evaluate('window.generationCalls'),0);
      assert.ok(await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent==="Check preparation status").nextElementSibling.textContent.includes("Failed")'));
      const action='Prepare my Blueprint — one recovery';
      assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="Prepare my Blueprint — one recovery").disabled'),true);
      await evaluate(`document.querySelector('[aria-label="Authorize one recovery"] input').click()`);await click(action);
      await waitFor('window.records.generation.attempt.state==="reserved"');await click('Check preparation status');
      await waitFor(`document.querySelectorAll('[data-active="true"]').length===1`);
      const activeStyle=()=>evaluate(`getComputedStyle(document.querySelector('[data-active="true"] span')).animationName`);
      assert.notEqual(await activeStyle(),'none');
      await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await activeStyle(),'none');
      await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
      await evaluate("window.advance('waiting')");await click('Check preparation status');await waitFor('document.body.innerText.includes("Preparing — waiting")');
      await evaluate("window.advance('checking')");await click('Check preparation status');await waitFor('document.body.innerText.includes("Preparing — checking")');
      assert.equal(await evaluate('document.body.innerText.includes("Saved to your private preparation")'),false);
      await evaluate("window.advance('saved')");await waitFor('document.body.innerText.includes("Your preparation is saved")&&document.body.innerText.includes("Community seed survey")');
      assert.equal(await evaluate(`document.querySelectorAll('[data-active="true"]').length`),0);
      assert.equal(await evaluate('window.generationCalls'),1);assert.deepEqual(await evaluate('window.records.generation.recovery.originalAttempt'),original);
      assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="Prepare my Blueprint — one recovery")'),false);
      await click('Edit preparation');await evaluate("window.editField('Project summary','Recovery founder edit')");await click('Save changes');
      await waitFor('window.records.versions.length===2&&!document.body.innerText.includes("You have unsaved changes")');
      await evaluate('[...document.querySelectorAll("label")].find(l=>l.textContent.includes("I reviewed this exact")).querySelector("input").click()');await click('Approve this version');
      await waitFor('document.body.innerText.includes("This saved version is founder approved")');assert.equal(await evaluate('window.generationCalls'),1);
      assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);return;
    }
    if(process.env.YAWRD_BROWSER_BLUEPRINT_UX==='1'){
      await waitFor('document.body.innerText.includes("Saved intake revision 7")');
      const route=await evaluate('location.pathname+location.search');
      assert.equal(await evaluate('document.querySelector("h1").textContent'),'Prepare your Blueprint');
      assert.ok(await evaluate(`document.querySelector('[aria-current="step"]').textContent.includes('03 Build your Blueprint')`));
      assert.ok(await evaluate('document.body.innerText.includes("Community seed survey")&&document.body.innerText.includes("payment verified")'));
      assert.ok(await evaluate('document.body.innerText.includes("Planned first controlled test: GPT-6.1 Sol")'));
      assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="Prepare my Blueprint").disabled'),true);
      await evaluate('[...document.querySelectorAll("summary")].find(s=>s.textContent.includes("AI request details")).click()');
      assert.ok(await evaluate('document.body.innerText.includes("Configured model (requests disabled): Qwen/Qwen3.8-27B")'));
      for(const width of [390,1440]){await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));}
      await evaluate('window.records.generation.canGenerate=true;window.switchSession("founder.testnet")');
      await waitFor('document.body.innerText.includes("Server-selected model: Qwen/Qwen3.8-27B")');
      assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent==="Prepare my Blueprint").disabled'),true);
      await evaluate('window.records.generation.model="openai/gpt-6.1-sol";window.records.generation.partnerProvider=true;window.switchSession("founder.testnet")');
      await waitFor('document.body.innerText.includes("Server-selected model: openai/gpt-6.1-sol")');
      assert.ok(await evaluate('document.body.innerText.includes("OpenAI, a partner provider")'));
      await evaluate('window.switchSession(null)');await waitFor('document.body.innerText.includes("Access your preparation")&&!document.body.innerText.includes("Community seed survey")');
      assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="Load saved preparation")'),false);
      await click('Sign in or renew with Account');assert.equal(await evaluate('document.getElementById("global-account").open'),true);
      await evaluate('window.records.generation.canGenerate=false;window.switchSession("founder.testnet")');
      await waitFor('document.body.innerText.includes("Saved intake revision 7")');assert.equal(await evaluate('location.pathname+location.search'),route);
      assert.equal(await evaluate('window.generationCalls'),0);assert.ok((await evaluate('window.audit')).every(a=>a.method==='GET'));
      assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);return;
    }
    if(process.env.YAWRD_BROWSER_PAID_INTAKE==='1'){
      await waitFor('document.body.innerText.includes("Review or edit project answers")');
      const before=await evaluate('structuredClone(window.paidCreation)'),binding=await evaluate('structuredClone(window.records.binding)');
      await evaluate(`localStorage.setItem('yawrd.intake-recovery.v1:yawrd-aaaaaaaaaaaa:account:founder.testnet',JSON.stringify([{...window.paidCreation.intake,projectName:'OLD PRIVATE COPY'}]))`);
      await evaluate('[...document.querySelectorAll("a")].find(a=>a.textContent==="Review or edit project answers").click()');
      await waitFor('document.getElementById("intake-name")?.value==="Community seed survey"');
      assert.equal(await evaluate('location.search'),'?step=intake&draft=yawrd-aaaaaaaaaaaa&returnTo=preparation');
      assert.equal(await evaluate('document.querySelectorAll("#intake-ai-help").length'),1);
      assert.equal(await evaluate('document.getElementById("intake-ai-help").open'),false);
      assert.equal(await evaluate('document.getElementById("intake-recovery-copies").open'),false);
      assert.equal(await evaluate('!!document.getElementById("intake-recovery-copies").closest("fieldset > div")'),true);
      assert.equal(await evaluate('document.querySelector("main").innerText.includes("OLD PRIVATE COPY")'),false);

      assert.equal(await evaluate('!!(document.getElementById("intake-ai-help").compareDocumentPosition(document.querySelector("main fieldset > div")) & Node.DOCUMENT_POSITION_FOLLOWING)'),true);
      assert.equal(await evaluate('!!(document.getElementById("intake-ai-help").compareDocumentPosition(document.getElementById("intake-name")) & Node.DOCUMENT_POSITION_FOLLOWING)'),true);
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('[aria-label="Your creation journey"] li p')].map(e=>e.textContent)`),['00 Sign in','01 Describe your project','02 Set up your Yawrd','03 Build your Blueprint','04 Launch your Yawrd']);
      assert.ok(await evaluate(`document.querySelector('[aria-label="Your creation journey"]').textContent.includes('Deployment and payment completed')`));
      assert.ok(await evaluate('document.querySelector("main").textContent.includes("does not change the deployed public Yawrd name")'));
      await call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));

      assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="Continue to setup review →")'),false);
      const fill=(id,value)=>evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click('Next');await waitFor('!!document.getElementById("field-successCriteria")');
      await fill('field-successCriteria','Five neighbors can compare reviewed observations.');
      assert.equal(await evaluate('document.querySelector("main input[type=checkbox]").checked'),false);
      await click('Next');await waitFor('document.querySelector("[role=alert]")?.textContent.includes("explicitly confirm")');
      await evaluate('document.querySelector("main input[type=checkbox]").click()');await click('Next');await waitFor('!!document.getElementById("field-founderDescription")');
      await fill('field-founderDescription','Revised private seed survey. Explicitly voluntary and unpaid.');await click('Next');await waitFor('document.querySelector("h1").textContent==="Review your intake"');
      await evaluate('window.deferIntakeSave=true');await click('Save reviewed intake');await waitFor('!!window.resolveIntakeSave');
      assert.equal(await evaluate('[...document.querySelectorAll("main button")].some(b=>b.textContent==="✓ Saved")'),false);
      assert.equal(await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent==="Continue").disabled'),true);
      await evaluate('window.deferIntakeSave=false;window.resolveIntakeSave()');await waitFor('document.body.innerText.includes("Saved revision 3")');
      assert.equal(await evaluate('[...document.querySelectorAll("main button")].filter(b=>b.textContent==="✓ Saved"&&b.disabled).length'),2);
      assert.equal(await evaluate('document.body.innerText.includes("Nothing has been launched")'),false);
      assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="Load saved version — discard unsaved edits")'),false);
      const saved=await evaluate('structuredClone(window.paidCreation)');assert.equal(saved.id,before.id);assert.equal(saved.founderAccountId,before.founderAccountId);assert.deepEqual(saved.initialIntake,before.initialIntake);assert.deepEqual(saved.configuration,before.configuration);assert.equal(saved.publicTextDigest,before.publicTextDigest);
      await call('Page.reload');await waitFor('!!document.getElementById("intake-name")');
      await click('Next');await waitFor('document.getElementById("field-successCriteria")?.value==="Five neighbors can compare reviewed observations."');assert.equal(await evaluate('document.querySelector("main input[type=checkbox]").checked'),true);
      await click('Next');await waitFor('document.getElementById("field-founderDescription")?.value.includes("Revised private")');
      await fill('field-founderDescription','Second founder edit after confirmed saving.');
      assert.equal(await evaluate('[...document.querySelectorAll("main button")].some(b=>b.textContent==="✓ Saved")'),false);
      assert.equal(await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent==="Continue").disabled'),true);
      await evaluate('window.intakeSaveError=true');await click('Save intake');await waitFor('!!document.querySelector("main [role=alert]")');
      assert.equal(await evaluate('[...document.querySelectorAll("main button")].some(b=>b.textContent==="✓ Saved")'),false);
      await evaluate('window.intakeSaveError=false');await click('Save intake');await waitFor('document.body.innerText.includes("Saved revision 4")');
      await evaluate('window.records.generation.canGenerate=false;sessionStorage.setItem("preparation-record",JSON.stringify(window.records))');
      await click('Continue');await waitFor('location.pathname.endsWith("/blueprint")&&document.body.innerText.includes("awaiting separate Development activation")');
      assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="Prepare with AI")'),false);
      assert.deepEqual(await evaluate('structuredClone(window.records.binding)'),binding);
      assert.equal(await evaluate('window.generationCalls'),0);
      const audit=await evaluate('window.audit');assert.ok(audit.every(a=>a.method==='GET'||a.method==='PATCH'));assert.ok(audit.every(a=>!a.url.includes('platform-fee')&&!a.url.includes('deployment')&&a.data?.action!=='generate'));
      assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);return;
    }
    await waitFor("document.body.innerText.includes('Continue to AI preparation')");
    assert.equal(await evaluate('window.generationCalls'),0,'opening paid continuation never starts inference');
    await evaluate("[...document.querySelectorAll('a')].find(a=>a.textContent.includes('Continue to AI preparation')).click()");
    await waitFor("document.body.innerText.includes('Prepare your Blueprint and contributor guidance')");
    assert.ok(await evaluate("document.body.innerText.includes('partner provider')&&document.body.innerText.includes('OpenAI')"));
    await evaluate("[...document.querySelectorAll('label')].find(l=>l.textContent.includes('I authorize this one AI')).querySelector('input').click()");
    await click('Prepare my Blueprint');
    await waitFor("window.records.generation.attempt?.state==='reserved'");
    assert.equal(await evaluate('window.generationCalls'),1);
    await waitFor("document.body.innerText.includes('✓ Preparation request saved')");
    assert.ok(await evaluate("document.body.innerText.includes('○ Request started')"));
    await evaluate("window.advance('waiting')");await click('Check preparation status');
    await waitFor("document.body.innerText.includes('✓ Request started')");
    assert.ok(await evaluate("document.body.innerText.includes('○ Response received')"));
    await evaluate("window.deferPreparation=true;window.resolvePreparation=null");await click('Check preparation status');await waitFor('!!window.resolvePreparation');
    await evaluate("window.advance('checking')");await click('Check preparation status');
    await waitFor("document.body.innerText.includes('✓ Response received')");
    await evaluate('window.resolvePreparation()');await delay(80);
    assert.ok(await evaluate("document.body.innerText.includes('✓ Response received')"),'late earlier status cannot regress progress');
    await call('Page.reload');
    await waitFor("document.body.innerText.includes('✓ Response received')");
    assert.equal(await evaluate('window.generationCalls'),1,'reload never dispatches another inference');
    await evaluate("window.advance('saved')");await click('Check preparation status');
    await waitFor("document.body.innerText.includes('Community seed survey')&&document.body.innerText.includes('Your preparation is saved')");
    assert.equal(await evaluate("document.querySelectorAll('main textarea').length"),0);
    assert.equal(await evaluate("document.body.innerText.includes('sourceDigest')"),false);
    assert.equal(await evaluate("[...document.querySelectorAll('main details')].find(d=>d.querySelector('summary')?.textContent.startsWith('Advanced')).open"),false);
    await click('Edit preparation');await evaluate("window.editField('Project title','')");await waitFor("document.body.innerText.includes('You have unsaved changes')");await click('Save changes');
    await waitFor("window.records.versions.length===2&&!document.body.innerText.includes('You have unsaved changes')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Approve this version').disabled"),true);
    await click('Edit preparation');await evaluate("window.editField('Project title','Founder revised seed survey')");await click('Save changes');
    await waitFor("window.records.versions.length===3&&!document.body.innerText.includes('You have unsaved changes')");
    await evaluate("[...document.querySelectorAll('main label')].find(l=>l.textContent.includes('I reviewed this exact')).querySelector('input').click()");await click('Approve this version');
    await waitFor("document.body.innerText.includes('This saved version is founder approved')");await click('Download reviewed SKILL.md');
    const skill=await evaluate('window.exportedSkill.text()');assert.match(skill,/Founder revised seed survey/);assert.match(skill,/Voluntary contribution; no monetary reward/);assert.doesNotMatch(skill,/PRIVATE|sourceDigest|WordWake/);
    await call('Page.reload');await waitFor("document.body.innerText.includes('This saved version is founder approved')");
    await click('Edit preparation');await evaluate("window.editField('Project summary','Another founder edit')");await click('Save changes');
    await waitFor("window.records.versions.length===4&&document.body.innerText.includes('needs founder review')");assert.equal(await evaluate('window.records.versions.at(-1).approval'),null);
    for(const width of [320,390,768,1440]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'no overflow at '+width);
    }
    await evaluate("window.deferPreparation=true;[...document.querySelectorAll('main details')].find(d=>d.querySelector('summary')?.textContent.startsWith('Advanced')).open=true");
    await click('Load saved version — discard unsaved changes');await waitFor('!!window.resolvePreparation');
    await evaluate("document.getElementById('global-account').open=true");await click('Sign out');
    await waitFor("document.body.innerText.includes('Sign in or renew')&&!document.querySelector('main').textContent.includes('Founder revised')");
    await evaluate('window.resolvePreparation()');await delay(80);
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('PRIVATE')||document.querySelector('main').textContent.includes('Founder revised')"),false,'late read cannot restore signed-out data');
    await evaluate("window.switchSession('other.testnet')");await waitFor("document.body.innerText.includes('unavailable for your signed-in account')");
    await evaluate("window.switchSession('founder.testnet')");await waitFor("document.body.innerText.includes('Founder revised seed survey')");
    // Delayed save response is similarly invalidated after identity changes.
    await click('Edit preparation');await evaluate("window.editField('Project summary','Delayed save content')");await evaluate('window.deferPreparation=true;window.resolvePreparation=null');await click('Save changes');await waitFor('!!window.resolvePreparation');
    await evaluate("window.switchSession('steward.testnet')");await waitFor("document.body.innerText.includes('unavailable for your signed-in account')");await evaluate('window.resolvePreparation()');await delay(80);
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Delayed save content')"),false);
    await evaluate("window.switchSession('founder.testnet')");await waitFor("document.body.innerText.includes('Delayed save content')");
    await evaluate("window.sessionAccount=null;window.dispatchEvent(new Event('focus'))");await waitFor("document.body.innerText.includes('Sign in or renew')&&!document.querySelector('main').textContent.includes('PRIVATE')");
    await evaluate("window.records.versions=[];window.advance('unknown');window.switchSession('founder.testnet')");
    await waitFor("document.body.innerText.includes('Completion could not be confirmed')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Prepare my Blueprint')"),false);
    assert.equal(await evaluate('window.generationCalls'),1);
    assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
    const audit=await evaluate('window.audit');assert.ok(audit.every(a=>['/api/auth/session','/api/auth/logout','/api/creations/yawrd-aaaaaaaaaaaa/preparation','/api/creations/yawrd-aaaaaaaaaaaa/platform-fee'].includes(a.url)||a.url==='/api/creations/yawrd-aaaaaaaaaaaa'&&a.method==='GET'));assert.ok(audit.every(a=>!a.data||['generate','save','approve'].includes(a.data.action)||a.url==='/api/auth/logout'));
  }finally{
    ws?.close();if(browser&&browser.exitCode===null)await new Promise(r=>{browser.once('close',r);browser.kill();setTimeout(r,2000).unref();});
    await new Promise(r=>server?server.close(r):r());await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:50});
  }
});
