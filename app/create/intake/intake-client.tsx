"use client";

import { useEffect, useRef, useState } from 'react';
import { assessYawrdIntake, descriptiveIntakeIssue, createEmptyYawrdIntakeDraft, parseYawrdIntakeDraft, serializeYawrdIntakeDraft, updateYawrdIntakeDraft, PROJECT_TYPES, STARTING_POINTS, BUDGET_BANDS, type YawrdIntakeAnswers, type YawrdIntakeDraftV1 } from '../../../src/yawrd-intake';
import { accountIntakeStore, loadIntakeDraft, saveIntakeDraft, loadIntakeRecoveryCopies, keepIntakeRecoveryCopies } from '../../../src/yawrd-intake-storage';
import { applyRestoredIntake, intakeSaveState, COPY_INTAKE_QUESTIONS, INTAKE_LABELS, INTAKE_QUESTIONS } from '../../../src/creation-intake';
import { applyAssistedIntake, intakeAssistanceDownload, parseAssistedIntake, type AssistedIntake } from '../../../src/intake-assistance';
import type { PrivateCreation } from '../../../src/creation/repository';
import SavedCreations from '../saved-creations';
import { CreationRequestError, readCreation, saveCreationIntake } from '../creation-api';
import { CreationJourney } from '../creation-journey';
import styles from './intake.module.css';

type Field = typeof INTAKE_QUESTIONS[number]['field'];
const SECTIONS: Field[][] = [['projectType', 'startingPoint'], ['availableResources', 'successCriteria'], ['intendedBudget', 'founderDescription']];
const EMPTY = createEmptyYawrdIntakeDraft('pending', '1970-01-01T00:00:00.000Z');

