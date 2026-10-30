import assert from "node:assert/strict";
import test from "node:test";
import {
  mapBlueprintPublicDetails,
  type BlueprintApprovalReference,
  type BlueprintCreationDetails,
  type BlueprintPublicDetailsSnapshot,
} from "../src/blueprint-public-details.ts";
import { buildYawrdCreation, type CreationInput } from "../src/create-yawrd.ts";

// Synthetic public text and opaque references only; no real Blueprint/approval.
const snapshot: BlueprintPublicDetailsSnapshot = {
  schemaVersion: 1,
  blueprintRevisionId: "synthetic-workspace-a:revision-2",
  publicName: "  Shared Café 🌱  ",
  publicDescription: "\nBuild useful tools together.\nKeep the process welcoming.\t",
};
const reference: BlueprintApprovalReference = {
  approvalId: "synthetic-approval-7",
  blueprintRevisionId: snapshot.blueprintRevisionId,
};
const expected: BlueprintCreationDetails = {
  projectName: "Shared Café 🌱",
  projectPurpose: "Build useful tools together.\nKeep the process welcoming.",
};

test("public snapshot maps only explicit public text using Builder whitespace rules", () => {
  const result = mapBlueprintPublicDetails(snapshot, reference);
  assert.deepEqual(result, expected);
  assert.deepEqual(Reflect.ownKeys(result), ["projectName", "projectPurpose"]);
});

test("invalid snapshot and approval containers are rejected", () => {
  for (const value of [undefined, null, true, 1, "snapshot", [], new Date(), new Map()]) {
    assert.throws(() => mapBlueprintPublicDetails(value, reference), /snapshot must be a record/);
    assert.throws(() => mapBlueprintPublicDetails(snapshot, value), /reference must be a record/);
  }
});

test("schema version must be explicitly present and supported without coercion", () => {
  for (const schemaVersion of [undefined, null, "1", 0, 2, -1, 1.5, NaN, Infinity, true, {}]) {
    assert.throws(() => mapBlueprintPublicDetails({ ...snapshot, schemaVersion }, reference), /Unsupported.*schema version/);
  }
  const { schemaVersion: _, ...missing } = snapshot;
  assert.throws(() => mapBlueprintPublicDetails(missing, reference), /schemaVersion/);
});

test("missing, blank and non-string public values are rejected without private fallbacks", () => {
  for (const field of ["publicName", "publicDescription"] as const) {
    for (const value of [undefined, null, "", " \t\n\r", "\u00a0\u2003", 0, false, [], {}, new String("text")]) {
      assert.throws(() => mapBlueprintPublicDetails({
        ...snapshot, [field]: value,
        projectName: "PRIVATE_NAME_SENTINEL", projectPurpose: "PRIVATE_PURPOSE_SENTINEL",
        purpose: "PRIVATE_PURPOSE_SENTINEL", description: "PRIVATE_DESCRIPTION_SENTINEL",
        blueprint: { name: "PRIVATE_NAME_SENTINEL", purpose: "PRIVATE_PURPOSE_SENTINEL" },
        assessment: { suggestedDescription: "ASSESSMENT_SENTINEL" },
      }, reference), new RegExp(field));
    }
    const missing: Record<string, unknown> = { ...snapshot };
    delete missing[field];
    assert.throws(() => mapBlueprintPublicDetails(missing, reference), new RegExp(field));
  }
});

test("both revision IDs and the approval ID must be explicit nonblank strings", () => {
  for (const value of [undefined, null, "", " \n\t", 2, true, [], {}]) {
    assert.throws(() => mapBlueprintPublicDetails({ ...snapshot, blueprintRevisionId: value }, reference), /blueprintRevisionId/);
    assert.throws(() => mapBlueprintPublicDetails(snapshot, { ...reference, blueprintRevisionId: value }), /blueprintRevisionId/);
    assert.throws(() => mapBlueprintPublicDetails(snapshot, { ...reference, approvalId: value }), /approvalId/);
  }
  assert.throws(() => mapBlueprintPublicDetails({ schemaVersion: 1, publicName: "Name", publicDescription: "Purpose" }, reference), /blueprintRevisionId/);
  assert.throws(() => mapBlueprintPublicDetails(snapshot, { approvalId: reference.approvalId }), /blueprintRevisionId/);
  assert.throws(() => mapBlueprintPublicDetails(snapshot, { blueprintRevisionId: reference.blueprintRevisionId, approved: true }), /approvalId/);
});

test("stale, other-workspace and whitespace/case revision mismatches fail closed", () => {
  for (const blueprintRevisionId of [
    "synthetic-workspace-a:revision-1", "synthetic-workspace-b:revision-2",
    snapshot.blueprintRevisionId.toUpperCase(), ` ${snapshot.blueprintRevisionId}`, `${snapshot.blueprintRevisionId}\n`,
  ]) {
    assert.throws(() => mapBlueprintPublicDetails(snapshot, { ...reference, blueprintRevisionId }), /references must match exactly/);
  }
});

