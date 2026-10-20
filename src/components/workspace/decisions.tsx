"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlugZapIcon } from "lucide-react";

import { ApprovalQueueList } from "@/app/(workspace)/app/home/approval-queue";
import { setTaskStatus } from "@/lib/tasks/actions";
import { useOrg } from "@/components/app/org-provider";
import { AgentGlyph } from "@/components/live/agent-identity";
import { useLiveState } from "@/components/live/live-provider";
import { AgentRequestCard } from "@/components/live/request-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { AGENTS } from "@/lib/agents/roster";
import type { QueueItemView } from "@/lib/home/views";
import { isOpenRequest, type WaitingItem } from "@/lib/live/model";
import type { DecisionMeta, DecisionsData, SuggestedTask } from "@/lib/workspace/load";
import { checksLine, DECISION_COPY, decisionUrgency, TIER_WORD, WORK_COPY } from "@/lib/workspace/voice";
import { cn } from "@/lib/utils";

const LINGER_MS = 5000;
const GROUP_MIN = 3;

type Shown = { item: WaitingItem; leaving: boolean };

/**
 * Everything waiting on this person, most urgent first. Cards are the shared
 * request card, so a decision here shows on the lead, in the agent panel, and in the run viewer
 * at once through the live channel. Nothing is approved in bulk.
 */
