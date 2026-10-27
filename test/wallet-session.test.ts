import assert from "node:assert/strict";
import test from "node:test";
import type { Account, NearConnector } from "@hot-labs/near-connect";
import { TestnetWalletSession } from "../app/wallet-session.ts";
import { buildYawrdCreation } from "../src/create-yawrd.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

class FakeWallet {
  manifest = { id: "meteor-wallet" };
  accounts: Account[] = [];
  network: string | undefined;

  async getAccounts({ network }: { network: string }) {
    this.network = network;
    return this.accounts;
  }
}

class FakeConnector {
  whenManifestLoaded = Promise.resolve();
  availableWallets: FakeWallet[] = [];
  wallet = new FakeWallet();
  listeners = new Map<string, Set<(event: any) => void>>();
  getConnected = async () => ({ wallet: this.wallet });
  disconnectWallet = async () => { this.emit("wallet:signOut", {}); };
  connectOptions: unknown;

  on(event: string, callback: (event: any) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (event: any) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  emit(event: string, payload: unknown) {
    for (const callback of this.listeners.get(event) ?? []) callback(payload);
  }

  listenerCount(event: string) { return this.listeners.get(event)?.size ?? 0; }
  async getConnectedWallet() { return this.getConnected(); }
  async connect(options: unknown) {
    this.connectOptions = options;
    this.emit("wallet:signIn", { wallet: this.wallet, accounts: this.wallet.accounts });
  }
  async disconnect() { await this.disconnectWallet(); }
}

function makeSession(fake: FakeConnector, onChange: (accountId: string | null) => void = () => {}) {
  return new TestnetWalletSession(fake as unknown as NearConnector, (state) => onChange(state.accountId));
}

function currentPlan(session: TestnetWalletSession) {
  const creatorAccountId = session.snapshot.accountId;
  return creatorAccountId ? buildYawrdCreation({
    projectName: "Test Yawrd",
    projectPurpose: "Check account state",
    projectAccountLabel: "test-yawrd",
    creatorAccountId,
    initialStewardAccountIds: [],
    stewardApprovalThreshold: 1,
    factoryAccountId: "sputnik-dao.near",
  }) : null;
}

test("delayed Meteor registration updates availability and cleans up listeners", async () => {
  const fake = new FakeConnector();
  fake.getConnected = async () => { throw new Error("No wallet selected"); };
  const restored = deferred<void>();
  const session = makeSession(fake, (accountId) => {
    if (accountId === "late.testnet") restored.resolve();
  });
  await session.start();
  assert.equal(session.snapshot.ready, true);
  assert.equal(session.snapshot.available, false);
  assert.equal(fake.listenerCount("selector:walletsChanged"), 1);

  fake.wallet.accounts = [{ accountId: "late.testnet" }];
  fake.getConnected = async () => ({ wallet: fake.wallet });
  fake.availableWallets = [fake.wallet];
  fake.emit("selector:walletsChanged", {});
  assert.equal(session.snapshot.available, true);
  await restored.promise;
  assert.equal(session.snapshot.accountId, "late.testnet");

  fake.availableWallets = [];
  await session.connect();
  assert.equal(fake.connectOptions, undefined);
  assert.match(session.snapshot.error ?? "", /unavailable/);

  session.stop();
  assert.equal(fake.listenerCount("selector:walletsChanged"), 0);
  assert.equal(fake.listenerCount("wallet:signIn"), 0);
  assert.equal(fake.listenerCount("wallet:signOut"), 0);
  fake.availableWallets = [];
  fake.emit("selector:walletsChanged", {});
  assert.equal(session.snapshot.available, true);
});

test("registration during the initial lookup retries account restoration", async () => {
  const fake = new FakeConnector();
  const firstLookup = deferred<{ wallet: FakeWallet }>();
  fake.getConnected = () => firstLookup.promise;
  const session = makeSession(fake);
  const start = session.start();
  await Promise.resolve();
  assert.equal(fake.listenerCount("selector:walletsChanged"), 1);

  fake.wallet.accounts = [{ accountId: "late.testnet" }];
  fake.availableWallets = [fake.wallet];
  fake.getConnected = async () => ({ wallet: fake.wallet });
  fake.emit("selector:walletsChanged", {});
  firstLookup.resolve({ wallet: fake.wallet });
  await start;
  assert.equal(session.snapshot.accountId, "late.testnet");
  session.stop();
});

test("another wallet registering during Meteor restoration starts a replacement lookup", async () => {
  const fake = new FakeConnector();
  fake.availableWallets = [fake.wallet];
  fake.wallet.accounts = [{ accountId: "alice.testnet" }];
  const firstLookup = deferred<{ wallet: FakeWallet }>();
  let lookups = 0;
  fake.getConnected = () => {
    lookups++;
    return lookups === 1 ? firstLookup.promise : Promise.resolve({ wallet: fake.wallet });
  };
  const session = makeSession(fake);
  const start = session.start();
  await Promise.resolve();

  // The available Meteor instance is unchanged; HOT Connect also emits this
  // event when an unrelated wallet registers.
  fake.emit("selector:walletsChanged", {});
  firstLookup.resolve({ wallet: fake.wallet });
  await start;
  assert.equal(lookups, 2);
  assert.equal(session.snapshot.accountId, "alice.testnet");
  session.stop();
});

test("walletsChanged revalidates accounts while Meteor remains available", async () => {
  const fake = new FakeConnector();
  fake.availableWallets = [fake.wallet];
  fake.wallet.accounts = [{ accountId: "alice.testnet" }];
  const updated = deferred<void>();
  const session = makeSession(fake, (accountId) => {
    if (accountId === "bob.testnet") updated.resolve();
  });
  await session.start();
  fake.wallet.accounts = [{ accountId: "bob.testnet" }];
  fake.emit("selector:walletsChanged", {});
  await updated.promise;
  assert.equal(session.snapshot.available, true);
  assert.equal(currentPlan(session)?.initializer.policy.roles[0].kind.Group[0], "bob.testnet");
  session.stop();
});

test("Meteor replacement clears the old creator until the new wallet is checked", async () => {
  const fake = new FakeConnector();
  const oldWallet = fake.wallet;
  fake.availableWallets = [oldWallet];
  oldWallet.accounts = [{ accountId: "alice.testnet" }];
  const restored = deferred<void>();
  const session = makeSession(fake, (accountId) => {
    if (accountId === "bob.testnet") restored.resolve();
  });
  await session.start();
  assert.equal(session.snapshot.accountId, "alice.testnet");

  const replacement = new FakeWallet();
  replacement.accounts = [{ accountId: "bob.testnet" }];
  const pendingLookup = deferred<{ wallet: FakeWallet }>();
  fake.wallet = replacement;
  fake.availableWallets = [replacement];
  fake.getConnected = () => pendingLookup.promise;
  fake.emit("selector:walletsChanged", {});
  assert.equal(session.snapshot.accountId, null);
  assert.equal(currentPlan(session), null);

  fake.emit("wallet:signIn", { wallet: oldWallet, accounts: oldWallet.accounts });
  assert.equal(currentPlan(session), null);
  pendingLookup.resolve({ wallet: replacement });
  await restored.promise;
  assert.equal(currentPlan(session)?.initializer.policy.roles[0].kind.Group[0], "bob.testnet");
  session.stop();
});

test("restores only a Testnet Meteor account and connects without approval options", async () => {
  const fake = new FakeConnector();
  fake.availableWallets = [fake.wallet];
  fake.wallet.accounts = [{ accountId: "alice.testnet" }];
  const session = makeSession(fake);
  await session.start();
  assert.equal(session.snapshot.accountId, "alice.testnet");
  assert.equal(fake.wallet.network, "testnet");
  assert.equal(currentPlan(session)?.initializer.policy.roles[0].kind.Group[0], "alice.testnet");

  await session.connect();
  assert.deepEqual(fake.connectOptions, { walletId: "meteor-wallet" });
  session.stop();
});

test("older overlapping refresh cannot replace the latest account", async () => {
  const fake = new FakeConnector();
  fake.availableWallets = [fake.wallet];
  fake.wallet.accounts = [{ accountId: "initial.testnet" }];
  const session = makeSession(fake);
  await session.start();

  const old = deferred<{ wallet: FakeWallet }>();
  const recent = deferred<{ wallet: FakeWallet }>();
  const pending = [old.promise, recent.promise];
  fake.getConnected = () => pending.shift()!;
  const oldRefresh = session.refresh();
  const recentRefresh = session.refresh();
  const recentWallet = new FakeWallet();
  recentWallet.accounts = [{ accountId: "recent.testnet" }];
  recent.resolve({ wallet: recentWallet });
  await recentRefresh;
  old.resolve({ wallet: fake.wallet });
  await oldRefresh;
  assert.equal(session.snapshot.accountId, "recent.testnet");
  assert.equal(currentPlan(session)?.initializer.policy.roles[0].kind.Group[0], "recent.testnet");
  session.stop();
});

test("disconnect invalidates a pending refresh and its creation plan", async () => {
  const fake = new FakeConnector();
  fake.availableWallets = [fake.wallet];
  fake.wallet.accounts = [{ accountId: "alice.testnet" }];
  const session = makeSession(fake);
  await session.start();

  const pendingRefresh = deferred<{ wallet: FakeWallet }>();
  const pendingDisconnect = deferred<void>();
  fake.getConnected = () => pendingRefresh.promise;
  fake.disconnectWallet = () => pendingDisconnect.promise;
  const refresh = session.refresh();
  const disconnect = session.disconnect();
  assert.equal(session.snapshot.accountId, null);
  assert.equal(currentPlan(session), null);
  pendingRefresh.resolve({ wallet: fake.wallet });
  await refresh;
  assert.equal(session.snapshot.accountId, null);
  assert.equal(currentPlan(session), null);
  pendingDisconnect.resolve();
  await disconnect;
  session.stop();
});

test("account switches invalidate old plans and pending refreshes", async () => {
  const fake = new FakeConnector();
  fake.availableWallets = [fake.wallet];
  fake.wallet.accounts = [{ accountId: "alice.testnet" }, { accountId: "bob.testnet" }];
  const session = makeSession(fake);
  await session.start();
  assert.equal(currentPlan(session)?.initializer.policy.roles[0].kind.Group[0], "alice.testnet");

  const pendingRefresh = deferred<{ wallet: FakeWallet }>();
  fake.getConnected = () => pendingRefresh.promise;
  const refresh = session.refresh();
  session.selectAccount("bob.testnet");
  assert.equal(currentPlan(session)?.initializer.policy.roles[0].kind.Group[0], "bob.testnet");
  const oldWallet = new FakeWallet();
  oldWallet.accounts = [{ accountId: "alice.testnet" }];
  pendingRefresh.resolve({ wallet: oldWallet });
  await refresh;
  assert.equal(session.snapshot.accountId, "bob.testnet");

  fake.emit("wallet:signOut", {});
  assert.equal(currentPlan(session), null);
  session.stop();
});

test("cleanup invalidates pending refresh and ignores later events", async () => {
  const fake = new FakeConnector();
  fake.availableWallets = [fake.wallet];
  fake.wallet.accounts = [{ accountId: "alice.testnet" }];
  const session = makeSession(fake);
  await session.start();
  const pendingRefresh = deferred<{ wallet: FakeWallet }>();
  fake.getConnected = () => pendingRefresh.promise;
  const refresh = session.refresh();
  session.stop();
  pendingRefresh.resolve({ wallet: fake.wallet });
  await refresh;
  fake.emit("wallet:signOut", {});
  assert.equal(session.snapshot.accountId, "alice.testnet");
  assert.equal(fake.listenerCount("wallet:signOut"), 0);
});
