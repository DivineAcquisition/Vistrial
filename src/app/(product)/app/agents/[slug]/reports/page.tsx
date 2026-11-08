"use client";

import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import Link from "next/link";

import { AssetStatusBadge } from "@/components/runs/run-parts";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { shortDate } from "@/lib/research/words";
import { api } from "../../../../../../../convex/_generated/api";
import { StartSessionButton } from "@/components/sessions/start-session-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

/** The finished work this agent produced, newest first. Each opens with its versions and evidence. */
export default function AgentReports() {
  const shell = useWorkspaceShell();
  const page = useQuery(api.assets.list, shell ? { workspaceId: shell.workspaceId, kind: "marketReport", paginationOpts: { numItems: 50, cursor: null } } : "skip");
  if (!shell) return null;
  const rows = (page?.page ?? []).filter((row) => row.status !== "archived");
  return (
    <div className="grid gap-3">
      {page === undefined ? (
        <p className="text-sm text-muted-foreground">Loading.</p>
      ) : rows.length === 0 ? (
        <EmptyState
          preview="rows"
          title="Finished reports will appear here."
          detail="Each finished session leaves one, with its versions, claims and sources."
          action={shell.role !== "rep" ? <StartSessionButton /> : undefined}
        />
      ) : (
        <Stagger className="grid gap-2">
          {rows.map((row) => (
            <StaggerItem key={row.id}>
              <Link href={`/app/assets/${row.id}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText aria-hidden className="size-4" />
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium text-card-foreground">{row.title}</span>
                  <span className="text-xs text-muted-foreground">
                    Version {row.currentVersion} · {shortDate(row.createdAt)}
                  </span>
                </span>
                <AssetStatusBadge status={row.status as "draft"} />
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </div>
  );
}
