"use client";

import { useMemo } from "react";
import { ArrowRightIcon } from "lucide-react";

import { AgentGlyph, formatAgo, toneText } from "@/components/live/agent-identity";
import { useLeadLive, useRecentlyTouched } from "@/components/live/live-provider";
import { AgentRequestCard } from "@/components/live/request-card";
import { useRunViewer } from "@/components/live/run-viewer";
import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";
import { RUN_STATUS_LABEL, RUN_STATUS_TONE, isOpenRequest, liveStepLabel, type LiveRun, type WaitingItem } from "@/lib/live/model";
import { cn } from "@/lib/utils";

const PIPELINE: LiveAgentId[] = ["scribe", "sentry", "relay"];

function latestByAgent(runs: LiveRun[]): Map<LiveAgentId, LiveRun> {
  const out = new Map<LiveAgentId, LiveRun>();
  for (const run of [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!out.has(run.agentId)) out.set(run.agentId, run);
  }
  return out;
}

/**
 * Who has touched this lead, in order: Scribe builds the case file, Sentry
 * watches it, Relay drafts the follow-up. Saved runs merge with live ones.
 */
export function HandoffPipeline({
  leadId,
  initialRuns = [],
  initialWaiting = [],
}: {
  leadId: string;
  initialRuns?: LiveRun[];
  initialWaiting?: WaitingItem[];
}) {
  const live = useLeadLive(leadId);
  const viewer = useRunViewer();
  const runs = useMemo(() => {
    const byId = new Map(initialRuns.map((run) => [run.id, run]));
    for (const run of live.runs) byId.set(run.id, run);
    return [...byId.values()];
  }, [initialRuns, live.runs]);
  const waiting = useMemo(() => {
    const byId = new Map(initialWaiting.filter((item) => isOpenRequest(item.status)).map((item) => [item.id, item]));
    for (const item of live.waiting) byId.set(item.id, item);
    return [...byId.values()].filter((item) => isOpenRequest(item.status));
  }, [initialWaiting, live.waiting]);
  const latest = latestByAgent(runs);

  return (
    <section aria-label="Agent handoffs on this lead" className="space-y-3">
      <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {PIPELINE.map((agentId, index) => {
          const run = latest.get(agentId) ?? null;
          return (
            <li key={agentId} className="flex min-w-0 flex-1 items-stretch gap-2">
              <button
                type="button"
                disabled={!run}
                onClick={() => run && viewer.open(run.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-start gap-2 rounded-lg border border-border p-2 text-left",
                  run ? "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" : "opacity-70"
                )}
              >
                <AgentGlyph agentId={agentId} size="sm" working={run?.status === "working"} />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-card-foreground">{AGENTS[agentId].name}</span>
                  {run ? (
                    <>
                      <span className={cn("block truncate text-xs", toneText(RUN_STATUS_TONE[run.status]))}>
                        {run.status === "working" ? liveStepLabel(agentId, run.currentStepLabel) : RUN_STATUS_LABEL[run.status]}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">{formatAgo(run.lastProgressAt)}</span>
                    </>
                  ) : (
                    <span className="block text-xs text-muted-foreground">Not yet</span>
                  )}
                </span>
              </button>
              {index < PIPELINE.length - 1 ? (
                <ArrowRightIcon aria-hidden className="hidden size-3.5 shrink-0 self-center text-muted-foreground sm:block" />
              ) : null}
            </li>
          );
        })}
      </ol>
      {waiting.map((item) => (
        <AgentRequestCard key={item.id} item={item} compact={item.status !== "approved"} />
      ))}
    </section>
  );
}

/** "Scribe is working on this" on a row or record header, plus a short highlight when it changes. */
export function LeadLiveIndicator({ leadId, className }: { leadId: string; className?: string }) {
  const live = useLeadLive(leadId);
  const touched = useRecentlyTouched(leadId);
  const working = live.runs.find((run) => run.status === "working" || run.status === "queued");
  if (!working && !touched) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1 text-xs text-brand-300", touched && "live-highlight", className)}>
      {working ? (
        <>
          <AgentGlyph agentId={working.agentId} size="xs" working />
          <span>{AGENTS[working.agentId].name} is working on this</span>
        </>
      ) : (
        <span>Just updated</span>
      )}
    </span>
  );
}
