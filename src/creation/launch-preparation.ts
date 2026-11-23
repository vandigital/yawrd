import type { ProposedYawrdPreview } from './yawrd-preview.ts';
import type { PreparationBinding } from './preparation-contract.ts';
import type { GovernanceSource } from './governance-configuration.ts';
export type LaunchSource = { binding: PreparationBinding; governanceRevision: number; configurationSource: GovernanceSource; publicName: string; publicDescription: string; profileSource: { revision: number; digest: string; nameField: 'blueprint.title'; descriptionField: 'blueprint.summary' } };
export type LaunchView = { binding: PreparationBinding; title: string; deployment: { name: string; description: string; daoAccountId: string }; source: LaunchSource; current: boolean; fundingPlan: 'none-planned' | 'unresolved'; publicationEnabled: boolean; published?: import('./publication.ts').PublicationReceipt; proposed: ProposedYawrdPreview; funds?: ProjectFunds };
export type ProjectFunds = { status: 'unknown' } | { status: 'observed'; amountYocto: string; lockedYocto: string; blockHeight: number; blockHash: string };
/** The exact proposed profile is approved Blueprint title/summary, not deployment identity. Publication requires separate consent. */
export function publicLaunchPreview(source: LaunchSource) {
  return { name: source.publicName, description: source.publicDescription };
}
/** Only the explicit intake value establishes the no-funding decision. */
export function launchFundingPlan(budget: unknown): LaunchView['fundingPlan'] {
  return budget === 'no-money-needed' ? 'none-planned' : 'unresolved';
}
export function formatLaunchAmount(value: string) { const s=value.padStart(25,'0'); return s.slice(0,-24)+(s.slice(-24).replace(/0+$/,'') ? '.'+s.slice(-24).replace(/0+$/,'') : ''); }
/** JSONB key order is not a change to the accepted source. */
export function sameLaunchSource(a: LaunchSource, b: LaunchSource) {
  const ordered = (v: any): any => v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordered(v[k])])) : v;
  return JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
}
