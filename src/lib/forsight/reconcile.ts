import type { GhlAppointments } from "@/lib/forsight/ghl";
import { isNumber, type MetricValue } from "@/lib/forsight/values";

/**
 * The same appointment counts from both systems, side by side.
 *
 * Airtable's booking numbers arrive through GoHighLevel workflow steps. When
 * one of those silently stops firing, Airtable undercounts, and because every
 * cost metric divides by those counts, every cost on the dashboard goes quietly
 * wrong. Showing both numbers turns a month-end surprise into a same-day one.
 *
 * Nothing here picks a winner or reconciles anything. Two systems disagree;
 * that is a fact about the systems, and a person decides what to do about it.
 */

export type ReconciliationLine = {
  label: string;
  ghl: number;
  /** Absent when Airtable has no figure for this week yet. */
  airtable: number | null;
  gap: number | null;
  agrees: boolean;
};

export type Reconciliation = {
  lines: ReconciliationLine[];
  /** True only where both sides have a number and they differ. */
  disagrees: boolean;
  /** True when Airtable has nothing to compare against. */
  incomparable: boolean;
};

function line(label: string, ghl: number, airtable: MetricValue): ReconciliationLine {
  const theirs = isNumber(airtable) ? airtable.value : null;
  return {
    label,
    ghl,
    airtable: theirs,
    gap: theirs === null ? null : ghl - theirs,
    agrees: theirs === null ? true : theirs === ghl,
  };
}

export function reconcileAppointments(
  ghl: GhlAppointments,
  airtable: { booked: MetricValue; held: MetricValue }
): Reconciliation {
  const lines = [
    line("Booked", ghl.booked, airtable.booked),
    line("Showed", ghl.showed, airtable.held),
  ];

  return {
    lines,
    disagrees: lines.some((entry) => !entry.agrees),
    incomparable: lines.every((entry) => entry.airtable === null),
  };
}

/** Said plainly, because the point of the section is that somebody reads it. */
export function reconciliationSentence(reconciliation: Reconciliation): string {
  if (reconciliation.incomparable) {
    return "Airtable has no counts for this week yet, so there is nothing to compare against.";
  }
  if (!reconciliation.disagrees) {
    return "Both systems agree. Bookings are landing in Airtable as they should.";
  }

  const off = reconciliation.lines.filter((entry) => !entry.agrees && entry.gap !== null);
  const parts = off.map((entry) => {
    const gap = entry.gap as number;
    const direction = gap > 0 ? "fewer" : "more";
    return `${Math.abs(gap)} ${direction} ${entry.label.toLowerCase()} in Airtable than in LeadConnector`;
  });
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  return `These disagree: ${list}. That usually means a LeadConnector workflow step stopped writing to Airtable. Every cost metric divides by the Airtable count, so check it before trusting this week's costs.`;
}
