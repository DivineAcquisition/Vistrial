"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDownIcon, PauseIcon, PlayIcon } from "lucide-react";

import { loadEarlierRunsAction } from "@/app/(workspace)/app/home/workspace-actions";
import { AgentGlyph, formatClock } from "@/components/live/agent-identity";
import { useLiveState } from "@/components/live/live-provider";
import { useRunViewer } from "@/components/live/run-viewer";
import { Button } from "@/components/ui/button";
import type { LiveAgentId } from "@/lib/agents/roster";
import type { LiveRun } from "@/lib/live/model";
import type { TierMove } from "@/lib/workspace/load";
import { burstLine, STREAM_COPY, streamLine, tierMoveLine } from "@/lib/workspace/voice";
import { useNow } from "@/components/workspace/use-now";
import { cn } from "@/lib/utils";

const CAP = 40;
const BURST_MIN = 4;
const BURST_WINDOW_MS = 10 * 60_000;

type Item =
  | { kind: "run"; id: string; at: string; agentId: LiveAgentId; run: LiveRun }
  | { kind: "burst"; id: string; at: string; agentId: LiveAgentId; runs: LiveRun[] }
  | { kind: "tier"; id: string; at: string; agentId: "assay"; move: TierMove };

function at(run: LiveRun): string {
  return run.finishedAt ?? run.lastProgressAt ?? run.createdAt;
}

/** Newest first. Several finished items from one agent close together become one line. */
export function buildStream(runs: LiveRun[], moves: TierMove[]): Item[] {
  const rows: Item[] = [
    ...runs.map((run): Item => ({ kind: "run", id: run.id, at: at(run), agentId: run.agentId, run })),
    ...moves.map((move): Item => ({ kind: "tier", id: `tier:${move.id}`, at: move.at, agentId: "assay", move })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const out: Item[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (row.kind === "run" && row.run.status === "completed" && last) {
      const lastRuns = last.kind === "burst" ? last.runs : last.kind === "run" && last.run.status === "completed" ? [last.run] : null;
      if (lastRuns && last.agentId === row.agentId && Date.parse(lastRuns[0].finishedAt ?? last.at) - Date.parse(row.at) < BURST_WINDOW_MS) {
        out[out.length - 1] = { kind: "burst", id: `burst:${lastRuns[0].id}`, at: last.at, agentId: row.agentId, runs: [...lastRuns, row.run] };
        continue;
      }
    }
    out.push(row);
  }
  // Bursts below the threshold read better as separate lines.
  return out.flatMap((item) =>
    item.kind === "burst" && item.runs.length < BURST_MIN
      ? item.runs.map((run): Item => ({ kind: "run", id: run.id, at: at(run), agentId: run.agentId, run }))
      : [item]
  );
}

function groupLabel(iso: string, now: number): "Now" | "Earlier today" | "Yesterday" | "Earlier" {
  const time = Date.parse(iso);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (time >= now - 15 * 60_000) return "Now";
  if (time >= start.getTime()) return "Earlier today";
  if (time >= start.getTime() - 86_400_000) return "Yesterday";
  return "Earlier";
}

export function LiveStream({ moves }: { moves: TierMove[] }) {
  const live = useLiveState();
  const now = useNow(60_000);
  const [paused, setPaused] = useState(false);
  const [away, setAway] = useState(false);
  const [frozen, setFrozen] = useState<Item[] | null>(null);
  const [earlier, setEarlier] = useState<LiveRun[]>([]);
  const [noMore, setNoMore] = useState(false);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLSpanElement | null>(null);

  const items = useMemo(() => {
    const runs = new Map<string, LiveRun>();
    for (const run of earlier) runs.set(run.id, run);
    for (const run of live.runs.values()) runs.set(run.id, run);
    return buildStream([...runs.values()], moves);
  }, [live.runs, earlier, moves]);
  const latest = useRef(items);
  useEffect(() => {
    latest.current = items;
  }, [items]);

  // Scrolled away from the top: hold what is on screen so nothing moves under the reader.
  useEffect(() => {
    const node = topRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      const gone = !entry.isIntersecting;
      setAway(gone);
      setFrozen((current) => (gone ? (current ?? latest.current) : null));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function togglePause() {
    const next = !paused;
    setPaused(next);
    setFrozen(next ? items : away ? items : null);
  }

  const holding = (paused || away) && frozen !== null;
  const visible = (holding ? frozen! : items).slice(0, CAP + earlier.length);
  const fresh = holding ? items.filter((item) => !frozen!.some((old) => old.id === item.id)).length : 0;

  function loadEarlier() {
    const oldest = visible[visible.length - 1]?.at ?? new Date().toISOString();
    start(async () => {
      const result = await loadEarlierRunsAction(oldest);
      if (!result.ok || !result.data.length) {
        setNoMore(true);
        return;
      }
      setEarlier((current) => [...current, ...result.data]);
    });
  }

  const groups: Array<{ label: string; items: Item[] }> = [];
  for (const item of visible) {
    const label = groupLabel(item.at, now);
    const group = groups[groups.length - 1];
    if (group && group.label === label) group.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div ref={listRef} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StreamConnection />
        <Button size="xs" variant="ghost" aria-pressed={paused} onClick={togglePause}>
          {paused ? <PlayIcon aria-hidden /> : <PauseIcon aria-hidden />}
          {paused ? STREAM_COPY.resume : STREAM_COPY.pause}
        </Button>
      </div>
      <span ref={topRef} aria-hidden className="block h-px" />
      {fresh ? (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => {
            setPaused(false);
            setFrozen(null);
            listRef.current?.scrollIntoView({ block: "start" });
          }}
        >
          {STREAM_COPY.newItems(fresh)}
        </Button>
      ) : null}
      {paused ? <p className="text-xs text-muted-foreground">{STREAM_COPY.paused}</p> : null}
      {groups.length ? (
        groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</h3>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <StreamRow key={item.id} item={item} />
              ))}
            </ul>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">{STREAM_COPY.empty}</p>
      )}
      {visible.length >= 10 && !noMore ? (
        <Button size="sm" variant="ghost" className="self-start" loading={pending} onClick={loadEarlier}>
          {STREAM_COPY.more}
        </Button>
      ) : null}
    </div>
  );
}

