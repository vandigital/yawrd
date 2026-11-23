'use client';
import { useEffect, useState } from 'react';
import CreationAdmission, { useCreationAccount } from './creation-admission';
import CreationWorkspace from './creation-workspace';
import SavedCreations from './saved-creations';
import SecurityCreations from './security-creations';
import { openAccountDisclosure } from '../components/route-account-controls';
import { projectButton } from '../components/project-wallet-controls';
import { createEmptyYawrdIntakeDraft } from '../../src/yawrd-intake';
import { accountIntakeStore, saveIntakeDraft } from '../../src/yawrd-intake-storage';
import styles from './welcome.module.css';

export default function CreationWelcome({ initialIntake = false }: { initialIntake?: boolean }) {
  return <CreationAdmission><FounderWorkspace initialIntake={initialIntake}/></CreationAdmission>;
}

function FounderWorkspace({ initialIntake }: { initialIntake: boolean }) {
  const account = useCreationAccount()!;
  const [route, setRoute] = useState<{ mode: 'intake' | 'setup' | 'saved'; draftId: string | null; continuation: boolean } | null>(null);
  const [newlyStarted, setNewlyStarted] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setRoute({ mode: params.get('step') === 'setup' && !initialIntake ? 'setup' : 'intake', draftId: params.get('draft'),
      continuation: params.get('step') === 'intake' && !!params.get('draft') && params.get('returnTo') === 'preparation' });
  }, [account, initialIntake]);
  function enterIntake(fresh = false) {
    if (fresh) {
      try { saveIntakeDraft(accountIntakeStore(localStorage, account), createEmptyYawrdIntakeDraft(crypto.randomUUID(), new Date().toISOString())); }
      catch { setError('Browser storage is unavailable. Your existing draft has not been replaced. Continue it to review or export it.'); return; }
    }
    setNewlyStarted(fresh); setRoute({ mode: 'intake', draftId: null, continuation: false });
    window.history.replaceState(null, '', '/create?step=intake');
  }
  function resume(id: string) {
    setNewlyStarted(false); setRoute({ mode: 'setup', draftId: id, continuation: false });
    window.history.replaceState(null, '', '/create?step=setup&draft=' + encodeURIComponent(id));
  }
  function back() { setRoute({ mode: 'saved', draftId: null, continuation: false }); window.history.replaceState(null, '', '/create'); }
  if (!route) return <p role="status">Opening your project answers…</p>;
  if (route.mode !== 'saved') return <CreationWorkspace key={account + ':' + (route.draftId ?? 'browser')}
    accountId={account} draftId={route.draftId} initialSetup={route.mode === 'setup'} newlyStarted={newlyStarted}
    preparationContinuation={route.continuation} onBack={back}/>;
  return <main className={styles.page}><div className={styles.container}>
    <section className={styles.entry} aria-labelledby="saved-creations-title"><h1 id="saved-creations-title">Welcome back.</h1>
      <p className={styles.identity}>Signed in as {account}</p>
      <button className={projectButton} onClick={() => enterIntake(true)}>Start a new Yawrd →</button>
      <button className={projectButton} onClick={() => enterIntake()}>Continue browser draft</button>
      <SavedCreations accountId={account} onResume={resume}/>
      <SecurityCreations accountId={account}/>
      <p>Starting a new Yawrd replaces this browser draft. Continue it to export a copy first.</p>
      <button className={projectButton} onClick={openAccountDisclosure}>Account settings</button>
      {error && <p role="alert">{error}</p>}
    </section>
  </div></main>;
}
