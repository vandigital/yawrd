'use client';

import { useEffect, useRef, useState } from 'react';
import { ACK_CONSENT, REQUEST_CONSENT, SUBMISSION_RECIPIENT, type AckInput, type ContributionState, type ContributionTask, type RequestInput, type SignedRequestInput } from '../../src/contributions/types';
import type { IdentityChallenge } from '../../src/identity/types';
import type { useTestnetWallet } from '../use-testnet-wallet';
import { CONTRIBUTION_DESCRIPTION_LIMIT, contributionDescriptionError } from '../../src/contributions/validation';
import styles from './contribution-workspace.module.css';
import { RecipientRewardPaid } from './reward-payout';

const descriptionLimitLabel = CONTRIBUTION_DESCRIPTION_LIMIT.toLocaleString('en-US');
const messages: Record<string, string> = {
  contributions_inactive: 'Contribution submission and acknowledgement are not active yet.',
  sign_in_required: 'Your sign-in expired. Verify your wallet again.',
  task_owner_unconfirmed: 'Your assignment has not been confirmed. No request was saved.',
  task_owner_required: 'This task is assigned to a different approved wallet.',
  approved_participant_required: 'An approved participant account is required.',
  creator_only: 'Only the authenticated Yawrd creator can acknowledge prior acceptance.',
  recipient_must_match_session: 'The receiving wallet must match your verified account.',
  recipient_must_match_task_terms: 'The receiving wallet is fixed by the approved task terms. Use the assigned participant account.',
  event_conflict: 'A different record already exists. Refresh to review it; it cannot be overwritten.',
  submission_signature_required: 'Approve this contribution message in Meteor before submitting.',
  invalid_signature: 'The contribution signature could not be verified. Review and sign a fresh request.',
  unknown_challenge: 'This contribution challenge is unavailable or already used. Review and sign a fresh request.',
  expired_challenge: 'The contribution challenge expired. Review and sign a fresh request.',
  unauthorized_key: 'This signing key is not currently authorized for your Testnet account.',
  too_many_challenges: 'Too many signing attempts. Wait one minute before preparing another request.',
  invalid_description: `Use 1–${descriptionLimitLabel} characters in one paragraph. Remove whitespace at the beginning or end, line breaks, tabs and control characters.`,
};
type Actions = { onSubmit: (input: RequestInput) => Promise<void>; onAcknowledge: (input: AckInput) => Promise<void> };
type ContributionWallet = Pick<ReturnType<typeof useTestnetWallet>, 'getContext' | 'signIdentity'>;
type Command = SignedRequestInput | AckInput | { kind: 'challenge'; submission: RequestInput };
type Reply = ContributionState | { challenge: IdentityChallenge };

// The live form uses the same Meteor session as login. Kept here so the exact
// form -> HTTP -> wallet -> signed HTTP sequence can be exercised offline.
export async function signTaskBRequest(input: RequestInput, accountId: string, wallet: ContributionWallet,
  send: (data: Command, signal?: AbortSignal) => Promise<Reply>, origin: string, signal?: AbortSignal) {
  const checkAccount = () => {
    signal?.throwIfAborted();
    const context = wallet.getContext();
    if (context.accountId !== accountId || context.network !== 'testnet' || input.recipientAccountId !== accountId || input.taskRef !== 'task-b') {
      throw new Error('Select the assigned Testnet wallet in Meteor and sign in with that same account.');
    }
  };
  checkAccount();
  const descriptionError = contributionDescriptionError(input.description);
  if (descriptionError) throw new Error(descriptionError);
  const prepared = await send({ kind: 'challenge', submission: input }, signal);
  checkAccount();
  if (!('challenge' in prepared)) throw new Error('A contribution signing challenge was not returned.');
  const c = prepared.challenge;
  if (c.accountId !== accountId || c.network !== 'testnet' || c.origin !== origin || c.recipient !== SUBMISSION_RECIPIENT
    || Date.now() < c.issuedAt || Date.now() >= c.expiresAt) throw new Error('The contribution challenge expired or its context changed. Start again.');
  const nonce = Uint8Array.from(atob(c.nonce), ch => ch.charCodeAt(0));
  if (nonce.length !== 32) throw new Error('The contribution challenge could not be checked. Start again.');
  let proof;
  try {
    proof = await wallet.signIdentity({ message: c.message, recipient: c.recipient, nonce, signerId: accountId, network: 'testnet' });
  } catch { throw new Error('Meteor contribution message approval did not complete. Review and sign a fresh request when ready.'); }
  checkAccount();
  if (proof.accountId !== accountId || Date.now() >= c.expiresAt) throw new Error('The signing account changed or the challenge expired. Start again.');
  const result = await send({ ...input, challengeId: c.id, proof: { accountId: proof.accountId, publicKey: proof.publicKey, signature: proof.signature } }, signal);
  checkAccount();
  if ('challenge' in result || result.accountId !== accountId) throw new Error('Your verified account changed. Refresh the project before continuing.');
  return result;
}

