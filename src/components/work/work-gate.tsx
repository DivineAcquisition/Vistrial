"use client";

import type { ReactNode } from "react";

import { hasWorkTabs } from "../../../convex/lib/agentSurfaces";
import type { ShellAgent } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";

/** Only a live agent with work tabs (convex/lib/agentSurfaces.ts) has them. Any other agent says so plainly. */
export function WorkGate({ agent, children }: { agent: ShellAgent | undefined; children: ReactNode }) {
  if (!agent || !hasWorkTabs(agent.slug) || agent.status !== "live") {
    return <EmptyState kind="unconfigured" title={`${agent?.name ?? "This agent"} has no work tabs yet.`} />;
  }
  return <>{children}</>;
}
