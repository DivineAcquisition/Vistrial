"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { api } from "../../../convex/_generated/api";

/** Shown on every page when billing is on and the workspace has run out of credit. */
export function BalanceNotice() {
  const shell = useWorkspaceShell();
  const pathname = usePathname();
  const status = useQuery(api.billing.status, shell ? { workspaceId: shell.workspaceId } : "skip");
  if (!status?.on || !status.empty || pathname.startsWith("/app/billing")) return null;
  return (
    <Banner
      compact
      tone="critical"
      title="Out of credits"
      className="mb-4"
      action={
        status.canManage ? (
          <Button size="sm" render={<Link href="/app/billing" />}>
            Add credits
          </Button>
        ) : undefined
      }
    >
      {status.canManage ? "New sessions can't start until you add credits. Work already running finishes." : "New sessions can't start until the Owner adds credits."}
    </Banner>
  );
}
