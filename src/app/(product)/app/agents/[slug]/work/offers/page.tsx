"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { OffersTab } from "@/components/work/offers-tab";
import { WorkGate } from "@/components/work/work-gate";
import { oldChatLink } from "@/lib/shell/old-links";

function Offers() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const router = useRouter();
  const shell = useWorkspaceShell();
  // Old links filled this tab's chat box with `?ask=`. The chat lives in Chat now.
  const moved = oldChatLink(`/app/agents/${params.slug}`, "offer-intelligence", query);
  useEffect(() => {
    if (moved) router.replace(moved);
  }, [moved, router]);
  if (!shell || moved) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <OffersTab workspaceId={shell.workspaceId} base={`/app/agents/${params.slug}`} editor={shell.role !== "rep" && agent?.state !== "off"} analysisId={query.get("analysis")} />
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
