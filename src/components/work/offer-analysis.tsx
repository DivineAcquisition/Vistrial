"use client";

import { ExternalLink } from "@/components/icons";
import { Detail, EvidenceLabel, StatusChip } from "@/components/readable";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

import { TryThis, type TryActions } from "./try-this";
import type { ItemDecision, OfferAnalysisView } from "./types";

type Ours = OfferAnalysisView["ours"];
type Competitor = OfferAnalysisView["competitors"][number];

function Cell({ value, gap }: { value: string; gap?: boolean }) {
  const missing = !value.trim() || /^not stated/i.test(value);
  return (
    <span className={cn("block text-sm", missing ? "text-muted-foreground italic" : "text-card-foreground")}>
      {missing ? "Not stated" : value}
      {gap ? <StatusChip tone="partly" label="A competitor states this" className="mt-1 flex not-italic" /> : null}
    </span>
  );
}

function Sources({ sources }: { sources: Competitor["sources"] }) {
  if (sources.length === 0) return <span className="text-xs text-muted-foreground">No source kept</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {sources.map((source) => (
        <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline">
          <ExternalLink aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{source.title}</span>
        </a>
      ))}
    </span>
  );
}

/**
 * Your offer beside each competitor's, from approved research only. A field is highlighted when a
 * competitor states something your offer does not. Each competitor's sources link out.
 */
export function CompetitorSideBySide({ ours, competitors }: { ours: Ours; competitors: Competitor[] }) {
  if (competitors.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">Your approved research showed no competitor offers to compare with.</p>;
  }
  const rows: { key: "offer" | "price" | "guarantee"; label: string; mine: string }[] = [
    { key: "offer", label: "Leads with", mine: ours.product },
    { key: "price", label: "Price", mine: ours.price },
    { key: "guarantee", label: "Guarantee", mine: ours.guarantee },
  ];
  return (
    <div className="grid gap-3">
      {/* Wide screens: one table, you in the first column. */}
      <div className="hidden overflow-hidden rounded-2xl border border-border md:block">
        <table className="w-full table-fixed text-left">
          <thead>
            <tr className="bg-muted/40">
              <th className="w-28 px-3 py-2 text-xs font-medium text-muted-foreground" scope="col">
                <span className="sr-only">Field</span>
              </th>
              <th className="px-3 py-2 text-xs font-semibold text-primary" scope="col">
                You
              </th>
              {competitors.map((row) => (
                <th key={row.competitor} className="px-3 py-2 text-xs font-semibold text-card-foreground" scope="col">
                  {row.competitor}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((field) => (
              <tr key={field.key} className="border-t border-border align-top">
                <th scope="row" className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                  {field.label}
                </th>
                <td className="bg-primary/[0.04] px-3 py-2.5">
                  <Cell value={field.mine} gap={field.key !== "offer" && competitors.some((row) => row.gaps[field.key as "price" | "guarantee"])} />
                </td>
                {competitors.map((row) => (
                  <td key={row.competitor} className="px-3 py-2.5">
                    <Cell value={row[field.key]} />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-border align-top">
              <th scope="row" className="px-3 py-2.5 text-xs font-medium text-muted-foreground">
                Sources
              </th>
              <td className="bg-primary/[0.04] px-3 py-2.5 text-xs text-muted-foreground">Your own words</td>
              {competitors.map((row) => (
                <td key={row.competitor} className="px-3 py-2.5">
                  <Sources sources={row.sources} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {/* Phones: one card a competitor, each beside your own line. */}
      <ul className="grid gap-2 md:hidden">
        {competitors.map((row) => (
          <li key={row.competitor} className="grid gap-2 rounded-2xl border border-border bg-card p-3">
            <p className="text-sm font-semibold text-card-foreground">{row.competitor}</p>
            {rows.map((field) => (
              <div key={field.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
                <span className="text-xs text-muted-foreground">{field.label}</span>
                <span className="grid gap-0.5">
                  <Cell value={row[field.key]} />
                  <span className="text-xs text-muted-foreground">
                    You: <Cell value={field.mine} gap={field.key !== "offer" && row.gaps[field.key as "price" | "guarantee"]} />
                  </span>
                </span>
              </div>
            ))}
            <Sources sources={row.sources} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">&ldquo;A competitor states this&rdquo; marks a field at least one competitor states and your offer does not. It says nothing about which offer sells better.</p>
    </div>
  );
}

/** Gaps and risks against the competition, each with its basis. */
export function GapsList({ gaps }: { gaps: OfferAnalysisView["gapsAndRisks"] }) {
  if (gaps.length === 0) return null;
  return (
    <ul className="grid gap-2">
      {gaps.map((row) => (
        <li key={row.statement} className="flex gap-2 rounded-xl border border-border bg-card p-3 text-sm">
          <span className="grid gap-1.5">
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusChip tone={row.kind === "risk" ? "partly" : "absent"} label={row.kind === "risk" ? "Risk" : "Gap"} />
              {row.basisLabel ? <EvidenceLabel label={row.basisLabel} /> : <StatusChip tone="quiet" label="No basis" />}
            </span>
            <span className="text-card-foreground">{row.statement}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The test plan: the two or three suggested changes, each with how to tell if it worked and "We'll try
 * this" wired to the outcome loop.
 */
export function TestPlan({ changes, decisions, actions, editor, ready }: { changes: OfferAnalysisView["changes"]; decisions: Map<number, ItemDecision>; actions: TryActions; editor: boolean; ready: boolean }) {
  if (changes.length === 0) return <p className="text-sm text-muted-foreground">This analysis suggests no change to test.</p>;
  return (
    <ol className="grid gap-3">
      {changes.map((row) => (
        <li key={row.index} id={`offer-change-${row.index + 1}`} className="grid scroll-mt-24 gap-3 rounded-2xl border border-border bg-card p-4 target:border-primary">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="flex items-start gap-2 font-medium text-card-foreground">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs text-primary tabular-nums">{row.index + 1}</span>
              {row.title}
            </h4>
            <span className="flex flex-wrap gap-1">
              {row.basisLabel ? <EvidenceLabel label={row.basisLabel} /> : <StatusChip tone="quiet" label="No basis" />}
              {row.channel ? <StatusBadge label={row.channel} tone="neutral" className="[&_span]:normal-case" /> : null}
              {row.newChannel ? <StatusBadge label="New channel" tone="warning" className="[&_span]:normal-case" /> : null}
            </span>
          </div>
          <p className="text-sm text-card-foreground">{row.proposedChange}</p>
          <Detail summary="How to tell if it worked, and the evidence">
            <p className="text-sm text-card-foreground">How to tell: {row.validationMethod}</p>
            <p className="text-sm text-muted-foreground">Evidence: {row.evidence}</p>
          </Detail>
          {ready ? (
            <div className="border-t border-border pt-3">
              <TryThis index={row.index} decision={decisions.get(row.index)} editor={editor} actions={actions} />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
