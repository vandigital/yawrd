import assert from "node:assert/strict";
import test from "node:test";
import {
  YAWRD_INTAKE_SCHEMA_VERSION,
  YAWRD_INTAKE_STORAGE_KEY,
  assessYawrdIntake,
  classifyYawrdIntake,
  createEmptyYawrdIntakeDraft,
  parseYawrdIntakeDraft,
  serializeYawrdIntakeDraft,
  updateYawrdIntakeDraft,
  validateYawrdIntakeDraft,
  type YawrdIntakeDraftV1,
} from "../src/yawrd-intake.ts";
import {
  loadIntakeDraft,
  saveIntakeDraft,
  type LocalKeyValueStore,
} from "../src/yawrd-intake-storage.ts";

const CREATED = "2026-11-12T10:00:00.000Z";
const UPDATED = "2026-11-12T10:15:00.000Z";
const exactDescription = "  We want to build a shared repair map.\nKeep this wording — exactly.  ";
const exactOutcome = "Three neighbors add one verified repair place each.\n";

function completeDraft(): YawrdIntakeDraftV1 {
  return updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft("draft-local-1", CREATED), {
    projectType: "community",
    startingPoint: "written-plan",
    availableResources: "Two neighbors, a spreadsheet, and Saturday mornings.",
    successCriteria: exactOutcome,
    initialOutcomeConfirmed: true,
    intendedBudget: "under-500",
    founderDescription: exactDescription,
  }, UPDATED);
}

class MemoryStore implements LocalKeyValueStore {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("the v1 intake preserves founder text byte-for-byte through export and restore", () => {
  const draft = completeDraft();
  const restored = parseYawrdIntakeDraft(serializeYawrdIntakeDraft(draft));
  assert.equal(restored.schemaVersion, YAWRD_INTAKE_SCHEMA_VERSION);
  assert.equal(restored.answers.founderDescription, exactDescription);
  assert.equal(restored.answers.successCriteria, exactOutcome);
  assert.deepEqual(restored, draft);
});

test("classification is deterministic and uses only explicit selections", () => {
  const first = completeDraft();
  const changedText = updateYawrdIntakeDraft(first, {
    availableResources: "Completely different prose",
    successCriteria: "Different explicit outcome",
    founderDescription: "Text that mentions software, events, and a very large budget",
  }, UPDATED);
  assert.deepEqual(classifyYawrdIntake(first.answers), {
    method: "explicit-rules.v1", projectType: "community", projectStage: "planned", budgetStatus: "declared-range",
  });
  assert.deepEqual(changedText.classification, first.classification);
  assert.notEqual(changedText.answers.founderDescription, first.answers.founderDescription);
});

test("incomplete drafts remain valid but an unconfirmed initial outcome closes the builder gate", () => {
  const draft = updateYawrdIntakeDraft(completeDraft(), { initialOutcomeConfirmed: false }, UPDATED);
  assert.deepEqual(validateYawrdIntakeDraft(draft), draft);
  const readiness = assessYawrdIntake(draft.answers);
  assert.equal(readiness.complete, false);
  assert.equal(readiness.canContinueToBuilder, false);
  assert.deepEqual(readiness.missing, ["successCriteria"]);
  assert.equal(draft.gates.initialOutcome, "needs-definition");
});

test("runtime validation rejects forged derived fields and unsupported shapes without echoing content", () => {
  const draft = completeDraft();
  assert.throws(() => validateYawrdIntakeDraft({ ...draft, schemaVersion: "yawrd.intake-draft.v2" }), /Unsupported intake draft schema version/);
  assert.throws(() => validateYawrdIntakeDraft({ ...draft, classification: { ...draft.classification, projectType: "software" } }), /classification does not match/);
  assert.throws(() => validateYawrdIntakeDraft({ ...draft, gates: { ...draft.gates, blueprintApproval: "approved" } }), /gates do not match/);
  assert.throws(() => validateYawrdIntakeDraft({ ...draft, answers: { ...draft.answers, initialOutcomeConfirmed: "yes" } }), /initialOutcomeConfirmed must be a boolean/);
  assert.throws(() => parseYawrdIntakeDraft("PRIVATE_SENTINEL"), error => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /PRIVATE_SENTINEL/);
    return true;
  });
});

test("restore selects known contract fields and never evaluates unrelated private properties", () => {
  const input = { ...completeDraft(), privateNotes: "PRIVATE_SENTINEL", wallet: "WALLET_SENTINEL" } as Record<string, unknown>;
  Object.defineProperty(input, "secretGetter", { get() { throw new Error("private getter evaluated"); } });
  const restored = validateYawrdIntakeDraft(input);
  assert.deepEqual(Reflect.ownKeys(restored), ["schemaVersion", "draftId", "createdAt", "updatedAt", "answers", "classification", "gates"]);
  assert.doesNotMatch(JSON.stringify(restored), /SENTINEL/);
});

test("local persistence uses the existing v1 key and validates reads", () => {
  const store = new MemoryStore();
  const draft = completeDraft();
  saveIntakeDraft(store, draft);
  assert.deepEqual(loadIntakeDraft(store), draft);
  assert.deepEqual([...store.values.keys()], [YAWRD_INTAKE_STORAGE_KEY]);

});
