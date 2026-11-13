"use client";

import { EvidenceLabel } from "@/components/readable/evidence-label";
import { reportGlance } from "@/lib/readable/report";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  FileText,
  LoaderCircle,
  MessageCircleQuestion,
  MessagesSquare,
  Plug,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "@/components/icons";
import { AssetStatusBadge } from "@/components/runs/run-parts";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { TAB_SKILL, type WorkTab } from "../../../convex/lib/workTabs";

import { ReviewBar } from "./review-bar";
import type { FinishedRun, ResultRow, ReviewActions, RunningRun, SuggestionRow } from "./types";
import { MEMORY_HREF } from "@/lib/shell/journey";

/** Plain words for a step's phase, as the live feed shows it. */
const PHASE_WORDS: Record<string, string> = {
  context: "Reading what it knows about you",
  ask: "Waiting for your answer",
  brief: "Planning the research",
  collect: "Collecting sources",
  classify: "Reading sources",
  write: "Writing",
  diagnose: "Writing the diagnosis",
  gdRead: "Reading your own results",
  check: "Checking every claim",
  gdCheck: "Checking every number",
  recheck: "Checking the revision",
  gdRecheck: "Checking the revision",
  revise: "Revising",
  gdRevise: "Revising",
  save: "Saving for your review",
};

export function phaseWords(phase: string | null) {
  return (phase && PHASE_WORDS[phase]) || "Getting started";
}

