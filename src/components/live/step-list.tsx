"use client";

import { CheckIcon, CircleDashedIcon, CircleIcon, PauseIcon, SkipForwardIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SourceChips } from "@/components/live/source-chips";
import { formatDuration, type LiveStep, type StepStatus } from "@/lib/live/model";
import { cn } from "@/lib/utils";

const STATUS_TEXT: Record<StepStatus, string> = {
  pending: "Upcoming",
  working: "In progress",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
  waiting: "Waiting",
  paused: "Paused",
};

function StepIcon({ status }: { status: StepStatus }) {
  const base = "size-3.5";
  switch (status) {
    case "done":
      return <CheckIcon className={cn(base, "text-success")} />;
    case "failed":
      return <XIcon className={cn(base, "text-destructive")} />;
    case "skipped":
      return <SkipForwardIcon className={cn(base, "text-muted-foreground")} />;
    case "paused":
      return <PauseIcon className={cn(base, "text-muted-foreground")} />;
    case "working":
    case "waiting":
      return <CircleIcon className={cn(base, "live-pulse fill-current", status === "waiting" ? "text-warning" : "text-brand-400")} />;
    default:
      return <CircleDashedIcon className={cn(base, "text-muted-foreground")} />;
  }
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{formatDuration(now - Date.parse(since))}</>;
}

/**
 * Steps in order: finished ones with durations, the current one highlighted
 * with an honest indeterminate indicator, then upcoming steps when the plan is
 * known. Long lists collapse the middle.
 */
export function StepList({
  steps,
  plan = [],
  showDurations = true,
  maxVisible = 40,
}: {
  steps: LiveStep[];
  plan?: string[];
  showDurations?: boolean;
  maxVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...steps].sort((a, b) => a.seq - b.seq);
  const doneLabels = new Set(sorted.map((step) => step.label.toLowerCase()));
  const upcoming = plan.filter((label) => !doneLabels.has(label.toLowerCase())).slice(Math.max(0, sorted.length - plan.length));
  const hidden = !expanded && sorted.length > maxVisible ? sorted.length - maxVisible : 0;
  const visible = hidden ? [...sorted.slice(0, 3), ...sorted.slice(-(maxVisible - 3))] : sorted;

  if (sorted.length === 0 && plan.length === 0) {
    return <p className="text-sm text-muted-foreground">No steps recorded yet.</p>;
  }

  return (
    <ol className="space-y-1" aria-label="Steps">
      {visible.map((step, index) => (
        <li key={step.id || step.seq} className="live-enter">
          {hidden && index === 3 ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mb-1 w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              Show {hidden} more steps
            </button>
          ) : null}
          <Collapsible>
            <CollapsibleTrigger
              disabled={!step.detail && !step.reason && step.sources.length === 0}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:bg-accent",
                step.status === "working" && "bg-brand-500/8"
              )}
            >
              <StepIcon status={step.status} />
              <span className={cn("min-w-0 flex-1 truncate", step.status === "working" ? "live-shimmer-text font-medium text-card-foreground" : "text-card-foreground")}>
                {step.label}
              </span>
              <span className="sr-only">{STATUS_TEXT[step.status]}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {step.status === "working" ? (
                  <Elapsed since={step.startedAt} />
                ) : showDurations && step.durationMs != null ? (
                  formatDuration(step.durationMs)
                ) : step.status === "waiting" ? (
                  "Waiting"
                ) : null}
              </span>
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <div className="space-y-2 pb-2 pl-8 pr-2 pt-1 text-sm text-muted-foreground">
                {step.detail ? <p>{step.detail}</p> : null}
                {step.reason ? (
                  <p>
                    <span className="font-medium text-card-foreground">Why: </span>
                    {step.reason}
                  </p>
                ) : null}
                {step.sources.length ? <SourceChips sources={step.sources} /> : null}
              </div>
            </CollapsiblePanel>
          </Collapsible>
        </li>
      ))}
      {upcoming.map((label) => (
        <li key={`plan-${label}`} className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
          <CircleDashedIcon className="size-3.5" aria-hidden />
          <span className="truncate">{label}</span>
          <span className="sr-only">Upcoming</span>
        </li>
      ))}
    </ol>
  );
}
