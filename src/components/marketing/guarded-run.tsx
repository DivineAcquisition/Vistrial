"use client";

import { useRef, useState } from "react";

import { CheckCircle2, Circle, Clock, FileText, Gauge, Globe, Loader2, Lock, ScrollTextIcon, Search, ShieldCheck, TriangleAlert } from "@/components/icons";
import { HoldToApprove, useInViewSequence } from "@/components/marketing/agentic-visuals";
import { BasisBadge } from "@/components/marketing/growth-visuals";
import { Badge } from "@/components/ui/badge";
import { HERO, SAFETY } from "@/lib/marketing/content";
import { cn } from "@/lib/utils";

/**
 * Safety, shown as a run: each step the agent takes, the request it is refused, the cost against the
 * limit, and the stop for a person. The guardrails beside it light up as the run reaches them, and
 * the activity record fills in. With reduced motion the finished run is shown at once.
 */

const RUN = SAFETY.run;
const eyebrow = "text-[11px] font-semibold tracking-[0.14em] text-brand-200 uppercase";

type Step = (typeof RUN.steps)[number];
type Shown = "queued" | "running" | Step["state"];

const STEP_ICON: Record<Step["id"], typeof Search> = { search: Search, read: Globe, refused: Globe, label: ShieldCheck, draft: FileText };
const GUARD_ICON: Record<(typeof RUN.guards)[number]["id"], typeof Search> = {
  approval: CheckCircle2,
  access: Globe,
  evidence: ShieldCheck,
  cost: Gauge,
  separation: Lock,
  record: ScrollTextIcon,
};

const money = (cents: number) => (cents < 100 ? `${cents}¢` : `$${(cents / 100).toFixed(2)}`);

function StateBadge({ state }: { state: Shown }) {
  const label = RUN.stateLabel[state];
  if (state === "done") {
    return (
      <Badge variant="success" size="sm">
        <CheckCircle2 aria-hidden />
        {label}
      </Badge>
    );
  }
  if (state === "blocked") {
    return (
      <Badge variant="warning" size="sm">
        <TriangleAlert aria-hidden />
        {label}
      </Badge>
    );
  }
  if (state === "waiting") {
    return (
      <Badge variant="info" size="sm">
        <Clock aria-hidden />
        {label}
      </Badge>
    );
  }
  if (state === "running") {
    return (
      <Badge variant="outline" size="sm">
        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" size="sm" className="text-muted-foreground">
      <Circle aria-hidden />
      {label}
    </Badge>
  );
}

/** Spend against the run's limit, with the warning mark and the hard stop shown apart. */
function BudgetGuard({ spentCents }: { spentCents: number }) {
  const { budget } = RUN;
  const share = Math.min(1, spentCents / budget.capCents);
  return (
    <div className="rounded-lg border border-border bg-muted px-3.5 py-3">
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Gauge className="size-3.5 text-brand-400" aria-hidden />
          <span>
            {budget.spent} <span className="font-medium text-strong tabular-nums">{money(spentCents)}</span> {budget.of}{" "}
            <span className="font-medium text-strong tabular-nums">{money(budget.capCents)}</span> {budget.limit}
          </span>
        </span>
      </p>
      <div className="relative mt-2.5 h-2 rounded-full bg-overlay/10" aria-hidden>
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-700 motion-reduce:transition-none"
          style={{ width: `${share * 100}%` }}
        />
        <span className="absolute -top-1 h-4 w-px bg-flag-warning" style={{ left: `${budget.warnShare * 100}%` }} />
        <span className="absolute -top-1 right-0 h-4 w-0.5 rounded-full bg-strong" />
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] font-medium tracking-wide uppercase" aria-hidden>
        <span className="absolute -translate-x-1/2 text-flag-warning" style={{ left: `${budget.warnShare * 100}%` }}>
          {budget.warns}
        </span>
        <span className="absolute right-0 text-strong">{budget.stops}</span>
      </div>
    </div>
  );
}

