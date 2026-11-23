import assert from 'node:assert/strict';
import test from 'node:test';
import { accountIntakeStore, saveIntakeDraft, loadIntakeDraft, keepIntakeRecoveryCopies, loadIntakeRecoveryCopies } from '../src/yawrd-intake-storage.ts';
import { createEmptyYawrdIntakeDraft, parseYawrdIntakeDraft, serializeYawrdIntakeDraft, updateYawrdIntakeDraft, classifyYawrdIntake } from '../src/yawrd-intake.ts';
import { applyRestoredIntake, COPY_INTAKE_QUESTIONS, INTAKE_QUESTIONS } from '../src/creation-intake.ts';
const time = '2026-11-14T00:00:00.000Z';
const original = updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft('historical-draft', time), {
  projectType: 'software', startingPoint: 'idea', intendedBudget: 'undecided', initialOutcomeConfirmed: true,
  availableResources: '  Synthetic resources\nunchanged.  ', successCriteria: 'Synthetic outcome\n', founderDescription: '  Synthetic paragraph one.\n\nParagraph two.  ',
}, time);

test('optional project-name metadata round-trips without changing old v1 records or classifications', () => {
  const bytes = serializeYawrdIntakeDraft(original);
  assert.equal(serializeYawrdIntakeDraft(parseYawrdIntakeDraft(bytes)), bytes);
  assert.equal('projectName' in parseYawrdIntakeDraft(bytes), false);
  const named = { ...original, projectName: '  A project name  ' };
  const restored = parseYawrdIntakeDraft(serializeYawrdIntakeDraft(named));
  assert.equal(restored.projectName, named.projectName);
  assert.deepEqual(restored.answers, original.answers);
  assert.deepEqual(classifyYawrdIntake(restored.answers), original.classification);
  for (const invalid of [42, null, 'x'.repeat(201)]) assert.throws(() => serializeYawrdIntakeDraft({ ...original, projectName: invalid } as any));
});

test('account storage reuses v1 while leaving legacy and unrelated account drafts isolated', () => {
  const values = new Map<string, string>();
  const store = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  saveIntakeDraft(store, original);
  const first = accountIntakeStore(store, 'one.testnet'), second = accountIntakeStore(store, 'two.testnet');
  assert.equal(loadIntakeDraft(first), null);
  const named = { ...createEmptyYawrdIntakeDraft('new-draft', time), projectName: 'New project' };
  saveIntakeDraft(first, named);
  assert.deepEqual(loadIntakeDraft(first), named);
  assert.equal(loadIntakeDraft(second), null);
  assert.deepEqual(loadIntakeDraft(store), original);
});

test('copy contains project name and all six approved prompts with founder review instructions', () => {
  assert.match(COPY_INTAKE_QUESTIONS, /Project name:/);
  for (const question of INTAKE_QUESTIONS) assert.ok(COPY_INTAKE_QUESTIONS.includes(question.prompt));
  assert.match(COPY_INTAKE_QUESTIONS, /instead of inventing/);
  assert.match(COPY_INTAKE_QUESTIONS, /explicitly confirm/);
});

test('explicit recovery copies editable information while preserving destination identity and dates', () => {
  const saved = {...original,projectName:'Saved name'};
  const restored = {...updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft('different-export-id','2026-01-01T00:00:00.000Z'),
    {...original.answers,founderDescription:'Updated private wording'},time),projectName:'Yawrd Public Beta Test'};
  const savedBytes=serializeYawrdIntakeDraft(saved),restoredBytes=serializeYawrdIntakeDraft(restored);
  const edited=applyRestoredIntake(saved,restored,'2026-11-18T00:00:00.000Z');
  assert.equal(edited.draftId,saved.draftId);assert.equal(edited.createdAt,saved.createdAt);assert.equal(edited.schemaVersion,saved.schemaVersion);
  assert.equal(edited.updatedAt,'2026-11-18T00:00:00.000Z');assert.equal(edited.projectName,'Yawrd Public Beta Test');
  assert.deepEqual(edited.answers,restored.answers);assert.deepEqual(edited.classification,classifyYawrdIntake(edited.answers));
  assert.equal(serializeYawrdIntakeDraft(saved),savedBytes);assert.equal(serializeYawrdIntakeDraft(restored),restoredBytes);
  assert.throws(()=>applyRestoredIntake(saved,{...restored,gates:{...restored.gates,blueprintApproval:'approved'}},time));
});
test('older restored formats cannot silently clear a saved project name or carry another source identity', () => {
  const saved={...original,projectName:'Saved project'};
  const copy=applyRestoredIntake(saved,{...original,draftId:'old-export-id'},time);
  assert.equal(copy.projectName,saved.projectName);assert.equal(copy.draftId,saved.draftId);
});
test('recovery copies survive reload, remain account/Creation scoped, and never replace the browser draft', () => {
  const values=new Map<string,string>();
  const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};
  const a=accountIntakeStore(store,'one.testnet'),b=accountIntakeStore(store,'two.testnet');
  const incoming={...original,draftId:'exported-source',projectName:'Restored version'};
  saveIntakeDraft(a,original);const before=JSON.stringify([...values]);
  keepIntakeRecoveryCopies(a,'yawrd-aaaaaaaaaaaa',[original,incoming]);
  keepIntakeRecoveryCopies(a,'yawrd-aaaaaaaaaaaa',[incoming]);
  assert.deepEqual(loadIntakeRecoveryCopies(accountIntakeStore(store,'one.testnet'),'yawrd-aaaaaaaaaaaa'),[original,incoming]);
  assert.deepEqual(loadIntakeRecoveryCopies(b,'yawrd-aaaaaaaaaaaa'),[]);
  assert.deepEqual(loadIntakeRecoveryCopies(a,'yawrd-bbbbbbbbbbbb'),[]);
  assert.deepEqual(loadIntakeDraft(a),original);assert.ok(JSON.stringify([...values]).startsWith(before.slice(0,-1)));
  keepIntakeRecoveryCopies(a,'browser',[original,incoming]);
  saveIntakeDraft(a,incoming);
  assert.deepEqual(loadIntakeRecoveryCopies(accountIntakeStore(store,'one.testnet'),'browser'),[original,incoming]);
  assert.deepEqual(loadIntakeRecoveryCopies(b,'browser'),[]);
  assert.deepEqual(loadIntakeDraft(a),incoming);
});
test('corrupt recovery storage is left unchanged instead of being silently replaced', () => {
  let value='CORRUPT';const store={getItem:()=>value,setItem:(_:string,v:string)=>{value=v;},removeItem:()=>{}};
  assert.throws(()=>keepIntakeRecoveryCopies(store,'yawrd-aaaaaaaaaaaa',[original]));assert.equal(value,'CORRUPT');
});
