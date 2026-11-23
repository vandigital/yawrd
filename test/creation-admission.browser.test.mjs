// Focused offline React interaction checks using existing Chromium/webpack.
// Uses mocked routing, auth HTTP and a wallet connector; no live services.
// Compiles existing CSS with the installed PostCSS toolchain; all API data is synthetic.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseYawrdIntakeDraft } from '../src/yawrd-intake.ts';
import { authorizedCreationDeployment, testnetFactorySettings } from '../src/testnet-factory-settings.ts';
import { prepareCreation } from '../src/creation-integration.ts';
import { COPY_INTAKE_QUESTIONS } from '../src/creation-intake.ts';

const require = createRequire(import.meta.url);

test('Creation admission reuses wallet authentication, blocks nonmembers, and preserves intake and resume', {timeout:90000}, async () => {
  const temporary = await mkdtemp('/tmp/yawrd-account-browser-');
  let server, browser, ws, sequence = 0;
  const pending = new Map(), blocked = [];
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 10000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(expression)) return;
      await delay(30);
    }
    assert.fail('Browser condition timed out: ' + expression);
  }
  try {
    await writeFile(temporary + '/tsx-loader.cjs', 'const ts=require(' + JSON.stringify(require.resolve('typescript')) + ');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText};');
    await writeFile(temporary + '/css-loader.cjs', `const path=require('node:path');module.exports=function(){const prefix=path.relative(process.cwd(),this.resourcePath).replace(/[^A-Za-z0-9]/g,'_')+'__';return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,key)=>'+JSON.stringify(prefix)+'+key})}';};`);
    const entry = String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import Welcome from ${JSON.stringify(resolve("app/create/creation-welcome.tsx"))};
import Layout from ${JSON.stringify(resolve("app/create/layout.tsx"))};
import {NavigationShell} from ${JSON.stringify(resolve("app/components/global-navigation.tsx"))};
import {TestnetWalletProvider,useTestnetWallet} from ${JSON.stringify(resolve("app/use-testnet-wallet.ts"))};
import {RouteAccountControls} from ${JSON.stringify(resolve("app/components/route-account-controls.tsx"))};
import {ProjectWalletControls} from ${JSON.stringify(resolve("app/components/project-wallet-controls.tsx"))};
import {createEmptyYawrdIntakeDraft,updateYawrdIntakeDraft} from ${JSON.stringify(resolve("src/yawrd-intake.ts"))};
window.React=React;window.audit=JSON.parse(sessionStorage.getItem('r1-audit')||'[]');
window.account=sessionStorage.getItem('r1-account');window.expires=Number(sessionStorage.getItem('r1-expires'))||Date.now()+3600000;
window.walletAccount=sessionStorage.getItem('r1-wallet')||'founder.testnet';window.connected=sessionStorage.getItem('r1-connected')==='1';
window.setSession=(account,expires=Date.now()+3600000)=>{window.account=account;window.expires=expires;if(account)sessionStorage.setItem('r1-account',account);else sessionStorage.removeItem('r1-account');sessionStorage.setItem('r1-expires',String(expires));window.dispatchEvent(new Event('yawrd:session-changed'));};
window.__nearMock={NearConnector:class{
 constructor(){this.network='testnet';this.events={};window.connector=this;this.wallet={manifest:{id:'meteor-wallet'},getAccounts:async()=>[{accountId:window.walletAccount}],signMessage:async p=>{window.proofs=(window.proofs||0)+1;return {accountId:p.signerId,publicKey:'synthetic',signature:'synthetic'};},signAndSendTransaction:async()=>{throw Error('No transactions allowed');}};this.availableWallets=[this.wallet];this.whenManifestLoaded=Promise.resolve();}
 on(e,f){this.events[e]=f;}off(e){delete this.events[e];}
 async getConnectedWallet(){if(!window.connected)throw Error('Disconnected');return {wallet:this.wallet};}
 async connect(){window.connected=true;sessionStorage.setItem('r1-connected','1');this.events['wallet:signIn']?.({wallet:this.wallet,accounts:await this.wallet.getAccounts()});}
 async disconnect(){window.connected=false;sessionStorage.removeItem('r1-connected');this.events['wallet:signOut']?.({});}
}};
window.switchWallet=account=>{window.walletAccount=account;sessionStorage.setItem('r1-wallet',account);window.connector.events['wallet:signIn']?.({wallet:window.connector.wallet,accounts:[{accountId:account}]});};
const intake={...updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft('synthetic-saved','2026-11-23T00:00:00Z'),{projectType:'community',startingPoint:'idea',availableResources:'Synthetic public tools',successCriteria:'A synthetic useful first result',intendedBudget:'undecided',founderDescription:'Synthetic project answers for a bounded test',initialOutcomeConfirmed:true},'2026-11-23T00:00:00Z'),projectName:'Saved synthetic project'};
const saved={id:'yawrd-aaaaaaaaaaaa',network:'testnet',founderAccountId:'founder.testnet',sourceDraftId:intake.draftId,revision:3,intake,initialIntake:intake,configuration:{publicName:'Synthetic public title',publicDescription:'Synthetic public overview',accountLabel:'',secondSteward:'second.testnet',threshold:2},publicTextDigest:'a'.repeat(64),publicTextReview:null,createdAt:'2026-11-23T00:00:00Z',updatedAt:'2026-11-23T00:00:00Z'};
window.fetch=async(url,options={})=>{
 window.audit.push({url,method:options.method||'GET'});sessionStorage.setItem('r1-audit',JSON.stringify(window.audit));
 const accountId=window.expires>Date.now()?window.account:null;
 if(url==='/api/auth/session')return Response.json({accountId});
 if(url==='/api/creations/admission'){
  const value={accountId,admitted:accountId==='founder.testnet',expiresAt:accountId?window.expires:null,securityAvailable:true};
  if(window.deferAdmission){window.deferAdmission=false;return new Promise(r=>window.resolveAdmission=()=>r(Response.json(value)));}
  return Response.json(value);
 }
 if(url==='/api/auth/challenge'){const p=JSON.parse(options.body);return Response.json({challenge:{id:'a'.repeat(43),accountId:p.accountId,network:'testnet',origin:location.origin,message:'Synthetic NEP-413 sign-in review',recipient:'Yawrd participant sign-in',nonce:btoa('a'.repeat(32)),issuedAt:Date.now(),expiresAt:Date.now()+300000}});}
 if(url==='/api/auth/verify'){const p=JSON.parse(options.body);if(p.proof.accountId!==window.walletAccount||!window.proofs)throw Error('Synthetic proof missing');window.account=p.accountId;window.expires=Date.now()+3600000;sessionStorage.setItem('r1-account',window.account);sessionStorage.setItem('r1-expires',String(window.expires));return Response.json({accountId:window.account});}
 if(url==='/api/auth/logout'){window.account=null;sessionStorage.removeItem('r1-account');return Response.json({});}
 if(url==='/api/creations/security')return Response.json({items:[]});
 if(accountId!=='founder.testnet')return Response.json({error:accountId?'creation_invite_only':'sign_in_required'},{status:accountId?403:401});
 if(url==='/api/creations')return Response.json({items:[{id:saved.id,displayName:saved.intake.projectName}],nextAfterId:null});
 if(url==='/api/creations/'+saved.id)return Response.json({creation:saved});
 if(url.endsWith('/deployment'))return Response.json({intent:null,submissionEnabled:false});
 throw Error('Unexpected synthetic request: '+url);
};
function ProfileFixture(){const wallet=useTestnetWallet();return <RouteAccountControls><ProjectWalletControls wallet={wallet} view={{accountId:window.account,role:'participant',application:null,applications:[],restrictedContent:null}} busy={false} onPrepare={()=>{throw Error('No fixture sign-in')}} onSignOut={()=>window.setSession(null)} onSelect={wallet.selectAccount}/></RouteAccountControls>;}
const creating=location.pathname.startsWith('/create');
createRoot(document.getElementById('root')).render(<TestnetWalletProvider><NavigationShell>{creating?<Layout><Welcome initialIntake={location.pathname==='/create/intake'}/></Layout>:<><ProfileFixture/><main><a href="/create">Open a Yawrd</a></main></>}</NavigationShell></TestnetWalletProvider>);
`;
    await writeFile(temporary + '/entry.tsx', entry);
    const webpack = require('next/dist/compiled/webpack/webpack').webpack;
    await new Promise((resolveBuild, reject) => {
      const compiler = webpack({ mode: 'development', devtool: false, target: 'web', cache: false,
        entry: temporary + '/entry.tsx', output: { path: temporary, filename: 'bundle.js' },
        resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [resolve('node_modules'), 'node_modules'] },
        externals: [({ request }, callback) => callback(null, request === '@hot-labs/near-connect' ? 'window __nearMock' : request === 'next/link' ? 'window __nextLink' : request === 'next/navigation' ? 'window __nextNavigation' : request === 'next/image' ? 'window __nextLink' : undefined)],
        module: { rules: [{ test: /\.tsx?$/, use: temporary + '/tsx-loader.cjs' }, { test: /\.module\.css$/, use: temporary + '/css-loader.cjs' }] },
      });
      compiler.run((error, stats) => compiler.close(() => {
        if (error) reject(error);
        else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
        else resolveBuild();
      }));
    });

    const bundle = await readFile(temporary + '/bundle.js');
    const buoy = await readFile('public/brand/yawrd-buoy.webp');
    const utilityCss = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await readFile('app/globals.css', 'utf8'), { from: resolve('app/globals.css') })).css;
    // Scope local styles like CSS Modules so screenshots reflect the real page.
    const navCss = (await Promise.all(['app/components/global-navigation.module.css', 'app/create/welcome.module.css', 'app/create/intake/intake.module.css', 'app/create/setup/setup.module.css', 'app/create/[id]/secure/hardening.module.css'].map(async file => {
      const prefix = relative(resolve('.'), resolve(file)).replace(/[^A-Za-z0-9]/g, '_') + '__';
      return (await require('postcss')([{ postcssPlugin: 'test-local-styles', Rule(rule) {
        rule.selector = rule.selector.replace(/\.([a-zA-Z_][\w-]*)/g, (_, name) => '.' + prefix + name);
      } }]).process(await readFile(file, 'utf8'), { from: resolve(file) })).css;
    }))).join('\n');
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${utilityCss}\n${navCss}</style><div id="root"></div><script>window.__nextNavigation={usePathname:()=>location.pathname};window.__nextLink=props=>window.React.createElement('a',props,props.children);</script><script src="/bundle.js"></script>`;
    server = createServer((req, res) => {
      if (req.url === '/brand/yawrd-buoy.webp') { res.setHeader('content-type', 'image/webp'); res.end(buoy); }
      else if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); }
      else if (req.url === '/' || req.url.startsWith('/create')) { res.setHeader('content-type', 'text/html'); res.end(html); }
      else { res.statusCode = 404; res.end(); }
    });
    await new Promise((resolveListen, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolveListen);
    });
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = spawn('/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-extensions', '--disable-gpu',
      '--disable-background-networking', '--disable-component-update', '--no-first-run', '--no-default-browser-check',
      '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--remote-debugging-port=0', '--user-data-dir=' + temporary + '/profile', 'about:blank'], { stdio: 'ignore' });
    let port;
    for (let i = 0; i < 150; i++) {
      try { port = Number((await readFile(temporary + '/profile/DevToolsActivePort', 'utf8')).split('\n')[0]); break; }
      catch { await delay(30); }
    }
    assert.ok(port, 'isolated Chromium started');
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolveOpen => ws.addEventListener('open', resolveOpen, { once: true }));
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const job = pending.get(message.id);
        if (job) { pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); }
      }
      if (message.method === 'Fetch.requestPaused') {
        const { requestId, request } = message.params;
        const local = request.url.startsWith(origin + '/');
        if (!local) blocked.push(request.url);
        call(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      }
    });
    await call('Page.enable'); await call('Runtime.enable'); await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await call('Page.navigate',{url:origin});
    await waitFor("!!document.querySelector('main a[href=\"/create\"]')");
    await evaluate("document.querySelector('main a[href=\"/create\"]').click()");
    await waitFor("document.querySelector('main h1')?.textContent==='Sign in to open a Yawrd'");
    assert.equal(await evaluate("!!document.getElementById('intake-name')"),false);
    const click=label=>evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    const terms=()=>evaluate("document.querySelector('main input[type=checkbox]').click()");
    await waitFor("!document.querySelector('main input[type=checkbox]').disabled");
    await terms();await click('Connect wallet');
    await waitFor("document.querySelector('main').textContent.includes('Connected: founder.testnet')");
    assert.equal(await evaluate("!!document.getElementById('intake-name')"),false,'connection alone never admits');
    await click('Sign in');await waitFor("[...document.querySelectorAll('main button')].some(b=>b.textContent==='Approve sign-in message')");await click('Approve sign-in message');
    await waitFor("!!document.getElementById('intake-name')");
    assert.equal(await evaluate("location.pathname"),'/create');assert.equal(await evaluate("window.proofs"),1);
    await evaluate("(()=>{const e=document.getElementById('intake-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Resumable browser draft');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await evaluate("window.dispatchEvent(new Event('focus'))");await waitFor("!!document.getElementById('intake-name')&&!document.querySelector('[aria-busy=true]')");
    assert.equal(await evaluate("document.getElementById('intake-name').value"),'Resumable browser draft','focus recheck preserves edits');
    await click('Back');await waitFor("document.querySelector('main')?.textContent.includes('Welcome back.')");
    await click('Resume Saved synthetic project');await waitFor("document.querySelector('main h1')?.textContent==='Set up your Yawrd'");
    assert.ok(await evaluate("location.search.includes('draft=yawrd-aaaaaaaaaaaa')"));
    await call('Page.reload');await waitFor("document.querySelector('main h1')?.textContent==='Set up your Yawrd'");
    await evaluate("document.querySelector('#global-account summary').click()");
    await waitFor("[...document.querySelectorAll('#global-account button')].some(b=>b.textContent==='Sign out')");
    await evaluate("[...document.querySelectorAll('#global-account button')].find(b=>b.textContent==='Sign out').click()");
    await waitFor("document.querySelector('main h1')?.textContent==='Sign in to open a Yawrd'");
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Saved synthetic project')"),false);
    // A wallet/session mismatch never displays private fields or resumes a draft.
    await evaluate("window.switchWallet('other.testnet');window.setSession('founder.testnet')");
    await waitFor("document.querySelector('main h1')?.textContent==='Check your selected account'");
    assert.equal(await evaluate("!!document.getElementById('intake-name')"),false);
    await terms();await click('Sign in');await waitFor("[...document.querySelectorAll('main button')].some(b=>b.textContent==='Approve sign-in message')");await click('Approve sign-in message');
    await waitFor("document.querySelector('main h1')?.textContent==='Opening a Yawrd is currently invite-only.'");
    assert.equal(await evaluate("document.querySelector('main a').textContent"),'Explore Yawrds');
    assert.equal(await evaluate("document.querySelector('main a').getAttribute('href')"),'/#discover');
    assert.equal(await evaluate("document.querySelectorAll('main input,main textarea,main form').length"),0);
    // Direct protected routes apply the same denial without issuing private reads.
    const reads=await evaluate("window.audit.filter(x=>x.url==='/api/creations/yawrd-aaaaaaaaaaaa').length");
    await call('Page.navigate',{url:origin+'/create?step=setup&draft=yawrd-aaaaaaaaaaaa'});
    await waitFor("document.querySelector('main h1')?.textContent==='Opening a Yawrd is currently invite-only.'");
    assert.equal(await evaluate("window.audit.filter(x=>x.url==='/api/creations/yawrd-aaaaaaaaaaaa').length"),reads);
    for(const width of [390,1440]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false);
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/yawrd-r1-invite-'+width+'.png',Buffer.from(shot.data,'base64'));
    }
    // An approved direct URL resumes; expiry then removes it without navigation.
    await evaluate("window.switchWallet('founder.testnet');window.setSession('founder.testnet',Date.now()+1200)");
    await waitFor("document.querySelector('main h1')?.textContent==='Set up your Yawrd'");
    await waitFor("document.querySelector('main h1')?.textContent==='Sign in to open a Yawrd'");
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('Saved synthetic project')"),false);
    // A late admission response for a prior session cannot reopen Creation.
    await evaluate("window.switchWallet('other.testnet');window.account='founder.testnet';window.expires=Date.now()+3600000;window.deferAdmission=true;window.dispatchEvent(new Event('yawrd:session-changed'))");
    await waitFor("typeof window.resolveAdmission==='function'");
    await evaluate("window.setSession('other.testnet')");await waitFor("document.querySelector('main h1')?.textContent==='Opening a Yawrd is currently invite-only.'");
    await evaluate("window.resolveAdmission()");await delay(100);assert.equal(await evaluate("document.querySelector('main h1').textContent"),'Opening a Yawrd is currently invite-only.');
    // Production's independent wallet disconnect survives an unavailable sign-out service.
    const logouts=await evaluate("window.audit.filter(x=>x.url==='/api/auth/logout').length");
    await evaluate("document.getElementById('global-account').open=true");
    await waitFor("[...document.querySelectorAll('#global-account button')].some(b=>b.textContent==='Disconnect wallet')");
    await evaluate("const old=window.fetch;window.fetch=(u,o)=>u==='/api/auth/logout'?Promise.reject(Error('Synthetic auth outage')):old(u,o)");
    await evaluate("[...document.querySelectorAll('#global-account button')].find(b=>b.textContent==='Disconnect wallet').click()");
    await waitFor("!document.querySelector('#global-account').textContent.includes('Connected:')");
    assert.equal(await evaluate("window.audit.filter(x=>x.url==='/api/auth/logout').length"),logouts);
    // Actual Production route-owned profile controls still portal into Account.
    await evaluate("sessionStorage.setItem('r1-connected','1')");
    await call('Page.navigate',{url:origin});await waitFor("!!document.getElementById('project-wallet')");
    await evaluate("document.getElementById('global-account').open=true;[...document.querySelectorAll('#global-account details')].forEach(d=>d.open=true)");
    await waitFor("document.getElementById('project-wallet').textContent.includes('Verified account · NEP-413 · other.testnet · Crew Member')");
    assert.equal(await evaluate("document.querySelector('#project-wallet a').getAttribute('href')"),'#crew-title');
    assert.ok(await evaluate("!document.getElementById('project-wallet').closest('details:not(#global-account)')"),'Production profile remains immediately visible');
    assert.ok(await evaluate("document.getElementById('global-account').contains(document.getElementById('project-wallet'))"));
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
    const profileShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile('/tmp/yawrd-r2-profile-390.png',Buffer.from(profileShot.data,'base64'));
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape'});await delay(50);assert.equal(await evaluate("document.getElementById('global-account').open"),false);
    assert.deepEqual(blocked,[]);
    assert.equal(await evaluate("window.audit.filter(x=>['POST','PATCH'].includes(x.method)&&x.url.startsWith('/api/creations')).length"),0,'this journey never spends, generates or publishes');

  } finally {
    ws?.close();
    if (browser && browser.exitCode === null) {
      const exited = new Promise(resolveExit => browser.once('exit', resolveExit));
      browser.kill('SIGKILL'); await exited;
    }
    if (server) await new Promise(resolveClose => server.close(resolveClose));
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
