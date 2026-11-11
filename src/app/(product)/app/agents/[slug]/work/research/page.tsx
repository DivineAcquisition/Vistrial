"use client";

import { canWork } from "@/lib/roles";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { ResearchTab } from "@/components/work/research-tab";
import { WorkGate } from "@/components/work/work-gate";
import { oldChatLink } from "@/lib/shell/old-links";

function Research() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const router = useRouter();
  const shell = useWorkspaceShell();
  // Old links carried a conversation or a question to this tab's chat box. The chat lives in Chat now.
  const moved = oldChatLink(`/app/agents/${params.slug}`, "market-intelligence", query);
  useEffect(() => {
    if (moved) router.replace(moved);
  }, [moved, router]);
  if (!shell || moved) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <ResearchTab workspaceId={shell.workspaceId} base={`/app/agents/${params.slug}`} slug={params.slug} editor={canWork(shell.role) && agent?.state !== "off"} />
    </WorkGate>
  );
}

/** The Research workspace: Market Intelligence's reports library. */
export default function ResearchPage() {
  return (
    <Suspense>
      <Research />
    </Suspense>
  );
}
