export const YAWRD_INTAKE_SCHEMA_VERSION = "yawrd.intake-draft.v1" as const;
export const YAWRD_INTAKE_STORAGE_KEY = "yawrd.intake-draft.v1";

export const PROJECT_TYPES = ["community", "creative", "software", "research", "event", "other"] as const;
export const STARTING_POINTS = ["idea", "written-plan", "work-started", "existing-project"] as const;
export const BUDGET_BANDS = ["undecided", "no-money-needed", "under-500", "500-to-5000", "over-5000"] as const;

export type ProjectType = typeof PROJECT_TYPES[number];
export type StartingPoint = typeof STARTING_POINTS[number];
export type BudgetBand = typeof BUDGET_BANDS[number];

export interface YawrdIntakeAnswers {
  projectType: ProjectType | null;
  startingPoint: StartingPoint | null;
  availableResources: string;
  successCriteria: string;
  initialOutcomeConfirmed: boolean;
  intendedBudget: BudgetBand | null;
  founderDescription: string;
}

export interface YawrdIntakeClassification {
  method: "explicit-rules.v1";
  projectType: ProjectType | "unclassified";
  projectStage: "unclassified" | "exploring" | "planned" | "underway" | "operating";
  budgetStatus: "unclassified" | "undecided" | "non-monetary" | "declared-range";
}

export interface YawrdIntakeGates {
  initialOutcome: "needs-definition" | "defined";
  blueprintApproval: "not-approved";
  taskReadiness: "not-assessed";
}

export interface YawrdIntakeDraftV1 {
  schemaVersion: typeof YAWRD_INTAKE_SCHEMA_VERSION;
  draftId: string;
  /** Optional display metadata; absent in historical v1 exports. Never a DAO identifier. */
  projectName?: string;
  createdAt: string;
  updatedAt: string;
  answers: YawrdIntakeAnswers;
  classification: YawrdIntakeClassification;
  gates: YawrdIntakeGates;
}

export type IntakeAnswerField = keyof YawrdIntakeAnswers;
export type IntakeRequiredField = Exclude<IntakeAnswerField, "initialOutcomeConfirmed">;

export interface IntakeCompleteness {
  complete: boolean;
  missing: IntakeRequiredField[];
  canContinueToBuilder: boolean;
}

const PROJECT_STAGES: Record<StartingPoint, YawrdIntakeClassification["projectStage"]> = {
  idea: "exploring",
  "written-plan": "planned",
  "work-started": "underway",
  "existing-project": "operating",
};

function isPlainRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be a record`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${field} must be a record`);
  return value as Record<string, unknown>;
}

function ownValue(record: Record<string, unknown>, field: string): unknown {
  const property = Object.getOwnPropertyDescriptor(record, field);
  if (!property || !Object.hasOwn(property, "value")) throw new Error(`${field} must be an explicit data field`);
  return property.value;
}

function stringValue(record: Record<string, unknown>, field: string, options: { nonblank?: boolean; max?: number } = {}): string {
  const value = ownValue(record, field);
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (options.nonblank && !value.trim()) throw new Error(`${field} must be a nonblank string`);
  if (value.length > (options.max ?? 20_000)) throw new Error(`${field} is too long`);
  return value;
}

