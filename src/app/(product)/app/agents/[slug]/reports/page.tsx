"use client";

import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import Link from "next/link";

import { AssetStatusBadge } from "@/components/runs/run-parts";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Panel } from "@/components/ui/panel";
import { shortDate } from "@/lib/research/words";
import { api } from "../../../../../../../convex/_generated/api";

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
        <Panel className="p-5">
          <p className="text-sm text-muted-foreground">No reports yet. Each finished session leaves one here.</p>
        </Panel>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.id}>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
