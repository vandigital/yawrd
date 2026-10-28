/** Factory and DAO initializer shapes at sputnik-dao-contract 5434a59. */
export interface CreationInput {
  projectName: string;
  projectPurpose: string;
  projectAccountLabel: string;
  creatorAccountId: string;
  initialStewardAccountIds: string[];
  stewardApprovalThreshold: number;
  factoryAccountId: string;
}

export interface VotePolicy {
  weight_kind: "RoleWeight";
  quorum: string;
  threshold: string;
}

export interface SputnikPolicy {
  roles: [{
    name: "Stewards";
    kind: { Group: string[] };
    permissions: string[];
    vote_policy: Record<string, VotePolicy>;
  }];
  default_vote_policy: VotePolicy;
  proposal_bond: string;
  proposal_period: string;
  bounty_bond: string;
  bounty_forgiveness_period: string;
}

export interface CreationPlan {
  daoAccountId: string;
  initializer: {
    config: { name: string; purpose: string; metadata: string };
    policy: SputnikPolicy;
  };
  factoryCall: {
    contractId: string;
    methodName: "create";
    args: { name: string; args: string };
  };
  requiredFollowUp: string;
}

const SEVEN_DAYS_NS = "604800000000000";
const ONE_DAY_NS = "86400000000000";
const ONE_NEAR_YOCTO = "1000000000000000000000000";
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const ACCOUNT_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const ACCOUNT_LABEL = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function requireAccountId(value: string, field: string): void {
  if (typeof value !== "string" || value.length < 2 || value.length > 64 || !ACCOUNT_ID.test(value)) {
    throw new Error(`${field} must be a valid NEAR account ID`);
  }
}

export function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const bits = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    result += BASE64[(bits >>> 18) & 63] + BASE64[(bits >>> 12) & 63];
    result += i + 1 < bytes.length ? BASE64[(bits >>> 6) & 63] : "=";
    result += i + 2 < bytes.length ? BASE64[bits & 63] : "=";
  }
  return result;
}

/** Builds call data only. It does not connect a wallet or submit a transaction. */
export function buildYawrdCreation(input: CreationInput): CreationPlan {
  if (!input || typeof input !== "object") throw new Error("Creation input is required");
  const name = typeof input.projectName === "string" ? input.projectName.trim() : "";
  const purpose = typeof input.projectPurpose === "string" ? input.projectPurpose.trim() : "";
  if (!name) throw new Error("Project name is required");
  if (!purpose) throw new Error("Project purpose is required");

  const label = input.projectAccountLabel;
  if (typeof label !== "string" || label.length < 2 || !ACCOUNT_LABEL.test(label)) {
    throw new Error("Project account label must be a valid single NEAR account label");
  }
  requireAccountId(input.factoryAccountId, "Factory account ID");
  requireAccountId(input.creatorAccountId, "Creator account ID");
  const daoAccountId = `${label}.${input.factoryAccountId}`;
  requireAccountId(daoAccountId, "New DAO account ID");
  if (daoAccountId === input.creatorAccountId) {
    throw new Error("New DAO account ID cannot be a Steward account ID");
  }

  if (!Array.isArray(input.initialStewardAccountIds)) {
    throw new Error("Initial Stewards must be an array");
  }
  const stewards = [input.creatorAccountId];
  const seen = new Set(stewards);
  for (const accountId of input.initialStewardAccountIds) {
    requireAccountId(accountId, "Steward account ID");
    if (accountId === daoAccountId) {
      throw new Error("New DAO account ID cannot be a Steward account ID");
    }
    if (seen.has(accountId)) throw new Error(`Duplicate Steward: ${accountId}`);
    seen.add(accountId);
    stewards.push(accountId);
  }
  const threshold = input.stewardApprovalThreshold;
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > stewards.length) {
    throw new Error(`Steward approval threshold must be an integer from 1 to ${stewards.length}`);
  }

  const votePolicy: VotePolicy = {
    weight_kind: "RoleWeight",
    quorum: String(threshold),
    threshold: String(threshold),
  };
  const policy: SputnikPolicy = {
    roles: [{
      name: "Stewards",
      kind: { Group: stewards },
      permissions: [
        "*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:VoteRemove", "*:Finalize",
      ],
      vote_policy: {},
    }],
    default_vote_policy: votePolicy,
    proposal_bond: "0",
    proposal_period: SEVEN_DAYS_NS,
    // These required fields retain Sputnik's defaults; the request only changes proposal bond.
    bounty_bond: ONE_NEAR_YOCTO,
    bounty_forgiveness_period: ONE_DAY_NS,
  };
  const initializer = {
    config: { name, purpose, metadata: "" },
    policy,
  };
  return {
    daoAccountId,
    initializer,
    factoryCall: {
      contractId: input.factoryAccountId,
      methodName: "create",
      args: { name: label, args: encodeBase64Utf8(JSON.stringify(initializer)) },
    },
    requiredFollowUp: "After creation, Stewards must approve a FactoryInfoUpdate proposal with auto_update: false to disable automatic factory upgrades. Automatic upgrades remain enabled until that proposal executes.",
  };
}
