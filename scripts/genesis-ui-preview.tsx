// Offline visual and interaction review. No database, real wallet, or Next route.
// node --import ./test/register-tsx.mjs scripts/genesis-ui-preview.tsx
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { PersistedYawrdPresentation } from '../app/components/persisted-yawrd';
import { GENESIS_YAW_001 as genesis } from '../src/genesis/yaw-001';
import type { ParticipantView, PersistedProject } from '../src/participants/types';

const output = resolve('docs/verification/genesis-ui');
await mkdir(output, { recursive: true });
const project: PersistedProject = { ...genesis, objectives: [...genesis.objectives] };
const application = { id: '00000000-0000-4000-8000-000000000001', accountId: 'applicant.example.testnet', introduction: 'UI test fixture: I would like to contribute documentation and help test the shared component.', status: 'pending' as const, reviewerAccountId: null };
const publicView: ParticipantView = { accountId: null, role: 'public', application: null, applications: [], restrictedContent: null };
const views: Record<string, ParticipantView> = {
  visitor: publicView,
  applicant: { ...publicView, accountId: application.accountId },
  creator: { ...publicView, accountId: genesis.creatorAccountId, role: 'creator', applications: [application] },
};
for (const status of ['pending', 'approved', 'rejected'] as const) views[status] = {
  ...publicView, accountId: application.accountId, role: status === 'approved' ? 'participant' : 'public',
  application: { ...application, status, reviewerAccountId: status === 'pending' ? null : genesis.creatorAccountId },
};
views['approved-content'] = { ...views.approved, restrictedContent: 'UI test fixture: Authorized participant information. This sample is not stored project content.' };
const css = (await postcss([tailwind({ base: process.cwd() })]).process(await readFile('app/globals.css', 'utf8'), { from: 'app/globals.css' })).css;
const createCss = await readFile('app/create/create.module.css', 'utf8');
await writeFile(join(output, 'preview.css'), (css + '\n' + createCss).replaceAll("'/landing/", "'./landing/"));
for (const asset of ['brand', 'landing']) {
  try { await symlink(resolve('public', asset), join(output, asset), 'dir'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
}
for (const [state, view] of Object.entries(views)) {
  const markup = renderToString(createElement('main', { className: 'page' }, createElement('div', { className: 'container' }, createElement(PersistedYawrdPresentation, { project, view }))));
  const fixture = JSON.stringify({ project, view, application, publicView }).replaceAll('<', '\\u003c');
  await writeFile(join(output, `${state}.html`), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Genesis UI review · ${state}</title><link rel="stylesheet" href="./preview.css"></head><body><p style="margin:0;padding:8px 16px;background:#a9f1e9;color:#002026;font:12px/1.5 system-ui">OFFLINE UI FIXTURE · ${state} · Sample roles and responses; no live database or wallet. <a href="./index.html" style="text-decoration:underline">All states</a></p><div id="preview-root">${markup}</div><script>window.__fixture=${fixture}</script><script src="./preview.js"></script></body></html>`);
}
await writeFile(join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Genesis UI review</title><body style="background:#001819;color:#e0ece9;font:16px/2 system-ui;padding:24px"><h1>Genesis UI review</h1><p>Offline fixtures for founder review. Wallet and API responses are mocked locally. Project copy uses the accepted Genesis descriptor; this is not a live persisted-data check.</p><ul>${Object.keys(views).map(state => `<li><a style="color:#a9f1e9" href="./${state}.html">${state}</a></li>`).join('')}</ul></body></html>`);
// The mock exists only in this ignored review bundle, never in the application.
await writeFile(join(output, 'wallet.jsx'), `import {useEffect,useState,useRef} from 'react';
export function useTestnetWallet(){
 const [accountId,setAccount]=useState(null),[ready,setReady]=useState(false);const ref=useRef(null);ref.current=accountId;
 const selected=window.__fixture.view.accountId||window.__fixture.application.accountId;
 useEffect(()=>{setReady(true);window.__setWallet=setAccount;},[]);
 return {accountId,accountIds:accountId?[selected,'alternate.example.testnet']:[],ready,available:ready,busy:false,error:null,
 connect:()=>setAccount(selected),disconnect:()=>setAccount(null),selectAccount:setAccount,getContext:()=>({accountId:ref.current,network:'testnet'}),
 signIdentity:async params=>{window.__signRequests.push(params);return {accountId:params.signerId,publicKey:'offline-fixture',signature:'offline-fixture'};}};
}`);
await writeFile(join(output, 'entry.jsx'), `import React from 'react';import {hydrateRoot} from 'react-dom/client';import {PersistedYawrdPresentation} from ${JSON.stringify(resolve('app/components/persisted-yawrd.tsx'))};
const f=window.__fixture;let view=f.view;window.__requests=[];window.__signRequests=[];
window.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;window.__requests.push({url,body});if(window.__failNext){window.__failNext=false;return {ok:false,json:async()=>({error:'service_unavailable'})};}let data;
 if(url==='/api/auth/challenge')data={challenge:{id:'offline-challenge',accountId:body.accountId,origin:location.origin,nonce:btoa(String.fromCharCode(...new Uint8Array(32))),message:'Offline NEP-413 UI fixture. No real signature requested.',recipient:'Yawrd',expiresAt:Date.now()+300000}};
 else if(url==='/api/auth/verify'){view={...f.publicView,accountId:body.accountId};data={verified:true};}
 else if(url==='/api/auth/logout'){view=f.publicView;data={};}
 else if(url.endsWith('/state'))data=view;
 else if(url.endsWith('/apply'))data=view={...view,application:{...f.application,introduction:body.introduction}};
 else if(url.endsWith('/review'))data=view={...view,applications:view.applications.map(a=>a.id===body.applicationId?{...a,status:body.decision,reviewerAccountId:view.accountId}:a)};
 else throw new Error('Unexpected offline request');return {ok:true,json:async()=>data};};
hydrateRoot(document.getElementById('preview-root'),React.createElement('main',{className:'page'},React.createElement('div',{className:'container'},React.createElement(PersistedYawrdPresentation,{project:f.project,view:f.view}))));
`);
const require = createRequire(import.meta.url);
await writeFile(join(output, 'tsx-loader.cjs'), `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;};`);
const webpackPackage = require('next/dist/compiled/webpack/webpack');
const webpack = webpackPackage.webpack;
await new Promise<void>((complete, reject) => {
  const compiler = webpack({ mode: 'development', devtool: false, context: process.cwd(), entry: join(output, 'entry.jsx'), output: { path: output, filename: 'preview.js' }, resolve: { extensions: ['.tsx', '.ts', '.jsx', '.js', '.json'] }, module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: join(output, 'tsx-loader.cjs') }] }, plugins: [new webpack.NormalModuleReplacementPlugin(/use-testnet-wallet(?:\.ts)?$/, join(output, 'wallet.jsx'))] });
  compiler.run((error: Error | null, stats: { hasErrors(): boolean; toString(): string }) => {
    compiler.close(() => { if (error || stats.hasErrors()) reject(error || new Error(stats.toString())); else complete(); });
  });
});
console.log(`Offline review prepared: ${join(output, 'index.html')}`);
