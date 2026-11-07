import { buildYawrdCreation, encodeBase64Utf8, type CreationInput, type CreationPlan } from "./create-yawrd.ts";

export interface FactorySettings {
  network: "testnet";
  factoryAccountId: string;
  expectedFactoryCodeHash: string;
  expectedDaoCodeHash: string;
  setupDepositYocto: string;
  createGas: string;
  // Operator-reviewed runtime values; the source minimum is not a sufficient-cost estimate.
  costConfirmation: string;
}

export interface CreationTransaction {
  network: "testnet";
  signerId: string;
  receiverId: string;
  actions: [{ type: "FunctionCall"; params: { methodName: "create"; args: { name: string; args: string }; gas: string; deposit: string } }];
}
export interface PreparedCreation {
  input: CreationInput;
  settings: FactorySettings;
  plan: CreationPlan;
  transaction: CreationTransaction;
}
export type CreationPhase = "idle" | "checking" | "ready" | "awaiting-wallet" | "pending" | "confirmed" | "rejected" | "failed" | "unknown";
export interface CreationState {
  phase: CreationPhase;
  message: string;
  prepared?: PreparedCreation;
  hash?: string;
  autoUpdate?: boolean;
}
export interface AttemptStore { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const ATTEMPT_KEY = "yawrd:testnet:creation:v1";
export type Rpc = (method: string, params: Record<string, unknown>) => Promise<any>;
const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const integer = (value: string) => typeof value === "string" && /^[1-9][0-9]*$/.test(value);

export function prepareCreation(input: CreationInput, settings: FactorySettings | null, wallet: { accountId: string | null; network: string }): PreparedCreation {
  if (!wallet.accountId) throw new Error("Connect Meteor Wallet on Testnet first.");
  if (wallet.network !== "testnet") throw new Error("Switch your wallet to Testnet.");
  if (!settings || settings.network !== "testnet") throw new Error("A verified Testnet factory and setup costs must be configured before opening a Yawrd.");
  if (input.creatorAccountId !== wallet.accountId) throw new Error("The creator account changed. Review again.");
  if (input.factoryAccountId !== settings.factoryAccountId || !settings.factoryAccountId.endsWith(".testnet")) throw new Error("Factory must match the configured Testnet account.");
  if (!HASH.test(settings.expectedFactoryCodeHash) || !HASH.test(settings.expectedDaoCodeHash)) throw new Error("Expected factory and project code hashes are required.");
  if (!integer(settings.setupDepositYocto) || BigInt(settings.setupDepositYocto) < BigInt("10000000000000000000000") || BigInt(settings.setupDepositYocto) >= BigInt(2) ** BigInt(128)) throw new Error("Confirmed setup deposit must meet the factory minimum of 0.01 NEAR and fit u128.");
  if (!integer(settings.createGas) || BigInt(settings.createGas) <= BigInt("50000000000000") || BigInt(settings.createGas) > BigInt("300000000000000")) throw new Error("Confirmed creation gas must exceed the 50 Tgas reserved by the factory and be at most 300 Tgas.");
  if (!settings.costConfirmation.trim()) throw new Error("Setup deposit and gas require operator confirmation.");
  const plan = buildYawrdCreation(input);
  const members = plan.initializer.policy.roles[0].kind.Group;
  if (members.length !== 2 || input.stewardApprovalThreshold !== 2) throw new Error("Testnet opening requires exactly two Stewards and two approvals.");
  if (members.some((id) => id.endsWith(".near"))) throw new Error("Use Testnet Steward accounts.");
  return structuredClone({ input, settings, plan, transaction: {
    network: "testnet", signerId: wallet.accountId, receiverId: settings.factoryAccountId,
    actions: [{ type: "FunctionCall", params: { methodName: "create", args: plan.factoryCall.args, gas: settings.createGas, deposit: settings.setupDepositYocto } }],
  } });
}

export class RpcError extends Error {
  detail: unknown;
  constructor(detail: unknown) { super("Testnet RPC request failed. Recheck the outcome before retrying."); this.detail = detail; }
}

/** Public read-only RPC only; no transaction broadcast method is exposed. */
export function createTestnetRpc(fetcher: typeof fetch = fetch): Rpc {
  return async (method, params) => {
    if (!["status", "query", "EXPERIMENTAL_tx_status", "block", "chunk", "EXPERIMENTAL_receipt_to_tx"].includes(method)) throw new Error("Read-only RPC method required.");
    const response = await fetcher("https://rpc.testnet.near.org", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "yawrd-creation", method, params }), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("Testnet RPC is unavailable.");
    const body = await response.json();
    if (body.error || body.result === undefined) throw new RpcError(body.error);
    return body.result;
  };
}

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function decodeBase64(value: string): string { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0))); }

