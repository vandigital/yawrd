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

test(process.env.YAWRD_BROWSER_INTAKE_ASSISTANCE === '1' ? 'Intake helper preserves answers, previews external suggestions, saves revisions and clears private data on account changes' : process.env.YAWRD_BROWSER_ACCOUNT_AUTH === '1' ? 'Global Account renews an expired payment-page session without navigation or payment' : process.env.YAWRD_BROWSER_FEE_REVIEW === '1' ? 'P3.4 browser fee review and security-only Steward navigation' : 'P3.1 browser intake saves and resumes private records, rejects stale edits and isolates founders', { timeout: 120000 }, async t => {
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
import Welcome from ${JSON.stringify(resolve('app/create/creation-welcome.tsx'))};
import HardeningPanel from ${JSON.stringify(resolve('app/create/[id]/secure/hardening-panel.tsx'))};
import PaymentPanel from ${JSON.stringify(resolve('app/create/[id]/payment/payment-panel.tsx'))};
import {creationFeeReview,creationFeeTransaction} from ${JSON.stringify(resolve('src/creation/platform-fee.ts'))};
import securityStyles from ${JSON.stringify(resolve('app/create/setup/setup.module.css'))};
import {hardeningTransaction,HARDENING_DESCRIPTION,hardeningKind,attemptKey} from ${JSON.stringify(resolve('src/creation/hardening.ts'))};
import {canonical,prepareCreation} from ${JSON.stringify(resolve('src/creation-integration.ts'))};
import {testnetFactorySettings} from ${JSON.stringify(resolve('src/testnet-factory-settings.ts'))};
import {generateDaoIdentifier} from ${JSON.stringify(resolve('src/creation/dao-identifier.ts'))};
import {NavigationShell} from ${JSON.stringify(resolve('app/components/global-navigation.tsx'))};
import {TestnetWalletProvider,useTestnetWallet} from ${JSON.stringify(resolve('app/use-testnet-wallet.ts'))};
window.React=React;
window.authenticated=sessionStorage.getItem('account-expired')?null:sessionStorage.getItem('synthetic-account')||'founder.testnet';
window.mockWalletAccount=sessionStorage.getItem('mock-wallet-account');
window.authRequests=JSON.parse(sessionStorage.getItem('synthetic-audit')||'[]');
const nativeSet=Storage.prototype.setItem;
Storage.prototype.setItem=function(key,value){if(window.blockStorage&&key.startsWith('yawrd.intake'))throw Error('synthetic quota failure');return nativeSet.call(this,key,value);};
window.__nearMock={NearConnector:class{
 constructor(){this.network='testnet';this.availableWallets=[];this.whenManifestLoaded=Promise.resolve();this.events={};window.connector=this;
  if(sessionStorage.getItem('security-wallet')){this.wallet={manifest:{id:'meteor-wallet'},getAccounts:async()=>[{accountId:window.mockWalletAccount||window.authenticated}],
    signMessage:async params=>{window.accountProofRequests=(window.accountProofRequests||0)+1;return {accountId:params.signerId,publicKey:'synthetic-public-key',signature:'synthetic-message-proof'};},
    signAndSendTransaction:async transaction=>{
      if(transaction.actions[0]?.type==='Transfer'){
        if(!window.feeAllowSigning)throw Error('Synthetic fee signing was not enabled');
        const f=JSON.parse(sessionStorage.getItem('fee-state'));
        if(f?.state!=='wallet-requested'||JSON.stringify(transaction)!==JSON.stringify(f.transaction))throw Error('Fee was not durably claimed');
        window.feeSignatures=(window.feeSignatures||0)+1;sessionStorage.setItem('fee-signatures',String(window.feeSignatures));
        window.feeSigned=transaction;
        return {}; // Deliberately missing callback hash: never an automatic retry.
      }
      if(!window.securityAllowSigning)throw Error('Synthetic signing was not enabled');
      window.securitySignatures=(window.securitySignatures||0)+1;window.securitySigned=[...(window.securitySigned||[]),transaction];
      const v=JSON.parse(sessionStorage.getItem('security-view')),p=transaction.actions[0].params;
      if(p.methodName!=='act_proposal'||p.args.id!==v.proposal?.id)throw Error('Only approvals of the existing synthetic proposal are permitted');
      v.proposal.votes[transaction.signerId]='Approve';
      if(v.binding.members.every(m=>v.proposal.votes[m]==='Approve')){v.proposal.status='Approved';v.autoUpdate=false;v.verified=true;}
      sessionStorage.setItem('security-view',JSON.stringify(v));window.securityReceipt='verified';
      return {transaction:{hash:(window.securitySignatures===1?'U':'V').repeat(43)}};
    }};this.availableWallets=[this.wallet];}}
 async connect(){if(!this.wallet)throw Error('Disconnected');this.events['wallet:signIn']?.({wallet:this.wallet,accounts:await this.wallet.getAccounts()});}

 on(e,fn){this.events[e]=fn;}off(e){delete this.events[e];}
 async disconnect(){this.events['wallet:signOut']?.({});}
 async getConnectedWallet(){if(this.wallet)return {wallet:this.wallet};throw Error('Disconnected');}
}};
window.records=JSON.parse(sessionStorage.getItem('synthetic-creations')||'{}');
window.deploymentIntents=JSON.parse(sessionStorage.getItem('synthetic-intents')||'{}');
const persist=()=>sessionStorage.setItem('synthetic-creations',JSON.stringify(window.records));
window.fetch=async(url,options={})=>{
 window.authRequests.push({url,method:options.method||'GET'});
 sessionStorage.setItem('synthetic-audit',JSON.stringify(window.authRequests));
 // R1 fixture admission: synthetic founders, with independent owner isolation and the existing authorized fixture.
 if(url==='/api/creations/admission'){
  if(window.sessionFailure)return Response.json({error:'service_unavailable'},{status:503});
  return Response.json({accountId:window.authenticated,admitted:['founder.testnet','other.testnet',${JSON.stringify(authorizedCreationDeployment.founderAccountId)}].includes(window.authenticated),expiresAt:window.authenticated?Date.now()+3600000:null});
 }
 if(url==='/api/auth/session'){
  if(window.sessionFailure)return Response.json({error:'service_unavailable'},{status:503});
  if(window.deferSession){window.deferSession=false;return new Promise(resolve=>{window.resolveSession=accountId=>resolve(Response.json({accountId}));});}
  return Response.json({accountId:window.authenticated});
 }
 if(url==='/api/auth/challenge'){
  const data=JSON.parse(options.body);window.mockChallenge={id:'a'.repeat(43),accountId:data.accountId,network:'testnet',origin:location.origin,message:'Synthetic sign-in only',recipient:'Yawrd',nonce:btoa(String.fromCharCode(...new Uint8Array(32))),issuedAt:Date.now(),expiresAt:Date.now()+300000};
  return Response.json({challenge:window.mockChallenge});
 }
 if(url==='/api/auth/verify'){
  const data=JSON.parse(options.body);
  if(window.rejectAccountProof||!window.accountProofRequests||data.proof.accountId!==window.mockChallenge.accountId)return Response.json({error:'invalid_proof'},{status:401});
  window.authenticated=data.accountId;sessionStorage.setItem('synthetic-account',data.accountId);sessionStorage.removeItem('account-expired');return Response.json({accountId:data.accountId});
 }
 if(url==='/api/creations/security'){
  const v=JSON.parse(sessionStorage.getItem('security-view')||'null');
  return Response.json({items:v&&v.binding.members.includes(window.authenticated)?[{id:v.binding.creationId,name:v.binding.name,daoAccountId:v.binding.daoAccountId}]:[]});
 }
 if(url.endsWith('/platform-fee')){
  const v=JSON.parse(sessionStorage.getItem('security-view')||'null');
  if(!v||!v.binding.members.includes(window.authenticated))return Response.json({error:'creation_not_found'},{status:404});
  if(v.binding.founderAccountId!==window.authenticated)return Response.json({error:'founder_payment_required'},{status:403});
  const installed=sessionStorage.getItem('fee-installed')==='1',authorized=sessionStorage.getItem('fee-authorized')==='1';
  let f=JSON.parse(sessionStorage.getItem('fee-state')||'null'),data=options.body?JSON.parse(options.body):null;
  const snapshot={verified:true,autoUpdate:false,proposalId:0,proposalStatus:'Approved',votes:v.proposal.votes,blockHeight:200,blockHash:v.blockHash,checkedAt:v.checkedAt};
  if(data){
    if(data.action==='prepare'){
      if(!installed||!authorized)return Response.json({error:'fee_not_authorized'},{status:403});
      if(f&&f.state!=='prepared')return Response.json({error:'fee_unresolved'},{status:409});
      f=f||{creationId:v.binding.creationId,revision:1,state:'prepared',attempt:0,network:'testnet',founderAccountId:v.binding.founderAccountId,
        daoAccountId:v.binding.daoAccountId,deploymentTransaction:v.binding.creationTransaction,deploymentDigest:'a'.repeat(64),deploymentFinalHeight:'90',
        recipient:'yawrd.testnet',amountYocto:'500000000000000000000000',policyVersion:'testnet-platform-fee-v1',
        transaction:creationFeeTransaction(window.authenticated),securityReview:snapshot,notBeforeHeight:'200',claimHeight:null,claimReview:null,claimedAt:null,transactionHash:null,evidence:null};
    }else{
      if(!f||f.revision!==data.feeRevision)return Response.json({error:'fee_revision_conflict'},{status:409});
      if(data.action==='begin'){
        if(f.state!=='prepared'||!data.consent||data.consentVersion!=='creation-platform-fee-v1')return Response.json({error:'fee_unresolved'},{status:409});
        f={...f,state:'wallet-requested',revision:f.revision+1,attempt:1,claimReview:snapshot,claimHeight:'200',claimedAt:new Date().toISOString()};
      }else if(data.action==='report')f={...f,state:'unknown',revision:f.revision+1,transactionHash:data.transactionHash};
      else if(data.action==='reconcile')f={...f,state:'paid',revision:f.revision+1,transactionHash:data.transactionHash,
        evidence:{txHash:data.transactionHash,blockHeight:'250',receiptId:'R'.repeat(43),evidenceDigest:'d'.repeat(64)}};
    }
    sessionStorage.setItem('fee-state',JSON.stringify(f));
  }
  const result=creationFeeReview({...v,accountId:window.authenticated},f,installed,authorized);
  if(data?.action==='prepare')result.review={transaction:f.transaction,expiresAt:Date.now()+60000,feeEstimateYocto:'100000000000000000000',feeReserveYocto:'200000000000000000000'};
  return Response.json(result);
 }
 if(url.endsWith('/hardening')){
  const id=url.split('/')[3],v=JSON.parse(sessionStorage.getItem('security-view')||'null');
  if(!v||v.binding.creationId!==id||!v.binding.members.includes(window.authenticated))return Response.json({error:'creation_not_found'},{status:404});
  if(options.headers['x-yawrd-account']!==window.authenticated)return Response.json({error:'creation_session_changed'},{status:409});
  const data=options.body?JSON.parse(options.body):null;window.securityRequests=[...(window.securityRequests||[]),data?.action||'read'];
  const result={...v,accountId:window.authenticated,prepared:null};
  if(data?.action==='prepare'&&v.autoUpdate&&!v.verified){
    if(!v.proposal&&window.authenticated!==v.binding.founderAccountId)result.reason='The founder must create the security proposal first.';
    else if(v.proposal?.votes[window.authenticated])result.reason='Your approval is recorded.';
    else{const tx=hardeningTransaction(v.binding,window.authenticated,v.proposal?.id??null);window.lastHardeningTransaction=tx;
      result.prepared={transaction:tx,expiresAt:Date.now()+60000,executing:!!v.proposal&&Object.keys(v.proposal.votes).length===1,feeReserveYocto:'11000000000000000000000'};}
  }
  if(data?.action==='reconcile'){
    result.receipt={state:window.securityReceipt||'pending',hash:data.attempt.hash,proposalId:window.securityReceipt==='verified'?0:null};
    if(window.securityReceipt==='verified'){
      result.proposal=v.proposal||{id:0,proposer:v.binding.founderAccountId,description:HARDENING_DESCRIPTION,kind:hardeningKind(v.binding),status:'InProgress',submission_time:'1',votes:{}};
      sessionStorage.setItem('security-view',JSON.stringify({...v,proposal:result.proposal}));
    }
  }
  return Response.json(result);
 }
 if(url.endsWith('/deployment')){
  const data=options.body?JSON.parse(options.body):null,id=url.split('/')[3],creation=window.records[id];
  if(!creation||creation.founderAccountId!==window.authenticated)return Response.json({error:'creation_not_found'},{status:404});
  if(options.headers['x-yawrd-account']!==window.authenticated)return Response.json({error:'creation_session_changed'},{status:409});
  if(window.deploymentMissingSchema)return Response.json({error:'deployment_storage_unavailable'},{status:503});
  if(data)window.deploymentRequests=[...(window.deploymentRequests||[]),data];
  if(data&&window.deploymentError)return Response.json({error:window.deploymentError},{status:409});
  let intent=window.deploymentIntents[id]||null;
  if(data){
   if(data.action!=='prepare')throw Error('Unexpected live signing action in synthetic browser');
   if(data.expectedRevision!==creation.revision)return Response.json({error:'creation_revision_conflict'},{status:409});
   const c=creation.configuration,identifier=intent?.identifier||generateDaoIdentifier();
   const prepared=prepareCreation({projectName:c.publicName,projectPurpose:c.publicDescription,projectAccountLabel:identifier,creatorAccountId:creation.founderAccountId,initialStewardAccountIds:[c.secondSteward],stewardApprovalThreshold:2,factoryAccountId:testnetFactorySettings.factoryAccountId},testnetFactorySettings,{accountId:creation.founderAccountId,network:'testnet'});
   intent={creationId:id,identifier,daoAccountId:prepared.plan.daoAccountId,state:'prepared',revision:(intent?.revision||0)+1,sourceRevision:creation.revision,attempt:0,prepared,costs:{attachedGasAtObservedPriceYocto:'30000000000000000000000',blockHeight:'100'},transactionHash:null};
   window.deploymentIntents[id]=intent;sessionStorage.setItem('synthetic-intents',JSON.stringify(window.deploymentIntents));
  }
  // Deliberately forge an enable flag: the local authorization gate still wins.
  return Response.json({intent,submissionEnabled:!!intent,deploymentRecorded:false,fundingEnabled:false,publicationEnabled:false,platformFeesEnabled:false});
 }
 if(url.startsWith('/api/creations')){
  const error=(name,status)=>Response.json({error:name},{status});
  if(options.headers['x-yawrd-account']!==window.authenticated)return error('creation_session_changed',409);
  if(window.saveFailure&&options.method!=='GET')return error('service_unavailable',503);
  const id=url.split('/')[3]?.split('?')[0],data=options.body?JSON.parse(options.body):null;
  if(!id&&options.method==='GET')return Response.json({items:Object.values(window.records).filter(r=>r.founderAccountId===window.authenticated).map(r=>({id:r.id,displayName:r.intake.projectName})),nextAfterId:null});
  if(!id&&options.method==='POST'){
   const existing=Object.values(window.records).find(r=>r.founderAccountId===window.authenticated&&r.sourceDraftId===data.intake.draftId);
   if(existing){if(canonical(existing.initialIntake)!==canonical(data.intake))return error('creation_import_conflict',409);return Response.json({creation:existing});}
   const id='yawrd-'+String.fromCharCode(97+Object.keys(window.records).length).repeat(12);
   const creation={id,founderAccountId:window.authenticated,sourceDraftId:data.intake.draftId,revision:1,intake:data.intake,initialIntake:data.intake,configuration:{publicName:'',publicDescription:'',accountLabel:'',secondSteward:'',threshold:2},publicTextReview:null};
   window.records[id]=creation;persist();return Response.json({creation});
  }
  const creation=window.records[id];
  if(!creation||creation.founderAccountId!==window.authenticated)return error('creation_not_found',404);
  if(options.method==='GET')return Response.json({creation});
  if(data.expectedRevision!==creation.revision)return error('creation_revision_conflict',409);
  if(data.intake)creation.intake=data.intake;else creation.configuration=data.configuration;
  creation.revision++;creation.publicTextReview=null;persist();return Response.json({creation});
 }
 if(url==='/api/auth/logout'){window.authenticated=null;if(window.mockWalletAccount)sessionStorage.setItem('account-expired','1');return Response.json({signedOut:true});}
 throw Error('Unexpected API request '+url);
};
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(window.clipboardFailure)throw Error('Unavailable');window.copiedQuestions=text;}}});
const create=URL.createObjectURL;
URL.createObjectURL=blob=>{window.lastExport=blob;return create(blob);};
const click=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){if(!this.download)click.call(this);};
function Observer(){window.latestWallet=useTestnetWallet();return null;}
const payment=location.pathname.match(/^\/create\/(yawrd-[a-z2-7]{12})\/payment$/);
const security=location.pathname.match(/^\/create\/(yawrd-[a-z2-7]{12})\/secure$/);
createRoot(document.getElementById('root')).render(<TestnetWalletProvider><NavigationShell><Observer/>{payment?<main className={securityStyles.page}><div className={securityStyles.container}><React.StrictMode><PaymentPanel creationId={payment[1]}/></React.StrictMode></div></main>:security?<main className={securityStyles.page}><div className={securityStyles.container}><React.StrictMode><HardeningPanel creationId={security[1]}/></React.StrictMode></div></main>:<Welcome initialIntake={location.pathname==='/create/intake'}/>}</NavigationShell></TestnetWalletProvider>);
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
    const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${utilityCss}\n${navCss}</style><div id="root"></div><script>window.__nextNavigation={usePathname:()=>'/yawrd/example'};window.__nextLink=props=>window.React.createElement('a',props,props.children);</script><script src="/bundle.js"></script>`;
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
    await call('Page.navigate', { url: origin });

    await waitFor('!!document.getElementById("intake-name")');
    await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent==="Back").click()');
    await waitFor('document.querySelector("main")?.textContent.includes("Welcome back.")');
    const click = label => evaluate(`[...document.querySelectorAll('main button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
    const fill = (id,value) => evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);
    async function mouseSummary(id) {
      const point = await evaluate(`(()=>{const e=document.querySelector('#${id} > summary');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await call('Input.dispatchMouseEvent', {type:'mousePressed',button:'left',clickCount:1,...point});
      await call('Input.dispatchMouseEvent', {type:'mouseReleased',button:'left',clickCount:1,...point});
    }
    async function keySummary(id, key = 'Enter') {
      await evaluate(`document.querySelector('#${id} > summary').focus()`);
      await call('Input.dispatchKeyEvent', {type:'keyDown',key,code:key==='Enter'?'Enter':'Space',text:key==='Enter'?'\r':' ',windowsVirtualKeyCode:key==='Enter'?13:32});
      await call('Input.dispatchKeyEvent', {type:'keyUp',key,code:key==='Enter'?'Enter':'Space',windowsVirtualKeyCode:key==='Enter'?13:32});
    }
    const evidence = '/tmp/yawrd-intake-recovery-evidence';
    async function screenshot(name, width) {
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      await evaluate('window.scrollTo({top:0,left:0,behavior:"instant"})');
      const {cssContentSize} = await call('Page.getLayoutMetrics');
      // Give the full page a viewport so Chromium paints every accordion body.
      await call('Emulation.setDeviceMetricsOverride',{width,height:Math.ceil(cssContentSize.height),deviceScaleFactor:1,mobile:false});
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const result = await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await mkdir(evidence,{recursive:true});await writeFile(evidence+'/'+name+'.png',Buffer.from(result.data,'base64'));
    }
    if (process.env.YAWRD_BROWSER_INTAKE_ASSISTANCE === '1') {
      await click('Start a new Yawrd →');await waitFor('!!document.getElementById("intake-name")');
      await fill('intake-name','Seed circle');
      assert.equal(await evaluate('document.getElementById("intake-ai-help").open'),false);
      const writes=await evaluate('window.authRequests.filter(r=>r.method==="POST"||r.method==="PATCH").length');
      await keySummary('intake-ai-help');await waitFor('document.getElementById("intake-ai-help").open');
      assert.equal(await evaluate('document.getElementById("intake-name").value'),'Seed circle');
      assert.match(await evaluate('document.querySelector("main").textContent'),/Opening this help makes no AI request/);
      await evaluate('window.clipboardFailure=true');await click('Copy questions');
      await waitFor('document.querySelector("[role=status]")?.textContent.includes("Copy is unavailable")');
      assert.ok(await evaluate('document.querySelector("#intake-ai-help pre").textContent.includes("What type of project")'));
      await click('Download intake and AI instructions');
      const portable=await evaluate('window.lastExport.text()');assert.match(portable,/Seed circle/);assert.match(portable,/provider’s privacy practices/);
      const suggestion={projectName:'Seed circle',answers:{projectType:'community',startingPoint:'idea',availableResources:'None yet',successCriteria:'Three neighbors can compare seed observations.',intendedBudget:'no-money-needed',founderDescription:'Help neighbors share seed observations. Work is voluntary and unpaid.'}};
      await fill('assisted-intake',JSON.stringify({...suggestion,classification:{admin:true}}));await click('Preview suggested answers');
      await waitFor('document.querySelector("#intake-ai-help [role=alert]")?.textContent.includes("not allowed")');
      assert.equal(await evaluate(`document.querySelector('[aria-label="Suggested answer preview"]')`),null);
      await fill('assisted-intake',JSON.stringify(suggestion));await click('Preview suggested answers');
      await waitFor(`!!document.querySelector('[aria-label="Suggested answer preview"]')`);
      assert.equal(await evaluate('document.getElementById("field-projectType").value'),'');
      assert.equal(await evaluate('window.authRequests.filter(r=>r.method==="POST"||r.method==="PATCH").length'),writes);
      await click('Apply suggested answers');await waitFor('document.getElementById("field-projectType").value==="community"');
      await keySummary('intake-ai-help');await waitFor('!document.getElementById("intake-ai-help").open');
      await keySummary('intake-ai-help');await waitFor('document.getElementById("intake-ai-help").open');
      assert.equal(await evaluate('document.getElementById("field-projectType").value'),'community');
      await click('Next');await waitFor('!!document.getElementById("field-successCriteria")');
      assert.equal(await evaluate('document.getElementById("intake-ai-help").open'),false);
      assert.equal(await evaluate('document.querySelector("main input[type=checkbox]").checked'),false);
      await fill('field-availableResources','...');await click('Next');await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("None yet")');
      await fill('field-availableResources','None yet');await evaluate('document.querySelector("main input[type=checkbox]").click()');
      await fill('field-successCriteria','Five neighbors can compare seed observations.');
      assert.equal(await evaluate('document.querySelector("main input[type=checkbox]").checked'),false);
      await evaluate('document.querySelector("main input[type=checkbox]").click()');await click('Next');
      await waitFor('!!document.getElementById("field-founderDescription")');await click('Next');await waitFor('document.querySelector("h1").textContent==="Review your intake"');
      await click('Save intake');await waitFor('[...document.querySelectorAll("[role=status]")].some(e=>e.textContent.includes("Saved revision 1"))');
      const original=await evaluate('structuredClone(Object.values(window.records)[0])');
      await click('Export draft');const backup=JSON.parse(await evaluate('window.lastExport.text()'));assert.equal(backup.answers.initialOutcomeConfirmed,true);assert.equal(backup.answers.founderDescription,suggestion.answers.founderDescription);
      await keySummary('intake-ai-help');await waitFor('document.getElementById("intake-ai-help").open');
      const revised={...suggestion,answers:{...suggestion.answers,successCriteria:backup.answers.successCriteria,founderDescription:'PRIVATE revised seed observations. Explicitly unpaid.'}};
      await fill('assisted-intake',JSON.stringify(revised));await click('Preview suggested answers');await click('Apply suggested answers');
      assert.equal(await evaluate('Object.values(window.records)[0].revision'),1);
      await click('Save intake');await waitFor('[...document.querySelectorAll("[role=status]")].some(e=>e.textContent.includes("Saved revision 2"))');
      const saved=await evaluate('structuredClone(Object.values(window.records)[0])');assert.deepEqual(saved.initialIntake,original.initialIntake);assert.deepEqual(saved.configuration,original.configuration);assert.equal(saved.id,original.id);
      await call('Page.reload');await waitFor('!!document.getElementById("intake-name")');
      await click('Next');await waitFor('!!document.getElementById("field-successCriteria")');await click('Next');await waitFor('document.getElementById("field-founderDescription")?.value.includes("PRIVATE revised")');
      await keySummary('intake-ai-help');await waitFor('document.getElementById("intake-ai-help").open');await fill('assisted-intake','PRIVATE pending response');
      await screenshot('intake-assistance-mobile',390);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
      await evaluate('window.authenticated="other.testnet";window.dispatchEvent(new Event("focus"))');
      await waitFor('!document.getElementById("assisted-intake")');assert.doesNotMatch(await evaluate('document.querySelector("main").textContent'),/PRIVATE revised|PRIVATE pending/);
      assert.equal(await evaluate('window.authRequests.some(r=>r.url.includes("preparation")||r.url.includes("platform-fee")||r.url.includes("deployment"))'),false);
      assert.deepEqual(blocked,[]);return;
    }
    if (process.env.YAWRD_BROWSER_ACCOUNT_AUTH === '1') {
      const id='yawrd-aaaaaaaaaaaa',route='/create/'+id+'/payment?return=keep#review';
      const view={binding:{creationId:id,creationRevision:6,intentRevision:14,daoAccountId:'a1b2c3d4e5f6.factory.yawrd.testnet',factoryAccountId:'factory.yawrd.testnet',
        name:'Synthetic account recovery',founderAccountId:'founder.testnet',members:['founder.testnet','second.testnet'],creationTransaction:'T'.repeat(43)},
        verified:true,autoUpdate:false,blockHeight:200,blockHash:'B'.repeat(43),checkedAt:new Date().toISOString(),proposal:{id:0,status:'Approved',votes:{'founder.testnet':'Approve','second.testnet':'Approve'}}};
      await evaluate(`sessionStorage.setItem('security-view',${JSON.stringify(JSON.stringify(view))});sessionStorage.setItem('security-wallet','1');sessionStorage.setItem('account-expired','1');sessionStorage.setItem('mock-wallet-account','founder.testnet');history.replaceState(null,'',${JSON.stringify(route)})`);
      await call('Page.reload');await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("expired")');
      await click('Sign in or renew from Account');assert.equal(await evaluate('document.getElementById("global-account").open'),true);
      const accountClick=label=>evaluate(`[...document.querySelectorAll('#global-account button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);
      const terms=()=>evaluate('document.querySelector("#global-account input[type=checkbox]").click()');
      await terms();await accountClick('Sign in');await waitFor('[...document.querySelectorAll("#global-account button")].some(b=>b.textContent==="Approve sign-in message")');
      await evaluate('window.rejectAccountProof=true');await accountClick('Approve sign-in message');
      await waitFor('document.querySelector("#global-account [role=alert]")?.textContent.includes("could not be verified")');
      assert.equal(await evaluate('!!document.querySelector("main dl")'),false);
      await evaluate('window.rejectAccountProof=false');await accountClick('Sign in');await waitFor('[...document.querySelectorAll("#global-account button")].some(b=>b.textContent==="Approve sign-in message")');
      await accountClick('Approve sign-in message');await waitFor('document.querySelector("main")?.textContent.includes("Synthetic account recovery")');
      assert.equal(await evaluate('location.pathname+location.search+location.hash'),route);
      assert.equal(await evaluate('window.accountProofRequests'),2,'one message per deliberate attempt; failed proof grants no access');
      assert.equal(await evaluate('window.authRequests.filter(r=>r.url.includes("/platform-fee")).every(r=>r.method==="GET")'),true);
      await accountClick('Sign out');await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("expired")');
      assert.equal(await evaluate('location.pathname+location.search+location.hash'),route);
      await evaluate('window.mockWalletAccount="second.testnet";window.connector.events["wallet:signIn"]({wallet:window.connector.wallet,accounts:[{accountId:"second.testnet"}]})');
      await terms();await accountClick('Sign in');await waitFor('[...document.querySelectorAll("#global-account button")].some(b=>b.textContent==="Approve sign-in message")');
      await accountClick('Approve sign-in message');await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("Only the founder")');
      assert.equal(await evaluate('location.pathname+location.search+location.hash'),route);
      await accountClick('Disconnect wallet and sign out');await waitFor('[...document.querySelectorAll("#global-account button")].some(b=>b.textContent==="Connect wallet")');
      const proofsBeforeConnect=await evaluate('window.accountProofRequests');
      await terms();await accountClick('Connect wallet');await waitFor('document.querySelector("#global-account")?.textContent.includes("Connected: second.testnet")');
      assert.equal(await evaluate('window.accountProofRequests'),proofsBeforeConnect,'connection does not automatically sign in');
      assert.equal(await evaluate('(window.feeSignatures||0)+(window.securitySignatures||0)'),0);
      assert.deepEqual(blocked,[]);return;
    }
    if (process.env.YAWRD_BROWSER_FEE_REVIEW === '1') {
      const id='yawrd-aaaaaaaaaaaa',dao='a1b2c3d4e5f6.factory.yawrd.testnet';
      const view={binding:{creationId:id,creationRevision:6,intentRevision:14,daoAccountId:dao,
        factoryAccountId:'factory.yawrd.testnet',name:'Synthetic platform fee review',founderAccountId:'founder.testnet',
        members:['founder.testnet','second.testnet'],creationTransaction:'T'.repeat(43)},accountId:'founder.testnet',
        verified:true,autoUpdate:false,blockHeight:200,blockHash:'B'.repeat(43),checkedAt:new Date().toISOString(),
        proposal:{id:0,status:'Approved',votes:{'founder.testnet':'Approve','second.testnet':'Approve'}}};
      await evaluate(`sessionStorage.setItem('security-view',${JSON.stringify(JSON.stringify(view))});history.replaceState(null,'','/create/${id}/payment')`);
      await call('Page.reload');
      await waitFor('!!document.getElementById("platform-fee-consent")');
      assert.equal(await evaluate('document.querySelector("main")?.textContent.includes("0.5 Testnet NEAR")'),true);
      assert.equal(await evaluate('document.querySelector("main")?.textContent.includes("yawrd.testnet")'),true);
      assert.equal(await evaluate('document.querySelector("main")?.textContent.includes("founder.testnet")'),true);
      assert.equal(await evaluate('document.getElementById("payment-technical").open'),false);
      const pay='[...document.querySelectorAll("main button")].find(b=>b.textContent.includes("Pay platform fee in Meteor"))';
      assert.equal(await evaluate(pay+'.disabled'),true);
      await evaluate('document.getElementById("platform-fee-consent").click()');
      assert.equal(await evaluate(pay+'.disabled'),true,'consent cannot bypass absent durable payment storage');
      await click('Refresh review — no signing');
      await waitFor('document.getElementById("platform-fee-consent")&&!document.getElementById("platform-fee-consent").checked');
      await keySummary('payment-technical');await waitFor('document.getElementById("payment-technical")?.open');
      await keySummary('payment-technical');await waitFor('document.getElementById("payment-technical")&&!document.getElementById("payment-technical").open');
      await screenshot('platform-fee-review-desktop',1280);await screenshot('platform-fee-review-mobile',390);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
      await call('Page.reload');await waitFor('!!document.getElementById("platform-fee-consent")');
      assert.equal(await evaluate('document.getElementById("platform-fee-consent").checked'),false);
      await evaluate('sessionStorage.setItem("synthetic-account","second.testnet")');await call('Page.reload');
      await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("Only the founder")');
      assert.equal(await evaluate('!!document.querySelector("main dl")'),false);
      await call('Page.navigate',{url:origin+'/create'});
      await waitFor('[...document.querySelectorAll("main a")].some(a=>a.textContent==="Security: Synthetic platform fee review")');
      assert.equal(await evaluate('[...document.querySelectorAll("main a")].find(a=>a.textContent.startsWith("Security:")).getAttribute("href")'),'/create/'+id+'/secure');
      assert.equal(await evaluate('window.authRequests.filter(r=>r.url.endsWith("/platform-fee")).every(r=>r.method==="GET")'),true);
      assert.equal(await evaluate('window.securitySignatures||0'),0);
      assert.deepEqual(blocked,[]);
      // The same isolated UI harness now supplies a mock installed store. No
      // real SDK executor, database or network payment is involved.
      await evaluate(`sessionStorage.setItem('synthetic-account','founder.testnet');sessionStorage.setItem('security-wallet','1');sessionStorage.setItem('fee-installed','1');sessionStorage.setItem('fee-authorized','1');history.replaceState(null,'','/create/${id}/payment')`);
      await call('Page.reload');
      await waitFor('[...document.querySelectorAll("main button")].some(b=>b.textContent==="Prepare payment review — no transfer")');
      await click('Prepare payment review — no transfer');
      await waitFor('document.getElementById("platform-fee-consent")&&!document.getElementById("platform-fee-consent").disabled');
      const activePay='[...document.querySelectorAll("main button")].find(b=>b.textContent==="Pay platform fee in Meteor")';
      assert.equal(await evaluate(activePay+'.disabled'),true);
      await evaluate('document.getElementById("platform-fee-consent").click();window.feeAllowSigning=true');
      await waitFor(activePay+'&&!('+activePay+').disabled');
      await screenshot('platform-fee-ready-desktop',1280);await screenshot('platform-fee-ready-mobile',390);
      // A script click has no browser activation: popup blocking must consume
      // no durable claim. Then use a trusted mouse click, as the founder does.
      await click('Pay platform fee in Meteor');
      await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("popup was blocked")');
      assert.equal(await evaluate('JSON.parse(sessionStorage.getItem("fee-state")).attempt'),0);
      await call('Page.bringToFront');
      await click('Prepare payment review — no transfer');
      await waitFor('document.getElementById("platform-fee-consent")&&!document.getElementById("platform-fee-consent").disabled');
      await evaluate('document.getElementById("platform-fee-consent").click()');
      await waitFor(activePay+'&&!('+activePay+').disabled');
      const feePoint=await evaluate('(()=>{const e='+activePay+';e.scrollIntoView({block:"center",behavior:"instant"});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
      await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...feePoint});
      await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...feePoint});
      await waitFor('document.querySelector("main")?.textContent.includes("Payment unresolved")');
      assert.equal(await evaluate('window.feeSignatures'),1);
      assert.equal(await evaluate('JSON.parse(sessionStorage.getItem("fee-state")).attempt'),1);
      assert.deepEqual(await evaluate('window.feeSigned'),{network:'testnet',signerId:'founder.testnet',receiverId:'yawrd.testnet',actions:[{type:'Transfer',params:{deposit:'500000000000000000000000'}}]});
      await call('Page.reload');await waitFor('!!document.getElementById("platform-fee-hash")');
      assert.equal(await evaluate('[...document.querySelectorAll("main button")].some(b=>b.textContent==="Pay platform fee in Meteor")'),false);
      await fill('platform-fee-hash','U'.repeat(43));await click('Verify existing payment — no signing');
      await waitFor('document.querySelector("main")?.textContent.includes("Verified paid")');
      await screenshot('platform-fee-paid-mobile',390);
      await call('Page.reload');await waitFor('document.querySelector("main")?.textContent.includes("Verified paid")');
      assert.equal(await evaluate('sessionStorage.getItem("fee-signatures")'),'1');
      assert.equal(await evaluate('document.querySelector("main")?.textContent.includes("execution stay closed")'),true);
      assert.deepEqual(blocked,[]);
      console.log('Fee screenshots (synthetic): '+evidence+'/platform-fee-ready-desktop.png, platform-fee-ready-mobile.png, platform-fee-paid-mobile.png');
      return;
    }
    const key='yawrd.intake-draft.v1:account:founder.testnet';
    const restoreFile = async (text, stage = true) => {
      const bound = await evaluate('new URLSearchParams(location.search).has("draft")');
      await evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(text)}],'intake.json',{type:'application/json'}));const e=document.querySelector('input[type=file]');e.files=transfer.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      let valid=true;try{parseYawrdIntakeDraft(text);}catch{valid=false;}
      if(bound&&stage&&valid){await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Use restored answers for this saved Creation")');await click('Use restored answers for this saved Creation');}
    };
    const assertRestored = value => {assert.deepEqual(value.answers,saved.answers);assert.equal(value.projectName,saved.projectName);assert.equal(value.draftId,saved.draftId);assert.equal(value.createdAt,saved.createdAt);};
    await evaluate(`localStorage.setItem('yawrd.intake-draft.v1','UNSCOPED PRIVATE LEGACY')`);
    await click('Start a new Yawrd →');
    await waitFor('!!document.getElementById("intake-name")');
    assert.equal(await evaluate('document.getElementById("intake-name").value'),'');
    assert.equal(await evaluate('document.getElementById("field-projectType").value'),'');
    assert.equal(await evaluate('document.querySelector("main details").open'),false);
    await evaluate('document.querySelector("main details summary").focus()');
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await waitFor('document.querySelector("main details").open');
    await click('Copy questions');
    await waitFor('!!window.copiedQuestions');
    assert.equal(await evaluate('window.copiedQuestions'),COPY_INTAKE_QUESTIONS);
    await evaluate('window.clipboardFailure=true');await click('Copy questions');
    await waitFor('document.querySelector("main").textContent.includes("Copy is unavailable")');
    await click('Next');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("name")');
    const projectName='  Community Garden  ',resources='  Two neighbors, sketches and a shed.\n',outcome='Five neighbors plant a bed.\n',description='  A neighborhood garden.\n\nEveryone can help — together.  ';
    await fill('intake-name',projectName);await fill('field-projectType','community');await fill('field-startingPoint','idea');
    await click('Next');await waitFor('!!document.getElementById("field-availableResources")');
    await fill('field-availableResources',resources);await fill('field-successCriteria',outcome);
    await click('Next');await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("explicitly confirm")');
    await evaluate('document.querySelector("main input[type=checkbox]").click()');
    await fill('field-successCriteria',outcome+'Updated');
    assert.equal(await evaluate('document.querySelector("main input[type=checkbox]").checked'),false);
    await fill('field-successCriteria',outcome);await evaluate('document.querySelector("main input[type=checkbox]").click()');
    await click('Next');await waitFor('!!document.getElementById("field-founderDescription")');
    assert.equal(await evaluate('document.getElementById("field-founderDescription").maxLength'),20000);
    await fill('field-intendedBudget','no-money-needed');await fill('field-founderDescription',description);
    await click('Back');await waitFor('!!document.getElementById("field-availableResources")');
    assert.equal(await evaluate('document.getElementById("field-availableResources").value'),resources);
    await click('Next');await waitFor('!!document.getElementById("field-founderDescription")');
    assert.equal(await evaluate('document.getElementById("field-founderDescription").value'),description);
    await click('Next');await waitFor('document.querySelector("h1").textContent==="Review your intake"');
    await click('Save intake');
    await waitFor('[...document.querySelectorAll("[role=status]")].some(e=>e.textContent.includes("Saved privately to your account."))');
    assert.equal(await evaluate('document.querySelector("main").textContent.includes("No Blueprint has been published.")'),true);
    assert.equal(await evaluate('[...document.querySelectorAll("main button,main a")].some(e=>/Publish|Deploy|Fund|Generate Blueprint/.test(e.textContent))'),false);
    assert.equal(await evaluate('document.querySelectorAll("ol li").length'),5);
    assert.equal(await evaluate('[...document.querySelectorAll("ol li")].slice(3).every(e=>e.textContent.includes("unavailable")&&!e.querySelector("a,button"))'),true);
    for(const width of [320,390,768,1440]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'intake review fits '+width);
    }
    await click('Export draft');const exported=await evaluate('window.lastExport.text()');const saved=JSON.parse(exported);
    assert.equal(saved.projectName,projectName);assert.equal(saved.answers.availableResources,resources);assert.equal(saved.answers.successCriteria,outcome);assert.equal(saved.answers.founderDescription,description);
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`),exported);
    assert.equal(await evaluate('localStorage.getItem("yawrd.intake-draft.v1")'),'UNSCOPED PRIVATE LEGACY');
    await click('Continue to setup review →');await waitFor('document.querySelector("h1")?.textContent==="Set up your Yawrd"');
    assert.deepEqual(await evaluate('[...document.querySelectorAll("#setup-sections > details > summary h2")].map(e=>e.textContent)'),['Your project','Public project details','Set up your Yawrd account','Setup costs and next steps']);
    assert.equal(await evaluate('document.getElementById("setup-project").open'),false,'saved project starts collapsed');
    assert.equal(await evaluate('document.getElementById("setup-public").open'),true,'first incomplete section is active');
    await keySummary('setup-account');await waitFor('document.getElementById("setup-account").open');
    await keySummary('setup-account',' ');await waitFor('!document.getElementById("setup-account").open');
    await mouseSummary('setup-account');await waitFor('document.getElementById("setup-account").open');
    let daoIdentifier='';
    assert.equal(await evaluate('document.getElementById("setup-dao-identifier").value'),'','identity is not generated in the browser before reservation');
    assert.equal(await evaluate('document.getElementById("setup-dao-identifier").readOnly'),true);
    assert.equal(await evaluate('!!document.getElementById("setup-label")'),false,'new drafts do not ask for an on-chain name');
    assert.equal(await evaluate('(window.deploymentRequests||[]).length'),0,'loading setup only reads durable state');
    assert.equal(await evaluate('document.getElementById("setup-first-steward").readOnly'),true);
    assert.equal(await evaluate('document.getElementById("setup-description").value'),'');
    assert.equal(await evaluate('document.getElementById("setup-steward").value'),'');
    assert.equal(await evaluate('[...document.querySelectorAll("main button")].filter(b=>/Create Yawrd account|Pay platform fee|Generate Blueprint|Launch Yawrd/.test(b.textContent)).every(b=>b.disabled)'),true);
    assert.equal(await evaluate('document.querySelectorAll("#setup-threshold option").length'),1);
    await click('Check setup details');await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("Explicitly review")');
    await fill('setup-name','Public garden');await fill('setup-description','A separately reviewed public summary.');
    await fill('setup-steward','founder.testnet');
    await evaluate('document.getElementById("setup-public-consent").click()');await click('Check setup details');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("Duplicate")');
    await fill('setup-steward','neighbor.testnet');
    await waitFor('document.querySelector("#setup-public > summary").textContent.includes("Unsaved changes")');
    assert.equal(await evaluate('document.querySelector("#setup-account > summary").textContent.includes("Unsaved changes")'),true);
    await mouseSummary('setup-public');await waitFor('!document.getElementById("setup-public").open');
    await mouseSummary('setup-public');await waitFor('document.getElementById("setup-public").open');
    assert.equal(await evaluate('document.getElementById("setup-description").value'),'A separately reviewed public summary.','collapse keeps unsaved wording');
    // Make account setup the active section, with public details still open.
    await mouseSummary('setup-account');await waitFor('!document.getElementById("setup-account").open');
    await mouseSummary('setup-account');await waitFor('document.getElementById("setup-account").open');
    await click('Check setup details');
    await waitFor(`!!document.querySelector('section[aria-label="Setup review"]')`);
    assert.equal(await evaluate(`document.querySelector('section[aria-label="Setup review"]').textContent.includes("A separately reviewed public summary.")`),true);
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`),exported,'setup never rewrites intake');
    for(const width of [320,390,768,1440]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'setup fits '+width);
      assert.equal(await evaluate(`(()=>{const r=[...document.querySelectorAll('#setup-sections > details')].map(e=>e.getBoundingClientRect());return r.every((x,i)=>i===0||x.top>=r[i-1].bottom)&&r.every(x=>Math.abs(x.left-r[0].left)<1&&Math.abs(x.width-r[0].width)<1);})()`),true,'sections form a single column at '+width);
    }
    await evaluate('window.setupNode=document.getElementById("setup-description");window.dispatchEvent(new Event("focus"))');
    await waitFor('!document.querySelector("[aria-busy=true]")');assert.equal(await evaluate('window.setupNode===document.getElementById("setup-description")'),true);
    await click('Save changes');await waitFor('document.querySelector("main").textContent.includes("Your changes are saved privately")');
    assert.equal(await evaluate('Object.values(window.records)[0].publicTextReview'),null);
    await waitFor('!document.getElementById("setup-public").open');
    assert.equal(await evaluate('document.getElementById("setup-account").open'),true,'active section stays open after save');
    assert.equal(await evaluate('document.querySelector("#setup-public > summary").textContent.includes("Saved")'),true);
    assert.equal(await evaluate('document.querySelector("#setup-account > summary").textContent.includes("Saved")'),true);
    assert.equal(await evaluate('document.querySelector("main").textContent.includes("All changes are saved in your private draft.")'),true);
    await mouseSummary('setup-costs');await waitFor('document.getElementById("setup-costs").open');
    await click('Prepare saved deployment — no wallet request');await waitFor('document.querySelector("main").textContent.includes("Saved deployment request")');
    await waitFor('document.getElementById("setup-dao-identifier").value.length===12');
    daoIdentifier=await evaluate('document.getElementById("setup-dao-identifier").value');
    assert.match(daoIdentifier,/^[a-z0-9]{12}$/);
    assert.equal(await evaluate('Object.values(window.deploymentIntents)[0].identifier'),daoIdentifier);
    assert.deepEqual(await evaluate('Object.keys(window.deploymentRequests[0]).sort()'),['action','expectedRevision']);
    assert.equal(await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.startsWith("Open a Yawrd · approve in wallet")).disabled'),true,'forged enable flag cannot enable signing');
    await evaluate('window.deploymentError="dao_account_collision"');await click('Prepare saved deployment — no wallet request');
    await waitFor('document.querySelector("main").textContent.includes("reserved address is already in use")');
    assert.equal(await evaluate('document.getElementById("setup-dao-identifier").value'),daoIdentifier,'collision does not silently rotate identity');
    await evaluate('window.deploymentError=null');await click('Prepare saved deployment — no wallet request');
    await waitFor('document.querySelector("main").textContent.includes("Saved deployment request")');
    assert.equal(await evaluate('Object.values(window.deploymentIntents)[0].identifier'),daoIdentifier);
    // Historical records retain their old field without adopting it as identity.
    await evaluate('Object.values(window.records)[0].configuration.accountLabel="legacy-garden";Object.values(window.records)[0].revision++;sessionStorage.setItem("synthetic-creations",JSON.stringify(window.records))');
    await screenshot('setup-desktop',1440);await screenshot('setup-mobile',390);
    await mouseSummary('setup-public');await waitFor('document.getElementById("setup-public").open');
    await fill('setup-description','Changed description');assert.equal(await evaluate('document.getElementById("setup-public-consent").checked'),false);
    assert.equal(await evaluate(`!!document.querySelector('section[aria-label="Setup review"]')`),false);
    await call('Page.reload');await waitFor('!!document.getElementById("setup-description")');assert.equal(await evaluate('document.getElementById("setup-description").value'),'A separately reviewed public summary.','saved configuration survives reload');
    assert.equal(await evaluate('document.getElementById("setup-label").value'),'legacy-garden');
    assert.equal(await evaluate('document.getElementById("setup-label").readOnly'),true);
    assert.equal(await evaluate('document.getElementById("setup-steward").value'),'neighbor.testnet');
    assert.equal(await evaluate('document.getElementById("setup-public-consent").checked'),false,'saving does not imply review');
    await waitFor('document.getElementById("setup-dao-identifier").value==='+JSON.stringify(daoIdentifier));
    assert.equal(await evaluate('document.getElementById("setup-dao-identifier").value'),daoIdentifier,'server identity survives reload without using the display name');
    await evaluate('window.authenticated="other.testnet";window.dispatchEvent(new Event("focus"))');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("unavailable for your signed-in account")');
    assert.equal(await evaluate('!!document.getElementById("setup-description")'),false);
    assert.equal(await evaluate('document.querySelector("main").textContent.includes("Community Garden")'),false);
    await evaluate('window.authenticated="founder.testnet";window.dispatchEvent(new Event("focus"))');await waitFor('!!document.getElementById("setup-description")');
    assert.equal(await evaluate('document.getElementById("setup-costs").open'),true,'resumed complete setup opens next steps');
    await mouseSummary('setup-project');await waitFor('document.getElementById("setup-project").open');
    await click('Review project answers');await waitFor('!!document.getElementById("intake-name")');
    assert.equal(await evaluate('document.getElementById("intake-name").value'),projectName);

    assert.match(await evaluate('location.search'),/^\?step=intake&draft=yawrd-/);
    assert.equal(await evaluate('location.href.includes("Community")'),false);
    await call('Page.reload');await waitFor('document.getElementById("intake-name")?.value==="  Community Garden  "');
    // Refreshed sessions preserve the mounted form and in-progress edits.
    await fill('intake-name',projectName+' edit');
    await evaluate('window.formNode=document.getElementById("intake-name");window.dispatchEvent(new Event("focus"))');
    await waitFor('!document.querySelector("[aria-busy=true]")');
    assert.equal(await evaluate('window.formNode===document.getElementById("intake-name")'),true);
    await restoreFile(exported);await waitFor('document.querySelector("h1").textContent==="Review your intake"');
    await click('Export draft');assertRestored(JSON.parse(await evaluate('window.lastExport.text()')));
    // Old v1 exports keep the destination name when applying editable answers.
    const historical={...saved};delete historical.projectName;
    await restoreFile(JSON.stringify(historical));await waitFor('document.querySelector("h1").textContent==="Review your intake"');
    await click('Export draft');assertRestored(JSON.parse(await evaluate('window.lastExport.text()')));
    await restoreFile(exported);await waitFor('document.querySelector("h1").textContent==="Review your intake"');
    const beforeInvalid=await evaluate(`localStorage.getItem(${JSON.stringify(key)})`);
    const forged={...saved,gates:{...saved.gates,blueprintApproval:'approved'}};
    await restoreFile(JSON.stringify(forged));await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("gates")');
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`),beforeInvalid);
    // A failed server save leaves edits exportable and does not claim success.
    await evaluate('window.saveFailure=true');await click('Save intake');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("could not be saved or loaded")');
    await click('Export draft');assertRestored(JSON.parse(await evaluate('window.lastExport.text()')));
    await evaluate('window.saveFailure=false');await click('Save intake');
    await waitFor('[...document.querySelectorAll("[role=status]")].some(e=>e.textContent.includes("Saved privately"))');
    // The accepted Saved state prevents resubmitting unchanged answers, even
    // when another tab advances the revision. Edited conflicts are covered below.
    await evaluate('Object.values(window.records)[0].revision++');
    assert.equal(await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent==="✓ Saved").disabled'),true);
    await click('Export draft');assertRestored(JSON.parse(await evaluate('window.lastExport.text()')));
    await click('Load saved version — discard unsaved edits');
    await waitFor('document.getElementById("intake-name")?.value==="  Community Garden  "');
    // Save an intake edit and verify both intake and configuration after reload.
    await fill('intake-name','Resumed Garden');
    await click('Next');await waitFor('!!document.getElementById("field-availableResources")');
    await click('Next');await waitFor('!!document.getElementById("field-founderDescription")');
    await click('Next');await waitFor('document.querySelector("h1").textContent==="Review your intake"');
    await click('Save intake');await waitFor('[...document.querySelectorAll("[role=status]")].some(e=>e.textContent.includes("Saved privately"))');
    await click('Continue to setup review →');await waitFor('!!document.getElementById("setup-description")');
    await mouseSummary('setup-public');await waitFor('document.getElementById("setup-public").open');
    await fill('setup-description','My unsaved configuration edit');
    await evaluate('Object.values(window.records)[0].revision++');await click('Save changes');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("changed in another tab")');
    assert.equal(await evaluate('document.getElementById("setup-description").value'),'My unsaved configuration edit');
    assert.equal(await evaluate('document.getElementById("setup-public").open'),true,'failed saves do not collapse active edits');
    await call('Page.reload');await waitFor('!!document.getElementById("setup-description")');
    assert.equal(await evaluate('document.getElementById("setup-description").value'),'A separately reviewed public summary.');
    assert.equal(await evaluate('document.querySelector("main").textContent.includes("Resumed Garden")'),true);
    // Fresh sign-in can find the same record without browser intake storage.
    await click('Back to creation');await waitFor('document.querySelector("main").textContent.includes("Welcome back.")');
    await evaluate('document.getElementById("global-account").open=true');
    await evaluate('[...document.querySelectorAll("#global-account button")].find(b=>b.textContent==="Sign out").click()');
    await waitFor('document.querySelector("main h1")?.textContent==="Sign in to open a Yawrd"');
    await evaluate('localStorage.clear();window.authenticated="other.testnet";window.dispatchEvent(new Event("focus"))');
    await waitFor('!!document.getElementById("intake-name")');await click('Back');
    await waitFor('document.querySelector("main").textContent.includes("Signed in as other.testnet")');
    await waitFor('document.querySelector("main").textContent.includes("No saved drafts yet")');
    assert.equal(await evaluate('document.querySelector("main").textContent.includes("Resumed Garden")'),false);
    await evaluate('window.authenticated="founder.testnet";window.dispatchEvent(new Event("focus"))');
    await waitFor('!!document.getElementById("intake-name")');await click('Back');
    await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Resume Resumed Garden")');
    await click('Resume Resumed Garden');await waitFor('!!document.getElementById("setup-description")');
    assert.equal(await evaluate('document.getElementById("setup-description").value'),'A separately reviewed public summary.');
    assert.equal(await evaluate('document.getElementById("setup-label").value'),'legacy-garden');
    assert.equal(await evaluate('document.getElementById("setup-label").readOnly'),true);
    await waitFor('document.getElementById("setup-dao-identifier").value==='+JSON.stringify(daoIdentifier));
    // Reproduce the founder's edited-export/version conflict from an unbound
    // browser draft, including the older browser state restored before this fix.
    const identityBefore=await evaluate('(()=>{const r=Object.values(window.records)[0];return {id:r.id,source:r.sourceDraftId,createdAt:r.intake.createdAt,configuration:structuredClone(r.configuration),initialIntake:structuredClone(r.initialIntake),dao:Object.values(window.deploymentIntents)[0].identifier};})()');
    await click('Back to creation');await waitFor('document.querySelector("main").textContent.includes("Welcome back.")');
    await click('Continue browser draft');await waitFor('!!document.getElementById("intake-name")');
    const browserBeforeRestore=await evaluate('JSON.parse(localStorage.getItem("yawrd.intake-draft.v1:account:founder.testnet"))');
    const revised={...saved,projectName:'Yawrd Public Beta Test',updatedAt:new Date().toISOString(),answers:{...saved.answers,founderDescription:'Updated private beta test information.'}};
    await restoreFile(JSON.stringify(revised),false);
    await waitFor('JSON.parse(localStorage.getItem("yawrd.intake-draft.v1:account:founder.testnet")).projectName==="Yawrd Public Beta Test"');
    const browserCopies=await evaluate('JSON.parse(localStorage.getItem("yawrd.intake-recovery.v1:browser:account:founder.testnet"))');
    assert.ok(browserCopies.some(copy=>JSON.stringify(copy)===JSON.stringify(browserBeforeRestore)),'restore preserves the previous local version');
    assert.ok(browserCopies.some(copy=>copy.projectName==="Yawrd Public Beta Test"),'restore keeps an independent incoming copy');
    // Reload uses the same browser payload that triggered the demonstrated issue.
    await call('Page.reload');await waitFor('document.getElementById("intake-name")?.value==="Yawrd Public Beta Test"');
    await click('Save intake');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("different saved version")');
    assert.equal(await evaluate('Object.keys(window.records).length'),1,'the conflict allocates no duplicate Creation');
    await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Resume Resumed Garden")');
    await click('Resume Resumed Garden');
    await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Continue saved setup without applying restored answers")');
    const beforeRecoveryChoice=await evaluate('window.authRequests.filter(r=>r.method==="POST"||r.method==="PATCH").length');
    assert.equal(await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent==="Save intake").disabled'),true);
    assert.equal(await evaluate('window.authRequests.filter(r=>r.method==="POST"||r.method==="PATCH").length'),beforeRecoveryChoice,'pending recovery cannot silently save either version');
    await click('Continue saved setup without applying restored answers');await waitFor('!!document.getElementById("setup-description")');
    assert.equal(await evaluate('Object.values(window.records)[0].intake.projectName'),'Resumed Garden','resuming setup alone never applies imported answers');
    assert.equal(await evaluate('document.getElementById("setup-description").value'),identityBefore.configuration.publicDescription);
    await mouseSummary('setup-project');await waitFor('document.getElementById("setup-project").open');
    await click('Review project answers');await waitFor('!!document.getElementById("intake-name")');
    await waitFor('!!document.querySelector("#intake-recovery-copies")');
    await evaluate(`(()=>{const rows=[...document.querySelectorAll('#intake-recovery-copies p')];rows.find(p=>p.textContent.includes('Yawrd Public Beta Test')).querySelectorAll('button')[1].click();})()`);
    await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Use restored answers for this saved Creation")');
    await click('Use restored answers for this saved Creation');await waitFor('document.querySelector("h1").textContent==="Review your intake"');
    assert.equal(await evaluate('Object.values(window.records)[0].intake.projectName'),'Resumed Garden','staging is not a save');
    await click('Export draft');const staged=JSON.parse(await evaluate('window.lastExport.text()'));
    assert.equal(staged.projectName,'Yawrd Public Beta Test');assert.equal(staged.draftId,identityBefore.source);assert.equal(staged.createdAt,identityBefore.createdAt);
    // A concurrent update must still reject this staged revision and keep both
    // versions. Selecting it again refreshes only the bound server snapshot.
    await evaluate('Object.values(window.records)[0].revision++;Object.values(window.records)[0].intake={...Object.values(window.records)[0].intake,projectName:"Concurrent saved name"}');
    await click('Save intake');await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("changed in another tab")');
    assert.equal(await evaluate('Object.values(window.records)[0].intake.projectName'),'Concurrent saved name');
    await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Use restored answers for this saved Creation")');
    await click('Use restored answers for this saved Creation');await click('Save intake');
    await waitFor('[...document.querySelectorAll("[role=status]")].some(e=>e.textContent.includes("Saved privately"))');
    const recovered=await evaluate('structuredClone(Object.values(window.records)[0])');
    assert.equal(recovered.id,identityBefore.id);assert.equal(recovered.sourceDraftId,identityBefore.source);assert.equal(recovered.intake.createdAt,identityBefore.createdAt);
    assert.equal(recovered.intake.projectName,'Yawrd Public Beta Test');assert.equal(recovered.intake.answers.founderDescription,revised.answers.founderDescription);
    assert.deepEqual(recovered.configuration,identityBefore.configuration);assert.deepEqual(recovered.initialIntake,identityBefore.initialIntake);
    assert.equal(recovered.publicTextReview,null);assert.equal(await evaluate('Object.keys(window.records).length'),1);
    assert.equal(await evaluate('Object.keys(window.deploymentIntents).length'),1);
    assert.equal(await evaluate('Object.values(window.deploymentIntents)[0].identifier'),identityBefore.dao);
    assert.equal(await evaluate('location.search'),'?step=intake&draft='+identityBefore.id);
    await click('Continue to setup review →');await waitFor('!!document.getElementById("setup-description")');
    assert.equal(await evaluate('document.getElementById("setup-name").value'),identityBefore.configuration.publicName,'private restored name is not implicitly public');
    assert.equal(await evaluate('document.getElementById("setup-description").value'),identityBefore.configuration.publicDescription);
    await call('Page.reload');await waitFor('document.querySelector("main")?.textContent.includes("Yawrd Public Beta Test")');
    await waitFor('document.getElementById("setup-dao-identifier")?.value==='+JSON.stringify(identityBefore.dao));
    await click('Back to creation');await waitFor('[...document.querySelectorAll("button")].some(b=>b.textContent==="Resume Yawrd Public Beta Test")');
    await click('Resume Yawrd Public Beta Test');await waitFor('!!document.getElementById("setup-description")');
    assert.equal(await evaluate('Object.keys(window.records).length'),1);
    // A stale A tab with B's session is blocked before private content can save.
    await evaluate('window.authenticated="other.testnet"');await click('Save changes');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("sign-in changed or expired")');
    await evaluate('window.dispatchEvent(new Event("focus"))');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("unavailable for your signed-in account")');
    assert.equal(await evaluate('!!document.getElementById("setup-description")'),false);
    // Failed session checks remove the private form; recovery requires a check.
    await evaluate('window.sessionFailure=true;window.dispatchEvent(new Event("focus"))');
    await waitFor('[...document.querySelectorAll("main [role=alert]")].some(e=>e.textContent.includes("could not be checked"))');
    assert.equal(await evaluate('!!document.querySelector("main textarea")'),false);
    // Incomplete intake can also be saved durably and resumed in intake.
    await evaluate('window.sessionFailure=false');await click('Try again');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("unavailable for your signed-in account")');
    await click('Back to creation');await waitFor('document.querySelector("main").textContent.includes("Welcome back.")');
    await click('Start a new Yawrd →');await waitFor('!!document.getElementById("intake-name")');
    await fill('intake-name','Incomplete private idea');await click('Save intake');
    await waitFor('[...document.querySelectorAll("[role=status]")].some(e=>e.textContent.includes("Saved privately"))');
    assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("Continue to setup"))'),false);
    await evaluate('sessionStorage.setItem("synthetic-account","other.testnet")');
    await call('Page.reload');await waitFor('document.getElementById("intake-name")?.value==="Incomplete private idea"');
    assert.equal(await evaluate('document.getElementById("field-projectType").value'),'');
    const audit=await evaluate('window.authRequests');
    assert.ok(audit.some(x=>x.method==='POST'&&x.url==='/api/creations'));
    assert.ok(audit.some(x=>x.method==='PATCH'&&x.url.startsWith('/api/creations/')));
    assert.ok(audit.every(x=>['/api/auth/session','/api/auth/logout'].includes(x.url)||x.url.startsWith('/api/creations')),'only private draft and existing auth APIs called');
    // Synthetic authorized record: check the real UI gate and consent, but do
    // not click the signing action. The HTTP/service tests cover the claim.
    const allowed=authorizedCreationDeployment;
    const authorized={...await evaluate('structuredClone(Object.values(window.records)[0])'),
      id:allowed.creationId,network:'testnet',founderAccountId:allowed.founderAccountId,revision:6,
      configuration:{publicName:'Yawrd Public Beta Test',
        publicDescription:'We are recording public evidence of the most up to date Yawrd creation process.',
        accountLabel:'',secondSteward:'keelbase.testnet',threshold:2}};
    authorized.intake.projectName=authorized.configuration.publicName;
    const prepared=prepareCreation({projectName:authorized.configuration.publicName,projectPurpose:authorized.configuration.publicDescription,
      projectAccountLabel:allowed.identifier,creatorAccountId:allowed.founderAccountId,initialStewardAccountIds:['keelbase.testnet'],
      stewardApprovalThreshold:2,factoryAccountId:testnetFactorySettings.factoryAccountId},testnetFactorySettings,
      {accountId:allowed.founderAccountId,network:'testnet'});
    const authorizedIntent={creationId:authorized.id,network:'testnet',factoryAccountId:testnetFactorySettings.factoryAccountId,
      identifier:allowed.identifier,daoAccountId:allowed.daoAccountId,requestDigest:allowed.requestDigest,
      state:'prepared',revision:10,sourceRevision:authorized.revision,attempt:1,prepared,transactionHash:null,
      costs:{blockHeight:'278240000',attachedGasAtObservedPriceYocto:'30000000000000000000000',
        retiredAttempts:[{attempt:1,revision:5,requestDigest:allowed.requestDigest,transactionHash:null}]}};
    await evaluate(`(()=>{window.records[${JSON.stringify(authorized.id)}]=${JSON.stringify(authorized)};
      window.deploymentIntents[${JSON.stringify(authorized.id)}]=${JSON.stringify(authorizedIntent)};
      sessionStorage.setItem('synthetic-creations',JSON.stringify(window.records));
      sessionStorage.setItem('synthetic-intents',JSON.stringify(window.deploymentIntents));
      sessionStorage.setItem('synthetic-account',${JSON.stringify(allowed.founderAccountId)});
      history.replaceState(null,'','/create?step=setup&draft='+${JSON.stringify(authorized.id)});})()`);
    await call('Page.reload');
    await waitFor('document.querySelector("main")?.textContent.includes("Testnet deployment attempt 2 is authorized")');
    const walletButton='[...document.querySelectorAll("main button")].find(b=>b.textContent==="Open a Yawrd · approve in wallet")';
    assert.equal(await evaluate(walletButton+'.disabled'),true,'fresh explicit review consent is required');
    await evaluate('document.getElementById("setup-costs").querySelector("input[type=checkbox]").click()');
    await waitFor(walletButton+'&&!('+walletButton+').disabled');
    assert.equal(await evaluate('document.getElementById("setup-dao-identifier").value'),allowed.identifier);
    assert.equal(await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent==="Pay platform fee — unavailable").disabled'),true);
    await screenshot('authorized-deployment-ready',1280);
    // A browser-blocked reservation fails before any durable claim or adapter.
    await evaluate('window.open=()=>null');
    await click('Open a Yawrd · approve in wallet');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("No attempt was claimed")');
    assert.equal(await evaluate('(window.deploymentRequests||[]).some(r=>r.action!=="prepare")'),false);

    await evaluate('window.deploymentIntents["yawrd-uorgr4yy5sxu"].state="unknown";window.deploymentIntents["yawrd-uorgr4yy5sxu"].attempt=2;');
    await click('Reload deployment state');
    await waitFor('document.querySelector("main").textContent.includes("Signing is locked")');
    assert.equal(await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent.startsWith("Open a Yawrd · approve in wallet")).disabled'),true);
    assert.equal(await evaluate('(window.deploymentRequests||[]).some(r=>r.action!=="prepare")'),false,'browser check never claims or opens the wallet');
    // A review reload preserves the archive and requires fresh consent for the
    // newly authorized second attempt. No real wallet call is made here.
    await evaluate(`(()=>{const i=window.deploymentIntents['yawrd-uorgr4yy5sxu'];
      i.state='prepared';i.revision=11;i.attempt=1;i.costs={blockHeight:'278240000',attachedGasAtObservedPriceYocto:'30000000000000000000000',
        retiredAttempts:[{attempt:1,revision:5,requestDigest:i.requestDigest,transactionHash:null}]};})()`);
    await click('Reload deployment state');
    await waitFor('document.querySelector("main").textContent.includes("Recovery complete: interrupted attempt 1 was retired")');
    assert.equal(await evaluate('document.querySelector("main").textContent.includes("Attempt 2 is authorized")'),true);
    assert.equal(await evaluate('document.querySelector("main").textContent.includes("Wallet submission is unavailable for this saved state")'),false);
    assert.equal(await evaluate('[...document.querySelectorAll("main button")].find(b=>b.textContent.startsWith("Open a Yawrd · approve in wallet")).disabled'),true);
    assert.equal(await evaluate('document.getElementById("setup-dao-identifier").value'),allowed.identifier);
    assert.equal(await evaluate('(window.deploymentRequests||[]).some(r=>r.action!=="prepare")'),false,'loading completed recovery never retires or signs again');
    await evaluate('document.getElementById("setup-costs").querySelector("input[type=checkbox]").click()');
    await waitFor(walletButton+'&&!('+walletButton+').disabled');
    await screenshot('attempt-2-ready',1280);
    await evaluate('window.deploymentIntents["yawrd-uorgr4yy5sxu"].attempt=2');
    await click('Reload deployment state');
    await waitFor('[...document.querySelectorAll("main button")].find(b=>b.textContent.startsWith("Open a Yawrd · approve in wallet")).disabled');

    // Generalized security-only journey: no actual wallet signing, no intake.
    const securityBinding={creationId:allowed.creationId,creationRevision:6,intentRevision:14,daoAccountId:allowed.daoAccountId,
      factoryAccountId:testnetFactorySettings.factoryAccountId,name:'Synthetic secured project',founderAccountId:allowed.founderAccountId,
      members:[allowed.founderAccountId,'keelbase.testnet'],creationTransaction:'T'.repeat(43)};
    const securityView={binding:securityBinding,accountId:allowed.founderAccountId,autoUpdate:true,verified:false,blockHeight:200,blockHash:'B'.repeat(43),
      checkedAt:new Date().toISOString(),codeHash:testnetFactorySettings.expectedDaoCodeHash,policy:prepared.plan.initializer.policy,proposal:null,reason:'',prepared:null,fundingEnabled:false,publicationEnabled:false,platformFeesEnabled:false};
    await evaluate(`(()=>{sessionStorage.setItem('security-view',${JSON.stringify(JSON.stringify(securityView))});sessionStorage.setItem('security-wallet','1');
      history.replaceState(null,'','/create/'+${JSON.stringify(allowed.creationId)}+'/secure');})()`);
    await call('Page.reload');await waitFor('document.querySelector("main")?.textContent.includes("Updates enabled")');
    assert.equal(await evaluate('document.querySelector("main").textContent.includes("Updated private beta test information")'),false);
    await click('Review security proposal');await waitFor('!!document.getElementById("hardening-consent")');
    const securityButton='[...document.querySelectorAll("main button")].find(b=>b.textContent==="Create security proposal in Meteor")';
    assert.equal(await evaluate(securityButton+'.disabled'),true);
    await evaluate('document.getElementById("hardening-consent").click()');await waitFor(securityButton+'&&!('+securityButton+').disabled');
    const publicTransaction=await evaluate('window.lastHardeningTransaction');assert.equal(publicTransaction.receiverId,allowed.daoAccountId);
    assert.equal(publicTransaction.signerId,allowed.founderAccountId);assert.equal(publicTransaction.actions[0].params.args.proposal.kind.FactoryInfoUpdate.factory_info.auto_update,false);
    await screenshot('creation-security-ready',1280);
    await evaluate(`(()=>{const a={creationId:${JSON.stringify(allowed.creationId)},daoAccountId:${JSON.stringify(allowed.daoAccountId)},transaction:window.lastHardeningTransaction,
      phase:'pending',preparedAtBlock:200,createdAt:Date.now()};const k='yawrd:creation:'+a.creationId+':hardening:v1';localStorage.setItem(k,JSON.stringify([a]));window.dispatchEvent(new StorageEvent('storage',{key:k}));})()`);
    await waitFor('document.querySelector("main").textContent.includes("Verify the pending wallet request")');
    assert.equal(await evaluate('!!document.getElementById("hardening-next-action")'),false);
    await fill('hardening-hash','T'.repeat(43));await click('Verify security transaction — no wallet request');
    await waitFor('document.querySelector("main").textContent.includes("not final yet")');
    assert.equal(await evaluate('!!document.getElementById("hardening-next-action")'),false);
    await evaluate('window.securityReceipt="verified"');await click('Verify security transaction — no wallet request');
    await waitFor('document.querySelector("main").textContent.includes("Transaction verified")');
    // Verified proposal creation must lead directly to the founder's first
    // approval of proposal #0, including after a read-only refresh.
    await waitFor('document.getElementById("security-next")?.textContent.includes("Review your approval")');
    await click('Refresh status — no signing');
    await waitFor('document.getElementById("hardening-next-action")?.textContent==="Review approval for proposal #0"');
    assert.equal(await evaluate('document.querySelector("progress").value'),0);
    assert.equal(await evaluate('document.getElementById("security-technical").open'),false);
    await keySummary('security-technical');await waitFor('document.getElementById("security-technical").open');
    await keySummary('security-technical');await waitFor('!document.getElementById("security-technical").open');
    await screenshot('approval-next-desktop',1280);await screenshot('approval-next-mobile',390);
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
    await click('Review approval for proposal #0');await waitFor('!!document.getElementById("hardening-consent")');
    const approvalButton='[...document.querySelectorAll("main button")].find(b=>b.textContent==="Approve security proposal in Meteor")';
    assert.equal(await evaluate(approvalButton+'.disabled'),true,'first approval requires a separate consent');
    assert.equal((await evaluate('window.lastHardeningTransaction')).actions[0].params.methodName,'act_proposal');
    assert.equal((await evaluate('window.lastHardeningTransaction')).actions[0].params.args.id,0);
    await evaluate('document.getElementById("hardening-consent").click()');
    await keySummary('security-review');await waitFor('!document.getElementById("security-review").open');
    await keySummary('security-review');await waitFor('document.getElementById("security-review").open');
    assert.equal(await evaluate('document.getElementById("hardening-consent").checked'),true,'collapsing review preserves consent inputs');
    await evaluate('window.securityAllowSigning=true;window.open=()=>({closed:false,document:{title:"",body:{textContent:""}},location:{replace(){}},close(){this.closed=true;}})');
    await click('Approve security proposal in Meteor');
    await waitFor('document.querySelector("main").textContent.includes("Waiting for keelbase.testnet")');
    assert.equal(await evaluate('document.querySelector("progress").value'),1);
    assert.equal(await evaluate('!!document.getElementById("hardening-next-action")'),false,'the founder cannot repeat their approval');
    await click('Refresh status — no signing');await waitFor('document.querySelector("main").textContent.includes("Waiting for keelbase.testnet")');
    assert.equal(await evaluate('window.securitySignatures'),1);
    // Switch verified sessions on this page. One refresh loads the second
    // Steward; no extra failed refresh or private intake access is needed.
    await evaluate('window.authenticated="keelbase.testnet";sessionStorage.setItem("synthetic-account","keelbase.testnet")');
    await click('Refresh status — no signing');
    await waitFor('document.querySelector("main").textContent.includes("Signed in as keelbase.testnet")');
    await click('Review approval for proposal #0');
    await waitFor('[...document.querySelectorAll("main button")].some(b=>b.textContent==="Approve and execute security change in Meteor")');
    assert.equal((await evaluate('window.lastHardeningTransaction')).signerId,'keelbase.testnet');
    assert.equal((await evaluate('window.lastHardeningTransaction')).actions[0].params.args.id,0);
    const executeButton='[...document.querySelectorAll("main button")].find(b=>b.textContent==="Approve and execute security change in Meteor")';
    assert.equal(await evaluate(executeButton+'.disabled'),true,'second approval has its own consent');
    await evaluate('document.getElementById("hardening-consent").click()');await click('Approve and execute security change in Meteor');
    await waitFor('document.querySelector("main").textContent.includes("Security hardening verified")');
    assert.equal(await evaluate('document.querySelector("progress").value'),2);
    assert.equal(await evaluate('!!document.getElementById("hardening-next-action")'),false);
    assert.equal(await evaluate('document.querySelector("main").textContent.includes("Project Funds and publication remain unavailable")'),true);
    assert.equal(await evaluate('window.securitySignatures'),2);
    assert.equal(await evaluate('window.securitySigned.every(tx=>tx.actions[0].params.methodName==="act_proposal"&&tx.actions[0].params.args.id===0)'),true,'no duplicate proposal is created');
    await click('Refresh status — no signing');await waitFor('document.querySelector("main").textContent.includes("Security hardening verified")');
    assert.equal(await evaluate('window.securitySignatures'),2,'refresh performs no additional signing');
    await evaluate('sessionStorage.setItem("synthetic-account","unrelated.testnet")');await call('Page.reload');
    await waitFor('document.querySelector("main [role=alert]")?.textContent.includes("unavailable to your signed-in account")');
    assert.equal(await evaluate('document.querySelector("main").textContent.includes("Synthetic secured project")'),false);
    console.log('Authorized UI screenshot (synthetic record): '+evidence+'/authorized-deployment-ready.png');
    console.log('Setup screenshots: '+evidence+'/setup-desktop.png and '+evidence+'/setup-mobile.png');
    assert.deepEqual(blocked,[]);
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
