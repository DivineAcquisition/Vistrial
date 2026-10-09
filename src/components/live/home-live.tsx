"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";

import { fetchAwaySummary } from "@/app/(workspace)/app/agents/actions";
import { useAgentPanel } from "@/components/live/agent-panel";
import { AgentGlyph, formatAgo, formatClock, PresenceLabel } from "@/components/live/agent-identity";
import { useLiveMeta, useLiveState, usePresence } from "@/components/live/live-provider";
import { useRunViewer } from "@/components/live/run-viewer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AGENTS } from "@/lib/agents/roster";
import type { AwaySummary } from "@/lib/live/load";
import { collapseBurst, type LiveEvent } from "@/lib/live/model";
import { cn } from "@/lib/utils";

const LAST_VISIT_KEY = "vistrial:last-home-visit";
const AWAY_MIN_MS = 30 * 60 * 1000;

/** What the agents did since this person last opened Home, counted from saved runs. */
function AwaySummaryCard() {
  const [summary, setSummary] = useState<AwaySummary | null>(null);
  const { orgId } = useLiveMeta();

  useEffect(() => {
    const key = `${LAST_VISIT_KEY}:${orgId ?? "none"}`;
    const previous = window.localStorage.getItem(key);
    window.localStorage.setItem(key, new Date().toISOString());
    if (!previous || Date.now() - Date.parse(previous) < AWAY_MIN_MS) return;
    let cancelled = false;
    void fetchAwaySummary(previous).then((result) => {
      if (!cancelled && result.ok && result.data.lines.length) setSummary(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!summary) return null;
  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 p-3">
      <p className="text-xs text-muted-foreground">While you were away (since {formatClock(summary.since)})</p>
      <ul className="mt-2 space-y-1">
        {summary.lines.map((line) => (
          <li key={line.text}>
            <Link href={line.href} className="inline-flex items-center gap-2 text-sm text-card-foreground hover:underline">
              <AgentGlyph agentId={line.agentId} size="xs" />
              {line.text}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A short live line of recent agent events. Pausable; calm mode stops the motion. */
function LiveTicker() {
  const state = useLiveState();
  const viewer = useRunViewer();
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<LiveEvent[] | null>(null);
  const latest = useMemo(() => collapseBurst(state.events, 6), [state.events]);
  const shown = paused && frozen ? frozen : latest;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Live</p>
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={paused}
          onClick={() => {
            setFrozen(paused ? null : latest);
            setPaused((value) => !value);
          }}
        >
          {paused ? <PlayIcon aria-hidden className="size-3" /> : <PauseIcon aria-hidden className="size-3" />}
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>
      {shown.length ? (
        <ul className="space-y-0.5" aria-live="off">
          {shown.map((event) => (
            <li key={event.id} className={cn(!paused && "live-enter")}>
              <button
                type="button"
                onClick={() => viewer.open(event.runId)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AgentGlyph agentId={event.agentId} size="xs" />
                <span className="min-w-0 flex-1 truncate text-card-foreground">{event.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatAgo(event.occurredAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Quiet right now. New agent work shows up here as it happens.</p>
      )}
    </div>
  );
}

export function HomeLiveBand() {
  const presence = usePresence();
  const panel = useAgentPanel();
  const { available } = useLiveMeta();
  if (!available) return null;
  return (
    <section aria-labelledby="home-agents" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-agents" className="font-heading text-base text-card-foreground">
          Your agents
        </h2>
        <button type="button" onClick={panel.open} className="text-sm font-medium text-brand-300 underline-offset-4 hover:underline">
          Open panel
        </button>
      </div>
      <AwaySummaryCard />
      <Card className="gap-4 p-4">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {presence.map((item) => (
            <li key={item.agentId}>
              <Link
                href={`/app/agents/${item.agentId}`}
                className="flex items-start gap-2 rounded-lg p-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <AgentGlyph agentId={item.agentId} working={item.state === "working"} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-card-foreground">{AGENTS[item.agentId].name}</span>
                    <PresenceLabel state={item.state} label={item.stateLabel} />
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{item.liveLabel ?? item.runSummary}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <LiveTicker />
      </Card>
    </section>
  );
}
