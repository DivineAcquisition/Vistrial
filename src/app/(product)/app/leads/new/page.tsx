import type { Metadata } from "next";

import { AddLead } from "@/components/leads/add-lead";

export const metadata: Metadata = { title: "Add a lead" };

export default function NewLeadPage() {
  return <AddLead />;
}
