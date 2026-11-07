import 'server-only';
import { CONTRIBUTION_TASKS } from './policy.ts';
import type { ContributionState, ContributionTask, TaskRef } from './types.ts';

export type ContributionExample = 'submit' | 'review' | 'acknowledged' | 'unassigned' | 'long-text';
export function contributionExample(example: ContributionExample): ContributionState {
  const tasks = (Object.entries(CONTRIBUTION_TASKS) as [TaskRef, typeof CONTRIBUTION_TASKS['task-a'] | typeof CONTRIBUTION_TASKS['task-b']][])
    .map(([ref, definition]): ContributionTask => ({ ref, title: definition.title, prUrl: definition.prUrl, historicalNote: definition.historicalNote, recipientAccountId: ref === 'task-b' ? 'keelbase1.testnet' : null, request: null, acknowledgement: null }));
  const account = 'synthetic-contributor.testnet';
  if (example === 'unassigned') return { accountId: account, role: 'participant', tasks: [] };
  if (example === 'submit') return { accountId: 'keelbase1.testnet', role: 'participant', tasks: tasks.slice(1) };
  tasks[0].request = { actorAccountId: account, recipientAccountId: account, description: 'Illustrative request for review layout only. No participant submitted this record.', recordedAt: '2000-01-03T12:00:00.000Z' };
  if (example === 'acknowledged') tasks[0].acknowledgement = { actorAccountId: 'synthetic-founder.testnet', recordedAt: '2000-01-04T12:00:00.000Z', historicalAcceptedOn: null, historicalAcceptedAt: null, evidence: 'Invented acknowledgement for layout review. No historical date or actual in-app approval is represented.' };
  if (example === 'long-text') {
    tasks[0].request.description = 'W'.repeat(1000);
    tasks[0].request.recipientAccountId = 's'.repeat(64);
    tasks[0].request.actorAccountId = 's'.repeat(64);
  }
  return { accountId: 'synthetic-founder.testnet', role: 'creator', tasks };
}
