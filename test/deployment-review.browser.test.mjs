// Offline deployment-button regression. Synthetic views only; submission and wallet launch are stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const require=createRequire(import.meta.url);

test('server-authorized fresh Preview request enables approval without Development pins; unsafe states stay disabled', {timeout:60000},async()=>{
  const temporary=await mkdtemp('/tmp/yawrd-deployment-review-');
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
      import DeploymentReview from ${JSON.stringify(resolve('app/create/setup/deployment-review.tsx'))};
      import {prepareCreation} from ${JSON.stringify(resolve('src/creation-integration.ts'))};
      import {testnetFactorySettings} from ${JSON.stringify(resolve('src/testnet-factory-settings.ts'))};
      window.React=React;
      const founder='synthetic-founder.testnet',identifier='c1d2e3f4g5h6';
      const creation={id:'yawrd-bbbbbbbbbbbb',founderAccountId:founder,network:'testnet',revision:3};
      const prepared=prepareCreation({projectName:'Synthetic Preview project',projectPurpose:'Synthetic public description',projectAccountLabel:identifier,
        creatorAccountId:founder,initialStewardAccountIds:['synthetic-steward.testnet'],stewardApprovalThreshold:2,
        factoryAccountId:testnetFactorySettings.factoryAccountId},testnetFactorySettings,{accountId:founder,network:'testnet'});
      const intent={creationId:creation.id,network:'testnet',factoryAccountId:testnetFactorySettings.factoryAccountId,identifier,
        daoAccountId:prepared.plan.daoAccountId,sourceRevision:3,revision:1,state:'prepared',prepared,requestDigest:'a'.repeat(64),
        costs:{setupDepositYocto:testnetFactorySettings.setupDepositYocto,createGas:testnetFactorySettings.createGas,observedGasPriceYocto:'100000000',attachedGasAtObservedPriceYocto:'30000000000000000000000',blockHash:'B'.repeat(43),blockHeight:'100',costConfirmation:'Synthetic quote'},preparedAt:'2026-11-24T00:00:00Z',attempt:0,claimedAt:null,notBeforeHeight:null,transactionHash:null,
        lastEvidence:null,evidenceAttempt:null,createdAt:'2026-11-24T00:00:00Z',updatedAt:'2026-11-24T00:00:00Z'};
      window.fresh={intent,submissionEnabled:true,deploymentRecorded:false,fundingEnabled:false,publicationEnabled:false,platformFeesEnabled:false};
      window.view=structuredClone(window.fresh);window.requests=[];
      window.fetch=async(url,options={})=>{
        if(url!=='/api/creations/'+creation.id+'/deployment'||options.method!=='GET')throw Error('Unexpected request: no real mutation permitted');
        window.requests.push({url,method:options.method});return Response.json(structuredClone(window.view));
      };
      const noop=()=>{};
      function App(){const [disabled,setDisabled]=React.useState(false);window.setUnsaved=setDisabled;
        return <DeploymentReview creation={creation} disabled={disabled} onIdentifier={noop} onRecorded={noop}/>;}
      createRoot(document.getElementById('root')).render(<App/>);
    `);
    const webpack=require('next/dist/compiled/webpack/webpack').webpack;
    await new Promise((done,reject)=>{
      const compiler=webpack({mode:'development',devtool:false,target:'web',cache:false,entry:temporary+'/entry.tsx',output:{path:temporary,filename:'bundle.js'},
        resolve:{extensions:['.tsx','.ts','.js'],modules:[resolve('node_modules'),'node_modules']},
        externals:[({request},cb)=>{const mocks={'../../use-testnet-wallet':'__wallet','../../meteor-wallet-launch':'__launch','./deployment-submit':'__submit'};
          cb(null,mocks[request]?'window '+mocks[request]:undefined);}],
        module:{rules:[{test:/\.tsx?$/,use:temporary+'/tsx-loader.cjs'},{test:/\.module\.css$/,use:temporary+'/css-loader.cjs'}]}});
      compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):done()));
    });
    const bundle=await readFile(temporary+'/bundle.js');
    server=createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle);}else{res.setHeader('content-type','text/html');res.end(`<!doctype html><div id="root"></div><script>
      window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));
      window.submissions=0;window.reservations=0;window.releases=0;window.popupAllowed=true;
      window.__wallet={useTestnetWallet:()=>({getContext:()=>({accountId:'synthetic-founder.testnet',network:'testnet'}),
        prepareCreation:()=>{throw Error('No wallet calls allowed');},signCreation:()=>{throw Error('No wallet calls allowed');}})};
      window.__launch={reserveMeteorAuthorizationWindow:()=>{if(!window.popupAllowed)return null;window.reservations++;return {release:()=>window.releases++,connectorCall:()=>{throw Error('No connector calls allowed');}};}};
      window.__submit={submitDeployment:options=>{window.submissions++;window.reviewedSubmission=structuredClone(options.reviewed);
        return new Promise(resolve=>window.finishSubmission=()=>resolve({...window.fresh,submissionEnabled:false,intent:{...window.fresh.intent,state:'unknown',attempt:1}}));}};
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
    const button="[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Open a Yawrd'))";
    const enabled=`!(${button}).disabled`;
    const checkbox="document.querySelector('input[type=checkbox]')";
    const reload="[...document.querySelectorAll('button')].find(b=>b.textContent==='Reload deployment state').click()";
    await waitFor("!!document.querySelector('input[type=checkbox]')");
    assert.equal(await evaluate(enabled),false,'review checkbox required');
    await evaluate(`${checkbox}.click()`);await waitFor(enabled);
    assert.ok(await evaluate("document.body.textContent.includes('Testnet deployment attempt 1 is authorized')"));
    assert.ok(await evaluate("document.body.textContent.includes('Upcoming attempt 1')"));
    assert.equal(await evaluate("document.body.textContent.includes('Development')"),false);
    // Unsaved edits, server denial/missing authorization, and every non-prepared state stay blocked.
    await evaluate('window.setUnsaved(true)');await waitFor(`!(${enabled})`);
    await evaluate('window.setUnsaved(false)');await waitFor(enabled);
    async function load(change){
      await evaluate(`window.view=structuredClone(window.fresh);${change};${reload}`);
      await evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))');
      await waitFor("![...document.querySelectorAll('button')].some(b=>b.textContent==='Working…')");
    }
    for(const change of ["window.view.submissionEnabled=false","delete window.view.submissionEnabled",
      ...['reserved','wallet-requested','unknown','failed','deployed-hardening-required'].map(state=>`window.view.intent.state='${state}'`),
      'window.view.intent.prepared=null','window.view.intent=null']){
      await load(change);
      const check=await evaluate(`!!${checkbox}&&!${checkbox}.disabled`);
      if(check)await evaluate(`${checkbox}.click()`);
      assert.equal(await evaluate(enabled),false,change);
    }
    // Development recovery still uses the server decision and saved history, with upcoming attempt 2.
    await load("window.view.intent.attempt=1;window.view.intent.costs.retiredAttempts=[{attempt:1,requestDigest:window.view.intent.requestDigest}]" );
    await evaluate(`${checkbox}.click()`);await waitFor(enabled);
    assert.ok(await evaluate("document.body.textContent.includes('interrupted attempt 1 was retired')"));
    assert.ok(await evaluate("document.body.textContent.includes('Attempt 2 is authorized')"));
    await load('window.view.submissionEnabled=false');await evaluate(`${checkbox}.click()`);
    assert.equal(await evaluate(enabled),false);
    // Popup failure remains pre-claim and uses environment-neutral wording.
    await load('');await evaluate(`${checkbox}.click();window.popupAllowed=false;(${button}).click()`);
    await waitFor("document.querySelector('[role=alert]')?.textContent.includes('Allow popups for this site')");
    assert.equal(await evaluate('window.submissions'),0);
    assert.equal(await evaluate('window.reservations'),0);
    // An in-flight approval cannot start a duplicate; this stub never calls a wallet or API mutation.
    await evaluate(`window.popupAllowed=true;(${button}).click()`);await waitFor('window.submissions===1');
    assert.equal(await evaluate(enabled),false);
    await evaluate(`(${button}).click()`);assert.equal(await evaluate('window.submissions'),1);
    assert.ok(await evaluate('JSON.stringify(window.reviewedSubmission)===JSON.stringify(window.fresh.intent)'),'saved request passed unchanged');
    await evaluate('window.finishSubmission()');await waitFor('window.releases===1');
    assert.equal(await evaluate(enabled),false,'unresolved returned view remains disabled');
    assert.ok(await evaluate("window.requests.every(r=>r.method==='GET')"),'no POST, database, RPC or wallet transactions');
  }finally{
    ws?.close();if(browser&&browser.exitCode===null){const exit=new Promise(done=>browser.once('exit',done));browser.kill('SIGKILL');await exit;}
    if(server)await new Promise(done=>server.close(done));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
