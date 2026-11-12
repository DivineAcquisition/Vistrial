"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Coins,
  Gauge,
  Hand,
  ListChecks,
  Loader,
  MinusCircle,
  Plug,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "@/components/icons";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";

import { VistrialMark } from "@/components/brand/vistrial-mark";
import { BorderBeam } from "@/components/ui/border-beam";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export type SyncStep = { key: string; status: "waiting" | "working" | "done" | "failed"; calls: number; rows?: number; ms?: number };
export type SyncRun = {
  id: string;
  trigger: "manual" | "schedule" | "connect";
  status: "running" | "done" | "failed";
  code: string | null;
  startedAt: number;
  finishedAt: number | null;
  steps: SyncStep[];
  callsOk: number;
  callsFailed: number;
};
export type Usage = {
  days: { day: string; ok: number; failed: number }[];
  ok: number;
  failed: number;
  successRate: number | null;
  target: { calls: number; successRate: number; days: number };
};
export type Observation = { key: string; kind: string; title: string; detail: string; tone: "good" | "warning" | "neutral"; campaignIds: string[] };

const STEP_WORDS: Record<string, { icon: LucideIcon; doing: string; done: string; unit: string }> = {
  access: { icon: ShieldCheck, doing: "Checking access to the ad account", done: "Checked access to the ad account", unit: "account" },
  results: { icon: BarChart3, doing: "Reading results for every campaign", done: "Read results for every campaign", unit: "result rows" },
  campaigns: { icon: ListChecks, doing: "Reading the campaign list", done: "Read the campaign list", unit: "campaigns" },
  trend: { icon: TrendingUp, doing: "Reading spend over time", done: "Read spend over time", unit: "points" },
  save: { icon: Save, doing: "Saving the read for this organization", done: "Saved the read for this organization", unit: "campaigns" },
};

const TRIGGER_WORDS: Record<SyncRun["trigger"], { icon: LucideIcon; label: string }> = {
  manual: { icon: Hand, label: "Refresh" },
  schedule: { icon: Clock, label: "Scheduled" },
  connect: { icon: Plug, label: "First read" },
};

const CODE_WORDS: Record<string, string> = {
  ok: "Done",
  token_expired: "Signed out",
  token_rejected: "Access refused",
  permission_missing: "No access",
  rate_limited: "Slowed by Meta",
  connection_failed: "Meta unreachable",
  interrupted: "Interrupted",
  provider_error: "Meta error",
  bad_request: "Refused",
};

