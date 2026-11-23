import 'server-only';
import type { Query } from '../participants/database.ts';
import { fail, WorkflowError } from '../participants/repository.ts';
import { projectInput, sessionInput } from './validation.ts';
import { sameGovernanceSource, type GovernanceView } from './governance-configuration.ts';
import { validatePreparation } from './preparation-contract.ts';
import { preparationDigest, preparationText } from './preparation-repository.ts';
import { ContributionConfigurationRepository } from './contribution-configuration-repository.ts';
import { proposedYawrdPreview } from './yawrd-preview.ts';
import { launchFundingPlan, publicLaunchPreview, type LaunchSource, type LaunchView } from './launch-preparation.ts';
export const LAUNCH_CONTEXT_SQL = `SELECT jsonb_build_object('governance',g.v,'budget',c.intake#>>'{answers,intendedBudget}',
  'deployment',jsonb_build_object('name',d.prepared#>>'{plan,initializer,config,name}',
    'description',d.prepared#>>'{plan,initializer,config,purpose}','daoAccountId',d.dao_account_id),
  'profile',p.v->'approved',
  'source',jsonb_build_object('binding',g.v->'binding','governanceRevision',g.v#>'{saved,revision}','configurationSource',g.v->'source')) AS context
FROM (SELECT yawrd.creation_governance_read($1,$2) AS v) g
CROSS JOIN LATERAL yawrd.creation_deployment_read($1,$2) d
CROSS JOIN LATERAL yawrd.creation_read($1,$2) c
CROSS JOIN LATERAL (SELECT yawrd.creation_contribution_read($1,$2) AS v) p`;
export class LaunchPreparationRepository {
  private readonly query: Query;
  constructor(query: Query) { this.query=query; }
  private async execute(sql: string, args: unknown[]) {
    try { return await this.query(sql,args); }
    catch (error) {
      const e=error as {code?:string;message?:string};
      if (['42P01','42883','42501'].includes(e.code ?? '')) throw new WorkflowError('launch_storage_required',503);
      if (e.code==='P0001' && ['sign_in_required','creation_not_found','creation_deployment_unverified','preparation_payment_required','contribution_approval_required','governance_contributions_required','governance_binding_changed','launch_governance_required','launch_source_changed','launch_revision_conflict','launch_invalid_choices'].includes(e.message ?? ''))
        throw new WorkflowError(e.message!,e.message==='sign_in_required'?401:e.message==='creation_not_found'?404:409);
      throw error;
    }
  }
  async read(hash: string | null,id: string): Promise<LaunchView> {
    sessionInput(hash); projectInput(id);
    const [row]=await this.execute(LAUNCH_CONTEXT_SQL,[hash,id]);
    const raw=row?.context as {governance:GovernanceView;source:LaunchSource;budget:unknown;
      deployment:LaunchView['deployment'];profile:{revision:number;digest:string;artifactText:string}}, g=raw?.governance, base=raw?.source;
    fail(g?.binding?.creationId===id && base?.binding?.creationId===id && raw.deployment?.daoAccountId===g.binding.daoAccountId &&
      typeof raw.deployment.name==='string' && typeof raw.deployment.description==='string','launch_integrity_error',503);
    const profile=raw.profile;
    fail(profile && Number.isSafeInteger(profile.revision) && profile.revision>0 && typeof profile.artifactText==='string','launch_integrity_error',503);
    let artifacts;
    try { artifacts=validatePreparation(JSON.parse(profile.artifactText)); }
    catch { throw new WorkflowError('launch_integrity_error',503); }
    fail(preparationDigest(preparationText(artifacts))===profile.digest,'launch_integrity_error',503);
    fail(artifacts.blueprint.title.trim() && artifacts.blueprint.summary.trim(),'launch_profile_required',409);
    const source:LaunchSource={binding:base.binding,governanceRevision:base.governanceRevision,configurationSource:base.configurationSource,
      publicName:artifacts.blueprint.title,publicDescription:artifacts.blueprint.summary,
      profileSource:{revision:profile.revision,digest:profile.digest,nameField:'blueprint.title',descriptionField:'blueprint.summary'}};
    fail(g.saved,'launch_governance_required',409);
    const current=g.contributionCurrent && sameGovernanceSource(g.source,g.saved.source);
    const contributions=await new ContributionConfigurationRepository(this.query).read(hash,id), saved=contributions.saved;
    // Separate reads must agree: do not mix a newer saved task set with older readiness.
    fail(saved && saved.revision===source.configurationSource.contributionRevision && saved.digest===source.configurationSource.contributionDigest &&
      saved.source.revision===source.configurationSource.preparationRevision && saved.source.digest===source.configurationSource.preparationDigest &&
      Object.keys(g.binding).every(k=>g.binding[k as keyof typeof g.binding]===contributions.binding[k as keyof typeof g.binding]), 'launch_source_changed',409);
    fail(contributions.approved.revision===profile.revision && contributions.approved.digest===profile.digest,'launch_source_changed',409);
    const fundingPlan=launchFundingPlan(raw.budget);
    return {binding:g.binding,title:g.title,deployment:raw.deployment,source,current:current && contributions.approved.revision===saved.source.revision && contributions.approved.digest===saved.source.digest,
      fundingPlan,publicationEnabled:false,proposed:proposedYawrdPreview(publicLaunchPreview(source),saved,fundingPlan)};
  }
}
