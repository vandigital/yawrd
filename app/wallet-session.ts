import type { Account, NearConnector, SignMessageParams } from "@hot-labs/near-connect";
import type { CreationTransaction } from "../src/creation-integration.ts";

const METEOR_WALLET_ID = "meteor-wallet";

export interface WalletState {
  accountIds: string[];
  accountId: string | null;
  ready: boolean;
  available: boolean;
  busy: boolean;
  error: string | null;
}

export const initialWalletState: WalletState = {
  accountIds: [], accountId: null, ready: false, available: false, busy: false, error: null,
};

export class TestnetWalletSession {
  private state: WalletState = initialWalletState;
  private active = true;
  private revision = 0;
  private disconnecting = false;
  private registrationDuringStart = false;
  private refreshAfterBusy = false;
  private meteorWallet: NearConnector["availableWallets"][number] | undefined;
  private connector: NearConnector;
  private onChange: (state: WalletState) => void;

  constructor(connector: NearConnector, onChange: (state: WalletState) => void) {
    this.connector = connector;
    this.onChange = onChange;
  }

  get snapshot(): WalletState { return this.state; }

  get network(): string { return this.connector.network; }

  async signIdentity(params: SignMessageParams & { signerId: string; network: "testnet" }) {
    const changed = () => !this.active || this.connector.network !== "testnet" || this.state.accountId !== params.signerId;
    if (changed() || this.state.busy || !this.state.ready || params.network !== "testnet") throw new Error("Wallet account or network changed. Start again.");
    const revision = this.revision;
    this.update({ busy: true });
    try {
      const { wallet } = await this.connector.getConnectedWallet();
      const accounts = await wallet.getAccounts({ network: "testnet" });
      if (changed() || revision !== this.revision || wallet !== this.meteorWallet || !this.meteorIsAvailable() || !accounts.some((account) => account.accountId === params.signerId)) throw new Error("Wallet account or network changed. Start again.");
      if (typeof wallet.signMessage !== "function") throw new Error("Meteor does not support NEP-413 message signing.");
      const proof = await wallet.signMessage(params);
      const currentAccounts = await wallet.getAccounts({ network: "testnet" });
      if (changed() || revision !== this.revision || wallet !== this.meteorWallet || !this.meteorIsAvailable() || proof?.accountId !== params.signerId || !currentAccounts.some((account) => account.accountId === params.signerId)) throw new Error("Wallet account or network changed. Start again.");
      return proof;
    } finally {
      this.update({ busy: false });
      if (this.refreshAfterBusy) { this.refreshAfterBusy = false; void this.refresh(); }
    }
  }

  async signCreation(transaction: CreationTransaction) {
    if (!this.active || this.state.busy || !this.state.ready || this.connector.network !== "testnet" || transaction.network !== "testnet" || this.state.accountId !== transaction.signerId) {
      throw new Error("Wallet account or network changed. Review again.");
    }
    const revision = this.revision;
    const { wallet } = await this.connector.getConnectedWallet();
    const accounts = await wallet.getAccounts({ network: "testnet" });
    if (!this.active || revision !== this.revision || this.connector.network !== "testnet" || this.state.accountId !== transaction.signerId || wallet !== this.meteorWallet || !this.meteorIsAvailable() || !accounts.some((account) => account.accountId === transaction.signerId)) {
      throw new Error("Wallet account or network changed. Review again.");
    }
    return wallet.signAndSendTransaction(transaction);
  }

  private update(change: Partial<WalletState>) {
    if (!this.active) return;
    this.state = { ...this.state, ...change };
    this.onChange(this.state);
  }

  private meteorIsAvailable() {
    return this.connector.availableWallets.some((wallet) => wallet.manifest.id === METEOR_WALLET_ID);
  }

  private useAccounts(accounts: Account[], preferred?: string) {
    const accountIds = [...new Set(accounts.map((account) => account.accountId).filter(Boolean))];
    const current = this.state.accountId;
    const accountId = preferred && accountIds.includes(preferred)
      ? preferred : current && accountIds.includes(current) ? current : accountIds[0] ?? null;
    this.update({ accountIds, accountId });
  }

