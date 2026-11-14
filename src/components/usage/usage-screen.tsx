"use client";

import { useQuery } from "convex/react";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { UsageView, queryArgs, type UsageFilters } from "@/components/usage/usage-view";

import { api } from "../../../convex/_generated/api";

/** The usage page fed by Convex. What each role sees is decided by the server (convex/usage.ts). */
export function UsageScreen() {
  const shell = useWorkspaceShell();
  const [filters, setFilters] = useState<UsageFilters>({ period: "30d" });
  const [limit, setLimit] = useState(50);
  const args = shell ? { workspaceId: shell.workspaceId, ...queryArgs(filters) } : null;
  const data = useQuery(api.usage.overview, args ?? "skip");
  const items = useQuery(api.usage.items, args && data && data.access !== "summary" ? { ...args, limit } : "skip");

  if (!shell) return <EmptyState kind="permission" title="Sign in to open your organization." />;
  if (data === undefined) return <p className="text-sm text-muted-foreground">Loading usage.</p>;
  return (
    <UsageView
      data={data}
      items={items}
      filters={filters}
      onFilters={(next) => {
        setFilters(next);
        setLimit(50);
      }}
      onMore={() => setLimit((current) => Math.min(500, current + 50))}
    />
  );
}
