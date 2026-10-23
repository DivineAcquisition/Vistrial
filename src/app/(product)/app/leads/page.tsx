import type { Metadata } from "next";

import { ShellPage } from "@/components/shell/shell-page";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return (
    <ShellPage
      eyebrow="Organization"
      title="Leads"
      description="Every lead in this workspace. A rep sees only the ones assigned to them."
      emptyTitle="No leads yet"
      emptyDetail="Leads arrive with the first connection. The list is empty until then."
      kind="unconfigured"
    />
  );
}
