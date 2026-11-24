// Focused disabled-gate UI check only. Auth/wallet components are stubs: no wallet tests or services.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const require=createRequire(import.meta.url);

test('disabled beta has its own UI; service errors and stale responses never admit Creation', {timeout:60000},async()=>{
  const temporary=await mkdtemp('/tmp/yawrd-admission-status-');
  let server,browser,ws,sequence=0;
  const pending=new Map();
  function call(method,params={}){return new Promise((resolveCall,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},10000);
    pending.set(id,{resolve:value=>{clearTimeout(timer);resolveCall(value);},reject});ws.send(JSON.stringify({id,method,params}));
  });}
  async function evaluate(expression){const value=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert.ok(!value.exceptionDetails,JSON.stringify(value.exceptionDetails));return value.result.value;}
  async function waitFor(expression){for(let i=0;i<150;i++){if(await evaluate(expression))return;await delay(30);}assert.fail(expression+'\n'+await evaluate('document.body.textContent')+'\n'+await evaluate('window.__errors'));}
  try{
    await writeFile(temporary+'/tsx-loader.cjs','const ts=require('+JSON.stringify(require.resolve('typescript'))+');module.exports=s=>ts.transpileModule(s,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;');
    await writeFile(temporary+'/css-loader.cjs','module.exports=()=>\'export default new Proxy({}, {get:(_,key)=>key});\';');
    await writeFile(temporary+'/entry.tsx',`
      import React from 'react';import {createRoot} from 'react-dom/client';
      import CreationAdmission from ${JSON.stringify(resolve('app/create/creation-admission.tsx'))};
      window.React=React;
      window.mode='disabled';window.requests=[];window.defer=false;
      window.fetch=async(url,options={})=>{
        if(url!=='/api/creations/admission')throw Error('Unexpected service request');
        window.requests.push({url,method:options.method||'GET'});
        const mode=window.mode;
        if(window.defer){window.defer=false;return new Promise(resolve=>window.finishDeferred=()=>resolve(Response.json({accountId:'synthetic-founder.testnet',admitted:true,expiresAt:Date.now()+3600000})));}
        if(mode==='disabled')return Response.json({error:'not_found'},{status:404});
        if(mode==='unavailable')return Response.json({error:'service_unavailable'},{status:503});
        if(mode==='malformed404')return new Response('Not found',{status:404});
        return Response.json({accountId:'synthetic-founder.testnet',admitted:true,expiresAt:Date.now()+3600000});
      };
      window.refresh=mode=>{window.mode=mode;window.dispatchEvent(new Event('focus'));};
      createRoot(document.getElementById('root')).render(<CreationAdmission><div data-private-intake>Protected intake placeholder</div></CreationAdmission>);
    `);
    const webpack=require('next/dist/compiled/webpack/webpack').webpack;
    await new Promise((done,reject)=>{
      const compiler=webpack({mode:'development',devtool:false,target:'web',cache:false,entry:temporary+'/entry.tsx',output:{path:temporary,filename:'bundle.js'},
        resolve:{extensions:['.tsx','.ts','.js'],modules:[resolve('node_modules'),'node_modules']},
        externals:[({request},cb)=>{const mocks={'next/navigation':'__navigation','../use-testnet-wallet':'__wallet',
          '../components/account-authentication':'__authentication','./security-creations':'__security','../components/route-account-controls':'__controls'};
          cb(null,mocks[request]?'window '+mocks[request]:undefined);}],
        module:{rules:[{test:/\.tsx?$/,use:temporary+'/tsx-loader.cjs'},{test:/\.module\.css$/,use:temporary+'/css-loader.cjs'}]}});
      compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):done()));
    });
    const bundle=await readFile(temporary+'/bundle.js');
    server=createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle);}else{res.setHeader('content-type','text/html');res.end(`<!doctype html><div id="root"></div><script>
      window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));
      window.__navigation={usePathname:()=>'/create'};
      window.__wallet={useTestnetWallet:()=>({ready:true,accountId:null,getContext:()=>({accountId:null,network:'testnet'})})};
      window.__authentication={__esModule:true,default:()=>window.React.createElement('div',{'data-authentication':true},'Existing sign-in component placeholder')};
      window.__security={__esModule:true,default:()=>null};window.__controls={ACCOUNT_SESSION_CHANGED:'yawrd:session-changed'};
      </script><script src="/bundle.js"></script>`);}});
    await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
    browser=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--disable-extensions','--disable-background-networking','--disable-component-update',
      '--no-first-run','--no-default-browser-check','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--user-data-dir='+temporary+'/profile','--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
    let port;
    for(let i=0;i<150;i++){try{port=Number((await readFile(temporary+'/profile/DevToolsActivePort','utf8')).split('\n')[0]);break;}catch{await delay(30);}}
    assert.ok(port);
    const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise(done=>ws.addEventListener('open',done,{once:true}));
    ws.addEventListener('message',event=>{const msg=JSON.parse(String(event.data));if(msg.id){const job=pending.get(msg.id);if(job){pending.delete(msg.id);msg.error?job.reject(Error(msg.error.message)):job.resolve(msg.result);}}});
    await call('Page.enable');await call('Runtime.enable');await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
    const closed="document.querySelector('h1')?.textContent==='Opening a Yawrd is not available yet'";
    await waitFor(closed);
    assert.equal(await evaluate("!!document.querySelector('[data-private-intake],[data-authentication],[role=alert]')"),false);
    assert.equal(await evaluate("document.querySelector('a').getAttribute('href')"),'/#discover');
    for(const mode of ['unavailable','malformed404']){
      await evaluate(`window.refresh('${mode}')`);await waitFor("document.querySelector('h1')?.textContent==='Check your sign-in'");
      assert.equal(await evaluate("!!document.querySelector('[data-private-intake]')"),false);
      assert.ok(await evaluate("document.querySelector('[role=alert]').textContent.includes('could not be checked')"));
    }
    await evaluate("window.refresh('approved')");await waitFor("!!document.querySelector('[data-private-intake]')");
    await evaluate("window.refresh('disabled')");await waitFor(closed);
    assert.equal(await evaluate("!!document.querySelector('[data-private-intake]')"),false,'closing the gate removes previously admitted content');
    await evaluate("window.defer=true;window.refresh('approved')");await waitFor("typeof window.finishDeferred==='function'");
    await evaluate("window.refresh('disabled')");await waitFor(closed);await evaluate('window.finishDeferred()');await delay(50);
    assert.ok(await evaluate(closed));assert.equal(await evaluate("!!document.querySelector('[data-private-intake]')"),false);
    assert.ok(await evaluate("window.requests.every(r=>r.url==='/api/creations/admission'&&r.method==='GET')"),'no auth, wallet or private API calls');
  }finally{
    ws?.close();if(browser&&browser.exitCode===null){const exit=new Promise(done=>browser.once('exit',done));browser.kill('SIGKILL');await exit;}
    if(server)await new Promise(done=>server.close(done));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
