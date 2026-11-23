"use client";

import type { PrivateCreation } from '../../../src/creation/repository';
import { browserFounderSetup } from '../../../src/founder-setup';
import { FounderDashboard } from './founder-dashboard';
import styles from './setup.module.css';

export default function SetupClient({ accountId, creation, onSaved, onReviewIntake, onBack }: {
  accountId: string; creation: PrivateCreation | null; onSaved: (value: PrivateCreation) => void;
  onReviewIntake: () => void; onBack: () => void;
}) {
  let view;
  try {
    if (!creation || creation.founderAccountId !== accountId) throw new Error('No saved draft');
    view = browserFounderSetup(creation.intake, creation.founderAccountId);
  } catch {
    return <main className={styles.page}><div className={styles.container}>
      <p role="alert">A complete saved intake for this signed-in account is required. Return to intake to complete and save it.</p>
      <button onClick={onReviewIntake}>Review intake</button><button onClick={onBack}>Back to creation</button>
    </div></main>;
  }
  return <FounderDashboard view={view} creation={creation!} onSaved={onSaved} onReviewIntake={onReviewIntake} onBack={onBack} />;
}
