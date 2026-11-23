/** Private review contract. No provider, wallet, database or publication capability. */
export const PREPARATION_SCHEMA = 'yawrd.creation-preparation.v1' as const;
export const PREPARATION_CONSENT = 'creation-preparation-review-v1' as const;
export const PREPARATION_BYTES = 262144;
export type PreparationArtifacts = {
  schemaVersion: typeof PREPARATION_SCHEMA;
  blueprint: { title: string; summary: string; outcome: string; scope: string[]; boundaries: string[] };
  skill: { name: string; purpose: string; instructions: string[] };
  context: {
    verifiedFacts: { text: string; source: string; verifiedAt: string }[];
    proposedDefaults: { text: string; rationale: string }[];
    founderDecisions: string[]; activationDetails: string[];
  };
  references: { id: string; title: string; kind: 'interface' | 'fixture' | 'reference'; content: string }[];
  tasks: {
    id: string; title: string; brief: string; deliverables: string[]; dependencies: string[];
    sharedReferences: string[]; acceptanceCriteria: { check: string; evidence: string }[];
    unresolvedDecisions: string[]; rewardTerms: 'undecided' | 'unpaid'; rewardNote: string;
  }[];
  openQuestions: string[];
  privateNotes: string;
};
export type PreparationGeneration = { provider: 'near-ai-cloud'; model: string; promptVersion: string; responseId: string; sourceDigest: string };
export type PreparationVersion = {
  revision: number; parentRevision: number | null; digest: string; artifacts: PreparationArtifacts;
  origin: 'ai-generated' | 'founder-edited'; generation: PreparationGeneration | null;
  authorAccountId: string | null; createdAt: string;
  approval: null | { digest: string; approvedBy: string; approvedAt: string; consentVersion: typeof PREPARATION_CONSENT };
};
export type PreparationBinding = {
  creationId: string; founderAccountId: string; daoAccountId: string;
  deploymentTransaction: string; deploymentDigest: string; paymentTransaction: string; paymentDigest: string;
};
export type PreparationView = { binding: PreparationBinding; versions: PreparationVersion[]; generationEnabled: boolean;
  generation?: import('./preparation-generation-contract.ts').GenerationView };

export class PreparationInputError extends Error {
  constructor() { super('invalid_preparation'); }
}
function requireInput(value: unknown): asserts value { if (!value) throw new PreparationInputError(); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  requireInput(value && typeof value === 'object' && !Array.isArray(value));
  const r = value as Record<string, unknown>;
  requireInput([Object.prototype, null].includes(Object.getPrototypeOf(r)) && Object.keys(r).length === keys.length);
  keys.forEach(k => requireInput(Object.hasOwn(Object.getOwnPropertyDescriptor(r,k) ?? {}, 'value')));
  return r;
}
function text(value: unknown): string {
  requireInput(typeof value === 'string' && value.length <= 12000 && !value.includes('\0') && value.isWellFormed());
  return value;
}
function array<T>(value: unknown, map: (v: unknown) => T, max = 40): T[] {
  requireInput(Array.isArray(value) && value.length <= max);
  return value.map(map);
}
const texts = (v: unknown) => array(v,text);
const identifier = (v: unknown) => { const s=text(v); requireInput(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(s)); return s; };
export function validatePreparation(value: unknown): PreparationArtifacts {
  const r = object(value,['schemaVersion','blueprint','skill','context','references','tasks','openQuestions','privateNotes']);
  requireInput(r.schemaVersion === PREPARATION_SCHEMA);
  const b=object(r.blueprint,['title','summary','outcome','scope','boundaries']);
  const s=object(r.skill,['name','purpose','instructions']);
  const c=object(r.context,['verifiedFacts','proposedDefaults','founderDecisions','activationDetails']);
  const result: PreparationArtifacts = {
    schemaVersion: PREPARATION_SCHEMA,
    blueprint:{title:text(b.title),summary:text(b.summary),outcome:text(b.outcome),scope:texts(b.scope),boundaries:texts(b.boundaries)},
    skill:{name:text(s.name),purpose:text(s.purpose),instructions:texts(s.instructions)},
    context:{
      verifiedFacts:array(c.verifiedFacts,v=>{const x=object(v,['text','source','verifiedAt']);return {text:text(x.text),source:text(x.source),verifiedAt:text(x.verifiedAt)};}),
      proposedDefaults:array(c.proposedDefaults,v=>{const x=object(v,['text','rationale']);return {text:text(x.text),rationale:text(x.rationale)};}),
      founderDecisions:texts(c.founderDecisions),activationDetails:texts(c.activationDetails),
    },
    references:array(r.references,v=>{const x=object(v,['id','title','kind','content']);requireInput(['interface','fixture','reference'].includes(String(x.kind)));return {id:identifier(x.id),title:text(x.title),kind:x.kind as 'interface'|'fixture'|'reference',content:text(x.content)};}),
    tasks:array(r.tasks,v=>{
      const x=object(v,['id','title','brief','deliverables','dependencies','sharedReferences','acceptanceCriteria','unresolvedDecisions','rewardTerms','rewardNote']);
      requireInput(x.rewardTerms==='undecided'||x.rewardTerms==='unpaid');
      return {id:identifier(x.id),title:text(x.title),brief:text(x.brief),deliverables:texts(x.deliverables),dependencies:array(x.dependencies,identifier),
        sharedReferences:array(x.sharedReferences,identifier),acceptanceCriteria:array(x.acceptanceCriteria,v=>{const a=object(v,['check','evidence']);return {check:text(a.check),evidence:text(a.evidence)};}),
        unresolvedDecisions:texts(x.unresolvedDecisions),rewardTerms:x.rewardTerms as 'undecided'|'unpaid',rewardNote:text(x.rewardNote)};
    }),openQuestions:texts(r.openQuestions),privateNotes:text(r.privateNotes),
  };
  // Browser/server equivalent UTF-8 bound. Never truncate founder wording.
  requireInput(new TextEncoder().encode(JSON.stringify(result)).length <= PREPARATION_BYTES);
  requireInput(new Set(result.tasks.map(t=>t.id)).size === result.tasks.length && new Set(result.references.map(t=>t.id)).size === result.references.length);
  return result;
}

