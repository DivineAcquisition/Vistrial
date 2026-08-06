/**
 * The monthly minimum.
 *
 * Where the appointments billed across a calendar month fall below the client's
 * minimum, the difference is added — as its own labelled line, never folded
 * into the per-appointment figure. A client comparing their invoice to their
 * appointment count and finding the arithmetic wrong is a trust problem that
 * outlives the explanation.
 *
 * The minimum is assessed across the calendar month, not per cycle, and applied
 * on the first cycle that closes after the month ends.
 */

import type { Day } from "@/lib/billing/cycle";

export const MINIMUM_LINE_LABEL = "Monthly minimum adjustment";

export function monthStart(day: Day): Day {
  return `${day.slice(0, 7)}-01`;
}

export function monthEnd(month: Day): Day {
  const [year, monthNumber] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0));
  return last.toISOString().slice(0, 10);
}

/**
 * The calendar month a cycle closing on this day settles: the month before the
 * one it closes in. A cycle closing on 6 August settles July; the next close on
 * 20 August settles nothing, because July has already been assessed.
 */
export function monthToAssess(close: Day): Day {
  const start = monthStart(close);
  return monthStart(addMonths(start, -1));
}

function addMonths(month: Day, delta: number): Day {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return shifted.toISOString().slice(0, 10);
}

export function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function shortfall(monthlyMinimum: number, billedInMonth: number): number {
  if (monthlyMinimum <= 0) return 0;
  return round2(Math.max(0, monthlyMinimum - billedInMonth));
}

export function describeMinimum(month: Day, minimum: number, billed: number): string {
  const label = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}T00:00:00Z`));

  return `${MINIMUM_LINE_LABEL} for ${label}: appointments billed came to ${billed.toFixed(
    2
  )} against a minimum of ${minimum.toFixed(2)}.`;
}
