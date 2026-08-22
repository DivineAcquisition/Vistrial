"use client";

import { useState } from "react";

import { AssignPanel, FollowOnPanel, OutcomePanel } from "@/components/app/lead-action-panels";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatBreachDuration, formatQueueDuration, formatQueueUntil } from "@/lib/queue/duration";
import {
  SCORE_CONFIDENCE_LABELS,
  type QueueMemberOption,
  type QueueRow,
  type TouchChannel,
  type TouchDirection,
  type TouchOutcome,
} from "@/lib/queue/types";
import { cn } from "@/lib/utils";
import { btnPrimary, btnSecondary, btnSizeSm } from "@/lib/ui";
import type { OrgRole } from "@/types/database";

type Panel = "outcome" | "assign" | "followOn" | null;

export function QueueLeadRow({
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
  colSpan,
  onInteract,
  onLogOutcome,
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
  arriving?: boolean;
  exiting?: boolean;
  busy?: boolean;
  error?: string | null;
  colSpan: number;
  onInteract: (leadId: string | null) => void;
  onLogOutcome: (input: {
    leadId: string;
    channel: TouchChannel;
    direction: TouchDirection;
    outcome: TouchOutcome;
    note: string;
    actorMemberId: string;
  }) => Promise<boolean>;
  onAssign: (input: {
    leadId: string;
    setterId: string | null;
    closerId: string | null;
  }) => Promise<boolean>;
  onComplete: (input: { leadId: string; nextActionId: string }) => Promise<boolean>;
  onFollowOn: (input: { leadId: string; actionText: string; dueAt: string | null }) => Promise<boolean>;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  function openPanel(next: Panel) {
    setPanel(next);
    onInteract(next ? row.id : null);
  }

  function closePanel() {
    setPanel(null);
    onInteract(null);
  }

  const trackLabel =
    row.leadType === "ready_track" ? "Ready" : row.leadType === "nurture_track" ? "Nurture" : null;

  return (
    <>
      <TableRow
        className={cn(
          "border-border/60 align-top",
          arriving ? "bg-brand-500/[0.10]" : "hover:bg-white/[0.02]",
          exiting ? "opacity-40 transition-opacity duration-700" : "transition-opacity duration-300"
        )}
      >
        <TableCell className="px-4 py-3.5 font-medium whitespace-normal text-white">
          <span className="block">{row.name}</span>
          {exiting ? <span className="mt-1 block text-xs text-dim">Leaving the alarm — touched</span> : null}
        </TableCell>
        {variant === "alarm" ? (
          <TableCell className="px-4 py-3.5 text-flag-critical tabular-nums">
            {formatBreachDuration(row.breachSeconds, now)}
          </TableCell>
        ) : null}
        <TableCell className="px-4 py-3.5 whitespace-normal">
          {row.score === null ? (
            <StatusBadge label="Unscored" tone="warning" />
          ) : (
            <button
              type="button"
              className="text-left"
              onClick={() => setReasoningOpen((open) => !open)}
              aria-expanded={reasoningOpen}
            >
              <span className="font-medium text-white tabular-nums">{row.score}</span>
              {trackLabel ? (
                <span className="ml-2">
                  <StatusBadge
                    label={trackLabel}
                    tone={row.leadType === "ready_track" ? "brand" : "neutral"}
                  />
                </span>
              ) : null}
              <span className="mt-1 block text-[11px] text-brand-300">Why this score</span>
            </button>
          )}
        </TableCell>
        <TableCell className="px-4 py-3.5 text-silver whitespace-normal">
          {row.score === null ? (
            <span className="text-dim">—</span>
          ) : (
            <span>
              {row.knownFactorCount} of 4
              {row.scoreConfidence ? ` · ${SCORE_CONFIDENCE_LABELS[row.scoreConfidence]}` : ""}
            </span>
          )}
        </TableCell>
        <TableCell className="px-4 py-3.5 text-silver">{row.source || "—"}</TableCell>
        <TableCell className="px-4 py-3.5 text-silver tabular-nums">
          {formatQueueDuration(row.optedInAt, now)}
        </TableCell>
        <TableCell className="px-4 py-3.5 text-silver tabular-nums">
          {formatQueueDuration(row.lastTouchAt, now)}
        </TableCell>
        <TableCell className="px-4 py-3.5 text-silver whitespace-normal">
          {row.assignedSetterName || "—"}
        </TableCell>
        <TableCell className="px-4 py-3.5 text-silver whitespace-normal">
          {row.assignedCloserName || "—"}
        </TableCell>
        {variant === "queue" ? (
          <TableCell className="px-4 py-3.5 text-silver whitespace-normal">
            {row.nextAction ? (
              <span>
                <span className="text-white">{row.nextAction.actionText}</span>
                {row.nextAction.overdue ? (
                  <span className="mt-1 block text-[11px] text-flag-critical">Overdue</span>
                ) : row.nextAction.dueAt ? (
                  <span className="mt-1 block text-[11px] text-dim">
                    Due {formatQueueUntil(row.nextAction.dueAt, now)}
                  </span>
                ) : null}
              </span>
            ) : (
              "—"
            )}
          </TableCell>
        ) : null}
        <TableCell className="px-4 py-3.5">
          <div className="flex flex-wrap gap-2">
            {row.crmUrl ? (
              <a
                href={row.crmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btnPrimary} ${btnSizeSm}`}
              >
                Open in CRM
              </a>
            ) : null}
            <a href={`/app/cases/${row.id}/brief`} className={`${btnSecondary} ${btnSizeSm}`}>
              Brief
            </a>
            <a href={`/app/cases/${row.id}`} className={`${btnSecondary} ${btnSizeSm}`}>
              Case file
            </a>
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeSm}`}
              disabled={busy}
              onClick={() => openPanel(panel === "outcome" ? null : "outcome")}
            >
              Log outcome
            </button>
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeSm}`}
              disabled={busy}
              onClick={() => openPanel(panel === "assign" ? null : "assign")}
            >
              Assign
            </button>
            {row.nextAction ? (
              <button
                type="button"
                className={`${btnSecondary} ${btnSizeSm}`}
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    const ok = await onComplete({
                      leadId: row.id,
                      nextActionId: row.nextAction!.id,
                    });
                    if (ok) openPanel("followOn");
                  })();
                }}
              >
                Complete action
              </button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
      {reasoningOpen ? (
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableCell colSpan={colSpan} className="px-4 py-3 whitespace-normal text-sm text-silver">
            {row.scoreReasoning || "No reasoning was stored for this score."}
          </TableCell>
        </TableRow>
      ) : null}
      {panel === "outcome" ? (
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableCell colSpan={colSpan} className="p-4 whitespace-normal">
            <OutcomePanel
              row={row}
              members={members}
              role={role}
              memberId={memberId}
              isPlatformAdmin={isPlatformAdmin}
              busy={busy}
              error={error}
              onCancel={closePanel}
              onSubmit={async (input) => {
                const ok = await onLogOutcome(input);
                if (ok) closePanel();
              }}
            />
          </TableCell>
        </TableRow>
      ) : null}
      {panel === "assign" ? (
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableCell colSpan={colSpan} className="p-4 whitespace-normal">
            <AssignPanel
              row={row}
              members={members}
              role={role}
              memberId={memberId}
              isPlatformAdmin={isPlatformAdmin}
              busy={busy}
              error={error}
              onCancel={closePanel}
              onSubmit={async (input) => {
                const ok = await onAssign(input);
                if (ok) closePanel();
              }}
            />
          </TableCell>
        </TableRow>
      ) : null}
      {panel === "followOn" ? (
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableCell colSpan={colSpan} className="p-4 whitespace-normal">
            <FollowOnPanel
              busy={busy}
              error={error}
              onSkip={closePanel}
              onSubmit={async (input) => {
                const ok = await onFollowOn({ leadId: row.id, ...input });
                if (ok) closePanel();
              }}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
