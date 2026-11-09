import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import { TestnetWalletProvider } from '../app/use-testnet-wallet.ts';
function renderToStaticMarkup(element: Parameters<typeof renderMarkup>[0]) {
  return renderMarkup(createElement(TestnetWalletProvider, null, element));
}
import { CONTRIBUTION_DESCRIPTION_LIMIT, contributionDescriptionError } from '../src/contributions/validation.ts';
import { canonicalTaskBSubmission } from '../src/contributions/submission-signature.ts';
import { ContributionRepository } from '../src/contributions/repository.ts';
import { contributionActivation } from '../src/contributions/policy.ts';
import { REQUEST_CONSENT, type RequestInput } from '../src/contributions/types.ts';
import { contributionExample } from '../src/contributions/preview-data.ts';
import { ContributionExperience, signTaskBRequest } from '../app/components/contribution-workspace.tsx';
import { PersistedYawrdPresentation } from '../app/components/persisted-yawrd.tsx';
import { GENESIS_YAW_001 as g } from '../src/genesis/yaw-001.ts';
import type { ParticipantView } from '../src/participants/types.ts';

const draft = (description: string): RequestInput => ({ kind: 'request', taskRef: 'task-b',
  prUrl: 'https://github.com/vandigital/yawrd-build-progress/pull/4', description,
  recipientAccountId: 'keelbase1.testnet', consent: true, consentVersion: REQUEST_CONSENT });
const ready = { ...contributionActivation({}), enabled: true, migrationVerified: true, permissionsVerified: true,
  databaseTestsVerified: true, recipientPolicyApproved: true, taskMappingVerified: true, submissionSignatureVerified: true };

test('description contract preserves the existing 1–1000 Unicode-code-point boundary', () => {
  assert.equal(CONTRIBUTION_DESCRIPTION_LIMIT, 1000);
  for (const description of ['a', 'a'.repeat(1000), '😀'.repeat(1000), 'e\u0301'.repeat(500)]) {
    assert.equal(contributionDescriptionError(description), null);
    assert.equal(JSON.parse(canonicalTaskBSubmission(draft(description), 'keelbase1.testnet')).description, description);
  }
  for (const description of ['a'.repeat(1001), '😀'.repeat(1001)]) {
    assert.match(contributionDescriptionError(description)!, /Shorten.*1,000/);
    assert.throws(() => canonicalTaskBSubmission(draft(description), 'keelbase1.testnet'), /invalid_description/);
  }
});
test('empty, whitespace and control-character errors explain the required correction', () => {
  for (const value of [undefined, null, [], '', '   ']) assert.match(contributionDescriptionError(value)!, /Enter.*1–1,000/);
  for (const value of [' leading', 'trailing ', '\u2003text']) assert.match(contributionDescriptionError(value)!, /Remove whitespace/);
  for (const value of ['line\nbreak', 'tab\there', 'control\u0000here', 'delete\u007fhere']) assert.match(contributionDescriptionError(value)!, /Remove line breaks, tabs and control characters/);
});
test('repository applies the same Unicode boundary and keeps its invalid_description error', async () => {
  let queries = 0;
  const repo = new ContributionRepository(async text => {
    queries++;
    assert.match(text, /^SELECT s.account_id/);
    return [{ account_id: 'keelbase1.testnet', application_id: 'synthetic-approved-application', decision: 'approved' }];
  }, ready);
  for (const description of ['a'.repeat(1001), '😀'.repeat(1001), ' leading', 'two\nlines']) {
    await assert.rejects(repo.submit('yaw-001', 'b'.repeat(64), draft(description)), /invalid_description/);
  }
  assert.equal(queries, 0);
  // Valid descriptions reach the unchanged signature requirement, with no write.
  await assert.rejects(repo.submit('yaw-001', 'b'.repeat(64), draft('😀'.repeat(1000))), /submission_signature_required/);
  assert.equal(queries, 1);
});
test('invalid drafts never prepare a challenge or request wallet approval', async () => {
  for (const description of ['', 'a'.repeat(1001), 'two\nlines', ' leading']) {
    await assert.rejects(signTaskBRequest(draft(description), 'keelbase1.testnet', {
      getContext: () => ({ accountId: 'keelbase1.testnet', network: 'testnet' }),
      signIdentity: async () => { assert.fail('invalid draft must not open a wallet'); },
    }, async () => { assert.fail('invalid draft must not issue an HTTP request'); }, 'http://localhost:3000'),
    error => error instanceof Error && error.message === contributionDescriptionError(description));
  }
});
test('form advertises its exact limit and avoids the native UTF-16 maxlength restriction', () => {
  const html = renderToStaticMarkup(createElement(ContributionExperience, { state: contributionExample('submit'),
    onSubmit: async () => {}, onAcknowledge: async () => {} }));
  assert.match(html, /0 \/ 1,000 characters/);
  assert.match(html, /Use 1–1,000 characters in one paragraph/);
  assert.match(html, /aria-describedby="task-b-description-limit"/);
  const description = html.match(/<textarea[^>]*>/)![0];
  assert.doesNotMatch(description, /maxLength|maxlength/);
});
test('existing public Project Identity displays the conditional Testnet allocation without claiming proposal approval or payment', () => {
  const project = { id: g.id, network: g.network, creatorAccountId: g.creatorAccountId, name: g.name,
    description: g.description, objectives: [...g.objectives], participation: g.participation, rewards: g.rewards };
  const view: ParticipantView = { accountId: null, role: 'public', application: null, applications: [], restrictedContent: null };
  const html = renderToStaticMarkup(createElement(PersistedYawrdPresentation, { project, view }));
  const identity = html.slice(html.indexOf('id="genesis-identity-title"'), html.indexOf('</aside>'));
  assert.match(identity, /Task B · Recorded reward/);
  assert.match(identity, /1 NEAR on Testnet/);
  assert.match(identity, /Reward Payout status: Allocated — chain status not yet verified/);
  assert.match(identity, /Payout Proposal: Unverified/);
  assert.match(identity, /Two different Stewards must approve it before payment/);
  assert.match(identity, /This allocation is not payment approval/);
  assert.equal((identity.match(/Task B · Recorded reward/g) ?? []).length, 1);
  assert.doesNotMatch(identity, />Paid<|>Approved<|keelbase1\.testnet/);
});
