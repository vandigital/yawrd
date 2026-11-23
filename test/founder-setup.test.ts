import assert from 'node:assert/strict';
import test from 'node:test';
import { browserFounderSetup, initialFounderConfiguration, reviewFounderConfiguration } from '../src/founder-setup.ts';
import { createEmptyYawrdIntakeDraft, updateYawrdIntakeDraft, serializeYawrdIntakeDraft } from '../src/yawrd-intake.ts';

const now = '2026-11-17T00:00:00.000Z';
const intake = { ...updateYawrdIntakeDraft(createEmptyYawrdIntakeDraft('private-draft', now), {
  projectType: 'community', startingPoint: 'idea', intendedBudget: 'undecided',
  availableResources: 'Private resources', successCriteria: 'First private outcome', initialOutcomeConfirmed: true,
  founderDescription: 'PRIVATE SOURCE — never automatically public',
}, now), projectName: 'Community project' };
const config = { publicName: ' Public name ', publicDescription: ' Explicit public summary ', accountLabel: 'community-project', secondSteward: 'neighbor.testnet', threshold: 2 };

test('generic setup requires complete named intake, without inventing a project or deployment receipt', () => {
  assert.throws(() => browserFounderSetup(createEmptyYawrdIntakeDraft('empty', now), 'founder.testnet'), /Complete and save/);
  assert.throws(() => browserFounderSetup({ ...intake, projectName: '' }, 'founder.testnet'), /Complete and save/);
  const view = browserFounderSetup(intake, 'founder.testnet');
  assert.deepEqual(Object.keys(view), ['name', 'founder', 'intake']);
  assert.equal(view.founder, 'founder.testnet');
  assert.deepEqual(view.intake, intake);
});

test('private wording is never seeded into public description and configuration does not mutate intake', () => {
  const bytes = serializeYawrdIntakeDraft(intake);
  const initial = initialFounderConfiguration(intake);
  assert.equal(initial.publicDescription, '');
  assert.equal(initial.secondSteward, '');
  assert.equal(initial.accountLabel, '');
  const review = reviewFounderConfiguration(config, 'founder.testnet', true);
  assert.equal(review.publicDescription, 'Explicit public summary');
  assert.deepEqual(review.stewards, ['founder.testnet', 'neighbor.testnet']);
  assert.equal(JSON.stringify(review).includes('PRIVATE SOURCE'), false);
  assert.equal(serializeYawrdIntakeDraft(intake), bytes);
  assert.equal('factoryCall' in review, false);
  assert.equal('daoAccountId' in review, false);
});

test('review requires explicit public text confirmation and preserves two-of-two constraints', () => {
  assert.throws(() => reviewFounderConfiguration(config, 'founder.testnet', false), /Explicitly review/);
  for (const threshold of [0, 1, 3, NaN]) assert.throws(() => reviewFounderConfiguration({ ...config, threshold }, 'founder.testnet', true), /two Stewards/);
  for (const secondSteward of ['founder.testnet', 'neighbor.near', '', 'invalid..testnet']) assert.throws(() => reviewFounderConfiguration({ ...config, secondSteward }, 'founder.testnet', true));
  for (const accountLabel of ['x', 'bad.label', 'x'.repeat(64)]) assert.throws(() => reviewFounderConfiguration({ ...config, accountLabel }, 'founder.testnet', true));
  assert.throws(() => reviewFounderConfiguration({ ...config, publicDescription: '' }, 'founder.testnet', true), /purpose/);
});
