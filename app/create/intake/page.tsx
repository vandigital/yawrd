import type { Metadata } from "next";
import CreationWelcome from "../creation-welcome";

export const metadata: Metadata = {
  title: "Prepare to open a Yawrd",
  description: "A private, no-inference preparation flow for a new Yawrd.",
};

export default function IntakePage() {
  return <CreationWelcome initialIntake />;
}
