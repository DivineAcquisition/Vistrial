"use client";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";

import {
  saveApprovalAction,
  saveApprovalLimits,
  type ApprovalSaveResult,
} from "@/app/app/settings/approvals/actions";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { Select } from "@/components/ui/select";
import { toastManager } from "@/components/ui/toast";
import {
  ACTION_GROUP_LABELS,
  APPROVAL_MODE_HINTS,
  APPROVAL_MODE_LABELS,
  APPROVAL_MODES,
  APPROVER_LABELS,
  APPROVERS,
  type ApprovalMode,
  type Approver,
} from "@/lib/home/catalog";
import type { ActionGroup } from "@/lib/home/areas/types";
import { cn } from "@/lib/utils";

export type GateRowModel = {
  id: string;
  group: ActionGroup;
  label: string;
  description: string;
  reachesPeople: boolean;
  mode: ApprovalMode;
  approver: Approver;
};

export type GateLimitsModel = {
  quietHoursStart: string;
  quietHoursEnd: string;
  dailySendLimitPerLead: number;
  queueWaitLimitMinutes: number;
};

const WAIT_OPTIONS = [1, 2, 4, 8, 12, 24, 48];

function notify(result: ApprovalSaveResult) {
  if (result.ok) toastManager.add({ title: "Saved", type: "success" });
  else toastManager.add({ title: "Not saved", description: result.error, type: "error" });
}

function ActionRow({ row, editable }: { row: GateRowModel; editable: boolean }) {
  const [mode, setMode] = useState<ApprovalMode>(row.mode);
  const [approver, setApprover] = useState<Approver>(row.approver);
  const [confirming, setConfirming] = useState<{ mode: ApprovalMode; approver: Approver } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (next: { mode: ApprovalMode; approver: Approver }, confirmed = false) =>
    startTransition(async () => {
      const result = await saveApprovalAction({ actionType: row.id, ...next, confirmed });
      if (!result.ok && result.needsConfirmation) {
        setConfirming(next);
        return;
      }
      if (result.ok) {
        setMode(next.mode);
        setApprover(next.approver);
      }
      notify(result);
    });

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 sm:max-w-xs">
        <p className="text-sm font-medium text-card-foreground">{row.label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{row.description}</p>
        <p className="mt-1 text-xs text-muted-foreground">{APPROVAL_MODE_HINTS[mode]}</p>
      </div>
      <div className={cn("flex w-full flex-col gap-2 sm:w-72 sm:shrink-0", pending && "opacity-70")}>
        {editable ? (
          <>
            <SegmentedRadioGroup
              aria-label={`${row.label}: mode`}
              size="sm"
              className="w-full"
              value={mode}
              options={APPROVAL_MODES.map((value) => ({ value, label: APPROVAL_MODE_LABELS[value] }))}
              onValueChange={(value) => save({ mode: value as ApprovalMode, approver })}
            />
            <Select
              aria-label={`${row.label}: who can approve`}
              density="compact"
              value={approver}
              disabled={mode === "off"}
              options={APPROVERS.map((value) => ({ value, label: APPROVER_LABELS[value] }))}
              onChange={(event) => save({ mode, approver: event.target.value as Approver })}
            />
          </>
        ) : (
          <p className="text-sm text-card-foreground">
            {APPROVAL_MODE_LABELS[mode]}
            {mode !== "off" ? <span className="text-muted-foreground"> · {APPROVER_LABELS[approver]}</span> : null}
          </p>
        )}
      </div>
      <AlertDialog open={confirming !== null} onOpenChange={(open) => (open ? null : setConfirming(null))}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Send without review?</AlertDialogTitle>
            <AlertDialogDescription>
              {row.label} will send to real people on their own, without anyone reading them first. They still
              respect quiet hours and the daily limit per lead, and every one is logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Keep asking first</AlertDialogClose>
            <Button
              variant="primary"
              loading={pending}
              onClick={() => {
                const next = confirming;
                setConfirming(null);
                if (next) save(next, true);
              }}
            >
              Turn on auto-run
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </li>
  );
}

export function ApprovalActionsForm({ rows, editable }: { rows: GateRowModel[]; editable: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {!editable ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="size-4 shrink-0" aria-hidden /> Only an owner can change these.
        </p>
      ) : null}
      {(Object.keys(ACTION_GROUP_LABELS) as ActionGroup[]).map((group) => {
        const groupRows = rows.filter((row) => row.group === group);
        if (!groupRows.length) return null;
        return (
          <Card key={group} className="p-5 sm:p-6">
            <h2 className="font-heading text-base text-card-foreground">{ACTION_GROUP_LABELS[group]}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {group === "people"
                ? "These reach real people. Only an owner can let them run on their own."
                : "These stay inside your team and your CRM."}
            </p>
            <ul className="mt-4 divide-y divide-border">
              {groupRows.map((row) => (
                <ActionRow key={row.id} row={row} editable={editable} />
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

export function ApprovalLimitsForm({
  limits,
  timeZone,
  editable,
}: {
  limits: GateLimitsModel;
  timeZone: string;
  editable: boolean;
}) {
  const [quietStart, setQuietStart] = useState(limits.quietHoursStart);
  const [quietEnd, setQuietEnd] = useState(limits.quietHoursEnd);
  const [dailyLimit, setDailyLimit] = useState(String(limits.dailySendLimitPerLead));
  const waitHours = limits.queueWaitLimitMinutes / 60;
  const [wait, setWait] = useState(String(waitHours));
  const [pending, startTransition] = useTransition();
  const waitOptions = WAIT_OPTIONS.includes(waitHours) ? WAIT_OPTIONS : [...WAIT_OPTIONS, waitHours].sort((a, b) => a - b);

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-heading text-base text-card-foreground">Limits on what runs on its own</h2>
      <p className="mt-1 text-xs text-muted-foreground">Times are in the workspace time zone, {timeZone}.</p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            notify(
              await saveApprovalLimits({
                quietHoursStart: quietStart,
                quietHoursEnd: quietEnd,
                dailySendLimitPerLead: Number(dailyLimit),
                queueWaitLimitHours: Number(wait),
              })
            );
          });
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium text-card-foreground">
          Quiet hours start
          <Input type="time" value={quietStart} disabled={!editable} onChange={(event) => setQuietStart(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-card-foreground">
          Quiet hours end
          <Input type="time" value={quietEnd} disabled={!editable} onChange={(event) => setQuietEnd(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-card-foreground">
          Messages per lead per day
          <Input
            type="number"
            min={1}
            max={20}
            inputMode="numeric"
            value={dailyLimit}
            disabled={!editable}
            onChange={(event) => setDailyLimit(event.target.value)}
          />
          <span className="text-xs font-normal text-muted-foreground">Auto-run messages stop at this many.</span>
        </label>
        <div className="flex flex-col gap-1.5 text-sm font-medium text-card-foreground">
          <span id="wait-limit-label">Escalate after waiting</span>
          <Select
            aria-labelledby="wait-limit-label"
            value={wait}
            disabled={!editable}
            options={waitOptions.map((hours) => ({ value: String(hours), label: hours === 1 ? "1 hour" : `${hours} hours` }))}
            onChange={(event) => setWait(event.target.value)}
          />
          <span className="text-xs font-normal text-muted-foreground">
            Past this, an item never sends on its own. It goes to the owner.
          </span>
        </div>
        {editable ? (
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" loading={pending} loadingLabel="Saving">
              Save limits
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}
