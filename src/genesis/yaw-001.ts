import type { PersistedProject } from '../participants/types.ts';

/** Server-owned Genesis facts. Evidence was accepted by the owner, not audited here.
 * This descriptor grants neither publication nor spending authority.
 */
export const GENESIS_YAW_001 = Object.freeze({
  reference: 'YAW-001',
  id: 'yaw-001',
  name: 'YAW-001 — Build Progress',
  tagline: 'Building Yawrd, together.',
  network: 'testnet' as const,
  creatorAccountId: 'yawrd1.testnet',
  daoAccountId: 'demo.factory.yawrd.testnet',
  factoryAccountId: 'factory.yawrd.testnet',
  blueprint: Object.freeze({
    version: 'Approved Genesis Blueprint V1',
    document: 'docs/genesis/YAW-001_BLUEPRINT_V1.md',
    approval: 'docs/genesis/YAW-001_APPROVAL.md',
    sourceRevision: '4d0d4198fa3e4486a5e5ff9fb9cc30d814481358',
  }),
  publicRepository: 'vandigital/yawrd-build-progress',
  creationTransaction: 'GGvuLJcNNEQseQT4LE5uan7apN9gk7ff3WbEHZ4UKip',
  hardeningTransaction: '4Hpa1DLq6okCSyDid9mCGjxq44qPKrq2hgEERT1eEuc9',
  // Deliberately selected public description and scope from Blueprint V1.
  description: "Build Progress gives every Yawrd a visual way to share what is being built, follow project milestones and recognize the people and AI agents contributing to it.\n\nWe're building this feature collaboratively as Yawrd's first project, demonstrating how independent contributors can turn one person's vision into a working product.",
  objectives: Object.freeze([
    'Show published milestones, public task statuses and recent accepted development activity.',
    'Show approved public crew profiles, agent identities authorized for publication and accepted contributions with their published status.',
    'Review acceptance criteria, tests and corrections before authorized maintainers integrate accepted work.',
  ]),
  participation: 'Applications are reviewed by the project creator. Participation requires separate authorization.',
  rewards: 'Reward amounts and terms remain unapproved. Contribution acceptance does not authorize payment; rewards require separate approval. No reward entitlement is offered here.',
});

export type GenesisDraftProject = PersistedProject & {
  daoAccountId: string;
  publishedAt: null;
  createdAt: string;
};
export type GenesisDraftStatus = { linked: false; project: null } | { linked: true; project: GenesisDraftProject };
// Explicit consent to publish the canonical project and enable the existing
// participant application path. This does not publish participant records.
export const GENESIS_PUBLICATION_CONSENT_VERSION = 'genesis-publication-v1';
export type GenesisPublication = { published: true; projectId: string; network: 'testnet'; publishedAt: string };

/** Exact comparison of stored fields, not a validator of browser approval claims. */
export function matchesGenesisProject(row: Record<string, unknown>): boolean {
  return matchesGenesisIdentity(row) && row.published_at === null;
}

/** Shared identity comparison; draft callers still require NULL published_at. */
export function matchesGenesisIdentity(row: Record<string, unknown>): boolean {
  const g = GENESIS_YAW_001;
  const objectives = row.objectives;
  return row.id === g.id && row.network === g.network && row.creator_account_id === g.creatorAccountId
    && row.dao_account_id === g.daoAccountId && row.name === g.name && row.description === g.description
    && row.participation === g.participation && row.rewards === g.rewards
    && Array.isArray(objectives) && objectives.length === g.objectives.length
    && g.objectives.every((objective, i) => objectives[i] === objective);
}