export function DecisionsSection({ data, queue, now }: { data: DecisionsData; queue: QueueItemView[]; now: number }) {
  const org = useOrg();
  const live = useLiveState();
  const [held, setHeld] = useState<Map<string, WaitingItem>>(new Map());
  const seen = useRef<Map<string, WaitingItem>>(new Map());
  const [review, setReview] = useState<{ queue: WaitingItem[]; index: number } | null>(null);

  const open = useMemo(
    () =>
      [...live.waiting.values()]
        .filter((item) => isOpenRequest(item.status))
        .sort((a, b) => urgency(a, data.meta[a.id], now) - urgency(b, data.meta[b.id], now) || a.createdAt.localeCompare(b.createdAt)),
    [live.waiting, data.meta, now]
  );

  // A decided card stays in place a few seconds to show its outcome, then leaves.
  useEffect(() => {
    const ids = new Set(open.map((item) => item.id));
    const gone = [...seen.current.values()].filter((item) => !ids.has(item.id));
    seen.current = new Map(open.map((item) => [item.id, item]));
    if (!gone.length) return;
    setHeld((current) => {
      const next = new Map(current);
      for (const item of gone) next.set(item.id, item);
      return next;
    });
    const timer = window.setTimeout(() => {
      setHeld((current) => {
        const next = new Map(current);
        for (const item of gone) next.delete(item.id);
        return next;
      });
    }, LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const shown: Shown[] = useMemo(() => {
    const rows: Shown[] = open.map((item) => ({ item, leaving: false }));
    for (const item of held.values()) if (!open.some((row) => row.id === item.id)) rows.push({ item, leaving: true });
    return rows;
  }, [open, held]);

  const pendingApprovals = open.filter((item) => item.status === "pending");
  const total = open.length + queue.length + data.suggestedTasks.length + data.reconnect.length;

  if (!data.canDecide && org.workspaceRole !== "operator") {
    const waiting = open.length + queue.length;
    return waiting ? <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">{DECISION_COPY.readOnly(waiting)}</p> : null;
  }

  if (!total && !held.size) {
    return <p className="text-sm text-muted-foreground">{DECISION_COPY.allClear(data.lastDecisionAt, now, org.org.timezone)}</p>;
  }

  const groups = groupByReason(shown);

  return (
    <div className="flex flex-col gap-3">
      {pendingApprovals.length > 1 && data.canDecide ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
          <p className="text-sm text-muted-foreground">Decide each one in turn, full screen.</p>
          <Button size="sm" onClick={() => setReview({ queue: pendingApprovals, index: 0 })}>
            {DECISION_COPY.reviewNext}
          </Button>
        </div>
      ) : null}

      {data.reconnect.map((row) => (
        <article key={row.connector} className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/5 p-3 sm:p-4">
          <PlugZapIcon aria-hidden className="size-5 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-sm text-card-foreground">{DECISION_COPY.reconnect(row.connector)}</p>
          <Button size="sm" render={<Link href={row.href} />}>
            Reconnect
          </Button>
        </article>
      ))}

      {groups.map((group) =>
        group.items.length >= GROUP_MIN ? (
          <div key={group.key} className="flex flex-col gap-2" role="group" aria-label={DECISION_COPY.groupHeading(group.reason, group.items.length)}>
            <h3 className="text-sm font-medium text-card-foreground">{DECISION_COPY.groupHeading(group.reason, group.items.length)}</h3>
            {group.items.map((row) => (
              <DecisionCard key={row.item.id} row={row} meta={data.meta[row.item.id]} now={now} />
            ))}
          </div>
        ) : (
          group.items.map((row) => <DecisionCard key={row.item.id} row={row} meta={data.meta[row.item.id]} now={now} />)
        )
      )}

      {data.suggestedTasks.map((task) => (
        <SuggestedTaskCard key={task.id} task={task} />
      ))}

      {queue.length ? <ApprovalQueueList items={queue} /> : null}

      <ReviewMode
        items={pendingApprovals}
        meta={data.meta}
        now={now}
        queue={review?.queue ?? []}
        index={review?.index ?? null}
        onIndex={(index) => setReview((current) => (index === null || !current ? null : { ...current, index }))}
      />
    </div>
  );
}

function urgency(item: WaitingItem, meta: DecisionMeta | undefined, now: number): number {
  if (meta?.windowEndsAt) return Date.parse(meta.windowEndsAt) - now;
  return Number.MAX_SAFE_INTEGER / 2 + (Date.parse(item.createdAt) || 0);
}

function groupByReason(rows: Shown[]): Array<{ key: string; reason: string; items: Shown[] }> {
  const groups: Array<{ key: string; reason: string; items: Shown[] }> = [];
  const byKey = new Map<string, { key: string; reason: string; items: Shown[] }>();
  for (const row of rows) {
    const reason = row.item.reason?.trim() ?? "";
    const key = reason ? `${row.item.agentId}:${reason.toLowerCase()}` : `single:${row.item.id}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, reason, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(row);
  }
  return groups;
}

function DecisionContext({ item, meta, now }: { item: WaitingItem; meta: DecisionMeta | undefined; now: number }) {
  const agent = item.agentId ? AGENTS[item.agentId] : null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {item.agentId ? <AgentGlyph agentId={item.agentId} size="xs" /> : null}
      {agent ? <span className="font-medium text-card-foreground">{agent.name}</span> : null}
      {meta?.leadName ? (
        <>
          <span aria-hidden>·</span>
          <span className="text-card-foreground">{meta.leadName}</span>
        </>
      ) : null}
      {meta?.tier ? <StatusBadge label={TIER_WORD[meta.tier]} tone={meta.tier === "hot" ? "brand" : meta.tier === "warm" ? "warning" : "neutral"} /> : null}
      <span aria-hidden>·</span>
      <span className={cn(meta?.windowEndsAt && Date.parse(meta.windowEndsAt) - now < 15 * 60_000 && "font-medium text-warning")}>
        {decisionUrgency({ windowEndsAt: meta?.windowEndsAt ?? null, createdAt: item.createdAt, now })}
      </span>
    </p>
  );
}

function DecisionCard({ row, meta, now }: { row: Shown; meta: DecisionMeta | undefined; now: number }) {
  return (
    <div id={`decision-${row.item.id}`} className={cn("scroll-mt-24 transition-opacity", row.leaving && "opacity-70")}>
      <AgentRequestCard
        item={row.item}
        className="max-sm:[&_button]:min-h-11"
        context={<DecisionContext item={row.item} meta={meta} now={now} />}
        checks={meta && meta.checks.kind !== "unknown" ? checksLine(meta.checks) : null}
        leadHref={meta?.leadId ? `/app/cases/${meta.leadId}` : null}
      />
    </div>
  );
}

function SuggestedTaskCard({ task }: { task: SuggestedTask }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const source = WORK_COPY.taskSource[task.source] ?? "Agent";
  function act(status: "open" | "canceled") {
    start(async () => {
      const result = await setTaskStatus({ id: task.id, status, reason: status === "canceled" ? "Dismissed" : undefined });
      setDone(result.ok ? (status === "open" ? "Added to your tasks." : "Dismissed.") : result.error);
    });
  }
  return (
    <article className="rounded-xl border border-border bg-card p-3 sm:p-4" aria-label={`${DECISION_COPY.suggestedTask}: ${task.text}`}>
      <p className="text-xs text-muted-foreground">
        {DECISION_COPY.suggestedTask} from {source}
        {task.leadName ? ` · ${task.leadName}` : ""}
      </p>
      <p className="mt-1 text-sm font-medium text-card-foreground">{task.text}</p>
      {task.because ? <p className="mt-0.5 text-sm text-muted-foreground">{task.because}</p> : null}
      {done ? (
        <p role="status" className="mt-3 text-sm text-card-foreground">
          {done}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2 max-sm:[&_button]:min-h-11">
          <Button size="sm" loading={pending} onClick={() => act("open")}>
            Accept
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => act("canceled")}>
            Dismiss
          </Button>
          {task.leadId ? (
            <Button size="sm" variant="ghost" render={<Link href={`/app/cases/${task.leadId}`} />}>
              Open lead
            </Button>
          ) : null}
        </div>
      )}
    </article>
  );
}

/**
 * One decision at a time, full screen. The person sees each draft in full
 * and decides it; the next one opens after the decision. No bulk approval.
 */
function ReviewMode({
  items,
  meta,
  now,
  queue,
  index,
  onIndex,
}: {
  items: WaitingItem[];
  meta: Record<string, DecisionMeta>;
  now: number;
  /** The decisions open when review started, in order. New ones wait for the next review. */
  queue: WaitingItem[];
  index: number | null;
  onIndex: (index: number | null) => void;
}) {
  const [decided, setDecided] = useState<Set<string>>(new Set());

  const current = index !== null ? queue[index] ?? null : null;
  const stillOpen = current ? items.some((item) => item.id === current.id) : false;

  function next() {
    if (index === null) return;
    const following = queue.findIndex((item, at) => at > index && !decided.has(item.id) && items.some((open) => open.id === item.id));
    onIndex(following >= 0 ? following : null);
  }

  // After a decision, show its outcome briefly, then open the next one.
  const currentDecided = current ? decided.has(current.id) : false;
  useEffect(() => {
    if (!currentDecided) return;
    const timer = window.setTimeout(next, 1500);
    return () => window.clearTimeout(timer);
  }, [currentDecided]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={index !== null} onOpenChange={(open) => (open ? null : onIndex(null))}>
      <DialogPopup className="max-w-2xl sm:max-h-[90svh]" bottomStickOnMobile>
        <div className="flex items-center justify-between gap-3 border-b border-border py-3 ps-4 pe-12">
          <DialogTitle className="text-base">{DECISION_COPY.heading}</DialogTitle>
          {index !== null && queue.length ? (
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {DECISION_COPY.counter(index + 1, queue.length)}
            </span>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {current ? (
            <AgentRequestCard
              key={current.id}
              item={current}
              className="max-sm:[&_button]:min-h-11"
              context={<DecisionContext item={current} meta={meta[current.id]} now={now} />}
              checks={meta[current.id] && meta[current.id].checks.kind !== "unknown" ? checksLine(meta[current.id].checks) : null}
              leadHref={meta[current.id]?.leadId ? `/app/cases/${meta[current.id].leadId}` : null}
              onDecided={() => setDecided((set) => new Set(set).add(current.id))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{DECISION_COPY.allClear(null, now, "UTC")}</p>
          )}
          {current && !stillOpen && !decided.has(current.id) ? (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              Someone else already decided this one.
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border p-3">
          <Button variant="ghost" size="sm" disabled={!index} onClick={() => index && onIndex(index - 1)}>
            <ChevronLeftIcon aria-hidden />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onIndex(null)}>
              {DECISION_COPY.done}
            </Button>
            <Button size="sm" onClick={next} disabled={index === null}>
              Next
              <ChevronRightIcon aria-hidden />
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