test("private content and creation overrides at every input level cannot enter output", () => {
  const contamination = {
    privateBlueprintText: "PRIVATE_BLUEPRINT_SENTINEL",
    assessment: { content: "ASSESSMENT_SENTINEL", publicName: "SUGGESTION_SENTINEL" },
    creatorAccountId: "wallet-sentinel.testnet", wallet: { accountId: "wallet-sentinel.testnet" },
    factoryAccountId: "factory-sentinel.testnet", factory: "FACTORY_SENTINEL",
    initialStewardAccountIds: ["steward-sentinel.testnet"], Stewards: ["STEWARD_SENTINEL"],
    stewardApprovalThreshold: 99, threshold: 99, projectAccountLabel: "LABEL_SENTINEL",
    projectName: "NAME_OVERRIDE_SENTINEL", projectPurpose: "PURPOSE_OVERRIDE_SENTINEL",
    approved: true, creationPlan: { transaction: "TRANSACTION_SENTINEL" },
    toJSON: () => ({ projectName: "SERIALIZATION_SENTINEL" }),
  };
  const result = mapBlueprintPublicDetails({ ...snapshot, ...contamination }, { ...reference, ...contamination });
  assert.deepEqual(result, expected);
  assert.deepEqual(Reflect.ownKeys(result), ["projectName", "projectPurpose"]);
  assert.doesNotMatch(JSON.stringify(result), /sentinel|99/i);
});

test("validation errors never echo rejected private values", () => {
  assert.throws(() => mapBlueprintPublicDetails({ ...snapshot, schemaVersion: "PRIVATE_SENTINEL" }, reference), error => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /PRIVATE_SENTINEL/);
    return true;
  });
  assert.throws(() => mapBlueprintPublicDetails(snapshot, { ...reference, blueprintRevisionId: "PRIVATE_SENTINEL" }), error => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /PRIVATE_SENTINEL/);
    return true;
  });
});

test("inherited or computed required fields cannot supply public details or approval references", () => {
  for (const field of Object.keys(snapshot)) {
    const computed = Object.defineProperty({ ...snapshot }, field, { get() { throw new Error("Getter executed"); } });
    assert.throws(() => mapBlueprintPublicDetails(computed, reference), /explicit data field/);
  }
  for (const field of Object.keys(reference)) {
    const computed = Object.defineProperty({ ...reference }, field, { get() { throw new Error("Getter executed"); } });
    assert.throws(() => mapBlueprintPublicDetails(snapshot, computed), /explicit data field/);
  }
  assert.throws(() => mapBlueprintPublicDetails(Object.create(snapshot), reference), /must be a record/);
  assert.throws(() => mapBlueprintPublicDetails(snapshot, Object.create(reference)), /must be a record/);
  const withPrivateGetter = Object.defineProperty({ ...snapshot }, "privateBlueprint", { get() { throw new Error("Private content read"); } });
  assert.deepEqual(mapBlueprintPublicDetails(withPrivateGetter, reference), expected);
});

test("null-prototype data records work without inherited fallbacks", () => {
  assert.deepEqual(mapBlueprintPublicDetails(Object.assign(Object.create(null), snapshot), Object.assign(Object.create(null), reference)), expected);
});

test("public text is neither truncated nor inferred from an imposed preparation limit", () => {
  const publicName = "Café 🌱 ".repeat(1000).trim();
  const publicDescription = "A deliberately selected public sentence.\n".repeat(1000).trim();
  assert.deepEqual(mapBlueprintPublicDetails({ ...snapshot, publicName, publicDescription }, reference), {
    projectName: publicName, projectPurpose: publicDescription,
  });
});

test("mapping is deterministic, leaves frozen inputs unchanged and returns independent outputs", () => {
  const details = Object.freeze({ ...snapshot });
  const approval = Object.freeze({ ...reference });
  const before = structuredClone({ details, approval });
  const first = mapBlueprintPublicDetails(details, approval);
  const second = mapBlueprintPublicDetails(details, approval);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  first.projectName = "A later local edit";
  assert.deepEqual(second, expected);
  assert.deepEqual({ details, approval }, before);
  assert.throws(() => mapBlueprintPublicDetails(details, Object.freeze({ ...approval, blueprintRevisionId: "stale" })), /must match/);
  assert.deepEqual({ details, approval }, before);
});

test("mapped details fit the existing Builder while its caller supplies all creation settings", () => {
  const input: CreationInput = {
    ...mapBlueprintPublicDetails(snapshot, reference),
    projectAccountLabel: "shared-cafe", creatorAccountId: "synthetic-host.testnet",
    initialStewardAccountIds: ["synthetic-helper.testnet"], stewardApprovalThreshold: 2,
    factoryAccountId: "synthetic-factory.testnet",
  };
  const plan = buildYawrdCreation(input);
  assert.deepEqual(plan.initializer.config, { name: expected.projectName, purpose: expected.projectPurpose, metadata: "" });
  assert.equal(plan.factoryCall.contractId, input.factoryAccountId);
  assert.equal(plan.factoryCall.args.name, input.projectAccountLabel);
  assert.deepEqual(plan.initializer.policy.roles[0].kind.Group, [input.creatorAccountId, ...input.initialStewardAccountIds]);
  assert.equal(plan.initializer.policy.default_vote_policy.threshold, "2");
});
