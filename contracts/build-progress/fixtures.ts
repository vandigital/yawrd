/** Entirely invented examples. These are not YAW-001 records or approvals. */
import {
  SYNTHETIC_NOTICE,
  type ProjectProgressData,
  type CrewAndContributionsData,
} from "./contract.ts";

const synthetic = {
  schemaVersion: 1,
  projectId: "synthetic-garden-tools",
  dataKind: "synthetic",
  notice: SYNTHETIC_NOTICE,
} as const;

export const syntheticProjectProgress: ProjectProgressData = {
  ...synthetic,
  milestones: [
    { id: "synthetic-plan", title: "Example planning", status: "completed" },
    { id: "synthetic-build", title: "Example build", status: "in_progress" },
    { id: "synthetic-review", title: "Example review", status: "blocked" },
    { id: "synthetic-share", title: "Example sharing", status: "not_started" },
  ],
  tasks: [
    { id: "synthetic-labels", title: "Example labels", status: "completed" },
    { id: "synthetic-list", title: "Example list", status: "in_progress" },
    { id: "synthetic-check", title: "Example check", status: "blocked" },
    { id: "synthetic-notes", title: "Example notes", status: "not_started" },
  ],
  recentActivity: [
    { id: "synthetic-activity-labels", summary: "Illustrative label update accepted in this synthetic example.", acceptedOn: "2000-01-03", link: "https://example.invalid/synthetic/labels" },
    { id: "synthetic-activity-notes", summary: "Illustrative notes accepted in this synthetic example.", acceptedOn: "2000-01-02" },
  ],
};

export const syntheticCrewAndContributions: CrewAndContributionsData = {
  ...synthetic,
  contributors: [
    { id: "synthetic-person-fern", displayName: "Example Crew Member Fern", profileUrl: "https://example.invalid/synthetic/fern", agent: { id: "synthetic-agent-sprout", displayName: "Example Agent Sprout" } },
    { id: "synthetic-person-moss", displayName: "Example Crew Member Moss" },
  ],
  contributions: [
    { id: "synthetic-contribution-labels", title: "Example label update", contributorId: "synthetic-person-fern", agentId: "synthetic-agent-sprout", status: "integrated", link: "https://example.invalid/synthetic/labels" },
    { id: "synthetic-contribution-notes", title: "Example notes", contributorId: "synthetic-person-moss", status: "accepted" },
  ],
};

export const syntheticEmptyProjectProgress: ProjectProgressData = {
  ...synthetic, milestones: [], tasks: [], recentActivity: [],
};

export const syntheticEmptyCrewAndContributions: CrewAndContributionsData = {
  ...synthetic, contributors: [], contributions: [],
};
