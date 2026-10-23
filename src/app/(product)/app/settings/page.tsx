import type { Metadata } from "next";

import { ShellPage } from "@/components/shell/shell-page";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <ShellPage
      eyebrow="Owner"
      title="Settings"
      description="Billing, connections, trust, and which agents are on. Managers cannot change these."
      emptyTitle="Settings are quiet"
      emptyDetail="Trust starts as a suggestion. Nothing here can be published until an owner is signed in."
    />
  );
}
