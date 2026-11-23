'use client';
import { useEffect, useRef, useState } from 'react';
import { useTestnetWallet } from '../../../use-testnet-wallet';
import { ACCOUNT_SESSION_CHANGED, openAccountDisclosure } from '../../../components/route-account-controls';
import { PREPARATION_CONSENT, preparationIssues, preparationSkill, type PreparationArtifacts, type PreparationView } from '../../../../src/creation/preparation-contract';
import { PreparationEditor, PreparationReview } from './preparation-content';
import ui from './preparation.module.css';
import { CreationJourney } from '../../creation-journey';
import { GenerationProgress } from './generation-progress';
import { activeAttempt } from '../../../../src/creation/preparation-generation-contract';

const messages:Record<string,string>={
  sign_in_required:'Sign in or renew your sign-in using Account above. You can stay on this page.',
  creation_session_changed:'Your account changed. Private content was cleared. Sign in with the intended founder using Account above.',
  creation_not_found:'This private preparation is unavailable for your signed-in account.',
  preparation_payment_required:'Preparation requires this founder’s saved, verified payment and account setup.',
  preparation_storage_required:'Preparation storage is awaiting separate Development installation. No AI request was made.',
  preparation_version_required:'No AI preparation version is saved yet. AI preparation will be connected in P3.5B.',
  preparation_revision_conflict:'Another tab or session changed this preparation. Your edits are still here. Copy them from Advanced before loading the saved version.',
  preparation_incomplete:'Save your edits, then complete the review items before approval.',
  invalid_preparation:'Check field lengths, task identifiers and content structure. Your edits were not saved.',
  generation_input_too_large:'The complete preparation input exceeds the safe request limit. It was not truncated or sent.',
  generation_intake_required:'Complete and save your project answers before AI preparation.',
  generation_not_enabled:'AI preparation is awaiting separate Development activation.',
  generation_storage_required:'AI preparation storage is awaiting separate Development installation. No inference was started.',
  recovery_storage_required:'Recovery awaits separate Development installation and founder authorization. No new request was sent.',
  recovery_not_eligible:'This request is not eligible for the controlled recovery. No new request was sent.',
  provider_credentials_missing:'The server’s existing provider configuration is unavailable. No inference was started.',
  generation_source_changed:'Your saved project answers changed before the request was reserved. Reload them before proceeding.',
};
class RequestError extends Error { constructor(readonly code:string){super(messages[code]??'Preparation could not be saved or loaded. Your last confirmed saved version is unchanged.');} }

