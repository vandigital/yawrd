'use client';
import { useEffect, useRef, useState } from 'react';
import { ACCOUNT_SESSION_CHANGED, openAccountDisclosure } from '../../../components/route-account-controls';
import { useTestnetWallet } from '../../../use-testnet-wallet';
import { reserveMeteorAuthorizationWindow } from '../../../meteor-wallet-launch';
import { submitCreationFee } from './payment-submit';
import type { CreationFeeReview } from '../../../../src/creation/platform-fee';
import { validHash } from '../../../../src/platform-fee/policy';
import styles from '../../setup/setup.module.css';
import ui from '../secure/hardening.module.css';
const near = (amount: string) => { const s=amount.padStart(25,'0'); return s.slice(0,-24)+'.'+(s.slice(-24).replace(/0+$/,'')||'0'); };
const errors: Record<string, string> = {
  sign_in_required: 'Your sign-in expired or is unavailable. Sign in again with the founder account, then refresh this page.',
  creation_not_found: 'This deployed Yawrd is unavailable to your signed-in account.',
  founder_payment_required: 'Only the founder can review platform payment. As a Steward, use the security page below.',
  creation_session_changed: 'Your signed-in account changed. Refresh and review with the founder account.',
  creation_revision_conflict: 'The saved Creation or session changed. Refresh and review again.',
  deployment_revision_conflict: 'The saved deployment changed. Refresh and review again.',
  fee_revision_conflict: 'Payment status changed in another request. Refresh its saved status; do not pay again.',
  fee_transaction_already_claimed: 'This finalized transfer is already associated with another Creation. Keep the saved hash for review; do not pay again.',
  fee_unresolved: 'This payment already has a wallet request or verified result. Refresh its status; do not pay again.',
  fee_identity_frozen: 'The saved payment details differ. Signing is blocked; keep any transaction hash for review.',
  fee_not_authorized: 'Payment signing has not been enabled in Development.',
  fee_storage_required: 'Saved payment support is not installed yet. No wallet request was sent.',
  governance_policy_changed: 'The saved Project Rules or public details no longer match the deployed account. Payment is blocked.',
  fee_security_required: 'Verify both Steward approvals and the automatic-update setting before payment.',
  insufficient_fee_balance: 'The founder needs 0.5 Testnet NEAR plus separate network fees and the account storage reserve.',
  signer_permission_unavailable: 'Select the founder in Meteor and renew its Yawrd sign-in. Payment needs individual wallet approval.',
  profiled_runtime_changed: 'Network fee settings changed from the reviewed version. Payment is blocked for review.',
};
export default function PaymentPanel({ creationId, preparationAvailable=false }: { creationId: string; preparationAvailable?:boolean }) {
  const wallet=useTestnetWallet();
  const [view,setView]=useState<CreationFeeReview|null>(null),[permit,setPermit]=useState<CreationFeeReview|null>(null);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[agree,setAgree]=useState(false),[hash,setHash]=useState('');
  const [progress,setProgress]=useState(''),[now,setNow]=useState(Date.now);
  const locked=useRef(false),generation=useRef(0),current=useRef<CreationFeeReview|null>(null),walletPending=useRef(false);
  const launch=useRef<ReturnType<typeof reserveMeteorAuthorizationWindow>>(null);
  function apply(next:CreationFeeReview){current.current=next;setView(next);setNow(Date.now());}
  async function request(data?:object):Promise<CreationFeeReview>{
    const session=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
    if(!session.ok)throw Error('Your sign-in could not be checked. Refresh before continuing.');
    const {accountId}=await session.json();
    if(!accountId){applyEmpty();throw Error(errors.sign_in_required);}
    if(current.current&&current.current.accountId!==accountId){applyEmpty();if(data)throw Error(errors.creation_session_changed);}
    const result=await fetch('/api/creations/'+creationId+'/platform-fee',{
      method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'x-yawrd-account':accountId,...(data?{'content-type':'application/json'}:{})},
      ...(data?{body:JSON.stringify(data)}:{}),
    });
    const value=await result.json();
    if(!result.ok){if([401,403,404].includes(result.status))applyEmpty();throw Error(errors[value.error]??'Payment status could not be verified. Refresh the saved record; do not repeat payment.');}
    return value;
  }
  function applyEmpty(){current.current=null;setView(null);setPermit(null);setAgree(false);generation.current++;}
  async function run(work:()=>Promise<void>){
    if(locked.current)return;locked.current=true;setBusy(true);setError('');setPermit(null);setAgree(false);
    try{await work();}catch(e){setError(e instanceof Error?e.message:'Payment status could not be checked.');
      try{apply(await request());}catch{/* Preserve error. Any durable claim stays locked. */}}
    finally{locked.current=false;setBusy(false);setProgress('');}
  }
  async function refresh(){await run(async()=>{apply(await request());});}
  useEffect(()=>{
    let active=true;setBusy(true);
    request().then(next=>{if(active)apply(next);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Payment review unavailable.');})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;generation.current++;launch.current?.release();};
  },[creationId]);
  useEffect(()=>{setPermit(null);setAgree(false);generation.current++;},[wallet.accountId]);
  useEffect(()=>{const changed=()=>{applyEmpty();if(!locked.current)void refresh();};window.addEventListener(ACCOUNT_SESSION_CHANGED,changed);return()=>window.removeEventListener(ACCOUNT_SESSION_CHANGED,changed);},[creationId]);
  useEffect(()=>{const invalidate=()=>{if(!walletPending.current){setPermit(null);setAgree(false);}};
    window.addEventListener('focus',invalidate);return()=>window.removeEventListener('focus',invalidate);},[]);
  useEffect(()=>{if(!permit?.review)return;const timer=setTimeout(()=>{setNow(Date.now());setAgree(false);},Math.max(0,permit.review.expiresAt-Date.now())+1);return()=>clearTimeout(timer);},[permit]);
  async function prepare(){await run(async()=>{
    if(!view?.walletEnabled)throw Error('Refresh the payment status before preparing a review.');
    setProgress('Checking and saving this payment intent…');
    const next=await request({action:'prepare',expectedCreationRevision:view.binding.creationRevision,expectedDeploymentRevision:view.binding.intentRevision});apply(next);
    if(!next.review||!next.fee||next.fee.state!=='prepared')throw Error('No fresh payment review is available.');
    setProgress('Checking the selected founder in Meteor — no transfer…');
    await wallet.prepareCreation(next.review.transaction);
    if(wallet.getContext().accountId!==next.accountId||wallet.getContext().network!=='testnet')throw Error(errors.creation_session_changed);
    setPermit(next);setNow(Date.now());
  });}
  function sign(){
    if(locked.current||!permit?.review||!agree||permit.review.expiresAt<=Date.now()||!view?.walletEnabled)return;
    const reserved=reserveMeteorAuthorizationWindow(event=>{
      if(event.stage==='meteor-window-opened')setProgress('Review the payment and network fees in Meteor. Approve only if you intend to pay.');
      if(event.stage==='meteor-navigation-not-requested'||event.stage==='meteor-response-pending')setProgress('Meteor has not returned a result. Check its window; do not submit another payment.');
    });
    if(!reserved){setPermit(null);setAgree(false);setError('Meteor popup was blocked. Allow popups and prepare the review again. No payment was claimed.');return;}
    launch.current=reserved;walletPending.current=true;const reviewed=permit,epoch=generation.current;
    void run(async()=>{
      setProgress('Saving the payment attempt before wallet authorization…');
      apply(await submitCreationFee({reviewed,getWallet:wallet.getContext,
        request:async data=>{const next=await request(data);apply(next);return next;},
        sign:transaction=>{
          if(epoch!==generation.current)throw Error('The page or account changed. Reconcile the saved payment; do not pay again.');
          reserved.connectorCall();return wallet.signCreation(transaction);
        }}));
    }).finally(()=>{reserved.release();launch.current=null;walletPending.current=false;});
  }
  const fee=view?.fee,paid=fee?.state==='paid',unresolved=fee?.state==='wallet-requested'||fee?.state==='unknown';
  const ready=!!permit?.review&&permit.review.expiresAt>now;
  const status=paid?'Verified paid':fee?.state==='wallet-requested'||view?.verification?.state==='pending'?'Payment pending':unresolved?'Payment unresolved':view?.walletEnabled?'Ready for review':'Payment unavailable';
  const nextTitle=paid?'Payment verified · project preparation is next':unresolved?'Check the existing payment · do not pay again':
    !view?'Check your payment review':!view.securityVerified?'Finish the security check first':view.walletEnabled?'Review and approve this payment':'Review the fee · payment is not enabled yet';
  return <section className={ui.panel} aria-label="Creation platform fee">
    <header className={`${styles.heading} ${ui.pageHeader}`}><div><p className={styles.eyebrow}>Platform fee · Testnet</p><h1>Review your Yawrd platform fee</h1></div></header>
    <p className={ui.intro}>A separate 0.5 Testnet NEAR payment to Yawrd covers project preparation services; it does not add money to your Project Funds.</p>
    {error&&<p role="alert" className={styles.attention}>{error}</p>}
    {busy&&<p role="status">{progress||'Checking saved payment status…'}</p>}
    {view&&<section className={ui.summaryCard} aria-label="Payment summary">
      <div className={ui.summaryTop}><h2>{view.binding.name}</h2><span className={ui.statusBadge}>{status}</span></div>
      <p className={ui.dao}>{view.binding.daoAccountId}</p>
      <dl><dt>Platform fee</dt><dd><strong>0.5 Testnet NEAR</strong></dd><dt>Recipient</dt><dd>{view.recipient}</dd>
        <dt>Paid by</dt><dd>{view.accountId}</dd><dt>Purpose</dt><dd>AI inference and project preparation, including future Blueprint and Skill services.</dd>
        <dt>Security</dt><dd>{view.securityVerified?'Automatic updates off · both Steward approvals verified':unresolved||paid?'Security review saved with the payment; current status can be checked separately':'Security hardening needs verification'}</dd>
        <dt>Additional network fees</dt><dd>{permit?.review?<>Estimated native transfer fee at review: {near(permit.review.feeEstimateYocto)} NEAR. Balance checked with {near(permit.review.feeReserveYocto)} NEAR of fee headroom. </>:null}Meteor must show its current fees before you approve.</dd></dl>
      <p>The 1 NEAR account setup deposit was a separate cost. Future project funding is separate from this fee.</p>
    </section>}
    <section className={ui.nextCard} aria-label="Next action">
      <p className={styles.eyebrow}>Next action</p><h2>{nextTitle}</h2>
      {paid?<><p>The exact payment was verified from finalized on-chain receipts and saved to this Creation. No further platform payment is requested.</p>
        {preparationAvailable?<p><a href={'/create/'+creationId+'/blueprint'}>Continue to AI preparation →</a></p>:<p>Blueprint and Skill preparation are the next milestone and remain unavailable.</p>}</>:
      unresolved?<div className={ui.recovery}>
        <p>The saved wallet attempt is locked across sessions. A rejection, closed window or missing response does not prove that no payment was sent.</p>
        <label htmlFor="platform-fee-hash">Transaction hash from Meteor</label><input id="platform-fee-hash" value={hash} placeholder={fee?.transactionHash??'Exact transaction hash'} onChange={e=>setHash(e.target.value)} spellCheck={false}/>
        <button disabled={busy||!validHash(hash.trim()||fee?.transactionHash)} onClick={()=>void run(async()=>{
          if(!fee)return;apply(await request({action:'reconcile',feeRevision:fee.revision,transactionHash:hash.trim()||fee.transactionHash}));
        })}>Verify existing payment — no signing</button>
        {!fee?.transactionHash&&<p>No hash is saved yet. Check the founder’s wallet activity. This page cannot unlock or repeat the payment.</p>}
        {view?.verification&&<p role="status">Payment is not verified yet. {view.verification.state==='pending'?'Final receipts are still pending.':'Keep the existing hash for reconciliation; no new payment is offered.'}</p>}
      </div>:view?.securityVerified?<>
        {!view.storageInstalled?<p>Payment is waiting for saved payment-history support. No wallet request can open yet.</p>:
          !view.walletEnabled?<p>Saved payment support is installed. Wallet payment is awaiting separate Development activation.</p>:
          <p>Prepare a fresh review of the saved payment, then personally approve it in Meteor. One saved wallet attempt is allowed.</p>}
        {view.walletEnabled&&<button disabled={busy||wallet.busy} onClick={()=>void prepare()}>Prepare payment review — no transfer</button>}
        {permit?.review&&!ready&&<p>The review expired. Prepare a fresh review before payment.</p>}
        <label className={styles.confirm}><input id="platform-fee-consent" type="checkbox" checked={agree} disabled={busy||(view.walletEnabled&&!ready)} onChange={e=>setAgree(e.target.checked)}/>
          I reviewed the 0.5 Testnet NEAR fee to {view.recipient}, paid by {view.accountId}, and the separate network fees. I will personally approve this payment in Meteor.</label>
        <button className={styles.primary} disabled={!view.walletEnabled||!ready||!agree||busy||wallet.busy||wallet.accountId!==view.accountId} onClick={sign}>
          {view.walletEnabled?'Pay platform fee in Meteor':'Pay platform fee in Meteor — unavailable'}</button>
        {agree&&!view.walletEnabled&&<p role="status" className={ui.feedback}>Review acknowledged for this page only. No wallet request or transaction was created.</p>}
      </>:view?<p>Both Stewards must approve turning off automatic updates. Verify the finalized setting before payment.</p>:
        <p>Sign in with the founder account to review this saved Yawrd. A second Steward can use its security page.</p>}
      <p><a href={'/create/'+creationId+'/secure'}>Open security status →</a></p>
      <div className={ui.statusTools}><span>{view?'Security review block '+view.blockHeight:'Read-only check'}</span>
        <button disabled={busy} onClick={()=>void refresh()}>Refresh review — no signing</button></div>
      {!view&&<p><button onClick={openAccountDisclosure}>Sign in or renew from Account</button></p>}
    </section>
    {view&&<details id="payment-technical" className={`${styles.section} ${ui.accordion}`}>
      <summary><h2>Technical details and transaction history</h2><span className={styles.chevron} aria-hidden="true">⌄</span></summary>
      <div className={styles.sectionBody}><dl><dt>Creation</dt><dd>{view.binding.creationId}</dd>
        <dt>Creation / deployment revision</dt><dd>{view.binding.creationRevision} / {view.binding.intentRevision}</dd>
        <dt>Network</dt><dd>NEAR Testnet</dd><dt>Exact yoctoNEAR</dt><dd>{view.amountYocto}</dd><dt>Policy</dt><dd>{view.policyVersion}</dd>
        <dt>Security review block</dt><dd>{view.blockHeight} · {view.blockHash}</dd><dt>Checked at</dt><dd>{view.checkedAt}</dd></dl>
        {view.transaction&&<details><summary>Exact unsigned native transfer</summary><pre className={styles.words}>{JSON.stringify(view.transaction,null,2)}</pre></details>}
        <h3>Payment history</h3>{fee?<>
          <p>Saved state: {fee.state} · fee revision {fee.revision} · attempt {fee.attempt}. The original intent and claim are preserved.</p>
          {fee.transactionHash&&<p><a href={'https://testnet.nearblocks.io/txns/'+encodeURIComponent(fee.transactionHash)}>Payment transaction · {paid?'finalized and verified':'not verified'}</a></p>}
          {fee.evidence&&<dl><dt>Verified receipt</dt><dd>{fee.evidence.receiptId}</dd><dt>Finalized transaction block</dt><dd>{fee.evidence.blockHeight}</dd><dt>Evidence digest</dt><dd>{fee.evidence.evidenceDigest}</dd></dl>}
        </>:<p>{view.storageInstalled?'No fee intent has been saved yet.':'Durable payment history is not installed.'} If you paid outside this flow, keep the exact hash and do not pay again.</p>}
        <p><a href={'https://testnet.nearblocks.io/txns/'+encodeURIComponent(view.binding.creationTransaction)}>Verified account creation transaction</a></p>
      </div>
    </details>}
    <footer className={ui.footer}><p>{preparationAvailable?'Project Funds, publication and task activation remain separate later steps.':'Project Funds, publication and Blueprint/Skill execution stay closed. Payment does not enable these separate milestones.'}</p></footer>
  </section>;
}
