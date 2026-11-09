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

test('shared account controls preserve explicit sign-in and one wallet listener owner', { timeout: 60000 }, async t => {
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
import {NavigationShell} from ${JSON.stringify(resolve('app/components/global-navigation.tsx'))};
import {ParticipantPanel} from ${JSON.stringify(resolve('app/components/participant-panel.tsx'))};
import {TestnetWalletProvider, useTestnetWallet} from ${JSON.stringify(resolve('app/use-testnet-wallet.ts'))};
window.React = React;
window.__nextNavigation = {usePathname: () => '/yawrd/example'};
const calls = window.calls = {connect:0, sign:0, verify:0, logout:0, subscriptions:0, removals:0, constructors:0};
let connected = false, selected = 'one.testnet', authenticated = null;
const accounts = [{accountId:'one.testnet'},{accountId:'two.testnet'}];
const wallet = {manifest:{id:'meteor-wallet'}, getAccounts:async()=>accounts,
  signMessage:async params => {calls.sign++; return {accountId:selected,publicKey:'synthetic-public-key',signature:'synthetic-proof'};}};
window.__nearMock = {NearConnector:class {
  constructor() { calls.constructors++; this.network='testnet'; this.availableWallets=[wallet]; this.whenManifestLoaded=Promise.resolve(); this.events={}; }
  on(event,fn) { calls.subscriptions++; this.events[event]=fn; }
  off(event,fn) { calls.removals++; delete this.events[event]; }
  async getConnectedWallet() { if(!connected) throw Error('Disconnected'); return {wallet}; }
  async connect() { connected=true; calls.connect++; this.events['wallet:signIn']({wallet,accounts}); }
  async disconnect() { connected=false; this.events['wallet:signOut'](); }
}};
const view = () => ({accountId:authenticated,role:authenticated?'participant':'public',application:null,applications:[],restrictedContent:null});
window.fetch = async (url, options={}) => {
  const data = options.body ? JSON.parse(options.body) : null;
  if (url === '/api/auth/challenge') { selected=data.accountId; return Response.json({challenge:{id:'synthetic-challenge',accountId:selected,network:'testnet',message:'Explicit synthetic sign-in message',recipient:'local-test',nonce:btoa('x'.repeat(32)),origin:location.origin,expiresAt:Date.now()+300000}}); }
  if (url === '/api/auth/verify') {calls.verify++; authenticated=data.accountId; return Response.json({});}
  if (url === '/api/auth/logout') {calls.logout++; authenticated=null; return Response.json({});}
  if (url.endsWith('/state')) return Response.json(view());
  throw Error('Unexpected request: '+url);
};
const root = createRoot(document.getElementById('root'));
function Observer() { const wallet=useTestnetWallet(); window.latestWallet=wallet; return null; }
function App() { const [show,setShow]=React.useState(true); window.swap=()=>setShow(s=>!s); return <TestnetWalletProvider><NavigationShell><Observer />{show ? <ParticipantPanel projectId="example" initial={view()} /> : <main>Other route consumer</main>}</NavigationShell></TestnetWalletProvider>; }
root.render(<App />);
`;
    await writeFile(temporary + '/entry.tsx', entry);
    const webpack = require('next/dist/compiled/webpack/webpack').webpack;
    await new Promise((resolveBuild, reject) => {
      const compiler = webpack({ mode: 'development', devtool: false, target: 'web', cache: false,
        entry: temporary + '/entry.tsx', output: { path: temporary, filename: 'bundle.js' },
        resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [resolve('node_modules'), 'node_modules'] },
        externals: [({ request }, callback) => callback(null, request === '@hot-labs/near-connect' ? 'window __nearMock' : request === 'next/link' ? 'window __nextLink' : request === 'next/navigation' ? 'window __nextNavigation' : undefined)],
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
    const navCss = await readFile('app/components/global-navigation.module.css', 'utf8');
    const html = `<!doctype html><meta charset="utf-8"><style>${utilityCss}\n${navCss}</style><div id="root"></div><script>window.__nextNavigation={usePathname:()=>'/yawrd/example'};window.__nextLink=props=>window.React.createElement('a',props,props.children);</script><script src="/bundle.js"></script>`;
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

    await waitFor('!!window.latestWallet?.ready && !!document.getElementById("project-wallet")');
    const click = label => evaluate(`[...document.querySelectorAll('#global-account button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    await evaluate('document.querySelector("#global-account > summary").click()');
    assert.equal(await evaluate('document.querySelectorAll("#global-account button").length'), 2, 'only project controls, no duplicate fallback');
    await click('Connect wallet');
    await waitFor('window.latestWallet.accountId === "one.testnet"');
    assert.equal(await evaluate('window.calls.sign'), 0, 'connection never signs automatically');
    assert.equal(await evaluate('window.calls.verify'), 0);
    await click('Continue sign-in');
    await waitFor('!!document.querySelector("#project-wallet pre")');
    for (const width of [320, 390, 768, 1440]) {
      await call('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'account challenge fits at '+width);
      assert.equal(await evaluate('(()=>{const p=document.getElementById("project-wallet");return p.scrollWidth<=p.clientWidth})()'), true, 'account controls fit at '+width);
    }

    await evaluate(`(()=>{const select=document.querySelector('#project-wallet select');select.value='two.testnet';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor('window.latestWallet.accountId === "two.testnet" && !document.querySelector("#project-wallet pre")');
    assert.equal(await evaluate('window.calls.sign'), 0, 'account selection invalidates the prepared challenge');
    await click('Continue sign-in');
    await waitFor('!!document.querySelector("#project-wallet pre")');
    await click('Approve sign-in message in Meteor');
    await waitFor('document.getElementById("project-wallet").textContent.includes("Verified account · NEP-413 · two.testnet")');
    assert.equal(await evaluate('window.calls.sign'), 1); assert.equal(await evaluate('window.calls.verify'), 1);
    await click('Disconnect wallet');
    await waitFor('!window.latestWallet.accountId');
    assert.equal(await evaluate('document.getElementById("project-wallet").textContent.includes("Verified account · NEP-413 · two.testnet")'), true, 'disconnect preserves verified session');
    await click('Sign out');
    await waitFor('!document.getElementById("project-wallet").textContent.includes("Verified account · NEP-413")');
    assert.equal(await evaluate('window.calls.logout'), 1);
    await evaluate('window.swap()'); await waitFor('!document.getElementById("project-wallet")');
    assert.equal(await evaluate('document.querySelectorAll("#global-account button").length'), 1, 'fallback returns when project unmounts');
    await evaluate('window.swap()'); await waitFor('!!document.getElementById("project-wallet")');
    assert.deepEqual(await evaluate('[window.calls.constructors,window.calls.subscriptions,window.calls.removals]'), [1,3,0], 'one persistent connector and listener owner across route consumers');
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