function nullableEnum<T extends string>(record: Record<string, unknown>, field: string, values: readonly T[]): T | null {
  const value = ownValue(record, field);
  if (value === null) return null;
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${field} is unsupported`);
  return value as T;
}

function booleanValue(record: Record<string, unknown>, field: string): boolean {
  const value = ownValue(record, field);
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function isoDate(record: Record<string, unknown>, field: string): string {
  const value = stringValue(record, field, { nonblank: true, max: 64 });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return value;
}

function requireDerivedClassification(value: unknown, expected: YawrdIntakeClassification): void {
  const supplied = isPlainRecord(value, "classification");
  for (const field of ["method", "projectType", "projectStage", "budgetStatus"] as const) {
    if (ownValue(supplied, field) !== expected[field]) throw new Error("classification does not match explicit answers");
  }
}

function requireDerivedGates(value: unknown, expected: YawrdIntakeGates): void {
  const supplied = isPlainRecord(value, "gates");
  for (const field of ["initialOutcome", "blueprintApproval", "taskReadiness"] as const) {
    if (ownValue(supplied, field) !== expected[field]) throw new Error("gates do not match explicit answers");
  }
}

export function classifyYawrdIntake(answers: YawrdIntakeAnswers): YawrdIntakeClassification {
  let budgetStatus: YawrdIntakeClassification["budgetStatus"] = "unclassified";
  if (answers.intendedBudget === "undecided") budgetStatus = "undecided";
  else if (answers.intendedBudget === "no-money-needed") budgetStatus = "non-monetary";
  else if (answers.intendedBudget) budgetStatus = "declared-range";
  return {
    method: "explicit-rules.v1",
    projectType: answers.projectType ?? "unclassified",
    projectStage: answers.startingPoint ? PROJECT_STAGES[answers.startingPoint] : "unclassified",
    budgetStatus,
  };
}

/** A small placeholder check, not a quality assessment. Wording is never rewritten. */
export function descriptiveIntakeIssue(field: 'availableResources' | 'successCriteria' | 'founderDescription', value: string): string | null {
  const candidate = value.trim();
  if (candidate && /[\p{L}\p{N}]/u.test(candidate) && !/^(test|asdf|qwerty|placeholder|todo|tbd)$/i.test(candidate)) return null;
  return field === 'availableResources' ? 'Describe what you have, or say “None yet” if you are starting from scratch.'
    : field === 'successCriteria' ? 'Describe one result you could observe when the first version is ready.'
    : 'Describe your idea and who it will help. You do not need technical specifications.';
}

export function assessYawrdIntake(answers: YawrdIntakeAnswers): IntakeCompleteness {
  const missing: IntakeRequiredField[] = [];
  if (!answers.projectType) missing.push("projectType");
  if (!answers.startingPoint) missing.push("startingPoint");
  if (descriptiveIntakeIssue('availableResources', answers.availableResources)) missing.push("availableResources");
  if (descriptiveIntakeIssue('successCriteria', answers.successCriteria) || !answers.initialOutcomeConfirmed) missing.push("successCriteria");
  if (!answers.intendedBudget) missing.push("intendedBudget");
  if (descriptiveIntakeIssue('founderDescription', answers.founderDescription)) missing.push("founderDescription");
  return { complete: missing.length === 0, missing, canContinueToBuilder: missing.length === 0 };
}

export function deriveIntakeGates(answers: YawrdIntakeAnswers): YawrdIntakeGates {
  return {
    initialOutcome: answers.successCriteria.trim() && answers.initialOutcomeConfirmed ? "defined" : "needs-definition",
    blueprintApproval: "not-approved",
    taskReadiness: "not-assessed",
  };
}

export function createEmptyYawrdIntakeDraft(draftId: string, now: string): YawrdIntakeDraftV1 {
  if (!draftId.trim()) throw new Error("draftId must be a nonblank string");
  const answers: YawrdIntakeAnswers = {
    projectType: null,
    startingPoint: null,
    availableResources: "",
    successCriteria: "",
    initialOutcomeConfirmed: false,
    intendedBudget: null,
    founderDescription: "",
  };
  return {
    schemaVersion: YAWRD_INTAKE_SCHEMA_VERSION,
    draftId,
    createdAt: now,
    updatedAt: now,
    answers,
    classification: classifyYawrdIntake(answers),
    gates: deriveIntakeGates(answers),
  };
}

export function updateYawrdIntakeDraft(
  draft: YawrdIntakeDraftV1,
  answers: Partial<YawrdIntakeAnswers>,
  now: string,
): YawrdIntakeDraftV1 {
  const nextAnswers = { ...draft.answers, ...answers };
  return {
    ...draft,
    updatedAt: now,
    answers: nextAnswers,
    classification: classifyYawrdIntake(nextAnswers),
    gates: deriveIntakeGates(nextAnswers),
  };
}

function validateAnswers(value: unknown): YawrdIntakeAnswers {
  const input = isPlainRecord(value, "answers");
  return {
    projectType: nullableEnum(input, "projectType", PROJECT_TYPES),
    startingPoint: nullableEnum(input, "startingPoint", STARTING_POINTS),
    availableResources: stringValue(input, "availableResources"),
    successCriteria: stringValue(input, "successCriteria"),
    initialOutcomeConfirmed: booleanValue(input, "initialOutcomeConfirmed"),
    intendedBudget: nullableEnum(input, "intendedBudget", BUDGET_BANDS),
    founderDescription: stringValue(input, "founderDescription"),
  };
}

export function validateYawrdIntakeDraft(value: unknown): YawrdIntakeDraftV1 {
  const input = isPlainRecord(value, "Intake draft");
  if (ownValue(input, "schemaVersion") !== YAWRD_INTAKE_SCHEMA_VERSION) throw new Error("Unsupported intake draft schema version");
  const answers = validateAnswers(ownValue(input, "answers"));
  const draft: YawrdIntakeDraftV1 = {
    schemaVersion: YAWRD_INTAKE_SCHEMA_VERSION,
    draftId: stringValue(input, "draftId", { nonblank: true, max: 200 }),
    createdAt: isoDate(input, "createdAt"),
    updatedAt: isoDate(input, "updatedAt"),
    answers,
    classification: classifyYawrdIntake(answers),
    gates: deriveIntakeGates(answers),
  };
  if (Object.hasOwn(input, "projectName")) {
    draft.projectName = stringValue(input, "projectName", { max: 200 });
  }
  // Classification and gates are derived, so restored files cannot override them.
  requireDerivedClassification(ownValue(input, "classification"), draft.classification);
  requireDerivedGates(ownValue(input, "gates"), draft.gates);
  return draft;
}

export function parseYawrdIntakeDraft(serialized: string): YawrdIntakeDraftV1 {
  let value: unknown;
  try { value = JSON.parse(serialized); } catch { throw new Error("Intake draft must be valid JSON"); }
  return validateYawrdIntakeDraft(value);
}

export function serializeYawrdIntakeDraft(draft: YawrdIntakeDraftV1): string {
  return `${JSON.stringify(validateYawrdIntakeDraft(draft), null, 2)}\n`;
}
