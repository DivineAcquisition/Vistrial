"use client";

import { canWork } from "@/lib/roles";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { CreativeTab } from "@/components/work/creative-tab";
import { WorkGate } from "@/components/work/work-gate";

function Creative() {
  const params = useParams<{ slug: string }>();
  const query = useSearchParams();
  const shell = useWorkspaceShell();
  if (!shell) return null;
  const agent = shell.agents.find((row) => row.slug === params.slug);
  return (
    <WorkGate agent={agent}>
      <CreativeTab workspaceId={shell.workspaceId} base={`/app/agents/${params.slug}`} editor={canWork(shell.role) && agent?.state !== "off"} source={query.get("source")} />
    </WorkGate>
  );
}

/** The Creative workspace: Creative Production. `?source=` is the reference picked on a research board. */
export default function CreativePage() {
  return (
    <Suspense>
      <Creative />
    </Suspense>
  );
}
