"use client";

import { useState } from "react";
import Link from "next/link";

import { retryFollowUpSend } from "@/app/app/follow-ups/actions";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActivityEvent, ActivityLine } from "@/lib/activity/types";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { Tone } from "@/components/ui/tone";

function resultTone(result: ActivityEvent["result"]): Tone {
  if (result === "failed") return "critical";
  if (result === "running") return "warning";
  return "good";
}

function resultLabel(result: ActivityEvent["result"]): string {
  if (result === "failed") return "failed";
  if (result === "running") return "running";
  return "succeeded";
}

const DETAIL_LABELS: Record<string, string> = {
  total: "Score",
  timeline: "Timeline",
  investmentCapacity: "Investment",
  decisionAuthority: "Authority",
  painSeverity: "Pain",
  reasoning: "Reasoning",
  triggeredBy: "Triggered by",
  channel: "Channel",
  outboundBody: "Sent",
  emailSubject: "Subject",
  callType: "Call",
  durationSeconds: "Duration (s)",
  amountCents: "Amount (cents)",
  paymentType: "Payment",
  fromTrack: "From track",
  toTrack: "To track",
  fromName: "From",
  toName: "To",
  fromStatus: "From status",
  toStatus: "To status",
  note: "Note",
  request: "Request",
  label: "Tool",
  summary: "Summary",
  reason: "Reason",
  section: "Section",
  action: "Action",
  eventType: "Event",
  branch: "Branch",
  writeKind: "Write",
  decision: "Decision",
  recordCount: "Records",
  processed: "Processed",
  jobKind: "Job",
  evaluated: "Evaluated",
  changed: "Changed",
  attemptCount: "Attempts",
};

function detailEntries(event: ActivityEvent): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(event.detail)) {
    if (key === "outboundBody" && typeof value === "string") {
      rows.push(["Sent", value]);
      continue;
    }
    if (value === null || value === undefined || value === "") continue;
    const label = DETAIL_LABELS[key];
    if (!label) continue;
    rows.push([label, String(value)]);
  }
  if (event.resultReason) rows.push(["Why", event.resultReason]);
  return rows;
}

function RetryDispatchButton({
  draftId,
  onRetried,
}: {
  draftId: string;
  onRetried?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void retryFollowUpSend(draftId)
            .then((result) => {
              if (!result.ok) setError(result.error);
              else onRetried?.();
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Retrying…" : "Retry send"}
      </Button>
      {error ? <p className="mt-1 text-xs text-flag-critical">{error}</p> : null}
    </div>
  );
}

export function ActivityWhen({ at, now }: { at: string; now: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time dateTime={at} className="text-xs text-dim whitespace-nowrap">
          {formatRelative(at, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatDateTime(at)}</TooltipContent>
    </Tooltip>
  );
}

export function ActivityEventLine({
  event,
  now,
  showOrg = false,
  defaultOpen = false,
  onRetried,
}: {
  event: ActivityEvent;
  now: string;
  showOrg?: boolean;
  defaultOpen?: boolean;
  onRetried?: () => void;
}) {
  const failed = event.result === "failed";
  const details = detailEntries(event);
  const open = defaultOpen || failed;

  return (
    <article
      className={
        failed
          ? "rounded-xl border border-flag-critical/40 bg-flag-critical/[0.06] px-4 py-3"
          : "rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <StatusBadge label={resultLabel(event.result)} tone={resultTone(event.result)} />
        <p className="min-w-0 flex-1 text-sm text-white">{event.headline}</p>
        <ActivityWhen at={event.occurredAt} now={now} />
      </div>
      <p className="mt-1 text-xs text-silver">
        {event.actorLabel}
        {showOrg && event.orgName ? ` · ${event.orgName}` : null}
        {event.leadName ? (
          <>
            {" · "}
            <Link href={event.href} className="text-brand-300 hover:text-white hover:underline">
              {event.leadName}
            </Link>
          </>
        ) : (
          <>
            {" · "}
            <Link href={event.href} className="text-brand-300 hover:text-white hover:underline">
              Open record
            </Link>
          </>
        )}
      </p>
      {details.length > 0 || event.retryable ? (
        <details className="mt-2" open={open || undefined}>
          <summary className="cursor-pointer text-xs text-dim">Detail</summary>
          <dl className="mt-2 grid gap-1 text-xs text-silver">
            {details.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <dt className="text-dim">{label}</dt>
                <dd className="whitespace-pre-wrap text-white">{value}</dd>
              </div>
            ))}
          </dl>
          {event.retryable && event.retryId ? (
            <RetryDispatchButton draftId={event.retryId} onRetried={onRetried} />
          ) : null}
        </details>
      ) : null}
    </article>
  );
}

export function ActivityLineView({
  line,
  now,
  showOrg = false,
  onRetried,
}: {
  line: ActivityLine;
  now: string;
  showOrg?: boolean;
  onRetried?: () => void;
}) {
  if (line.type === "single") {
    return (
      <ActivityEventLine event={line.event} now={now} showOrg={showOrg} onRetried={onRetried} />
    );
  }

  return (
    <details className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <summary className="cursor-pointer">
        <span className="text-sm text-white">{line.headline}</span>
        <span className="ml-3 text-xs text-dim">{formatRelative(line.occurredAt, now)}</span>
      </summary>
      <ol className="mt-3 space-y-2">
        {line.events.map((item) => (
          <li key={item.id}>
            <ActivityEventLine event={item} now={now} showOrg={showOrg} onRetried={onRetried} />
          </li>
        ))}
      </ol>
    </details>
  );
}
