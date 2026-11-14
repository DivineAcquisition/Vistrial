"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";

import { ArrowRight, Check, CircleDashed, LoaderCircle, Sparkles, TriangleAlert, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type PackagePart = {
  key: "research" | "offers" | "teardown";
  title: string;
  gives: string;
  state: "waiting" | "running" | "done" | "needsReview" | "failed" | "skipped";
  phase: string | null;
  steps: number;
  assetId: string | null;
  reason: string | null;
};
export type PackageData = { status: "waiting" | "running" | "done"; reason: string | null; parts: PackagePart[]; emailed: boolean; dismissed: boolean };

/** What a part is doing now, in words, from its run's latest step. */
const PHASE_WORDS: Record<string, string> = {
  context: "Reading what you confirmed",
  brief: "Planning the research",
  research: "Searching your market",
  collect: "Collecting competitors' pages and ads",
  classify: "Sorting what it found",
  applyClassification: "Sorting what it found",
  compute: "Counting what competitors do",
  prioritize: "Choosing what matters most",
  write: "Writing",
  check: "Checking every claim against its source",
  revise: "Revising",
  recheck: "Checking the revision",
  save: "Saving",
  read: "Opening your pages",
  apply: "Matching your pages to the framework",
  industry: "Writing what to change",
};

export function phaseWords(part: Pick<PackagePart, "key" | "phase" | "state">): string {
  if (part.state === "waiting") return part.key === "offers" ? "Starts when the research is approved" : "Waiting to start";
  if (!part.phase) return "Getting started";
  if (part.phase.startsWith("analyse:")) return `Reading page ${Number(part.phase.split(":")[1]) + 1} against the framework`;
  return PHASE_WORDS[part.phase] ?? "Working";
}

/** How far along a running part is, from its steps against what such a run usually takes. A guide, not a promise. */
function progressOf(part: PackagePart) {
  if (part.state === "done" || part.state === "needsReview") return 100;
  if (part.state !== "running") return 0;
  const typical = part.key === "research" ? 30 : part.key === "teardown" ? 14 : 6;
  return Math.min(92, Math.max(6, Math.round((part.steps / typical) * 100)));
}

function StateIcon({ state }: { state: PackagePart["state"] }) {
  if (state === "done") return <Check aria-hidden className="size-4 text-success" />;
  if (state === "running") return <LoaderCircle aria-hidden className="size-4 animate-spin text-primary" />;
  if (state === "needsReview" || state === "failed") return <TriangleAlert aria-hidden className="size-4 text-warning" />;
  return <CircleDashed aria-hidden className="size-4 text-muted-foreground" />;
}

/**
 * The first package on Home: the three parts with live progress while they run, then each one's report,
 * ready to use. Plain data in, so the story can show every state.
 */
export function FirstPackageView({ data, onDismiss, footer }: { data: PackageData; onDismiss?: () => void; footer?: React.ReactNode }) {
  const done = data.status === "done";
  return (
    <Panel as="section" className="relative grid gap-5 overflow-hidden p-4 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-[#a78bfa] to-primary/40" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            <Sparkles aria-hidden className="size-3.5" /> Strategist
          </p>
          <h2 className="font-heading text-xl text-strong">{done ? "Your first package is ready" : data.status === "waiting" ? "Your first package starts soon" : "Strategist is working on your first package"}</h2>
          <p className="text-sm text-muted-foreground">
            {data.status === "waiting"
              ? "Many businesses joined today. Your package is queued and starts within the day."
              : done
                ? "Approved and ready to use. On Vistrial: it used none of your credits."
                : `On Vistrial: it uses none of your credits.${data.emailed ? "" : " You will get an email when the research and offer ideas are done."}`}
          </p>
          {data.reason ? <p className="text-sm text-warning">{data.reason}</p> : null}
        </div>
        {done && onDismiss ? (
          <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Hide the first package from Home">
            <X aria-hidden className="size-4" />
          </Button>
        ) : null}
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {data.parts.map((part) => {
          const progress = progressOf(part);
          return (
            <li key={part.key} className={cn("grid content-start gap-3 rounded-xl border p-4", part.state === "done" ? "border-success/30 bg-success/5" : "border-border bg-card")}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium text-strong">{part.title}</h3>
                <StateIcon state={part.state} />
              </div>
              <p className="text-sm text-muted-foreground">{part.gives}</p>
              {part.state === "running" || part.state === "waiting" ? (
                <div className="grid gap-1.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-overlay/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={`${part.title} progress`}>
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-[#a78bfa] transition-all duration-700" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {phaseWords(part)}
                  </p>
                </div>
              ) : null}
              {part.state === "done" || part.state === "needsReview" ? (
                <div className="grid gap-1.5">
                  {part.state === "needsReview" ? <p className="text-xs text-warning">It did not pass all of its checks, so it waits for your review instead of arriving approved.</p> : <p className="text-xs text-success-foreground">Approved, ready to use</p>}
                  {part.assetId ? (
                    <Link href={`/app/assets/${part.assetId}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                      {part.state === "needsReview" ? "Review it" : "Open"} <ArrowRight aria-hidden className="size-3.5" />
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {part.state === "failed" || part.state === "skipped" ? <p className="text-xs text-muted-foreground">{part.reason ?? "Not part of this package."}</p> : null}
            </li>
          );
        })}
      </ol>
      {footer}
    </Panel>
  );
}

/** The package wired to Convex. Nothing when the organization has none, or it was hidden. */
export function FirstPackage({ workspaceId, footer, keepWhenDismissed = false }: { workspaceId: Id<"workspaces">; footer?: React.ReactNode; keepWhenDismissed?: boolean }) {
  const data = useQuery(api.firstPackage.mine, { workspaceId });
  const dismiss = useMutation(api.firstPackage.dismiss);
  if (!data || (data.dismissed && !keepWhenDismissed)) return null;
  return <FirstPackageView data={data} footer={footer} onDismiss={keepWhenDismissed ? undefined : () => void dismiss({ workspaceId }).catch(() => undefined)} />;
}