export class CreationRpc {
  private rpc: Rpc;
  constructor(rpc: Rpc) { this.rpc = rpc; }
  async network() { if ((await this.rpc("status", {})).chain_id !== "testnet") throw new Error("RPC network must be Testnet."); }
  query(request_type: string, params: Record<string, unknown>) { return this.rpc("query", { request_type, finality: "final", ...params }); }
  async view(account_id: string, method_name: string): Promise<any> {
    const result = await this.query("call_function", { account_id, method_name, args_base64: "e30=" });
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(result.result)));
  }
  async code(request_type: string, params: Record<string, unknown>, expected: string) {
    const result = await this.query(request_type, params);
    // Hash the actual returned code, including code resolved through a global contract.
    const bytes = request_type === "call_function" ? Uint8Array.from(result.result) : Uint8Array.from(atob(result.code_base64), (c) => c.charCodeAt(0));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    let n = BigInt(0);
    for (const byte of digest) n = n * BigInt(256) + BigInt(byte);
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let hash = "";
    while (n) { hash = alphabet[Number(n % BigInt(58))] + hash; n /= BigInt(58); }
    for (const byte of digest) { if (byte !== 0) break; hash = "1" + hash; }
    if (hash !== expected) throw new Error("Contract code does not match the reviewed public build.");
  }
  async preflight(p: PreparedCreation) {
    await this.network();
    await this.code("view_code", { account_id: p.settings.factoryAccountId }, p.settings.expectedFactoryCodeHash);
    if (await this.view(p.settings.factoryAccountId, "get_default_code_hash") !== p.settings.expectedDaoCodeHash) throw new Error("Factory default project code has changed or is incompatible.");
    await this.code("call_function", { account_id: p.settings.factoryAccountId, method_name: "get_code", args_base64: encodeBase64Utf8(JSON.stringify({ code_hash: p.settings.expectedDaoCodeHash })) }, p.settings.expectedDaoCodeHash);
    await this.code("view_global_contract_code", { code_hash: p.settings.expectedDaoCodeHash }, p.settings.expectedDaoCodeHash);
    for (const account_id of p.plan.initializer.policy.roles[0].kind.Group) await this.query("view_account", { account_id });
    try {
      await this.query("view_account", { account_id: p.plan.daoAccountId });
    } catch (error) {
      if (error instanceof RpcError && (error.detail as any)?.cause?.name === "UNKNOWN_ACCOUNT") return;
      throw error;
    }
    throw new Error("This project address already exists. Choose another label.");
  }
  async verify(p: PreparedCreation, hash: string): Promise<{ phase: "pending" | "confirmed" | "failed"; autoUpdate?: boolean }> {
    if (!HASH.test(hash)) throw new Error("Enter a valid transaction hash.");
    await this.network();
    const result = await this.rpc("EXPERIMENTAL_tx_status", { tx_hash: hash, sender_account_id: p.transaction.signerId, wait_until: "FINAL" });
    const tx = result.transaction;
    const call = tx?.actions?.[0]?.FunctionCall;
    const expected = p.transaction.actions[0].params;
    if (tx?.hash !== hash || tx.signer_id !== p.transaction.signerId || tx.receiver_id !== p.transaction.receiverId || tx.actions.length !== 1 || !call || call.method_name !== "create" || String(call.deposit) !== expected.deposit || String(call.gas) !== expected.gas || canonical(JSON.parse(decodeBase64(call.args))) !== canonical(expected.args)) throw new Error("Transaction does not match the reviewed creation request.");
    if (result.final_execution_status !== "FINAL") return { phase: "pending" };
    const receipts = result.receipts_outcome;
    const receiptDetails = result.receipts;
    if (!Array.isArray(receipts) || !Array.isArray(receiptDetails) || !result.transaction_outcome?.outcome) throw new Error("Final receipt evidence is incomplete.");
    const outcomes = [result.transaction_outcome, ...receipts];
    const receiptIds = new Set(receipts.map((r: any) => r.id));
    // Data receipts have no execution outcome. Require outcomes for every returned
    // Action receipt; FINAL also requires refund receipts to have finished.
    if (outcomes.some((r: any) => !r.outcome?.status) || receiptDetails.some((r: any) => r.receipt?.Action && !receiptIds.has(r.receipt_id))) throw new Error("Final receipt evidence is incomplete.");
    if (outcomes.some((r: any) => "Failure" in r.outcome.status) || (result.status && "Failure" in result.status)) return { phase: "failed" };
    if (!result.status || typeof result.status !== "object" || !("SuccessValue" in result.status)) throw new Error("Final transaction outcome is unresolved.");
    if (outcomes.some((r: any) => !("SuccessValue" in r.outcome.status || "SuccessReceiptId" in r.outcome.status))) throw new Error("Receipt outcome is unresolved.");
    const hasCall = (receipt: any, method: string, args: unknown) => receipt.receipt?.Action?.actions?.some((action: any) => action.FunctionCall?.method_name === method && canonical(JSON.parse(decodeBase64(action.FunctionCall.args))) === canonical(args));
    const created = receiptDetails.find((r: any) => r.predecessor_id === p.settings.factoryAccountId && r.receiver_id === p.plan.daoAccountId && hasCall(r, "new", p.plan.initializer));
    // Both promises are scheduled by create; callback is not a child receipt of new.
    const callback = receiptDetails.find((r: any) => r.predecessor_id === p.settings.factoryAccountId && r.receiver_id === p.settings.factoryAccountId && hasCall(r, "on_create", { account_id: p.plan.daoAccountId, attached_deposit: expected.deposit, predecessor_account_id: p.transaction.signerId }));
    if (!created || !callback || !receipts.some((r: any) => r.id === created.receipt_id && r.outcome.executor_id === p.plan.daoAccountId) || !receipts.some((r: any) => r.id === callback.receipt_id && r.outcome.executor_id === p.settings.factoryAccountId && r.outcome.status.SuccessValue === "dHJ1ZQ==")) throw new Error("Factory initialization and creation callback have not been verified.");
    await this.code("view_code", { account_id: p.plan.daoAccountId }, p.settings.expectedDaoCodeHash);
    const [config, policy, factory, registry] = await Promise.all([
      this.view(p.plan.daoAccountId, "get_config"), this.view(p.plan.daoAccountId, "get_policy"),
      this.view(p.plan.daoAccountId, "get_factory_info"), this.view(p.settings.factoryAccountId, "get_dao_list"),
    ]);
    if (canonical(config) !== canonical(p.plan.initializer.config) || canonical(policy) !== canonical(p.plan.initializer.policy) || factory.factory_id !== p.settings.factoryAccountId || typeof factory.auto_update !== "boolean" || !Array.isArray(registry) || !registry.includes(p.plan.daoAccountId)) throw new Error("Created project state does not match the reviewed configuration.");
    return { phase: "confirmed", autoUpdate: factory.auto_update };
  }
}

