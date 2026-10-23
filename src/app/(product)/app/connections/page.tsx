import type { Metadata } from "next";

import { ShellPage } from "@/components/shell/shell-page";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return (
    <ShellPage
      eyebrow="Setup"
      title="Connections"
      description="Email and calendar first, then the CRM. Each one is finished before the next starts."
      emptyTitle="Nothing connected"
      emptyDetail="Nylas is first. GoHighLevel is second. Neither is available in this step."
      kind="unconfigured"
    />
  );
}
