import type { Metadata } from "next";
import CreationBuilder from "./creation-builder";

export const metadata: Metadata = {
  title: "Open a Yawrd · Testnet",
  description: "Shape a new Yawrd and review its project rules and Testnet setup.",
};

export default function CreatePage() {
  return <CreationBuilder />;
}
