import type { FactorySettings } from "./creation-integration";

/**
 * Public settings from the completed YAW-001 Testnet lifecycle. The application
 * still verifies both code identities, the selected Stewards and address
 * availability against finalized RPC state before it can ask the wallet to sign.
 */
export const testnetFactorySettings: FactorySettings = {
  network: "testnet",
  factoryAccountId: "factory.yawrd.testnet",
  expectedFactoryCodeHash: "4mU84bSMfnJ8d7eEvf1jTwXTn5opVE4HGBWpxz9AB65d",
  expectedDaoCodeHash: "7mSUs75fYMFsUmjXGFLMy7b2LQ7gA1ojW3woSoAUQmzt",
  setupDepositYocto: "1000000000000000000000000",
  createGas: "300000000000000",
  costConfirmation: "Completed YAW-001 Testnet creation used a 1 NEAR setup deposit and a 300 Tgas create limit.",
};

// The legacy browser-only panel stays disabled. Saved-Creation submission is
// authorized separately on the server for one pinned Development request.
// No global environment or request-body override is supported.
export const creationSubmissionAuthorized = false;

// Founder authorization for one already reserved request, not a global toggle.
export const authorizedCreationDeployment = Object.freeze({
  creationId: 'yawrd-uorgr4yy5sxu', founderAccountId: 'yawrd1.testnet', network: 'testnet',
  nextAttempt: 2,
  identifier: 'xfheozm6d1tb', daoAccountId: 'xfheozm6d1tb.factory.yawrd.testnet',
  requestDigest: 'd8dcc5332df50272b7c9739e0687761eed3f8c9e4abdc99d22bd46a867f55191',
  preparedDigest: '71c8a360ba4d02d80d992df93f58df1b7b46bee7794a662b13fd223cd9952acf',
});
