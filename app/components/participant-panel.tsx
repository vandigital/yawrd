'use client';

import { useRef, useState } from 'react';
import { useTestnetWallet } from '../use-testnet-wallet';
import type { IdentityChallenge } from '../../src/identity/types';
import type { ParticipantView } from '../../src/participants/types';

const button = 'rounded-full border border-[#79ada3]/50 bg-[#3d8c8a]/20 px-5 py-2.5 text-sm font-medium text-[#e7f2ed] transition hover:bg-[#3d8c8a]/35 disabled:cursor-not-allowed disabled:opacity-40';
const messages: Record<string, string> = {
  service_unavailable: 'Yawrd could not reach its verification or storage service. Please try again. Access has not been granted.',
  sign_in_required: 'Your sign-in has expired. Verify your wallet again to continue.',
  decision_conflict: 'This application already has a different final decision. Refresh to see the recorded result.',
  creator_only: 'Only the verified creator can review applications.',
  too_many_challenges: 'Too many sign-in attempts for this account. Wait a minute before trying again.',
};
async function request(url: string, data?: object) {
  const response = await fetch(url, { method: data ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', ...(data ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(messages[result.error] ?? 'The request could not complete. Refresh your status or prepare a new sign-in challenge.');
  return result;
}

export function ParticipantPanel({ projectId, initial }: { projectId: string; initial: ParticipantView }) {
  const wallet = useTestnetWallet();
  const [view, setView] = useState(initial);
  const [challenge, setChallenge] = useState<IdentityChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [introduction, setIntroduction] = useState('');
  const [consent, setConsent] = useState(false);
  const path = `/api/yawrd/${encodeURIComponent(projectId)}`;
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await work(); }
    catch (e) { setError(e instanceof Error ? e.message : 'The request could not complete. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh() { setView(await request(`${path}/state`)); }
  async function prepare() {
    setChallenge(null);
    const c = wallet.getContext();
    if (!c.accountId || c.network !== 'testnet') throw new Error('Connect Meteor and select a Testnet account first.');
    const data = await request('/api/auth/challenge', c);
    if (wallet.getContext().accountId !== c.accountId) throw new Error('Your selected account changed. Prepare a new challenge.');
    setChallenge(data.challenge);
  }
  async function sign() {
    const c = challenge;
    setChallenge(null);
    if (!c || wallet.getContext().accountId !== c.accountId || wallet.getContext().network !== 'testnet' || window.location.origin !== c.origin || Date.now() >= c.expiresAt) throw new Error('The challenge expired or your account changed. Prepare a new challenge.');
    let proof;
    try {
      proof = await wallet.signIdentity({ message: c.message, recipient: c.recipient, nonce: Uint8Array.from(atob(c.nonce), ch => ch.charCodeAt(0)), signerId: c.accountId, network: 'testnet' });
    } catch { throw new Error('Meteor message approval did not complete. Prepare a new challenge when ready.'); }
    if (wallet.getContext().accountId !== c.accountId || wallet.getContext().network !== 'testnet' || proof.accountId !== c.accountId) throw new Error('The wallet account changed. Prepare a new challenge.');
    await request('/api/auth/verify', { challengeId: c.id, accountId: c.accountId, network: 'testnet', proof: { accountId: proof.accountId, publicKey: proof.publicKey, signature: proof.signature } });
    await refresh();
  }
  return <section aria-labelledby="crew-title" className="mt-9 space-y-5 border-t border-white/10 pt-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="crew-title" className="text-xl font-medium tracking-tight text-white">Take part in this Yawrd</h2>
      <button className={button} disabled={busy} onClick={() => run(refresh)}>Refresh status</button>
    </div>
    <p className="text-sm leading-7 text-[#bed1c9]">Applications are reviewed by the creator. Approval unlocks participant information here. It does not grant GitHub access or a role in Project Rules, and offers no guaranteed rewards.</p>
    {error && <p role="alert" className="rounded-xl border border-[#d8a68d]/40 bg-[#d8a68d]/10 p-4 text-sm leading-6 text-[#f1c5af]">{error}</p>}
    {view.accountId ? <>
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#91b5aa]">
        <span>Verified: <span className="break-all">{view.accountId}</span> · Testnet · Sign-in lasts up to one hour</span>
        <button className={button} disabled={busy} onClick={() => run(async () => {
          await request('/api/auth/logout', {}); setChallenge(null);
          setView({ accountId: null, role: 'public', application: null, applications: [], restrictedContent: null });
          await refresh();
        })}>Sign out</button>
      </div>
      {view.role === 'creator' ? <div className="space-y-4">
        <h3 className="font-medium text-[#e7f2ed]">Review applications · Creator</h3>
        <p className="text-xs leading-6 text-[#91b5aa]">Decisions are final and record your verified account. Repeating the same decision is safe.</p>
        {view.applications.length === 0 && <p className="text-sm text-[#bed1c9]">No applications yet.</p>}
        {view.applications.map(a => <article key={a.id} className="space-y-3 rounded-2xl border border-white/10 bg-[#12201d] p-5">
          <p className="break-all text-sm font-medium text-[#e7f2ed]">{a.accountId}</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-7 text-[#bed1c9]">{a.introduction}</p>
          <p className="text-xs text-[#c2dedd]"><span className="capitalize">{a.status}</span>{a.reviewerAccountId && <span className="break-all"> · Reviewed by {a.reviewerAccountId}</span>}</p>
          {a.status === 'pending' && <div className="flex flex-wrap gap-3">
            <button className={button} disabled={busy} onClick={() => run(async () => { setView(await request(`${path}/review`, { applicationId: a.id, decision: 'approved' })); })}>Approve</button>
            <button className={button} disabled={busy} onClick={() => run(async () => { setView(await request(`${path}/review`, { applicationId: a.id, decision: 'rejected' })); })}>Reject</button>
          </div>}
        </article>)}
      </div> : view.application ? <div role="status" className="rounded-2xl border border-[#5b918c]/40 bg-[#3d8c8a]/10 p-5">
        <h3 className="font-medium text-[#e7f2ed]">{view.application.status === 'pending' ? 'Application pending' : view.application.status === 'approved' ? 'Application approved · Welcome to the Crew' : 'Application rejected'}</h3>
        <p className="mt-2 text-sm leading-7 text-[#bed1c9]">{view.application.status === 'pending' ? 'Your introduction has been saved. The creator will review it. Participant information stays locked until approval.' : view.application.status === 'approved' ? 'You can now view the participant information below.' : 'The creator reviewed your application and did not approve it. This decision is final; a second application is not available.'}</p>
        {view.application.reviewerAccountId && <p className="mt-2 break-all text-xs text-[#91b5aa]">Reviewed by {view.application.reviewerAccountId}</p>}
      </div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run(async () => { setView(await request(`${path}/apply`, { introduction, consent })); }); }}>
        <label className="block text-sm text-[#c2dedd]">A short introduction
          <textarea required maxLength={1000} rows={4} value={introduction} disabled={busy} onChange={e => setIntroduction(e.target.value)} className="mt-2 block w-full resize-y rounded-xl border border-[#5b918c]/40 bg-[#12201d] p-4 text-sm leading-6 text-[#e7f2ed]" placeholder="What brings you here, and how would you like to contribute?" />
        </label>
        <label className="flex items-start gap-3 text-xs leading-6 text-[#bed1c9]">
          <input required type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} className="mt-1.5 accent-[#79ada3]" />
          <span>I consent to storing my wallet account and introduction and sharing them with this Yawrd’s creator for review. I understand the decision is final and approval does not grant external access or guaranteed rewards.</span>
        </label>
        <button type="submit" className={button} disabled={busy || !consent || !introduction.trim()}>Apply to Join</button>
        <p className="text-xs leading-6 text-[#91b5aa]">Submitting an application costs no gas and sends no wallet transaction.</p>
      </form>}
    </> : <div className="space-y-4 rounded-2xl border border-white/10 bg-[#12201d] p-5">
      <h3 className="font-medium text-[#e7f2ed]">Apply to Join</h3>
      <p className="text-sm leading-7 text-[#bed1c9]">Verify your Meteor Testnet wallet to apply or review applications. Connecting alone does not sign you in.</p>
      <p className="text-xs leading-6 text-[#91b5aa]">Meteor will ask for explicit approval of an off-chain message. Signing costs no gas, sends no transaction and grants no permission to spend Project Funds.</p>
      <button className={button} disabled={busy || wallet.busy || !wallet.ready || !wallet.available} onClick={wallet.connect}>Connect Meteor</button>
      {wallet.accountId && <label className="block text-xs text-[#c2dedd]">Selected Testnet account
        <select value={wallet.accountId} disabled={busy || wallet.busy} onChange={e => { setChallenge(null); wallet.selectAccount(e.target.value); }} className="mt-2 block max-w-full rounded-lg border border-[#5b918c]/40 bg-[#162521] p-3 text-sm">
          {wallet.accountIds.map(id => <option key={id}>{id}</option>)}
        </select>
      </label>}
      {wallet.ready && !wallet.available && <p className="text-xs text-[#91b5aa]">Meteor is unavailable. You can still read the public project information.</p>}
      <button className={`${button} ml-2`} disabled={busy || wallet.busy || !wallet.accountId} onClick={() => run(prepare)}>Prepare sign-in message</button>
      {challenge && challenge.accountId === wallet.accountId && <div className="space-y-3">
        <pre className="whitespace-pre-wrap break-words rounded-xl border border-white/10 p-4 text-xs leading-6 text-[#bed1c9]">{challenge.message}</pre>
        <p className="text-xs text-[#91b5aa]">Recipient: {challenge.recipient} · One attempt · Expires in five minutes</p>
        <button className={button} disabled={busy || wallet.busy} onClick={() => run(sign)}>Approve sign-in message in Meteor</button>
      </div>}
    </div>}
    {(view.role === 'creator' || view.role === 'participant') && <section aria-labelledby="participant-info-title" className="rounded-2xl border border-[#79ada3]/40 bg-[#3d8c8a]/10 p-5">
      <p className="text-xs font-semibold text-[#91b5aa]">Crew Members · Approved access</p>
      <h3 id="participant-info-title" className="mt-2 text-lg font-medium text-[#e7f2ed]">Participant information</h3>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#bed1c9]">{view.restrictedContent ?? 'The creator has not added participant information yet.'}</p>
    </section>}
    {busy && <p role="status" className="text-xs text-[#c2dedd]">Saving or verifying… Please wait.</p>}
  </section>;
}
