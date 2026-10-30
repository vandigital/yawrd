import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { developmentIdentityOrigin } from "../../../src/identity/development";
import { IdentityHarness } from "./identity-harness";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yawrd local wallet verification", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function IdentityDevelopmentPage() {
  const origin = developmentIdentityOrigin();
  if (!origin || (await headers()).get("host") !== new URL(origin).host) notFound();
  return <IdentityHarness />;
}