export default function IntakeClient({ accountId, creation, newlyStarted = false, preparationContinuation = false, onSaved, onBind, onResumeSetup, onBack, onContinueSetup }: {
  accountId: string; creation: PrivateCreation | null; onSaved: (value: PrivateCreation) => void; onBind: (value: PrivateCreation) => void; onResumeSetup: (value: PrivateCreation) => void; newlyStarted?: boolean; preparationContinuation?: boolean; onBack: () => void; onContinueSetup: () => void;
}) {
  const [draft, setDraft] = useState<YawrdIntakeDraftV1>(EMPTY);
  const [confirmedSave, setConfirmedSave] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [section, setSection] = useState(0);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [savedForSetup, setSavedForSetup] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [assistedText, setAssistedText] = useState('');
  const [assisted, setAssisted] = useState<AssistedIntake | null>(null);
  const [assistedError, setAssistedError] = useState('');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [restoreChoice, setRestoreChoice] = useState(false);
  const [incoming, setIncoming] = useState<YawrdIntakeDraftV1 | null>(null);
  const [target, setTarget] = useState<PrivateCreation | null>(null);
  const [recoveryCopies, setRecoveryCopies] = useState<YawrdIntakeDraftV1[]>([]);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const restore = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    try {
      const saved = creation?.intake ?? loadIntakeDraft(accountIntakeStore(localStorage, accountId));
      setConfirmedSave(creation ? serializeYawrdIntakeDraft(creation.intake) : null); setSaveFailed(false);
      setDraft(saved ?? createEmptyYawrdIntakeDraft(crypto.randomUUID(), new Date().toISOString()));
      if (creation) { setSavedForSetup(!!saved?.projectName?.trim() && assessYawrdIntake(saved.answers).complete); setMessage(`Your private answers were loaded. Saved revision ${creation.revision}.`); }
      else if (saved && !newlyStarted) setMessage('Your draft was restored from this browser.');
    } catch {
      setPaused(true);
      setDraft(createEmptyYawrdIntakeDraft(crypto.randomUUID(), new Date().toISOString()));
      setError('Your saved draft could not be read. It has been left unchanged. Restore a supported JSON export, or complete and explicitly save a replacement.');
    }
    setReady(true);
  }, [accountId, newlyStarted]);
  useEffect(() => {
    if (!ready || paused || creation) return;
    try { saveIntakeDraft(accountIntakeStore(localStorage, accountId), draft); }
    catch { setPaused(true); setError('Browser storage is unavailable. Export your draft before leaving.'); }
  }, [draft, ready, paused, accountId, creation]);
  useEffect(() => { if (ready) heading.current?.focus(); }, [section, ready]);

  useEffect(() => {
    setAssistedText(''); setAssisted(null); setAssistedError('');
    setRecoveryCopies([]);
    try { setRecoveryCopies(loadIntakeRecoveryCopies(accountIntakeStore(localStorage,accountId),creation?.id ?? 'browser')); }
    catch { setRecoveryError('Saved recovery copies could not be read. They have been left unchanged. Export your current answers before leaving.'); }
  }, [accountId,creation?.id]);
  async function chooseSaved(id: string) {
    if (recoveryBusy) return;
    setRecoveryBusy(true); setRecoveryError('');
    try {
      const selected = await readCreation(accountId,id);
      if (selected.founderAccountId !== accountId) throw new Error('This saved Creation is unavailable for your signed-in account.');
      setTarget(selected);
      setRecoveryCopies(loadIntakeRecoveryCopies(accountIntakeStore(localStorage,accountId),selected.id));
    } catch (e) { setTarget(null); setRecoveryError(e instanceof Error ? e.message : 'The saved Creation could not be loaded.'); }
    finally { setRecoveryBusy(false); }
  }
  function openRecovery(value = draft) {
    setIncoming(value); setRecoveryOpen(true); setTarget(null); setRecoveryError('');
    if (creation) void chooseSaved(creation.id);
  }
  function retainCopies(selected: PrivateCreation) {
    try {
      setRecoveryCopies(keepIntakeRecoveryCopies(accountIntakeStore(localStorage,accountId),selected.id,
        [...loadIntakeRecoveryCopies(accountIntakeStore(localStorage,accountId),'browser'),selected.intake,draft,...(incoming ? [incoming] : [])]));
      return true;
    } catch {
      setRecoveryError('Recovery copies could not be kept in this browser. Your versions are unchanged. Export your local and restored answers before leaving, then retry recovery when storage is available.');
      return false;
    }
  }
  function stageRestoredAnswers() {
    if (!target || !incoming || recoveryBusy) return;
    const editable = applyRestoredIntake(target.intake,incoming,new Date().toISOString());
    if (!retainCopies(target)) return;
    onBind(target); setDraft(editable); setRestoreChoice(false); setRecoveryOpen(false);
    setSection(editable.projectName?.trim() ? 3 : 0); setSavedForSetup(false); setPaused(false); setError('');
    setMessage('Restored answers are ready for review in the existing Creation. Nothing has been saved yet. Review them, then Save intake. Its identity, saved public details, Stewards and deployment setup stay attached.');
  }
  function resumeSavedSetup() {
    if (!target || recoveryBusy || !retainCopies(target)) return;
    onResumeSetup(target);
  }
  function answer(values: Partial<YawrdIntakeAnswers>) {
    setSavedForSetup(false); setError(''); setMessage('');
    setDraft(d => updateYawrdIntakeDraft(d, values, new Date().toISOString()));
  }
  function name(value: string) {
    setSavedForSetup(false); setError(''); setMessage('');
    setDraft(d => ({ ...d, projectName: value, updatedAt: new Date().toISOString() }));
  }
  function answered(field: Field) {
    if (field === 'availableResources' || field === 'founderDescription') return !descriptiveIntakeIssue(field, draft.answers[field]);
    return field === 'successCriteria' ? !descriptiveIntakeIssue(field, draft.answers.successCriteria) && draft.answers.initialOutcomeConfirmed : !!draft.answers[field]?.trim();
  }
  function next() {
    if (section === 0 && !draft.projectName?.trim()) { setError('Give your project a name before continuing.'); document.getElementById('intake-name')?.focus(); return; }
    const missing = SECTIONS[section]?.find(field => !answered(field));
    if (missing) { setError(missing === 'successCriteria' ? 'Describe a clear first result and explicitly confirm it before continuing.'
      : missing === 'availableResources' || missing === 'founderDescription' ? descriptiveIntakeIssue(missing, draft.answers[missing])! : 'Please answer each question in this section.'); document.getElementById(`field-${missing}`)?.focus(); return; }
    setError(''); setSection(s => s + 1);
  }
  async function save(requireComplete = false) {
    if (saveLock.current || saveStatus.saved) return;
    if (restoreChoice) { openRecovery(incoming ?? draft); setError('Choose a saved Creation for these restored answers, or explicitly keep them as a new browser draft.'); return; }
    if (recoveryOpen && incoming) { setError('Review the saved and restored versions, then choose Use restored answers or continue the saved setup without applying them. Nothing has been saved.'); return; }
    if (requireComplete && (!draft.projectName?.trim() || !assessYawrdIntake(draft.answers).complete)) { setError('Complete your project name and all six answers, including the first-result confirmation.'); return; }
    saveLock.current = true; setSaving(true); setError(''); setMessage('');
    try {
      const saved = await saveCreationIntake(accountId, creation, draft);
      const recovered = !creation && serializeYawrdIntakeDraft(saved.intake) !== serializeYawrdIntakeDraft(draft);
      setConfirmedSave(serializeYawrdIntakeDraft(saved.intake)); setSaveFailed(false);
      setDraft(saved.intake); onSaved(saved); setPaused(false);
      setSavedForSetup(!!saved.intake.projectName?.trim() && assessYawrdIntake(saved.intake.answers).complete);
      setMessage(recovered ? 'An existing saved draft was recovered. Its latest saved wording is now loaded for review.'
        : `Saved privately to your account. Saved revision ${saved.revision}. You can resume after signing in again. Your deployed identity and verified payment remain unchanged. No Blueprint has been published.`);
    } catch (e) {
      setSaveFailed(true); setSavedForSetup(false); setError(e instanceof Error ? e.message : 'Your private draft could not be saved.');
      if (e instanceof CreationRequestError && ['creation_import_conflict','creation_draft_identity_conflict','creation_revision_conflict'].includes(e.code)) openRecovery(draft);
    }
    finally { saveLock.current = false; setSaving(false); }
  }
  function exportDraft(value = draft, filename = 'yawrd-intake-draft-v1.json') {
    const blob = new Blob([serializeYawrdIntakeDraft(value)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
    setMessage('Draft exported. Keep your file somewhere private.');
  }
  async function restoreDraft(file?: File) {
    if (!file) return;
    setSavedForSetup(false);
    try {
      if (file.size > 524288) throw new Error('Choose a draft file smaller than 512 KiB.');
      const restored = parseYawrdIntakeDraft(await file.text());
      // Keep the current browser version before an unbound restore can autosave.
      setRecoveryCopies(keepIntakeRecoveryCopies(accountIntakeStore(localStorage,accountId),creation?.id ?? 'browser',[draft,restored]));
      setIncoming(restored); setRecoveryOpen(true); setRecoveryError(''); setTarget(creation);
      if (creation) { setMessage('Review the restored answers alongside this saved Creation before applying editable information. Your current answers are unchanged.'); setError(''); return; }
      setRestoreChoice(true);
      setDraft(restored); setPaused(false); setSection(restored.projectName?.trim() ? 3 : 0);
      setMessage('Draft restored. Review your wording and add a project name if this older export does not include one.');
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'The draft could not be restored.'); }
    finally { if (restore.current) restore.current.value = ''; }
  }
  async function copyQuestions() {
    try { await navigator.clipboard.writeText(COPY_INTAKE_QUESTIONS); setCopied(true); }
    catch { setCopied(false); setMessage('Copy is unavailable in this browser. Select and copy the questions below.'); }
  }
  function downloadAssistance() {
    const blob = new Blob([intakeAssistanceDownload(draft)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'yawrd-intake-and-ai-instructions.txt'; link.click(); URL.revokeObjectURL(url);
    setMessage('Intake and AI instructions downloaded. Review the file before sharing it with an external assistant.');
  }
  function previewAssistance() {
    try { setAssisted(parseAssistedIntake(assistedText)); setAssistedError(''); }
    catch (e) { setAssisted(null); setAssistedError(e instanceof Error ? e.message : 'The suggested answers could not be read.'); }
  }
  function applyAssistance() {
    if (!assisted) return;
    setDraft(d => applyAssistedIntake(d, assisted, new Date().toISOString()));
    setSavedForSetup(false); setAssisted(null); setAssistedText(''); setError('');
    setMessage('Suggested answers applied for review. Nothing has been saved. Confirm the first result if it changed, then Save intake.');
  }
  const saveStatus = intakeSaveState(serializeYawrdIntakeDraft(draft), confirmedSave, saving || restoreChoice || recoveryOpen, saveFailed || !!error);
  if (!ready) return <main className={styles.page}><p className={styles.container}>Preparing your intake…</p></main>;

  function question(field: Field, review = false) {
    const q = INTAKE_QUESTIONS.find(q => q.field === field)!;
    const value = draft.answers[field];
    const options = field === 'projectType' ? PROJECT_TYPES : field === 'startingPoint' ? STARTING_POINTS : field === 'intendedBudget' ? BUDGET_BANDS : null;
    return <section key={field} className={styles.question} aria-labelledby={`label-${field}`}>
      <h3 id={`label-${field}`}><label htmlFor={`field-${field}`}>{INTAKE_QUESTIONS.indexOf(q) + 1}. {q.prompt}</label></h3>
      {field === 'intendedBudget' && <p className={styles.help}>Choose Undecided when no funds are committed and compensation is undecided. State that in your project description too. No money needed means you expect no project spending; it does not decide contributor compensation.</p>}
      {'helper' in q && <p id={`help-${field}`} className={styles.help}>{q.helper}</p>}
      {review ? <><p className={styles.answer}>{options ? INTAKE_LABELS[value as string] ?? 'Not answered' : value || 'Not answered'}</p>{!options && <p className={styles.count}>{(value as string).length.toLocaleString()} / 20,000 characters</p>}</>
        : options ? <select required id={`field-${field}`} value={value as string ?? ''} aria-describedby={'helper' in q ? `help-${field}` : undefined} onChange={e => answer({ [field]: e.target.value || null })}>
          <option value="">Choose an answer</option>{options.map(v => <option value={v} key={v}>{INTAKE_LABELS[v]}</option>)}
        </select> : <>
          <textarea required id={`field-${field}`} rows={field === 'founderDescription' ? 12 : 6} maxLength={20000} value={value as string}
            aria-describedby={`help-${field} count-${field}`} placeholder={'placeholder' in q ? q.placeholder : ''}
            onChange={e => answer({ [field]: e.target.value, ...(field === 'successCriteria' ? { initialOutcomeConfirmed: false } : {}) })} />
          <p id={`count-${field}`} className={styles.count}>{(value as string).length.toLocaleString()} / 20,000 characters</p>
        </>}
      {field === 'successCriteria' && (review
        ? <p className={styles.help}>First-result confirmation: {draft.answers.initialOutcomeConfirmed ? 'Confirmed by founder' : 'Not confirmed'}</p>
        : <label className={styles.confirm}><input type="checkbox" aria-required="true" checked={draft.answers.initialOutcomeConfirmed} onChange={e => answer({ initialOutcomeConfirmed: e.target.checked })} /><span>I confirm this describes one clear result that would show the first version is ready.</span></label>)}
    </section>;
  }
  return <main className={styles.page}><a href="#intake-form" className={styles.skip}>Skip to project questions</a><div className={styles.container}>
    <CreationJourney current={1} paidContinuation={preparationContinuation} />
    <p className={styles.eyebrow}>01 — Describe your project</p>
    <h1 ref={heading} tabIndex={-1}>{section === 3 ? 'Review your intake' : 'Good projects start with your idea.'}</h1>
    <p className={styles.lead}>Your answers inform the Blueprint, contributor Skill and proposed task plan. You’ll review those outputs for accuracy before approval or publication. Ordinary language is enough; keep unknowns explicit.</p>
    {preparationContinuation && <p className={styles.help}>You’re editing the private answers for your existing Yawrd. Save changes before returning to AI preparation. Your project account, public details and verified payment stay attached.</p>}
    <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <details className={styles.ai} id="intake-ai-help">
        <summary>Get help with AI</summary>
        <p>Already working on your idea with AI? Copy these questions into your existing conversation, or download your current answers and instructions. Opening this help makes no AI request and has no inference cost.</p>
        <button type="button" onClick={() => void copyQuestions()}>Copy questions</button>
        <span role="status">{copied ? ' Questions copied.' : ''}</span>
        <details><summary>View the questions to copy</summary><pre>{COPY_INTAKE_QUESTIONS}</pre></details>
        <button type="button" onClick={downloadAssistance}>Download intake and AI instructions</button>
        <p className={styles.help}>Information you share with an external assistant is subject to that provider’s privacy practices. Don’t share passwords, wallet recovery phrases, credentials or confidential material. Review every answer yourself. You can also paste or edit individual answers below.</p>
        <div className={styles.question}>
          <label htmlFor="assisted-intake">Paste AI-assisted answers</label>
          <textarea id="assisted-intake" rows={5} maxLength={262144} value={assistedText} aria-describedby="assisted-intake-help" onChange={e => { setAssistedText(e.target.value); setAssisted(null); setAssistedError(''); }} />
          <p id="assisted-intake-help" className={styles.help}>Use the JSON response format in the download (up to 256 KiB). Preview suggestions, then choose whether to apply them. Saved answers change only after your normal Save.</p>
          <button type="button" onClick={previewAssistance}>Preview suggested answers</button>
          {assistedError && <p role="alert" className={styles.error}>{assistedError}</p>}
        </div>
        {assisted && <section aria-label="Suggested answer preview">
          <h3>Review suggested changes</h3>
          <p className={styles.answer}>Project name now: {draft.projectName || 'Not supplied'}<br />Suggested: {assisted.projectName || 'Not supplied'}</p>
          {INTAKE_QUESTIONS.map(q => <div key={q.field}><h4>{q.prompt}</h4>
            <p className={styles.answer}>Now: {INTAKE_LABELS[String(draft.answers[q.field])] ?? draft.answers[q.field] ?? 'Not supplied'}</p>
            <p className={styles.answer}>Suggested: {INTAKE_LABELS[String(assisted.answers[q.field])] ?? assisted.answers[q.field] ?? 'Not supplied'}</p>
          </div>)}
          <button type="button" onClick={applyAssistance}>Apply suggested answers</button>
          <p className={styles.help}>This stages edits only. If the first result changes, you must confirm it again.</p>
        </section>}
      </details>
<div className={styles.toolbar}>
      <button type="button" className={styles.primary} disabled={!saveStatus.canSave} onClick={() => void save()}>{saving ? 'Saving…' : saveStatus.saved ? '✓ Saved' : 'Save intake'}</button>
      <button type="button" onClick={() => exportDraft()}>Export draft</button>
      {!preparationContinuation && <button type="button" onClick={() => openRecovery()}>Resume a saved Creation with these answers</button>}
      <button type="button" onClick={() => restore.current?.click()}>Restore draft</button>
    {recoveryCopies.length > 0 && <details id="intake-recovery-copies" aria-label="Intake recovery copies"><summary>Recover previous browser copies ({recoveryCopies.length})</summary>
      <p className={styles.help}>These private copies are kept separately from your saved Creation. Export a copy, or select it for another explicit review.</p>
      {recoveryCopies.map((copy,index) => <p key={index}>{copy.projectName || 'Untitled intake'} · {copy.updatedAt}
        <button type="button" onClick={() => exportDraft(copy,'yawrd-intake-recovery-'+(index+1)+'.json')}>Export recovery copy {index+1}</button>
        <button type="button" onClick={() => openRecovery(copy)}>Review recovery copy {index+1}</button></p>)}
    </details>}
      <input ref={restore} aria-label="Restore intake JSON" type="file" accept="application/json,.json" hidden onChange={e => void restoreDraft(e.target.files?.[0])} />
      <p>{creation ? 'Save intake stores a revision privately in your account. Export/Restore and recovery copies are browser/file backups, not a durable account save. Unsaved edits are lost on reload.' : paused ? 'Automatic saving is paused. Export a copy, restore a draft, or retry Save intake after review.' : 'Draft changes save in this browser for your signed-in account.'}</p>
    </div>
    {message && <p role="status" className={styles.message}>{message}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {recoveryOpen && incoming && <section className={styles.form} aria-label="Recover saved Creation">
      <h2>Resume your saved Creation</h2>
      <p className={styles.help}>Your restored answers are still here. Choose the saved Yawrd to continue. Its saved identity and DAO setup will be kept. Nothing is overwritten by selecting it.</p>
      <button type="button" onClick={() => exportDraft(incoming,'yawrd-restored-intake-v1.json')}>Export restored copy</button>
      {!preparationContinuation && <SavedCreations accountId={accountId} onResume={id => void chooseSaved(id)} />}
      {recoveryBusy && <p role="status">Loading the saved version for review…</p>}
      {target && !recoveryBusy && <>
        <p>Selected saved Yawrd: <strong>{target.intake.projectName || 'Untitled Yawrd'}</strong></p>
        <p>Restored project name: <strong>{incoming.projectName ?? 'Not supplied — keep the saved name'}</strong></p>
        <details><summary>Compare project answers before applying</summary>
          {INTAKE_QUESTIONS.map(q => <div key={q.field}>
            <h3>{q.prompt}</h3><p className={styles.answer}>Saved: {INTAKE_LABELS[String(target.intake.answers[q.field])] ?? String(target.intake.answers[q.field])}</p>
            <p className={styles.answer}>Restored: {INTAKE_LABELS[String(incoming.answers[q.field])] ?? String(incoming.answers[q.field])}</p>
          </div>)}
        </details>
        <p className={styles.help}>Only the project name and private answers will be copied for review. The saved draft identity and creation date stay unchanged. Public project details, Stewards and deployment identity are not copied or approved.</p>
        <button type="button" onClick={stageRestoredAnswers}>Use restored answers for this saved Creation</button>
        {!preparationContinuation && <button type="button" onClick={resumeSavedSetup}>Continue saved setup without applying restored answers</button>}
        <p className={styles.help}>Recovery keeps copies of these versions in this browser for your signed-in account. Applying answers only stages edits; Save intake is a separate action with revision checks.</p>
      </>}
      {!creation && <button type="button" onClick={() => { setRestoreChoice(false); setRecoveryOpen(false); setError(''); setMessage('These answers remain an unlinked browser draft. Saving without selecting an existing Creation may create a separate private draft.'); }}>Keep as a new browser draft</button>}
      {recoveryError && <p role="alert" className={styles.error}>{recoveryError}</p>}
    </section>}

    <div id="intake-form" className={styles.form}>
      <p className={styles.eyebrow}>{section === 3 ? 'Final review · Nothing launches here' : `Section ${section + 1} of 3`}</p>
      {(section === 0 || section === 3) && <section className={styles.question}>
        <h2><label htmlFor="intake-name">Project name</label></h2>
        <p className={styles.help}>This is your private planning name. Editing it does not change the deployed public Yawrd name, project account (DAO), or verified payment.</p>
        {section === 3 ? <p className={styles.answer}>{draft.projectName ?? 'Not provided in this older draft'}</p>
          : <><input id="intake-name" required maxLength={200} value={draft.projectName ?? ''} placeholder="e.g. A neighborhood food-sharing project" aria-describedby="name-count" onChange={e => name(e.target.value)} /><p id="name-count" className={styles.count}>{draft.projectName?.length ?? 0} / 200 characters</p></>}
      </section>}

      {(section === 3 ? INTAKE_QUESTIONS.map(q => q.field) : SECTIONS[section]!).map(field => question(field, section === 3))}
    </div>
    <nav className={styles.actions} aria-label="Intake navigation">
      <button type="button" onClick={() => { setError(''); if (section === 0) onBack(); else setSection(s => s - 1); }}>Back</button>
      <button type="button" className={styles.primary} disabled={section === 3 && !saveStatus.canSave} onClick={() => { if (section === 3) void save(true); else next(); }}>{saving ? 'Saving…' : section === 3 ? saveStatus.saved ? '✓ Saved' : 'Save reviewed intake' : 'Next'}</button>
    </nav>
    {(savedForSetup || preparationContinuation) && <button type="button" disabled={!saveStatus.saved || !savedForSetup} onClick={onContinueSetup}>{preparationContinuation ? 'Continue' : 'Continue to setup review →'}</button>}
    </fieldset><p className={styles.help}>No payment, wallet transaction or AI generation happens here. Save intake keeps a private account draft. Export a private copy before loading the saved version if you have unsaved edits.</p>
    {creation && !preparationContinuation && <button onClick={() => window.location.reload()}>Load saved version — discard unsaved edits</button>}
    <p className={styles.help}>Saving private intake does not change your project’s public details, deploy its account, pay a fee or publish work.</p>
  </div></main>;
}
