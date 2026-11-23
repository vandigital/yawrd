import 'server-only';
import type { Query } from '../participants/database.ts';
import { fail, WorkflowError } from '../participants/repository.ts';
import { projectInput, sessionInput } from './validation.ts';
import { preparationDigest, preparationText } from './preparation-repository.ts';
import { validatePreparation } from './preparation-contract.ts';
import { ContributionInputError, validateContributionConfiguration, type ContributionSource, type ContributionView } from './contribution-configuration.ts';

function source(raw: any): ContributionSource {
  fail(raw && Number.isSafeInteger(raw.revision) && raw.revision > 0, 'contribution_integrity_error', 503);
  const artifacts = validatePreparation(JSON.parse(raw.artifactText));
  fail(preparationDigest(preparationText(artifacts)) === raw.digest, 'contribution_integrity_error', 503);
  return { revision: raw.revision, digest: raw.digest, title: artifacts.blueprint.title, tasks: artifacts.tasks, references: artifacts.references };
}
function revision(value: unknown, zero = false): asserts value is number {
  fail(Number.isSafeInteger(value) && Number(value) >= (zero ? 0 : 1) && Number(value) < Number.MAX_SAFE_INTEGER, 'invalid_revision');
}
export class ContributionConfigurationRepository {
  private readonly query: Query;
  constructor(query: Query) { this.query = query; }
  private async execute(sql: string, args: unknown[]): Promise<ContributionView> {
    try {
      const [row] = await this.query(sql, args), raw = row?.workspace as any;
      fail(raw?.binding?.creationId === args[1], 'contribution_integrity_error', 503);
      const approved = source(raw.approved);
      let saved: ContributionView['saved'] = null;
      if (raw.saved) {
        const s = raw.saved, approvedSource = source(s.source);
        revision(s.revision);
        const configuration = validateContributionConfiguration(JSON.parse(s.configurationText), approvedSource);
        fail(preparationDigest(JSON.stringify(configuration)) === s.digest && s.savedBy === raw.binding.founderAccountId &&
          Number.isFinite(Date.parse(s.savedAt)), 'contribution_integrity_error', 503);
        saved = { revision: s.revision, source: approvedSource, configuration, digest: s.digest, savedBy: s.savedBy, savedAt: s.savedAt };
      }
      // No intake, private notes, model provenance or SQL-only fields reach the browser.
      return { binding: raw.binding, approved, saved };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (['42P01', '42883', '42501'].includes(e.code ?? '')) throw new WorkflowError('contribution_storage_required', 503);
      const codes = ['sign_in_required', 'creation_not_found', 'creation_deployment_unverified', 'preparation_payment_required',
        'contribution_approval_required', 'contribution_source_changed', 'contribution_revision_conflict', 'contribution_review_required'];
      if (e.code === 'P0001' && codes.includes(e.message ?? '')) throw new WorkflowError(e.message!, e.message === 'sign_in_required' ? 401 : e.message === 'creation_not_found' ? 404 : 409);
      if (error instanceof ContributionInputError || error instanceof SyntaxError || (error as Error)?.message === 'invalid_preparation') throw new WorkflowError('contribution_integrity_error', 503);
      throw error;
    }
  }
  read(hash: string | null, id: string) {
    sessionInput(hash); projectInput(id);
    return this.execute('SELECT yawrd.creation_contribution_read($1,$2) AS workspace', [hash, id]);
  }
  async save(hash: string | null, id: string, expectedRevision: unknown, preparationRevision: unknown, preparationDigestValue: unknown, reviewedSource: unknown, value: unknown) {
    sessionInput(hash); projectInput(id); revision(expectedRevision, true); revision(preparationRevision);
    fail(typeof preparationDigestValue === 'string' && /^[a-f0-9]{64}$/.test(preparationDigestValue) && typeof reviewedSource === 'boolean', 'invalid_request');
    const view = await this.read(hash, id);
    fail(view.approved.revision === preparationRevision && view.approved.digest === preparationDigestValue, 'contribution_source_changed', 409);
    const configuration = validateContributionConfiguration(value, view.approved);
    return this.execute('SELECT yawrd.creation_contribution_save($1,$2,$3,$4,$5,$6,$7) AS workspace',
      [hash, id, expectedRevision, preparationRevision, preparationDigestValue, reviewedSource, JSON.stringify(configuration)]);
  }
}