function StreamConnection() {
  const { connection } = useLiveState();
  if (connection === "live" || connection === "connecting") return <span />;
  return (
    <p role="status" className="text-xs text-muted-foreground">
      {connection === "lost" ? STREAM_COPY.lost : STREAM_COPY.reconnecting}
    </p>
  );
}

function StreamRow({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const viewer = useRunViewer();
  const live = useLiveState();
  const fresh = item.kind === "run" && live.touched.has(item.run.id);
  const text =
    item.kind === "tier"
      ? tierMoveLine({ name: item.move.name, tier: item.move.tier })
      : item.kind === "burst"
        ? burstLine(item.agentId, item.runs.length)
        : streamLine({ agentId: item.run.agentId, status: item.run.status, subject: item.run.subjectLabel, reason: item.run.reasonSummary, plainError: item.run.plainError });
  const expandable = item.kind !== "tier";
  return (
    <li className={cn("rounded-md", fresh && "live-highlight")}>
      <button
        type="button"
        disabled={!expandable}
        aria-expanded={expandable ? open : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-start gap-2 rounded-md p-1.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent sm:min-h-0"
      >
        <AgentGlyph agentId={item.agentId} size="xs" />
        <span className="min-w-0 flex-1 text-sm text-card-foreground">{text}</span>
        <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground">
          {formatClock(item.at)}
        </time>
        {expandable ? <ChevronDownIcon aria-hidden className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} /> : null}
      </button>
      {open && item.kind === "run" ? (
        <div className="ms-7 flex flex-col gap-1 border-l border-border py-1 ps-3 text-xs text-muted-foreground">
          {item.run.plan.length ? (
            <ol className="list-decimal space-y-0.5 ps-4">
              {item.run.plan.slice(0, 8).map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ol>
          ) : null}
          {item.run.reasonSummary ? <p>{item.run.reasonSummary}</p> : null}
          <button type="button" className="self-start font-medium text-brand-300 hover:underline focus-visible:ring-2 focus-visible:ring-ring" onClick={() => viewer.open(item.run.id)}>
            {STREAM_COPY.viewRun}
          </button>
        </div>
      ) : null}
      {open && item.kind === "burst" ? (
        <ul className="ms-7 flex flex-col gap-0.5 border-l border-border py-1 ps-3 text-xs">
          {item.runs.map((run) => (
            <li key={run.id}>
              <button type="button" className="text-left text-muted-foreground hover:text-card-foreground hover:underline" onClick={() => viewer.open(run.id)}>
                {streamLine({ agentId: run.agentId, status: run.status, subject: run.subjectLabel, reason: run.reasonSummary, plainError: run.plainError })}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
