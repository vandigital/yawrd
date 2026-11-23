import { assessYawrdIntake, validateYawrdIntakeDraft, type YawrdIntakeDraftV1 } from './yawrd-intake.ts';
import { DAO_IDENTIFIER } from './creation/dao-identifier.ts';
import { buildYawrdCreation } from './create-yawrd.ts';

/** Browser-only intake summary. No project ID, deployment or payment is fabricated. */
export function browserFounderSetup(value: unknown, accountId: string) {
  const intake = validateYawrdIntakeDraft(value);
  if (!intake.projectName?.trim() || !assessYawrdIntake(intake.answers).complete) throw new Error('Complete and save your intake before continuing to setup.');
  return { name: intake.projectName, founder: accountId, intake };
}

export type FounderSetupView = ReturnType<typeof browserFounderSetup>;
export type FounderConfiguration = {
  publicName: string; publicDescription: string; accountLabel: string;
  secondSteward: string; threshold: number;
};

export function initialFounderConfiguration(intake: YawrdIntakeDraftV1): FounderConfiguration {
  return { publicName: intake.projectName ?? '', publicDescription: '', accountLabel: '', secondSteward: '', threshold: 2 };
}

/** Pure validation only; discard factory call data. The sentinel is never a deployment target. */
export function reviewFounderConfiguration(config: FounderConfiguration, founder: string, publicTextReviewed: boolean, generatedIdentifier?: string | null) {
  if (!publicTextReviewed) throw new Error('Explicitly review the proposed public name and description before reviewing configuration.');
  if (config.threshold !== 2) throw new Error('Only two Stewards with two approvals are supported for Testnet setup review.');
  if (![founder, config.secondSteward].every(id => id.endsWith('.testnet'))) throw new Error('Use two distinct named Testnet Steward accounts.');
  if (generatedIdentifier != null && !DAO_IDENTIFIER.test(generatedIdentifier)) throw new Error('A generated 12-character account identifier is required.');
  const accountLabel = generatedIdentifier === null ? 'preview-only' : generatedIdentifier ?? config.accountLabel;
  const { initializer } = buildYawrdCreation({
    projectName: config.publicName, projectPurpose: config.publicDescription,
    projectAccountLabel: accountLabel, creatorAccountId: founder,
    initialStewardAccountIds: [config.secondSteward], stewardApprovalThreshold: config.threshold,
    factoryAccountId: 'preview-factory.testnet',
  });
  return { publicName: initializer.config.name, publicDescription: initializer.config.purpose,
    accountLabel: generatedIdentifier === null ? null : accountLabel, stewards: [...initializer.policy.roles[0].kind.Group],
    threshold: 2 as const };
}
