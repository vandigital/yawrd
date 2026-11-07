"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NearConnector, SignMessageParams } from "@hot-labs/near-connect";
import { initialWalletState, TestnetWalletSession } from "./wallet-session";
import type { CreationTransaction } from "../src/creation-integration";
import type { PayoutTransaction } from '../src/rewards/payout';

let connectorPromise: Promise<NearConnector> | undefined;

function getConnector(): Promise<NearConnector> {
  // Import and construct the connector only after a browser effect.
  connectorPromise ??= import("@hot-labs/near-connect").then(({ NearConnector }) => new NearConnector({
    network: "testnet",
    autoConnect: false,
    features: {
      testnet: true,
      signInWithoutAddKey: true,
      signAndSendTransaction: true,
    },
  }));
  return connectorPromise;
}

export function useTestnetWallet() {
  const [state, setState] = useState(initialWalletState);
  const sessionRef = useRef<TestnetWalletSession | null>(null);

  useEffect(() => {
    let active = true;
    let session: TestnetWalletSession | undefined;
    void getConnector().then((connector) => {
      if (!active) return;
      session = new TestnetWalletSession(connector, setState);
      sessionRef.current = session;
      window.addEventListener("focus", session.refresh);
      void session.start();
    }).catch(() => {
      if (active) setState((current) => ({ ...current, ready: true, error: "Wallet connection could not be prepared." }));
    });

    return () => {
      active = false;
      if (session) {
        window.removeEventListener("focus", session.refresh);
        session.stop();
      }
      sessionRef.current = null;
    };
  }, []);

  const connect = useCallback(() => { void sessionRef.current?.connect(); }, []);
  const disconnect = useCallback(() => { void sessionRef.current?.disconnect(); }, []);
  const selectAccount = useCallback((accountId: string) => { sessionRef.current?.selectAccount(accountId); }, []);
  const getContext = useCallback(() => ({ accountId: sessionRef.current?.snapshot.accountId ?? null, network: sessionRef.current?.network ?? "unknown" }), []);
  const signCreation = useCallback((tx: CreationTransaction) => {
    if (!sessionRef.current) return Promise.reject(new Error("Connect Meteor Wallet first."));
    return sessionRef.current.signCreation(tx);
  }, []);

  const signIdentity = useCallback((params: SignMessageParams & { signerId: string; network: "testnet" }) => {
    if (!sessionRef.current) return Promise.reject(new Error("Connect Meteor Wallet first."));
    return sessionRef.current.signIdentity(params);
  }, []);
  const signPayout = useCallback((tx: PayoutTransaction) => {
    if (!sessionRef.current) return Promise.reject(new Error('Connect Meteor Wallet first.'));
    return sessionRef.current.signPayout(tx);
  }, []);

  return { ...state, connect, disconnect, selectAccount, getContext, signCreation, signIdentity, signPayout };
}
