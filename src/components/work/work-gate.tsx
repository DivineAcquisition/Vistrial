"use client";

import type { ReactNode } from "react";

import { hasWorkTabs } from "../../../convex/lib/agentSurfaces";
import type { ShellAgent } from "@/components/shell/shell-context";
import { DEALMAKER } from "@/lib/shell/journey";
import { EmptyState } from "@/components/ui/empty-state";

/** Only a live agent with work tabs (convex/lib/agentSurfaces.ts) has them. Any other agent says so plainly. */
export function WorkGate({ agent, children }: { agent: ShellAgent | undefined; children: ReactNode }) {
  // Dealmaker's tabs are its own (lib/shell/journey.ts DEALMAKER_TABS); like every agent's, only once it is live.
  if (!agent || !(hasWorkTabs(agent.slug) || agent.slug === DEALMAKER) || agent.status !== "live") {
    return <EmptyState kind="unconfigured" title={`${agent?.name ?? "This agent"} has no work tabs yet.`} />;
  }
  return <>{children}</>;
}
