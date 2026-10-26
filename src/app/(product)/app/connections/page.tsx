import type { Metadata } from "next";

import { ShellPage } from "@/components/shell/shell-page";

export const metadata: Metadata = { title: "Connections" };

export default function ConnectionsPage() {
  return (
    <ShellPage
      eyebrow="Setup"
      title="Connections"
      description="The Sales Agent can use your own ad results, a swipe file, public pages, and public ad libraries."
      emptyTitle="Nothing connected"
      emptyDetail="Own ad results wait for the official marketing APIs. Public library collection stays off until an Owner accepts the risk in writing."
      kind="unconfigured"
    />
  );
}
