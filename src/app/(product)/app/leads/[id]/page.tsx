import type { Metadata } from "next";

import { LeadRecord } from "@/components/leads/lead-record";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadRecord leadId={id} />;
}
