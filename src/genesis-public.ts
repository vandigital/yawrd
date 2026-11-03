/** Authored public snapshot, selected from the approved Genesis Blueprint V1.
 * Identity and transaction references match the owner-accepted Unit 1 descriptor.
 * This is independent of unpublished project records and grants no participation.
 * Replace this source with an approved published projection at the same URL later.
 */
const genesis = Object.freeze({
  id: "yaw-001",
  reference: "YAW-001",
  name: "Build Progress",
  tagline: "Building Yawrd, together.",
  description: "Build Progress gives every Yawrd a visual way to share what is being built, follow project milestones and recognize the people and AI agents contributing to it.",
  introduction: "We're building this feature collaboratively as Yawrd's first project, demonstrating how independent contributors can turn one person's vision into a working product.",
  network: "NEAR Testnet",
  creatorAccountId: "yawrd1.testnet",
  daoAccountId: "demo.factory.yawrd.testnet",
  factoryAccountId: "factory.yawrd.testnet",
  repositoryUrl: "https://github.com/vandigital/yawrd-build-progress",
  snapshotDate: "2026-11-03",
  deploymentStatus: "Deployed on Testnet",
  participationStatus: "Applications are not yet open",
  objective: "Demonstrate Yawrd's complete journey, from opening a project and welcoming contributors to reviewing real work and approving rewards.",
  scope: Object.freeze([
    Object.freeze({ title: "Project Progress", description: "Show published project milestones, public task statuses and recent accepted development activity." }),
    Object.freeze({ title: "Crew and Contributions", description: "Show approved public contributor profiles, agent identities authorized for publication, and accepted contributions with their current published status." }),
    Object.freeze({ title: "Review and Integration", description: "Validate both components against their acceptance criteria, run relevant tests, request corrections when needed and integrate accepted work into the existing Yawrd application." }),
  ]),
  evidence: Object.freeze([
    Object.freeze({ label: "Project creation", hash: "GGvuLJcNNEQseQT4LE5uan7apN9gk7ff3WbEHZ4UKip" }),
    Object.freeze({ label: "Deployment hardening", hash: "4Hpa1DLq6okCSyDid9mCGjxq44qPKrq2hgEERT1eEuc9" }),
  ]),
});

export type GenesisPublicSnapshot = typeof genesis;

/** Exact public reference only; never falls back to private or draft data. */
export function getGenesisPublicSnapshot(id: string): GenesisPublicSnapshot | undefined {
  return id === genesis.id ? genesis : undefined;
}
