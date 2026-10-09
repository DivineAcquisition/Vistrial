"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { setAgentPausedAction } from "@/app/(workspace)/app/agents/actions";
import { AgentGlyph, formatClock, PresenceLabel, toneText } from "@/components/live/agent-identity";
import { useLiveState, usePresence, useRecentlyTouched } from "@/components/live/live-provider";
import { useRunViewer } from "@/components/live/run-viewer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";
import { SECTION_INFO } from "@/lib/config/registry";
import type { ConfigSection } from "@/lib/config/types";
import type { AgentStats } from "@/lib/live/load";
import {
  formatDuration,
  OPEN_RUN_STATUSES,
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  runOneLine,
  type AgentControl,
  type LiveRun,
  type RunStatus,
} from "@/lib/live/model";
import { cn } from "@/lib/utils";

export function AgentsOverview() {
  const presence = usePresence();
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {presence.map((item) => {
        const agent = AGENTS[item.agentId];
        return (
          <li key={item.agentId}>
            <Link
              href={`/app/agents/${item.agentId}`}
              className="flex h-full items-start gap-3 rounded-2xl border border-border bg-card p-4 hover:border-brand-500/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <AgentGlyph agentId={item.agentId} size="lg" working={item.state === "working"} />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium text-card-foreground">{agent.name}</span>
                  <PresenceLabel state={item.state} label={item.stateLabel} />
                </span>
                <span className="block text-sm text-muted-foreground">{agent.role}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.liveLabel ?? item.runSummary}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RunRow({ run }: { run: LiveRun }) {
  const viewer = useRunViewer();
  const touched = useRecentlyTouched(run.id);
  const duration =
    run.startedAt && run.finishedAt ? formatDuration(Date.parse(run.finishedAt) - Date.parse(run.startedAt)) : null;
  return (
    <li className={cn("rounded-lg", touched && "live-highlight")}>
      <button
        type="button"
        onClick={() => viewer.open(run.id)}
        className="flex w-full items-start gap-3 rounded-lg p-2.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-card-foreground">{run.subjectLabel}</span>
          <span className="block truncate text-xs text-muted-foreground">{runOneLine(run)}</span>
        </span>
        <span className="shrink-0 text-right text-xs">
          <span className={cn("block font-medium", toneText(RUN_STATUS_TONE[run.status]))}>{RUN_STATUS_LABEL[run.status]}</span>
          <span className="block text-muted-foreground">
            {formatClock(run.createdAt)}
            {duration ? ` · ${duration}` : ""}
          </span>
        </span>
      </button>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-card-foreground">{value}</p>
    </div>
  );
}

const RESULT_OPTIONS: Array<{ value: RunStatus | ""; label: string }> = [
  { value: "", label: "Any result" },
  { value: "completed", label: RUN_STATUS_LABEL.completed },
  { value: "needs_person", label: RUN_STATUS_LABEL.needs_person },
  { value: "failed", label: RUN_STATUS_LABEL.failed },
  { value: "stuck", label: RUN_STATUS_LABEL.stuck },
  { value: "stopped", label: RUN_STATUS_LABEL.stopped },
  { value: "expired", label: RUN_STATUS_LABEL.expired },
];

export function AgentDetail({
  agentId,
  current,
  history,
  stats,
  control,
  canPause,
  showConfig,
  filter,
}: {
  agentId: LiveAgentId;
  current: LiveRun[];
  history: LiveRun[];
  stats: AgentStats;
  control: AgentControl | null;
  canPause: boolean;
  showConfig: boolean;
  filter: { result: RunStatus | null; from: string; to: string };
}) {
  const agent = AGENTS[agentId];
  const router = useRouter();
  const live = useLiveState();
  const presence = usePresence().find((item) => item.agentId === agentId)!;
  const liveControl = live.controls.get(agentId) ?? control;
  const paused = liveControl?.paused === true;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openRuns = useMemo(() => {
    const byId = new Map(current.map((run) => [run.id, run]));
    for (const run of live.runs.values()) if (run.agentId === agentId) byId.set(run.id, run);
    return [...byId.values()]
      .filter((run) => OPEN_RUN_STATUSES.includes(run.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [agentId, current, live.runs]);

  const historyRows = useMemo(
    () => history.map((run) => live.runs.get(run.id) ?? run).filter((run) => !OPEN_RUN_STATUSES.includes(run.status)),
    [history, live.runs]
  );

  const setPaused = async (next: boolean) => {
    setError(null);
    const result = await setAgentPausedAction(agentId, next);
    if (!result.ok) setError(result.error);
    else router.refresh();
  };

  const applyFilter = (form: FormData) => {
    const params = new URLSearchParams();
    for (const key of ["result", "from", "to"]) {
      const value = String(form.get(key) ?? "");
      if (value) params.set(key, value);
    }
    startTransition(() => router.push(`/app/agents/${agentId}${params.size ? `?${params}` : ""}`));
  };

  return (
    <div className="space-y-6">
      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <AgentGlyph agentId={agentId} size="lg" working={presence.state === "working"} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-card-foreground">{agent.name}</h2>
              <PresenceLabel state={presence.state} label={presence.stateLabel} />
            </div>
            <p className="text-sm text-muted-foreground">{agent.description}</p>
            <p className="text-sm text-card-foreground">{agent.promise}</p>
            {presence.liveLabel ? <p className="live-shimmer-text text-sm">{presence.liveLabel}</p> : null}
            {paused ? (
              <p className="text-sm text-muted-foreground">
                Paused{liveControl?.changedByName ? ` by ${liveControl.changedByName}` : ""}
                {liveControl?.changedAt ? ` · ${formatClock(liveControl.changedAt)}` : ""}. New work waits until it is resumed.
              </p>
            ) : null}
          </div>
          {canPause ? (
            paused ? (
              <ConfirmDialog
                trigger={<Button variant="outline">Resume {agent.name}</Button>}
                title={`Resume ${agent.name}?`}
                description={`${agent.name} picks up waiting work from where it stopped.`}
                confirmLabel={`Resume ${agent.name}`}
                confirmVariant="default"
                onConfirm={() => setPaused(false)}
              />
            ) : (
              <ConfirmDialog
                trigger={<Button variant="outline">Pause {agent.name}</Button>}
                title={`Pause ${agent.name}?`}
                description={`${agent.name} stops starting new work in this workspace. Work in progress pauses at its next step. Nothing is lost.`}
                confirmLabel={`Pause ${agent.name}`}
                onConfirm={() => setPaused(true)}
              />
            )
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Runs today" value={String(stats.runsToday)} />
          <Stat label="Typical time (7 days)" value={stats.averageMs != null ? formatDuration(stats.averageMs) : "Not enough yet"} />
          <Stat label="Needed a person (7 days)" value={stats.needsPersonPercent != null ? `${stats.needsPersonPercent}%` : "Not enough yet"} />
          <Stat label="Stopped today" value={String(stats.failedToday)} />
        </div>
        {showConfig && agent.configSections.length ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Shaped by:</span>
            {agent.configSections.map((section) => (
              <Link
                key={section}
                href={`/app/settings/configuration#section-${section}`}
                className="font-medium text-brand-300 hover:underline"
              >
                {SECTION_INFO[section as ConfigSection]?.label ?? section}
              </Link>
            ))}
          </div>
        ) : null}
      </Card>

      <section aria-labelledby="agent-now" className="space-y-2">
        <h2 id="agent-now" className="font-heading text-base text-card-foreground">
          Working now
        </h2>
        {openRuns.length ? (
          <ul className="rounded-2xl border border-border bg-card p-1">
            {openRuns.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            {paused ? `${agent.name} is paused.` : `${agent.name} has nothing in progress.`}
          </p>
        )}
      </section>

      <section aria-labelledby="agent-history" className="space-y-2">
        <h2 id="agent-history" className="font-heading text-base text-card-foreground">
          History
        </h2>
        <form action={applyFilter} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">
            Result
            <select
              name="result"
              defaultValue={filter.result ?? ""}
              className="mt-1 block h-9 rounded-lg border border-input bg-background px-2 text-sm text-card-foreground"
            >
              {RESULT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            From
            <Input type="date" name="from" defaultValue={filter.from} className="mt-1" />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <Input type="date" name="to" defaultValue={filter.to} className="mt-1" />
          </label>
          <Button type="submit" variant="outline" loading={pending}>
            Filter
          </Button>
        </form>
        {historyRows.length ? (
          <ul className="rounded-2xl border border-border bg-card p-1">
            {historyRows.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            No finished runs match.
          </p>
        )}
      </section>
    </div>
  );
}
