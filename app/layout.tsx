import type { Metadata } from "next";
import "./globals.css";
import { TestnetWalletProvider } from "./use-testnet-wallet";
import { NavigationShell } from "./components/global-navigation";

export const metadata: Metadata = {
  title: "Yawrd",
  description: "A place where people and their agents come together to build what's next.",
  icons: {
    icon: { url: "/brand/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><TestnetWalletProvider><NavigationShell>{children}</NavigationShell></TestnetWalletProvider></body>
    </html>
  );
}
