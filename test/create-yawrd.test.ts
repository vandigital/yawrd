import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildYawrdCreation, type CreationInput } from "../src/create-yawrd.ts";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
}

function assertMatchesUpstreamShapeFixture(plan: ReturnType<typeof buildYawrdCreation>, name: string): void {
  // Static expected shapes are independent of the builder. This checks JSON fields and base64
  // encoding, not Rust contract deserialization or factory execution.
  const expected = fixture(name);
  const expectedJson = JSON.stringify(expected);
  assert.deepEqual(plan.initializer, expected);
  assert.equal(Buffer.from(plan.factoryCall.args.args, "base64").toString("utf8"), expectedJson);
  assert.equal(plan.factoryCall.args.args, Buffer.from(expectedJson, "utf8").toString("base64"));
}

const input: CreationInput = {
  projectName: "  Build Café  ",
  projectPurpose: "  Make useful tools together  ",
  projectAccountLabel: "build-cafe",
  creatorAccountId: "alice.near",
  initialStewardAccountIds: ["bob.near", "carol.near"],
  stewardApprovalThreshold: 2,
  factoryAccountId: "sputnik-dao.near",
};

test("2-of-3 creation matches independent upstream shape and encoding fixture", () => {
  const plan = buildYawrdCreation(input);
  assert.equal(plan.daoAccountId, "build-cafe.sputnik-dao.near");
  assert.equal(plan.factoryCall.contractId, input.factoryAccountId);
  assert.equal(plan.factoryCall.methodName, "create");
  assert.equal(plan.factoryCall.args.name, input.projectAccountLabel);
  assert.match(plan.requiredFollowUp, /FactoryInfoUpdate.*auto_update: false/);

  assertMatchesUpstreamShapeFixture(plan, "creation-2-of-3");
  assert.deepEqual(plan.initializer.policy.default_vote_policy, {
    weight_kind: "RoleWeight", quorum: "2", threshold: "2",
  });
  assert.equal(JSON.stringify(plan.initializer.policy).includes("Everyone"), false);
});

test("single-Steward creation matches independent upstream shape and encoding fixture", () => {
  const plan = buildYawrdCreation({ ...input, initialStewardAccountIds: [], stewardApprovalThreshold: 1 });
  assertMatchesUpstreamShapeFixture(plan, "creation-single-steward");
  assert.deepEqual(plan.initializer.policy.roles[0].kind.Group, ["alice.near"]);
  assert.deepEqual(plan.initializer.policy.default_vote_policy, {
    weight_kind: "RoleWeight", quorum: "1", threshold: "1",
  });
});

test("creator repeated among initial Stewards is rejected", () => {
  assert.throws(() => buildYawrdCreation({
    ...input, initialStewardAccountIds: ["alice.near"], stewardApprovalThreshold: 1,
  }), /Duplicate Steward: alice\.near/);
});

test("duplicate Stewards are rejected", () => {
  assert.throws(() => buildYawrdCreation({ ...input, initialStewardAccountIds: ["bob.near", "bob.near"] }), /Duplicate Steward/);
});

test("derived DAO ID cannot equal creator account ID: reviewer self-Steward case", () => {
  assert.throws(() => buildYawrdCreation({
    ...input,
    projectAccountLabel: "build-cafe",
    creatorAccountId: "build-cafe.sputnik-dao.near",
    initialStewardAccountIds: [],
    stewardApprovalThreshold: 1,
  }), /New DAO account ID cannot be a Steward account ID/);
});

test("derived DAO ID cannot be an initial Steward account ID", () => {
  assert.throws(() => buildYawrdCreation({
    ...input,
    initialStewardAccountIds: ["build-cafe.sputnik-dao.near"],
  }), /New DAO account ID cannot be a Steward account ID/);
});

test("invalid account labels and overlong derived accounts are rejected", () => {
  for (const label of ["A-name", "bad.name", "bad--name", "-bad", "a"]) {
    assert.throws(() => buildYawrdCreation({ ...input, projectAccountLabel: label }), /Project account label/);
  }
  assert.throws(() => buildYawrdCreation({ ...input, projectAccountLabel: "a".repeat(60) }), /New DAO account ID/);
});

test("invalid account IDs and missing project text are rejected", () => {
  assert.throws(() => buildYawrdCreation({ ...input, creatorAccountId: "Alice.near" }), /Creator account ID/);
  assert.throws(() => buildYawrdCreation({ ...input, initialStewardAccountIds: ["bad..near"] }), /Steward account ID/);
  assert.throws(() => buildYawrdCreation({ ...input, factoryAccountId: "BAD.near" }), /Factory account ID/);
  assert.throws(() => buildYawrdCreation({ ...input, projectName: " " }), /Project name/);
  assert.throws(() => buildYawrdCreation({ ...input, projectPurpose: " " }), /Project purpose/);
});

test("threshold must be a feasible integer after creator inclusion", () => {
  for (const threshold of [0, -1, 4, 1.5, NaN, Infinity]) {
    assert.throws(() => buildYawrdCreation({ ...input, stewardApprovalThreshold: threshold }), /threshold/);
  }
});
