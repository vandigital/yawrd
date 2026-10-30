/** Standalone public presentation contract. No platform models or I/O. */
export const SYNTHETIC_NOTICE = "Synthetic example only. No real project activity, participation, contribution acceptance or reward distribution is represented.";

export const LIMITS = {
  id: 64,
  displayName: 80,
  title: 120,
  summary: 240,
  url: 2048,
  entries: 100,
} as const;

export const PROGRESS_STATUSES = ["not_started", "in_progress", "blocked", "completed"] as const;
export type ProgressStatus = typeof PROGRESS_STATUSES[number];
export const CONTRIBUTION_STATUSES = ["accepted", "integrated"] as const;
export type ContributionStatus = typeof CONTRIBUTION_STATUSES[number];

type Publication =
  | { readonly dataKind: "synthetic"; readonly notice: typeof SYNTHETIC_NOTICE }
  | { readonly dataKind: "published" };

type PublicSnapshot = Publication & {
  readonly schemaVersion: 1;
  /** Stable public reference; never an application, wallet or session ID. */
  readonly projectId: string;
};

export interface PublishedMilestone {
  readonly id: string;
  readonly title: string;
  readonly status: ProgressStatus;
}

export interface PublicTaskStatus {
  readonly id: string;
  readonly title: string;
  readonly status: ProgressStatus;
}

/** Every entry represents already accepted activity, never a pending submission. */
export interface AcceptedActivity {
  readonly id: string;
  readonly summary: string;
  /** Public acceptance date, YYYY-MM-DD (not a private audit timestamp). */
  readonly acceptedOn: string;
  readonly link?: string;
}

export type ProjectProgressData = PublicSnapshot & {
  readonly milestones: readonly PublishedMilestone[];
  readonly tasks: readonly PublicTaskStatus[];
  /** Newest acceptance date first; ties retain supplied publication order. */
  readonly recentActivity: readonly AcceptedActivity[];
};

export interface PublicAgent {
  /** Publication-specific ID, not the private agent-association reference. */
  readonly id: string;
  readonly displayName: string;
}

export interface PublicContributor {
  readonly id: string;
  readonly displayName: string;
  readonly profileUrl?: string;
  /** Include only with separate, explicit authorization to publish this identity. */
  readonly agent?: PublicAgent;
}

export interface AcceptedContribution {
  readonly id: string;
  readonly title: string;
  readonly contributorId: string;
  /** Optional agent attribution must match this contributor's published agent. */
  readonly agentId?: string;
  readonly status: ContributionStatus;
  readonly link?: string;
}

export type CrewAndContributionsData = PublicSnapshot & {
  readonly contributors: readonly PublicContributor[];
  /** Only accepted work; integration is a later published state, not payment. */
  readonly contributions: readonly AcceptedContribution[];
};

type RecordData = Record<string, unknown>;

function requireRule(condition: unknown, field: string): asserts condition {
  // Never include rejected values (which could be private) in diagnostics.
  if (!condition) throw new Error(`Invalid public Build Progress field: ${field}`);
}

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): RecordData {
  requireRule(value !== null && typeof value === "object" && !Array.isArray(value), "record");
  const prototype = Object.getPrototypeOf(value);
  requireRule(prototype === Object.prototype || prototype === null, "record prototype");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  requireRule(Reflect.ownKeys(value).every(key => typeof key === "string" &&
    (required.includes(key) || optional.includes(key)) && "value" in descriptors[key] &&
    descriptors[key].enumerable), "unexpected or computed field");
  requireRule(required.every(key => Object.hasOwn(descriptors, key)), "required field");
  return value as RecordData;
}

function text(value: unknown, max: number, field: string): asserts value is string {
  requireRule(typeof value === "string" && value.length >= 1 && value.length <= max &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value), field);
}

function id(value: unknown): asserts value is string {
  text(value, LIMITS.id, "id");
  requireRule(/^[a-z0-9][a-z0-9_-]*$/.test(value), "id");
}

