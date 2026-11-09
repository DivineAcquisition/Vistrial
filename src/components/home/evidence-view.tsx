"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";

import { ExternalLink } from "@/components/icons";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { PLATFORM_LABEL, shortDate } from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";

export type EvidenceData = FunctionReturnType<typeof api.home.evidence>;

function amount(value: number | undefined, currency: string) {
  if (value === undefined) return "—";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + (currency ? ` ${currency}` : "");
}

/** Read-only: the business's own figures, then every source collected across sessions, newest first. */
export function EvidenceView({ data }: { data: EvidenceData | undefined }) {
  return (
    <div className="mx-auto grid w-full max-w-4xl min-w-0 gap-6">
      <PageHeader
        eyebrow="Library"
        title="Evidence"
        description="Everything Vistrial's reports stand on: the sources it read across sessions, and your own figures. Read-only."
      />
      {data === undefined ? <p className="text-sm text-muted-foreground">Loading evidence.</p> : null}
      {data?.seesFigures ? (
        <Panel as="section" className="grid gap-3 p-4 sm:p-6">
          <h2 className="font-heading text-base text-card-foreground">Your own figures</h2>
          {data.figures.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None yet. <Link className="underline underline-offset-4" href="/app/connections/results">Upload a results file</Link> or{" "}
              <Link className="underline underline-offset-4" href="/app/connections/meta">connect Meta ads</Link> and reports measure against them.
            </p>
          ) : (
            <ul className="grid gap-2">
              {data.figures.map((row) => (
                <li key={`${row.source}:${row.label}`} className="grid gap-1 rounded-xl border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-medium text-card-foreground">{row.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.source === "meta" ? "Meta ads" : "Results file"}
                      {row.dateStart && row.dateStop ? `, ${row.dateStart} to ${row.dateStop}` : ""}
                    </p>
                  </div>
                  <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {(["spend", "conversions", "revenue"] as const).map((metric) =>
                      row[metric] !== undefined ? (
                        <div key={metric} className="flex gap-1">
                          <dt className="text-muted-foreground capitalize">{metric}</dt>
                          <dd className="text-card-foreground tabular-nums">{metric === "conversions" ? row[metric]!.toLocaleString() : amount(row[metric], row.currency)}</dd>
                        </div>
                      ) : null,
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
      {data ? (
        <Panel as="section" className="grid gap-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-base text-card-foreground">Sources</h2>
            <span className="text-xs text-muted-foreground">
              {data.sourceCount} from {data.sessionCount} {data.sessionCount === 1 ? "session" : "sessions"}
            </span>
          </div>
          {data.sources.length === 0 ? (
            <EmptyState bare kind="empty" preview="rows" title="Sources appear here as sessions run." detail="Each page, video, post or ad a session reads is listed with where it came from." />
          ) : (
            <ul className="grid divide-y divide-border">
              {data.sources.map((source) => (
                <li key={source.id} className="grid min-w-0 gap-1 py-3 first:pt-0 last:pb-0">
                  <a href={source.url} target="_blank" rel="noreferrer noopener" className="flex min-w-0 items-start gap-1.5 font-medium break-words text-card-foreground underline-offset-4 hover:underline">
                    <span className="min-w-0">{source.title}</span>
                    <ExternalLink aria-hidden className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                  </a>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <StatusBadge label={PLATFORM_LABEL[source.platform] ?? source.platform} tone="neutral" icon="idle" className="[&_span]:normal-case" />
                    {source.publisher ? <span>{source.publisher}</span> : null}
                    <span>{source.origin === "supplied" ? "You supplied it" : "Found"}</span>
                    <span>{shortDate(source.observedAt)}</span>
                    <Link href={`/app/agents/growth-architect/sessions/${source.projectId}`} className="underline underline-offset-4 hover:text-foreground">
                      {source.projectTitle}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

export function LiveEvidence() {
  const shell = useWorkspaceShell();
  const data = useQuery(api.home.evidence, shell ? { workspaceId: shell.workspaceId } : "skip");
  if (!shell) return null;
  return <EvidenceView data={data} />;
}
