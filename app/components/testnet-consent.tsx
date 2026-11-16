"use client";

import { useTestnetWallet } from "../use-testnet-wallet";

// Shared, in-memory UI consent. This is not an auditable legal consent record.
export function TestnetConsent({ disabled = false }: { disabled?: boolean }) {
  const { termsAccepted, acceptTerms } = useTestnetWallet();
  return <div className="my-4 text-left text-sm leading-6 text-[#bed1c9]">
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={termsAccepted} disabled={disabled}
        onChange={event => acceptTerms(event.target.checked)}
        className="mt-1 size-5 shrink-0 accent-[#a9f1e9] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#a6f7ec]" />
      <span>I have read and agree to the Yawrd Testnet Terms of Service.</span>
    </label>
    <a href="/docs/testnet-terms" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-[#a9f1e9] underline underline-offset-4">Read Testnet Terms of Service (opens a new tab)</a>
    <p className="text-xs">Provisional terms for experimental Testnet software.</p>
  </div>;
}
