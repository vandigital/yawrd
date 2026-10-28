import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open a Yawrd · Testnet",
  description: "Shape a new Yawrd and review its project rules and Testnet setup.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
