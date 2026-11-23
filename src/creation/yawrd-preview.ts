import type { SavedContributionConfiguration } from './contribution-configuration.ts';

/** Proposed presentation only; not a publication payload or acceptance evidence. */
export type ProposedYawrdPreview = {
  name: string; description: string; fundingPlan: 'none-planned' | 'unresolved';
  progress: { accepted: null; planned: number };
  tasks: { id: string; title: string; summary: string;
    dependencies: { title: string; included: boolean }[];
    deliverables: string[]; allocation: 'unallocated' | 'not-set'; rewardTerms: 'undecided' | 'private-unpaid-choice' }[];
};
export function proposedYawrdPreview(identity: Pick<ProposedYawrdPreview,'name'|'description'>,
  saved: SavedContributionConfiguration, fundingPlan: ProposedYawrdPreview['fundingPlan']): ProposedYawrdPreview {
  const included = new Set(saved.configuration.tasks.filter(t=>t.included).map(t=>t.taskId));
  const tasks = saved.source.tasks.filter(t=>included.has(t.id)).map(t=>({
    id:t.id, title:t.title, summary:t.brief,
    dependencies:t.dependencies.map(id=>({included:included.has(id),
      title:included.has(id) ? saved.source.tasks.find(d=>d.id===id)!.title : 'Excluded prerequisite'})),
    deliverables:[...t.deliverables], allocation:fundingPlan==='none-planned' ? 'unallocated' as const : 'not-set' as const,
    rewardTerms:saved.configuration.tasks.find(c=>c.taskId===t.id)!.rewardTerms==='undecided' ? 'undecided' as const : 'private-unpaid-choice' as const,
  }));
  return {name:identity.name,description:identity.description,fundingPlan,progress:{accepted:null,planned:tasks.length},tasks};
}
