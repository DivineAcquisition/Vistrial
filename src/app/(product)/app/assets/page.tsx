"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../../../convex/_generated/api";

const statuses = ["draft", "approved", "archived"] as const;

export default function AssetsPage() {
  const shell = useWorkspaceShell();
  const [status, setStatus] = useState<(typeof statuses)[number]>("draft");
  const page = useQuery(
    api.assets.list,
    shell ? { workspaceId: shell.workspaceId, status, paginationOpts: { numItems: 20, cursor: null } } : "skip",
  );
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <PageHeader eyebrow="Library" title="Assets" description="Filter by status. Open one to see its versions." />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Asset status">
        {statuses.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={status === item}
            className="rounded-lg border border-border px-3 py-2 text-sm"
            onClick={() => setStatus(item)}
          >
            {item === "draft" ? "Draft" : item === "approved" ? "Approved" : "Archived"}
          </button>
        ))}
      </div>
      <Panel className="p-4 sm:p-6">
        {page === undefined ? <p className="text-sm text-muted-foreground">Loading assets.</p> : null}
        {page && page.page.length === 0 ? <p className="text-sm text-muted-foreground">Nothing in this filter.</p> : null}
        <ul className="grid gap-3">
          {page?.page.map((asset: { id: string; title: string; kind: string; status: string }) => (
            <li key={asset.id}>
              <Link className="block rounded-lg px-2 py-2 hover:bg-accent" href={`/app/assets/${asset.id}`}>
                <span className="block font-medium text-card-foreground">{asset.title}</span>
                <span className="text-sm text-muted-foreground">
                  {asset.kind} · {asset.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
