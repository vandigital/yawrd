"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTestnetWallet } from "../use-testnet-wallet";
import { AccountSlot } from "./route-account-controls";
import styles from "./global-navigation.module.css";

function WalletControls() {
  const wallet = useTestnetWallet();
  return <div className={styles.fallback}>
    <p>{wallet.accountId ? "Connected wallet · Meteor" : "Wallet connection"}</p>
    {wallet.accountId && <p className={styles.identity}>{wallet.accountId}</p>}
    {wallet.accountIds.length > 1 && <label>Selected Testnet account
      <select value={wallet.accountId ?? ""} disabled={wallet.busy} onChange={event => wallet.selectAccount(event.target.value)}>
        {wallet.accountIds.map(id => <option key={id}>{id}</option>)}
      </select>
    </label>}
    <button type="button" disabled={wallet.busy || !wallet.ready || (!wallet.accountId && !wallet.available)} onClick={wallet.accountId ? wallet.disconnect : wallet.connect}>
      {!wallet.ready ? "Preparing wallet…" : wallet.busy ? "Please wait…" : wallet.accountId ? "Disconnect wallet" : "Connect wallet"}
    </button>
    <p>Connecting a wallet does not sign you in. Verified account status is available inside a Yawrd.</p>
    {wallet.ready && !wallet.available && <p>Meteor is unavailable for Testnet connection.</p>}
    {wallet.error && <p role="alert">{wallet.error}</p>}
  </div>;
}

export function NavigationShell({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [occupied, setOccupied] = useState(false);
  const header = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    header.current?.querySelectorAll("details").forEach(details => { details.open = false; });
  }, [pathname]);

  useEffect(() => {
    function dismiss(event: PointerEvent | KeyboardEvent) {
      const root = header.current;
      if (!root) return;
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      root.querySelectorAll("details[open]").forEach(details => {
        if (event instanceof KeyboardEvent || !details.contains(event.target as Node)) {
          details.removeAttribute("open");
          if (event instanceof KeyboardEvent) details.querySelector("summary")?.focus();
        }
      });
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, []);

  function links() {
    return <><Link href="/#discover">Discover Yawrds</Link><Link href="/docs" aria-current={pathname === "/docs" ? "page" : undefined}>Docs</Link></>;
  }

  return <AccountSlot.Provider value={{ target: slot, setOccupied }}>
    <header ref={header} className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" aria-label="Yawrd home" className={styles.brand}>
          {/* Reuse the landing page's Bob asset and proportions. */}
          <img src="/brand/yawrd-buoy.webp" width="159" height="192" alt="" />
          <span>yawrd<span className={styles.dot}>.</span></span>
        </Link>
        <nav aria-label="Global navigation" className={styles.desktopNav}>{links()}</nav>
        <span className={styles.testnet}>Testnet</span>
        <details className={styles.mobileNav} name="global-disclosure">
          <summary aria-label="Menu">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </summary>
          <nav aria-label="Mobile navigation" className={styles.panel} onClick={() => { header.current?.querySelectorAll("details").forEach(details => { details.open = false; }); }}>{links()}</nav>
        </details>
        <details id="global-account" className={styles.account} name="global-disclosure">
          <summary>Account</summary>
          <div ref={setSlot} className={styles.panel}>
            {!occupied && <WalletControls />}
          </div>
        </details>
      </div>
    </header>
    {children}
  </AccountSlot.Provider>;
}
