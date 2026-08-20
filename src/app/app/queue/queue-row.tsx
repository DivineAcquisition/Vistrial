"use client";

import { useState } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { canAssignLeads } from "@/lib/auth/permissions";
import { formatBreachDuration, formatQueueDuration, formatQueueUntil } from "@/lib/queue/duration";
import {
  SCORE_CONFIDENCE_LABELS,
  TOUCH_CHANNEL_LABELS,
  TOUCH_CHANNELS,
  TOUCH_DIRECTIONS,
  TOUCH_OUTCOME_LABELS,
  TOUCH_OUTCOMES,
  type QueueMemberOption,
  type QueueRow,
  type TouchChannel,
  type TouchDirection,
  type TouchOutcome,
} from "@/lib/queue/types";
import { cn } from "@/lib/utils";
import {
  btnGhost,
  btnPrimary,
  btnSecondary,
  btnSizeSm,
  errorClass,
  helperClass,
  inputClass,
  labelClass,
  selectClass,
} from "@/lib/ui";
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
          <TableCell colSpan={colSpan} className="px-4 py-4 whitespace-normal">
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
          <TableCell colSpan={colSpan} className="px-4 py-4 whitespace-normal">
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
          <TableCell colSpan={colSpan} className="px-4 py-4 whitespace-normal">
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

