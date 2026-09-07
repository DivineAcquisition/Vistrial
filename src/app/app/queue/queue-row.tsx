"use client";

import { useState } from "react";

import { OutcomePanel } from "@/components/app/lead-action-panels";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatBreachDuration } from "@/lib/queue/duration";
import {
  type QueueMemberOption,
  type QueueRow,
  type TouchChannel,
  type TouchDirection,
  type TouchOutcome,
} from "@/lib/queue/types";
import { queuePrimaryAction } from "@/lib/queue/worked";
import { waitingFor } from "@/lib/vocabulary";
import { cn } from "@/lib/utils";
import type { OrgRole } from "@/types/database";

/**
 * Exactly one primary action per row (Prompt 7, Part 4). No secondary menu:
 * once "Assign," "Why this order," and "Mark next step done" are gone, a
 * context menu whose only remaining item duplicates the name link is not a
 * second control, it is the first one back.
 */
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
}) {
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  // Opening the CRM link does not, by itself, change anything the database
  // knows about this lead — first_human_touch_at only moves once an outcome
  // is logged. Without this local flag the button would never leave "Open in
  // CRM," and there would be no way back to log what happened.
  const [hasOpenedCrm, setHasOpenedCrm] = useState(false);
  const computed = queuePrimaryAction(row);
  const action =
    computed.kind === "open_crm" && hasOpenedCrm
      ? { kind: "log_outcome" as const }
      : computed;

  function openOutcome() {
    setOutcomeOpen(true);
    onInteract(row.id);
  }

  function closeOutcome() {
    setOutcomeOpen(false);
    onInteract(null);
  }

  return (
    <>
      <TableRow
        className={cn(
          "border-border/60 align-top",
          arriving ? "bg-brand-500/[0.10]" : "hover:bg-white/[0.02]",
          exiting
            ? "opacity-40 transition-opacity duration-700"
            : "transition-opacity duration-300",
        )}
      >
        <TableCell className="px-4 py-3.5 font-medium whitespace-normal text-white">
          <a href={`/app/cases/${row.id}`} className="hover:underline">
            {row.name}
          </a>
          <span className="mt-1 block text-xs font-normal text-dim md:hidden">
            Waiting {waitingFor(row.optedInAt, now)}
          </span>
          {exiting ? (
            <span className="mt-1 block text-xs text-dim">
              Contacted — leaving this list
            </span>
          ) : null}
        </TableCell>
        {variant === "alarm" ? (
          <TableCell className="px-4 py-3.5 text-flag-critical tabular-nums">
            {formatBreachDuration(row.breachSeconds, now)}
          </TableCell>
        ) : null}
        <TableCell className="hidden px-4 py-3.5 text-silver tabular-nums md:table-cell">
          {waitingFor(row.optedInAt, now)}
        </TableCell>
        <TableCell className="px-4 py-3.5">
          {action.kind === "open_crm" ? (
            <Button
              variant="primary"
              size="sm"
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
              size="sm"
              disabled={busy}
              onClick={() => (outcomeOpen ? closeOutcome() : openOutcome())}
            >
              What happened
            </Button>
          )}
        </TableCell>
      </TableRow>
      {outcomeOpen ? (
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
              onCancel={closeOutcome}
              onSubmit={async (input) => {
                const ok = await onLogOutcome(input);
                if (ok) closeOutcome();
              }}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
