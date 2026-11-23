import { useRef, useState } from 'react';
import type { PrivateCreation } from '../../../src/creation/repository';
import { saveCreationConfiguration } from '../creation-api';
import { reviewFounderConfiguration, type FounderConfiguration, type FounderSetupView } from '../../../src/founder-setup';
import DeploymentReview from './deployment-review';
import { INTAKE_LABELS } from '../../../src/creation-intake';
import { CreationJourney } from '../creation-journey';
import styles from './setup.module.css';

type Section = 0 | 1 | 2 | 3;
const titles = ['Your project', 'Public project details', 'Set up your Yawrd account', 'Setup costs and next steps'] as const;
const publicFields = ['publicName', 'publicDescription'] as const;
const accountFields = ['secondSteward', 'threshold'] as const;
function complete(section: Section, config: FounderConfiguration) {
  if (section === 0) return true;
  if (section === 1) return !!config.publicName.trim() && !!config.publicDescription.trim();
  if (section === 2) return !!config.secondSteward;
  return false;
}

export function FounderDashboard({ view, creation, onSaved, onReviewIntake, onBack }: {
  view: FounderSetupView; creation: PrivateCreation; onSaved: (value: PrivateCreation) => void; onReviewIntake: () => void; onBack: () => void;
}) {
  const [config, setConfig] = useState<FounderConfiguration>(() => creation.configuration);
  const [textReviewed, setTextReviewed] = useState(false);
  const [review, setReview] = useState<ReturnType<typeof reviewFounderConfiguration> | null>(null);
  const [error, setError] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [deploymentRecorded, setDeploymentRecorded] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const initialSection = !complete(1, creation.configuration) ? 1 : !complete(2, creation.configuration) ? 2 : 3;
  const [openSections, setOpenSections] = useState<Section[]>([initialSection]);
  const activeSection = useRef<Section>(initialSection);
  const saveLock = useRef(false);
  const changed = (section: Section) => (section === 1 ? publicFields : section === 2 ? accountFields : []).some(field => config[field] !== creation.configuration[field]);
  const unsaved = changed(1) || changed(2);
  function toggle(section: Section, open: boolean) {
    if (open) activeSection.current = section;
    setOpenSections(previous => open
      ? previous.includes(section) ? previous : [...previous, section]
      : previous.includes(section) ? previous.filter(value => value !== section) : previous);
  }
  async function save() {
    if (saveLock.current) return;
    saveLock.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const saved = await saveCreationConfiguration(view.founder, creation, config);
      onSaved(saved);
      // Keep the current section open. Other saved sections stay available in
      // their summaries; their form controls remain mounted when collapsed.
      setOpenSections(previous => [...new Set([...previous.filter(section => !complete(section, saved.configuration)), activeSection.current])]);
      setMessage('Your changes are saved privately. You can return after signing in again. Nothing is published.');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Your changes could not be saved. Please try again.'); }
    finally { saveLock.current = false; setSaving(false); }
  }
  function edit(values: Partial<FounderConfiguration>) {
    setConfig(previous => ({ ...previous, ...values })); setReview(null); setError(''); setMessage('');
    if ('publicName' in values || 'publicDescription' in values) setTextReviewed(false);
  }
  function summary(section: Section) {
    const status = section === 3 ? 'Review costs' : changed(section) ? 'Unsaved changes' : complete(section, creation.configuration) ? 'Saved' : 'To do';
    return <summary id={'setup-section-title-' + section}>
      <span className={styles.sectionNumber} aria-hidden="true">{status === 'Saved' ? '✓' : section + 1}</span>
      <h2>{titles[section]}</h2><span className={status === 'Saved' ? styles.savedBadge : styles.badge}>{status}</span>
      <span className={styles.chevron} aria-hidden="true">⌄</span>
    </summary>;
  }
  return <main className={styles.page}><div className={styles.container}>
    <CreationJourney current={2} />
    <header className={styles.heading}><div><p className={styles.eyebrow}>Prepare your Yawrd · Testnet</p>
      <h1>Set up your Yawrd</h1><p className={styles.project}>{view.name}</p><p className={styles.account}>Signed in as {view.founder}</p>
    </div><img src="/brand/yawrd-buoy.webp" width="159" height="192" alt="Bob, the Yawrd buoy mascot" /></header>
    <div className={styles.statuses} aria-label="Yawrd status"><span>Private draft</span><span>{deploymentRecorded ? 'Account verified · security review' : 'Account not verified'}</span><span>Platform fee · separate review</span><span>Not published</span></div>
    <aside className={styles.notice}><strong>Your draft is private.</strong><p>Work through the sections below. Save your changes before leaving. Saved details can be loaded after you sign in again. Saving does not create your Yawrd account, approve public text, or publish anything.</p></aside>
    <fieldset disabled={saving} className={styles.fields}><legend className="sr-only">Yawrd setup</legend>
      <div id="setup-sections" className={styles.sections} aria-label="Setup sections">
        <details id="setup-project" className={styles.section} open={openSections.includes(0)} onToggle={e => toggle(0, e.currentTarget.open)}>
          {summary(0)}<div className={styles.sectionBody}>
            <p>Your answers are saved in your private draft. You can review or change them in the project questions.</p>
            <dl><dt>Project name</dt><dd>{view.name}</dd><dt>Project type</dt><dd>{INTAKE_LABELS[view.intake.answers.projectType ?? '']}</dd><dt>Planned budget</dt><dd>{INTAKE_LABELS[view.intake.answers.intendedBudget ?? '']}</dd></dl>
            <h3>Your first result</h3><p className={styles.words}>{view.intake.answers.successCriteria}</p>
            <h3>Your project description</h3><p className={styles.words}>{view.intake.answers.founderDescription}</p>
            <button onClick={onReviewIntake}>Review project answers</button>
          </div>
        </details>
        <details id="setup-public" className={styles.section} open={openSections.includes(1)} onToggle={e => toggle(1, e.currentTarget.open)}>
          {summary(1)}<div className={styles.sectionBody}>
            <p>Write a name and short description that you may want to share later. These details stay private until a separate review and publication step. Your private project description is not copied here.</p>
            <label htmlFor="setup-name">Public project name</label><input id="setup-name" maxLength={120} value={config.publicName} aria-describedby="setup-name-help" onChange={e => edit({ publicName: e.target.value })} />
            <p id="setup-name-help" className={styles.help}>The name people would see if you later publish your Yawrd. Up to 120 characters.</p>
            <label htmlFor="setup-description">Public project description</label><textarea id="setup-description" maxLength={2000} rows={5} value={config.publicDescription} aria-describedby="setup-description-help" onChange={e => edit({ publicDescription: e.target.value })} />
            <p id="setup-description-help" className={styles.help}>Explain the project in a few sentences. Leave out anything private. Up to 2,000 characters.</p>
            <label className={styles.confirm}><input id="setup-public-consent" type="checkbox" checked={textReviewed} onChange={e => { setTextReviewed(e.target.checked); setReview(null); }} />I have checked this name and description for possible public use. This check does not publish them or save approval.</label>
          </div>
        </details>
        <details id="setup-account" className={styles.section} open={openSections.includes(2)} onToggle={e => toggle(2, e.currentTarget.open)}>
          {summary(2)}<div className={styles.sectionBody}>
            <p>Choose a human-readable project name in Public project details above, then choose the two people who will approve project decisions. The account identifier is generated separately.</p>
            <label htmlFor="setup-dao-identifier">Generated account identifier</label><input id="setup-dao-identifier" value={identifier} placeholder="Reserved when you prepare deployment" readOnly aria-describedby="setup-identifier-help" />
            <p id="setup-identifier-help" className={styles.help}>The app reserves exactly 12 random lowercase letters or numbers when you prepare deployment below. The identifier is saved to your Creation and reused across sessions and retries. It is separate from the project name you choose. {identifier ? 'Future account address: '+identifier+'.factory.yawrd.testnet. ' : ''}Reservation alone does not create an account on Testnet.</p>
            {config.accountLabel && <details><summary>Earlier account label — kept for reference</summary><label htmlFor="setup-label">Historical saved label</label><input id="setup-label" value={config.accountLabel} readOnly /><p>This earlier value is preserved exactly. It is not your generated account identifier or your project display name.</p></details>}
            <h3>Who approves project decisions?</h3>
            <p>Stewards are the people who approve decisions under your Project Rules. This Testnet setup uses two different Stewards.</p>
            <label htmlFor="setup-first-steward">First Steward — you</label><input id="setup-first-steward" value={view.founder} readOnly aria-describedby="setup-first-help" />
            <p id="setup-first-help" className={styles.help}>Your signed-in account is the First Steward.</p>
            <label htmlFor="setup-steward">Second Steward’s Testnet account</label><input id="setup-steward" maxLength={64} value={config.secondSteward} placeholder="neighbor.testnet" autoCapitalize="none" spellCheck={false} aria-describedby="setup-steward-help" onChange={e => edit({ secondSteward: e.target.value })} />
            <p id="setup-steward-help" className={styles.help}>Enter another person’s named account ending in .testnet. It must be different from yours. We have not checked whether this account exists.</p>
            <label htmlFor="setup-threshold">Approvals needed for a project decision</label><select id="setup-threshold" value={config.threshold} aria-describedby="setup-threshold-help" onChange={e => edit({ threshold: Number(e.target.value) })}><option value={2}>Both Stewards must approve (2 of 2)</option></select>
            <p id="setup-threshold-help" className={styles.help}>Both you and the Second Steward must approve. One person cannot approve alone. These Project Rules have not been set up on the network yet.</p>
            <button onClick={() => { try { setReview(reviewFounderConfiguration(config, view.founder, textReviewed, identifier || null)); setError(''); } catch (e) { setReview(null); setError(e instanceof Error ? e.message : 'Please check your setup details.'); } }}>Check setup details</button>
            <p className={styles.help}>This checks your entries on this page. It does not save changes, approve public text, create an account, or send a wallet transaction.</p>
            {review && <section className={styles.review} aria-label="Setup review">
              <h3>Your setup review</h3><p role="status">Entries checked on this page. {unsaved ? 'Save changes to keep your edits.' : 'These entries are saved in your private draft.'} Nothing is published.</p>
              <dl><dt>Public project name</dt><dd>{review.publicName}</dd><dt>Public project description</dt><dd className={styles.words}>{review.publicDescription}</dd>
                <dt>Generated account identifier</dt><dd>{review.accountLabel ?? 'Reserved when you prepare deployment'}</dd><dt>Stewards</dt><dd>{review.stewards.join(' · ')}</dd><dt>Approvals needed</dt><dd>Both Stewards (2 of 2)</dd></dl>
            </section>}
          </div>
        </details>
        <details id="setup-costs" className={styles.section} open={openSections.includes(3)} onToggle={e => toggle(3, e.currentTarget.open)}>
          {summary(3)}<div className={styles.sectionBody}>
            <DeploymentReview creation={creation} disabled={unsaved} onIdentifier={setIdentifier} onRecorded={setDeploymentRecorded} />
            <h3>After account setup and payment</h3><p>Your Blueprint will describe the project plan. The Skill will guide AI work. Generation requires confirmed account setup and platform payment. Blueprint generation and launch remain unavailable.</p>
            <div className={styles.unavailable}><button disabled>Generate Blueprint and Skill — unavailable</button><button disabled>Launch Yawrd — unavailable</button></div>
          </div>
        </details>
      </div>
    </fieldset>
    <div className={styles.saveBar}>
      <div><p role="status" aria-live="polite" className={styles.saveState}>{saving ? 'Saving your changes…' : unsaved ? 'You have unsaved changes.' : 'All changes are saved in your private draft.'}</p>
        <p className={styles.help}>Save keeps your public details and account setup together. It does not publish or launch your Yawrd.</p></div>
      <button className={styles.primary} onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
    </div>
    {message && <p role="status" className={styles.savedMessage}>{message}</p>}
    {error && <p role="alert" className={styles.attention}>{error}</p>}
    <nav className={styles.footer} aria-label="Setup navigation"><button disabled={saving} onClick={onBack}>Back to creation</button>
      <button disabled={saving} onClick={() => window.location.reload()}>Load saved version — discard unsaved edits</button></nav>
  </div></main>;
}
