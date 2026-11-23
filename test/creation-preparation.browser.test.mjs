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

test('preparation edits, approves and resumes; Account changes suppress delayed private responses',{timeout:90000},async()=>{
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
import {NavigationShell} from ${JSON.stringify(resolve('app/components/global-navigation.tsx'))};
import {TestnetWalletProvider,useTestnetWallet} from ${JSON.stringify(resolve('app/use-testnet-wallet.ts'))};
import {preparationView} from ${JSON.stringify(resolve('test/fixtures/preparation.ts'))};
window.React=React;
window.sessionAccount='founder.testnet';window.audit=[];
window.records=JSON.parse(sessionStorage.getItem('preparation-record')||'null')||preparationView('a'.repeat(64));
const persist=()=>sessionStorage.setItem('preparation-record',JSON.stringify(window.records));
window.switchSession=account=>{window.sessionAccount=account;window.dispatchEvent(new Event('yawrd:session-changed'));};
window.__nearMock={NearConnector:class{
  constructor(){this.network='testnet';this.availableWallets=[];this.whenManifestLoaded=Promise.resolve();this.events={};}
  on(e,f){this.events[e]=f;}off(e){delete this.events[e];}async getConnectedWallet(){throw Error('Disconnected');}
}};
window.fetch=async(url,options={})=>{
  const data=options.body?JSON.parse(options.body):null;
  window.audit.push({url,method:options.method||'GET',data});
  if(url==='/api/auth/session')return Response.json({accountId:window.sessionAccount});
  if(url==='/api/auth/logout'){window.sessionAccount=null;return Response.json({});}
  if(url.endsWith('/preparation')){
    if(window.sessionAccount!=='founder.testnet')return Response.json({error:window.sessionAccount?'creation_not_found':'sign_in_required'},{status:window.sessionAccount?404:401});
    if(options.headers['x-yawrd-account']!==window.sessionAccount)return Response.json({error:'creation_session_changed'},{status:409});
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
createRoot(document.getElementById('root')).render(<TestnetWalletProvider><NavigationShell><Observer/><React.StrictMode><Panel creationId="yawrd-aaaaaaaaaaaa"/></React.StrictMode></NavigationShell></TestnetWalletProvider>);
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
    const files=['app/components/global-navigation.module.css','app/create/[id]/blueprint/preparation.module.css'];
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
    await call('Page.enable');await call('Runtime.enable');await call('Fetch.enable',{patterns:[{urlPattern:'*'}]});await call('Page.navigate',{url:local+'/'});
    await waitFor("document.body.innerText.includes('Community seed survey')&&!document.body.innerText.includes('Checking your private')");
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
    assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
    const audit=await evaluate('window.audit');assert.ok(audit.every(a=>['/api/auth/session','/api/auth/logout','/api/creations/yawrd-aaaaaaaaaaaa/preparation'].includes(a.url)));assert.ok(audit.every(a=>!a.data||['save','approve'].includes(a.data.action)||a.url==='/api/auth/logout'));
  }finally{
    ws?.close();browser?.kill();await new Promise(r=>server?server.close(r):r());await rm(temporary,{recursive:true,force:true});
  }
});
