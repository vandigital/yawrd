import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yawrd",
  description: "A place where people and their agents come together to build what's next.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
