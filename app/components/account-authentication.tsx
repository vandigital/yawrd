'use client';
import { useEffect, useRef, useState } from 'react';
import { useTestnetWallet } from '../use-testnet-wallet';
import type { IdentityChallenge } from '../../src/identity/types';
import { TestnetConsent } from './testnet-consent';
import { ACCOUNT_SESSION_CHANGED } from './route-account-controls';
import styles from './global-navigation.module.css';
async function auth(action:string,data?:object){
  const r=await fetch('/api/auth/'+action,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',
    ...(data?{headers:{'content-type':'application/json'},body:JSON.stringify(data)}:{})});
  const v=await r.json();if(!r.ok)throw Error(v.error==='too_many_challenges'?'Too many sign-in attempts. Wait a minute and try again.':'Sign-in could not be verified. Try again; access has not been granted.');return v;
}
export default function AccountAuthentication(){
  const wallet=useTestnetWallet();
  const [account,setAccount]=useState<string|null>(null),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false);
  const [challenge,setChallenge]=useState<IdentityChallenge|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('');
  const lock=useRef(false),epoch=useRef(0);
  async function read(){const version=++epoch.current;try{const v=await auth('session');if(version===epoch.current)setAccount(v.accountId);return v.accountId as string|null;}
    catch(e){if(version===epoch.current){setAccount(null);setError(e instanceof Error?e.message:'Sign-in unavailable.');}throw e;}
    finally{if(version===epoch.current)setChecking(false);}}
  useEffect(()=>{const refresh=()=>{if(!lock.current)void read().catch(()=>{});};refresh();window.addEventListener('focus',refresh);window.addEventListener(ACCOUNT_SESSION_CHANGED,refresh);const menu=document.getElementById('global-account');menu?.addEventListener('toggle',refresh);
    return()=>{epoch.current++;menu?.removeEventListener('toggle',refresh);window.removeEventListener('focus',refresh);window.removeEventListener(ACCOUNT_SESSION_CHANGED,refresh);};},[]);
  useEffect(()=>{setChallenge(null);setMessage('');},[wallet.accountId,wallet.termsAccepted]);
  async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
    try{await work();}catch(e){setError(e instanceof Error?e.message:'Sign-in did not complete.');}finally{lock.current=false;setBusy(false);}}
  async function prepare(){
    setChallenge(null);const c=wallet.getContext();if(!wallet.termsAccepted||!c.accountId||c.network!=='testnet')throw Error('Accept the Testnet terms and select your Meteor Testnet account.');
    const v=await auth('challenge',c);if(wallet.getContext().accountId!==c.accountId||wallet.getContext().network!=='testnet')throw Error('Wallet account changed. Start sign-in again.');setChallenge(v.challenge);
  }
  async function sign(){
    const c=challenge;setChallenge(null);
    if(!wallet.termsAccepted||!c||Date.now()>=c.expiresAt||location.origin!==c.origin||wallet.getContext().accountId!==c.accountId||wallet.getContext().network!=='testnet')throw Error('The sign-in review expired or your account changed. Start again.');
    const proof=await wallet.signIdentity({message:c.message,recipient:c.recipient,nonce:Uint8Array.from(atob(c.nonce),v=>v.charCodeAt(0)),signerId:c.accountId,network:'testnet'});
    if(proof.accountId!==c.accountId||wallet.getContext().accountId!==c.accountId||wallet.getContext().network!=='testnet')throw Error('Wallet account changed. Start sign-in again.');
    await auth('verify',{challengeId:c.id,accountId:c.accountId,network:'testnet',proof:{accountId:proof.accountId,publicKey:proof.publicKey,signature:proof.signature}});
    if(await read()!==c.accountId)throw Error('Your verified session could not be loaded. Check sign-in again.');
    wallet.acceptTerms(false);window.dispatchEvent(new Event(ACCOUNT_SESSION_CHANGED));setMessage('Signed in. You can continue on this page.');
  }
  async function logout(disconnect=false){await auth('logout',{});epoch.current++;setAccount(null);setChallenge(null);wallet.acceptTerms(false);
    if(disconnect)wallet.disconnect();window.dispatchEvent(new Event(ACCOUNT_SESSION_CHANGED));setMessage(disconnect?'Signed out. Wallet disconnection requested.':'Signed out.');}
  return <section className={styles.fallback} aria-label="Account sign-in">
    <p>{wallet.accountId?'Connected wallet · Meteor':'Wallet connection'}</p>
    {checking?<p>Checking sign-in…</p>:<p>{account?'Signed in as '+account:'Not signed in · sign in or renew here'}</p>}
    {wallet.accountId&&<p className={styles.identity}>Connected: {wallet.accountId}</p>}
    {account&&wallet.accountId&&account!==wallet.accountId&&<p>Sign in with the selected wallet account to switch accounts.</p>}
    {wallet.accountIds.length>1&&<label>Testnet account<select value={wallet.accountId??''} disabled={busy||wallet.busy} onChange={e=>wallet.selectAccount(e.target.value)}>{wallet.accountIds.map(id=><option key={id}>{id}</option>)}</select></label>}
    <p>Sign-in uses one wallet message approval. It costs no gas and cannot send money. You stay on this page.</p>
    <TestnetConsent disabled={busy||wallet.busy}/>
    {!wallet.accountId?<button disabled={!wallet.termsAccepted||!wallet.ready||!wallet.available||wallet.busy||busy} onClick={wallet.connect}>Connect wallet</button>:
      <button disabled={!wallet.termsAccepted||busy||wallet.busy||!!challenge} onClick={()=>void run(prepare)}>{account===wallet.accountId?'Renew sign-in':'Sign in'}</button>}
    {challenge&&<div><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{challenge.message}</pre>
      <p>Approve this sign-in message in Meteor. No transaction will be requested.</p>
      <button disabled={busy||wallet.busy||!wallet.termsAccepted} onClick={()=>void run(sign)}>Approve sign-in message</button>
      <button disabled={busy} onClick={()=>setChallenge(null)}>Cancel sign-in</button></div>}
    {account&&<button disabled={busy||wallet.busy} onClick={()=>void run(()=>logout())}>Sign out</button>}
    {wallet.accountId&&<button disabled={wallet.busy} onClick={wallet.disconnect}>Disconnect wallet</button>}
    {wallet.accountId&&<button disabled={busy||wallet.busy} onClick={()=>void run(()=>logout(true))}>Disconnect wallet and sign out</button>}
    {error&&<p role="alert">{error}</p>}{wallet.error&&<p role="alert">{wallet.error}</p>}{message&&<p role="status">{message}</p>}
  </section>;
}
