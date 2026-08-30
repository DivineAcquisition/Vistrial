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
import { PreviewCard, PreviewCardPopup, PreviewCardTrigger } from "@/components/ui/preview-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatBreachDuration, formatQueueDuration, formatQueueUntil } from "@/lib/queue/duration";
import {
  type QueueMemberOption,
  type QueueRow,
  type TouchChannel,
  type TouchDirection,
  type TouchOutcome,
} from "@/lib/queue/types";
import { readinessLabel, readinessState, readinessTone, waitingFor } from "@/lib/vocabulary";
import { cn } from "@/lib/utils";
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
  readyThreshold,
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
  readyThreshold: number;
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
  const [detailOpen, setDetailOpen] = useState(false);

  function openPanel(next: Panel) {
    setPanel(next);
    onInteract(next ? row.id : null);
  }

  function closePanel() {
    setPanel(null);
    onInteract(null);
  }

  const state = readinessState(row.score, readyThreshold, row.leadType === "nurture_track");
  const stateLabel = readinessLabel(state);

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
          <PreviewCard>
            <PreviewCardTrigger render={<span className="cursor-default text-left" />}>
              <span className="block">{row.name}</span>
              <span className="mt-1 block text-xs font-normal text-dim md:hidden">
                Waiting {waitingFor(row.optedInAt, now)}
              </span>
              {exiting ? <span className="mt-1 block text-xs text-dim">Contacted — leaving this list</span> : null}
            </PreviewCardTrigger>
            <PreviewCardPopup>
              <div className="flex flex-col gap-2">
                <p className="font-medium text-sm text-white">{row.name}</p>
                <p className="text-xs text-muted-foreground">{stateLabel}</p>
                <p className="text-xs text-dim">Waiting {waitingFor(row.optedInAt, now)}</p>
              </div>
            </PreviewCardPopup>
          </PreviewCard>
        </TableCell>
        {variant === "alarm" ? (
          <TableCell className="px-4 py-3.5 text-flag-critical tabular-nums">
            {formatBreachDuration(row.breachSeconds, now)}
          </TableCell>
        ) : null}
        <TableCell className="px-4 py-3.5 whitespace-normal">
          <button
            type="button"
            className="text-left"
            onClick={() => setDetailOpen((open) => !open)}
            aria-expanded={detailOpen}
          >
            <StatusBadge label={stateLabel} tone={readinessTone(state)} />
            <span className="mt-1 block text-[11px] text-brand-300">
              {detailOpen ? "Hide details" : "Why"}
            </span>
          </button>
        </TableCell>
        <TableCell className="hidden px-4 py-3.5 text-silver tabular-nums md:table-cell">
          {waitingFor(row.optedInAt, now)}
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
              <Button
                variant="primary"
                size="sm"
                render={<a href={row.crmUrl} target="_blank" rel="noopener noreferrer" />}
              >
                Open in CRM
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" render={<a href={`/app/cases/${row.id}/brief`} />}>
              Brief
            </Button>
            <Button variant="secondary" size="sm" render={<a href={`/app/cases/${row.id}`} />}>
              Case file
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => openPanel(panel === "outcome" ? null : "outcome")}
            >
              Log outcome
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => openPanel(panel === "assign" ? null : "assign")}
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
              </Button>
            ) : null}
          </div>
        </TableCell>
      </ContextMenuTrigger>
      <ContextMenuPopup>
        <ContextMenuLinkItem href={`/app/cases/${row.id}/brief`}>Brief</ContextMenuLinkItem>
        <ContextMenuLinkItem href={`/app/cases/${row.id}`}>Case file</ContextMenuLinkItem>
        {row.crmUrl ? (
          <ContextMenuLinkItem href={row.crmUrl} rel="noopener noreferrer" target="_blank">
            Open in CRM
          </ContextMenuLinkItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={busy} onClick={() => openPanel("outcome")}>
          Log outcome
        </ContextMenuItem>
        <ContextMenuItem disabled={busy} onClick={() => openPanel("assign")}>
          Assign
        </ContextMenuItem>
      </ContextMenuPopup>
      </ContextMenu>
      {detailOpen ? (
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableCell colSpan={colSpan} className="px-4 py-3 whitespace-normal text-sm text-silver">
            <p>
              {row.scoreReasoning ||
                "Nothing was recorded about why this lead sits here. The first call will fill it in."}
            </p>
            <p className="mt-2 text-xs text-dim">
              {[
                row.score === null ? null : `Out of 100: ${row.score}`,
                row.source ? `Came from ${row.source}` : null,
                row.assignedSetterName ? `Setter ${row.assignedSetterName}` : "No setter yet",
                row.assignedCloserName ? `Closer ${row.assignedCloserName}` : null,
                row.lastTouchAt
                  ? `Last contacted ${waitingFor(row.lastTouchAt, now)} ago`
                  : "Never contacted",
              ]
                .filter(Boolean)
                .join(" · ")}
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
