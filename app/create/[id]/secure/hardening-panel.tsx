'use client';
import { useEffect,useRef,useState } from 'react';
import { useTestnetWallet } from '../../../use-testnet-wallet';
import { reserveMeteorAuthorizationWindow } from '../../../meteor-wallet-launch';
import { canonical } from '../../../../src/creation-integration';
import { attemptKey,hashOK,hardeningTransaction,loadAttempts,saveAttempts,type HardeningAttempt,type HardeningView } from '../../../../src/creation/hardening';
import styles from '../../setup/setup.module.css';
import ui from './hardening.module.css';
function near(yocto:string){const s=yocto.padStart(25,'0');return s.slice(0,-24)+'.'+s.slice(-24).replace(/0+$/,'');}
const errors:Record<string,string>={
  sign_in_required:'Your one-hour sign-in expired or is unavailable. Sign in again through Account or Create with the same Steward, then refresh here.',
  creation_session_changed:'Your signed-in account changed. Refresh security status with the same Steward.',
  creation_not_found:'This deployed Yawrd is unavailable to your signed-in account. Only its two Stewards can open security controls.',
  creation_revision_conflict:'The saved Creation or session changed. Refresh security status and review again.',
  governance_policy_changed:'The current code, project details or Project Rules differ from the saved deployment. Signing is blocked for review.',
  profiled_runtime_changed:'The reviewed network runtime changed. Signing is blocked for review.',
  signer_permission_unavailable:'The verified sign-in key no longer has the required account permission. Sign in again with the same Steward.',
  insufficient_security_balance:'The signer needs network fees and the project needs its storage reserve. No wallet request was sent.',
};
export default function HardeningPanel({creationId}:{creationId:string}){
  const wallet=useTestnetWallet();
  const [view,setView]=useState<HardeningView|null>(null),[review,setReview]=useState<HardeningView['prepared']>(null);
  const [rows,setRows]=useState<HardeningAttempt[]>([]),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [progress,setProgress]=useState(''),[busy,setBusy]=useState(false),[agree,setAgree]=useState(false),[hash,setHash]=useState('');
  const [storageError,setStorageError]=useState(false),[now,setNow]=useState(Date.now),[reviewOpen,setReviewOpen]=useState(false);
  const nextHeading=useRef<HTMLHeadingElement>(null),reviewHeading=useRef<HTMLHeadingElement>(null),focusNext=useRef(false);
  const locked=useRef(false),generation=useRef(0),current=useRef<HardeningView|null>(null),walletPending=useRef(false);
  const pending=rows.find(r=>r.phase==='pending');
  async function request(data?:object):Promise<HardeningView>{
    const session=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store'});
    if(!session.ok)throw Error('Your sign-in could not be checked. Retry the read before continuing.');
    const account=(await session.json()).accountId;
    if(!account)throw Error(errors.sign_in_required);
    if(current.current&&current.current.accountId!==account){
      setView(null);current.current=null;setReview(null);setAgree(false);setRows([]);setMessage('');generation.current++;
      if(data)throw Error(errors.creation_session_changed);
    }
    const response=await fetch('/api/creations/'+creationId+'/hardening',{
      method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',
      headers:{'x-yawrd-account':account,...(data?{'content-type':'application/json'}:{})},
      ...(data?{body:JSON.stringify(data)}:{}),
    });
    const result=await response.json();
    if(!response.ok){if(response.status===401||response.status===403||response.status===404){setView(null);current.current=null;}
      throw Error(errors[result.error]??'Finalized security verification is unavailable. Any prior wallet request stays unresolved. Refresh its status; do not repeat signing.');}
    return result;
  }
  function apply(next:HardeningView){
    current.current=next;setView(next);setNow(Date.now());
    try{setRows(loadAttempts(localStorage,next.binding));setStorageError(false);}
    catch{setStorageError(true);throw Error('Saved security history could not be read. It is unchanged. Signing is blocked; keep any transaction hash for recovery.');}
  }
  function persist(next:HardeningAttempt[]){if(!current.current)throw Error('Refresh security status first');saveAttempts(localStorage,current.current.binding,next);setRows(next);}
  async function run(work:()=>Promise<void>){
    if(locked.current)return;locked.current=true;setBusy(true);setError('');setMessage('');setReview(null);setAgree(false);
    try{await work();}catch(e){setError(e instanceof Error?e.message:'The security action could not be checked.');}
    finally{locked.current=false;walletPending.current=false;setBusy(false);setProgress('');}
  }
  async function refresh(){await run(async()=>{setProgress('Reading finalized security state…');const next=await request();focusNext.current=true;apply(next);});}
  useEffect(()=>{
    let active=true;setBusy(true);setError('');
    request().then(next=>{if(active)apply(next);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Security state could not be read.');})
      .finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;generation.current++;};
  },[creationId]);
  useEffect(()=>{setReview(previous=>previous?.transaction.signerId===wallet.accountId?previous:null);setAgree(false);generation.current++;},[wallet.accountId]);
  useEffect(()=>{if(focusNext.current&&view){focusNext.current=false;nextHeading.current?.focus();nextHeading.current?.scrollIntoView({block:'nearest'});}},[view,rows]);
  useEffect(()=>{if(review){reviewHeading.current?.focus();reviewHeading.current?.scrollIntoView({block:'nearest'});}},[review]);
  useEffect(()=>{
    const invalidate=()=>{if(!locked.current){setReview(null);setAgree(false);setMessage('');}};
    const storage=(event:StorageEvent)=>{if(event.key===attemptKey(creationId)||event.key===null){invalidate();if(current.current)try{setRows(loadAttempts(localStorage,current.current.binding));}catch{setStorageError(true);}}};
    window.addEventListener('focus',invalidate);window.addEventListener('storage',storage);
    return()=>{window.removeEventListener('focus',invalidate);window.removeEventListener('storage',storage);};
  },[creationId]);
  useEffect(()=>{if(!review)return;const timer=setTimeout(()=>{setNow(Date.now());setAgree(false);},Math.max(0,review.expiresAt-Date.now())+1);return()=>clearTimeout(timer);},[review]);
  async function prepare(){await run(async()=>{
    if(!view||pending||storageError)throw Error('Reconcile saved wallet requests before another security action.');
    setProgress('Checking your selected Steward in Meteor…');
    // Start native account selection from this explicit click, before RPC. It
    // requests no transaction. The server still determines the action below.
    await wallet.prepareCreation(hardeningTransaction(view.binding,view.accountId,view.proposal?.id??null));
    setProgress('Checking current Project Rules, permissions and network fees…');
    const next=await request({action:'prepare',expectedCreationRevision:view.binding.creationRevision,expectedIntentRevision:view.binding.intentRevision});apply(next);
    if(!next.prepared){setMessage(next.reason||'No wallet action is needed.');return;}
    await wallet.prepareCreation(next.prepared.transaction);
    if(wallet.getContext().accountId!==next.accountId||wallet.getContext().network!=='testnet')throw Error('Choose the same signed-in Steward in Meteor Testnet, then review again.');setReviewOpen(true);setReview(next.prepared);setNow(Date.now());setMessage('');
  });}
  async function reconcile(attempt:HardeningAttempt,transactionHash:string){
    if(!view||!hashOK(transactionHash))throw Error('Enter the exact transaction hash from Meteor.');
    const history=loadAttempts(localStorage,view.binding),index=history.findIndex(r=>r.createdAt===attempt.createdAt&&canonical(r.transaction)===canonical(attempt.transaction));
    if(index<0)throw Error('Security history changed. Refresh before continuing.');
    history[index]={...history[index],hash:transactionHash};persist(history);
    const next=await request({action:'reconcile',expectedCreationRevision:view.binding.creationRevision,expectedIntentRevision:view.binding.intentRevision,attempt:history[index]});
    if(next.receipt?.hash!==transactionHash)throw Error('Receipt verification returned no matching evidence. The request remains unresolved.');
    const latest=loadAttempts(localStorage,view.binding),i=latest.findIndex(r=>r.createdAt===attempt.createdAt&&canonical(r.transaction)===canonical(attempt.transaction));
    if(i<0)throw Error('Security history changed. Keep this hash and refresh.');
    latest[i]={...latest[i],hash:transactionHash,phase:next.receipt.state==='verified'?'verified':next.receipt.state==='failed'?'failed':'pending',
      ...(next.receipt.proposalId!==null?{proposalId:next.receipt.proposalId}:{})};persist(latest);focusNext.current=next.receipt.state!=='pending';apply(next);
    setMessage(next.verified?'Security hardening verified at a finalized block.':next.receipt.state==='verified'?'Transaction verified. Your next action is shown above.':next.receipt.state==='failed'?'Finalized transaction failure verified. Review the current proposal before any new action.':'The transaction is not final yet. Check its evidence again without signing.');
  }
  function sign(){
    if(locked.current||!view||!review||!agree||pending||storageError||review.expiresAt<=Date.now())return;
    const reservation=reserveMeteorAuthorizationWindow(event=>{
      if(!walletPending.current)return;
      if(event.stage==='meteor-window-opened')setProgress('Meteor authorization is open. Review and approve this individual action there.');
      if(event.stage==='meteor-navigation-not-requested')setProgress('Meteor has not requested its authorization route yet. If Continue in Meteor Web is shown, select it once. Do not submit again.');
      if(event.stage==='meteor-response-pending')setProgress('Meteor has not returned a result. Check its window; this request remains locked.');
    });
    if(!reservation){setError('Meteor popup was blocked. No wallet request was made. Allow popups and review again.');return;}
    const previous=review,epoch=generation.current;
    void run(async()=>{
      if(!navigator.locks)throw Error('This browser cannot coordinate security requests across tabs. Signing is unavailable.');
      await navigator.locks.request(attemptKey(creationId),{ifAvailable:true},async lock=>{
        if(!lock)throw Error('Another tab is handling this Yawrd. Reconcile its wallet request first.');
        const history=loadAttempts(localStorage,view.binding);
        if(history.some(r=>r.phase==='pending')||history.length>=20)throw Error('Prior wallet history is unresolved or full. Signing is blocked.');
        setProgress('Refreshing the exact security action…');
        await wallet.prepareCreation(previous.transaction);
        const next=await request({action:'prepare',expectedCreationRevision:view.binding.creationRevision,expectedIntentRevision:view.binding.intentRevision});
        if(epoch!==generation.current||wallet.getContext().accountId!==next.accountId||wallet.getContext().network!=='testnet')throw Error('Steward account changed. Review again.');
        apply(next);
        if(!next.prepared||canonical(next.prepared.transaction)!==canonical(previous.transaction)||next.prepared.executing!==previous.executing||
          BigInt(next.prepared.feeReserveYocto)>BigInt(previous.feeReserveYocto))throw Error('The action, approval consequence or fee reserve changed. Review the new state before signing.');
        const attempt:HardeningAttempt={creationId,daoAccountId:next.binding.daoAccountId,transaction:next.prepared.transaction,
          phase:'pending',preparedAtBlock:next.blockHeight,createdAt:Date.now()};
        persist([...history,attempt]);setReview(null);setAgree(false);walletPending.current=true;
        setProgress('Waiting for Meteor authorization…');reservation.connectorCall();
        const outcome=await wallet.signCreation(attempt.transaction) as {transaction?:{hash?:unknown}};
        walletPending.current=false;setProgress('Wallet returned. Checking finalized transaction evidence…');
        const returned=outcome?.transaction?.hash;
        if(!hashOK(returned))throw Error('Meteor returned no transaction hash. The request remains unresolved; find the hash in Testnet activity before another action.');
        const saved=loadAttempts(localStorage,next.binding);saved[saved.length-1]={...saved[saved.length-1],hash:returned};persist(saved);
        if(epoch!==generation.current)throw Error('Account changed. The transaction hash is saved for read-only recovery.');
        await reconcile(attempt,returned);
      });
    }).finally(()=>reservation.release());
  }
  const approvals=view?.binding.members.filter(member=>view.proposal?.votes[member]==='Approve').length??0;
  const ownApproval=!!view?.proposal&&view.proposal.votes[view.accountId]==='Approve';
  const otherStewards=view?.binding.members.filter(member=>member!==view.accountId)??[];
  const proposalLabel=view?.proposal?'proposal #'+view.proposal.id:'the security proposal';
  let nextTitle='Check your Steward sign-in',nextDescription='Sign in with a saved Steward account to see the next security action.';
  let nextLabel='',nextKind:'review'|'refresh'|'none'='none';
  if(view){
    if(pending){nextTitle='Verify the pending wallet request';nextDescription='No further signing is available until this request is resolved. Find its transaction hash in Meteor and check the finalized evidence below.';}
    else if(storageError){nextTitle='Review saved wallet history';nextDescription='Browser history could not be read. It has been preserved, and signing is blocked.';}
    else if(view.verified){nextTitle='Security hardening verified';nextDescription='Both Steward approvals and automatic updates being off are verified on-chain. No further security transaction is needed.';}
    else if(!view.autoUpdate||approvals===2||view.proposal?.status==='Approved'){
      nextTitle='Verify the security change';nextDescription='Check the finalized setting and approval evidence. Do not submit another vote.';nextLabel='Verify finalized hardening';nextKind='refresh';
    }else if(ownApproval&&view.proposal?.status==='InProgress'){
      nextTitle='Waiting for '+otherStewards.join(' and ');nextDescription='Your approval is recorded. '+otherStewards.join(' and ')+' must sign in separately on this security page and approve '+proposalLabel+'. The second approval executes the change.';
    }else if(!view.proposal&&view.accountId!==view.binding.founderAccountId){
      nextTitle='Waiting for the founder';nextDescription=view.binding.founderAccountId+' must create the security proposal first. You will then be able to review and approve it here.';
    }else if(view.reason||(view.proposal&&view.proposal.status!=='InProgress')){nextTitle='Security review needed';nextDescription=view.reason||'This proposal cannot currently be approved. Refresh status and review its technical details.';}
    else if(view.proposal){
      nextTitle='Review your approval';nextDescription='Creating '+proposalLabel+' did not cast a vote. '+(approvals===0?'Review your first approval, then approve it in Meteor. The other Steward must still approve separately.':'Review your approval in Meteor. This second approval executes the security change.');
      nextLabel='Review approval for '+proposalLabel;nextKind='review';
    }else{nextTitle='Create the security proposal';nextDescription='Review the proposed setting change before creating it in Meteor. Proposal creation does not cast an approval.';nextLabel='Review security proposal';nextKind='review';}
  }
  const canSign=!!review&&review.expiresAt>now&&agree&&!busy&&!wallet.busy&&!pending&&!storageError&&wallet.accountId===view?.accountId;
  const reviewTitle=review?.transaction.actions[0].params.methodName==='act_proposal'?'Review approval for proposal #'+review.transaction.actions[0].params.args.id:'Review security proposal';
  return <section className={ui.panel} aria-label="Creation security">
    <header className={`${styles.heading} ${ui.pageHeader}`}><div><p className={styles.eyebrow}>Security · Testnet</p><h1>Secure your Yawrd</h1></div></header>
    <p className={ui.intro}>Turn off automatic updates so your Yawrd’s DAO cannot be automatically changed when the underlying SputnikDAO software is updated during our Testnet beta.</p>
    {error&&<p role="alert" className={styles.attention}>{error}</p>}
    {view&&<section className={ui.summaryCard} aria-label="Security summary">
      <div className={ui.summaryTop}><h2>{view.binding.name}</h2><span className={ui.statusBadge}>{view.verified?'Hardening verified':view.autoUpdate?'Updates enabled':'Updates disabled · checking evidence'}</span></div>
      <p className={ui.dao}>{view.binding.daoAccountId}</p>
      <div className={ui.proposalRow}><p>{view.proposal?<><strong>Proposal #{view.proposal.id}</strong><span> · {view.proposal.status==='InProgress'?'In progress':view.proposal.status}</span></>:'No security proposal yet'}</p>
        <p><strong>{approvals}/2</strong> approvals recorded</p></div>
      <progress className={ui.progress} value={approvals} max={2} aria-label="Steward approval progress"/>
      <ul className={ui.stewards} aria-label="Steward approvals">{view.binding.members.map(member=><li key={member}>
        <span>{member}{member===view.accountId&&<small className={ui.you}>You</small>}</span>
        <span className={view.proposal?.votes[member]==='Approve'?ui.approved:ui.waiting}>{view.proposal?.votes[member]==='Approve'?'Approved':view.proposal?.votes[member]??'Not yet approved'}</span>
      </li>)}</ul>
      <div className={ui.statusTools}><span>Signed in as {view.accountId}</span><button disabled={busy} onClick={()=>void refresh()}>Refresh status — no signing</button></div>
    </section>}
    <section className={`${ui.nextCard} ${view?.verified?ui.complete:''}`} id="security-next" aria-label="Next action">
      <p className={styles.eyebrow}>Next action</p><h2 ref={nextHeading} tabIndex={-1}>{nextTitle}</h2><p>{nextDescription}</p>
      {nextKind!=='none'&&<button id="hardening-next-action" className={styles.primary} disabled={busy||!view||!!pending||storageError} onClick={()=>void(nextKind==='review'?prepare():refresh())}>{busy?'Checking…':nextLabel}</button>}
      {view?.verified&&view.accountId===view.binding.founderAccountId&&<a className={styles.primary} href={'/create/'+creationId+'/payment'}>Review platform fee →</a>}
      {pending&&<div className={ui.recovery}><p>A rejection, closed window or missing response does not prove no transaction was submitted.</p>
        <label htmlFor="hardening-hash">Exact transaction hash from Meteor</label><input id="hardening-hash" value={hash} placeholder={pending.hash??'Transaction hash'} onChange={e=>setHash(e.target.value)} spellCheck={false}/>
        <button disabled={busy||!(hash.trim()||pending.hash)} onClick={()=>void run(async()=>{setProgress('Checking final receipts; no wallet request…');await reconcile(pending,hash.trim()||pending.hash!);})}>Verify security transaction — no wallet request</button>
      </div>}
      {!view&&<><a href="/create">Check or renew your Yawrd sign-in</a><button disabled={busy} onClick={()=>void refresh()}>Check security status — no signing</button></>}
      {progress&&<p role="status" className={ui.feedback}>{progress}</p>}{message&&<p role="status" className={ui.feedback}>{message}</p>}
    </section>
    {review&&<details id="security-review" className={`${styles.section} ${ui.accordion}`} open={reviewOpen} onToggle={e=>setReviewOpen(e.currentTarget.open)}>
      <summary><h2>{reviewTitle}</h2><span className={styles.chevron} aria-hidden="true">⌄</span></summary>
      <div className={styles.sectionBody}><h3 ref={reviewHeading} tabIndex={-1}>Confirm this individual wallet action</h3>
        <p>{review.transaction.actions[0].params.methodName==='add_proposal'?'Create the security proposal. This does not cast a vote.':review.executing?'Approve and execute the security change as the second Steward.':'Record your approval. The other Steward must still approve separately.'}</p>
        <p>Signer: <strong>{review.transaction.signerId}</strong>. Both Stewards must approve separately.</p>
        <p>50 Tgas limit · zero proposal deposit · additional Testnet network fees paid by the signer. Fee reserve checked: {near(review.feeReserveYocto)} NEAR, including overhead and price headroom. Meteor shows its fees.</p>
        <p>Turning off automatic updates also closes the current factory-mediated upgrade route. Future upgrades need separate review.</p>
        <details><summary>Exact unsigned security request</summary><pre className={styles.words}>{JSON.stringify(review.transaction,null,2)}</pre></details>
        <label className={styles.confirm}><input id="hardening-consent" type="checkbox" checked={agree} disabled={busy||review.expiresAt<=now} onChange={e=>setAgree(e.target.checked)}/>I reviewed this individual action, its fees and the upgrade consequence. I will personally approve it in Meteor.</label>
        <button className={styles.primary} disabled={!canSign} onClick={sign}>{review.transaction.actions[0].params.methodName==='add_proposal'?'Create security proposal in Meteor':review.executing?'Approve and execute security change in Meteor':'Approve security proposal in Meteor'}</button>
        {review.expiresAt<=now&&<p>Review expired. Use the next-action button to refresh it.</p>}
      </div>
    </details>}
    {view&&<details id="security-technical" className={`${styles.section} ${ui.accordion}`}>
      <summary><h2>Technical details and transaction history</h2><span className={styles.chevron} aria-hidden="true">⌄</span></summary>
      <div className={styles.sectionBody}>
        <dl><dt>Creation</dt><dd>{view.binding.creationId}</dd><dt>Finalized block</dt><dd>{view.blockHeight} · {view.blockHash}</dd>
          <dt>Checked at</dt><dd>{view.checkedAt}</dd><dt>Verified DAO code hash</dt><dd>{view.codeHash}</dd><dt>Automatic updates</dt><dd>auto_update={String(view.autoUpdate)}</dd></dl>
        <details><summary>Verified on-chain policy</summary><pre className={styles.words}>{JSON.stringify(view.policy,null,2)}</pre></details>
        <h3>Security transaction history</h3>{rows.filter(r=>r.hash).length===0?<p>No security transaction hashes saved in this browser. Proposal and vote status above come from the finalized chain.</p>:
          <ul>{rows.filter(r=>r.hash).map(r=><li key={r.createdAt}><a href={'https://testnet.nearblocks.io/txns/'+encodeURIComponent(r.hash!)}>{r.transaction.actions[0].params.methodName==='add_proposal'?'Proposal creation':'Steward approval'} · {r.phase}{r.proposalId!==undefined?' · proposal #'+r.proposalId:''}</a></li>)}</ul>}
        <p><a href={'https://testnet.nearblocks.io/txns/'+encodeURIComponent(view.binding.creationTransaction)}>Original Creation transaction</a></p>
      </div>
    </details>}
    <footer className={ui.footer}><p>Both Stewards use this security-only page with their own sign-in. Private project answers stay private.</p>
      <p>The founder can review the separate platform fee after security verification. Platform payment needs its own review and wallet approval. Project Funds and publication remain unavailable.</p>
      {view&&<a href="/create">Check or change your Yawrd sign-in</a>}
    </footer>
  </section>;
}
