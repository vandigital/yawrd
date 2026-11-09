import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup as renderMarkup } from 'react-dom/server';
import { TestnetWalletProvider } from '../app/use-testnet-wallet.ts';
function renderToStaticMarkup(element: Parameters<typeof renderMarkup>[0]) {
  return renderMarkup(createElement(TestnetWalletProvider, null, element));
}
import { ContributionExperience } from '../app/components/contribution-workspace.tsx';
import { PersistedYawrdContent, PersistedYawrdPresentation } from '../app/components/persisted-yawrd.tsx';
import { TASK_B_REWARD } from '../src/genesis/task-b-reward.ts';
import { GENESIS_YAW_001 as g } from '../src/genesis/yaw-001.ts';
import { contributionActivation, contributionsActive, TASK_B_PARTICIPANT, TASK_B_RECIPIENT } from '../src/contributions/policy.ts';
import { ContributionRepository } from '../src/contributions/repository.ts';
import { contributionExample } from '../src/contributions/preview-data.ts';
import { canonicalTaskBSubmission, taskBSigningDesign, checkTaskBSignatureDesign, SUBMISSION_RECIPIENT } from '../src/contributions/submission-signature.ts';
import { REQUEST_CONSENT, type RequestInput } from '../src/contributions/types.ts';
import { serializeNep413, IDENTITY_RECIPIENT, CHALLENGE_TTL_MS } from '../src/identity/nep413.ts';
import { AUTH_RECIPIENT, hashToken } from '../src/participants/auth.ts';
import type { IdentityChallenge } from '../src/identity/types.ts';
import type { ParticipantView } from '../src/participants/types.ts';

const draft: RequestInput = { kind: 'request', taskRef: 'task-b', prUrl: TASK_B_REWARD.prUrl, description: 'Completed Task B contribution; preserve original PR attribution.', recipientAccountId: 'keelbase1.testnet', consent: true, consentVersion: REQUEST_CONSENT };
const context = { id: 'a'.repeat(43), nonce: Buffer.alloc(32, 5).toString('base64'), origin: 'https://yawrd.example', issuedAt: 1793966400000 };
const session = { accountId: 'keelbase1.testnet', network: 'testnet', origin: context.origin };
// Ephemeral synthetic crypto material only: these are NOT either real wallet's keys.
const key = generateKeyPairSync('ed25519');
const bytes = key.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let n = BigInt(`0x${bytes.toString('hex')}`), encoded = '';
while (n) { encoded = alphabet[Number(n % BigInt(58))] + encoded; n /= BigInt(58); }
for (const byte of bytes) { if (byte) break; encoded = '1' + encoded; }
function proof(c: IdentityChallenge) { return { accountId: c.accountId, publicKey: `ed25519:${encoded}`, signature: sign(null, createHash('sha256').update(serializeNep413(c.message, Buffer.from(c.nonce, 'base64'), c.recipient)).digest(), key.privateKey).toString('base64') }; }
const challenge = () => taskBSigningDesign(draft, session.accountId, context);

