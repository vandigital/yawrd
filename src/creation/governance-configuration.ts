import type { PreparationBinding } from './preparation-contract.ts';

export const GOVERNANCE_CONSENT = 'creation-founder-governance-v1' as const;
export type GovernanceSource = {
  contributionRevision: number; contributionDigest: string;
  preparationRevision: number; preparationDigest: string;
};
export type SavedGovernanceConfiguration = {
  revision: number; source: GovernanceSource; binding: PreparationBinding;
  reviewMode: 'founder-led'; consentVersion: typeof GOVERNANCE_CONSENT;
  savedBy: string; savedAt: string;
};
export type GovernanceView = {
  binding: PreparationBinding; title: string; source: GovernanceSource;
  contributionCurrent: boolean; saved: SavedGovernanceConfiguration | null;
};
export function sameGovernanceSource(a: GovernanceSource, b: GovernanceSource) {
  return a.contributionRevision === b.contributionRevision && a.contributionDigest === b.contributionDigest &&
    a.preparationRevision === b.preparationRevision && a.preparationDigest === b.preparationDigest;
}
