import type { ReactNode } from 'react';
import type { ParticipantView } from '../../src/participants/types';
import type { useTestnetWallet } from '../use-testnet-wallet';
import { BuoyMark, YawrdBrandIcon } from './buoy-mark';

export const projectButton = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[#51afa7] bg-[#001b1d] px-4 py-2.5 text-xs! font-medium! text-[#e0ece9] transition-colors hover:border-[#a9f1e9] hover:bg-[#0b3838] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a6f7ec] disabled:cursor-not-allowed disabled:opacity-50';

export function ProjectHeader({ genesis = false, children }: { genesis?: boolean; children?: ReactNode }) {
  return <header className="mb-6 flex min-h-[88px] flex-wrap items-center justify-between gap-4 border-b border-[#377b78]/40 py-4 sm:mb-8 sm:min-h-[104px]">
    <a href="/" aria-label="Yawrd home" className="flex shrink-0 items-center gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a6f7ec]">
      {genesis ? <YawrdBrandIcon className="h-[37px] w-[30px] mix-blend-screen sm:h-[49px] sm:w-10" /> : <BuoyMark className="size-9" />}
      <span className="text-[22px] font-semibold tracking-[-0.06em]">yawrd<span className="text-[#73aaa5]">.</span></span>
    </a>
    {children}
  </header>;
}

type Wallet = Pick<ReturnType<typeof useTestnetWallet>, 'accountId' | 'accountIds' | 'ready' | 'available' | 'busy' | 'error' | 'connect' | 'disconnect'>;
export function ProjectWalletControls({ wallet, view, busy, onPrepare, onSignOut, onSelect, children }: {
  wallet: Wallet; view: ParticipantView; busy: boolean;
  onPrepare: () => void; onSignOut: () => void; onSelect: (id: string) => void; children?: ReactNode;
}) {
  return <section id="project-wallet" aria-label="Wallet connection and sign-in" tabIndex={-1} className="ml-auto min-w-0 max-w-full scroll-mt-4 text-right sm:max-w-lg">
    <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
      <span className="rounded-full border border-[#3d8c8a]/50 bg-[#3d8c8a]/10 px-3 py-2 text-[10px] font-semibold text-[#c2dedd]">Testnet · Project space</span>
      {wallet.accountId ? <button type="button" className={projectButton} disabled={busy || wallet.busy} onClick={wallet.disconnect}>Disconnect Meteor</button>
        : <button type="button" className={projectButton} disabled={busy || !wallet.ready || !wallet.available || wallet.busy} onClick={wallet.connect}>{!wallet.ready ? 'Preparing wallet…' : wallet.busy ? 'Connecting…' : 'Connect Meteor'}</button>}
      {view.accountId ? <button type="button" className={projectButton} disabled={busy || wallet.busy} onClick={onSignOut}>Sign out</button>
        : <button type="button" className={projectButton} disabled={busy || wallet.busy || !wallet.accountId} onClick={onPrepare}>Prepare sign-in message</button>}
    </div>
    <div className="mt-3 space-y-1 text-xs leading-6 text-[#b4cccb]" aria-live="polite">
      {wallet.accountId ? <>
        <p className="break-all">Meteor connected · <span className="font-mono text-[#e0ece9]">{wallet.accountId}</span></p>
        {wallet.accountIds.length > 1 && <label className="block">Selected Testnet account
          <select value={wallet.accountId} disabled={busy || wallet.busy} onChange={e => onSelect(e.target.value)} className="ml-2 max-w-full rounded-lg border border-[#416b66] bg-[#001b1d] p-2 text-xs">
            {wallet.accountIds.map(id => <option key={id}>{id}</option>)}
          </select>
        </label>}
      </> : <p>Wallet {wallet.ready ? 'disconnected' : 'connection loading'} · Connecting alone does not sign you in.</p>}
      {view.accountId ? <>
        <p className="break-all text-[#8fe5d9]">NEP-413 verified · {view.accountId} · {view.role === 'creator' ? 'Creator' : view.role === 'participant' ? 'Crew Member' : 'Signed in'}</p>
        <p>Sign-in lasts up to one hour. Disconnecting keeps it active.</p>
        {wallet.accountId && wallet.accountId !== view.accountId && <p className="text-[#f1c5af]">Your connected wallet differs from your verified account. Sign out to verify another account.</p>}
      </> : wallet.accountId ? <p>Not signed in · Verify an off-chain message to apply or review.</p> : null}
      {wallet.ready && !wallet.available && <p>Meteor is unavailable. Public project information remains available.</p>}
      {wallet.error && <p role="alert" className="text-[#f1c5af]">{wallet.error}</p>}
    </div>
    {view.accountId && <a href="#crew-title" className="mt-2 inline-flex min-h-9 items-center rounded-sm text-xs text-[#a9f1e9] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">{view.role === 'creator' ? 'Review applications ↓' : 'Your participation ↓'}</a>}
    {children}
  </section>;
}