export default function PreparationPanel({creationId}:{creationId:string}){
  const wallet=useTestnetWallet();
  const [view,setView]=useState<PreparationView|null>(null),[content,setContent]=useState<PreparationArtifacts|null>(null);
  const [loadedWallet,setLoadedWallet]=useState<string|null>(null),[editing,setEditing]=useState(false),[consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [statusFeedback,setStatusFeedback]=useState<{text:string;at:string}|null>(null);
  const [intake,setIntake]=useState<{revision:number;name:string}|null>(null);
  const [generating,setGenerating]=useState(false);
  const pollBudget=useRef(70);
  const epoch=useRef(0),live=useRef(true),owner=useRef<string|null>(null),active=useRef(new Set<AbortController>()),locked=useRef(false);
  const current=useRef<PreparationView|null>(null);
  function clear(){epoch.current++;active.current.forEach(c=>c.abort());active.current.clear();locked.current=false;current.current=null;owner.current=null;setView(null);setIntake(null);setStatusFeedback(null);setContent(null);setConsent(false);setEditing(false);setMessage('');setGenerating(false);}
  async function session(signal:AbortSignal){
    const result=await fetch('/api/auth/session',{credentials:'same-origin',cache:'no-store',signal});
    if(!result.ok)throw new RequestError('service_unavailable');
    const {accountId}=await result.json();
    if(typeof accountId!=='string'||!accountId)throw new RequestError('sign_in_required');
    if(wallet.accountId&&wallet.accountId!==accountId)throw new RequestError('creation_session_changed');
    return accountId as string;
  }
  function apply(next:PreparationView){
    const before=current.current,oldHead=before?.versions.at(-1),newHead=next.versions.at(-1);
    if(before?.binding.creationId===next.binding.creationId){
      if((oldHead?.revision??0)>(newHead?.revision??0))return;
      if(oldHead?.revision===newHead?.revision&&oldHead?.approval&&!newHead?.approval)return;
      if(before.generation?.recovery?.attempt&&!next.generation?.recovery?.attempt)return;
      const oldAttempt=before.generation?.attempt,newAttempt=next.generation?.attempt;
      const rank:Record<string,number>={reserved:0,waiting:1,checking:2,unknown:3,failed:4,saved:5};
      if(oldAttempt&&newAttempt&&oldAttempt.id===newAttempt.id&&rank[oldAttempt.state]>rank[newAttempt.state])return;
    }
    current.current=next;owner.current=next.binding.founderAccountId;setView(next);setContent(next.versions.at(-1)?.artifacts??null);setLoadedWallet(wallet.accountId);setConsent(false);setEditing(false);
  }
  async function request(data?:object){
    const e=epoch.current,controller=new AbortController();active.current.add(controller);
    const timer=setTimeout(()=>controller.abort(),(current.current?.generation?.providerTimeoutMs??180000)+60000);
    try{
    const accountId=await session(controller.signal);
    if(e!==epoch.current||!live.current)return;
    if(data&&owner.current!==accountId)throw new RequestError('creation_session_changed');
    const response=await fetch('/api/creations/'+creationId+'/preparation',{
      method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,
      headers:{'x-yawrd-account':accountId,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{}),
    });
    const value=await response.json();
    if(e!==epoch.current||!live.current)return;
    if(!response.ok)throw new RequestError(value.error);
    // Terminal status must reach the UI before optional intake-summary work.
    if(await session(controller.signal)!==accountId)throw new RequestError('creation_session_changed');
    if(e!==epoch.current||!live.current)return;
    if(value.binding?.founderAccountId!==accountId)throw new RequestError('creation_session_changed');
    apply(value);
    if(!data&&!value.versions?.length){
      void (async()=>{try{
        const response=await fetch('/api/creations/'+creationId,{credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'x-yawrd-account':accountId}});
        const saved=await response.json();
        if(e!==epoch.current||!live.current)return;
        if(!response.ok){if(['sign_in_required','creation_session_changed','creation_not_found'].includes(saved.error))throw new RequestError(saved.error);}
        else{
          if(saved.creation?.id!==creationId||saved.creation?.founderAccountId!==accountId)throw new RequestError('creation_session_changed');
          setIntake({revision:saved.creation.revision,name:saved.creation.intake.projectName??'Untitled project'});
        }
      }catch(ex){if(ex instanceof RequestError&&e===epoch.current&&live.current){clear();setBusy(false);setError(ex.message);}/* Optional summary failure never hides terminal status. */}})();
    }
    return value as PreparationView;
    }finally{clearTimeout(timer);active.current.delete(controller);}
  }
  async function run(data?:object){
    if(locked.current)return;
    locked.current=true;setBusy(true);setError('');setMessage('');setConsent(false);
    const e=epoch.current;
    if(data&&'action' in data&&(data.action==='generate'||data.action==='recover')){setGenerating(true);setStatusFeedback(null);pollBudget.current=data.action==='recover'?160:70;}
    try{const value=await request(data);if(value&&e===epoch.current){const a=value.generation?.attempt;setMessage(data&&value.versions.length&&(a?.state==='saved'||'action' in data&&(data.action==='save'||data.action==='approve'))?'Saved to your private preparation.':'');}}
    catch(ex){if(!live.current||e!==epoch.current)return;
      if(ex instanceof RequestError&&['sign_in_required','creation_session_changed','creation_not_found'].includes(ex.code)){clear();setBusy(false);setError(ex.message);}
      else if(e===epoch.current&&!(ex instanceof DOMException&&ex.name==='AbortError'))setError(ex instanceof Error?ex.message:'Preparation unavailable.');
    }finally{if(e===epoch.current){locked.current=false;if(live.current){setBusy(false);setGenerating(false);}}}
  }
  useEffect(()=>{
    live.current=true;clear();locked.current=false;void run();
    const changed=()=>{clear();locked.current=false;setBusy(true);setError('');void run();};
    const check=async()=>{
      const e=epoch.current,controller=new AbortController();
      try{const account=await session(controller.signal);if(e===epoch.current&&owner.current&&account!==owner.current)changed();}
      catch(ex){if(e===epoch.current&&live.current){clear();setBusy(false);setError(ex instanceof Error?ex.message:'Check your sign-in using Account.');}}
    };
    const visible=()=>{if(document.visibilityState==='visible')void check();};
    window.addEventListener(ACCOUNT_SESSION_CHANGED,changed);window.addEventListener('focus',check);document.addEventListener('visibilitychange',visible);
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void check();},30000);
    return()=>{live.current=false;epoch.current++;active.current.forEach(c=>c.abort());active.current.clear();clearInterval(timer);window.removeEventListener(ACCOUNT_SESSION_CHANGED,changed);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',visible);};
  },[creationId,wallet.accountId]);

  async function poll(){
    const e=epoch.current;
    setStatusFeedback({text:'Checking saved status…',at:new Date().toISOString()});
    try{const value=await request();if(value&&e===epoch.current){const accepted=current.current??value;setStatusFeedback({text:accepted.generation?.attempt?.state==='failed'?'Failed — no Blueprint saved':accepted.generation?.attempt?.state==='unknown'?'Uncertain — completion not confirmed':accepted.generation?.attempt?.state==='saved'?'Saved — ready for review':accepted.generation?.attempt?'Preparing — '+accepted.generation.attempt.state:'No request reserved',at:new Date().toISOString()});}}catch(ex){if(e!==epoch.current||!live.current)return;
      if(ex instanceof RequestError&&['sign_in_required','creation_session_changed','creation_not_found'].includes(ex.code)){clear();setBusy(false);}
      setStatusFeedback({text:'Status unavailable — last confirmed stage retained',at:new Date().toISOString()});
      setError(ex instanceof Error?ex.message:'Saved status is unavailable. Check it again without starting another request.');}
  }
  const attemptState=view?.generation?.attempt?.state;
  useEffect(()=>{
    if(view?.versions.length||view?.generation?.attempt&&!activeAttempt(view.generation.attempt)||!generating&&!activeAttempt(view?.generation?.attempt??null))return;
    let checking=false;
    const timer=setInterval(()=>{if(checking||pollBudget.current<=0||document.visibilityState!=='visible')return;
      pollBudget.current--;checking=true;void poll().finally(()=>{checking=false;});},3000);
    return()=>clearInterval(timer);
  },[generating,attemptState,view?.versions.length,creationId,wallet.accountId]);

  const visible=view&&loadedWallet===wallet.accountId;
  const version=visible?view.versions.at(-1):null;
  const dirty=!!(content&&version&&JSON.stringify(content)!==JSON.stringify(version.artifacts));
  const issues=content?preparationIssues(content):[];
  const approved=!!(version?.approval&&!dirty);
  function edit(next:PreparationArtifacts){setContent(next);setConsent(false);setMessage('');}
  function download(){if(!content||!approved)return;const url=URL.createObjectURL(new Blob([preparationSkill(content,true)],{type:'text/markdown'}));
    const link=document.createElement('a');link.href=url;link.download='SKILL.md';link.click();URL.revokeObjectURL(url);}
  return <main className={ui.page}>
    <a href="/create">Back to Creation</a>
    {visible&&<CreationJourney current={3} paidContinuation/>}
    <p className={ui.eyebrow}>03 — Build your Blueprint</p>
    <h1>{version?'Review your Blueprint':'Prepare your Blueprint'}</h1>
    <p className={ui.lead}>Turn your saved project answers into a Blueprint, contributor Skill and proposed task plan. Review everything before approval.</p>
    {error&&visible&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {visible&&!version&&<section className={ui.context} aria-label="Saved project context">
      <h2>Your saved starting point</h2>
      {intake&&<><p className={ui.projectName}>{intake.name}</p><p>Private planning name · Saved intake revision {intake.revision}</p></>}
      <p className={ui.verified}>✓ Project account deployment verified · ✓ Setup payment verified</p>
      <p>Editing private answers does not rename your deployed Yawrd or change its payment.</p>
      <details><summary>Deployed public identity</summary><p>{view.binding.daoAccountId}</p></details>
    </section>}
    {visible&&view.generation?.installed&&!view.generation.attempt&&!view.versions.length&&<p>
      <a className={ui.editLink} href={'/create?step=intake&draft='+encodeURIComponent(creationId)+'&returnTo=preparation'}>Review or edit project answers</a>
      {' '}Your latest saved answers will be used when you prepare with AI.
    </p>}
    {visible&&view.generation?.attempt&&<p>Your initial project answers are locked because AI preparation has started. You can review and edit the resulting preparation when it is saved.</p>}
    {visible&&view.generation&&<GenerationProgress generation={view.generation} running={generating} onGenerate={consentVersion=>void run({action:'generate',consent:true,consentVersion})} onCheck={()=>void poll()} statusFeedback={statusFeedback} onRecover={consentVersion=>void run({action:'recover',consent:true,consentVersion})}/>}
    {!visible?<section aria-label="Access your preparation"><h2>{busy?'Opening your project…':'Access your preparation'}</h2>
      <p role={error?'alert':'status'}>{busy?'Checking your sign-in and saved project.':error||'Sign in or renew using Account to continue here. Your saved answers remain private.'}</p>
      {!busy&&<button className={ui.primary} onClick={error&&/sign-in|account|signed-in/i.test(error)?openAccountDisclosure:()=>void run()}>{error&&/sign-in|account|signed-in/i.test(error)?'Sign in or renew with Account':'Check access again'}</button>}
    </section>:
      !version||!content?<section className={ui.next}><h2>What happens next</h2><ol><li>Authorize one private AI preparation request when this test is enabled.</li><li>Review and edit the Blueprint, Skill and task briefs.</li><li>Save and approve the exact version you reviewed.</li></ol><p>Tasks, rewards and publication remain separate later steps.</p></section>:<>
        <p role="status">{dirty?'You have unsaved changes.':approved?'This saved version is founder approved.':'This saved version needs founder review.'}</p>
        <p>{version.origin==='founder-edited'?'Founder-edited derivative; the source AI result is preserved in version history.':'Original AI-generated preparation; founder review is required.'}</p>
        {editing?<fieldset disabled={busy}><legend>Edit saved preparation</legend><PreparationEditor content={content} onChange={edit}/></fieldset>:<PreparationReview content={content}/>}
        <div className={ui.actions}>{dirty?<button className={ui.primary} disabled={busy} onClick={()=>void run({action:'save',expectedRevision:version.revision,expectedDigest:version.digest,artifacts:content})}>Save changes</button>:
          !approved?<><label><input type="checkbox" checked={consent} disabled={busy||issues.length>0} onChange={e=>setConsent(e.target.checked)}/>I reviewed this exact saved Blueprint, Skill, task briefs, shared inputs and unresolved decisions. The contributor handoff contains its required context; private notes are excluded. I approve this private preparation version. This grants no publication, task activation, access, rewards or spending permission.</label>
            <button className={ui.primary} disabled={busy||!consent||issues.length>0} onClick={()=>void run({action:'approve',expectedRevision:version.revision,expectedDigest:version.digest,consent:true,consentVersion:PREPARATION_CONSENT})}>Approve this version</button></>:
          <><a className={ui.editLink} href={'/create/'+encodeURIComponent(creationId)+'/contributions'}>Configure contributions</a><button disabled={busy} onClick={download}>Download reviewed SKILL.md</button></>}
          <button disabled={busy} onClick={()=>{setEditing(!editing);setConsent(false);}}>{editing?'Preview changes':'Edit preparation'}</button>
        </div>
        {!approved&&<p><a href={'/create/'+encodeURIComponent(creationId)+'/contributions'}>Configure contributions</a> requires an approved Blueprint. Any configuration saved against an earlier approved version remains available.</p>}
        {!!issues.length&&<section aria-label="Before approval"><h2>Before approval</h2><p>Incomplete drafts can be saved.</p><ul>{issues.map(s=><li key={s}>{s}</li>)}</ul></section>}
        <details><summary>Advanced · Markdown, JSON, provenance and versions</summary>
          <h2>Contributor Skill preview</h2><p>Only contributor content is included below. No export publishes it.</p><pre>{preparationSkill(content,approved)}</pre>
          <h2>Private version JSON</h2><p>Includes private planning notes. Copy here to preserve unsaved changes before loading another saved version.</p><pre>{JSON.stringify(content,null,2)}</pre>
          <h2>Provenance and approval history</h2><p>The original source and latest twenty versions are available here. Older versions remain stored.</p><pre>{JSON.stringify({binding:view.binding,versions:view.versions.map(({artifacts,...metadata})=>metadata)},null,2)}</pre>
          <h2>Human quality review reference</h2><p>Check founder-intent fidelity; self-contained contributor guidance; honest task boundaries and dependencies; observable acceptance and evidence; labeled assumptions and missing decisions; scoped verified facts; and readiness to convert specifications into task cards. These checks do not constitute an automated score or authorize activation.</p>
          <button disabled={busy} onClick={()=>void run()}>Load saved version — discard unsaved changes</button>
        </details>
      </>}
  </main>;
}
