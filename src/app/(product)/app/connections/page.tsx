import type { Metadata } from "next";

import { ShellPage } from "@/components/shell/shell-page";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return (
    <ShellPage
      eyebrow="Setup"
      title="Connections"
      description="Growth Architect can use your own results, public web pages, official platform APIs, and links you paste in. It never logs in to a platform for you."
      emptyTitle="Nothing connected"
      emptyDetail="Own ad results wait for the official marketing APIs. Public library collection stays off until an Owner accepts the risk in writing."
      kind="unconfigured"
    />
  );
}