  private walletsChanged = () => {
    const meteorWallet = this.connector.availableWallets.find((wallet) => wallet.manifest.id === METEOR_WALLET_ID);
    const walletReplaced = meteorWallet !== this.meteorWallet;
    this.meteorWallet = meteorWallet;
    this.revision++;
    this.update({ available: Boolean(meteorWallet) });
    if ((!meteorWallet || walletReplaced) && this.state.accountId) this.useAccounts([]);
    if (this.disconnecting) return;
    if (this.state.busy) this.refreshAfterBusy = true;
    else if (this.state.ready) void this.refresh();
    else this.registrationDuringStart = true;
  };

  private signedIn = (event: { wallet: { manifest: { id: string } }; accounts: Account[] }) => {
    if (this.disconnecting) return;
    if (event.wallet.manifest.id === METEOR_WALLET_ID && event.wallet !== this.meteorWallet) return;
    this.revision++;
    this.useAccounts(event.wallet.manifest.id === METEOR_WALLET_ID && this.meteorIsAvailable()
      ? event.accounts : [], event.accounts[0]?.accountId);
  };

  private signedOut = () => {
    this.revision++;
    this.useAccounts([]);
  };

  async start() {
    try {
      await this.connector.whenManifestLoaded;
      if (!this.active) return;
      this.connector.on("selector:walletsChanged", this.walletsChanged);
      this.connector.on("wallet:signIn", this.signedIn);
      this.connector.on("wallet:signOut", this.signedOut);
      this.walletsChanged();
      do {
        this.registrationDuringStart = false;
        await this.refresh();
      } while (this.active && this.registrationDuringStart);
      this.update({ ready: true });
    } catch {
      this.update({ error: "Wallet connection could not be prepared.", ready: true });
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.revision++;
    this.connector.off("selector:walletsChanged", this.walletsChanged);
    this.connector.off("wallet:signIn", this.signedIn);
    this.connector.off("wallet:signOut", this.signedOut);
  }

  refresh = async () => {
    if (!this.active || this.state.busy) return;
    const revision = ++this.revision;
    try {
      const { wallet } = await this.connector.getConnectedWallet();
      if (wallet.manifest.id !== METEOR_WALLET_ID || !this.meteorIsAvailable()) {
        if (this.active && revision === this.revision) this.useAccounts([]);
        return;
      }
      const accounts = await wallet.getAccounts({ network: "testnet" });
      if (this.active && revision === this.revision) this.useAccounts(accounts);
    } catch {
      if (this.active && revision === this.revision) this.useAccounts([]);
    }
  };

  async connect() {
    if (!this.active || this.state.busy || !this.state.available) return;
    this.revision++;
    this.update({ busy: true, error: null });
    try {
      if (!this.meteorIsAvailable()) throw new Error("Meteor Wallet is unavailable for Testnet connection.");
      // No message signature, access key, or transaction is requested.
      await this.connector.connect({ walletId: METEOR_WALLET_ID });
    } catch (cause) {
      this.update({ error: cause instanceof Error ? cause.message : "Wallet connection failed." });
    } finally {
      this.update({ busy: false });
      if (this.refreshAfterBusy) {
        this.refreshAfterBusy = false;
        void this.refresh();
      }
    }
  }

  async disconnect() {
    if (!this.active || this.state.busy) return;
    this.revision++;
    this.disconnecting = true;
    this.update({ busy: true, error: null, accountIds: [], accountId: null });
    try {
      await this.connector.disconnect();
    } catch {
      this.update({ error: "Wallet disconnect could not be completed. Check Meteor Wallet before reconnecting." });
    } finally {
      this.disconnecting = false;
      this.update({ busy: false });
    }
  }

  selectAccount(nextAccountId: string) {
    if (!this.active || this.state.busy || !this.state.accountIds.includes(nextAccountId)) return;
    this.revision++;
    this.update({ accountId: nextAccountId });
  }
}
