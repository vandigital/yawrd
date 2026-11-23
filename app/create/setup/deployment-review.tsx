"use client";

import { useEffect, useRef, useState } from 'react';
import type { PrivateCreation } from '../../../src/creation/repository';
import type { DeploymentIntent, DeploymentView } from '../../../src/creation/deployment-types';
import { authorizedCreationDeployment, testnetFactorySettings } from '../../../src/testnet-factory-settings';
import { PLATFORM_FEE } from '../../../src/platform-fee/policy';
import { useTestnetWallet } from '../../use-testnet-wallet';
import { submitDeployment } from './deployment-submit';
import styles from './setup.module.css';
import { reserveMeteorAuthorizationWindow, type WalletLaunchEvent } from '../../meteor-wallet-launch';

function near(yocto: string) {
  const value=yocto.padStart(25,'0'),fraction=value.slice(-24).replace(/0+$/,'');
  return value.slice(0,-24)+(fraction?'.'+fraction:'');
}
const messages: Record<string,string> = {
  deployment_storage_unavailable:'Deployment storage is not installed or its reviewed permissions are not active. Your private project draft is safe; no wallet request is available.',
  dao_account_collision:'The reserved address is already in use. Its identity has been kept for review. Do not submit another wallet request.',
  creation_revision_conflict:'Your saved project draft changed. Reload it before preparing deployment again.',
  deployment_revision_conflict:'Deployment changed in another tab or session. Reload its saved state before continuing.',
  deployment_unresolved:'A wallet request is unresolved. Recover its transaction reference and check the evidence before trying again.',
  deployment_identity_frozen:'A wallet request already used these saved details. Its request is frozen. Reconcile that request before changing deployment details.',
  deployment_request_mismatch:'These project details differ from the frozen deployment request. Review the saved request before continuing.',
  deployment_review_expired:'The deployment review expired. Prepare and review it again before wallet approval.',
  deployment_recovery_not_authorized:'Retiring this interrupted attempt needs separate operator authorization. Its identity and recorded attempt remain unchanged.',
  deployment_not_authorized:'Real Testnet deployment is not authorized. No wallet request was sent.',
  creation_session_changed:'Your signed-in account changed. Return to creation to check your sign-in.',
  sign_in_required:'Sign in again before checking this private draft.',
  invalid_creation_configuration:'Save a public name, public description and a different named Testnet Second Steward before preparing deployment.',
};
export default function DeploymentReview({creation,disabled,onIdentifier,onRecorded}: {
  creation:PrivateCreation;disabled:boolean;onIdentifier:(identifier:string)=>void;onRecorded:(recorded:boolean)=>void;
}) {
  const wallet=useTestnetWallet();
  const [view,setView]=useState<DeploymentView|null>(null);
  const [hash,setHash]=useState('');
  const [acknowledged,setAcknowledged]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);
  const [launchEvents,setLaunchEvents]=useState<{stage:string;activation:boolean|null}[]>([]);
  const launch=useRef<ReturnType<typeof reserveMeteorAuthorizationWindow>>(null);
  const generation=useRef(0),lock=useRef(false);
  const intent=view?.intent;
  const unresolved=!!intent&&['wallet-requested','unknown'].includes(intent.state);
  const completed=intent?.state==='deployed-hardening-required';
  const retiredAttempt=intent?.state==='prepared' ? intent.costs?.retiredAttempts?.find(retired=>
    retired.attempt===intent.attempt&&retired.requestDigest===intent.requestDigest) : undefined;
  const p=intent?.prepared;
  const allowed=authorizedCreationDeployment;
  const submissionEnabled=!!view?.submissionEnabled&&creation.id===allowed.creationId&&
    creation.founderAccountId===allowed.founderAccountId&&creation.network===allowed.network&&
    intent?.daoAccountId===allowed.daoAccountId&&intent.requestDigest===allowed.requestDigest&&intent.attempt===allowed.nextAttempt-1&&!!retiredAttempt&&intent.state==='prepared';
  async function request(data?:object):Promise<DeploymentView> {
    const response=await fetch('/api/creations/'+creation.id+'/deployment',{
      method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',
      headers:{'x-yawrd-account':creation.founderAccountId,...(data?{'content-type':'application/json'}:{})},
      ...(data?{body:JSON.stringify(data)}:{}),
    });
    const result=await response.json();
    if(!response.ok)throw new Error(messages[result.error]??'Deployment could not be checked. Keep any wallet transaction reference and reload its saved state. Do not repeat a wallet request.');
    return result;
  }
  function apply(next:DeploymentView) {setView(next);onIdentifier(next.intent?.identifier??'');onRecorded(next.deploymentRecorded && next.intent?.state==='deployed-hardening-required');if(next.intent?.transactionHash)setHash(next.intent.transactionHash);}
  useEffect(()=>{
    const current=++generation.current;setLoaded(false);setAcknowledged(false);setError('');setView(null);onIdentifier('');onRecorded(false);
    request().then(next=>{if(current===generation.current)apply(next);})
      .catch(e=>{if(current===generation.current)setError(e instanceof Error?e.message:'Deployment state could not be loaded.');})
      .finally(()=>{if(current===generation.current)setLoaded(true);});
    return()=>{generation.current++;launch.current?.release();launch.current=null;};
  },[creation.id,creation.revision,creation.founderAccountId,onIdentifier,onRecorded]);
  async function run(work:()=>Promise<DeploymentView>) {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setAcknowledged(false);
    const current=generation.current;
    try{const next=await work();if(current===generation.current)apply(next);}
    catch(e){if(current===generation.current){setError(e instanceof Error?e.message:'The request did not complete.');try{const next=await request();if(current===generation.current)apply(next);}catch{/* Keep the last saved state and the error. */}}}
    finally{lock.current=false;setBusy(false);}
  }
  function submit() {
    if(lock.current||!submissionEnabled||!acknowledged||disabled||!intent||intent.state!=='prepared')return;
    setLaunchEvents([]);
    // Reserve synchronously in the founder click, before RPC or wallet lookups.
    const reservation=reserveMeteorAuthorizationWindow((event:WalletLaunchEvent)=>setLaunchEvents(events=>[...events,event]));
    if(!reservation){setError('Meteor authorization was blocked. Allow popups for this Development app. No attempt was claimed and no wallet transaction was requested.');return;}
    launch.current=reservation;
    const current=generation.current;
    void run(()=>submitDeployment({creationRevision:creation.revision,founder:creation.founderAccountId,reviewed:intent,request,
      getWallet:wallet.getContext,prepareSign:wallet.prepareCreation,
      onStage:stage=>setLaunchEvents(events=>[...events,{stage,activation:navigator.userActivation?.isActive??null}]),
      sign:transaction=>{
        if(current!==generation.current)throw new Error('The deployment page changed. Reload and reconcile the saved attempt before continuing.');
        reservation.connectorCall();
        return wallet.signCreation(transaction).then(outcome=>{
          setLaunchEvents(events=>[...events,{stage:'wallet-request-resolved',activation:navigator.userActivation?.isActive??null}]);return outcome;
        },error=>{setLaunchEvents(events=>[...events,{stage:'wallet-request-rejected',activation:navigator.userActivation?.isActive??null}]);throw error;});
      }})).finally(()=>{reservation.release();if(launch.current===reservation)launch.current=null;});
  }
  return <div aria-label="Deployment preparation">
    <h3>Account setup and costs</h3>
    <p>Preparing deployment saves one generated account identifier and the exact public request to your private Creation draft. It does not open your wallet or send money.</p>
    <dl><dt>Setup service</dt><dd>{testnetFactorySettings.factoryAccountId}</dd>
      <dt>Setup and storage deposit</dt><dd>{near(testnetFactorySettings.setupDepositYocto)} Testnet NEAR, sent to the new project account through the factory.</dd>
      <dt>Network gas limit</dt><dd>{Number(testnetFactorySettings.createGas)/1e12} Tgas. Network fees are separate from the deposit.</dd>
      <dt>Cost reference</dt><dd>{testnetFactorySettings.costConfirmation}</dd>
      <dt>Later platform fee</dt><dd>{near(PLATFORM_FEE.amountYocto)} Testnet NEAR to {PLATFORM_FEE.recipient}. Payment remains separately gated and unavailable here.</dd></dl>
    {!loaded&&<p role="status">Loading saved deployment state…</p>}
    {disabled&&<p>Save your changes before preparing deployment.</p>}
    <div className={styles.unavailable}>
      <button disabled={disabled||busy||!loaded||unresolved||completed} onClick={()=>void run(()=>request({action:'prepare',expectedRevision:creation.revision}))}>{busy?'Working…':'Prepare saved deployment — no wallet request'}</button>
      <button disabled={busy} onClick={()=>void run(()=>request())}>Reload deployment state</button>
    </div>
    {intent&&<p role="status">{retiredAttempt?'Recovery complete: interrupted attempt '+retiredAttempt.attempt+' was retired. Its history is preserved. '+(submissionEnabled?'Attempt '+allowed.nextAttempt+' is authorized. Refresh the saved deployment review and confirm the costs before opening Meteor.':'Another wallet attempt requires separate founder authorization.'):completed?'Deployment verified and saved. Open the security review to check hardening.':unresolved?'A wallet request is unresolved. Signing is locked; check its transaction evidence.':intent.state==='failed'?'The attempt failed on Testnet. Another wallet attempt requires separate founder authorization.':intent.state==='reserved'?'Your account identifier is reserved in this Creation. Finish the deployment review before any wallet request.':'Your exact deployment request is saved. Review it before wallet approval.'}</p>}
    {intent&&<p className={styles.help}>Saved account identifier: {intent.identifier}. Attempt {intent.attempt}. This identity is shared across your sessions; it is independent of your project’s display name.</p>}
    {p&&<div className={styles.review}>
      <h3>Saved deployment request</h3><dl><dt>Account address</dt><dd>{intent.daoAccountId}</dd><dt>Project display name</dt><dd>{p.plan.initializer.config.name}</dd>
        <dt>Public project description</dt><dd className={styles.words}>{p.plan.initializer.config.purpose}</dd>
        <dt>Stewards</dt><dd>{p.plan.initializer.policy.roles[0].kind.Group.join(' · ')} · both must approve</dd>
        <dt>Source project revision</dt><dd>{intent.sourceRevision}</dd>
        {intent.costs&&<><dt>Gas component at the observed block price</dt><dd>{near(intent.costs.attachedGasAtObservedPriceYocto)} Testnet NEAR for the attached gas limit. This is not the full fee or a maximum. The wallet must show its final fees.</dd>
          <dt>Finalized price block</dt><dd>{intent.costs.blockHeight}</dd></>}</dl>
      <p>The public name, description and Steward accounts would become public in a real creation transaction. Private project answers are excluded.</p>
      <label className={styles.confirm}><input type="checkbox" checked={acknowledged} disabled={busy||unresolved||completed} onChange={e=>setAcknowledged(e.target.checked)}/>I reviewed this exact public request, both Stewards and the separate costs. Creating the account requires my approval in Meteor Wallet.</label>
      <details><summary>Review the exact unsigned wallet request</summary><pre className={styles.words}>{JSON.stringify(p.transaction,null,2)}</pre></details>
    </div>}
    {loaded&&!submissionEnabled&&!unresolved&&!completed&&!retiredAttempt&&<p className={styles.attention}>Wallet submission is unavailable for this saved state. Only the specifically authorized Development Creation and exact request can be submitted once. Prepare the saved request and review the costs before continuing.</p>}
    {submissionEnabled&&<p className={styles.attention}>Testnet deployment attempt {allowed.nextAttempt} is authorized for this saved request. The server will check it again and save the attempt before Meteor opens. You must personally approve the deposit and network fees in Meteor Wallet.</p>}
    <div className={styles.unavailable}><button disabled={!submissionEnabled||!acknowledged||disabled||busy||unresolved||completed} onClick={()=>void submit()}>{submissionEnabled?'Open a Yawrd · approve in wallet':'Open a Yawrd · approve in wallet — unavailable'}</button><button disabled>Pay platform fee — unavailable</button></div>
    {unresolved&&<details open><summary>Recover an interrupted wallet request</summary>
      <p>Keep the same account identifier. Find the transaction reference in your wallet and check its evidence. A rejection or missing response alone cannot unlock another signing request.</p>
      {!intent.transactionHash&&<p>If no transaction reference exists, close the unfinished Meteor request and check its Testnet activity. Recovery requires separated finalized checks and a separately authorized retirement of this attempt. It is not performed automatically.</p>}
      <label htmlFor="deployment-hash">Creation transaction reference</label><input id="deployment-hash" value={hash} onChange={e=>setHash(e.target.value)} autoCapitalize="none" spellCheck={false}/>
      <button disabled={busy||!hash} onClick={()=>void run(()=>request({action:'reconcile',intentRevision:intent.revision,attempt:intent.attempt,transactionHash:hash}))}>Check transaction evidence — no wallet request</button>
    </details>}
    {intent?.transactionHash&&<p>Transaction: <a href={'https://testnet.nearblocks.io/txns/'+encodeURIComponent(intent.transactionHash)} target="_blank" rel="noreferrer">{intent.transactionHash}</a> · {completed?'Finalized deployment verified':intent.state==='failed'?'Finalized failure verified':'Awaiting finalized server verification'}</p>}
    {completed&&<p><a className={styles.primary} href={'/create/'+creation.id+'/secure'}>Secure your Yawrd →</a></p>}
    {completed&&<p>Verified project account: <strong>{intent.daoAccountId}</strong>. Deployment evidence is recorded. Review automatic-update hardening on the security page. Project Funds, publication and platform payment remain unavailable here and require separate approval.</p>}
    {launchEvents.length>0&&<details open><summary>Meteor authorization progress</summary>
      <ol>{launchEvents.map((event,index)=><li key={index}>{event.stage} · browser activation {event.activation===null?'unknown':event.activation?'active':'inactive'}</li>)}</ol>
      {!completed&&!launchEvents.some(event=>['wallet-request-resolved','wallet-request-rejected'].includes(event.stage))&&launchEvents.some(event=>event.stage==='meteor-navigation-not-requested')&&<p>Meteor has not requested the transaction approval window after 30 seconds. If Continue in Meteor Web is shown, select it once. Do not start another request.</p>}
      {!completed&&!launchEvents.some(event=>['wallet-request-resolved','wallet-request-rejected'].includes(event.stage))&&launchEvents.some(event=>event.stage==='meteor-response-pending')&&<p>Meteor opened its authorization route, but has not returned a result. Check that window; do not start another request.</p>}
    </details>}
    {error&&<p role="alert" className={styles.attention}>{error}</p>}
  </div>;
}