export function hardeningBoundary(p: PreparedCreation) {
  return { proposalKind: { FactoryInfoUpdate: { factory_info: { factory_id: p.settings.factoryAccountId, auto_update: false } } }, requiredDistinctApprovals: 2, projectFundingEnabled: false as const };
}

/** Stores public transaction metadata only, before opening the wallet. Never retries signing. */
export class CreationFlow {
  state: CreationState = { phase: "idle", message: "Review your Yawrd before opening it." };
  private store: AttemptStore;
  private rpc: CreationRpc;
  private onChange: (s: CreationState) => void;
  private busy = false;
  constructor(store: AttemptStore, rpc: CreationRpc, onChange: (s: CreationState) => void) {
    this.store = store; this.rpc = rpc; this.onChange = onChange;
    const saved = store.getItem(ATTEMPT_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved) as CreationState;
        if (!state.prepared || !["awaiting-wallet", "pending", "unknown", "confirmed", "failed", "rejected"].includes(state.phase)) throw new Error("Invalid saved attempt");
        const rebuilt = prepareCreation(state.prepared.input, state.prepared.settings, { accountId: state.prepared.input.creatorAccountId, network: "testnet" });
        if (canonical(rebuilt) !== canonical(state.prepared)) throw new Error("Invalid saved request");
        this.state = ["awaiting-wallet", "pending", "unknown"].includes(state.phase)
          ? { ...state, phase: "unknown", message: "A previous wallet request needs reconciliation. Do not submit again." } : state;
      } catch { this.state = { phase: "unknown", message: "Saved creation data could not be read. Reconcile your wallet activity before continuing." }; }
    }
  }
  private update(state: CreationState, persist = false) {
    if (persist) this.store.setItem(ATTEMPT_KEY, JSON.stringify(state));
    this.state = state; this.onChange(state);
  }
  async review(input: CreationInput, settings: FactorySettings | null, wallet: { accountId: string | null; network: string }) {
    if (this.busy || ["awaiting-wallet", "pending", "unknown", "confirmed"].includes(this.state.phase)) return;
    this.busy = true;
    this.update({ phase: "checking", message: "Checking Testnet accounts, project code and factory settings…" });
    try {
      const prepared = prepareCreation(input, settings, wallet);
      await this.rpc.preflight(prepared);
      this.update({ phase: "ready", message: "Ready for review. Opening your wallet requires a separate click.", prepared });
    } catch (error) { this.update({ phase: "failed", message: error instanceof Error ? error.message : "Review failed." }); }
    finally { this.busy = false; }
  }
  async submit(currentInput: CreationInput, getWallet: () => { accountId: string | null; network: string }, sign: (tx: CreationTransaction) => Promise<unknown>) {
    if (this.busy || this.state.phase !== "ready" || !this.state.prepared) return;
    const prepared = this.state.prepared;
    this.busy = true;
    let walletRequested = false;
    let walletReturned = false;
    try {
      const saved = this.store.getItem(ATTEMPT_KEY);
      if (saved && !["rejected", "failed"].includes(JSON.parse(saved).phase)) throw new Error("An existing creation attempt needs reconciliation.");
      if (canonical(prepareCreation(currentInput, prepared.settings, getWallet())) !== canonical(prepared)) throw new Error("Your details changed. Review again.");
      await this.rpc.preflight(prepared);
      prepareCreation(currentInput, prepared.settings, getWallet());
      this.update({ phase: "awaiting-wallet", message: "Awaiting wallet approval. Setup deposit and network fees apply.", prepared }, true);
      walletRequested = true;
      const outcome = await sign(structuredClone(prepared.transaction));
      walletReturned = true;
      const hash = (outcome as any)?.transaction?.hash;
      this.update({ phase: hash ? "pending" : "unknown", message: "Wallet request returned. Verifying creation on Testnet…", prepared, hash }, true);
      if (hash) await this.check(hash);
    } catch (error) {
      const code = (error as any)?.code;
      const rejected = walletRequested && !walletReturned && ([4001, "USER_REJECTED", "UserRejected"].includes(code) || (error as any)?.name === "UserRejected" || (error as any)?.message === "User rejected" || error === "User rejected");
      const state: CreationState = { phase: rejected ? "rejected" : walletRequested ? "unknown" : "failed", message: rejected ? "Wallet request rejected. No creation was confirmed." : error instanceof Error ? error.message : "Creation outcome is unknown.", prepared, hash: this.state.hash };
      // Preserve the durable awaiting-wallet record if storage becomes unavailable after signing.
      try { this.update(state, walletRequested); } catch { this.update({ ...state, phase: "unknown", message: "Outcome could not be saved. Reconcile wallet activity before submitting again." }); }
    } finally { this.busy = false; }
  }
  private async check(hash: string) {
    const prepared = this.state.prepared;
    if (!prepared) throw new Error("Saved request is unavailable; manual reconciliation is required.");
    const verified = await this.rpc.verify(prepared, hash);
    this.update({ ...this.state, ...verified, hash, message: verified.phase === "confirmed" ? "Yawrd opened. Hardening Required. Project funding remains disabled." : verified.phase === "failed" ? "Creation failed. Check wallet receipts for deposit refunds and network fees; refund settlement is not confirmed here." : "Submitted; awaiting finalized creation receipts." }, true);
  }
  async reconcile(hash = this.state.hash) {
    if (this.busy || !hash || !this.state.prepared) return;
    this.busy = true;
    try { await this.check(hash); }
    catch (error) { this.update({ ...this.state, phase: "unknown", message: error instanceof Error ? error.message : "Outcome remains unknown." }); }
    finally { this.busy = false; }
  }
}
