"use client";

import { useEffect, useState } from 'react';
import type { PrivateCreation } from '../../src/creation/repository';
import { assessYawrdIntake } from '../../src/yawrd-intake';
import { readCreation } from './creation-api';
import IntakeClient from './intake/intake-client';
import SetupClient from './setup/setup-client';
import styles from './welcome.module.css';

export default function CreationWorkspace({ accountId, draftId, initialSetup, newlyStarted, preparationContinuation = false, onBack }: {
  accountId: string; draftId: string | null; initialSetup: boolean; newlyStarted: boolean; preparationContinuation?: boolean; onBack: () => void;
}) {
  const [creation, setCreation] = useState<PrivateCreation | null>(null);
  const [loading, setLoading] = useState(!!draftId);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [setup, setSetup] = useState(initialSetup);
  useEffect(() => {
    if (!draftId) return;
    let active = true;
    setLoading(true); setError('');
    readCreation(accountId, draftId).then(value => {
      if (!active) return;
      setCreation(value);
      if (!value.intake.projectName?.trim() || !assessYawrdIntake(value.intake.answers).complete) navigate(false, value);
    })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Your draft could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountId, draftId, attempt]);
  function navigate(toSetup: boolean, saved = creation) {
    setSetup(toSetup);
    window.history.replaceState(null, '', '/create?step=' + (toSetup ? 'setup' : 'intake') + (saved ? '&draft=' + saved.id : '') + (preparationContinuation ? '&returnTo=preparation' : ''));
  }
  function returnToPreparation() { if (draftId) window.location.assign('/create/' + encodeURIComponent(draftId) + '/blueprint'); }
  function saved(value: PrivateCreation) { setCreation(value); navigate(setup, value); }
  function bind(value: PrivateCreation) { setCreation(value); navigate(false,value); }
  function resumeSavedSetup(value: PrivateCreation) { setCreation(value); navigate(true,value); }
  if (loading || error) return <main className={styles.page}><div className={styles.container}>
    <p role={error ? 'alert' : 'status'}>{error || 'Loading your private saved draft…'}</p>
    {error && <button onClick={() => setAttempt(n => n + 1)}>Retry loading draft</button>}
    <button onClick={onBack}>Back to creation</button>
  </div></main>;
  if (setup) return <SetupClient accountId={accountId} creation={creation} onSaved={saved} onReviewIntake={() => navigate(false)} onBack={onBack} />;
  return <IntakeClient accountId={accountId} creation={creation} newlyStarted={newlyStarted} preparationContinuation={preparationContinuation} onSaved={saved} onBind={bind} onResumeSetup={resumeSavedSetup} onBack={preparationContinuation ? returnToPreparation : onBack} onContinueSetup={preparationContinuation ? returnToPreparation : () => navigate(true)} />;
}
