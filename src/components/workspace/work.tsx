"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { MessageSquareTextIcon, PhoneIcon } from "lucide-react";

import { requestDraftAction, setWorkViewAction, snoozeWorkLeadAction, whyFirstAction, type WhyFirst } from "@/app/(workspace)/app/home/workspace-actions";
import { setTaskStatus } from "@/lib/tasks/actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { StatusBadge } from "@/components/ui/status-badge";
import type { WorkData } from "@/lib/workspace/load";
import { dueLabel, TIER_WORD, WORK_COPY, type Tier } from "@/lib/workspace/voice";
import { holdOrder, type DueRow, type TaskRow, type WorkRow } from "@/lib/workspace/work";
import { useNow } from "@/components/workspace/use-now";
import { cn } from "@/lib/utils";

function tierTone(tier: Tier): "brand" | "warning" | "neutral" {
  return tier === "hot" ? "brand" : tier === "warm" ? "warning" : "neutral";
}

/** Holds the on-screen order until the person asks for the new one. */
function useHeld<T>(incoming: T[], key: (row: T) => string): { rows: T[]; waiting: number; accept: () => void } {
  const [shownIds, setShownIds] = useState(() => incoming.map(key));
  const held = useMemo(() => holdOrder(shownIds, incoming, key), [shownIds, incoming, key]);
  return { rows: held.rows, waiting: held.waiting, accept: () => setShownIds(incoming.map(key)) };
}

const dueKey = (row: DueRow) => row.leadId;
const workKey = (row: WorkRow) => row.leadId;