test('founder terms pin Task B recipient and exactly 10^24 yocto; Task A remains unassigned', () => {
  const policy = contributionActivation({ YAWRD_ENABLE_YAW001_CONTRIBUTIONS: '1' });
  assert.equal(TASK_B_REWARD.amountYocto, (BigInt(10) ** BigInt(24)).toString());
  assert.equal(TASK_B_REWARD.daoAccountId, 'demo.factory.yawrd.testnet');
  assert.equal(TASK_B_REWARD.distinctStewardApprovals, 2);
  assert.equal(TASK_B_PARTICIPANT, 'keelbase1.testnet');
  assert.equal(TASK_B_RECIPIENT, 'keelbase1.testnet');
  assert.deepEqual(policy.owners, { 'task-a': null, 'task-b': 'keelbase1.testnet' });
  assert.equal(policy.submissionSignatureVerified, false);
  assert.equal(contributionsActive(policy), false);
  const provenance = JSON.parse(readFileSync(new URL('../docs/provenance/task-4-public-pr.json', import.meta.url), 'utf8'));
  assert.equal(provenance.url, TASK_B_REWARD.prUrl);
  assert.match(provenance.body, /Operator: `keelbase1\.testnet`/);
});
test('public Project Identity shows allocation without login or publishing recipient/profile', () => {
  const project = { id:g.id, network:g.network, creatorAccountId:g.creatorAccountId, name:g.name, description:g.description, objectives:[...g.objectives], participation:g.participation, rewards:g.rewards };
  const view: ParticipantView = { accountId:null, role:'public', application:null, applications:[], restrictedContent:null };
  const html = renderToStaticMarkup(createElement(PersistedYawrdPresentation, { project, view }));
  const identity = html.slice(html.indexOf('id="genesis-identity-title"'), html.indexOf('</aside>'));
  assert.match(identity, /Task B · Recorded reward|1 NEAR on Testnet/);
  assert.match(identity, /Reward Payout status: Allocated — chain status not yet verified/);
  assert.match(identity, /Two different Stewards/);
  assert.doesNotMatch(html, /keelbase1|keelbase\.testnet|hermes-yaw001|Reward amounts and terms remain unapproved|Paid<|>Approved</);
  assert.match(html, /Task A is accepted with no payout allocated/);
  const other = renderToStaticMarkup(createElement(PersistedYawrdContent, { project: { ...project, id:'other-project' } }));
  assert.doesNotMatch(other, /Reward Payout status/);
});
test('Task B preview prefills immutable PR/recipient, separates login/signing and creates no wallet action', () => {
  const state = contributionExample('submit');
  assert.equal(state.tasks[0].ref, 'task-b');
  assert.equal(state.tasks[0].recipientAccountId, 'keelbase1.testnet');
  const html = renderToStaticMarkup(createElement(ContributionExperience, {state, preview:true, onSubmit:async()=>{}, onAcknowledge:async()=>{}}));
  assert.match(html, /<input[^>]*readOnly=""[^>]*value="https:\/\/github.com\/vandigital\/yawrd-build-progress\/pull\/4"/);
  assert.match(html, /<input[^>]*readOnly=""[^>]*value="keelbase1.testnet"/);
  assert.match(html, /Login verification alone does not submit this work/);
  assert.match(html, /off-chain wallet message/);
  const liveHtml = renderToStaticMarkup(createElement(ContributionExperience, {state, onSubmit:async()=>{}, onAcknowledge:async()=>{}}));
  assert.match(liveHtml, /disabled="">Sign and submit in Meteor/);
  assert.doesNotMatch(liveHtml, /No gas, wallet signature, transaction or spending permission is required/);
});
test('keelbase.testnet cannot claim Task B even when its membership and injected mapping are approved', async () => {
  for (const configuredOwner of ['keelbase.testnet', 'keelbase1.testnet']) {
  const activation = { ...contributionActivation(), enabled:true, migrationVerified:true, permissionsVerified:true, databaseTestsVerified:true, recipientPolicyApproved:true, taskMappingVerified:true, submissionSignatureVerified:true, owners: { 'task-a':null, 'task-b':configuredOwner } };
  let writes = 0;
  const repo = new ContributionRepository(async text => { if(text.startsWith('INSERT')) writes++; return [{ account_id:'keelbase.testnet', application_id:'synthetic-app', decision:'approved' }]; }, activation);
  await assert.rejects(repo.submit('yaw-001', hashToken('a'.repeat(43)), draft), /task_owner_required/);
  assert.equal(writes, 0);
  }
});
test('keelbase1 requires its own approved participant record, not only provenance or task terms', async () => {
  const activation = { ...contributionActivation(), enabled:true, migrationVerified:true, permissionsVerified:true, databaseTestsVerified:true, recipientPolicyApproved:true, taskMappingVerified:true, submissionSignatureVerified:true };
  let writes = 0;
  const repo = new ContributionRepository(async text => { if(text.startsWith('INSERT')) writes++; return [{ account_id:'keelbase1.testnet', application_id:null, decision:null }]; }, activation);
  await assert.rejects(repo.submit('yaw-001', hashToken('a'.repeat(43)), draft), /approved_participant_required/);
  assert.equal(writes, 0);
});
test('signature design binds exact task, PR, source, recipient, description, amount and domain', () => {
  const c = challenge();
  assert.notEqual(SUBMISSION_RECIPIENT, AUTH_RECIPIENT); assert.notEqual(SUBMISSION_RECIPIENT, IDENTITY_RECIPIENT);
  const payload = JSON.parse(canonicalTaskBSubmission(draft, session.accountId));
  assert.equal(payload.amountYocto, '1000000000000000000000000');
  assert.equal(payload.recipientAccountId, 'keelbase1.testnet');
  assert.equal(payload.prUrl, TASK_B_REWARD.prUrl);
  assert.equal(payload.mergeCommitSha, '26d2d5e8b087749f47696ee27732a42f32929da7');
  assert.equal(c.expiresAt - c.issuedAt, CHALLENGE_TTL_MS);
  assert.match(c.message, /not a login|Origin: https:\/\/yawrd.example|Exact submission:/);
  assert.doesNotThrow(() => checkTaskBSignatureDesign(c, draft, session, proof(c), c.issuedAt));
});
test('agent drafts cannot override amount, actor, PR or receiving wallet', () => {
  for(const extra of [{amountYocto:'2'}, {actorAccountId:'keelbase.testnet'}, {nonce:'agent-chosen'}, {signature:'pretend'}]) assert.throws(() => canonicalTaskBSubmission({...draft,...extra},session.accountId), /invalid_submission_draft/);
  assert.throws(() => canonicalTaskBSubmission({...draft,recipientAccountId:'keelbase.testnet'},session.accountId), /wrong_recipient/);
  assert.throws(() => canonicalTaskBSubmission({...draft,prUrl: `${draft.prUrl}?x=1`},session.accountId), /wrong_task_evidence/);
  assert.throws(() => canonicalTaskBSubmission(draft,'keelbase.testnet'), /wrong_account/);
});
test('signature fails after payload, nonce, origin, account, network or purpose substitution', () => {
  const c = challenge(), p = proof(c);
  assert.throws(() => checkTaskBSignatureDesign(c,{...draft,description:'Changed after human review.'},session,p,c.issuedAt), /altered_submission/);
  for(const alteration of [{nonce:Buffer.alloc(32,6).toString('base64')},{recipient:AUTH_RECIPIENT},{message:'Sign in to Yawrd for one hour.'},{expiresAt:c.expiresAt+1}]) assert.throws(() => checkTaskBSignatureDesign({...c,...alteration},draft,session,p,c.issuedAt), /altered_submission/);
  for(const alteration of [{origin:'https://evil.example'},{accountId:'keelbase.testnet'},{network:'mainnet'}]) assert.throws(() => checkTaskBSignatureDesign(c,draft,{...session,...alteration},p,c.issuedAt), /wrong_/);
  assert.throws(() => checkTaskBSignatureDesign(c,draft,session,p,c.expiresAt), /expired_challenge/);
  assert.throws(() => checkTaskBSignatureDesign(c,draft,session,p,c.issuedAt-1), /expired_challenge/);
});
test('challenge design requires canonical server origin, nonce and ID', () => {
  for(const alteration of [{origin:'https://yawrd.example/path'},{origin:'https://user:pass@yawrd.example'},{origin:'http://evil.example'},{nonce:'bad'},{id:'agent-id'}]) assert.throws(() => taskBSigningDesign(draft,session.accountId,{...context,...alteration}));
});
test('inactive SQL fixes only Task B ownership, preserves Task A unknown and immutable evidence', () => {
  const sql = readFileSync(new URL('../docs/proposals/migrations/006_yaw001_contribution_events.sql',import.meta.url),'utf8');
  assert.match(sql, /\('task-a', NULL::text\), \('task-b', 'keelbase1.testnet'::text\)/);
  assert.match(sql, /a\.account_id = NEW\.actor_account_id/);
  assert.match(sql, /recipient_account_id = actor_account_id/);
  assert.match(sql, /ON d\.application_id = a\.id/);
  assert.match(sql, /INACTIVE REVIEW DRAFT/);
});
