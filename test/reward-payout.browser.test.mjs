// Focused Reward Payout interactions using existing Chromium/webpack and mocked wallet/RPC.
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

test('fixed Reward Payout wallet and chain interactions stay explicit and receipt-derived', { timeout: 60000 }, async t => {
  const temporary = await mkdtemp('/tmp/yawrd-payout-ux-test-');
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
    assert.fail('Browser condition timed out: ' + expression + '\n' + await evaluate('document.body.textContent'));
  }
  const button = text => `[...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(text)})`;
  const click = text => evaluate(button(text) + '.click()');
  try {
    await writeFile(temporary + '/tsx-loader.cjs', 'const ts=require(' + JSON.stringify(require.resolve('typescript')) + ');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText};');
    const entry = 'import React from "react";\nimport {createRoot} from "react-dom/client";\n'
      + 'import {RewardPayoutProvider,RewardPayoutWorkspace,RewardPayoutIdentity} from ' + JSON.stringify(resolve('app/components/reward-payout.tsx')) + ';\n'
      + 'import {PAYOUT,payoutDescription,transferKind,PAYOUT_ATTEMPT_KEY} from ' + JSON.stringify(resolve('src/rewards/payout.ts')) + ';\n'
      + String.raw`
const root = createRoot(document.getElementById('root'));
let actor = PAYOUT.creator, connected = PAYOUT.creator, proposals = [], transaction = null, mode = 'normal', mount = 0;
const signed = [], hash = 'T'.repeat(44), blockHash = 'B'.repeat(44);
const p = () => ({id:1,proposer:PAYOUT.creator,description:payoutDescription,kind:transferKind(),status:'InProgress',votes:{},last_actions_log:[]});
const outcome = tx => {
 const params = tx.actions[0].params, call = {method_name:params.methodName,args:btoa(JSON.stringify(params.args)),gas:params.gas,deposit:'0'};
 const paid = proposals[0]?.status === 'Approved';
 const receipts = [{receipt_id:'call',predecessor_id:tx.signerId,receiver_id:PAYOUT.daoAccountId,receipt:{Action:{actions:[{FunctionCall:call}]}}}];
 const outcomes = [{id:'call',outcome:{executor_id:PAYOUT.daoAccountId,receipt_ids:paid?['transfer']:[],status:{SuccessValue:''}}}];
 if(paid){receipts.push({receipt_id:'transfer',predecessor_id:PAYOUT.daoAccountId,receiver_id:PAYOUT.recipient,receipt:{Action:{actions:[{Transfer:{deposit:PAYOUT.amountYocto}}]}}});outcomes.push({id:'transfer',outcome:{executor_id:PAYOUT.recipient,receipt_ids:[],status:{SuccessValue:''}}});}
 return {final_execution_status:'FINAL',transaction:{hash,signer_id:tx.signerId,receiver_id:tx.receiverId,actions:[{FunctionCall:call}]},transaction_outcome:{id:hash,outcome:{executor_id:tx.signerId,receipt_ids:['call'],status:{SuccessReceiptId:'call'}}},receipts,receipts_outcome:outcomes,status:{SuccessValue:''}};
};
window.fetch = async (url, options={}) => {
 if(url==='/api/yawrd/yaw-001/reward-payout'){
  if(options.method!=='GET'||options.credentials!=='same-origin'||options.cache!=='no-store')throw Error('unsafe context read');
  return Response.json({accountId:actor,acknowledged:true,acknowledgedAt:'2026-11-07T00:00:00.000Z'});
 }
 if(url!=='https://test.rpc.fastnear.com')throw Error('Unexpected external URL');
 if(mode==='offline')throw Error('offline');
 const {method,params} = JSON.parse(options.body); let result;
 if(method==='status')result={chain_id:'testnet'};
 else if(method==='block')result={header:{hash:blockHash},chunks:[]};
 else if(method==='EXPERIMENTAL_tx_status')result=transaction;
 else if(method==='query'){
  if(params.block_id!==blockHash)throw Error('unfinalized view');
  const args=JSON.parse(atob(params.args_base64));
  const v=params.method_name==='get_last_proposal_id'?(proposals.length?2:0):params.method_name==='get_proposals'?proposals:proposals.find(p=>p.id===args.id);
  result={block_hash:blockHash,result:[...new TextEncoder().encode(JSON.stringify(v))]};
 }else throw Error('Unexpected RPC method, no broadcasts allowed');
 return Response.json({result});
};
function app(next=actor,walletAccount=next){
 actor=next;connected=walletAccount;
 const wallet={accountId:connected,busy:false,getContext:()=>({accountId:connected,network:'testnet'}),signPayout:async tx=>{
  signed.push(tx);
  if(mode==='unknown')throw Error('uncertain outcome');
  if(tx.actions[0].params.methodName==='add_proposal')proposals=[p()];
  else {proposals[0].votes[tx.signerId]='Approve';if(Object.keys(proposals[0].votes).length===2)proposals[0].status='Approved';}
  transaction=outcome(tx);return {transaction:{hash}};
 }};
 root.render(React.createElement(RewardPayoutProvider,{key:++mount},React.createElement('div',{id:'identity'},React.createElement(RewardPayoutIdentity)),React.createElement(RewardPayoutWorkspace,{accountId:actor,wallet})));
}
window.ux={signed,app,reset(){proposals=[];transaction=null;mode='normal';localStorage.clear();history.replaceState({},'', '/');app(PAYOUT.creator)},unknown(){mode='unknown'},landed(){mode='normal';proposals=[p()]},offline(){mode='offline'},approved(){mode='normal';proposals=[{...p(),status:'Approved',votes:{'yawrd1.testnet':'Approve','yawrd.testnet':'Approve'}}];transaction=null;localStorage.clear();app()},redirect(){mode='normal';proposals=[p()];const tx=signed[signed.length-1];transaction=outcome(tx);history.replaceState({},'', '?transactionHashes='+hash);app()}};
window.pageSentinel='same-document';app();
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
    const html = '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>';
    server = createServer((req, res) => {
      if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript; charset=utf-8'); res.end(bundle); }
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
    await waitFor('!!window.ux && !!' + button('Create Payout Proposal in Meteor'));
    await t.test('creator creation is 0/2; a separate first approval is 1/2; second Steward executes and verifies Paid', async () => {
      await click('Create Payout Proposal in Meteor');
      await waitFor('document.body.textContent.includes("0/2 approvals") && !!' + button('Approve Payout Proposal in Meteor'));
      assert.equal(await evaluate('window.ux.signed.length'), 1);
      assert.equal(await evaluate('window.ux.signed[0].actions[0].params.methodName'), 'add_proposal');
      assert.equal(await evaluate('!!' + button('Create Payout Proposal in Meteor')), false);
      await click('Approve Payout Proposal in Meteor');
      await waitFor('document.body.textContent.includes("1/2 approvals") && document.body.textContent.includes("vote is already recorded")');
      assert.equal(await evaluate('window.ux.signed.length'), 2);
      assert.equal(await evaluate('!!' + button('Approve Payout Proposal in Meteor')), false);
      await evaluate('window.ux.app("yawrd.testnet")');
      await waitFor('!!' + button('Approve Payout Proposal in Meteor'));
      await click('Approve Payout Proposal in Meteor');
      await waitFor('document.getElementById("identity").textContent.includes("Reward Payout status: Paid")');
      const executionHash = 'T'.repeat(44);
      assert.equal(await evaluate('document.getElementById("identity").textContent.includes(' + JSON.stringify('Verified final approval transaction · ' + executionHash) + ')'), true);
      assert.equal(await evaluate('document.querySelector("#identity a").href'), 'https://testnet.nearblocks.io/txns/' + executionHash);
      assert.equal(await evaluate('window.ux.signed.length'), 3);
      assert.equal(await evaluate('document.getElementById("reward-payout").textContent.includes("2/2 approvals")'), true);
      assert.equal(await evaluate('document.querySelector("#reward-payout ul").textContent.includes("yawrd1.testnet · Approve") && document.querySelector("#reward-payout ul").textContent.includes("yawrd.testnet · Approve")'), true);
      assert.equal(await evaluate('!!' + button('Approve Payout Proposal in Meteor')), false);
      assert.equal(await evaluate('document.body.textContent.includes("Transfer receipt: transfer")'), true);
      assert.equal(await evaluate('window.pageSentinel'), 'same-document');
    });
    await t.test('unauthorized and mismatched accounts are never offered a payout vote', async () => {
      await evaluate('window.ux.app("outsider.testnet")');
      await waitFor('!document.getElementById("reward-payout")');
      await evaluate('window.ux.reset(); window.ux.app("yawrd1.testnet","yawrd.testnet")');
      await waitFor('document.body.textContent.includes("Connect the same Steward wallet")');
      assert.equal(await evaluate('!!' + button('Create Payout Proposal in Meteor')), false);
      assert.equal(await evaluate('window.ux.signed.length'), 3);
    });
    await t.test('unknown creation survives reload and redirect reconciliation without automatic signing or duplicate creation', async () => {
      await evaluate('window.ux.reset()'); await waitFor('!!' + button('Create Payout Proposal in Meteor'));
      await evaluate('window.ux.unknown()'); await click('Create Payout Proposal in Meteor');
      await waitFor('document.body.textContent.includes("awaiting reconciliation")');
      await evaluate('window.ux.app()'); await waitFor('document.body.textContent.includes("awaiting reconciliation")');
      assert.equal(await evaluate('!!' + button('Create Payout Proposal in Meteor')), false);
      assert.equal(await evaluate('window.ux.signed.length'), 4);
      await evaluate('window.ux.redirect()');
      await waitFor('!!' + button('Approve Payout Proposal in Meteor'));
      assert.equal(await evaluate('!!' + button('Create Payout Proposal in Meteor')), false);
      assert.equal(await evaluate('window.ux.signed.length'), 4);
    });
    await t.test('approval without transfer receipts stays unverified; RPC failure removes stale state and disables actions', async () => {
      await evaluate('window.ux.approved()');
      await waitFor('document.getElementById("identity").textContent.includes("settlement unverified")');
      assert.equal(await evaluate('document.getElementById("identity").textContent.includes("status: Paid")'), false);
      assert.equal(await evaluate('document.querySelector("#identity a")'), null);
      await waitFor('!' + button('Refresh payout status') + '.disabled');
      await evaluate('window.ux.offline()'); await click('Refresh payout status');
      await waitFor('document.getElementById("identity").textContent.includes("Unverified — refresh payout status")');
      assert.equal(await evaluate('!!' + button('Create Payout Proposal in Meteor')), false);
      assert.equal(await evaluate('!!' + button('Approve Payout Proposal in Meteor')), false);
      assert.equal(await evaluate('window.ux.signed.length'), 4);
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