function TaskCard({ task, accountId, creator, preview, onSubmit, onAcknowledge }: Actions & { task: ContributionTask; accountId: string; creator: boolean; preview: boolean }) {
  const [description, setDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [evidence, setEvidence] = useState('');
  const [historicalDate, setHistoricalDate] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const descriptionError = contributionDescriptionError(description);
  const showDescriptionError = descriptionTouched && descriptionError !== null;
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await work(); if (preview) setMessage('Preview validated. Nothing was saved; no request or acknowledgement was created.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'The request could not complete.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <article className={styles.card} aria-labelledby={`${task.ref}-title`}>
    <header className={styles.taskHeader}><div><p className={styles.eyebrow}>Completed contributor work</p><h3 id={`${task.ref}-title`}>{task.title}</h3></div>
      <span className={styles.badge}>{task.acknowledgement ? 'Prior acceptance acknowledged' : task.request ? 'Awaiting acknowledgement' : 'No in-app request'}</span></header>
    <a className={styles.evidence} href={task.prUrl} rel="noreferrer">Canonical GitHub evidence · PR #{task.ref === 'task-a' ? '2' : '4'}<span>{task.prUrl}</span></a>
    <p>{task.historicalNote}</p>
    {!creator && !preview && <RecipientRewardPaid accountId={accountId} task={task} />}
    {task.request ? <section className={styles.record} aria-label="Contribution request receipt">
      <h4>Request received{preview ? ' · Illustrative record' : ''}</h4>
      <p>{task.request.description}</p>
      <dl><div><dt>Submitted by</dt><dd>{task.request.actorAccountId}</dd></div><div><dt>Confirmed receiving wallet</dt><dd>{task.request.recipientAccountId}</dd></div><div><dt>In-app receipt time</dt><dd><time dateTime={task.request.recordedAt}>{task.request.recordedAt}</time></dd></div></dl>
    </section> : creator ? <p className={styles.record}>No participant request has been recorded. You can acknowledge prior founder approval without creating a submission.</p> : <form onSubmit={event => { event.preventDefault(); setDescriptionTouched(true); if (descriptionError) { setError(descriptionError); return; } if ((!preview && task.ref !== 'task-b') || !consent || !task.recipientAccountId || accountId !== task.recipientAccountId) return; void run(() => onSubmit({ kind: 'request', taskRef: task.ref, prUrl: task.prUrl, description, recipientAccountId: task.recipientAccountId!, consent: true, consentVersion: REQUEST_CONSENT })); }}>
      <p className={styles.notice}>1. Verify the assigned participant wallet to sign in. 2. Review this exact task, PR, description and fixed receiving wallet. 3. Explicitly sign the contribution submission with that same wallet using NEP-413. Login verification alone does not submit this work.</p>
      <label>Canonical GitHub PR<input value={task.prUrl} readOnly aria-readonly="true" /></label>
      <label>Brief contribution description<textarea required rows={4} value={description} disabled={busy}
        aria-invalid={showDescriptionError || undefined} aria-describedby={`${task.ref}-description-limit${showDescriptionError ? ` ${task.ref}-description-error` : ''}`}
        onBlur={() => setDescriptionTouched(true)} onChange={event => { setDescription(event.target.value); setDescriptionTouched(true); }}
        placeholder="Describe what you contributed and how the linked work meets this task." /></label>
      <p id={`${task.ref}-description-limit`} className={styles.small} aria-live="polite">{[...description].length.toLocaleString('en-US')} / {descriptionLimitLabel} characters. Use 1–{descriptionLimitLabel} characters in one paragraph.</p>
      {showDescriptionError && <p id={`${task.ref}-description-error`} role="alert" className={styles.error}>{descriptionError}</p>}
      <label>Receiving wallet · Fixed task terms<input value={task.recipientAccountId ?? 'Unconfirmed — submission unavailable'} readOnly aria-readonly="true" /></label>
      <label className={styles.check}><input type="checkbox" required checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>I confirm this is my receiving wallet and consent to sharing this request with the Yawrd’s creator. This does not establish a reward or authorize payment.</span></label>
      <button type="submit" disabled={(!preview && task.ref !== 'task-b') || busy || !consent || descriptionError !== null || !task.recipientAccountId || accountId !== task.recipientAccountId}>{busy ? 'Checking…' : preview ? 'Review submission draft' : task.ref === 'task-b' ? 'Sign and submit in Meteor' : 'Submission signing not active'}</button>
      <p className={styles.small}>The contribution signature is an off-chain wallet message: no gas, transaction or spending permission. {preview ? 'This preview does not open a wallet.' : 'Approve the exact contribution message in Meteor to submit this request. Cancelling creates no request.'}</p>
    </form>}
    {task.acknowledgement ? <section className={styles.record} aria-label="Founder acknowledgement receipt">
      <h4>Founder acknowledgement{preview ? ' · Illustrative record' : ''}</h4>
      <dl><div><dt>Historical acceptance</dt><dd>{task.acknowledgement.historicalAcceptedAt ?? (task.acknowledgement.historicalAcceptedOn ? `${task.acknowledgement.historicalAcceptedOn} · Date only` : 'Exact date and time unconfirmed')}</dd></div>
        <div><dt>New in-app acknowledgement time</dt><dd><time dateTime={task.acknowledgement.recordedAt}>{task.acknowledgement.recordedAt}</time></dd></div><div><dt>Acknowledged by</dt><dd>{task.acknowledgement.actorAccountId}</dd></div><div><dt>Prior approval evidence</dt><dd>{task.acknowledgement.evidence}</dd></div></dl>
    </section> : creator && <form onSubmit={event => { event.preventDefault(); void run(() => onAcknowledge({ kind: 'acknowledgement', taskRef: task.ref, prUrl: task.prUrl, evidence, historicalAcceptedOn: historicalDate || null, historicalAcceptedAt: null, consent: true, consentVersion: ACK_CONSENT })); }}>
      <h4>Acknowledge prior founder approval</h4>
      <label>Prior approval evidence or attestation<textarea required maxLength={2000} rows={3} value={evidence} disabled={busy} onChange={event => setEvidence(event.target.value)} placeholder="Reference the original founder approval. Do not include secrets or private evidence bodies." /></label>
      <label>Historical acceptance date · Optional<input type="date" value={historicalDate} disabled={busy} onChange={event => setHistoricalDate(event.target.value)} /></label>
      <p className={styles.small}>Leave blank when unconfirmed. A merge date is separate from founder acceptance; today’s acknowledgement does not replace either event.</p>
      <label className={styles.check}><input type="checkbox" required checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>I confirm I previously approved this work and have reviewed the original PR evidence. This records a new acknowledgement now; it approves no reward or payment.</span></label>
      <button type="submit" disabled={busy || !consent || !evidence.trim()}>{busy ? 'Checking…' : preview ? 'Preview acknowledgement' : 'Acknowledge prior approval'}</button>
    </form>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
  </article>;
}

export function ContributionExperience({ state, preview = false, onSubmit, onAcknowledge }: Actions & { state: ContributionState; preview?: boolean }) {
  return <section id="contributions" aria-labelledby="contributions-title" className={styles.workspace}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>{state.role === 'creator' ? 'Private founder review' : 'Your assigned work'}</p><h2 id="contributions-title">Contribution requests</h2></div>{preview && <span className={styles.badge}>Development Preview</span>}</header>
    <p>Record the work, preserve its history. Contribution acknowledgement does not authorize rewards, governance or payment.</p>
    {preview && <aside className={styles.notice}>Development only · The Task B assigned wallet and PR reflect approved terms; sample request records and receipt times are invented. No database, wallet signing or payment action occurs here.</aside>}
    {state.role === 'creator' && <p>{state.tasks.filter(task => task.request && !task.acknowledgement).length} request(s) awaiting acknowledgement. Prior approvals may also be acknowledged without a new request.</p>}
    {!state.tasks.length && <p className={styles.record}>No completed task is assigned to this verified wallet. Task ownership must be confirmed before you can submit.</p>}
    <div className={styles.grid}>{state.tasks.map(task => <TaskCard key={task.ref} task={task} accountId={state.accountId} creator={state.role === 'creator'} preview={preview} onSubmit={onSubmit} onAcknowledge={onAcknowledge} />)}</div>
  </section>;
}

export function ContributionWorkspace({ accountId, active, wallet, refreshVersion = 0 }: { accountId: string; active: boolean; wallet?: ContributionWallet; refreshVersion?: number }) {
  if (!active || !wallet) return <section className={styles.workspace} aria-label="Contribution workflow not active"><h2>Contribution requests · Not active</h2><p>First verify the assigned wallet to sign in, then review and explicitly sign the contribution submission. Login alone does not submit work. Submission signing and founder acknowledgement remain unavailable.</p><p className={styles.small}>The conditional Task B allocation does not approve payment or authorize private profile publication.</p></section>;
  return <LiveContributionWorkspace key={accountId} accountId={accountId} wallet={wallet} refreshVersion={refreshVersion} />;
}
function LiveContributionWorkspace({ accountId, wallet, refreshVersion }: { accountId: string; wallet: ContributionWallet; refreshVersion: number }) {
  const [state, setState] = useState<ContributionState | null>(null);
  const [error, setError] = useState('');
  const lifecycle = useRef<AbortController | null>(null);
  const path = '/api/yawrd/yaw-001/contributions';
  async function load(data?: Command, signal = lifecycle.current?.signal): Promise<Reply> {
    const response = await fetch(path, { method: data ? 'POST' : 'GET', signal, credentials: 'same-origin', cache: 'no-store', ...(data ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}) });
    const result = await response.json();
    if (!response.ok) { if (response.status === 401 || response.status === 403) setState(null); throw new Error(messages[result.error] ?? 'The request could not complete safely. Refresh your status before trying again.'); }
    if (!('challenge' in result) && result.accountId !== accountId) { setState(null); throw new Error('Your verified account changed. Refresh the project before continuing.'); }
    return result as Reply;
  }
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, [accountId]);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void load(undefined, controller.signal).then(value => { if (!controller.signal.aborted && !('challenge' in value)) setState(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
    // The parent keys this component by authenticated account. Never retain records on sign-out.
  }, [accountId, refreshVersion]);
  return <>{error && <p role="alert" className={styles.error}>{error}</p>}{state
    ? <ContributionExperience state={state} onSubmit={async input => { setState(await signTaskBRequest(input, accountId, wallet, load, window.location.origin, lifecycle.current?.signal)); }} onAcknowledge={async input => { const value = await load(input); if (!('challenge' in value)) setState(value); }} />
    : <p role="status" className={styles.workspace}>{error ? 'Contribution records are unavailable. Refresh the project or verify your wallet again.' : 'Loading private contribution records…'}</p>}</>;
}
