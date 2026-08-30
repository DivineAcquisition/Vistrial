"use client";

import Link from "next/link";
import { useState } from "react";

import { AssignPanel, FollowOnPanel } from "@/components/app/lead-action-panels";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatBreachDuration } from "@/lib/queue/duration";
import { readinessLabel, readinessState, readinessTone, waitingFor } from "@/lib/vocabulary";
import type {
  QueueMemberOption,
  QueueRow,
  TouchChannel,
  TouchDirection,
  TouchOutcome,
} from "@/lib/queue/types";
import type { OrgRole } from "@/types/database";

function alreadyWorked(row: QueueRow): boolean {
  return Boolean(row.firstHumanTouchAt || row.lastTouchAt);
}

function primaryFor(row: QueueRow): { kind: "crm" | "log"; href?: string } {
  if (alreadyWorked(row) || !row.crmUrl) {
    return { kind: "log", href: `/app/log?leadId=${row.id}&from=queue` };
  }
  return { kind: "crm", href: row.crmUrl };
}

export function QueueMobileList({
  rows,
  now,
  variant,
  members,
  role,
  memberId,
  isPlatformAdmin,
  readyThreshold,
  arrivingIds,
  exitingIds,
  busyLeadId,
  error,
  onAssign,
  onComplete,
  onFollowOn,
}: {
  rows: QueueRow[];
  now: string;
  variant: "alarm" | "queue";
  members: QueueMemberOption[];
  role: OrgRole;
  memberId: string;
  isPlatformAdmin: boolean;
  readyThreshold: number;
  arrivingIds: Set<string>;
  exitingIds?: Set<string>;
  busyLeadId: string | null;
  error: string | null;
  onAssign: (input: {
    leadId: string;
    setterId: string | null;
    closerId: string | null;
  }) => Promise<boolean>;
  onComplete: (input: { leadId: string; nextActionId: string }) => Promise<boolean>;
  onFollowOn: (input: {
    leadId: string;
    actionText: string;
    dueAt: string | null;
  }) => Promise<boolean>;
}) {
  return (
    <ul className="divide-y divide-white/[0.06] overflow-x-hidden rounded-2xl border border-white/[0.08]">
      {rows.map((row) => (
        <QueueMobileRow
          key={row.id}
          row={row}
          now={now}
          variant={variant}
          members={members}
          role={role}
          memberId={memberId}
          isPlatformAdmin={isPlatformAdmin}
          readyThreshold={readyThreshold}
          arriving={arrivingIds.has(row.id)}
          exiting={exitingIds?.has(row.id) ?? false}
          busy={busyLeadId === row.id}
          error={busyLeadId === row.id ? error : null}
          onAssign={onAssign}
          onComplete={onComplete}
          onFollowOn={onFollowOn}
        />
      ))}
    </ul>
  );
}

