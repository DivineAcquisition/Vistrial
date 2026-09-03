"use client";

import { useState } from "react";

import { AssignPanel, FollowOnPanel, OutcomePanel } from "@/components/app/lead-action-panels";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuLinkItem,
  ContextMenuPopup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatBreachDuration } from "@/lib/queue/duration";
import {
  type QueueMemberOption,
  type QueueRow,
  type TouchChannel,
  type TouchDirection,
  type TouchOutcome,
} from "@/lib/queue/types";
import { waitingFor } from "@/lib/vocabulary";
import { cn } from "@/lib/utils";
import type { OrgRole } from "@/types/database";

type Panel = "outcome" | "assign" | "followOn" | "why" | null;

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
  onFollowOn: (input: {
    leadId: string;
    actionText: string;
    dueAt: string | null;
  }) => Promise<boolean>;
}) {
  const [panel, setPanel] = useState<Panel>(null);

  function openPanel(next: Panel) {
    setPanel(next);
    onInteract(next ? row.id : null);
  }

  function closePanel() {
    setPanel(null);
    onInteract(null);
  }

  return (
    <>
      <ContextMenu>
      <ContextMenuTrigger
        render={
          <TableRow
            className={cn(
              "border-border/60 align-top",
              arriving ? "bg-brand-500/[0.10]" : "hover:bg-white/[0.02]",
              exiting ? "opacity-40 transition-opacity duration-700" : "transition-opacity duration-300",
            )}
          />
        }
      >
        <TableCell className="px-4 py-3.5 font-medium whitespace-normal text-white">
          <a href={`/app/cases/${row.id}`} className="hover:underline">
            {row.name}
          </a>
          <span className="mt-1 block text-xs font-normal text-dim md:hidden">
            Waiting {waitingFor(row.optedInAt, now)}
          </span>
          {exiting ? (
            <span className="mt-1 block text-xs text-dim">Contacted — leaving this list</span>
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
          <div className="flex flex-wrap gap-2">
            {row.crmUrl ? (
              <Button
                variant="primary"
                size="sm"
                render={<a href={row.crmUrl} target="_blank" rel="noopener noreferrer" />}
              >
                Open in CRM
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() => openPanel(panel === "outcome" ? null : "outcome")}
              >
                What happened
              </Button>
            )}
            {row.crmUrl ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => openPanel(panel === "outcome" ? null : "outcome")}
              >
                What happened
              </Button>
            ) : null}
          </div>
        </TableCell>
      </ContextMenuTrigger>
      <ContextMenuPopup>
        <ContextMenuLinkItem href={`/app/cases/${row.id}`}>Person</ContextMenuLinkItem>
        {row.crmUrl ? (
          <ContextMenuLinkItem href={row.crmUrl} rel="noopener noreferrer" target="_blank">
            Open in CRM
          </ContextMenuLinkItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy} onClick={() => openPanel("outcome")}>
          What happened
        </ContextMenuItem>
        <ContextMenuItem disabled={busy} onClick={() => openPanel("why")}>
          Why this order
        </ContextMenuItem>
        <ContextMenuItem disabled={busy} onClick={() => openPanel("assign")}>
          Assign
        </ContextMenuItem>
        {row.nextAction ? (
          <ContextMenuItem
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
            Mark next step done
          </ContextMenuItem>
        ) : null}
      </ContextMenuPopup>
      </ContextMenu>
      {panel === "why" ? (
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableCell colSpan={colSpan} className="px-4 py-3 whitespace-normal text-sm text-silver">
            <p>
              {row.scoreReasoning ||
                "Nothing was recorded about why this person sits here. The first call will fill it in."}
            </p>
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
