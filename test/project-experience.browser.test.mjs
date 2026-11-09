// Styled offline project review. Canonical public facts; mocked roles, wallet and RPC.
// Run after npm run build. No database, real wallet or external requests.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const require = createRequire(import.meta.url);

test('completed project responsive presentation and historical workspaces', { timeout: 60000 }, async () => {
  const temporary = await mkdtemp('/tmp/yawrd-project-browser-');
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
    assert.fail('Browser condition timed out: ' + expression + '\n' + await evaluate('document.body.textContent') + '\n' + await evaluate('window.__errors'));
  }
  try {
    await writeFile(temporary + '/tsx-loader.cjs', 'const ts=require(' + JSON.stringify(require.resolve('typescript')) + ');module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText};');
    await writeFile(temporary + '/css-loader.cjs', `const path=require('node:path');module.exports=function(){const prefix=path.basename(this.resourcePath,'.module.css').replaceAll('-','_');return 'module.exports={__esModule:true,default:new Proxy({}, {get:(_,key)=>'+JSON.stringify(prefix+'__')+'+key})}';};`);
    const entry = String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {NavigationShell} from ${JSON.stringify(resolve('app/components/global-navigation.tsx'))};
import {PersistedYawrdPresentation} from ${JSON.stringify(resolve('app/components/persisted-yawrd.tsx'))};
import {GENESIS_YAW_001 as genesis} from ${JSON.stringify(resolve('src/genesis/yaw-001.ts'))};
import {PAYOUT,payoutDescription,transferKind,payoutTransaction} from ${JSON.stringify(resolve('src/rewards/payout.ts'))};
import {TestnetWalletProvider} from ${JSON.stringify(resolve('app/use-testnet-wallet.ts'))};
window.React=React;
window.__nextNavigation={usePathname:()=>'/yawrd/yaw-001'};
window.__nearMock={NearConnector:class {
 constructor(){this.network='testnet';this.availableWallets=[];this.whenManifestLoaded=Promise.resolve();}
 on(){} off(){} async getConnectedWallet(){throw Error('Offline fixture');}
}};
let mode='approved';
window.statusReads=0;window.payoutMounts=0;
const originalInterval=window.setInterval.bind(window);
window.setInterval=(fn,ms,...args)=>{if(ms===15000)window.payoutMounts++;return originalInterval(fn,ms,...args);};
const visitor={accountId:null,role:'public',application:null,applications:[],restrictedContent:null};
const application={id:'00000000-0000-4000-8000-000000000001',accountId:'offline-crew.example.testnet',introduction:'OFFLINE PRIVATE APPLICATION',status:'approved',reviewerAccountId:genesis.creatorAccountId};
const views={visitor,creator:{...visitor,accountId:genesis.creatorAccountId,role:'creator',applications:[application],restrictedContent:'OFFLINE PRIVATE WORKSPACE'},
 participant:{...visitor,accountId:application.accountId,role:'participant',application,restrictedContent:'OFFLINE PRIVATE WORKSPACE'},
 steward:{...visitor,accountId:'yawrd.testnet'},newcomer:{...visitor,accountId:'offline-new.example.testnet'}};
window.fetch=async(url,options={})=>{
 if(url==='/api/yawrd/yaw-001/reward-payout')return Response.json({accountId:'yawrd.testnet',acknowledged:true,acknowledgedAt:'2026-11-07T00:00:00.000Z'});
 if(url!=='https://test.rpc.fastnear.com')throw Error('Unexpected request: '+url);
 if(mode==='offline')throw Error('Offline RPC fixture');
 const {method,params}=JSON.parse(options.body);let result;
 const proposal={id:1,proposer:PAYOUT.creator,description:payoutDescription,kind:transferKind(),status:'Approved',votes:{'yawrd1.testnet':'Approve','yawrd.testnet':'Approve'},last_actions_log:[]};
 const blockHash='B'.repeat(44);
 const paidHash='RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R', receipt='DcwQrmzbh9WRaJ71sWPBxgYbvP19dyPQ8mCuDU9kmdy';
 const callParams=payoutTransaction('approve','yawrd.testnet',{...proposal,status:'InProgress',votes:{}}).actions[0].params;
 const call={method_name:callParams.methodName,args:btoa(JSON.stringify(callParams.args)),gas:callParams.gas,deposit:'0'};
 const transfer={receipt_id:receipt,predecessor_id:PAYOUT.daoAccountId,receiver_id:PAYOUT.recipient,receipt:{Action:{actions:[{Transfer:{deposit:PAYOUT.amountYocto}}]}}};
 if(['paid','pending','failed'].includes(mode))proposal.last_actions_log=[{block_height:'100'}];
 if(method==='status'){window.statusReads++;result={chain_id:'testnet'};}
 else if(method==='block')result={header:{hash:blockHash},chunks:!params.finality&&proposal.last_actions_log.length?[{chunk_hash:'offline-chunk'}]:[]};
 else if(method==='chunk')result={header:{shard_id:0},receipts:[transfer]};
 else if(method==='EXPERIMENTAL_receipt_to_tx')result={transaction_hash:paidHash,sender_account_id:'yawrd.testnet'};
 else if(method==='EXPERIMENTAL_tx_status')result={final_execution_status:mode==='pending'?'EXECUTED_OPTIMISTIC':'FINAL',
 transaction:{hash:paidHash,signer_id:'yawrd.testnet',receiver_id:PAYOUT.daoAccountId,actions:[{FunctionCall:call}]},
 transaction_outcome:{id:paidHash,outcome:{executor_id:'yawrd.testnet',receipt_ids:['call'],status:{SuccessReceiptId:'call'}}},
 receipts:[{receipt_id:'call',predecessor_id:'yawrd.testnet',receiver_id:PAYOUT.daoAccountId,receipt:{Action:{actions:[{FunctionCall:call}]}}},transfer],
 receipts_outcome:[{id:'call',outcome:{executor_id:PAYOUT.daoAccountId,receipt_ids:[receipt],status:{SuccessValue:''}}},{id:receipt,outcome:{executor_id:PAYOUT.recipient,receipt_ids:[],status:mode==='failed'?{Failure:{error:'OFFLINE_FAILURE'}}:{SuccessValue:''}}}],status:{SuccessValue:''}};
 else if(method==='query'){
 const args=JSON.parse(atob(params.args_base64));
 result={block_hash:blockHash,result:[...new TextEncoder().encode(JSON.stringify(params.method_name==='get_last_proposal_id'?2:params.method_name==='get_proposals'?[proposal]:proposal))]};
 }else throw Error('No writes or unsupported RPC: '+method);
 return Response.json({result});
};
const project={...genesis,objectives:[...genesis.objectives]};
const root=createRoot(document.getElementById('root'));
function App(){const [role,setRole]=React.useState('visitor');window.setRole=setRole;return <TestnetWalletProvider><NavigationShell><p className="fixture-notice">OFFLINE REVIEW · Canonical project facts; mocked roles and payout verification. No live database or wallet.</p><main id="project-content" className="review-page"><div className="review-container"><PersistedYawrdPresentation key={role} project={project} view={views[role]} /></div></main></NavigationShell></TestnetWalletProvider>;}
window.setPayoutMode=next=>{mode=next;window.dispatchEvent(new Event('focus'));};
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
    const postcss = require('postcss');
    let scopedCss = '';
    for (const name of ['global-navigation', 'genesis-project', 'contribution-workspace']) {
      const parsed = postcss.parse(await readFile('app/components/' + name + '.module.css', 'utf8'));
      parsed.walkRules(rule => {rule.selector = rule.selector.replace(/\.([_a-zA-Z][\w-]*)/g, (_, key) => '.' + name.replaceAll('-','_') + '__' + key);});
      scopedCss += '\n' + parsed.toString();
    }
    const reviewCss = '.fixture-notice{padding:8px 16px;background:#a9f1e9;color:#002026;font:11px/1.6 system-ui}.review-page{min-height:100svh;background:radial-gradient(ellipse at 90% 0,#07413f70,transparent 45%),#001819;color:#f2f7f5}.review-container{width:min(1240px,calc(100% - 64px));margin-inline:auto;padding-bottom:32px}@media(max-width:639px){.review-container{width:calc(100% - 32px)}}';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>09A.2 · Offline product review</title><style>${utilityCss}\n${scopedCss}\n${reviewCss}</style></head><body><div id="root"></div><script>window.__nextNavigation={usePathname:()=>'/yawrd/yaw-001'};window.__errors=[];addEventListener('error',e=>window.__errors.push(e.message));window.__nextLink=props=>window.React.createElement('a',props,props.children);</script><script src="/bundle.js"></script></body></html>`;
    server = createServer(async (req, res) => {
      if (req.url === '/bundle.js') { res.setHeader('content-type', 'text/javascript'); res.end(bundle); }
      else if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end(html); }
      else if (['/brand/yawrd-buoy.webp','/landing/build-progress.webp'].includes(req.url)) {res.setHeader('content-type','image/webp');res.end(await readFile(resolve('public'+req.url)));}
      else { res.statusCode = 404; res.end(); }
    });
    await new Promise((resolveListen, reject) => {server.once('error', reject);server.listen(0,'127.0.0.1',resolveListen);});
    const origin='http://127.0.0.1:'+server.address().port;
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
    await call('Page.navigate', {url: origin});
    await waitFor('!!window.setRole && document.body.textContent.includes("Approved — transfer settlement unverified")');
    const artifactDir = resolve('docs/verification/milestone-09a-2');
    await mkdir(artifactDir, {recursive:true});
    for (const width of [320,390,768,1440]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await delay(100);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'page fits '+width);
      assert.equal(await evaluate('document.querySelectorAll("header").length'),1);
      assert.equal(await evaluate('document.querySelectorAll("#genesis-identity-title").length'),1);
      assert.equal(await evaluate('document.body.textContent.includes("Completed · Applications closed")'),true);
      assert.equal(await evaluate('document.body.textContent.includes("Apply to Join")'),false);
      const layout=await evaluate(`(()=>{
        const title=document.querySelector('h1').getBoundingClientRect(),identity=document.querySelector('aside[aria-label="Project identity and participation"]').getBoundingClientRect(),overview=document.querySelector('[aria-labelledby="genesis-source-title"]').getBoundingClientRect();
        return {titleTop:title.top,identityTop:identity.top,identityLeft:identity.left,overviewTop:overview.top,overviewLeft:overview.left};
      })()`);
      if(width<700) assert.ok(layout.titleTop<layout.identityTop && layout.identityTop<layout.overviewTop,'mobile hierarchy '+width);
      else assert.ok(layout.identityLeft>layout.overviewLeft && layout.identityTop<layout.overviewTop,'two columns '+width);
      assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify('GGvuLJcNNEQseQT4LE5uan7apN9gk7ff3WbEHZ4UKip')})`),false,'hash hidden initially');
      const publicText=await evaluate('document.querySelector("#project-content").innerText');
      assert.doesNotMatch(publicText,/OFFLINE PRIVATE|offline-crew|keelbase1|hermes|synthetic|recent activity/);
      const mountsBefore=await evaluate('window.payoutMounts');
      for(const summary of ['Project details & on-chain evidence','Original objectives & project context','Reward verification']) {
        const expression=`[...document.querySelectorAll('main summary')].find(s=>s.textContent===${JSON.stringify(summary)})`;
        await evaluate(expression+'.focus()');
        await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
        await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
        assert.equal(await evaluate(expression+'.parentElement.open'),true);
        assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid');
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'open disclosure fits '+width);
        await evaluate(expression+'.click()');
      }
      assert.ok(await evaluate('window.statusReads')>=1);
      assert.equal(await evaluate('window.payoutMounts'),mountsBefore,'disclosures do not recreate payout flow');
      assert.equal(await evaluate('document.body.textContent.includes("Approved — transfer settlement unverified")'),true,'closing disclosures retains verification');
      await evaluate('window.scrollTo(0,0);document.activeElement.blur()');
      const dimensions=await evaluate('({width:innerWidth,height:document.documentElement.scrollHeight})');
      const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:dimensions.width,height:dimensions.height,scale:1}});
      await writeFile(artifactDir+'/project-'+width+'.png',Buffer.from(screenshot.data,'base64'));
      console.log('Verified responsive project:',width);
    }
    // 200% text scaling at mobile width: no clipping of the identity or evidence.
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate('document.documentElement.style.fontSize="200%"');
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,'200% text fits');
    await evaluate('document.documentElement.style.fontSize=""');
    await evaluate('window.setPayoutMode("offline")');
    await waitFor('document.body.textContent.includes("Unverified — refresh payout status")');
    assert.equal(await evaluate('document.body.innerText.includes("View Payout Transfer")'),false);
    await evaluate('window.setPayoutMode("approved")');
    await waitFor('document.body.textContent.includes("Approved — transfer settlement unverified")');
    await evaluate('window.setPayoutMode("paid")');
    await waitFor('document.body.textContent.includes("Reward Payout status: Paid")');
    const expectedReceipt='https://testnet.nearblocks.io/txns/RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R/execution#DcwQrmzbh9WRaJ71sWPBxgYbvP19dyPQ8mCuDU9kmdy';
    assert.equal(await evaluate(`[...document.querySelectorAll('main a')].find(a=>a.textContent==='View Payout Transfer ↗').href`),expectedReceipt);
    assert.equal(await evaluate('document.querySelector("main").innerText.includes("RaXRoBEcCSMoQcas4P8Yu46jp2hZVrJs6CPNuHALF6R")'),false,'full payout hash stays disclosed');
    for(const width of [390,1440]) {
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await evaluate('window.scrollTo(0,0)');await delay(50);
      const height=await evaluate('document.documentElement.scrollHeight');
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height,scale:1}});
      await writeFile(artifactDir+'/project-receipt-verified-'+width+'.png',Buffer.from(shot.data,'base64'));
    }
    for(const next of ['pending','failed']) {
      await evaluate('window.setPayoutMode('+JSON.stringify(next)+')');
      await waitFor('!document.body.textContent.includes("Reward Payout status: Paid")');
      await delay(50);
      assert.equal(await evaluate('document.querySelector("main").innerText.includes("View Payout Transfer")'),false,'unresolved verification hides receipt action');
    }
    await evaluate('window.setPayoutMode("approved")');
    await waitFor('document.body.textContent.includes("Approved — transfer settlement unverified")');
    for(const role of ['creator','participant','steward','newcomer']) {
      await evaluate('window.setRole('+JSON.stringify(role)+')');
      await waitFor('!!document.getElementById("crew-title")');
      await delay(100);
      assert.equal(await evaluate('document.body.textContent.includes("Apply to Join")'),false);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,role+' workspace fits');
      assert.equal(await evaluate('document.querySelectorAll("header").length'),1);
      const text=await evaluate('document.body.innerText');
      if(role==='creator')assert.match(text,/Review applications|OFFLINE PRIVATE APPLICATION/);
      if(role==='participant')assert.match(text,/OFFLINE PRIVATE WORKSPACE/);
      if(role==='steward')assert.match(text,/Reward Payout|Verify transaction evidence/);
      if(role==='newcomer')assert.match(text,/No application is recorded for this account/);
    }
    await evaluate('window.setRole("visitor")');
    await waitFor('!document.getElementById("crew-title")');
    assert.doesNotMatch(await evaluate('document.body.innerText'),/OFFLINE PRIVATE/);
    await evaluate(`document.querySelector('a[href="#project-wallet"]').click()`);
    await waitFor('document.getElementById("global-account").open');
    assert.deepEqual(blocked,[],'no external network requests');
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
