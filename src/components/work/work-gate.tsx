"use client";

import type { ReactNode } from "react";

import type { ShellAgent } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";

/** The work tabs belong to the Growth Architect. Any other agent says so plainly. */
export function WorkGate({ agent, children }: { agent: ShellAgent | undefined; children: ReactNode }) {
  if (!agent || agent.slug !== "growth-architect" || agent.status !== "live") {
    return <EmptyState kind="unconfigured" title={`${agent?.name ?? "This agent"} has no work tabs yet.`} />;
  }
  return <>{children}</>;
}
