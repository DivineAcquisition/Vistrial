"use client";

import { RefreshCw } from "@/components/icons";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export type BookingsView = {
  provider: string;
  syncedAt: number;
  snapshot: {
    from: string;
    to: string;
    weeks: { week: string; booked: number; cancelled: number; declined?: number; noShow?: number }[];
    totals: { booked: number; cancelled: number; declined?: number; noShow?: number };
    byType?: { name: string; booked: number; cancelled: number; noShow: number }[];
    noShowChecked?: { checked: number; of: number };
    truncated: boolean;
  };
};

/** Why a read did not finish, in plain words. */
export const SYNC_WORDS: Record<string, string> = {
  token_rejected: "The provider signed Vistrial out. Reconnect to read again.",
  permission_missing: "The provider refused the read. Reconnect and allow the permission it asks for.",
  rate_limited: "The provider asked Vistrial to slow down. Try again in a few minutes.",
  provider_down: "The provider is not answering just now. Try again in a few minutes.",
  connection_failed: "Vistrial could not reach the provider. Try again in a few minutes.",
  read_failed: "The read did not finish. Try again in a few minutes.",
  busy: "A read is already running. Try again in a moment.",
};

const WEEKS_SHOWN = 8;

function day(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * A connected calendar's booked calls: totals, the last weeks as a table, and what the numbers cannot
 * show. Counts only; there is nothing here about who a call was with.
 */
export function BookingsPanel({
  bookings,
  third,
  caveat,
  canRefresh,
  lastCode,
  onRefresh,
}: {
  bookings: BookingsView | null;
  /** The third figure this calendar has: no-shows for Calendly, guest declines for Google Calendar. */
  third: { key: "noShow" | "declined"; label: string };
  caveat: string;
  canRefresh: boolean;
  lastCode?: string | null;
  onRefresh?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const snapshot = bookings?.snapshot ?? null;
  const weeks = snapshot ? snapshot.weeks.slice(-WEEKS_SHOWN) : [];
  const problem = lastCode && lastCode !== "ok" ? (SYNC_WORDS[lastCode] ?? SYNC_WORDS.read_failed) : null;
  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {bookings && snapshot
            ? `${day(snapshot.from)} to ${day(snapshot.to)}. Read ${new Date(bookings.syncedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`
            : "Not read yet. The first read starts when the calendar is connected."}
        </p>
        {canRefresh && onRefresh ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRefresh();
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw aria-hidden className="size-3.5" /> {busy ? "Reading" : "Refresh"}
          </Button>
        ) : null}
      </div>
      {problem ? <p className="text-sm text-warning">{problem}</p> : null}
      {snapshot ? (
        <>
          <dl className="grid grid-cols-3 gap-2">
            {[
              { label: "Booked", value: snapshot.totals.booked },
              { label: "Cancelled", value: snapshot.totals.cancelled },
              { label: third.label, value: snapshot.totals[third.key] ?? 0 },
            ].map((row) => (
              <div key={row.label} className="grid rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="font-heading text-base text-card-foreground tabular-nums">{row.value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          {weeks.length > 0 ? (
            <table className="w-full text-sm">
              <caption className="sr-only">Booked calls by week</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-3 font-normal">
                    Week of
                  </th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-normal">
                    Booked
                  </th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-normal">
                    Cancelled
                  </th>
                  <th scope="col" className="py-1.5 text-right font-normal">
                    {third.label}
                  </th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week.week} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-card-foreground">
                      {day(week.week)}
                    </th>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-card-foreground">{week.booked}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-card-foreground">{week.cancelled}</td>
                    <td className="py-1.5 text-right tabular-nums text-card-foreground">{week[third.key] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No calls with outside guests in this period.</p>
          )}
          {snapshot.byType && snapshot.byType.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              By event type: {snapshot.byType.slice(0, 4).map((row) => `${row.name} ${row.booked}`).join(", ")}
              {snapshot.byType.length > 4 ? `, and ${snapshot.byType.length - 4} more` : ""}.
            </p>
          ) : null}
        </>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {caveat}
        {snapshot?.noShowChecked && snapshot.noShowChecked.checked < snapshot.noShowChecked.of
          ? ` No-shows were checked on the ${snapshot.noShowChecked.checked} most recent of ${snapshot.noShowChecked.of} past calls.`
          : ""}
        {snapshot?.truncated ? " There were more events than one read takes, so the earliest are not counted." : ""}
      </p>
    </div>
  );
}

export const CALENDAR_PANELS: Record<string, { third: { key: "noShow" | "declined"; label: string }; caveat: string }> = {
  google_calendar: {
    third: { key: "declined", label: "Declined" },
    caveat:
      "Counts only: meetings at a set time with a guest outside your own email domain. A calendar records replies and cancellations, not who showed up, so there is no no-show figure here.",
  },
  calendly: {
    third: { key: "noShow", label: "No-show" },
    caveat: "Counts only. A no-show is counted when the host marked it in Calendly; unmarked ones cannot be seen.",
  },
};
