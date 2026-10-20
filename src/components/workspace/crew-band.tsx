"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ShieldCheckIcon } from "lucide-react";

import { setAgentPausedAction } from "@/app/(workspace)/app/agents/actions";
import { useOrg } from "@/components/app/org-provider";
import { AgentGlyph, PresenceLabel } from "@/components/live/agent-identity";
import { useAgentPanel } from "@/components/live/agent-panel";
import { useLiveState, usePresence } from "@/components/live/live-provider";
import { useRunViewer } from "@/components/live/run-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-media-query";
import { AGENTS, LIVE_AGENT_IDS, type LiveAgentId } from "@/lib/agents/roster";
import { isOpenRequest, type AgentPresence } from "@/lib/live/model";
import type { CrewServerFacts } from "@/lib/workspace/load";
import { capCount, crewLine, crewStateWord, operatorAgentLine, trustLine } from "@/lib/workspace/voice";
import { cn } from "@/lib/utils";

/**
 * The five agents, alive. State comes from the live record (never invented);
 * each card's sentence comes from the voice templates and real counts.
 */
export function CrewBand({ facts, now }: { facts: CrewServerFacts; now: number }) {
  const org = useOrg();
  const presence = usePresence();
  const state = useLiveState();
  const mobile = useIsMobile();

  const relay = useMemo(() => {
    let waiting = 0;
    let readyToSend = 0;
    for (const item of state.waiting.values()) {
      if (item.agentId !== "relay" || !isOpenRequest(item.status)) continue;
      if (item.status === "approved") readyToSend += 1;
      else waiting += 1;
    }
    return { waiting, readyToSend };
  }, [state.waiting]);

  const byId = new Map(presence.map((item) => [item.agentId, item]));
  const order: LiveAgentId[] = ["sentry", "scribe", "relay", "assay", "compass"];
  const canResume = org.workspaceRole === "owner" || org.isStaff;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 className="sr-only">Your agents</h2>
      <ul
        aria-label="Your agents"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        {order.filter((id) => LIVE_AGENT_IDS.includes(id)).map((agentId) => {
          const item = byId.get(agentId);
          if (!item) return null;
          const run = item.currentRunId ? state.runs.get(item.currentRunId) ?? null : null;
          const line = crewLine(
            agentId,
            {
              state: item.state,
              stepLabel: run?.currentStepLabel ?? null,
              subject: run?.subjectLabel ?? null,
              pausedBy: item.pausedBy,
              pausedAt: item.pausedAt,
              plainError: run?.plainError ?? null,
            },
            { ...facts, relay, assay: { ...facts.assay, paused: item.state === "paused" } },
            now,
            org.org.timezone
          );
          return (
            <li key={agentId} className="snap-start">
              <CrewCard presence={item} line={line} mobile={mobile} canResume={canResume} />
            </li>
          );
        })}
      </ul>
      <TrustLine labels={facts.trustAutoRun} />
    </div>
  );
}

function CrewCard({ presence, line, mobile, canResume }: { presence: AgentPresence; line: string; mobile: boolean; canResume: boolean }) {
  const agent = AGENTS[presence.agentId];
  const panel = useAgentPanel();
  const viewer = useRunViewer();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const needsYou = presence.waitingCount > 0 || presence.state === "attention" || presence.state === "stopped";

  function openAgent() {
    if (mobile) return panel.open(presence.agentId);
    if (presence.state === "working" && presence.currentRunId) return viewer.open(presence.currentRunId);
    router.push(`/app/agents/${presence.agentId}`);
  }

  function resume() {
    setError(null);
    start(async () => {
      const result = await setAgentPausedAction(presence.agentId, false);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div
      className={cn(
        "relative flex h-full w-44 shrink-0 flex-col gap-1.5 rounded-xl border bg-card p-3 sm:w-56 lg:w-full",
        needsYou ? "border-warning/50 bg-warning/5" : "border-border"
      )}
    >
      <button
        type="button"
        onClick={openAgent}
        aria-label={`${agent.name}, ${agent.sublabel}. ${presence.stateLabel}. ${line}${presence.waitingCount ? ` ${presence.waitingCount} waiting on you.` : ""}`}
        className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="pointer-events-none flex items-center gap-2">
        <AgentGlyph agentId={presence.agentId} size="md" working={presence.state === "working"} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-card-foreground">{agent.name}</p>
          <p className="truncate text-xs text-muted-foreground">{agent.sublabel}</p>
        </div>
        {presence.waitingCount ? (
          <Badge size="sm" variant="warning" aria-hidden>
            {capCount(presence.waitingCount)}
          </Badge>
        ) : null}
      </div>
      <PresenceLabel state={presence.state} label={crewStateWord(presence.state)} className="pointer-events-none" />
      <p className={cn("pointer-events-none text-xs leading-snug text-card-foreground max-sm:line-clamp-2", presence.state === "working" && "live-shimmer-text")}>
        {line}
      </p>
      {presence.state === "paused" && canResume ? (
        <Button size="xs" variant="outline" className="relative z-10 mt-1 self-start" loading={pending} onClick={resume}>
          Resume
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="relative z-10 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TrustLine({ labels }: { labels: string[] }) {
  return (
    <Link
      href="/app/agents/autonomy"
      className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-md text-xs text-muted-foreground hover:text-card-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
    >
      <ShieldCheckIcon aria-hidden className="size-3.5 shrink-0" />
      {trustLine(labels)}
    </Link>
  );
}

/** Operators get one slim line instead of the full band. */
export function OperatorAgentLine() {
  const state = useLiveState();
  const panel = useAgentPanel();
  const suggestions = [...state.waiting.values()].filter((item) => isOpenRequest(item.status)).length;
  return (
    <button
      type="button"
      onClick={() => panel.open()}
      className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm text-card-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex -space-x-1" aria-hidden>
        {(["sentry", "scribe", "relay", "assay"] as const).map((id) => (
          <AgentGlyph key={id} agentId={id} size="xs" />
        ))}
      </span>
      <span className="min-w-0 flex-1">{operatorAgentLine(suggestions)}</span>
    </button>
  );
}