export function SectionTitle({ icon: Icon, children, aside }: { icon: LucideIcon; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-heading text-base text-foreground">
        <Icon aria-hidden className="size-4 text-primary" />
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** The top of a work tab: what it holds, in a sentence, and its one main action. No chat box: talking happens in Chat. */
export function WorkHero({ icon: Icon, eyebrow, title, promise, action, children }: { icon: LucideIcon; eyebrow: string; title: string; promise: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <Panel className="relative grid gap-4 overflow-hidden p-4 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-primary/25">
            <Icon aria-hidden className="size-5" />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{eyebrow}</p>
            <h1 className="font-heading text-lg text-card-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{promise}</p>
          </div>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      {children ? <div className="relative min-w-0">{children}</div> : null}
    </Panel>
  );
}

/** Live progress for this skill's runs. Each opens its full step list. */
export function RunningNow({ running, finished, sessionHref }: { running: RunningRun[]; finished: FinishedRun[]; sessionHref?: (projectId: string) => string }) {
  return (
    <section id="running" className="grid scroll-mt-24 gap-3" aria-label="Running now">
      <SectionTitle icon={LoaderCircle}>Running now</SectionTitle>
      {running.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">Nothing is running. Work starts only when you press Start on a plan.</p>
      ) : (
        <ul className="grid gap-2">
          {running.map((run) => {
            const waiting = run.status === "waiting" || run.status === "needsInput";
            const href = run.projectId && sessionHref ? sessionHref(run.projectId) : `/app/runs/${run.id}`;
            return (
              <li key={run.id}>
                <Link href={href} className="grid gap-2 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-card-foreground">
                      {waiting ? (
                        <MessageCircleQuestion aria-hidden className="size-4 shrink-0 text-warning" />
                      ) : (
                        <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
                      )}
                      <span className="truncate">{waiting ? "Waiting for your answer" : phaseWords(run.phase)}</span>
                    </span>
                  </span>
                  {run.question ? <span className="line-clamp-2 text-xs text-card-foreground">&ldquo;{run.question}&rdquo;</span> : null}
                  <span aria-hidden className="h-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-gradient-to-r from-primary/60 to-primary" style={{ width: `${Math.min(95, 8 + run.stepsDone * 9)}%` }} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {run.stepsDone} step{run.stepsDone === 1 ? "" : "s"} done · started {shortDate(run.startedAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {finished.length > 0 ? (
        <details className="group text-sm">
          <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">Earlier runs ({finished.length})</summary>
          <ul className="mt-2 grid gap-1">
            {finished.map((run) => (
              <li key={run.id}>
                <Link href={`/app/runs/${run.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted">
                  <span className="text-card-foreground">{shortDate(run.startedAt)}</span>
                  <span className="text-muted-foreground">
                    {run.status === "completed" ? "Finished" : run.status === "failed" ? "Failed" : "Stopped"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

/**
 * This skill's results: drafts waiting for review first, each with approve, request changes and reject.
 * `extra` adds a tab's own action to a row (the PDF on a research report).
 */
/**
 * What a report found, on its row: the report's own summary paragraph and the weakest evidence label among
 * its claims. Read out of the report's current version; a row with no summary shows nothing.
 */
function RowAnswer({ answer }: { answer: ResultRow["answer"] | undefined }) {
  if (!answer) return null;
  const glance = reportGlance(answer.lead, answer.labels.map((basisLabel) => ({ basisLabel })));
  if (!glance.summary) return null;
  return (
    <p className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm text-card-foreground">
      {glance.weakest ? <EvidenceLabel label={glance.weakest} /> : null}
      <span className="line-clamp-2 min-w-0 flex-1 basis-64">{glance.summary}</span>
    </p>
  );
}

export function ResultsList({
  results,
  actions,
  editor,
  empty,
  extra,
  openHref,
  refineHref,
}: {
  results: ResultRow[];
  actions: ReviewActions;
  editor: boolean;
  empty: string;
  extra?: (row: ResultRow) => ReactNode;
  openHref?: (row: ResultRow) => string;
  /** "Refine in chat": opens the Chat tab with this result attached. Owners, Admins and Members. */
  refineHref?: (row: ResultRow) => string;
}) {
  const waiting = results.filter((row) => row.status === "draft" || row.status === "needsReview").length;
  return (
    <section id="results" className="grid scroll-mt-24 gap-3" aria-label="Results">
      <SectionTitle icon={FileText} aside={waiting ? <StatusBadge label={`${waiting} to review`} tone="warning" className="[&_span]:normal-case" /> : null}>
        Results
      </SectionTitle>
      {results.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-2">
          {results.map((row) => {
            const pending = row.status === "draft" || row.status === "needsReview";
            return (
              <li key={row.id} className={cn("grid gap-3 rounded-xl border bg-card p-3 sm:p-4", pending ? "border-primary/35 shadow-[0_0_0_3px] shadow-primary/5" : "border-border")}>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <Link href={openHref ? openHref(row) : `/app/assets/${row.id}`} className="grid min-w-0 gap-0.5 hover:underline">
                    <span className="truncate font-medium text-card-foreground">{row.title}</span>
                    <span className="text-xs text-muted-foreground">
                      Version {row.currentVersion} · {shortDate(row.createdAt)}
                    </span>
                  </Link>
                  <AssetStatusBadge status={row.status as "draft"} />
                </div>
                <RowAnswer answer={row.answer} />
                {(pending && editor) || extra || (refineHref && editor) ? (
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    {pending && editor ? <ReviewBar assetId={row.id} actions={actions} needsReview={row.status === "needsReview"} /> : <span />}
                    <span className="flex flex-wrap items-center gap-2">
                      {refineHref && editor && row.status !== "rejected" ? <RefineInChat href={refineHref(row)} /> : null}
                      {extra ? extra(row) : null}
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Next steps. Each opens the Chat tab on the right skill with the box filled in; nothing runs until the owner presses send and Start. */
export function SuggestedNext({ suggestions, hrefFor }: { suggestions: SuggestionRow[]; hrefFor: (row: SuggestionRow) => string }) {
  if (suggestions.length === 0) return null;
  return (
    <section className="grid gap-3" aria-label="Suggested next steps">
      <SectionTitle icon={Sparkles}>Suggested next steps</SectionTitle>
      <ul className="grid gap-2">
        {suggestions.map((row) => (
          <li key={row.id}>
            <Link href={hrefFor(row)} className="group grid gap-1 rounded-xl border border-border bg-gradient-to-br from-primary/[0.06] to-transparent p-3 transition-colors hover:border-primary/40">
              <span className="flex items-center justify-between gap-2 text-sm font-medium text-card-foreground">
                {row.title}
                <ArrowRight aria-hidden className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="text-xs text-muted-foreground">{row.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground">Suggestions never run on their own. You choose, and you see the plan and budget first.</p>
    </section>
  );
}

/** Opens the Chat tab with one item attached as context. Every result has one. */
export function RefineInChat({ href, label = "Refine in chat" }: { href: string; label?: string }) {
  return (
    <Button size="sm" variant="ghost" render={<Link href={href} />}>
      <MessagesSquare aria-hidden className="size-4" /> {label}
    </Button>
  );
}

/** Where a suggestion goes: Connections, or the Chat tab on the suggested skill with its prompt filled in. */
export function suggestionHref(base: string, row: { tab: string; prompt?: string }) {
  if (row.tab === "connections") return `${base}/connections`;
  const skill = TAB_SKILL[row.tab as WorkTab];
  if (!row.prompt || !skill) return `${base}/work/${row.tab}`;
  return `${base}/work/chat?skill=${skill}&ask=${encodeURIComponent(row.prompt)}`;
}

/** The link "Refine in chat" uses for a result. */
export function refineLink(base: string, skill: string, item: { kind: "asset" | "offer"; id: string; title: string }) {
  const query = new URLSearchParams({ skill, ref: `${item.kind}:${item.id}`, about: item.title.slice(0, 120) });
  return `${base}/work/chat?${query.toString()}`;
}

/** The agent's shared shelves: what it knows, the evidence behind its claims, and what it is connected to. */
export function SharedLinks({ base }: { base: string }) {
  const links = [
    { href: MEMORY_HREF, label: "Memory", detail: "What it knows about your business", icon: Brain },
    { href: "/app/evidence", label: "Evidence", detail: "Every claim and its source", icon: ShieldCheck },
    { href: `${base}/connections`, label: "Connections", detail: "Meta and your results files", icon: Plug },
  ];
  return (
    <nav aria-label="Shared" className="grid gap-2">
      {links.map((row) => (
        <Link key={row.href} href={row.href} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40">
          <row.icon aria-hidden className="size-4 shrink-0 text-primary" />
          <span className="grid min-w-0 flex-1">
            <span className="text-sm text-card-foreground">{row.label}</span>
            <span className="truncate text-xs text-muted-foreground">{row.detail}</span>
          </span>
          <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </nav>
  );
}

/** The two-column body of a work tab: the work on the left, live progress and next steps on the right. */
export function WorkLayout({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="grid min-w-0 content-start gap-5">{main}</div>
      <aside className="grid min-w-0 content-start gap-5">{rail}</aside>
    </div>
  );
}