function QueueMobileRow({
  row,
  now,
  variant,
  members,
  role,
  memberId,
  isPlatformAdmin,
  readyThreshold,
  arriving,
  exiting,
  busy,
  error,
  onAssign,
  onComplete,
  onFollowOn,
}: {
  row: QueueRow;
  now: string;
  variant: "alarm" | "queue";
  members: QueueMemberOption[];
  role: OrgRole;
  memberId: string;
  isPlatformAdmin: boolean;
  readyThreshold: number;
  arriving: boolean;
  exiting: boolean;
  busy: boolean;
  error: string | null;
  onAssign: (input: {
    leadId: string;
    setterId: string | null;
    closerId: string | null;
  }) => Promise<boolean>;
  onComplete: (input: { leadId: string; nextActionId: string }) => Promise<boolean>;
  onFollowOn: (input: {
    leadId: string;
    actionText: string;
    dueAt: string | null;
  }) => Promise<boolean>;
}) {
  const [more, setMore] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [followOn, setFollowOn] = useState(false);
  const [swipe, setSwipe] = useState(0);
  const primary = primaryFor(row);
  const state = readinessState(row.score, readyThreshold, row.leadType === "nurture_track");
  const waiting =
    variant === "alarm"
      ? formatBreachDuration(row.breachSeconds, now)
      : waitingFor(row.optedInAt, now);

  function runPrimary() {
    if (!primary.href) return;
    if (primary.kind === "crm") {
      window.open(primary.href, "_blank", "noopener,noreferrer");
      return;
    }
    window.location.href = primary.href;
  }

  return (
    <li
      className={`overflow-x-hidden bg-ink-900 px-4 py-4 ${arriving ? "bg-brand-500/[0.10]" : ""} ${
        exiting ? "opacity-40" : ""
      }`}
      onTouchStart={(event) => {
        const x = event.changedTouches[0]?.clientX ?? 0;
        (event.currentTarget as HTMLElement).dataset.touchX = String(x);
      }}
      onTouchMove={(event) => {
        const start = Number((event.currentTarget as HTMLElement).dataset.touchX ?? 0);
        const x = event.changedTouches[0]?.clientX ?? start;
        setSwipe(Math.max(0, Math.min(72, x - start)));
      }}
      onTouchEnd={() => {
        if (swipe > 64) runPrimary();
        setSwipe(0);
      }}
    >
      <div style={{ transform: swipe ? `translateX(${swipe}px)` : undefined }}>
        <p className="text-base font-semibold break-words text-white">{row.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-silver">
          <StatusBadge label={readinessLabel(state)} tone={readinessTone(state)} />
          <span className="tabular-nums">{waiting}</span>
        </div>
        {row.nextAction && variant === "queue" ? (
          <p className="mt-1 text-xs break-words text-dim">{row.nextAction.actionText}</p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {primary.kind === "crm" && primary.href ? (
            <Button
              variant="primary"
              size="xl"
              render={<a href={primary.href} target="_blank" rel="noopener noreferrer" />}
            >
              Open in CRM
            </Button>
          ) : (
            <Button
              variant="primary"
              size="xl"
              render={<Link href={primary.href ?? "/app/log"} />}
            >
              Log outcome
            </Button>
          )}
          <Button type="button" variant="secondary" size="xl" onClick={() => setMore((open) => !open)}>
            More
          </Button>
        </div>
      </div>

      {more ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" render={<Link href={`/app/cases/${row.id}/brief`} />}>
            Brief
          </Button>
          <Button variant="secondary" size="sm" render={<Link href={`/app/cases/${row.id}`} />}>
            Case file
          </Button>
          {primary.kind === "crm" ? (
            <Button
              variant="secondary"
              size="sm"
              render={<Link href={`/app/log?leadId=${row.id}&from=queue`} />}
            >
              Log outcome
            </Button>
          ) : row.crmUrl ? (
            <Button
              variant="secondary"
              size="sm"
              render={<a href={row.crmUrl} target="_blank" rel="noopener noreferrer" />}
            >
              Open in CRM
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setAssigning((open) => !open)}
          >
            Assign
          </Button>
          {row.nextAction ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                void onComplete({ leadId: row.id, nextActionId: row.nextAction!.id }).then((ok) => {
                  if (ok) setFollowOn(true);
                });
              }}
            >
              Complete action
            </Button>
          ) : null}
        </div>
      ) : null}

      {assigning ? (
        <div className="mt-3">
          <AssignPanel
            row={row}
            members={members}
            role={role}
            memberId={memberId}
            isPlatformAdmin={isPlatformAdmin}
            busy={busy}
            error={error}
            onCancel={() => setAssigning(false)}
            onSubmit={async (input) => {
              const ok = await onAssign(input);
              if (ok) setAssigning(false);
            }}
          />
        </div>
      ) : null}
      {followOn ? (
        <div className="mt-3">
          <FollowOnPanel
            busy={busy}
            error={error}
            onSkip={() => setFollowOn(false)}
            onSubmit={async (input) => {
              const ok = await onFollowOn({ leadId: row.id, ...input });
              if (ok) setFollowOn(false);
            }}
          />
        </div>
      ) : null}
    </li>
  );
}