/** Drafts may be incomplete. Structural review checks are not semantic certification. */
export function preparationIssues(a: PreparationArtifacts): string[] {
  const issues: string[]=[];
  const need=(ok:unknown,label:string)=>{if(!ok)issues.push(label);};
  const full=(items:string[])=>items.length>0&&items.every(v=>v.trim());
  need(a.blueprint.title.trim()&&a.blueprint.summary.trim()&&a.blueprint.outcome.trim(),'Complete the project overview and outcome.');
  need(full(a.blueprint.scope)&&full(a.blueprint.boundaries),'Describe the scope and boundaries.');
  need(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.skill.name)&&a.skill.name.length<=64&&a.skill.purpose.trim()&&full(a.skill.instructions),'Complete the contributor Skill, including a lowercase name with hyphens.');
  const references=new Set(a.references.map(r=>r.id)),tasks=new Map(a.tasks.map(t=>[t.id,t]));
  need(a.references.every(r=>r.title.trim()&&r.content.trim()),'Include the content of each shared reference.');
  need(a.context.verifiedFacts.every(f=>f.text.trim()&&f.source.trim()&&/^\d{4}-\d\d-\d\dT/.test(f.verifiedAt)&&Number.isFinite(Date.parse(f.verifiedAt))),'Give each reported fact its source and verification time.');
  need(a.context.proposedDefaults.every(d=>d.text.trim()&&d.rationale.trim()),'Explain the proposed defaults.');
  need(a.tasks.length,'Include proposed work for review.');
  for(const task of a.tasks){
    need(task.title.trim()&&task.brief.trim()&&full(task.deliverables)&&task.acceptanceCriteria.length&&task.acceptanceCriteria.every(c=>c.check.trim()&&c.evidence.trim()),'Complete each task’s scope, deliverables, checks and evidence.');
    need(new Set(task.dependencies).size===task.dependencies.length&&task.dependencies.every(d=>tasks.has(d)&&d!==task.id),'Use valid, unique task dependencies.');
    need(new Set(task.sharedReferences).size===task.sharedReferences.length&&task.sharedReferences.every(r=>references.has(r)),'Include every referenced interface or fixture.');
  }
  const visiting=new Set<string>(),done=new Set<string>();
  function visit(id:string):boolean{if(visiting.has(id))return false;if(done.has(id))return true;visiting.add(id);
    for(const d of tasks.get(id)?.dependencies??[])if(!visit(d))return false;
    visiting.delete(id);done.add(id);return true;}
  need(a.tasks.every(t=>visit(t.id)),'Resolve circular task dependencies.');
  return [...new Set(issues)];
}

/** Only selected contributor content; private notes, intake and provider provenance are excluded. */
export function preparationSkill(a: PreparationArtifacts, approved = false): string {
  const list=(v:string[])=>v.length?v.map(t=>`- ${t}`).join('\n'):'None recorded.';
  return `---\nname: ${JSON.stringify(a.skill.name)}\ndescription: ${JSON.stringify(a.skill.purpose)}\n---\n\n# ${a.blueprint.title}\n\n${approved?'Founder reviewed this exact preparation version.':'Draft — founder review required.'} This file grants no repository access, task activation, publication, reward entitlement or spending permission.\n\n## Project overview\n${a.blueprint.summary}\n\n## Intended outcome\n${a.blueprint.outcome}\n\n## Scope\n${list(a.blueprint.scope)}\n\n## Boundaries\n${list(a.blueprint.boundaries)}\n\n## AI Contributor Skill\n${a.skill.purpose}\n\n${list(a.skill.instructions)}\n\n## Reported verified facts\nSources and times below are recorded claims, not fresh verification by this export.\n${list(a.context.verifiedFacts.map(f=>`${f.text} — source: ${f.source}; verified at: ${f.verifiedAt}`))}\n\n## Proposed defaults — distinguish from decisions\n${list(a.context.proposedDefaults.map(d=>`${d.text} — rationale: ${d.rationale}`))}\n\n## Founder decisions\n${list(a.context.founderDecisions)}\n\n## Activation details — verify before work\n${list(a.context.activationDetails)}\n\n## Proposed tasks\n${a.tasks.map(t=>`### ${t.id}: ${t.title}\n${t.brief}\n\nDeliverables:\n${list(t.deliverables)}\n\nDependencies: ${t.dependencies.join(', ')||'None declared'}\nShared references: ${t.sharedReferences.join(', ')||'None declared'} (contents included below)\n\nAcceptance checks and required evidence:\n${list(t.acceptanceCriteria.map(c=>`${c.check} — Evidence: ${c.evidence}`))}\n\nReward terms: ${t.rewardTerms==='unpaid'?'Explicitly unpaid — no monetary reward is offered.':'Undecided — no payment entitlement is offered.'}\n${t.rewardNote}\n\nUnresolved decisions:\n${list(t.unresolvedDecisions)}`).join('\n\n')}\n\n## Shared interfaces, fixtures and references\n${a.references.map(r=>`### ${r.id}: ${r.title} (${r.kind})\n${r.content}`).join('\n\n')||'None recorded.'}\n\n## Unresolved project questions\n${list(a.openQuestions)}\n`;
}
