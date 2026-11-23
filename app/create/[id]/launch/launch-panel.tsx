'use client';
import { useEffect, useRef, useState } from 'react';
import { useTestnetWallet } from '../../../use-testnet-wallet';
import { ACCOUNT_SESSION_CHANGED, openAccountDisclosure } from '../../../components/route-account-controls';
import { publicationMessage, publicationText, PUBLICATION_RECIPIENT } from '../../../../src/creation/publication';
import { publicLaunchPreview, formatLaunchAmount, type LaunchView } from '../../../../src/creation/launch-preparation';
import { YawrdIdentityPresentation } from '../../../components/yawrd-identity-presentation';
import previewUi from './preview.module.css';
import ui from '../contributions/contributions.module.css';

const messages: Record<string, string> = {
  sign_in_required: 'Sign in or renew using Account above to continue here. Your saved configuration stays private.',
  creation_session_changed: 'Your account changed. Private content was cleared. Use Account to sign in as the founder.',
  creation_not_found: 'This private configuration is unavailable for your signed-in account.',
  launch_profile_required: 'The approved Blueprint needs a project title and overview. Edit and approve those fields in Blueprint before reviewing the public profile.',
  publication_storage_required: 'Secure publication storage is unavailable. Your Yawrd has not been confirmed public. Refresh readiness before retrying.',
  launch_challenge_expired: 'The wallet review expired. Refresh readiness and review again.',
  launch_challenge_required: 'Publication authorization could not be verified. Review again.',
  launch_already_published: 'This Yawrd was already published. Refresh readiness for its public link.',
  launch_rate_limited: 'Too many publication reviews. Wait a minute, then review again.',
  launch_consent_required: 'Review the public details and explicitly authorize publication.',
  launch_governance_required: 'Confirm work approval before launch.',
  launch_source_changed: 'Your preparation changed. Refresh readiness and review the public details again.',
  launch_publication_blocked: 'Launch is blocked pending an authorization safeguard. Your Yawrd remains private.',
  governance_storage_required: 'Work approval storage awaits authorized Development installation or is unavailable. Saving is not available.',
  governance_contributions_required: 'Save your contribution choices before reviewing work approval.',
  contribution_approval_required: 'Approve a saved Blueprint before reviewing work approval.',
  governance_source_changed: 'Your saved contributions or approved Blueprint changed. Check saved settings, review the current contribution choices, then confirm again.',
  governance_revision_conflict: 'Another tab saved newer settings. Check saved settings before confirming again.',
  governance_binding_changed: 'The verified project identity or its verification evidence changed. Configuration is blocked until that change is reviewed.',
  governance_confirmation_required: 'Confirm the review arrangement before saving.',
  creation_deployment_unverified: 'The project setup could not be verified. Return to your Creation to review it.',
  preparation_payment_required: 'The verified setup required for private configuration is unavailable.',

};
class RequestError extends Error {
  constructor(readonly code: string) { super(messages[code] ?? 'The request could not be confirmed. Your edits are retained; check saved settings before trying again.'); }
}
export default function LaunchPanel({ creationId }: { creationId: string }) {
  const wallet = useTestnetWallet();
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewButton = useRef<HTMLButtonElement>(null), previewContent = useRef<HTMLDivElement>(null);
  const previewWasOpen = useRef(false);
  const [view, setView] = useState<LaunchView | null>(null), [consent, setConsent] = useState(false);
  const [loadedWallet, setLoadedWallet] = useState<string | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const epoch = useRef(0), live = useRef(true), locked = useRef(false), owner = useRef<string | null>(null);
  const active = useRef(new Set<AbortController>());
  function clear() {
    epoch.current++; active.current.forEach(c => c.abort()); active.current.clear(); locked.current = false; owner.current = null;
    setView(null); setConsent(false); setPreviewOpen(false); setLoadedWallet(null); setError('');
  }
  async function session(signal: AbortSignal) {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal });
    if (!response.ok) throw new RequestError('service_unavailable');
    const { accountId } = await response.json();
    if (typeof accountId !== 'string' || !accountId) throw new RequestError('sign_in_required');
    if (wallet.accountId && wallet.accountId !== accountId) throw new RequestError('creation_session_changed');
    return accountId as string;
  }
  async function run(data?: object, showPreview = false) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const e = epoch.current, controller = new AbortController(); active.current.add(controller);
    const timer = setTimeout(() => controller.abort(), data ? 300000 : 30000);
    try {
      const accountId = await session(controller.signal);
      if (e !== epoch.current || !live.current) return;
      if (data && owner.current !== accountId) throw new RequestError('creation_session_changed');
      const response = await fetch('/api/creations/' + creationId + '/launch', {
        method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'x-yawrd-account': accountId, ...(data ? { 'content-type': 'application/json' } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      let next = await response.json();
      if (e !== epoch.current || !live.current) return;
      if (!response.ok) throw new RequestError(next.error);
      if (data && next.challenge) {
        const c = next.challenge;
        const sha = async (value:unknown) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(publicationText(value))))).map(b=>b.toString(16).padStart(2,'0')).join('');
        if (!view || c.accountId!==accountId || c.origin!==location.origin || c.network!=='testnet' ||
          c.recipient!==PUBLICATION_RECIPIENT || c.expiresAt-c.issuedAt!==300000 || Date.now()<c.issuedAt || Date.now()>=c.expiresAt ||
          c.message!==publicationMessage(c,creationId,await sha(view.source),await sha(view.proposed))) throw new RequestError('launch_challenge_required');
        const current = () => e===epoch.current && live.current && owner.current===accountId && wallet.getContext().accountId===accountId && wallet.getContext().network==='testnet';
        if (!current()) throw new RequestError('creation_session_changed');
        const proof = await wallet.signIdentity({message:c.message,recipient:c.recipient,nonce:Uint8Array.from(atob(c.nonce),v=>v.charCodeAt(0)),signerId:accountId,network:'testnet'});
        if (!current() || await session(controller.signal)!==accountId) throw new RequestError('creation_session_changed');
        const published = await fetch('/api/creations/'+creationId+'/launch',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
          headers:{'content-type':'application/json','x-yawrd-account':accountId},body:JSON.stringify({action:'publish',challengeId:c.id,proof:{accountId:proof.accountId,publicKey:proof.publicKey,signature:proof.signature}})});
        next = await published.json();
        if (!current()) return;
        if (!published.ok) throw new RequestError(next.error);
      }
      if (await session(controller.signal) !== accountId) throw new RequestError('creation_session_changed');
      if (e !== epoch.current || !live.current) return;
      if (data && next.published) {
        if (next.published.creationId!==creationId || next.published.url!=='/yawrd/'+creationId) throw new RequestError('launch_challenge_required');
        setView(v=>v?{...v,published:next.published}:v);setConsent(false);return;
      }
      if (next.binding?.founderAccountId !== accountId || next.binding?.creationId !== creationId) throw new RequestError('creation_session_changed');
      const value = next as LaunchView;
      owner.current = accountId; setLoadedWallet(wallet.accountId); setView(value);
      setConsent(false); setPreviewOpen(showPreview);
    } catch (ex) {
      if (e !== epoch.current || !live.current) return;
      if (ex instanceof RequestError && ['sign_in_required', 'creation_session_changed', 'creation_not_found'].includes(ex.code)) {
        clear(); setBusy(false); setError(ex.message);
      } else setError(ex instanceof DOMException && ex.name === 'AbortError'
        ? 'The request was interrupted; saving is unconfirmed. Your edits are retained. Check saved settings before trying again.'
        : ex instanceof Error ? ex.message : 'Settings are unavailable.');
    } finally {
      clearTimeout(timer); active.current.delete(controller);
      if (e === epoch.current) { locked.current = false; if (live.current) setBusy(false); }
    }
  }
  useEffect(() => {
    live.current = true; clear(); void run();
    const changed = () => { clear(); setBusy(true); void run(); };
    const check = async () => {
      const e = epoch.current, controller = new AbortController(); active.current.add(controller);
      const timeout = setTimeout(() => controller.abort(), 15000);
      try { const account = await session(controller.signal); if (e === epoch.current && live.current && owner.current && account !== owner.current) changed(); }
      catch (ex) { if (e === epoch.current && live.current) { clear(); setBusy(false); setError(ex instanceof Error ? ex.message : 'Check Account sign-in.'); } }
      finally { clearTimeout(timeout); active.current.delete(controller); }
    };
    const visible = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener(ACCOUNT_SESSION_CHANGED, changed); window.addEventListener('focus', check); document.addEventListener('visibilitychange', visible);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void check(); }, 30000);
    return () => { live.current = false; epoch.current++; active.current.forEach(c => c.abort()); active.current.clear(); clearInterval(timer);
      window.removeEventListener(ACCOUNT_SESSION_CHANGED, changed); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', visible); };
  }, [creationId, wallet.accountId]);
  const visible = !!(view && loadedWallet === wallet.accountId);
  const preview = view ? publicLaunchPreview(view.source) : null;
  useEffect(() => {
    if (visible && previewOpen) { previewContent.current?.focus(); previewWasOpen.current = true; }
    else if (visible && previewWasOpen.current) { previewButton.current?.focus(); previewWasOpen.current = false; }
    else if (!visible) previewWasOpen.current = false;
  }, [visible, previewOpen]);
  if (visible && previewOpen) return <main className={previewUi.page}>
    <div className={previewUi.toolbar}><button onClick={() => setPreviewOpen(false)}>Back to Launch</button>
      <p>Unpublished preview · Proposed complete page · Review the title, overview and selected planned task details before publication.</p></div>
    <div className={previewUi.presentation} ref={previewContent} tabIndex={-1} role="region" aria-label="Your unpublished Yawrd">
      <YawrdIdentityPresentation project={view!.proposed} creatorAccountId={view!.binding.founderAccountId}/>
    </div>
  </main>;
  if (visible && view!.published) return <main className={ui.page}><h1>Your Yawrd is public</h1><p>Applications, tasks, rewards and payments remain inactive.</p><a href={view!.published.url}>View your Yawrd</a></main>;
  return <main className={ui.page}>
    <a href={'/create/' + encodeURIComponent(creationId) + '/governance'}>Back to work approval</a>
    <header className={ui.heading}><h1>Ready to launch?</h1><p className={ui.lead}>Review your Yawrd before making it public.</p></header>
    {error && <p role="alert">{error}</p>}
    {!visible ? <section><h2>{busy ? 'Opening your Yawrd…' : 'Access your Yawrd'}</h2>
      {!busy && <><p>Use Account to sign in as the founder.</p><button onClick={/sign.in|account/i.test(error) ? openAccountDisclosure : () => void run()}>Check access again</button></>}
    </section> : <>
      <section className={ui.task} aria-label="Launch readiness"><div className={ui.project}><strong>{view!.source.publicName}</strong><span>Private draft</span></div>
        <p>Blueprint approved · Contribution choices saved · Work approval {view!.current ? 'confirmed' : 'needs review'}</p>
        <p>{view!.fundingPlan==='none-planned' ? 'No contributor payouts planned' : 'Funding and payout terms unresolved'}</p>
        <p>Proposed public profile from your approved Blueprint. Review the exact details before publication.</p>
      </section>
      {!view!.current && <p role="alert">Your preparation changed. Review contributions and confirm work approval before launch.</p>}
      <p>Launching makes your approved title, overview and selected planned task details in the full preview public. The proposed name and overview come from your approved Blueprint. Other private planning stays private. Applications, work and rewards remain inactive.</p>
      <p><button ref={previewButton} disabled={busy} onClick={() => void run(undefined, true)}>Preview your Yawrd</button></p>
      <details><summary>Preview public project details</summary><h2>{preview!.name}</h2><p>{preview!.description}</p><p>The proposed publication profile contains this approved Blueprint title and summary. Blueprint approval alone does not authorize public release. The selected planned task details in the full preview are included in your publication consent. Private acceptance evidence and planning records are excluded.</p></details>
      <fieldset disabled={busy || !view!.current}><legend>Publication consent</legend>
        <label className={ui.review}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I understand which project details will become public and authorize publication.</label>
      </fieldset>
      <p id="launch-blocker" role="status">{view!.publicationEnabled ? 'Launch requests one Meteor wallet message approval. It costs no gas and sends no transaction.' : 'Launch is blocked pending an authorization safeguard. Your Yawrd remains private.'}</p>
      <div className={ui.actions}><button className={ui.primary} disabled={busy || !view!.current || !consent || !view!.publicationEnabled} aria-describedby="launch-blocker" onClick={()=>void run({source:view!.source,consent,payload:view!.proposed})}>Launch my Yawrd</button></div>
      <details className={ui.advanced}><summary>Advanced · Readiness and verification</summary>
        <p>Publication requires a fresh founder wallet signature for this exact public page and current source. A separate publication login records immutable evidence. Launch stays unavailable until its authorized database installation and configuration are complete.</p>
        <p>No contributor payouts planned reflects the explicit “No money needed” intake decision. It is not consent to unpaid work. Other budget selections leave reward terms unresolved.</p>
        <p>Setup fees are separate from Project Funds. Account balance, including reserves, is not a reward budget or payment commitment. No post-launch funding workflow is promised.</p>
        <p>{view!.funds?.status==='observed' ? 'Observed account balance: '+formatLaunchAmount((BigInt(view!.funds.amountYocto)+BigInt(view!.funds.lockedYocto)).toString())+' Testnet NEAR (includes locked and storage reserves).' : 'Project account balance is unverified.'}</p>
        <p>Proposed name: approved blueprint.title. Proposed description: approved blueprint.summary. Blueprint outcome remains the internal intended result; no fields are concatenated. Deployment metadata is frozen and is not renamed.</p>
        <p>Historical deployed name: {view!.deployment.name}</p><p>Historical deployed purpose: {view!.deployment.description}</p><p>Project account: {view!.deployment.daoAccountId}</p>
        <pre>{JSON.stringify({source:view!.source,deployment:view!.deployment,funds:view!.funds},null,2)}</pre>
        <button disabled={busy} onClick={()=>void run()}>Refresh readiness</button>
      </details>
    </>}
  </main>;
}
