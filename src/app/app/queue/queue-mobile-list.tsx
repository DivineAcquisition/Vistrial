"use client";

import Link from "next/link";
import { useState } from "react";

import { OutcomePanel } from "@/components/app/lead-action-panels";
import { Button } from "@/components/ui/button";
import { formatBreachDuration } from "@/lib/queue/duration";
import { waitingFor } from "@/lib/vocabulary";
import type {
  QueueMemberOption,
  QueueRow,
  TouchChannel,
  TouchDirection,
  TouchOutcome,
} from "@/lib/queue/types";
import { queuePrimaryAction } from "@/lib/queue/worked";
import type { OrgRole } from "@/types/database";

export function QueueMobileList({
  rows,
  now,
  variant,
  members,
  role,
  memberId,
  isPlatformAdmin,
  arrivingIds,
  exitingIds,
  busyLeadId,
  error,
  onInteract,
  onLogOutcome,
}: {
  rows: QueueRow[];
  now: string;
  variant: "alarm" | "queue";
  members: QueueMemberOption[];
  role: OrgRole;
  memberId: string;
  isPlatformAdmin: boolean;
  arrivingIds: Set<string>;
  exitingIds?: Set<string>;
  busyLeadId: string | null;
  error: string | null;
  onInteract: (leadId: string | null) => void;
  onLogOutcome: (input: {
    leadId: string;
    channel: TouchChannel;
    direction: TouchDirection;
    outcome: TouchOutcome;
    note: string;
    actorMemberId: string;
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
          arriving={arrivingIds.has(row.id)}
          exiting={exitingIds?.has(row.id) ?? false}
          busy={busyLeadId === row.id}
          error={busyLeadId === row.id ? error : null}
          onInteract={onInteract}
          onLogOutcome={onLogOutcome}
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
  arriving,
  exiting,
  busy,
  error,
  onInteract,
  onLogOutcome,
}: {
  row: QueueRow;
  now: string;
  variant: "alarm" | "queue";
  members: QueueMemberOption[];
  role: OrgRole;
  memberId: string;
  isPlatformAdmin: boolean;
  arriving: boolean;
  exiting: boolean;
  busy: boolean;
  error: string | null;
  onInteract: (leadId: string | null) => void;
  onLogOutcome: (input: {
    leadId: string;
    channel: TouchChannel;
    direction: TouchDirection;
    outcome: TouchOutcome;
    note: string;
    actorMemberId: string;
  }) => Promise<boolean>;
}) {
  const [logging, setLogging] = useState(false);
  const [hasOpenedCrm, setHasOpenedCrm] = useState(false);
  const [swipe, setSwipe] = useState(0);
  const waiting =
    variant === "alarm"
      ? formatBreachDuration(row.breachSeconds, now)
      : waitingFor(row.optedInAt, now);

  const computed = queuePrimaryAction(row);
  const action =
    computed.kind === "open_crm" && hasOpenedCrm
      ? { kind: "log_outcome" as const }
      : computed;

  function openOutcome() {
    setLogging(true);
    onInteract(row.id);
  }

  function closeOutcome() {
    setLogging(false);
    onInteract(null);
  }

  function runPrimary() {
    if (action.kind === "open_crm") {
      setHasOpenedCrm(true);
      window.open(action.href, "_blank", "noopener,noreferrer");
      return;
    }
    openOutcome();
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
        const start = Number(
          (event.currentTarget as HTMLElement).dataset.touchX ?? 0,
        );
        const x = event.changedTouches[0]?.clientX ?? start;
        setSwipe(Math.max(0, Math.min(72, x - start)));
      }}
      onTouchEnd={() => {
        if (swipe > 64) runPrimary();
        setSwipe(0);
      }}
    >
      <div style={{ transform: swipe ? `translateX(${swipe}px)` : undefined }}>
        <p className="text-base font-semibold break-words text-white">
          <Link href={`/app/cases/${row.id}`}>{row.name}</Link>
        </p>
        <p className="mt-1 text-sm tabular-nums text-silver">{waiting}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {action.kind === "open_crm" ? (
            <Button
              variant="primary"
              size="xl"
              onClick={() => setHasOpenedCrm(true)}
              render={
                <a
                  href={action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              Open in CRM
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="xl"
              disabled={busy}
              onClick={openOutcome}
            >
              What happened
            </Button>
          )}
        </div>
      </div>

      {logging ? (
        <div className="mt-3">
          <OutcomePanel
            row={row}
            members={members}
            role={role}
            memberId={memberId}
            isPlatformAdmin={isPlatformAdmin}
            busy={busy}
            error={error}
            onCancel={closeOutcome}
            onSubmit={async (input) => {
              const ok = await onLogOutcome(input);
              if (ok) closeOutcome();
            }}
          />
        </div>
      ) : null}
    </li>
  );
}
