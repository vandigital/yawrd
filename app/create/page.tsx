import type { Metadata } from "next";
import CreationWelcome from "./creation-welcome";

export const metadata: Metadata = {
  title: "Open a Yawrd · Testnet",
  description: "Shape a new Yawrd and review its project rules and Testnet setup.",
};

export default function CreatePage() {
  return <CreationWelcome />;
}