function seconds(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function ago(time: number, now: number) {
  const minutes = Math.round((now - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The current time after mount (null on the server and the first render, so hydration matches), ticking while `on`. */
function useNow(on: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = on ? setInterval(tick, 500) : null;
    return () => {
      clearTimeout(first);
      if (timer) clearInterval(timer);
    };
  }, [on]);
  return now;
}

/** The last read, step by step. While it runs, each step lights up as Convex pushes it. */
export function SyncActivity({ runs }: { runs: SyncRun[] }) {
  const run = runs[0] ?? null;
  const live = run?.status === "running";
  const now = useNow(live);
  if (!run) {
    return (
      <Panel className="grid gap-2 p-4">
        <h3 className="flex items-center gap-2 font-heading text-base text-card-foreground">
          <VistrialMark size="xs" /> What Vistrial did
        </h3>
        <p className="text-sm text-muted-foreground">Each read of your account shows here, step by step.</p>
      </Panel>
    );
  }
  const trigger = TRIGGER_WORDS[run.trigger];
  const took = run.finishedAt ? run.finishedAt - run.startedAt : now ? Math.max(0, now - run.startedAt) : 0;
  const calls = run.callsOk + run.callsFailed;
  return (
    <MotionConfig reducedMotion="user">
      <Panel className="relative grid gap-4 overflow-hidden p-4" aria-live="polite">
        {live ? <BorderBeam duration={7} size={120} borderWidth={1} colorFrom="#9A88FC" colorTo="#6650D8" /> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-heading text-base text-card-foreground">
            {live ? (
              <span aria-hidden className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
              </span>
            ) : (
              <VistrialMark size="xs" />
            )}
            {live ? "Reading your account" : "What Vistrial did"}
          </h3>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            <trigger.icon aria-hidden className="size-3.5" />
            {trigger.label} · {live ? (now ? seconds(took) : "starting") : `${now ? ago(run.startedAt, now) : ""}${now ? " · " : ""}${seconds(took)}`} · {calls} {calls === 1 ? "call" : "calls"}
          </span>
        </div>

        <ol className="relative grid gap-3 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border" aria-label="Steps of the last read">
          {run.steps.map((step) => {
            const words = STEP_WORDS[step.key] ?? { icon: Sparkles, doing: step.key, done: step.key, unit: "rows" };
            const Icon = step.status === "done" ? CheckCircle2 : step.status === "failed" ? XCircle : step.status === "working" ? Loader : words.icon;
            return (
              <motion.li key={step.key} layout className="relative flex min-w-0 gap-3" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}>
                <span
                  className={cn(
                    "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ring-1",
                    step.status === "done" && "bg-success/10 text-success ring-success/25",
                    step.status === "failed" && "bg-destructive/10 text-destructive ring-destructive/25",
                    step.status === "working" && "bg-primary/10 text-primary ring-primary/30",
                    step.status === "waiting" && "bg-muted text-muted-foreground ring-border",
                  )}
                >
                  <Icon aria-hidden className={cn("size-3.5", step.status === "working" && "animate-spin motion-reduce:animate-none")} />
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5 pt-0.5">
                  <p className={cn("text-sm break-words", step.status === "waiting" ? "text-muted-foreground" : "text-card-foreground", step.status === "working" && "text-primary")}>
                    {step.status === "done" || step.status === "failed" ? words.done : words.doing}
                    {step.status === "working" ? "…" : ""}
                  </p>
                  {step.status === "done" || step.status === "failed" ? (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {step.calls} {step.calls === 1 ? "API call" : "API calls"}
                      {step.rows !== undefined && step.key !== "access" ? ` · ${step.rows} ${words.unit}` : ""}
                      {step.ms !== undefined ? ` · ${seconds(step.ms)}` : ""}
                    </p>
                  ) : null}
                </div>
              </motion.li>
            );
          })}
        </ol>

        {runs.length > 1 ? (
          <div className="grid gap-1.5 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Earlier reads</p>
            <ul className="grid gap-1">
              {runs.slice(1, 6).map((row) => {
                const t = TRIGGER_WORDS[row.trigger];
                const ok = row.status === "done";
                return (
                  <li key={row.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <t.icon aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {t.label}
                        {now ? ` · ${ago(row.startedAt, now)}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums">
                      <span className="text-muted-foreground">
                        {row.callsOk + row.callsFailed} calls{row.finishedAt ? ` · ${seconds(row.finishedAt - row.startedAt)}` : ""}
                      </span>
                      <StatusBadge label={CODE_WORDS[row.code ?? (ok ? "ok" : "provider_error")] ?? "Failed"} tone={ok ? "good" : row.status === "running" ? "brand" : "warning"} className="[&_span]:normal-case" />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Panel>
    </MotionConfig>
  );
}

/** A ring showing how far along a count is toward its target. */
function Ring({ value, target, label }: { value: number; target: number; label: string }) {
  const share = Math.min(1, target > 0 ? value / target : 0);
  const radius = 34;
  const length = 2 * Math.PI * radius;
  return (
    <div className="relative size-24 shrink-0" role="img" aria-label={`${label}: ${value} of ${target}`}>
      <svg viewBox="0 0 80 80" className="size-full -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="7" className="stroke-muted" />
        <motion.circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className={share >= 1 ? "stroke-success" : "stroke-primary"}
          strokeDasharray={length}
          initial={{ strokeDashoffset: length }}
          animate={{ strokeDashoffset: length * (1 - share) }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </svg>
      <span className="absolute inset-0 grid place-content-center text-center">
        <span className="font-heading text-lg leading-none text-card-foreground tabular-nums">{value}</span>
        <span className="text-[10px] text-muted-foreground">of {target}</span>
      </span>
    </div>
  );
}

/** Calls per day as stacked bars: successful in the brand hue, failed in the critical hue, with a hover readout. */
function CallBars({ days }: { days: Usage["days"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((row) => row.ok + row.failed));
  const shown = hover !== null ? days[hover] : null;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-primary" /> Successful
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-destructive" /> Failed
          </span>
        </span>
        <span className="tabular-nums" aria-live="polite">
          {shown ? `${shown.day}: ${shown.ok} ok${shown.failed ? `, ${shown.failed} failed` : ""}` : "Last 15 days"}
        </span>
      </div>
      <div className="flex h-24 items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
        {days.map((row, index) => {
          const total = row.ok + row.failed;
          return (
            <button
              key={row.day}
              type="button"
              aria-label={`${row.day}: ${row.ok} successful, ${row.failed} failed`}
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              className={cn("flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40", hover === index && "bg-muted/60")}
            >
              {total === 0 ? (
                <span className="h-[2px] w-full rounded-full bg-border" />
              ) : (
                <motion.span className="flex w-full flex-col gap-[2px]" initial={{ height: 0 }} animate={{ height: `${(total / max) * 100}%` }} transition={{ delay: index * 0.02 }}>
                  {row.failed > 0 ? <span className="w-full rounded-t-[4px] bg-destructive" style={{ flexGrow: row.failed }} /> : null}
                  <span className={cn("w-full bg-primary", row.failed > 0 ? "" : "rounded-t-[4px]")} style={{ flexGrow: row.ok }} />
                </motion.span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{days[0]?.day}</span>
        <span>{days.at(-1)?.day}</span>
      </div>
    </div>
  );
}

/** Marketing API use over Meta's 15-day window, against what its access tier asks for. */
export function ApiUsage({ usage }: { usage: Usage }) {
  const rate = usage.successRate;
  const meetsRate = rate !== null && rate >= usage.target.successRate;
  const meetsCalls = usage.ok >= usage.target.calls;
  return (
    <Panel className="grid gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-heading text-base text-card-foreground">
          <Gauge aria-hidden className="size-4 text-primary" /> Meta API use
        </h3>
        <StatusBadge
          label={meetsCalls && meetsRate ? "Meets Meta's access tier" : "Building toward Meta's access tier"}
          tone={meetsCalls && meetsRate ? "good" : "neutral"}
          className="[&_span]:normal-case"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Ring value={usage.ok} target={usage.target.calls} label={`Successful calls in ${usage.target.days} days`} />
        <div className="grid min-w-0 flex-1 gap-2">
          <p className="text-sm text-card-foreground">
            <span className="tabular-nums">{usage.ok}</span> successful calls in the last {usage.target.days} days
          </p>
          <div className="grid gap-1">
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
              <span>Success rate {rate === null ? "–" : `${Math.round(rate * 100)}%`}</span>
              <span>Meta asks for {Math.round(usage.target.successRate * 100)}%</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={cn("absolute inset-y-0 left-0 rounded-full", meetsRate ? "bg-success" : "bg-warning")}
                initial={{ width: 0 }}
                animate={{ width: `${Math.round((rate ?? 0) * 100)}%` }}
              />
              <span aria-hidden className="absolute inset-y-0 w-px bg-card-foreground/60" style={{ left: `${usage.target.successRate * 100}%` }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Counted from real reads of your account. Vistrial never makes calls just to raise the count.</p>
        </div>
      </div>
      <CallBars days={usage.days} />
    </Panel>
  );
}

const OBSERVATION_ICONS: Record<string, LucideIcon> = {
  share: Coins,
  best: Target,
  spread: TrendingUp,
  noResults: AlertTriangle,
  clickRate: BarChart3,
  idle: MinusCircle,
};

/** What the account's own numbers show, computed in code and labelled as observed first-party evidence. */
export function Observations({ items, onFocus }: { items: Observation[]; onFocus?: (campaignIds: string[]) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-card-foreground">
          <VistrialMark size="xs" /> What the numbers show
        </h3>
        <span className="text-xs text-muted-foreground">Observed in your own results. No outside benchmarks.</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        <AnimatePresence initial>
          {items.map((item, index) => {
            const Icon = OBSERVATION_ICONS[item.kind] ?? Sparkles;
            return (
              <motion.li key={item.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
                <button
                  type="button"
                  disabled={!onFocus || item.campaignIds.length === 0}
                  onClick={() => onFocus?.(item.campaignIds)}
                  className="grid h-full w-full gap-1.5 rounded-xl border border-border bg-background/60 p-3 text-left transition-colors enabled:hover:border-primary/40 disabled:cursor-default"
                >
                  <span className="flex items-start gap-2">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-lg ring-1",
                        item.tone === "good" && "bg-success/10 text-success ring-success/25",
                        item.tone === "warning" && "bg-warning/10 text-warning ring-warning/25",
                        item.tone === "neutral" && "bg-muted text-muted-foreground ring-border",
                      )}
                    >
                      <Icon aria-hidden className="size-3.5" />
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="text-sm font-medium break-words text-card-foreground">{item.title}</span>
                      <span className="text-xs break-words text-muted-foreground">{item.detail}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5 pl-9">
                    <StatusBadge label="Observed" tone="good" className="[&_span]:normal-case" />
                    <StatusBadge label="First-party" tone="brand" className="[&_span]:normal-case" />
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
