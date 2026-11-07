'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createTestnetRpc } from '../../src/creation-integration';
import { PAYOUT, PayoutChain, PayoutFlow, initialPayoutState, approvalCount, payoutStatus, validHash,
  type PayoutContext, type PayoutState, type PayoutEvidence, type PayoutSnapshot } from '../../src/rewards/payout';
import type { ContributionTask } from '../../src/contributions/types';
import type { useTestnetWallet } from '../use-testnet-wallet';
import { projectButton } from './project-wallet-controls';

const State = createContext<{ state: PayoutState; flow: PayoutFlow | null }>({ state: initialPayoutState, flow: null });
const link = 'break-all text-[#a9f1e9] underline underline-offset-4';
const transactionLink = (hash: string) => `https://testnet.nearblocks.io/txns/${encodeURIComponent(hash)}`;
export function verifiedPayoutTransferLink(snapshot: PayoutSnapshot | null): string | null {
  if (payoutStatus(snapshot) !== 'Paid' || !snapshot?.execution || !snapshot.transferReceipt) return null;
  return `${transactionLink(snapshot.execution.hash)}/execution#${encodeURIComponent(snapshot.transferReceipt)}`;
}

export function RewardPayoutProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<{ state: PayoutState; flow: PayoutFlow | null }>({ state: initialPayoutState, flow: null });
  useEffect(() => {
    let active = true;
    // Payout reads use the browser-compatible public Testnet endpoint.
    const rpc = createTestnetRpc((_url, options) => fetch('https://test.rpc.fastnear.com', options));
    // Store public attempt metadata before requesting wallet authorization.
    const flow = new PayoutFlow(new PayoutChain(rpc), {
      getItem: key => window.localStorage.getItem(key), setItem: (key, v) => window.localStorage.setItem(key, v),
      removeItem: key => window.localStorage.removeItem(key),
    }, state => { if (active) setValue({ state, flow }); });
    setValue({ state: flow.state, flow });
    const refresh = () => { if (document.visibilityState !== 'hidden') void flow.refresh(); };
    const hashes = new URL(window.location.href).searchParams.get('transactionHashes')?.split(',') ?? [];
    if (hashes.length === 1 && validHash(hashes[0]) && flow.state.attempt && ['awaiting', 'unknown'].includes(flow.state.attempt.phase)) {
      void flow.redirect(hashes[0]).catch(() => { void flow.refresh(); });
    } else refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { active = false; flow.stop(); window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return <State.Provider value={value}>{children}</State.Provider>;
}

/** Reuses the allocation entry in Project Identity; no additional reward card. */
export function RewardPayoutIdentity() {
  const { state } = useContext(State);
  const transferLink = verifiedPayoutTransferLink(state.snapshot);
  return <>
    <p className="mt-2">Reward Payout status: {state.error && !state.snapshot ? 'Unverified — refresh payout status' : payoutStatus(state.snapshot)}</p>
    <p className="mt-2">Payout Proposal: {state.snapshot?.proposal ? `#${state.snapshot.proposal.id} · ${approvalCount(state.snapshot.proposal)}/2 approvals` : state.snapshot && !state.snapshot.conflicts.length ? 'Not created' : 'Unverified'}</p>
    <p className="mt-2 text-[#b4cccb]">Two different Stewards must approve it before payment. This allocation is not payment approval.</p>
    {state.snapshot?.execution && <a className={link} href={transactionLink(state.snapshot.execution.hash)}>Verified final approval transaction · {state.snapshot.execution.hash} ↗</a>}
    {transferLink && <p className="mt-2"><a className={link} href={transferLink} target="_blank" rel="noopener noreferrer">View Payout Transfer ↗</a></p>}
  </>;
}

/** Only the authenticated assigned recipient's fixed Task B card uses this. */
export function RecipientRewardPaid({ accountId, task }: { accountId: string; task: ContributionTask }) {
  const { state } = useContext(State);
  const transferLink = verifiedPayoutTransferLink(state.snapshot);
  if (!transferLink || accountId !== PAYOUT.recipient || task.ref !== PAYOUT.taskRef
    || task.prUrl !== PAYOUT.prUrl || task.recipientAccountId !== PAYOUT.recipient) return null;
  return <div role="status" aria-label="Task B reward payment" className="mt-4 space-y-1 rounded-xl border border-[#79ada3]/40 bg-[#3d8c8a]/10 p-4 text-sm leading-6 text-[#e7f2ed]">
    <p className="font-medium">Reward Paid — 1 NEAR Testnet</p>
    <p>Recipient wallet · <span className="break-all font-mono">{PAYOUT.recipient}</span></p>
    <a className={link} href={transferLink} target="_blank" rel="noopener noreferrer">View your payout ↗</a>
  </div>;
}

export async function requestPayoutContext(): Promise<PayoutContext> {
  const response = await fetch('/api/yawrd/yaw-001/reward-payout', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Sign in with your Steward wallet and refresh. The recorded contribution acknowledgement could not be verified.');
  const value = await response.json();
  if (!PAYOUT.stewards.includes(value.accountId) || typeof value.acknowledged !== 'boolean'
    || !(value.acknowledgedAt === null || (typeof value.acknowledgedAt === 'string' && Number.isFinite(Date.parse(value.acknowledgedAt))))) throw new Error('Payout prerequisites could not be verified.');
  return value;
}

type Wallet = Pick<ReturnType<typeof useTestnetWallet>, 'accountId' | 'busy' | 'getContext' | 'signPayout'>;
export function RewardPayoutWorkspace({ accountId, wallet, refreshVersion = 0 }: { accountId: string | null; wallet: Wallet; refreshVersion?: number }) {
  const { state, flow } = useContext(State);
  const [context, setContext] = useState<PayoutContext | null>(null);
  const [error, setError] = useState('');
  const [hash, setHash] = useState('');
  const [signer, setSigner] = useState(PAYOUT.stewards[0]);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const current = useRef(accountId); current.current = accountId;
  useEffect(() => {
    let active = true; const revision = ++generation.current;
    setContext(null); setError(''); setChecking(false);
    if (accountId && PAYOUT.stewards.includes(accountId)) {
      void requestPayoutContext().then(c => { if (active && revision === generation.current && c.accountId === accountId) setContext(c); })
        .catch(() => { if (active) setError('Steward sign-in or contribution acknowledgement is unavailable. Refresh status.'); });
      void flow?.refresh();
    }
    return () => { active = false; generation.current++; };
  }, [accountId, wallet.accountId, refreshVersion, flow]);
  if (!accountId || !PAYOUT.stewards.includes(accountId)) return null;
  const proposal = state.snapshot?.proposal ?? null;
  const unresolved = state.attempt && ['awaiting', 'unknown'].includes(state.attempt.phase);
  const canAct = !!flow && !!context?.acknowledged && context.accountId === accountId && wallet.accountId === accountId
    && !wallet.busy && !state.busy && !checking && !state.error && !!state.snapshot && !state.snapshot.conflicts.length && !unresolved;
  const create = canAct && accountId === PAYOUT.creator && !proposal;
  const approve = canAct && proposal?.status === 'InProgress' && !Object.hasOwn(proposal.votes, accountId);
  async function submit(purpose: 'create' | 'approve') {
    const revision = generation.current, actor = accountId;
    await flow?.submit(purpose, wallet, async () => {
      const c = await requestPayoutContext();
      if (c.accountId !== actor) throw new Error('Signed-in wallet changed. Refresh and review again.');
      return c;
    }, () => current.current === actor && revision === generation.current);
  }
  async function refresh() {
    if (checking) return;
    const revision = generation.current, actor = accountId;
    setChecking(true); setContext(null); setError('');
    try {
      const c = await requestPayoutContext();
      if (revision !== generation.current || c.accountId !== actor) throw new Error();
      setContext(c);
      const evidence: PayoutEvidence[] = hash ? [{ hash: hash.trim(), signer }] : [];
      if (hash && !validHash(hash.trim())) throw new Error('Enter a valid Testnet transaction hash.');
      await flow?.refresh(evidence);
    } catch { if (revision === generation.current) setError('Verification could not complete. Check the selected Steward, sign-in and transaction hash, then refresh.'); }
    finally { if (revision === generation.current) setChecking(false); }
  }
  return <section id="reward-payout" aria-labelledby="reward-payout-title" className="mt-8 space-y-5 rounded-[20px] border border-[#377b78] bg-[#001e20] p-5 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="reward-payout-title" className="text-2xl font-medium text-white">Reward Payout</h2>
      <button className={projectButton} disabled={state.busy || checking} onClick={() => { void refresh(); }}>Refresh payout status</button>
    </div>
    <p className="text-sm leading-7 text-[#bed1c9]">Task B · {PAYOUT.amountLabel} to <span className="break-all font-mono">{PAYOUT.recipient}</span> from <span className="break-all font-mono">{PAYOUT.daoAccountId}</span>.</p>
    <p className="text-sm text-[#c2dedd]">Contribution acknowledgement: {context?.acknowledged ? `Recorded by ${PAYOUT.creator}${context.acknowledgedAt ? ` · ${context.acknowledgedAt}` : ''}` : 'Not yet verified in this session'}</p>
    <p className="text-sm text-[#e7f2ed]" role="status">Reward Payout status: {payoutStatus(state.snapshot)}</p>
    <p className="text-xs leading-6 text-[#b4cccb]">Fixed NEAR Transfer Payout Proposal · Proposal bond: 0 NEAR. Two distinct Steward approval votes are required. Creating a proposal records no approval vote. Each action opens Meteor separately and costs Testnet network fees. The final approval can execute the 1 NEAR transfer from Project Funds.</p>
    <p className="text-xs leading-6"><a className={link} href={PAYOUT.prUrl}>Merged contribution · PR #4 ↗</a><br /><a className={link} href={`https://github.com/vandigital/yawrd-build-progress/commit/${PAYOUT.merge}`}>Merge {PAYOUT.merge} ↗</a></p>
    <ul className="space-y-2 text-sm text-[#bed1c9]">{PAYOUT.stewards.map(s => <li key={s}><span className="break-all font-mono">{s}</span> · {proposal ? proposal.votes[s] ?? 'No vote recorded' : state.snapshot && !state.snapshot.conflicts.length ? 'No proposal' : 'Unverified'}</li>)}</ul>
    <p className="text-sm text-[#c2dedd]">Payout Proposal: {proposal ? `#${proposal.id} · ${proposal.status} · ${approvalCount(proposal)}/2 approvals` : state.snapshot && !state.snapshot.conflicts.length ? 'Not created · 0/2 approvals' : 'Unverified'}</p>
    {proposal && <a className={link} href={`https://testnet.nearblocks.io/address/${PAYOUT.daoAccountId}#contract`}>Project contract · get_proposal({proposal.id}) ↗</a>}
    {state.snapshot?.conflicts.length ? <p role="alert">Existing transfer proposals need review: {state.snapshot.conflicts.join(', ')}. No new proposal or vote is offered.</p> : null}
    {state.snapshot?.evidenceNote && <p className="text-xs leading-6 text-[#f1c5af]">{state.snapshot.evidenceNote}</p>}
    {state.attempt?.hash && <p><a className={link} href={transactionLink(state.attempt.hash)}>Last wallet transaction · {state.attempt.hash} ↗</a></p>}
    {state.snapshot?.execution && <p><a className={link} href={transactionLink(state.snapshot.execution.hash)}>Verified transfer execution ↗</a><span className="block break-all text-xs text-[#b4cccb]">Transfer receipt: {state.snapshot.transferReceipt}</span></p>}
    {unresolved && <p role="alert" className="text-sm text-[#f1c5af]">A wallet request is awaiting reconciliation. Do not create another proposal or vote. Refresh status; if needed, use its transaction hash below.</p>}
    {(error || state.error) && <p role="alert" className="text-sm text-[#f1c5af]">{error || state.error}</p>}
    {wallet.accountId !== accountId && <p className="text-sm text-[#f1c5af]">Connect the same Steward wallet as your verified sign-in before authorizing a transaction.</p>}
    <div className="flex flex-wrap gap-3">
      {create && <button className={projectButton} onClick={() => { void submit('create'); }}>Create Payout Proposal in Meteor</button>}
      {approve && <button className={projectButton} onClick={() => { void submit('approve'); }}>Approve Payout Proposal in Meteor</button>}
      {proposal && Object.hasOwn(proposal.votes, accountId) && <p className="text-sm text-[#bed1c9]">This Steward’s vote is already recorded. No further vote is offered.</p>}
    </div>
    <details className="text-xs leading-6 text-[#b4cccb]"><summary className="cursor-pointer">Verify transaction evidence after a redirect or uncertain outcome</summary>
      <p className="mt-3">This checks public Testnet receipts. It never sends another transaction. Use the execution transaction from the final Steward’s wallet if automatic history recovery is unavailable.</p>
      <label className="mt-3 block">Transaction hash<input className="mt-1 block w-full rounded-lg border border-[#416b66] bg-[#001b1d] p-3" value={hash} onChange={e => setHash(e.target.value)} /></label>
      <label className="mt-3 block">Signing Steward<select className="ml-2 rounded-lg bg-[#001b1d] p-2" value={signer} onChange={e => setSigner(e.target.value)}>{PAYOUT.stewards.map(s => <option key={s}>{s}</option>)}</select></label>
      <button className={projectButton} disabled={state.busy || checking || !hash.trim()} onClick={() => { void refresh(); }}>Verify transaction evidence</button>
    </details>
  </section>;
}
