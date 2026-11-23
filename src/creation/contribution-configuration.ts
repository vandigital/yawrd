import type { PreparationArtifacts, PreparationBinding } from './preparation-contract.ts';

export const CONTRIBUTION_SCHEMA = 'yawrd.creation-contribution-configuration.v1' as const;
export const CONTRIBUTION_BYTES = 131072;
export type ContributionSource = {
  revision: number; digest: string; title: string;
  tasks: PreparationArtifacts['tasks']; references: PreparationArtifacts['references'];
};
export type ContributionConfiguration = {
  schemaVersion: typeof CONTRIBUTION_SCHEMA;
  participationTerms: string;
  tasks: { taskId: string; included: boolean; rewardTerms: 'undecided' | 'unpaid'; unpaidAcknowledged: boolean; rewardNote: string }[];
};
export type SavedContributionConfiguration = {
  revision: number; source: ContributionSource; configuration: ContributionConfiguration;
  digest: string; savedBy: string; savedAt: string;
};
export type ContributionView = {
  binding: PreparationBinding; approved: ContributionSource; saved: SavedContributionConfiguration | null;
};
export class ContributionInputError extends Error {
  constructor() { super('invalid_contribution_configuration'); }
}
function need(value: unknown): asserts value { if (!value) throw new ContributionInputError(); }
function record(value: unknown, keys: string[]) {
  need(value && typeof value === 'object' && !Array.isArray(value));
  const r = value as Record<string, unknown>;
  need([Object.prototype, null].includes(Object.getPrototypeOf(r)) && Object.keys(r).length === keys.length);
  keys.forEach(k => need(Object.hasOwn(Object.getOwnPropertyDescriptor(r, k) ?? {}, 'value')));
  return r;
}
function text(value: unknown, max: number): string {
  need(typeof value === 'string' && value.length <= max && value.isWellFormed() && !value.includes('\0'));
  return value;
}
/** Terms are a separate founder decision; never infer them from budget or AI wording. */
export function initialContributionConfiguration(source: ContributionSource): ContributionConfiguration {
  return { schemaVersion: CONTRIBUTION_SCHEMA, participationTerms: '', tasks: source.tasks.map(t => ({
    taskId: t.id, included: true, rewardTerms: 'undecided', unpaidAcknowledged: false, rewardNote: '',
  })) };
}
export function validateContributionConfiguration(value: unknown, source: ContributionSource): ContributionConfiguration {
  const r = record(value, ['schemaVersion', 'participationTerms', 'tasks']);
  need(r.schemaVersion === CONTRIBUTION_SCHEMA && Array.isArray(r.tasks) && r.tasks.length === source.tasks.length);
  const ids = new Set<string>();
  const tasks = r.tasks.map((v): ContributionConfiguration['tasks'][number] => {
    const t = record(v, ['taskId', 'included', 'rewardTerms', 'unpaidAcknowledged', 'rewardNote']);
    const taskId = text(t.taskId, 64);
    need(source.tasks.some(s => s.id === taskId) && !ids.has(taskId)); ids.add(taskId);
    need(typeof t.included === 'boolean' && typeof t.unpaidAcknowledged === 'boolean');
    need(t.rewardTerms === 'undecided' || t.rewardTerms === 'unpaid');
    need(t.unpaidAcknowledged === (t.rewardTerms === 'unpaid'));
    return { taskId, included: t.included, rewardTerms: t.rewardTerms, unpaidAcknowledged: t.unpaidAcknowledged, rewardNote: text(t.rewardNote, 2000) };
  });
  const result: ContributionConfiguration = { schemaVersion: CONTRIBUTION_SCHEMA,
    participationTerms: text(r.participationTerms, 4000), tasks: source.tasks.map(s => tasks.find(t => t.taskId === s.id)!) };
  need(new TextEncoder().encode(JSON.stringify(result)).length <= CONTRIBUTION_BYTES);
  return result;
}
export function sameContributionSource(a: ContributionSource, b: ContributionSource) {
  return a.revision === b.revision && a.digest === b.digest;
}
/** Explicit review starts a new draft; it never saves or inherits unpaid consent. */
export function carryContributionConfiguration(previous: ContributionConfiguration, source: ContributionSource): ContributionConfiguration {
  const result = initialContributionConfiguration(source);
  result.participationTerms = previous.participationTerms;
  result.tasks = result.tasks.map(t => {
    const old = previous.tasks.find(p => p.taskId === t.taskId);
    return old ? { ...old, unpaidAcknowledged: false } : t;
  });
  return result;
}
export function omittedContributionDependencies(configuration: ContributionConfiguration, source: ContributionSource): string[] {
  const included = new Set(configuration.tasks.filter(t => t.included).map(t => t.taskId));
  return source.tasks.filter(t => included.has(t.id)).flatMap(t => t.dependencies.filter(d => !included.has(d)).map(d => `${t.title} depends on ${source.tasks.find(s => s.id === d)?.title ?? d}.`));
}
