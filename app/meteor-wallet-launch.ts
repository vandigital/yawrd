export type WalletLaunchStage = "founder-click" | "connector-call" | "meteor-window-requested" | "meteor-window-opened" | "popup-blocked" | "wallet-request-resolved" | "wallet-request-rejected" | "unexpected-popup-route" | "meteor-navigation-not-requested" | "meteor-response-pending";

export interface WalletLaunchEvent {
  stage: WalletLaunchStage;
  activation: boolean | null;
}

const METEOR_WALLET_ORIGIN = "https://wallet.meteorwallet.app";
const POPUP_FEATURES = "popup=yes,width=430,height=720,resizable=yes,scrollbars=yes";

function activation(): boolean | null {
  return navigator.userActivation?.isActive ?? null;
}

function isMeteorAuthorizationUrl(value: string | URL | undefined): value is string | URL {
  if (!value) return false;
  try {
    const url = new URL(String(value));
    const path = url.pathname.split("/").filter(Boolean);
    return url.origin === METEOR_WALLET_ORIGIN
      && path.length === 3 && path[0] === "connect" && path[1] === "testnet"
      // Meteor maps near::sign_transactions to EExternalActionType.sign.
      && path[2] === "sign" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Reserves the wallet window in the founder's click task. near-connect loads a
 * sandboxed executor before proxying Meteor's window.open through postMessage,
 * which is too late for strict popup blockers. Only Meteor's exact HTTPS
 * authorization route may claim this one-shot window.
 */
export function reserveMeteorAuthorizationWindow(onEvent: (event: WalletLaunchEvent) => void) {
  const originalOpen = window.open;
  const clickActivation = activation();
  onEvent({ stage: "founder-click", activation: clickActivation });
  const popup = originalOpen.call(window, "about:blank", "_blank", POPUP_FEATURES);
  if (!popup) {
    onEvent({ stage: "popup-blocked", activation: clickActivation });
    return null;
  }

  try {
    popup.document.title = "Meteor authorization";
    popup.document.body.textContent = "Preparing Meteor authorization…";
  } catch {
    // The reserved window is still usable if its placeholder cannot be styled.
  }

  let claimed = false;
  let released = false;
  // Observation only: never cancels, retries or retires a wallet request.
  const diagnosticTimer = setTimeout(() => {
    onEvent({ stage: claimed ? "meteor-response-pending" : "meteor-navigation-not-requested", activation: activation() });
  }, 30_000);
  const proxyOpen: typeof window.open = (url, target, features) => {
    if (!claimed && isMeteorAuthorizationUrl(url)) {
      claimed = true;
      onEvent({ stage: "meteor-window-requested", activation: activation() });
      popup.location.replace(String(url));
      onEvent({ stage: "meteor-window-opened", activation: activation() });
      return popup;
    }
    if (!claimed) onEvent({ stage: "unexpected-popup-route", activation: activation() });
    return originalOpen.call(window, url, target, features);
  };
  window.open = proxyOpen;

  return {
    connectorCall() { onEvent({ stage: "connector-call", activation: activation() }); },
    release() {
      if (released) return;
      released = true;
      clearTimeout(diagnosticTimer);
      if (window.open === proxyOpen) window.open = originalOpen;
      if (!claimed && !popup.closed) popup.close();
    },
  };
}
