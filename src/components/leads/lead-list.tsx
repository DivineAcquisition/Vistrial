"use client";

import Link from "next/link";
import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { selectClass } from "@/lib/ui";

export function LeadList() {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return <LiveList workspaceId={shell.workspaceId} role={shell.role} />;
}

function LiveList({ workspaceId, role }: { workspaceId: Id<"workspaces">; role: "owner" | "manager" | "rep" }) {
  const stages = useQuery(api.leads.stages, { workspaceId }) ?? [];
  const [stageId, setStageId] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [search, setSearch] = useState("");
  const list = usePaginatedQuery(
    api.leads.list,
    {
      workspaceId,
      stageId: stageId ? (stageId as Id<"pipelineStages">) : undefined,
      status: status ? (status as "open" | "won" | "lost" | "closed") : undefined,
      source: source || undefined,
    },
    { initialNumItems: 25 },
  );
  const found = useQuery(api.leads.search, search.trim() ? { workspaceId, text: search } : "skip");

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-5xl gap-6">
      <PageHeader
        eyebrow="Leads"
        title="Leads"
        description="People you can work. A rep sees only their own."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" render={<Link href="/app/leads/new" />}>
              Add a lead
            </Button>
            <Button variant="secondary" render={<Link href="/app/leads/import" />}>
              Import
            </Button>
            {role === "rep" ? null : (
              <Button variant="ghost" render={<Link href="/app/leads/matches" />}>
                Review matches
              </Button>
            )}
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid min-w-0 gap-1 text-sm" htmlFor="lead-search">
          Search
          <Input id="lead-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">
          Stage
          <select className={selectClass} value={stageId} onChange={(event) => setStageId(event.target.value)}>
            <option value="">Any stage</option>
            {stages.map((stage: { id: string; name: string }) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Status
          <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Any status</option>
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Source
          <select className={selectClass} value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">Any source</option>
            <option value="manual">Added by hand</option>
            <option value="csv">CSV</option>
          </select>
        </label>
      </div>
      {search.trim() ? (
        <ul className="grid gap-2">
          {(found ?? []).map((lead: { id: string; name: string }) => (
            <li key={lead.id} className="min-w-0">
              <Link className="text-sm break-words text-foreground underline" href={`/app/leads/${lead.id}`}>
                {lead.name || "Unnamed"}
              </Link>
            </li>
          ))}
          {found && found.length === 0 ? <li className="text-sm text-muted-foreground">No leads match that search.</li> : null}
        </ul>
      ) : (
        <ul className="grid gap-2">
          {list.results.map((lead: { id: string; name: string; stageName: string; status: string; source: string }) => (
            <li key={lead.id} className="min-w-0 rounded-xl border border-border px-4 py-3">
              <Link className="font-medium break-words text-foreground" href={`/app/leads/${lead.id}`}>
                {lead.name || "Unnamed"}
              </Link>
              <p className="text-sm text-muted-foreground">
                {lead.stageName} · {lead.status} · {lead.source}
              </p>
            </li>
          ))}
        </ul>
      )}
      {!search.trim() && list.results.length === 0 && list.status !== "LoadingFirstPage" ? (
        <p className="text-sm text-muted-foreground">No leads yet.</p>
      ) : null}
      {!search.trim() ? (
        <Button type="button" variant="secondary" disabled={list.status !== "CanLoadMore"} onClick={() => list.loadMore(25)}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
