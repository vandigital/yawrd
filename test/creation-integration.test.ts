import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { CreationFlow, CreationRpc, RpcError, ATTEMPT_KEY, createTestnetRpc, hardeningBoundary, prepareCreation, type FactorySettings, type CreationState, type Rpc } from "../src/creation-integration.ts";
import { encodeBase64Utf8, type CreationInput } from "../src/create-yawrd.ts";

function codeHash(code: string) {
  const digest = createHash("sha256").update(code).digest();
  let value = BigInt(`0x${digest.toString("hex")}`), output = "";
  while (value) { output = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Number(value % BigInt(58))] + output; value /= BigInt(58); }
  return output;
}
// Mock-only settings. These account names, costs and code bytes identify no deployment.
const settings: FactorySettings = { network: "testnet", factoryAccountId: "fixture-factory.testnet", expectedFactoryCodeHash: codeHash("factory"), expectedDaoCodeHash: codeHash("dao"), setupDepositYocto: "10000000000000000000000", createGas: "100000000000000", costConfirmation: "Mock fixture only; not a runtime estimate" };
const input: CreationInput = { projectName: "Build Café", projectPurpose: "Build together", projectAccountLabel: "cafe", creatorAccountId: "alice.testnet", initialStewardAccountIds: ["bob.testnet"], stewardApprovalThreshold: 2, factoryAccountId: settings.factoryAccountId };
const wallet = () => ({ accountId: "alice.testnet", network: "testnet" });
const prepared = () => prepareCreation(input, settings, wallet());
const HASH = "4".repeat(44);
class MemoryStore {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
function finalized() {
  const p = prepared();
  const outcome = (id: string, executor_id: string, receipt_ids: string[], status: object) => ({ id, outcome: { executor_id, receipt_ids, status } });
  return { final_execution_status: "FINAL", status: { SuccessValue: "" },
    transaction: { hash: HASH, signer_id: input.creatorAccountId, receiver_id: settings.factoryAccountId, actions: [{ FunctionCall: { method_name: "create", args: encodeBase64Utf8(JSON.stringify(p.plan.factoryCall.args)), gas: settings.createGas, deposit: settings.setupDepositYocto } }] },
    transaction_outcome: outcome("tx", input.creatorAccountId, ["factory"], { SuccessReceiptId: "factory" }),
    receipts: [
      { receipt_id: "dao", predecessor_id: settings.factoryAccountId, receiver_id: p.plan.daoAccountId, receipt: { Action: { actions: ["CreateAccount", { FunctionCall: { method_name: "new", args: encodeBase64Utf8(JSON.stringify(p.plan.initializer)) } }] } } },
      { receipt_id: "callback", predecessor_id: settings.factoryAccountId, receiver_id: settings.factoryAccountId, receipt: { Action: { actions: [{ FunctionCall: { method_name: "on_create", args: encodeBase64Utf8(JSON.stringify({ account_id: p.plan.daoAccountId, attached_deposit: settings.setupDepositYocto, predecessor_account_id: input.creatorAccountId })) } }] } } },
    ],
    receipts_outcome: [outcome("factory", settings.factoryAccountId, ["dao", "callback"], { SuccessReceiptId: "dao" }), outcome("dao", p.plan.daoAccountId, [], { SuccessValue: "" }), outcome("callback", settings.factoryAccountId, [], { SuccessValue: "dHJ1ZQ==" })],
  };
}
function fixture() {
  let tx: any = finalized();
  const p = prepared();
  let autoUpdate = true;
  const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  const rpc: Rpc = async (method, params) => {
    requests.push({ method, params });
    if (method === "status") return { chain_id: "testnet" };
    if (method === "EXPERIMENTAL_tx_status") return tx;
    if (params.request_type === "view_account") {
      if (params.account_id === p.plan.daoAccountId) throw new RpcError({ cause: { name: "UNKNOWN_ACCOUNT" } });
      return {};
    }
    if (params.request_type === "view_code") return { code_base64: Buffer.from(params.account_id === settings.factoryAccountId ? "factory" : "dao").toString("base64") };
    if (params.request_type === "view_global_contract_code") return { code_base64: Buffer.from("dao").toString("base64") };
    if (params.request_type === "call_function") {
      if (params.method_name === "get_code") return { result: [...Buffer.from("dao")] };
      const views: Record<string, unknown> = { get_default_code_hash: settings.expectedDaoCodeHash, get_config: p.plan.initializer.config, get_policy: p.plan.initializer.policy, get_factory_info: { factory_id: settings.factoryAccountId, auto_update: autoUpdate }, get_dao_list: [p.plan.daoAccountId] };
      assert.ok(String(params.method_name) in views);
      return { result: [...Buffer.from(JSON.stringify(views[String(params.method_name)]))] };
    }
    throw new Error("Unexpected mock RPC method");
  };
  return { rpc, requests, setTx: (value: any) => { tx = value; }, setAutoUpdate: (value: boolean) => { autoUpdate = value; } };
}
function makeFlow(f = fixture(), store = new MemoryStore()) {
  const changes: CreationState[] = [];
  const flow = new CreationFlow(store, new CreationRpc(f.rpc), (s) => changes.push(s));
  return { flow, f, store, changes };
}

test("verified factory call serializes UTF-8 initializer in a single create action", () => {
  const p = prepared();
  assert.equal(p.plan.daoAccountId, "cafe.fixture-factory.testnet");
  assert.deepEqual(p.transaction, { network: "testnet", signerId: "alice.testnet", receiverId: settings.factoryAccountId, actions: [{ type: "FunctionCall", params: { methodName: "create", args: { name: "cafe", args: Buffer.from(JSON.stringify(p.plan.initializer)).toString("base64") }, gas: settings.createGas, deposit: settings.setupDepositYocto } }] });
  assert.deepEqual(p.plan.initializer.policy.default_vote_policy, { weight_kind: "RoleWeight", quorum: "2", threshold: "2" });
});
test("missing wallet, wrong network and changed creator are rejected", () => {
  assert.throws(() => prepareCreation(input, settings, { accountId: null, network: "testnet" }), /Connect/);
  assert.throws(() => prepareCreation(input, settings, { accountId: input.creatorAccountId, network: "mainnet" }), /Testnet/);
  assert.throws(() => prepareCreation(input, settings, { accountId: "other.testnet", network: "testnet" }), /changed/);
});
test("security route enforces exactly two distinct Stewards and two approvals", () => {
  for (const change of [{ initialStewardAccountIds: [] }, { initialStewardAccountIds: ["bob.testnet", "carol.testnet"] }, { stewardApprovalThreshold: 1 }, { initialStewardAccountIds: [input.creatorAccountId] }, { initialStewardAccountIds: ["bob.near"] }, { projectAccountLabel: "bad.name" }, { projectName: " " }]) assert.throws(() => prepareCreation({ ...input, ...change }, settings, wallet()));
});
test("unconfigured factory, invalid identities, deposit and gas values fail closed", () => {
  assert.throws(() => prepareCreation(input, null, wallet()), /configured/);
  for (const change of [{ factoryAccountId: "sputnik-dao.near" }, { expectedFactoryCodeHash: "" }, { expectedDaoCodeHash: "bad" }, { setupDepositYocto: "9999999999999999999999" }, { setupDepositYocto: "1.5" }, { setupDepositYocto: (BigInt(2) ** BigInt(128)).toString() }, { createGas: "50000000000000" }, { createGas: "300000000000001" }, { costConfirmation: "" }]) assert.throws(() => prepareCreation(input, { ...settings, ...change }, wallet()));
});
test("preflight verifies chain, factory identity, default, stored/global code and accounts", async () => {
  const f = fixture(); await new CreationRpc(f.rpc).preflight(prepared());
  assert.ok(f.requests.some((r) => r.params.request_type === "view_global_contract_code"));
  assert.ok(f.requests.some((r) => r.params.method_name === "get_code"));
});
test("preflight rejects wrong chain, code, default, missing global code and missing Steward", async () => {
  const replacements: Array<(method: string, params: any) => any> = [
    (m) => m === "status" ? { chain_id: "mainnet" } : undefined,
    (_, p) => p.request_type === "view_code" ? { code_base64: "YmFk" } : undefined,
    (_, p) => p.method_name === "get_default_code_hash" ? { result: [...Buffer.from(JSON.stringify("wrong"))] } : undefined,
    (_, p) => { if (p.request_type === "view_global_contract_code") throw new Error("Global code missing"); },
    (_, p) => { if (p.account_id === "bob.testnet") throw new Error("Steward missing"); },
  ];
  for (const replace of replacements) { const f = fixture(); await assert.rejects(new CreationRpc(async (m, p) => (await replace(m, p)) ?? f.rpc(m, p)).preflight(prepared())); }
});
test("existing address and ambiguous lookup errors never permit a create request", async () => {
  for (const mode of ["exists", "error"]) {
    const f = fixture();
    const rpc: Rpc = (m, p) => {
      if (p.request_type === "view_account" && p.account_id === prepared().plan.daoAccountId) {
        if (mode === "exists") return Promise.resolve({});
        return Promise.reject(new RpcError({ cause: { name: "TIMEOUT_ERROR" } }));
      }
      return f.rpc(m, p);
    };
    await assert.rejects(new CreationRpc(rpc).preflight(prepared()));
  }
});
test("mocked success requires wallet request, finalized callback and exact project state", async () => {
  const { flow, changes, store } = makeFlow();
  await flow.review(input, settings, wallet());
  assert.equal(flow.state.phase, "ready");
  let calls = 0;
  await flow.submit(input, wallet, async (tx) => { calls++; assert.deepEqual(tx, prepared().transaction); assert.equal(JSON.parse(store.getItem(ATTEMPT_KEY)!).phase, "awaiting-wallet"); return { transaction: { hash: HASH } }; });
  assert.equal(calls, 1); assert.equal(flow.state.phase, "confirmed"); assert.equal(flow.state.autoUpdate, true);
  assert.ok(changes.some((s) => s.phase === "awaiting-wallet")); assert.ok(changes.some((s) => s.phase === "pending"));
  assert.match(flow.state.message, /Hardening Required/);
  assert.equal(hardeningBoundary(prepared()).projectFundingEnabled, false);
  assert.deepEqual(hardeningBoundary(prepared()).proposalKind, { FactoryInfoUpdate: { factory_info: { factory_id: settings.factoryAccountId, auto_update: false } } });
});
test("user rejection is distinct from an ambiguous wallet error", async () => {
  for (const rejected of [true, false]) {
    const { flow } = makeFlow(); await flow.review(input, settings, wallet());
    await flow.submit(input, wallet, async () => { throw Object.assign(new Error("Wallet request error"), rejected ? { code: 4001 } : {}); });
    assert.equal(flow.state.phase, rejected ? "rejected" : "unknown");
  }
});
test("explicit connector rejection messages and named rejections remain retryable", async () => {
  for (const error of [new Error("User rejected"), "User rejected", Object.assign(new Error("Cancelled"), { name: "UserRejected" })]) {
    const { flow } = makeFlow(); await flow.review(input, settings, wallet());
    await flow.submit(input, wallet, async () => { throw error; }); assert.equal(flow.state.phase, "rejected");
    await flow.review(input, settings, wallet()); assert.equal(flow.state.phase, "ready");
  }
});
test("wallet response or hash without final execution evidence cannot confirm creation", async () => {
  for (const response of [{}, { transaction: { hash: HASH } }]) {
    const { flow, f } = makeFlow(); await flow.review(input, settings, wallet());
    f.setTx({ ...finalized(), final_execution_status: "EXECUTED_OPTIMISTIC" });
    await flow.submit(input, wallet, async () => response);
    assert.equal(flow.state.phase, "transaction" in response ? "pending" : "unknown");
  }
});
test("failed receipt is reported without claiming a settled refund", async () => {
  const { flow, f } = makeFlow(); await flow.review(input, settings, wallet());
  const tx = finalized(); tx.receipts_outcome[1]!.outcome.status = { Failure: { error: "init failed" } }; f.setTx(tx);
  await flow.submit(input, wallet, async () => ({ transaction: { hash: HASH } }));
  assert.equal(flow.state.phase, "failed"); assert.match(flow.state.message, /refund settlement is not confirmed/);
});
test("missing receipts, unknown status, absent callback and wrong transaction remain unresolved", async () => {
  const mutations = [
    (tx: any) => { tx.receipts_outcome.pop(); },
    (tx: any) => { tx.receipts_outcome[1].outcome.status = "Unknown"; },
    (tx: any) => { tx.receipts_outcome[2].outcome.status.SuccessValue = "ZmFsc2U="; },
    (tx: any) => { tx.transaction.signer_id = "other.testnet"; },
    (tx: any) => { tx.transaction.actions[0].FunctionCall.deposit = "1"; },
    (tx: any) => { tx.transaction.actions[0].FunctionCall.args = encodeBase64Utf8("{}"); },
    (tx: any) => { delete tx.receipts; },
    (tx: any) => { tx.receipts[1].receipt.Action.actions[0].FunctionCall.args = encodeBase64Utf8("{}"); },
  ];
  for (const mutate of mutations) { const { flow, f } = makeFlow(); await flow.review(input, settings, wallet()); const tx = finalized(); mutate(tx); f.setTx(tx); await flow.submit(input, wallet, async () => ({ transaction: { hash: HASH } })); assert.equal(flow.state.phase, "unknown"); }
});
test("post-state mismatches cannot be marked confirmed", async () => {
  for (const method of ["get_config", "get_policy", "get_factory_info", "get_dao_list"]) {
    const f = fixture(); const rpc: Rpc = (m, p) => p.method_name === method ? Promise.resolve({ result: [...Buffer.from(JSON.stringify({}))] }) : f.rpc(m, p);
    await assert.rejects(new CreationRpc(rpc).verify(prepared(), HASH));
  }
});
test("actual project code must match even if the factory default changed during approval", async () => {
  const f = fixture();
  await assert.rejects(new CreationRpc((m, p) => p.request_type === "view_code" && p.account_id === prepared().plan.daoAccountId ? Promise.resolve({ code_base64: Buffer.from("unexpected-dao-code").toString("base64") }) : f.rpc(m, p)).verify(prepared(), HASH), /code does not match/);
});
test("RPC timeout preserves the transaction hash and reconciles without another signature", async () => {
  const f = fixture(); let unavailable = true;
  const flow = new CreationFlow(new MemoryStore(), new CreationRpc((m, p) => m === "EXPERIMENTAL_tx_status" && unavailable ? Promise.reject(new Error("RPC timeout")) : f.rpc(m, p)), () => {});
  await flow.review(input, settings, wallet()); let signed = 0;
  await flow.submit(input, wallet, async () => { signed++; return { transaction: { hash: HASH } }; });
  assert.equal(flow.state.phase, "unknown"); assert.equal(flow.state.hash, HASH);
  unavailable = false; await flow.reconcile();
  assert.equal(flow.state.phase, "confirmed"); assert.equal(signed, 1);
});
test("disabled auto-update alone never enables Project Funds or marks security hardening complete", async () => {
  const { flow, f } = makeFlow(); f.setAutoUpdate(false); await flow.review(input, settings, wallet());
  await flow.submit(input, wallet, async () => ({ transaction: { hash: HASH } }));
  assert.equal(flow.state.phase, "confirmed"); assert.equal(flow.state.autoUpdate, false); assert.match(flow.state.message, /Hardening Required/);
});
test("double clicks and pending attempts cannot request another signature", async () => {
  const { flow, f } = makeFlow(); await flow.review(input, settings, wallet());
  let resolve!: (value: unknown) => void, calls = 0;
  const wait = new Promise((done) => { resolve = done; });
  const sign = async () => { calls++; return wait; };
  const first = flow.submit(input, wallet, sign);
  await flow.submit(input, wallet, sign);
  // Wait for preflight to reach the mocked wallet without a timer.
  while (calls === 0) await new Promise<void>((done) => setImmediate(done));
  assert.equal(calls, 1);
  f.setTx({ ...finalized(), final_execution_status: "EXECUTED" }); resolve({ transaction: { hash: HASH } }); await first;
  await flow.review(input, settings, wallet()); await flow.submit(input, wallet, sign);
  assert.equal(calls, 1); assert.equal(flow.state.phase, "pending");
});
test("reload recovery reconciles a wallet callback without signing again", async () => {
  const { flow, store, f } = makeFlow(); await flow.review(input, settings, wallet());
  await flow.submit(input, wallet, async () => ({}));
  const restored = makeFlow(f, store).flow; assert.equal(restored.state.phase, "unknown");
  await restored.reconcile(HASH); assert.equal(restored.state.phase, "confirmed");
});
test("durable lock prevents a stale second tab from submitting", async () => {
  const store = new MemoryStore(); const a = makeFlow(fixture(), store).flow; const b = makeFlow(fixture(), store).flow;
  await a.review(input, settings, wallet()); await b.review(input, settings, wallet());
  await a.submit(input, wallet, async () => ({}));
  let calls = 0; await b.submit(input, wallet, async () => { calls++; }); assert.equal(calls, 0);
});
test("changed form, wallet or RPC network invalidates the reviewed request", async () => {
  for (const mode of ["form", "wallet", "network"]) {
    const f = fixture(); let changed = false;
    const flow = new CreationFlow(new MemoryStore(), new CreationRpc((m, p) => changed && m === "status" && mode === "network" ? Promise.resolve({ chain_id: "mainnet" }) : f.rpc(m, p)), () => {});
    await flow.review(input, settings, wallet()); changed = true;
    let calls = 0;
    await flow.submit(mode === "form" ? { ...input, projectName: "Changed" } : input, mode === "wallet" ? () => ({ accountId: "bob.testnet", network: "testnet" }) : wallet, async () => { calls++; });
    assert.equal(calls, 0); assert.equal(flow.state.phase, "failed");
  }
});
test("storage failure before approval prevents signing and corrupt saved data blocks retries", async () => {
  const store = new MemoryStore(); const { flow } = makeFlow(fixture(), store); await flow.review(input, settings, wallet());
  store.setItem = () => { throw new Error("Storage unavailable"); };
  let calls = 0; await flow.submit(input, wallet, async () => { calls++; }); assert.equal(calls, 0);
  const corrupt = new MemoryStore(); corrupt.setItem(ATTEMPT_KEY, "not json"); assert.equal(makeFlow(fixture(), corrupt).flow.state.phase, "unknown");
});
test("read-only transport forbids broadcast methods and handles RPC errors", async () => {
  const rpc = createTestnetRpc(async (_url, init) => { const body = JSON.parse(String(init?.body)); assert.equal(body.method, "status"); return new Response(JSON.stringify({ result: { chain_id: "testnet" } })); });
  assert.deepEqual(await rpc("status", {}), { chain_id: "testnet" }); await assert.rejects(rpc("send_tx", {}), /Read-only/);
  await assert.rejects(createTestnetRpc(async () => new Response(JSON.stringify({ error: { cause: { name: "TIMEOUT_ERROR" } } })))("query", {}), RpcError);
});
