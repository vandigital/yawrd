import 'server-only';
import type { Query } from '../participants/database.ts';
import { fail, WorkflowError } from '../participants/repository.ts';
import { projectInput, sessionInput } from './validation.ts';
import { GOVERNANCE_CONSENT, sameGovernanceSource, type GovernanceSource, type GovernanceView } from './governance-configuration.ts';

function revision(value: unknown, zero = false): asserts value is number {
  fail(Number.isSafeInteger(value) && Number(value) >= (zero ? 0 : 1) && Number(value) < Number.MAX_SAFE_INTEGER, 'invalid_revision');
}
function source(value: GovernanceSource, input = false) {
  const code = input ? 'invalid_request' : 'governance_integrity_error', status = input ? 400 : 503;
  fail(value && typeof value === 'object', code, status);
  fail([value.contributionRevision, value.preparationRevision].every(v => Number.isSafeInteger(v) && v > 0 && v < Number.MAX_SAFE_INTEGER) &&
    [value.contributionDigest, value.preparationDigest].every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)), code, status);
}
const bindingKeys = ['creationId', 'founderAccountId', 'daoAccountId', 'deploymentTransaction', 'deploymentDigest', 'paymentTransaction', 'paymentDigest'] as const;
export class GovernanceConfigurationRepository {
  private readonly query: Query;
  constructor(query: Query) { this.query = query; }
  private async execute(sql: string, args: unknown[]): Promise<GovernanceView> {
    try {
      const [row] = await this.query(sql, args), v = row?.workspace as GovernanceView;
      fail(v?.binding?.creationId === args[1] && bindingKeys.every(k => typeof v.binding[k] === 'string' && v.binding[k]), 'governance_integrity_error', 503);
      source(v.source);
      fail(typeof v.title === 'string' && typeof v.contributionCurrent === 'boolean', 'governance_integrity_error', 503);
      if (v.saved) {
        const s = v.saved; revision(s.revision); source(s.source);
        fail(s.reviewMode === 'founder-led' && s.consentVersion === GOVERNANCE_CONSENT && s.savedBy === v.binding.founderAccountId &&
          bindingKeys.every(k => s.binding?.[k] === v.binding[k]) && Number.isFinite(Date.parse(s.savedAt)), 'governance_integrity_error', 503);
      }
      return v;
    } catch (error) {
      const e = error as { code?: string; message?: string };
      if (['42P01', '42883', '42501'].includes(e.code ?? '')) throw new WorkflowError('governance_storage_required', 503);
      const codes = ['sign_in_required', 'creation_not_found', 'creation_deployment_unverified', 'preparation_payment_required',
        'contribution_approval_required', 'governance_contributions_required', 'governance_source_changed', 'governance_binding_changed',
        'governance_revision_conflict', 'governance_confirmation_required'];
      if (e.code === 'P0001' && codes.includes(e.message ?? '')) throw new WorkflowError(e.message!, e.message === 'sign_in_required' ? 401 : e.message === 'creation_not_found' ? 404 : 409);
      throw error;
    }
  }
  read(hash: string | null, id: string) {
    sessionInput(hash); projectInput(id);
    return this.execute('SELECT yawrd.creation_governance_read($1,$2) AS workspace', [hash, id]);
  }
  async save(hash: string | null, id: string, expectedRevision: unknown, requested: GovernanceSource, confirmed: unknown) {
    sessionInput(hash); projectInput(id); revision(expectedRevision, true); source(requested, true);
    fail(confirmed === true, 'governance_confirmation_required');
    const view = await this.read(hash, id);
    fail(view.contributionCurrent && sameGovernanceSource(view.source, requested), 'governance_source_changed', 409);
    return this.execute('SELECT yawrd.creation_governance_save($1,$2,$3,$4,$5,$6,$7,$8) AS workspace',
      [hash, id, expectedRevision, requested.contributionRevision, requested.contributionDigest, requested.preparationRevision, requested.preparationDigest, confirmed]);
  }
}
