// Focused offline React interaction checks using existing Chromium/webpack.
// Uses mocked routing, auth HTTP and a wallet connector; no live services.
// Run after npm run build to reuse the generated CSS for responsive checks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);

test('creation welcome gates consent, recovers sign-in, and preserves sessions', { timeout: 60000 }, async t => {
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
    await writeFile(temporary + '/css-loader.cjs', 'module.exports=()=>"module.exports={__esModule:true,default:new Proxy({}, {get:(_,key)=>key})}";');
    const entry = String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import Welcome from ${JSON.stringify(resolve('app/create/creation-welcome.tsx'))};
import {NavigationShell} from ${JSON.stringify(resolve('app/components/global-navigation.tsx'))};
import {TestnetWalletProvider, useTestnetWallet} from ${JSON.stringify(resolve('app/use-testnet-wallet.ts'))};
window.React=React;
const calls=window.calls={connect:0,sign:0,verify:0};
let connected=false, authenticated=null;
window.failConnect=true; window.failSign=true; window.failVerify=false; window.wrongNetwork=false;
const accounts=[{accountId:'founder.testnet'}];
const wallet={manifest:{id:'meteor-wallet'},getAccounts:async()=>accounts,signMessage:async()=>{
 calls.sign++; if(window.failSign){window.failSign=false;throw Error('synthetic private wallet error');}
 return {accountId:'founder.testnet',publicKey:'synthetic',signature:'synthetic'};
}};
window.mockWallet=wallet;
window.__nearMock={NearConnector:class {
 constructor(){this.network='testnet';this.availableWallets=[wallet];this.whenManifestLoaded=Promise.resolve();this.events={};window.connector=this;}
 on(event,fn){this.events[event]=fn;} off(event){delete this.events[event];}
 async getConnectedWallet(){if(!connected)throw Error('Disconnected');return {wallet};}
 async connect(){calls.connect++;if(window.failConnect){window.failConnect=false;throw Error('cancelled');}connected=true;this.events['wallet:signIn']({wallet,accounts});}
 async disconnect(){connected=false;this.events['wallet:signOut']();}
}};
window.fetch=async(url,options={})=>{
 if(url==='/api/auth/session')return Response.json({accountId:authenticated});
 const data=JSON.parse(options.body);
 if(url==='/api/auth/challenge')return Response.json({challenge:{id:'synthetic',accountId:data.accountId,network:'testnet',message:'Sign in to Yawrd. No payment.',recipient:'Yawrd participant sign-in',nonce:btoa('x'.repeat(32)),origin:location.origin,expiresAt:Date.now()+300000}});
 if(url==='/api/auth/verify'){calls.verify++;if(window.failVerify){window.failVerify=false;return Response.json({error:'service_unavailable'},{status:503});}authenticated=data.accountId;return Response.json({accountId:authenticated});}
 throw Error('Unexpected request '+url);
};
function Observer(){window.latestWallet=useTestnetWallet();return null;}
let root=createRoot(document.getElementById('root'));
function App(){return <TestnetWalletProvider><NavigationShell><Observer/><Welcome/></NavigationShell></TestnetWalletProvider>;}
window.remount=()=>{root.unmount();root=createRoot(document.getElementById('root'));root.render(<App/>);};
root.render(<App/>);
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
    const utilityCss = (await Promise.all((await readdir('.next/static/css')).map(file => readFile('.next/static/css/' + file, 'utf8')))).join('\n');
    const navCss = await readFile('app/components/global-navigation.module.css', 'utf8') + await readFile('app/create/welcome.module.css', 'utf8') + await readFile('app/create/intake/intake.module.css', 'utf8');
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${utilityCss}\n${navCss}</style><div id="root"></div><script>window.__nextNavigation={usePathname:()=>'/yawrd/example'};window.__nextLink=props=>window.React.createElement('a',props,props.children);</script><script src="/bundle.js"></script>`;
    server = createServer((req, res) => {
      if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); }
      else if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end(html); }
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
    await call('Page.navigate', { url: origin });

    await waitFor('!!window.latestWallet?.ready && !!document.querySelector("main input[type=checkbox]")');
    const click = label => evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    const disabled = label => evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent===${JSON.stringify(label)}).disabled`);
    assert.equal(await disabled('Connect Wallet'),true);
    assert.equal(await evaluate('document.querySelector("main input").checked'),false);
    assert.equal(await evaluate('document.querySelector("main a[target=_blank]")?.target'), '_blank');
    for(const width of [320,390,768,1440]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'no overflow at '+width);
    }
    await evaluate('window.connector.availableWallets=[];window.connector.events["selector:walletsChanged"]()');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("Meteor is unavailable")');
    assert.equal(await disabled('Connect Wallet'),true,'unavailable provider cannot connect');
    await evaluate('window.connector.availableWallets=[window.mockWallet];window.connector.events["selector:walletsChanged"]()');
    await waitFor('window.latestWallet.available');
    await evaluate('document.querySelector("main input").focus()');
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    await waitFor('document.querySelector("main input").checked');
    assert.equal(await disabled('Connect Wallet'),false,'keyboard enables wallet');
    assert.equal(await evaluate('window.calls.connect'),0,'consent does not connect');
    await click('Connect Wallet');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("cancelled")');
    assert.equal(await disabled('Connect Wallet'),false,'cancelled connection is recoverable');
    await click('Connect Wallet'); await waitFor('window.latestWallet.accountId === "founder.testnet"');
    assert.equal(await evaluate('window.calls.sign'),0,'connection does not sign');
    await evaluate('document.querySelector("main input").click()');
    assert.equal(await disabled('Sign In'),true,'mouse can withdraw consent');
    await evaluate('document.querySelector("main input").click()');

    await evaluate('window.connector.network="mainnet"');
    await click('Sign In'); await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("Testnet")');
    assert.equal(await evaluate('window.calls.sign'),0);
    await evaluate('window.connector.network="testnet"');
    await click('Sign In'); await waitFor('!!document.querySelector("main pre")');
    await click('Approve sign-in message in Meteor');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("cancelled")');
    assert.equal(await evaluate('document.body.textContent.includes("synthetic private wallet error")'),false);
    await click('Sign In'); await waitFor('!!document.querySelector("main pre")');
    await evaluate('window.failVerify=true');
    await click('Approve sign-in message in Meteor');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("could not verify")');
    await click('Sign In'); await waitFor('!!document.querySelector("main pre")');
    await click('Approve sign-in message in Meteor');
    await waitFor('document.querySelector("main").textContent.includes("Welcome back.")');
    assert.equal(await evaluate('window.calls.verify'),2);
    const counts=await evaluate('[window.calls.connect,window.calls.sign,window.calls.verify]');
    await evaluate('window.remount()');
    await waitFor('document.querySelector("main")?.textContent.includes("Welcome back.")');
    assert.equal(await evaluate('!!document.querySelector("main input[type=checkbox]")'),false,'existing session needs no repeated consent');
    assert.deepEqual(await evaluate('[window.calls.connect,window.calls.sign,window.calls.verify]'),counts,'existing session needs no repeated signatures');
    await click('Start a new Yawrd →');
    await waitFor('document.body.textContent.includes("Good projects start with your idea.")');
    assert.deepEqual(blocked, []);
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
