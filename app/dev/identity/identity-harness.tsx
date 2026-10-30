"use client";

import { useState } from "react";
import { useTestnetWallet } from "../../use-testnet-wallet";
import type { IdentityChallenge } from "../../../src/identity/types";

async function post(action: string, body: object) {
  const response = await fetch(`/api/dev/identity/${action}`, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Server verification stopped: ${data.error}. Start with a new challenge.`);
  return data;
}

export function IdentityHarness() {
  const wallet = useTestnetWallet();
  const [challenge, setChallenge] = useState<IdentityChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Connect Meteor on Testnet, then prepare a challenge.");
  const [result, setResult] = useState<{ accountId: string; blockHeight: number; blockHash: string } | null>(null);
  const currentChallenge = challenge?.accountId === wallet.accountId ? challenge : null;

  async function prepare() {
    setBusy(true); setChallenge(null); setResult(null);
    try {
      const context = wallet.getContext();
      if (!context.accountId || context.network !== "testnet") throw new Error("Select a connected Testnet account first.");
      const data = await post("challenge", context);
      const latest = wallet.getContext();
      if (latest.accountId !== context.accountId || latest.network !== "testnet") throw new Error("Wallet account changed. Prepare a new challenge.");
      setChallenge(data.challenge);
      setStatus("Review the message below, then request and approve message signing in Meteor.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Challenge preparation failed."); }
    finally { setBusy(false); }
  }

  async function sign() {
    if (!currentChallenge) return;
    const pending = currentChallenge;
    setBusy(true); setChallenge(null); setResult(null);
    let stage = "wallet";
    try {
      if (wallet.getContext().accountId !== pending.accountId || wallet.getContext().network !== "testnet" || window.location.origin !== pending.origin || Date.now() >= pending.expiresAt) throw new Error("Challenge context changed.");
      setStatus("Waiting for your explicit Meteor message approval…");
      const proof = await wallet.signIdentity({
        message: pending.message, recipient: pending.recipient,
        nonce: Uint8Array.from(atob(pending.nonce), (char) => char.charCodeAt(0)),
        signerId: pending.accountId, network: "testnet",
      });
      stage = "context";
      if (wallet.getContext().accountId !== pending.accountId || wallet.getContext().network !== "testnet" || proof.accountId !== pending.accountId) throw new Error("Selected account changed. Start again.");
      stage = "server";
      setStatus("Checking the signed message and finalized Testnet key permission…");
      const verified = await post("verify", { challengeId: pending.id, accountId: pending.accountId, network: "testnet", proof: { accountId: proof.accountId, publicKey: proof.publicKey, signature: proof.signature } });
      if (wallet.getContext().accountId !== pending.accountId || wallet.getContext().network !== "testnet") throw new Error("Selected account changed. Start again.");
      setResult(verified); setStatus("Wallet ownership verified for this local check. No production session was created.");
    } catch (error) {
      // Wallet exceptions can contain signed data. Do not log or display them.
      setStatus(stage === "wallet" ? "Meteor message signing did not complete or was declined. Stop here and record any error shown in Meteor. No proof was submitted." : error instanceof Error ? error.message : "Verification failed. Start again.");
    } finally { setBusy(false); }
  }

  const button = "rounded border border-current px-4 py-2 disabled:opacity-40";
  return <main className="mx-auto max-w-3xl space-y-6 p-8">
    <h1 className="text-2xl font-semibold">Local wallet ownership check</h1>
    <p>Development only · Testnet · Milestone 07A. This check creates no production sign-in or participant application.</p>
    <p>Meteor will ask you to approve an off-chain message. This costs no gas, submits no transaction, and grants no permission to spend Project Funds. Never enter a private key.</p>
    <div className="flex flex-wrap gap-3">
      <button className={button} onClick={wallet.connect} disabled={!wallet.ready || !wallet.available || busy || wallet.busy}>Connect Meteor</button>
      <button className={button} onClick={wallet.disconnect} disabled={!wallet.accountId || busy || wallet.busy}>Disconnect</button>
    </div>
    <label className="block">Selected Testnet account <select className="ml-2 rounded border p-2" value={wallet.accountId ?? ""} disabled={busy || wallet.busy} onChange={(event) => { setChallenge(null); setResult(null); wallet.selectAccount(event.target.value); }}>
      {!wallet.accountId && <option value="">No connected account</option>}
      {wallet.accountIds.map((account) => <option key={account} value={account}>{account}</option>)}
    </select></label>
    {wallet.ready && !wallet.available && <p role="alert">Meteor Wallet is unavailable for Testnet connection.</p>}
    {wallet.error && <p role="alert">Wallet connection could not complete. Check Meteor.</p>}
    <button className={button} onClick={prepare} disabled={!wallet.accountId || busy || wallet.busy}>Prepare challenge</button>
    {currentChallenge && <section className="space-y-3">
      <h2>Message to approve</h2>
      <pre className="whitespace-pre-wrap break-words rounded border p-4">{currentChallenge.message}</pre>
      <p>Recipient: {currentChallenge.recipient}</p>
      <p>Expires: {new Date(currentChallenge.expiresAt).toLocaleTimeString()}. One attempt per challenge.</p>
      <button className={button} onClick={sign} disabled={busy || wallet.busy}>Request Meteor message approval</button>
    </section>}
    <p role="status" aria-live="polite">{status}</p>
    {result && result.accountId === wallet.accountId && <p>Verified account: {result.accountId}<br />Finalized Testnet block: {result.blockHeight}<br />Block hash: <span className="break-all">{result.blockHash}</span></p>}
    <a href="/" className="underline">Return to Open a Yawrd</a>
  </main>;
}
