'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import AccountAuthentication from '../components/account-authentication';
import { ACCOUNT_SESSION_CHANGED } from '../components/route-account-controls';
import { useTestnetWallet } from '../use-testnet-wallet';
import SecurityCreations from './security-creations';
import styles from './welcome.module.css';

const CreationAccount = createContext<string | null>(null);
export function useCreationAccount() { return useContext(CreationAccount); }
type Admission = { accountId: string | null; admitted: boolean; expiresAt: number | null; securityAvailable?: boolean };

/** One gate across Creation routes, reusing the existing NEP-413 sign-in UI. */
export default function CreationAdmission({ children }: { children: ReactNode }) {
  const parent = useCreationAccount();
  const pathname = usePathname();
  // Saved second Stewards keep their existing security-only page and API checks.
  if (parent || /^\/create\/yawrd-[a-z2-7]{12}\/secure\/?$/.test(pathname)) return children;
  return <AdmissionCheck>{children}</AdmissionCheck>;
}

function AdmissionCheck({ children }: { children: ReactNode }) {
  const wallet = useTestnetWallet();
  const [session, setSession] = useState<Admission | null>(null);
  const [checking, setChecking] = useState(true), [error, setError] = useState('');
  const epoch = useRef(0), pending = useRef<AbortController | null>(null);
  const mismatch = !!session?.accountId && !!wallet.accountId &&
    (wallet.accountId !== session.accountId || wallet.getContext().network !== 'testnet');
  async function refresh(clear = false) {
    const version = ++epoch.current;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    if (clear) setSession(null);
    setChecking(true); setError('');
    try {
      const response = await fetch('/api/creations/admission', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw Error('unavailable');
      const value: Admission = await response.json();
      if (version !== epoch.current) return;
      if (value.accountId !== null && (typeof value.accountId !== 'string' || !Number.isFinite(value.expiresAt))) throw Error('invalid_session');
      setSession(value.accountId && value.expiresAt! > Date.now() ? value : { accountId: null, admitted: false, expiresAt: null });
    } catch {
      if (version === epoch.current) { setSession(null); setError('Your sign-in could not be checked. Please try again.'); }
    } finally { if (version === epoch.current) setChecking(false); }
  }
  useEffect(() => {
    void refresh();
    const focus = () => { void refresh(); };
    const changed = () => { void refresh(true); };
    window.addEventListener('focus', focus); window.addEventListener(ACCOUNT_SESSION_CHANGED, changed);
    return () => { epoch.current++; pending.current?.abort(); window.removeEventListener('focus', focus); window.removeEventListener(ACCOUNT_SESSION_CHANGED, changed); };
  }, []);
  useEffect(() => { if (wallet.ready) void refresh(); }, [wallet.accountId, wallet.ready]);
  useEffect(() => {
    if (!session?.expiresAt) return;
    const timer = setTimeout(() => { void refresh(true); }, Math.max(0, session.expiresAt - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [session?.expiresAt]);

  if (session?.accountId && session.admitted === true && !mismatch) return <>
    {checking && <p role="status">Checking your sign-in…</p>}
    {/* Hide and suspend interaction during refresh without discarding unsaved edits. */}
    <div hidden={checking} inert={checking} aria-busy={checking}>
      <CreationAccount.Provider value={session.accountId}>{children}</CreationAccount.Provider>
    </div>
  </>;
  return <main className={styles.page}><div className={styles.container}>
    <section className={styles.admission} aria-labelledby="creation-admission-title">
      <p className={styles.eyebrow}>Open a Yawrd · Testnet</p>
      {checking ? <><h1 id="creation-admission-title">Opening Creation</h1><p role="status">Checking your sign-in…</p></>
        : error ? <><h1 id="creation-admission-title">Check your sign-in</h1><p role="alert">{error}</p><button onClick={() => void refresh()}>Try again</button></>
        : mismatch ? <><h1 id="creation-admission-title">Check your selected account</h1><p>Your connected wallet differs from your verified sign-in. Sign in with the selected account to continue.</p><AccountAuthentication /></>
        : session?.accountId ? <><h1 id="creation-admission-title">Opening a Yawrd is currently invite-only.</h1><a className={styles.explore} href="/#discover">Explore Yawrds</a>
          {session.securityAvailable === true && <SecurityCreations accountId={session.accountId}/>}</>
        : <><h1 id="creation-admission-title">Sign in to open a Yawrd</h1><p>Use your NEAR Testnet wallet. After verified sign-in, you’ll return here automatically.</p><AccountAuthentication /></>}
    </section>
  </div></main>;
}
