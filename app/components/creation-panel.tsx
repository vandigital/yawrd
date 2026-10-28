"use client";

import { useEffect, useRef, useState } from "react";
import type { CreationInput } from "../../src/create-yawrd";
import { CreationFlow, CreationRpc, createTestnetRpc, hardeningBoundary, type CreationState, type CreationTransaction } from "../../src/creation-integration";
import { testnetFactorySettings } from "../../src/testnet-factory-settings";

function nearAmount(yocto: string) {
  const digits = yocto.padStart(25, "0");
  const fraction = digits.slice(-24).replace(/0+$/, "");
  return `${digits.slice(0, -24)}${fraction ? `.${fraction}` : ""}`;
}

export function CreationPanel({ input, visible, getWallet, sign }: {
  input: CreationInput; visible: boolean;
  getWallet: () => { accountId: string | null; network: string };
  sign: (tx: CreationTransaction) => Promise<unknown>;
}) {
  const flow = useRef<CreationFlow | null>(null);
  const [state, setState] = useState<CreationState>({ phase: "idle", message: "Review your Yawrd before opening it." });
  const [hash, setHash] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    let active = true;
    try {
      const controller = new CreationFlow(window.localStorage, new CreationRpc(createTestnetRpc()), (next) => { if (active) setState(next); });
      flow.current = controller;
      setState(controller.state);
      const callbackHash = new URLSearchParams(window.location.search).get("transactionHashes");
      if (controller.state.prepared && ["unknown", "pending"].includes(controller.state.phase)) {
        const candidate = callbackHash && !callbackHash.includes(",") ? callbackHash : controller.state.hash;
        if (candidate) { setHash(candidate); void controller.reconcile(candidate); }
      }
    } catch { setLocalError("Browser storage is unavailable. Creation is disabled so pending requests cannot be lost."); }
    return () => { active = false; flow.current = null; };
  }, []);
  const locked = ["checking", "awaiting-wallet", "pending", "unknown", "confirmed"].includes(state.phase);
  if (!visible && !["awaiting-wallet", "pending", "unknown", "confirmed"].includes(state.phase)) return null;
  const p = state.prepared;
  const current = p && JSON.stringify(p.input) === JSON.stringify(input);
  const button = "rounded-xl border border-[#64938a] px-5 py-3 text-sm font-medium text-[#d6eee8] hover:bg-[#25413a] disabled:cursor-not-allowed disabled:opacity-40";
  async function submit() {
    setLocalError("");
    if (!navigator.locks) { setLocalError("This browser cannot coordinate wallet requests across tabs. Use a browser with Web Locks support."); return; }
    await navigator.locks.request("yawrd-testnet-creation", { ifAvailable: true }, async (lock) => {
      if (!lock) { setLocalError("Another tab is handling a creation request. Reconcile that request first."); return; }
      await flow.current?.submit(input, getWallet, sign);
    });
  }
  return <section aria-label="Open on Testnet" className="mx-auto mt-6 max-w-[880px] space-y-5 rounded-[24px] border border-[#5b918c]/40 bg-[#14221f] p-6 sm:p-8">
    <h2 className="text-xl font-medium text-white">Open on Testnet</h2>
    <p className="text-sm leading-6 text-[#bed1c9]">Opening requires wallet approval, a setup deposit and network fees. The setup deposit goes to your new project account for setup and storage; it is separate from additional Project Funds.</p>
    {!testnetFactorySettings && <p role="status" className="text-sm text-[#f1d4c8]">Testnet opening is unavailable until a compatible factory, reviewed code and setup costs are configured. The address above is an illustrative preview.</p>}
    <p role="status" aria-live="polite" className="text-sm text-[#d6eee8]">{state.message}</p>
    {localError && <p role="alert" className="field-error">{localError}</p>}
    {p && <dl className="space-y-2 break-all text-sm text-[#bed1c9]">
      <div><dt className="review-label">Project account{state.phase === "confirmed" ? " · verified" : " · intended"}</dt><dd className="font-mono">{p.plan.daoAccountId}</dd></div>
      <div><dt className="review-label">Testnet setup service</dt><dd className="font-mono">{p.transaction.receiverId} · create</dd></div>
      <div><dt className="review-label">Wallet account</dt><dd>{p.transaction.signerId}</dd></div>
      <div><dt className="review-label">Setup deposit</dt><dd>{nearAmount(p.settings.setupDepositYocto)} Testnet NEAR</dd></div>
      <div><dt className="review-label">Gas limit (network fees charged separately)</dt><dd>{Number(p.settings.createGas) / 1e12} Tgas</dd></div>
      <div><dt className="review-label">Cost confirmation</dt><dd>{p.settings.costConfirmation}</dd></div>
      <div><dt className="review-label">Project Rules</dt><dd>Both Stewards must approve: {p.plan.initializer.policy.roles[0].kind.Group.join(" and ")}</dd></div>
    </dl>}
    {p && <details className="text-xs text-[#abc8bf]"><summary className="cursor-pointer">Technical transaction details</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify({ transaction: p.transaction, configuration: p.plan.initializer }, null, 2)}</pre></details>}
    {state.hash && <a className="block break-all text-sm text-[#c2dedd] underline" href={`https://testnet.nearblocks.io/txns/${encodeURIComponent(state.hash)}`} target="_blank" rel="noreferrer">Transaction: {state.hash}</a>}
    {state.phase === "confirmed" && p && <div className="space-y-3 text-sm leading-6 text-[#f1d4c8]">
      <p className="font-semibold">Hardening Required</p>
      <p>Automatic factory updates: {state.autoUpdate === true ? "enabled — joint opt-out required" : "disabled on-chain — further hardening verification required"}. Additional Project Funds remain disabled. Funds held by this project are not escrowed or guaranteed protected.</p>
      <p>Next: both Stewards approve turning off automatic updates, then verify the resulting rules, project code and account access before enabling funding.</p>
      <details><summary className="cursor-pointer">Next governance integration</summary><pre className="overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(hardeningBoundary(p), null, 2)}</pre></details>
    </div>}
    {!locked && <button type="button" className={button} disabled={!testnetFactorySettings || Boolean(localError) || !flow.current} onClick={() => { setAcknowledged(false); void flow.current?.review(input, testnetFactorySettings, getWallet()); }}>Check Testnet setup</button>}
    {state.phase === "ready" && <div className="space-y-4">
      {!current && <p role="alert" className="field-error">Your details changed. Check Testnet setup again before wallet approval.</p>}
      <label className="flex items-start gap-3 text-sm leading-6 text-[#bed1c9]"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1" />I reviewed the account, Project Rules and setup costs. Opening requires wallet approval. Hardening must finish before additional Project Funds.</label>
      <button type="button" className={button} disabled={!current || !acknowledged || Boolean(localError)} onClick={() => { void submit(); }}>Open a Yawrd · approve in wallet</button>
    </div>}
    {["pending", "unknown", "failed"].includes(state.phase) && p && <div className="space-y-3">
      <label className="field-label" htmlFor="creation-hash">Reconcile a transaction from your wallet history</label>
      <input id="creation-hash" value={hash || state.hash || ""} onChange={(event) => setHash(event.target.value)} placeholder="Transaction hash" className="w-full rounded-xl border border-[#39514b] bg-[#16231f] p-3 font-mono text-sm" />
      <button type="button" className={button} onClick={() => { void flow.current?.reconcile(hash || state.hash); }}>Check outcome · no wallet approval</button>
      <p className="text-xs leading-5 text-[#abc8bf]">An unresolved outcome blocks another opening request. A wallet approval or transaction reference alone does not confirm creation.</p>
    </div>}
  </section>;
}
