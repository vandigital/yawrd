import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open a Yawrd · Local Preview",
  description: "Shape a new Yawrd and preview its project rules locally.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
