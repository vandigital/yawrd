'use client';
import { useEffect,useState } from 'react';
import { activeAttempt,observedAttempt,PREMIUM_MODEL,RECOVERY_CONSENT,type GenerationView } from '../../../../src/creation/preparation-generation-contract';
import ui from './preparation.module.css';

export function GenerationProgress({generation:g,running,onGenerate,onCheck,onRecover,statusFeedback}:{generation:GenerationView;running:boolean;onGenerate:(consentVersion:string)=>void;onCheck:()=>void;onRecover?:(consentVersion:string)=>void;statusFeedback?:{text:string;at:string}|null}){
  const [consent,setConsent]=useState(false);
  const [now,setNow]=useState(Date.now);
  useEffect(()=>setConsent(false),[g.model,g.attempt?.id,g.recovery?.canRecover]);
  useEffect(()=>{if(!g.attempt)return;const timer=setTimeout(()=>setNow(Date.now()),Math.max(0,Date.parse(g.attempt.deadlineAt)-Date.now())+1);return()=>clearTimeout(timer);},[g.attempt?.id,g.attempt?.deadlineAt]);
  const a=observedAttempt(g.attempt,now);
  const feedback=a?.state==='unknown'&&g.attempt?.state!=='unknown'?{text:'Uncertain — observation window expired; completion not confirmed',at:new Date(now).toISOString()}:statusFeedback;
  const labels:[string,boolean][]=[['Preparation request saved',!!a],['Request started · waiting for AI response',!!a?.dispatchedAt],['Response received',!!a?.responseAt],[a?.state==='failed'?'Blueprint not saved':'Blueprint and Skill saved for your review',a?.state==='saved']];
  const activeIndex=a&&activeAttempt(a)?(a.state==='reserved'?0:a.state==='waiting'?1:2):-1;
  return <section className={ui.preparationCard} aria-label="AI preparation progress">
    <h2>{a?.state==='failed'?'Preparation failed — no Blueprint saved':a?.state==='unknown'?'Preparation uncertain — completion not confirmed':a?.state==='saved'?'Your preparation is saved':a?'AI preparation status':'Prepare your Blueprint and contributor guidance'}</h2>
    {!a&&<>
      <p>One request prepares your Blueprint, a self-contained contributor Skill and draft task briefs for private review.</p>
      {!g.canGenerate&&<p className={ui.model}>Planned first controlled test: GPT-6.1 Sol <small>({PREMIUM_MODEL}) through NEAR AI Cloud, routed to OpenAI.</small></p>}
      {g.canGenerate&&<p className={ui.model}>Server-selected model: {g.model}</p>}
      {g.canGenerate&&<p>Your private answers will be sent to NEAR AI Cloud. {g.partnerProvider?'This request routes them to OpenAI, a partner provider, under its terms. There is no hardware privacy guarantee.':'This request uses Qwen on NEAR AI Cloud; it is not the planned GPT premium test.'}</p>}
      <p>Provider credits may be charged for this one request. No wallet transaction is needed. There is no automatic retry or fallback.</p>
      <p>Generation stays private. It does not activate tasks, rewards or publication.</p>
      {g.canGenerate?<><label className={ui.consent}><input type="checkbox" checked={consent} disabled={running} onChange={e=>setConsent(e.target.checked)}/>I authorize this one AI preparation request and disclosure of my private project answers{g.partnerProvider?' to OpenAI through NEAR AI Cloud':''}. Provider charges may apply, including if interrupted. There is no automatic retry. This does not approve the output.</label>
        <button className={ui.primary} disabled={running||!consent} onClick={()=>{setConsent(false);onGenerate(g.consentVersion);}}>Prepare my Blueprint</button></>:
        <><button className={ui.primary} disabled>Prepare my Blueprint</button><p className={ui.availability}>{g.installed?'Preparation is disabled until the controlled test is separately activated.':'Preparation storage is not available yet.'} No AI request has started.</p></>}
      {running&&<p role="status">Checking and saving this request before contacting the provider…</p>}
    </>}
    {a&&<><ol className={ui.progress}>{labels.map(([label,done],index)=><li key={index} data-active={index===activeIndex} aria-current={index===activeIndex?'step':undefined}><span className={done?ui.completed:index===3&&a?.state==='failed'?ui.failed:ui.pending} aria-hidden="true">{index===3&&a?.state==='failed'?'✕':done?'✓':'○'}</span> {label}{index===activeIndex&&<strong className={ui.activeLabel}>Active now</strong>}</li>)}</ol>
      {activeAttempt(a)&&<p role="status">In progress: {labels[activeIndex][0]}. This is the last confirmed stage. Keep this page open; navigation or server interruption can prevent completion.</p>}
      {a.state==='unknown'&&<p role="alert">Completion could not be confirmed. The provider may have processed or billed this request. No new request will be sent automatically. Check the saved status; do not pay again.</p>}
      {a.state==='failed'&&<p role="alert">{a.errorCode==='generation_output_incomplete'?'The AI response reached its output limit and was incomplete.':'The request could not produce a valid saved preparation.'} No usable version was saved. The failed request is preserved. Provider charges may apply; no automatic retry or repair will run.</p>}
      {a.state!=='saved'&&<div><button onClick={onCheck}>Check preparation status</button><p role="status" aria-live="polite">{feedback?feedback.text:a.state==='failed'?'Failed — no Blueprint saved':a.state==='unknown'?'Uncertain — completion not confirmed':'Preparing — last confirmed stage shown'} · {feedback?'Observed: '+feedback.at:'Last confirmed: '+(a.finishedAt??a.responseAt??a.dispatchedAt??a.reservedAt)}</p></div>}
      {g.recovery?.canRecover&&onRecover&&<section aria-label="Authorize one recovery"><h3>One controlled recovery</h3><p>The original failed request is preserved. This separately authorized request reuses the same paid Yawrd and saved revision 7. Private answers go through NEAR AI Cloud to OpenAI, under the partner's terms, without a hardware privacy guarantee. Provider credits may be charged. No new wallet payment is required.</p><label><input type="checkbox" checked={consent} disabled={running} onChange={e=>setConsent(e.target.checked)}/>I authorize one recovery request using the revised limits below. There is no automatic retry, including if interrupted, and this grants no publication or reward authority.</label><button className={ui.primary} disabled={running||!consent} onClick={()=>{setConsent(false);onRecover(RECOVERY_CONSENT);}}>Prepare my Blueprint — one recovery</button></section>}
      {g.recovery?.originalAttempt&&<details><summary>Original failed request</summary><p>Failed · {g.recovery.originalAttempt.errorCode} · {g.recovery.originalAttempt.usage?.tokens?.output??'Unknown'} output tokens, including {g.recovery.originalAttempt.usage?.tokens?.reasoning??'unknown'} reasoning tokens. Original record retained unchanged.</p></details>}
      <p>Last confirmed: {a.finishedAt??a.responseAt??a.dispatchedAt??a.reservedAt}</p>
    </>}
    <details><summary>AI request details — cost and limits</summary>
      {g.recovery?.canRecover&&<p>Recovery limits below apply only to the new, explicitly authorized request. The original failure used an 8,000-token limit and a 180-second provider deadline.</p>}
      <ul><li>{g.canGenerate||a?'Server-selected model':'Configured model (requests disabled)'}: {g.model}</li>
      <li>Provider credits pay for the request; charges depend on the selected model and provider account.</li>
      <li>One request, with no automatic retry. Private answers go to the disclosed provider.</li>
      <li>Complete input: up to {g.inputBytesLimit.toLocaleString()} bytes. Output: up to {g.outputTokensLimit.toLocaleString()} tokens, including reasoning.</li>
      <li>Time limit: {g.providerTimeoutMs/1000} seconds, then checks and saving. Keep this page open; navigation or server interruption can prevent completion even if the provider charges.</li></ul>
      <p>Progress shows confirmed events. Status checks are bounded; uncertain outcomes do not authorize another request.</p></details>
  </section>;
}
