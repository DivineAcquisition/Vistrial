"use client";

import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CircleDollarSignIcon,
  ClipboardListIcon,
  CreditCardIcon,
  GitCompareIcon,
  InboxIcon,
  MailWarningIcon,
  ScaleIcon,
  TimerIcon,
  TrendingDownIcon,
  UserRoundSearchIcon,
  UsersIcon,
  ChevronDownIcon,
} from "lucide-react";
import { useState } from "react";

import { AttentionActions } from "@/components/attention/actions";
import { Panel } from "@/components/ui/panel";
import { TonePill } from "@/components/ui/tone";
import { formatAge } from "@/lib/attention/rank";
import {
  TYPE_LABEL,
  type AttentionItem,
  type AttentionRow,
  type AttentionType,
} from "@/lib/attention/types";

const ICONS: Record<AttentionType, typeof AlertTriangleIcon> = {
  failed_payment: CircleDollarSignIcon,
  held_notification: MailWarningIcon,
  open_dispute: ScaleIcon,
  cross_client_both_confirmed: GitCompareIcon,
  cross_client_duplicate: UsersIcon,
  volume_drop: TrendingDownIcon,
  pending_confirmation: ClipboardListIcon,
  awaiting_human_touch: UserRoundSearchIcon,
  no_payment_method: CreditCardIcon,
  expiring_payment_method: CalendarClockIcon,
  below_minimum: TimerIcon,
  unresolved_inbound: InboxIcon,
  cycle_skipped: AlertTriangleIcon,
};

export function AttentionList({ rows }: { rows: AttentionRow[] }) {
  if (rows.length === 0) {
    return (
      <Panel className="border-l-2 border-l-flag-good px-6 py-8">
        <TonePill tone="good">Clear</TonePill>
        <h2 className="mt-4 text-xl font-semibold text-white">
          Nothing needs attention today
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-silver">
          Every payment that should have collected has, every dispute is settled,
          and nothing is waiting on a person. That is a good day.
        </p>
      </Panel>
    );
  }

  return (
    <ul className="space-y-2.5">
      {rows.map((row) =>
        row.kind === "item" ? (
          <li key={row.item.id}>
            <ItemCard item={row.item} />
          </li>
        ) : (
          <li key={`group-${row.type}`}>
            <GroupCard row={row} />
          </li>
        )
      )}
    </ul>
  );
}

function TypeMark({
  type,
  escalated,
}: {
  type: AttentionType;
  escalated: boolean;
}) {
  const Icon = ICONS[type];
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex size-8 items-center justify-center rounded-full border ${
          escalated
            ? "border-flag-critical/40 bg-flag-critical/10 text-flag-critical"
            : "border-flag-warning/40 bg-flag-warning/10 text-flag-warning"
        }`}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">
        {TYPE_LABEL[type]}
      </span>
    </div>
  );
}

function ItemCard({ item }: { item: AttentionItem }) {
  return (
    <div
      className={`panel rounded-2xl border-l-2 px-5 py-4 ${
        item.escalated ? "border-l-flag-critical" : "border-l-flag-warning"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <TypeMark type={item.type} escalated={item.escalated} />
          <p className="text-sm font-medium text-white">{item.clientName}</p>
          <p className="text-sm text-silver">{item.summary}</p>
          <p className="text-xs leading-relaxed text-dim">{item.detail}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <TonePill tone={item.escalated ? "critical" : "warning"}>
            {formatAge(item.ageMs)}
          </TonePill>
          {item.escalated ? (
            <span className="text-[10px] font-semibold tracking-wide text-flag-critical uppercase">
              Escalated
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-4">
        <AttentionActions actions={item.actions} />
      </div>
    </div>
  );
}

function GroupCard({
  row,
}: {
  row: Extract<AttentionRow, { kind: "group" }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`panel rounded-2xl border-l-2 px-5 py-4 ${
        row.escalated ? "border-l-flag-critical" : "border-l-flag-warning"
      }`}
    >
      <button
        type="button"
        className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div className="space-y-2">
          <TypeMark type={row.type} escalated={row.escalated} />
          <p className="text-sm font-medium text-white">
            {row.count} items · oldest {formatAge(row.oldestAgeMs)}
          </p>
          <p className="text-xs text-dim">Expand to act on each one.</p>
        </div>
        <div className="flex items-center gap-2">
          <TonePill tone={row.escalated ? "critical" : "warning"}>
            {formatAge(row.oldestAgeMs)}
          </TonePill>
          <ChevronDownIcon
            className={`size-4 text-dim transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {open ? (
        <ul className="mt-4 space-y-2 border-t border-border pt-4">
          {row.items.map((item) => (
            <li key={item.id}>
              <ItemCard item={item} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