function OutcomePanel({
  row,
  members,
  role,
  memberId,
  isPlatformAdmin,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  row: QueueRow;
  members: QueueMemberOption[];
  role: OrgRole;
  memberId: string;
  isPlatformAdmin: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (input: {
    leadId: string;
    channel: TouchChannel;
    direction: TouchDirection;
    outcome: TouchOutcome;
    note: string;
    actorMemberId: string;
  }) => Promise<void>;
}) {
  const canPickActor = canAssignLeads(role, isPlatformAdmin);
  const [channel, setChannel] = useState<TouchChannel>("call");
  const [direction, setDirection] = useState<TouchDirection>("outbound");
  const [note, setNote] = useState("");
  const [actorMemberId, setActorMemberId] = useState(memberId);
  const [pending, setPending] = useState(false);

  async function chooseOutcome(outcome: TouchOutcome) {
    setPending(true);
    try {
      await onSubmit({
        leadId: row.id,
        channel,
        direction,
        outcome,
        note,
        actorMemberId: canPickActor ? actorMemberId : memberId,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="text-sm font-medium text-white">Log an outcome for {row.name}</p>
      <p className={helperClass}>
        One click on the result writes the touch. Channel and direction stay outbound call unless you change them.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={labelClass}>Channel</span>
          <select
            className={selectClass}
            value={channel}
            onChange={(event) => setChannel(event.target.value as TouchChannel)}
          >
            {TOUCH_CHANNELS.map((value) => (
              <option key={value} value={value}>
                {TOUCH_CHANNEL_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Direction</span>
          <select
            className={selectClass}
            value={direction}
            onChange={(event) => setDirection(event.target.value as TouchDirection)}
          >
            {TOUCH_DIRECTIONS.map((value) => (
              <option key={value} value={value}>
                {value === "outbound" ? "Outbound" : "Inbound"}
              </option>
            ))}
          </select>
        </label>
        {canPickActor ? (
          <label className="block">
            <span className={labelClass}>Actor</span>
            <select
              className={selectClass}
              value={actorMemberId}
              onChange={(event) => setActorMemberId(event.target.value)}
            >
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="self-end text-sm text-dim">Logged as you</p>
        )}
      </div>
      <label className="mt-4 block">
        <span className={labelClass}>Note (optional)</span>
        <input
          className={inputClass}
          maxLength={280}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="One short sentence if it helps"
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        {TOUCH_OUTCOMES.map((outcome) => (
          <button
            key={outcome}
            type="button"
            className={`${btnPrimary} ${btnSizeSm}`}
            disabled={busy || pending}
            onClick={() => void chooseOutcome(outcome)}
          >
            {TOUCH_OUTCOME_LABELS[outcome]}
          </button>
        ))}
        <button type="button" className={`${btnGhost} ${btnSizeSm}`} onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}

function AssignPanel({
  row,
  members,
  role,
  memberId,
  isPlatformAdmin,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  row: QueueRow;
  members: QueueMemberOption[];
  role: OrgRole;
  memberId: string;
  isPlatformAdmin: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (input: {
    leadId: string;
    setterId: string | null;
    closerId: string | null;
  }) => Promise<void>;
}) {
  const canOthers = canAssignLeads(role, isPlatformAdmin);
  const [setterId, setSetterId] = useState(row.assignedSetterId ?? "");
  const [closerId, setCloserId] = useState(row.assignedCloserId ?? "");
  const [pending, setPending] = useState(false);

  async function save() {
    const nextSetter = setterId || null;
    const nextCloser = closerId || null;
    setPending(true);
    try {
      await onSubmit({ leadId: row.id, setterId: nextSetter, closerId: nextCloser });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="text-sm font-medium text-white">Assign {row.name}</p>
      {!canOthers ? (
        <p className={helperClass}>You can assign this lead to yourself. Owners and admins assign to others.</p>
      ) : (
        <p className={helperClass}>Setter and closer must be active members of this workspace.</p>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <AssignmentSelect
          label="Setter"
          value={setterId}
          currentId={row.assignedSetterId}
          currentName={row.assignedSetterName}
          memberId={memberId}
          members={members}
          canOthers={canOthers}
          onChange={setSetterId}
        />
        <AssignmentSelect
          label="Closer"
          value={closerId}
          currentId={row.assignedCloserId}
          currentName={row.assignedCloserName}
          memberId={memberId}
          members={members}
          canOthers={canOthers}
          onChange={setCloserId}
        />
      </div>
      {!canOthers ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${btnSecondary} ${btnSizeSm}`}
            onClick={() => setSetterId(memberId)}
          >
            Assign to me as setter
          </button>
          <button
            type="button"
            className={`${btnSecondary} ${btnSizeSm}`}
            onClick={() => setCloserId(memberId)}
          >
            Assign to me as closer
          </button>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={`${btnPrimary} ${btnSizeSm}`}
          disabled={busy || pending}
          onClick={() => void save()}
        >
          Save assignment
        </button>
        <button type="button" className={`${btnGhost} ${btnSizeSm}`} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}

function AssignmentSelect({
  label,
  value,
  currentId,
  currentName,
  memberId,
  members,
  canOthers,
  onChange,
}: {
  label: string;
  value: string;
  currentId: string | null;
  currentName: string | null;
  memberId: string;
  members: QueueMemberOption[];
  canOthers: boolean;
  onChange: (value: string) => void;
}) {
  const self = members.find((member) => member.id === memberId);
  const keepCurrent = Boolean(currentId && currentId !== memberId);

  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select className={selectClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {canOthers || !currentId ? <option value="">Unassigned</option> : null}
        {!canOthers && keepCurrent ? (
          <option value={currentId ?? ""}>{currentName || "Currently assigned"}</option>
        ) : null}
        {canOthers
          ? members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))
          : self ? (
              <option value={self.id}>{self.displayName}</option>
            ) : null}
      </select>
    </label>
  );
}

function FollowOnPanel({
  busy,
  error,
  onSkip,
  onSubmit,
}: {
  busy?: boolean;
  error?: string | null;
  onSkip: () => void;
  onSubmit: (input: { actionText: string; dueAt: string | null }) => Promise<void>;
}) {
  const [actionText, setActionText] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="text-sm font-medium text-white">Create a follow-on?</p>
      <p className={helperClass}>Optional. Skip if nothing is next.</p>
      <label className="mt-4 block">
        <span className={labelClass}>Next action</span>
        <input
          className={inputClass}
          maxLength={240}
          value={actionText}
          onChange={(event) => setActionText(event.target.value)}
          placeholder="Call back Thursday"
        />
      </label>
      <label className="mt-4 block">
        <span className={labelClass}>Due (optional)</span>
        <input
          type="datetime-local"
          className={inputClass}
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
        />
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={`${btnPrimary} ${btnSizeSm}`}
          disabled={busy || pending || !actionText.trim()}
          onClick={() => {
            setPending(true);
            void onSubmit({ actionText, dueAt: dueAt || null }).finally(() => setPending(false));
          }}
        >
          Save follow-on
        </button>
        <button type="button" className={`${btnGhost} ${btnSizeSm}`} onClick={onSkip}>
          Skip
        </button>
      </div>
      {error ? <p className={errorClass}>{error}</p> : null}
    </div>
  );
}
