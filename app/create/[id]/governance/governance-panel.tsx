'use client';
import { useEffect, useRef, useState } from 'react';
import { useTestnetWallet } from '../../../use-testnet-wallet';
import { ACCOUNT_SESSION_CHANGED, openAccountDisclosure } from '../../../components/route-account-controls';
import { CreationJourney } from '../../creation-journey';
import { sameGovernanceSource, type GovernanceView } from '../../../../src/creation/governance-configuration';
import ui from '../contributions/contributions.module.css';

const messages: Record<string, string> = {
  sign_in_required: 'Sign in or renew using Account above to continue here. Your saved configuration stays private.',
  creation_session_changed: 'Your account changed. Private content was cleared. Use Account to sign in as the founder.',
  creation_not_found: 'This private configuration is unavailable for your signed-in account.',
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
export default function GovernancePanel({ creationId }: { creationId: string }) {
  const wallet = useTestnetWallet();
  const [view, setView] = useState<GovernanceView | null>(null), [confirmed, setConfirmed] = useState(false);
  const [loadedWallet, setLoadedWallet] = useState<string | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const epoch = useRef(0), live = useRef(true), locked = useRef(false), owner = useRef<string | null>(null);
  const active = useRef(new Set<AbortController>());
  function clear() {
    epoch.current++; active.current.forEach(c => c.abort()); active.current.clear(); locked.current = false; owner.current = null;
    setView(null); setConfirmed(false); setLoadedWallet(null); setError('');
  }
  async function session(signal: AbortSignal) {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store', signal });
    if (!response.ok) throw new RequestError('service_unavailable');
    const { accountId } = await response.json();
    if (typeof accountId !== 'string' || !accountId) throw new RequestError('sign_in_required');
    if (wallet.accountId && wallet.accountId !== accountId) throw new RequestError('creation_session_changed');
    return accountId as string;
  }
  async function run(data?: object) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    const e = epoch.current, controller = new AbortController(); active.current.add(controller);
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const accountId = await session(controller.signal);
      if (e !== epoch.current || !live.current) return;
      if (data && owner.current !== accountId) throw new RequestError('creation_session_changed');
      const response = await fetch('/api/creations/' + creationId + '/governance', {
        method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'x-yawrd-account': accountId, ...(data ? { 'content-type': 'application/json' } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      const next = await response.json();
      if (e !== epoch.current || !live.current) return;
      if (!response.ok) throw new RequestError(next.error);
      if (await session(controller.signal) !== accountId) throw new RequestError('creation_session_changed');
      if (e !== epoch.current || !live.current) return;
      if (next.binding?.founderAccountId !== accountId || next.binding?.creationId !== creationId) throw new RequestError('creation_session_changed');
      const value = next as GovernanceView;
      owner.current = accountId; setLoadedWallet(wallet.accountId); setView(value);
      setConfirmed(!!value.saved && value.contributionCurrent && sameGovernanceSource(value.source, value.saved.source));
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
  const current = !!(view?.saved && view.contributionCurrent && sameGovernanceSource(view.source, view.saved.source));
  const saved = visible && current && confirmed && !busy && !error;
  return <main className={ui.page}>
    <a href={'/create/' + encodeURIComponent(creationId) + '/contributions'}>Back to contributions</a>
    {visible && <CreationJourney current={3} paidContinuation blueprintApproved/>}
    <header className={ui.heading}>
      <h1>Who approves the work?</h1>
      <p className={ui.lead}>Choose how completed work will be reviewed.</p>
      {visible && <div className={ui.project}><strong>{view!.title}</strong><span>Private draft</span></div>}
    </header>
    {error && <p role="alert">{error}</p>}
    {!visible ? <section><h2>{busy ? 'Opening your configuration…' : 'Access your configuration'}</h2>
      {!busy && <><p>Use Account to sign in as the founder. Saved settings remain with this Creation.</p>
        <button className={ui.primary} onClick={/sign.in|account/i.test(error) ? openAccountDisclosure : () => void run()}>{/sign.in|account/i.test(error) ? 'Sign in or renew with Account' : 'Check access again'}</button></>}
    </section> : <>
      {!view!.contributionCurrent && <aside className={ui.notice}><h2>Review your contribution choices first</h2><p>A newer Blueprint is approved. Return to contributions and save your reviewed choices before confirming work approval.</p></aside>}
      {view!.saved && !current && <aside className={ui.notice}><h2>Your earlier confirmation is preserved</h2><p>It applies to the earlier saved contribution choices. Review the current choices and confirm again.</p></aside>}
      <section className={ui.task} aria-label="Review arrangements">
        <h2>You review completed work</h2>
        <p>You'll decide whether contributions meet your Blueprint, subject to verified permissions.</p>
        <h2>Rewards need separate approval</h2>
        <p>Any future payments require approval under your Yawrd's Project Rules.</p>
      </section>
      <fieldset disabled={busy || !view!.contributionCurrent}>
        <legend>Confirm work approval</legend>
        <label className={ui.review}><input type="checkbox" checked={confirmed} onChange={e => { setConfirmed(e.target.checked); setError(''); }}/>
          I understand and confirm these review arrangements.</label>
      </fieldset>
      <div className={ui.actions}>
        <button className={ui.primary} disabled={busy || !view!.contributionCurrent || !confirmed || current && !error} onClick={() => void run({ expectedRevision: view!.saved?.revision ?? 0, source: view!.source, confirmed: true })}>Confirm &amp; save</button>
        <p role="status">{busy ? 'Checking and saving…' : saved ? 'Saved. You can safely continue later.' : ''}</p>
        {error && <button disabled={busy} onClick={() => void run()}>Check saved settings</button>}
      </div>
      {saved && <p><a href={'/create/' + encodeURIComponent(creationId) + '/launch'}>Continue to launch</a></p>}
      <details className={ui.advanced}><summary>Advanced · Verified project and saved confirmation</summary>
        <p>This records your intended founder-led review arrangement. It grants no contribution-acceptance authority. Your permissions must be verified before work can be accepted; being a Steward does not automatically give someone permission to accept contributions.</p>
        <p>Accepting work does not promise or authorize payment. Any future reward requires separate approval and a separately verified payment from Project Funds. This confirmation does not change who can approve rewards.</p>
        <p className={ui.privacy}>Saving keeps work private, inactive and unassigned. It creates no applications, reward requests, payments or new account permissions.</p>
        <p>Verified founder: {view!.binding.founderAccountId}</p><p>Verified project account: {view!.binding.daoAccountId}</p>
        <p>These are saved deployment and payment verification bindings, not a fresh check of current DAO membership or policy. Existing DAO governance authorizes rewards; saving this page executes no DAO decision or treasury settlement.</p>
        <p>Contribution revision: {view!.source.contributionRevision} · Blueprint version: {view!.source.preparationRevision}</p>
        <pre>{JSON.stringify({ binding: view!.binding, source: view!.source, saved: view!.saved }, null, 2)}</pre>
        {!error && <button disabled={busy} onClick={() => void run()}>Check saved settings</button>}
      </details>
    </>}
  </main>;
}
