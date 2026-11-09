"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./global-navigation.module.css";

export const AccountSlot = createContext<{ target: HTMLElement | null; setOccupied: (occupied: boolean) => void } | null>(null);

// Presentation only: project challenges, verification and logout stay route-owned.
export function RouteAccountControls({ children }: { children: ReactNode }) {
  const slot = useContext(AccountSlot);
  const setOccupied = slot?.setOccupied;
  useEffect(() => {
    setOccupied?.(true);
    return () => setOccupied?.(false);
  }, [setOccupied]);
  if (!slot) return <>{children}</>;
  return slot.target ? createPortal(<div className={styles.routeAccount}>{children}</div>, slot.target) : null;
}

export function openAccountDisclosure() {
  const details = document.getElementById("global-account");
  if (details instanceof HTMLDetailsElement) details.open = true;
}