function link(value: unknown): void {
  text(value, LIMITS.url, "link");
  requireRule(/^https:\/\//.test(value) && !/\s/u.test(value), "link");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid public Build Progress field: link"); }
  requireRule(url.protocol === "https:" && !url.username && !url.password && !url.port &&
    !url.search && !url.hash && !value.includes("?") && !value.includes("#") &&
    !value.includes("\\"), "link");
}

function optionalLink(value: RecordData, key: string): void {
  if (Object.hasOwn(value, key)) link(value[key]);
}

function entries(value: unknown, validate: (entry: unknown) => RecordData): RecordData[] {
  requireRule(Array.isArray(value) && value.length <= LIMITS.entries, "entries");
  // Require ordinary dense arrays: JSON cannot faithfully carry extra properties/holes.
  requireRule(Object.getPrototypeOf(value) === Array.prototype &&
    Reflect.ownKeys(value).length === value.length + 1, "entries");
  const result: RecordData[] = [];
  const ids = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    requireRule(property && "value" in property && property.enumerable, "entry");
    const item = validate(property.value);
    id(item.id);
    requireRule(!ids.has(item.id), "duplicate id");
    ids.add(item.id);
    result.push(item);
  }
  return result;
}

function snapshot(value: unknown, fields: readonly string[]): RecordData {
  // Read the discriminant only after rejecting accessors and non-data records.
  const data = record(value, ["schemaVersion", "projectId", "dataKind", ...fields], ["notice"]);
  requireRule(data.schemaVersion === 1, "schemaVersion");
  id(data.projectId);
  requireRule(data.dataKind === "synthetic" || data.dataKind === "published", "dataKind");
  requireRule(data.dataKind === "synthetic" ? data.notice === SYNTHETIC_NOTICE :
    !Object.hasOwn(data, "notice"), "notice");
  return data;
}

function progressEntry(value: unknown): RecordData {
  const data = record(value, ["id", "title", "status"]);
  text(data.title, LIMITS.title, "title");
  requireRule(PROGRESS_STATUSES.some(status => status === data.status), "status");
  return data;
}

/** Shape validation only. Does not establish approval or make private records public. */
export function assertProjectProgressData(value: unknown): asserts value is ProjectProgressData {
  const data = snapshot(value, ["milestones", "tasks", "recentActivity"]);
  entries(data.milestones, progressEntry);
  entries(data.tasks, progressEntry);
  const activity = entries(data.recentActivity, value => {
    const item = record(value, ["id", "summary", "acceptedOn"], ["link"]);
    text(item.summary, LIMITS.summary, "summary");
    requireRule(typeof item.acceptedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.acceptedOn), "acceptedOn");
    const date = new Date(`${item.acceptedOn}T00:00:00.000Z`);
    requireRule(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === item.acceptedOn, "acceptedOn");
    optionalLink(item, "link");
    return item;
  });
  requireRule(activity.every((item, index) => index === 0 ||
    String(activity[index - 1].acceptedOn) >= String(item.acceptedOn)), "activity order");
}

/** Call only on deliberately prepared publication data, never raw participant records. */
export function assertCrewAndContributionsData(value: unknown): asserts value is CrewAndContributionsData {
  const data = snapshot(value, ["contributors", "contributions"]);
  const agentIds = new Set<string>();
  const contributors = entries(data.contributors, value => {
    const item = record(value, ["id", "displayName"], ["profileUrl", "agent"]);
    text(item.displayName, LIMITS.displayName, "displayName");
    optionalLink(item, "profileUrl");
    if (Object.hasOwn(item, "agent")) {
      const agent = record(item.agent, ["id", "displayName"]);
      id(agent.id);
      text(agent.displayName, LIMITS.displayName, "agent displayName");
      requireRule(!agentIds.has(agent.id), "duplicate agent id");
      agentIds.add(agent.id);
    }
    return item;
  });
  entries(data.contributions, value => {
    const item = record(value, ["id", "title", "contributorId", "status"], ["agentId", "link"]);
    text(item.title, LIMITS.title, "title");
    id(item.contributorId);
    const contributor = contributors.find(person => person.id === item.contributorId);
    requireRule(contributor, "contributorId reference");
    if (Object.hasOwn(item, "agentId")) {
      id(item.agentId);
      requireRule((contributor.agent as PublicAgent | undefined)?.id === item.agentId, "agentId reference");
    }
    requireRule(CONTRIBUTION_STATUSES.some(status => status === item.status), "status");
    optionalLink(item, "link");
    return item;
  });
}
