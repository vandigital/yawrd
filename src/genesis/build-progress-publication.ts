import type { ProjectProgressData } from '../../contracts/build-progress/contract.ts';

const repository = 'https://github.com/vandigital/yawrd-build-progress';

/** Deliberately reviewed public facts only. No participant or agent identities. */
export const YAW_001_PROJECT_PROGRESS = Object.freeze({
  schemaVersion: 1,
  projectId: 'yaw-001',
  dataKind: 'published',
  milestones: Object.freeze([
    Object.freeze({ id: 'build-progress-deliverables', title: 'Build Progress component deliverables accepted', status: 'completed' }),
  ]),
  tasks: Object.freeze([
    Object.freeze({ id: 'task-a', title: 'Project progress', status: 'completed' }),
    Object.freeze({ id: 'task-b', title: 'Crew & contributions', status: 'completed' }),
  ]),
  recentActivity: Object.freeze([
    Object.freeze({
      id: 'task-b-acceptance',
      summary: 'Task B · Crew & contributions accepted',
      acceptedOn: '2026-11-06',
      link: `${repository}/pull/4`,
    }),
  ]),
}) satisfies ProjectProgressData;

export const YAW_001_CONTRIBUTION_PROOF = Object.freeze([
  Object.freeze({
    ref: 'task-a',
    label: 'Task A',
    title: 'Project progress',
    status: 'Accepted',
    acceptance: 'Acceptance date not published in the approved evidence.',
    reward: 'No payout allocated by this decision.',
    prUrl: `${repository}/pull/2`,
    mergeUrl: `${repository}/commit/aede263a82da7514f9eac9e4436ba3113a1eebd3`,
  }),
  Object.freeze({
    ref: 'task-b',
    label: 'Task B',
    title: 'Crew & contributions',
    status: 'Accepted',
    acceptance: 'Accepted November 6, 2026.',
    reward: '1 NEAR on Testnet · settlement is shown only after successful transfer receipt verification.',
    prUrl: `${repository}/pull/4`,
    mergeUrl: `${repository}/commit/26d2d5e8b087749f47696ee27732a42f32929da7`,
  }),
]);

export const YAW_001_DELIVERABLE_COMPLETION = Object.freeze({
  accepted: YAW_001_CONTRIBUTION_PROOF.filter(item => item.status === 'Accepted').length,
  total: YAW_001_CONTRIBUTION_PROOF.length,
});
