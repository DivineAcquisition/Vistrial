"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { OffersTab } from "@/components/work/offers-tab";
import { WorkGate } from "@/components/work/work-gate";

function Offers() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <OffersTab workspaceId={shell.workspaceId} base={`/app/agents/${params.slug}`} editor={shell.role !== "rep" && agent?.state !== "off"} ask={query.get("ask") ?? undefined} />
    </WorkGate>
  );
}

/** The Offers workspace: Offer Intelligence. */
export default function OffersPage() {
  return (
    <Suspense>
      <Offers />
    </Suspense>
  );
}
