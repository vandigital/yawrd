"use client";

import { createContext, createElement, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

function useWalletOwner() {
  const [state, setState] = useState(initialWalletState);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const consent = useRef(false);
  const acceptTerms = useCallback((accepted: boolean) => { consent.current = accepted; setTermsAccepted(accepted); }, []);
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

  const connect = useCallback(() => { if (consent.current) void sessionRef.current?.connect(); }, []);
  const disconnect = useCallback(() => { acceptTerms(false); void sessionRef.current?.disconnect(); }, [acceptTerms]);
  const selectAccount = useCallback((accountId: string) => { acceptTerms(false); sessionRef.current?.selectAccount(accountId); }, [acceptTerms]);
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

  return { ...state, termsAccepted, acceptTerms, connect, disconnect, selectAccount, getContext, signCreation, signIdentity, signPayout };
}

// The persistent root owns wallet listeners; route consumers share its snapshot.
const WalletContext = createContext<ReturnType<typeof useWalletOwner> | null>(null);

export function TestnetWalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletOwner();
  return createElement(WalletContext.Provider, { value: wallet }, children);
}

export function useTestnetWallet() {
  const wallet = useContext(WalletContext);
  if (!wallet) throw new Error("Wallet controls require TestnetWalletProvider.");
  return wallet;
}
