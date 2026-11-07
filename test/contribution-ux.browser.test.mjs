// Focused offline React interaction checks using existing Chromium/webpack.
// No Next server, database, wallet implementation or external requests are used.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);

test('contribution description and Refresh status interactions stay server-derived', { timeout: 60000 }, async t => {
  const temporary = await mkdtemp('/tmp/yawrd-m08-ux-test-');
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
  const refresh = () => evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Refresh status').click()");
  const ackVisible = "document.getElementById('contributions')?.textContent.includes('Prior acceptance acknowledged')";
  const receiptVisible = "document.getElementById('contributions')?.textContent.includes('Synthetic recorded contribution')";
  try {
    await writeFile(temporary + '/tsx-loader.cjs', 'const ts=require(' + JSON.stringify(require.resolve('typescript')) + ');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText};');
    const entry = 'import React from "react";\nimport {createRoot} from "react-dom/client";\n'
      + 'import {ParticipantPanel} from ' + JSON.stringify(resolve('app/components/participant-panel.tsx')) + ';\n'
      + 'import {ContributionExperience} from ' + JSON.stringify(resolve('app/components/contribution-workspace.tsx')) + ';\n'
      + String.raw`
const account = 'keelbase1.testnet';
const root = createRoot(document.getElementById('root'));
let mount = 0, acknowledged = false, authenticated = true, otherAccount = false, hold = false, release;
const requests = [];
const view = () => ({accountId: authenticated ? account : null, role: authenticated ? 'participant' : 'public',
  application: authenticated ? {id:'synthetic-application',accountId:account,introduction:'Synthetic membership',status:'approved',reviewerAccountId:'yawrd1.testnet'} : null,
  applications:[],restrictedContent:null});
const task = () => ({ref:'task-b',title:'Task B',prUrl:'https://github.com/vandigital/yawrd-build-progress/pull/4',
  historicalNote:'Synthetic UI test state',recipientAccountId:account,
  request:{actorAccountId:account,recipientAccountId:account,description:'Synthetic recorded contribution',recordedAt:'2000-01-03T12:00:00.000Z'},
  acknowledgement:acknowledged ? {actorAccountId:'yawrd1.testnet',recordedAt:'2000-01-04T12:00:00.000Z',historicalAcceptedOn:null,historicalAcceptedAt:null,evidence:'Synthetic founder acknowledgement'} : null});
window.fetch = async (url, options = {}) => {
  if (options.method !== 'GET') throw new Error('Only offline GET refreshes are allowed');
  requests.push({url,credentials:options.credentials,cache:options.cache});
  if (url.endsWith('/state')) return Response.json(view());
  if (url !== '/api/yawrd/yaw-001/contributions') throw new Error('Unexpected offline endpoint');
  const response = authenticated ? Response.json({accountId:otherAccount ? 'other.testnet' : account,role:'participant',tasks:[task()]})
    : Response.json({error:'sign_in_required'},{status:401});
  if (hold) { hold = false; return new Promise(resolve => { release = () => resolve(response); }); }
  return response;
};
window.ux = {
  requests,
  panel() { acknowledged=false; authenticated=true; otherAccount=false; root.render(React.createElement(ParticipantPanel,{key:++mount,projectId:'yaw-001',initial:view(),contributionsActive:true})); },
  form() { root.render(React.createElement(ContributionExperience,{key:++mount,preview:true,state:{accountId:account,role:'participant',tasks:[{...task(),request:null,acknowledgement:null}]},onSubmit:async()=>{throw new Error('Submission disabled in this test')},onAcknowledge:async()=>{throw new Error('Acknowledgement disabled in this test')}})); },
  acknowledge() { acknowledged=true; }, revoke() { authenticated=false; }, mismatch() { otherAccount=true; },
  hold() { hold=true; release=undefined; }, held() { return !!release; }, release() { release(); }
};
window.pageSentinel = 'same-document';
window.ux.form();
`;
    await writeFile(temporary + '/entry.js', entry);
    const webpack = require('next/dist/compiled/webpack/webpack').webpack;
    await new Promise((resolveBuild, reject) => {
      const compiler = webpack({ mode: 'development', devtool: false, target: 'web', cache: false,
        entry: temporary + '/entry.js', output: { path: temporary, filename: 'bundle.js' },
        resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [resolve('node_modules'), 'node_modules'] },
        externals: [({ request }, callback) => request?.includes('use-testnet-wallet') ? callback(null, 'window __offlineWallet') : callback()],
        module: { rules: [{ test: /\.tsx?$/, use: temporary + '/tsx-loader.cjs' }, { test: /\.module\.css$/, type: 'asset/source' }] },
      });
      compiler.run((error, stats) => compiler.close(() => {
        if (error) reject(error);
        else if (stats.hasErrors()) reject(new Error(stats.toString({ all: false, errors: true })));
        else resolveBuild();
      }));
    });
    const bundle = await readFile(temporary + '/bundle.js');
    const html = '<!doctype html><div id="root"></div><script>window.__offlineWallet={useTestnetWallet:()=>({ready:true,available:false,busy:false,accountId:null,accountIds:[],error:null,getContext:()=>({accountId:null,network:"testnet"}),signIdentity:async()=>{throw Error("Wallet actions disabled")}})}</script><script src="/bundle.js"></script>';
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
    await waitFor('!!window.ux && !!document.querySelector("textarea")');

    await t.test('counter, Unicode maximum and actionable errors agree with the server contract', async () => {
      const setDescription = async value => {
        await evaluate('(()=>{const field=document.querySelector("textarea");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(field,' + JSON.stringify(value) + ');field.dispatchEvent(new Event("input",{bubbles:true}));})()');
      };
      await evaluate('document.querySelector("input[type=checkbox]").click()');
      await setDescription('😀'.repeat(1000));
      await waitFor('document.getElementById("task-b-description-limit").textContent.startsWith("1,000 / 1,000") && !document.querySelector("button[type=submit]").disabled');
      await setDescription('😀'.repeat(1001));
      await waitFor('document.getElementById("task-b-description-error")?.textContent.includes("Shorten") && document.querySelector("button[type=submit]").disabled');
      assert.equal(await evaluate('document.querySelector("textarea").getAttribute("aria-invalid")'), 'true');
      await setDescription('two\nlines');
      await waitFor('document.getElementById("task-b-description-error")?.textContent.includes("Remove line breaks")');
      await setDescription(' leading');
      await waitFor('document.getElementById("task-b-description-error")?.textContent.includes("Remove whitespace")');
      await setDescription('a'.repeat(1000));
      await waitFor('!document.getElementById("task-b-description-error") && !document.querySelector("button[type=submit]").disabled');
    });
    await t.test('Refresh status fetches and displays a newly accepted acknowledgement without reloading', async () => {
      await evaluate('window.ux.panel()'); await waitFor(receiptVisible);
      assert.equal(await evaluate(ackVisible), false);
      await evaluate('window.ux.acknowledge()'); await refresh(); await waitFor(ackVisible);
      assert.equal(await evaluate('window.pageSentinel'), 'same-document');
      assert.ok(await evaluate('window.ux.requests.filter(r=>r.url.endsWith("/contributions")).length >= 2'));
      assert.equal(await evaluate('window.ux.requests.every(r=>r.credentials==="same-origin" && r.cache==="no-store")'), true);
    });
    await t.test('an older refresh cannot overwrite the newly acknowledged server state', async () => {
      await evaluate('window.ux.panel()'); await waitFor(receiptVisible);
      await evaluate('window.ux.hold()'); await refresh(); await waitFor('window.ux.held()');
      await evaluate('window.ux.acknowledge()'); await refresh(); await waitFor(ackVisible);
      await evaluate('window.ux.release()'); await delay(100);
      assert.equal(await evaluate(ackVisible), true);
    });
    await t.test('refresh removes private contribution records after session revocation', async () => {
      await evaluate('window.ux.revoke()'); await refresh();
      await waitFor('!document.getElementById("contributions") && document.body.textContent.includes("Sign in to take part")');
      assert.equal(await evaluate('document.body.textContent.includes("Synthetic recorded contribution")'), false);
    });
    await t.test('refresh rejects contribution state belonging to another account', async () => {
      await evaluate('window.ux.panel()'); await waitFor(receiptVisible);
      await evaluate('window.ux.mismatch()'); await refresh();
      await waitFor('document.body.textContent.includes("Your verified account changed") && !document.getElementById("contributions")');
      assert.equal(await evaluate('document.body.textContent.includes("Synthetic recorded contribution")'), false);
    });
    assert.deepEqual(blocked, []);
  } finally {
    ws?.close();
    if (browser && browser.exitCode === null) {
      const exited = new Promise(resolveExit => browser.once('exit', resolveExit));
      browser.kill('SIGKILL'); await exited;
    }
    if (server) await new Promise(resolveClose => server.close(resolveClose));
    await rm(temporary, { recursive: true, force: true });
  }
});
