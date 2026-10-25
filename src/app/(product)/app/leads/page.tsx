import type { Metadata } from "next";

import { LeadList } from "@/components/leads/lead-list";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return <LeadList />;
}