export function DueNowList({ rows }: { rows: DueRow[] }) {
  const now = useNow();
  const held = useHeld(rows, dueKey);
  if (!rows.length && !held.rows.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-card-foreground">{WORK_COPY.dueHeading}</h3>
      {held.waiting ? <NewItems count={held.waiting} onClick={held.accept} /> : null}
      <ul className="flex flex-col gap-2">
        {held.rows.map((row) => (
          <li key={row.leadId} className={cn("rounded-xl border p-3", row.state === "missed" ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-card-foreground">{row.name}</p>
                <p className={cn("text-sm", row.state === "missed" ? "text-destructive" : "text-warning")}>
                  {dueLabel({ kind: row.kind, state: row.state, deadlineAt: row.deadlineAt, now })}
                </p>
                {row.reason ? <p className="text-xs text-muted-foreground">Sentry: {row.reason}</p> : null}
              </div>
              {row.tier ? <StatusBadge label={TIER_WORD[row.tier]} tone={tierTone(row.tier)} /> : null}
            </div>
            <LeadActions leadId={row.leadId} phone={row.phone} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WorkNextList({
  data,
  learning,
  order,
}: {
  data: WorkData;
  learning: boolean;
  order: "best" | "oldest";
}) {
  const held = useHeld(data.workNext, workKey);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState(order);
  const [scope, setScope] = useState(data.scope);
  const chose = useRef(false);
  const { accept } = held;

  // The person changed the order themselves, so the new order is expected.
  useEffect(() => {
    if (!chose.current) return;
    chose.current = false;
    accept();
  }, [data.workNext]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(view: { order?: "best" | "oldest"; scope?: "mine" | "everyone" }) {
    chose.current = true;
    if (view.order) setMode(view.order);
    if (view.scope) setScope(view.scope);
    start(async () => {
      await setWorkViewAction(view);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-card-foreground">{WORK_COPY.nextHeading}</h3>
        <div className="flex flex-wrap items-center gap-1" aria-busy={pending}>
          <Toggle label="Order" value={mode} options={[["best", WORK_COPY.best], ["oldest", WORK_COPY.oldest]]} onChange={(value) => choose({ order: value })} />
          {data.canSeeEveryone ? (
            <Toggle label="Whose leads" value={scope} options={[["mine", WORK_COPY.mine], ["everyone", WORK_COPY.everyone]]} onChange={(value) => choose({ scope: value })} />
          ) : null}
        </div>
      </div>
      {learning ? <p className="text-xs text-muted-foreground">{WORK_COPY.learning}</p> : null}
      {held.waiting ? <NewItems count={held.waiting} onClick={held.accept} /> : null}
      {held.rows.length ? (
        <ol className="flex flex-col gap-2">
          {held.rows.map((row) => (
            <li key={row.leadId} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-card-foreground">
                    <span className="truncate">{row.name}</span>
                    <StatusBadge label={`${TIER_WORD[row.tier]} ${row.score}`} tone={tierTone(row.tier)} />
                  </p>
                  {row.reason ? <p className="mt-0.5 text-sm text-muted-foreground">{row.reason}</p> : null}
                </div>
                <WhyFirstButton leadId={row.leadId} />
              </div>
              <LeadActions leadId={row.leadId} phone={row.phone} snooze />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">{WORK_COPY.empty}</p>
      )}
      <Link href="/app/queue" className="inline-flex min-h-11 items-center self-start text-sm font-medium text-brand-300 hover:underline sm:min-h-0">
        {WORK_COPY.seeAll}
      </Link>
    </div>
  );
}

function Toggle<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border p-0.5">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => value !== key && onChange(key)}
          className={cn(
            "min-h-9 rounded-md px-2.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring sm:min-h-7",
            value === key ? "bg-accent text-card-foreground" : "text-muted-foreground hover:text-card-foreground"
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function NewItems({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" className="self-start" onClick={onClick}>
      {WORK_COPY.newItems(count)}
    </Button>
  );
}

function LeadActions({ leadId, phone, snooze = false }: { leadId: string; phone: string | null; snooze?: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  function askDraft() {
    start(async () => {
      const result = await requestDraftAction(leadId);
      setConfirming(false);
      setNote(result.ok ? result.data.message : result.error);
    });
  }

  function later() {
    start(async () => {
      const result = await snoozeWorkLeadAction(leadId);
      setNote(result.ok ? WORK_COPY.snoozed : result.error);
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 max-sm:[&>*]:min-h-11">
        {phone ? (
          <Button size="sm" variant="outline" render={<a href={`tel:${phone}`} />}>
            <PhoneIcon aria-hidden />
            Call
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)} disabled={pending || confirming}>
          <MessageSquareTextIcon aria-hidden />
          Text draft
        </Button>
        <Button size="sm" variant="ghost" render={<Link href={`/app/cases/${leadId}`} />}>
          Open
        </Button>
        {snooze ? (
          <Button size="sm" variant="ghost" onClick={later} disabled={pending}>
            Snooze
          </Button>
        ) : null}
      </div>
      {confirming ? (
        <div role="group" aria-label="Confirm draft request" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/60 p-2">
          <p className="min-w-0 flex-1 text-sm text-card-foreground">{WORK_COPY.textDraftConfirm}</p>
          <Button size="sm" loading={pending} onClick={askDraft}>
            Ask Relay
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      ) : null}
      {note ? (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function WhyFirstButton({ leadId }: { leadId: string }) {
  const [data, setData] = useState<WhyFirst | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Popover
      onOpenChange={(open) => {
        if (open && !data) {
          void whyFirstAction(leadId).then((result) => (result.ok ? setData(result.data) : setError(result.error)));
        }
      }}
    >
      <PopoverTrigger render={<Button size="xs" variant="ghost" className="text-brand-300" />}>{WORK_COPY.whyFirst}</PopoverTrigger>
      <PopoverPopup className="max-w-xs">
        <PopoverTitle className="text-sm">{WORK_COPY.whyFirst}</PopoverTitle>
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading the reasons.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-card-foreground">
              Assay scores this lead {TIER_WORD[data.tier as Tier] ?? data.tier} {data.score}. Leads that need a reply now always come first.
            </p>
            {data.reasons.length ? (
              <ul className="list-disc space-y-1 ps-4 text-muted-foreground">
                {data.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
            {data.hidden ? <p className="text-xs text-muted-foreground">Some reasons come from calls you cannot open.</p> : null}
          </div>
        )}
      </PopoverPopup>
    </Popover>
  );
}

export function TaskList({ rows }: { rows: TaskRow[] }) {
  const now = useNow(60_000);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const visible = rows.filter((row) => !done.has(row.id));
  if (!visible.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-card-foreground">{WORK_COPY.tasksHeading}</h3>
      <ul className="flex flex-col gap-2">
        {visible.map((row) => {
          const late = Date.parse(row.dueAt) < now && !row.snoozed;
          return (
            <li key={row.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-card-foreground">{row.text}</p>
                <p className="text-xs text-muted-foreground">
                  {WORK_COPY.taskSource[row.source] ?? "Agent"}
                  {row.leadName ? ` · ${row.leadName}` : ""}
                  {" · "}
                  <span className={cn(late && "font-medium text-warning")}>{late ? "Overdue" : "Due today"}</span>
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="max-sm:min-h-11"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const result = await setTaskStatus({ id: row.id, status: "done" });
                    if (result.ok) setDone((set) => new Set(set).add(row.id));
                  })
                }
              >
                Done
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
