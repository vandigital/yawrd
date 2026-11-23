'use client';
import { useEffect, useRef, useState } from 'react';
import { useTestnetWallet } from '../../../use-testnet-wallet';
import { ACCOUNT_SESSION_CHANGED, openAccountDisclosure } from '../../../components/route-account-controls';
import { CreationJourney } from '../../creation-journey';
import { carryContributionConfiguration, initialContributionConfiguration, omittedContributionDependencies, sameContributionSource,
  validateContributionConfiguration, type ContributionConfiguration, type ContributionSource, type ContributionView } from '../../../../src/creation/contribution-configuration';
import ui from './contributions.module.css';

const messages: Record<string, string> = {
  sign_in_required: 'Sign in or renew using Account above to continue here. Your saved configuration stays private.',
  creation_session_changed: 'Your account changed. Private content was cleared. Use Account to sign in as the founder.',
  creation_not_found: 'This private configuration is unavailable for your signed-in account.',
  contribution_storage_required: 'Contribution storage is unavailable or awaits authorized Development installation. Saving is not available.',
  contribution_approval_required: 'Approve a saved Blueprint before configuring contributions.',
  contribution_source_changed: 'A different Blueprint version was approved. Your edits are retained below. Check the saved configuration, then explicitly review the newly approved version.',
  contribution_revision_conflict: 'Another tab saved newer settings. Your edits are retained below. Check the saved configuration when ready to replace these edits.',
  contribution_review_required: 'Review the tasks and acknowledge this approved Blueprint before saving.',
  invalid_contribution_configuration: 'Check your terms and explicitly acknowledge each unpaid choice before saving.',
};
class RequestError extends Error {
  constructor(readonly code: string) { super(messages[code] ?? 'The request could not be confirmed. Your edits are retained; check saved settings before trying again.'); }
}
export default function ContributionPanel({ creationId }: { creationId: string }) {
  const wallet = useTestnetWallet();
  const [view, setView] = useState<ContributionView | null>(null), [source, setSource] = useState<ContributionSource | null>(null);
  const [draft, setDraft] = useState<ContributionConfiguration | null>(null), [reviewed, setReviewed] = useState(false);
  const [loadedWallet, setLoadedWallet] = useState<string | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const epoch = useRef(0), live = useRef(true), locked = useRef(false), owner = useRef<string | null>(null);
  const active = useRef(new Set<AbortController>());
  function clear() {
    epoch.current++; active.current.forEach(c => c.abort()); active.current.clear(); locked.current = false; owner.current = null;
    setView(null); setSource(null); setDraft(null); setReviewed(false); setLoadedWallet(null); setError('');
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
      const response = await fetch('/api/creations/' + creationId + '/contributions', {
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
      const value = next as ContributionView;
      owner.current = accountId; setLoadedWallet(wallet.accountId); setView(value);
      setSource(value.saved?.source ?? value.approved);
      setDraft(value.saved?.configuration ?? initialContributionConfiguration(value.approved)); setReviewed(false);
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
  const visible = !!(view && source && draft && loadedWallet === wallet.accountId);
  const currentSource = !!(source && view && sameContributionSource(source, view.approved));
  const needsReview = !!(view && source && (!view.saved || !sameContributionSource(source, view.saved.source)));
  const dirty = !!(draft && view && (!view.saved || !source || !sameContributionSource(source, view.saved.source) || JSON.stringify(draft) !== JSON.stringify(view.saved.configuration)));
  let valid = false;
  if (draft && source) { try { validateContributionConfiguration(draft, source); valid = true; } catch { /* Incomplete edits remain local. */ } }
  const saved = visible && !!view?.saved && !dirty && !busy && !error;
  const warnings = draft && source ? omittedContributionDependencies(draft, source) : [];
  function editTask(taskId: string, fields: Partial<ContributionConfiguration['tasks'][number]>) {
    setDraft(previous => previous && ({ ...previous, tasks: previous.tasks.map(t => t.taskId === taskId ? { ...t, ...fields } : t) }));
    setError('');
  }
  function loadSaved() {
    if (dirty && !window.confirm('Replace your unsaved edits with the saved configuration?')) return;
    void run();
  }
  return <main className={ui.page}>
    <a href={'/create/' + encodeURIComponent(creationId) + '/blueprint'}>Back to Blueprint</a>
    {visible && <CreationJourney current={3} paidContinuation blueprintApproved/>}
    <header className={ui.heading}>
      <h1>Choose what gets built</h1>
      <p className={ui.lead}>Your Blueprint suggested these tasks. Keep the ones you want to include. You can change them before launching.</p>
      {visible && <div className={ui.project}><strong>{source!.title}</strong><span>✓ Approved Blueprint</span><span>Private draft</span></div>}
    </header>
    {error && <p role="alert">{error}</p>}
    {!visible ? <section><h2>{busy ? 'Opening your configuration…' : 'Access your configuration'}</h2>
      {!busy && <><p>Use Account to sign in as the founder. Saved settings remain with this Creation.</p>
        <button className={ui.primary} onClick={/sign.in|account/i.test(error) ? openAccountDisclosure : () => void run()}>{/sign.in|account/i.test(error) ? 'Sign in or renew with Account' : 'Check access again'}</button></>}
    </section> : <>
      {!currentSource && <aside className={ui.notice}><h2>A newer Blueprint is approved</h2><p>Your saved draft is preserved. Review the new tasks before carrying settings forward. Unpaid choices will need acknowledgement again.</p>
        <button disabled={busy} onClick={() => {
          setSource(view!.approved); setDraft(carryContributionConfiguration(draft!, view!.approved)); setReviewed(false); setError('');
        }}>Review newly approved Blueprint</button></aside>}
      <fieldset disabled={busy || !currentSource} className={ui.form}><legend>Choose tasks</legend>
        <p className={ui.count}>{draft!.tasks.filter(t => t.included).length} of {source!.tasks.length} tasks selected</p>
        <div className={ui.tasks}>{source!.tasks.map(task => {
          const settings = draft!.tasks.find(t => t.taskId === task.id)!;
          return <article key={task.id} className={ui.task}>
            <label className={ui.taskChoice}><input type="checkbox" aria-label={'Include ' + task.title + ' in this draft'} checked={settings.included} onChange={e => editTask(task.id, { included: e.target.checked })}/><span>{task.title}</span></label>
            <p className={ui.brief}>{task.brief}</p>
            <details className={ui.taskDetails}><summary>Task details &amp; optional rewards<span className={ui.srOnly}> for {task.title}</span></summary>
              <h3>What this task involves</h3><p>{task.brief}</p>
              <h3>Deliverables</h3><ul>{task.deliverables.map((d, i) => <li key={i}>{d}</li>)}</ul>
              <h3>Acceptance checks</h3><ul>{task.acceptanceCriteria.map((c, i) => <li key={i}>{c.check}<p>Evidence: {c.evidence}</p></li>)}</ul>
              <h3>Other work needed first</h3><p>{task.dependencies.map(id => source!.tasks.find(t => t.id === id)?.title ?? id).join(', ') || 'None declared'}</p>
              {!!task.unresolvedDecisions.length && <><h3>Open decisions</h3><ul>{task.unresolvedDecisions.map((d, i) => <li key={i}>{d}</li>)}</ul></>}
              <h3>Optional reward settings</h3>
              <p>Blueprint suggestion: {task.rewardTerms === 'unpaid' ? 'Unpaid work — requires your explicit choice here.' : 'Undecided.'} {task.rewardNote}</p>
              <label>Compensation for {task.title}<select value={settings.rewardTerms} onChange={e => editTask(task.id, { rewardTerms: e.target.value as 'undecided' | 'unpaid', unpaidAcknowledged: false })}>
                <option value="undecided">Undecided</option><option value="unpaid">Voluntary unpaid work</option>
              </select></label>
              {settings.rewardTerms === 'unpaid' && <label className={ui.acknowledgement}><input type="checkbox" checked={settings.unpaidAcknowledged} onChange={e => editTask(task.id, { unpaidAcknowledged: e.target.checked })}/>I explicitly choose voluntary unpaid work for {task.title}. No monetary reward is offered.</label>}
              <label>Draft reward notes for {task.title}<textarea maxLength={2000} value={settings.rewardNote} onChange={e => editTask(task.id, { rewardNote: e.target.value })}/></label>
            </details>
          </article>;
        })}</div>
        <label className={ui.notes}>Anything else contributors should know?<span className={ui.optional}>Optional</span><textarea rows={2} placeholder="Add instructions or participation details…" maxLength={4000} value={draft!.participationTerms} onChange={e => { setDraft({ ...draft!, participationTerms: e.target.value }); setError(''); }}/></label>
        {needsReview && <label className={ui.review}><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>I reviewed the selected tasks and draft terms for this approved Blueprint.</label>}
      </fieldset>
      {!!warnings.length && <details className={ui.notice}><summary>Some tasks need work you haven’t included ({warnings.length})</summary><p>You can save now and resolve these dependencies before launching.</p><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
      <div className={ui.actions}>
        <button className={ui.primary} disabled={busy || !currentSource || !dirty || !valid || needsReview && !reviewed} onClick={() => void run({ expectedRevision: view!.saved?.revision ?? 0,
          preparationRevision: source!.revision, preparationDigest: source!.digest, reviewedSource: reviewed, configuration: draft })}>Save draft</button>
        <p role="status">{busy ? 'Checking and saving…' : saved ? '✓ Saved. You can safely leave this page.' : dirty ? 'You have unsaved changes.' : 'Last saved draft shown.'}</p>
        {!valid && <p>Open task details and acknowledge each unpaid choice before saving.</p>}
        {error && <button disabled={busy} onClick={loadSaved}>Check saved configuration</button>}
      </div>
      {saved && currentSource && <p><a href={'/create/' + encodeURIComponent(creationId) + '/governance'}>Continue to work approval</a></p>}
      <p className={ui.privacy}>Saving keeps tasks private, inactive and unassigned. It does not publish your Yawrd or enable payouts.</p>
      <details className={ui.advanced}><summary>Advanced · Saved draft and source details</summary>
        <p>Creation: {view!.binding.creationId}</p><p>Approved source version: {source!.revision}</p><p>Source digest: {source!.digest}</p>
        {view!.saved && <p>Saved configuration revision: {view!.saved.revision} · Source version: {view!.saved.source.revision}</p>}
        <pre>{JSON.stringify({ configuration: draft, tasks: source!.tasks.map(t => ({ id: t.id, dependencies: t.dependencies, sharedReferences: t.sharedReferences })), references: source!.references }, null, 2)}</pre>
        {!error && <button disabled={busy} onClick={loadSaved}>Check saved configuration</button>}
      </details>
    </>}
  </main>;
}
