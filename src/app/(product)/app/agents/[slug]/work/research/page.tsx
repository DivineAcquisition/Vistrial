"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { ResearchTab } from "@/components/work/research-tab";
import { WorkGate } from "@/components/work/work-gate";
import type { Id } from "../../../../../../../../convex/_generated/dataModel";

function Research() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <ResearchTab
        workspaceId={shell.workspaceId}
        base={`/app/agents/${params.slug}`}
        slug={params.slug}
        agentName={agent?.name ?? "Growth Architect"}
        editor={shell.role !== "rep" && agent?.state !== "off"}
        intakeId={query.get("intake") as Id<"intakes"> | null}
        ask={query.get("ask") ?? query.get("objective") ?? undefined}
      />
    </WorkGate>
  );
}

/** The Research workspace: Market Intelligence. */
export default function ResearchPage() {
  return (
    <Suspense>
      <Research />
    </Suspense>
  );
}