export function GuardedRun() {
  const ref = useRef<HTMLDivElement>(null);
  const reached = useInViewSequence(ref, RUN.steps.length, 1100);
  const [approved, setApproved] = useState(false);

  const finished = reached >= RUN.steps.length;
  const spentCents = reached === 0 ? 0 : RUN.steps[Math.min(reached, RUN.steps.length) - 1].spentCents;
  const shownState = (index: number): Shown => (index < reached ? RUN.steps[index].state : index === reached ? "running" : "queued");

  const seen = new Set<string>(RUN.steps.slice(0, reached).map((step) => step.guard));
  if (reached > 0) {
    seen.add("cost");
    seen.add("record");
  }
  seen.add("separation");

  const record = RUN.record.filter((line) => reached >= line.afterStep);

  return (
    <div ref={ref} className="grid items-start gap-4 lg:grid-cols-[1.25fr_0.75fr]">
      {/* The run */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_60px_-36px_rgba(var(--brand-rgb),0.7)]">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className={eyebrow}>
              {RUN.agent} · {HERO.exampleLabel}
            </p>
            <p className="mt-0.5 text-sm font-medium text-strong">{RUN.skill}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Lock className="size-3.5 text-brand-400" aria-hidden />
            <span className="font-medium text-strong">{RUN.workspace}</span>
            <span className="hidden sm:inline">· {RUN.workspaceNote}</span>
          </span>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <BudgetGuard spentCents={spentCents} />

          <ol className="relative space-y-2">
            {RUN.steps.map((step, index) => {
              const state = shownState(index);
              const Icon = STEP_ICON[step.id];
              const live = state !== "queued";
              const settled = index < reached;
              return (
                <li
                  key={step.id}
                  className={cn(
                    "rounded-lg border px-3.5 py-3 transition-colors duration-500 motion-reduce:transition-none",
                    !live && "border-dashed border-border bg-transparent",
                    live && state !== "blocked" && "border-border bg-muted",
                    state === "blocked" && "border-flag-warning/40 bg-flag-warning/10",
                    state === "waiting" && "border-brand-500/40 bg-brand-500/10",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card", !live && "opacity-50")} aria-hidden>
                        <Icon className={cn("size-3.5", state === "blocked" ? "text-flag-warning" : "text-brand-400")} />
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block text-sm font-medium", live ? "text-strong" : "text-muted-foreground")}>{step.tool}</span>
                        <span className="block truncate text-xs text-muted-foreground">{step.target}</span>
                      </span>
                    </span>
                    <StateBadge state={state} />
                  </div>
                  {/* The result keeps its place before the step finishes, so the panel does not jump as the run plays. */}
                  <div className={cn("mt-2 pl-[2.375rem] text-xs leading-relaxed text-muted-foreground", settled ? "live-enter" : "invisible")} aria-hidden={settled ? undefined : true}>
                    <p className={cn(state === "blocked" && "text-strong")}>{step.result}</p>
                    {step.id === "label" ? (
                      <p className="mt-1.5 flex flex-wrap gap-1.5">
                        <BasisBadge basis="observed" />
                        <BasisBadge basis="inferred" />
                        <BasisBadge basis="hypothesis" />
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>

          {/* The stop for a person. It appears once the draft is saved. */}
          <div className={cn("rounded-lg border border-brand-500/40 bg-background p-4", finished ? "live-enter" : "invisible")} inert={!finished}>
            <HoldToApprove onChange={setApproved}>
              {(done) => (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-strong">{RUN.reportTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {RUN.reportMeta} · {money(RUN.steps[RUN.steps.length - 1].spentCents)}
                    </p>
                  </div>
                  <Badge variant={done ? "success" : "warning"} size="sm">
                    {done ? "Approved" : "Waiting"}
                  </Badge>
                </div>
              )}
            </HoldToApprove>
          </div>
        </div>
      </div>

      {/* The guardrails, and the record the run leaves */}
      <div className="grid gap-4">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h3 className={eyebrow}>{RUN.guardsTitle}</h3>
          <ul className="mt-3 grid gap-1">
            {RUN.guards.map((guard) => {
              const on = seen.has(guard.id);
              const Icon = GUARD_ICON[guard.id];
              return (
                <li key={guard.id} className={cn("flex gap-3 rounded-lg px-2.5 py-2.5 transition-colors duration-500 motion-reduce:transition-none", on && "bg-brand-500/10")}>
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-500 motion-reduce:transition-none",
                      on ? "border-brand-500/50 bg-card text-brand-400" : "border-border bg-muted text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-strong">{guard.title}</span>
                      <span className={cn("text-[10px] font-semibold tracking-[0.1em] uppercase", on ? "text-flag-good" : "text-muted-foreground")}>
                        {on ? RUN.guardOn : RUN.guardWaiting}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{guard.body}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-muted p-4 sm:p-5">
          <h3 className={cn(eyebrow, "flex items-center gap-2")}>
            <ScrollTextIcon className="size-3.5" aria-hidden />
            {RUN.recordTitle}
          </h3>
          <ol className="mt-3 min-h-[6.5rem] space-y-1.5 font-mono text-xs" aria-live="off">
            {record.map((line) => (
              <li key={line.text} className="live-enter flex gap-3 text-muted-foreground">
                <span className="shrink-0 tabular-nums">{line.time}</span>
                <span className="text-strong">{line.text}</span>
              </li>
            ))}
            {approved ? (
              <li className="live-enter flex gap-3 text-muted-foreground">
                <span className="shrink-0 tabular-nums">{RUN.recordApproved.time}</span>
                <span className="font-medium text-flag-good">{RUN.recordApproved.text}</span>
              </li>
            ) : null}
          </ol>
        </div>
      </div>
    </div>
  );
}
