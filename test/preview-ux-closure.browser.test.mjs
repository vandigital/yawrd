// R3.7 offline UX regression: real Admission/contribution/Steward/progress UI, synthetic APIs only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const require=createRequire(import.meta.url);

test('background admission and contribution saves preserve position/focus; account changes fail closed; Steward and generation UI are accessible', {timeout:60000},async()=>{
  const temporary=await mkdtemp('/tmp/yawrd-r37-ux-');
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
    await writeFile(temporary+'/css-loader.cjs',`const path=require('node:path');module.exports=function(){const prefix=path.relative(process.cwd(),this.resourcePath).replace(/[^A-Za-z0-9]/g,'_')+'__';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,key)=>'+JSON.stringify(prefix)+'+key})}';};`);
    await writeFile(temporary+'/entry.tsx',`
      import React from 'react';import {createRoot} from 'react-dom/client';
      import Admission from ${JSON.stringify(resolve('app/create/creation-admission.tsx'))};
      import Contributions from ${JSON.stringify(resolve('app/create/[id]/contributions/contribution-panel.tsx'))};
      import Security from ${JSON.stringify(resolve('app/create/security-creations.tsx'))};
      import {GenerationProgress} from ${JSON.stringify(resolve('app/create/[id]/blueprint/generation-progress.tsx'))};
      import {preparationView} from ${JSON.stringify(resolve('test/fixtures/preparation.ts'))};
      import {initialContributionConfiguration} from ${JSON.stringify(resolve('src/creation/contribution-configuration.ts'))};
      import progressStyles from ${JSON.stringify(resolve('app/create/[id]/blueprint/preparation.module.css'))};
      window.React=React;window.account='founder.testnet';window.audit=[];window.mode='private';window.saves=0;
      const blueprint=preparationView('a'.repeat(64)),id=blueprint.binding.creationId;
      const tasks=Array.from({length:8},(_,i)=>({...structuredClone(blueprint.versions[0].artifacts.tasks[0]),id:'task-'+i,title:'Synthetic contribution '+(i+1),dependencies:[],rewardTerms:'undecided'}));
      const approved={revision:1,digest:'a'.repeat(64),title:'Synthetic Preview project',tasks,references:blueprint.versions[0].artifacts.references};
      const configuration=initialContributionConfiguration(approved);
      window.record={binding:blueprint.binding,approved,saved:{revision:1,source:approved,configuration,digest:'b'.repeat(64),savedBy:window.account,savedAt:new Date().toISOString()}};
      window.fetch=async(url,options={})=>{
        window.audit.push({url,method:options.method||'GET'});
        if(url==='/api/auth/session')return Response.json({accountId:window.account});
        if(url==='/api/creations/admission'){
          const snapshot={accountId:window.account,admitted:window.account==='founder.testnet',expiresAt:window.account?Date.now()+3600000:null};
          if(window.deferAdmission){window.deferAdmission=false;return new Promise(done=>window.finishAdmission=()=>done(Response.json(snapshot)));}
          return Response.json(snapshot);
        }
        if(url==='/api/creations/security')return Response.json({items:[{id:'yawrd-aaaaaaaaaaaa',name:'Sample Bounce Yawrd',daoAccountId:'sample-one.factory.yawrd.testnet'},{id:'yawrd-bbbbbbbbbbbb',name:'Second sample Yawrd',daoAccountId:'sample-two.factory.yawrd.testnet'}]});
        if(url==='/api/creations/'+id+'/contributions'){
          if(window.account!=='founder.testnet')return Response.json({error:'creation_not_found'},{status:404});
          if(options.method==='POST'){window.saves++;const data=JSON.parse(options.body);window.record.saved={...window.record.saved,revision:window.record.saved.revision+1,configuration:data.configuration};}
          return Response.json(window.record);
        }
        throw Error('Unexpected service request: '+url);
      };
      function App(){const [mode,setMode]=React.useState('private'),[stage,setStage]=React.useState('waiting'),[selected,setSelected]=React.useState('founder.testnet');
        window.setMode=setMode;window.setStage=setStage;window.changeWallet=account=>{window.walletAccount=account;setSelected(account);};
        if(mode==='visual'){
          const now=new Date().toISOString(),generation={installed:true,canGenerate:false,model:'Qwen/Qwen3.8-27B',consentVersion:'creation-ai-preparation-v1',partnerProvider:false,
            attempt:{id:'synthetic-attempt',state:stage,model:'Qwen/Qwen3.8-27B',sourceDigest:'a'.repeat(64),reservedAt:now,dispatchedAt:stage==='reserved'?null:now,responseAt:stage==='checking'?now:null,finishedAt:null,deadlineAt:new Date(Date.now()+3600000).toISOString(),errorCode:null,resultRevision:null,usage:null},
            inputBytesLimit:24000,outputTokensLimit:8000,providerTimeoutMs:180000,allowance:1};
          return <div className="visual"><section id="steward"><Security accountId="second.testnet"/></section><main className={progressStyles.page}><GenerationProgress generation={generation} running={true} onGenerate={()=>{throw Error('No inference permitted');}} onCheck={()=>{throw Error('No status polling in visual fixture');}}/></main></div>;
        }
        return <Admission><Contributions creationId={id}/></Admission>;
      }
      createRoot(document.getElementById('root')).render(<App/>);
    `);
    const webpack=require('next/dist/compiled/webpack/webpack').webpack;
    await new Promise((done,reject)=>{
      const compiler=webpack({mode:'development',devtool:false,target:'web',cache:false,entry:temporary+'/entry.tsx',output:{path:temporary,filename:'bundle.js'},
        resolve:{extensions:['.tsx','.ts','.js'],modules:[resolve('node_modules'),'node_modules']},
        externals:[({request},cb)=>{const mocks={'next/navigation':'__navigation','../use-testnet-wallet':'__wallet','../../../use-testnet-wallet':'__wallet',
          '../components/account-authentication':'__authentication','../components/route-account-controls':'__controls','../../../components/route-account-controls':'__controls'};
          cb(null,mocks[request]?'window '+mocks[request]:undefined);}],
        module:{rules:[{test:/\.tsx?$/,use:temporary+'/tsx-loader.cjs'},{test:/\.module\.css$/,use:temporary+'/css-loader.cjs'}]}});
      compiler.run((error,stats)=>compiler.close(()=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):done()));
    });
    const bundle=await readFile(temporary+'/bundle.js');
    const utility=(await require('postcss')([require('@tailwindcss/postcss')()]).process(await readFile('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css;
    const css=(await Promise.all(['app/create/welcome.module.css','app/create/[id]/contributions/contributions.module.css','app/create/[id]/blueprint/preparation.module.css'].map(async file=>{
      const prefix=relative(resolve('.'),resolve(file)).replace(/[^A-Za-z0-9]/g,'_')+'__';
      const parsed=require('postcss').parse(await readFile(file,'utf8'));
      parsed.walkRules(rule=>{rule.selector=rule.selector.replace(/\.([_a-zA-Z][\w-]*)/g,(_,key)=>'.'+prefix+key);});return parsed.toString();
    }))).join('\n');
    server=createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle);}else{res.setHeader('content-type','text/html');res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${utility}\n${css}\nbody{background:#001819;color:#d8e7e2}.visual{max-width:1000px;margin:auto;padding:24px}#steward{max-width:640px;margin:auto}#steward h3{font-size:24px}</style><div id="root"></div><script>
      window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));window.walletAccount='founder.testnet';
      window.__navigation={usePathname:()=>'/create/yawrd-aaaaaaaaaaaa/contributions'};
      window.__wallet={useTestnetWallet:()=>({ready:true,accountId:window.walletAccount,getContext:()=>({accountId:window.walletAccount,network:'testnet'})})};
      window.__authentication={__esModule:true,default:()=>window.React.createElement('div',null,'Existing sign-in UI placeholder')};
      window.__controls={ACCOUNT_SESSION_CHANGED:'yawrd:session-changed',openAccountDisclosure:()=>{}};
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
    const note="document.querySelector('textarea[placeholder]')";
    const tick=()=>evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))');
    await waitFor(`!!${note}`);
    await evaluate(`(()=>{const el=${note};Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Retained local draft');el.dispatchEvent(new Event('input',{bubbles:true}));el.focus({preventScroll:true});scrollTo({top:900,behavior:'instant'});})()`);
    await tick();const before=await evaluate('scrollY');assert.ok(before>500);
    await evaluate("window.deferAdmission=true;window.dispatchEvent(new Event('focus'))");await waitFor("typeof window.finishAdmission==='function'");await tick();
    assert.equal(await evaluate('scrollY'),before,'pending background check preserves page height and scroll');
    assert.ok(await evaluate(`${note}===document.activeElement`),'background check preserves keyboard focus');
    assert.equal(await evaluate(`${note}.value`),'Retained local draft');
    await evaluate('window.finishAdmission()');await waitFor("!document.querySelector('[aria-busy=true]')");await tick();
    assert.equal(await evaluate('scrollY'),before,'successful background check preserves scroll');
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Save draft').click()");await waitFor('window.saves===1');
    await waitFor("document.body.textContent.includes('✓ Saved. You can safely leave this page.')");await tick();
    assert.equal(await evaluate('scrollY'),before,'successful real contribution component save preserves position');
    assert.equal(await evaluate(`${note}.value`),'Retained local draft');
    assert.equal(await evaluate("[...document.querySelectorAll('a')].find(a=>a.textContent==='Continue to work approval').getAttribute('href')"),'/create/yawrd-aaaaaaaaaaaa/governance');
    // Existing native navigation targets are untouched; account changes still clear private UI.
    await evaluate("window.changeWallet('other.testnet')");await waitFor(`!${note}`);
    await evaluate("window.account='other.testnet';window.dispatchEvent(new Event('yawrd:session-changed'))");
    await waitFor("document.body.textContent.includes('Opening a Yawrd is currently invite-only.')");assert.equal(await evaluate(`!!${note}`),false);
    await evaluate("window.changeWallet('founder.testnet');window.account='founder.testnet';window.dispatchEvent(new Event('yawrd:session-changed'))");await waitFor(`!!${note}`);
    await evaluate("window.deferAdmission=true;window.dispatchEvent(new Event('focus'))");await waitFor("typeof window.finishAdmission==='function'");
    await evaluate("window.account=null;window.dispatchEvent(new Event('yawrd:session-changed'))");await waitFor("document.body.textContent.includes('Sign in to open a Yawrd')");
    await evaluate('window.finishAdmission()');await tick();assert.equal(await evaluate(`!!${note}`),false,'late old admission cannot restore private data');
    await evaluate("window.setMode('visual')");await waitFor("document.querySelectorAll('#steward a').length===2");
    const links=await evaluate("[...document.querySelectorAll('#steward a')].map(a=>({text:a.textContent,href:a.getAttribute('href'),height:a.getBoundingClientRect().height}))");
    assert.deepEqual(links.map(l=>l.href),['/create/yawrd-aaaaaaaaaaaa/secure','/create/yawrd-bbbbbbbbbbbb/secure']);
    assert.ok(links.every(l=>l.text.startsWith('Review security — ')&&l.height>=44));
    await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    for(const [stage,label] of [['reserved','Preparation request saved'],['waiting','Request started'],['checking','Response received']]){
      await evaluate(`window.setStage('${stage}')`);await waitFor(`document.querySelector('li[aria-current=step]')?.textContent.includes('${label}')`);
      assert.ok(await evaluate("document.querySelector('li[aria-current=step]').textContent.includes('Active now')"));
      assert.ok(await evaluate("[...document.querySelectorAll('[role=status]')].some(e=>e.textContent.startsWith('In progress:'))"));
      assert.equal(await evaluate("getComputedStyle(document.querySelector('li[aria-current=step] > span')).animationName"),'none');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('li[aria-current=step]')).borderTopWidth"),'2px');
    }
    for(const width of [390,1440]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});await tick();
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
      const box=await call('Runtime.evaluate',{expression:"(()=>{const r=document.getElementById('steward').getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()",returnByValue:true});
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:box.result.value});
      await writeFile('/tmp/yawrd-r37-steward-'+width+'.png',Buffer.from(shot.data,'base64'));
      const all=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/yawrd-r37-progress-'+width+'.png',Buffer.from(all.data,'base64'));
    }
    assert.equal(await evaluate("window.audit.filter(r=>r.method==='POST').length"),1,'only the synthetic contribution save');
    assert.deepEqual(await evaluate('window.__errors'),[]);
  }finally{
    ws?.close();if(browser&&browser.exitCode===null){const exit=new Promise(done=>browser.once('exit',done));browser.kill('SIGKILL');await exit;}
    if(server)await new Promise(done=>server.close(done));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
