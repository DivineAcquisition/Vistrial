import type { MonthlyMetrics, ReportOmission } from "@/lib/forsight/report/types";

/**
 * The month, reduced to the facts both adapters can produce.
 *
 * Airtable maps formula fields and linked tables onto this; Vistrial core
 * maps its own rows onto the same shape. `monthlyFromFacts` is then the only
 * place the report's numbers are derived, so a workspace moved between source
 * types cannot see the arithmetic change meaning.
 */

export type MonthLead = {
  id: string;
  hoursToFirstHuman: number | null;
  humanTouches: number;
  scored: boolean;
  qualified: boolean;
  contacted: boolean;
  booked: boolean;
  held: boolean;
  closed: boolean;
  lost: boolean;
  noShow: boolean;
  rebooked: boolean;
  assignedName: string | null;
};

export type MonthFacts = {
  leads: MonthLead[];
  revenue: MonthlyMetrics["revenue"];
  nurture: MonthlyMetrics["nurture"];
  /**
   * null: this source does not record objections.
   * []: it does, and nothing was held this month.
   */
  objections: Array<{ objection: string; count: number }> | null;
  /** false: assignment is not a thing this source tracks. */
  teamAvailable: boolean;
  omissions: ReportOmission[];
};

export function inPeriod(date: string | null | undefined, start: string, end: string): boolean {
  if (!date) return false;
  const day = date.slice(0, 10);
  return day >= start && day <= end;
}

/** "12 hrs", 12, "NEVER TOUCHED" — Airtable's formula is text. */
export function parseHours(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || /never/i.test(trimmed)) return null;
  const match = trimmed.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}

export function hoursBetween(from: string | null | undefined, to: string | null | undefined): number | null {
  if (!from || !to) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return (end - start) / 3_600_000;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentOf(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return (part / whole) * 100;
}

/**
 * Maps a deal/payment type onto the four revenue buckets. Unknown types are
 * left unclassified rather than folded into New — Reactivated in particular
 * must stand alone, and inventing a bucket would hide it.
 */
export function revenueBucket(
  type: string
): "new" | "repeat" | "recurring" | "reactivated" | null {
  const key = type.trim().toLowerCase();
  if (!key) return null;
  if (key.includes("reactivat")) return "reactivated";
  if (key.includes("repeat") || key.includes("reorder")) return "repeat";
  if (key.includes("recurring") || key.includes("retainer") || key.includes("subscription")) {
    return "recurring";
  }
  if (key.includes("install") || key === "new") return "new";
  return null;
}

export function monthlyFromFacts(facts: MonthFacts): MonthlyMetrics {
  const leads = facts.leads;
  const qualified = leads.filter((lead) => lead.qualified);
  const closed = leads.filter((lead) => lead.closed);
  const lost = leads.filter((lead) => lead.lost);
  const hours = leads
    .map((lead) => lead.hoursToFirstHuman)
    .filter((value): value is number => value !== null);
  const noShows = leads.filter((lead) => lead.noShow);
  const booked = leads.filter((lead) => lead.booked).length;
  const held = leads.filter((lead) => lead.held).length;

  return {
    funnel: {
      optedIn: leads.length,
      scored: leads.filter((lead) => lead.scored).length,
      qualified: qualified.length,
      contacted: leads.filter((lead) => lead.contacted).length,
      booked,
      held,
      closed: closed.length,
    },
    speed: {
      medianHoursToFirstHumanTouch: median(hours),
      readyContactedWithinFourHoursPercent: percentOf(
        qualified.filter(
          (lead) => lead.hoursToFirstHuman !== null && lead.hoursToFirstHuman <= 4
        ).length,
        qualified.length
      ),
      averageTouchesOnClosed: average(closed.map((lead) => lead.humanTouches)),
      averageTouchesOnLost: average(lost.map((lead) => lead.humanTouches)),
      showRatePercent: percentOf(held, booked),
      rebookRatePercent: percentOf(
        noShows.filter((lead) => lead.rebooked).length,
        noShows.length
      ),
    },
    revenue: facts.revenue,
    nurture: facts.nurture,
    team: facts.teamAvailable ? teamRows(leads) : null,
    objections: facts.objections,
    omissions: facts.omissions,
  };
}

function teamRows(leads: MonthLead[]): MonthlyMetrics["team"] {
  const byName = new Map<string, MonthLead[]>();
  for (const lead of leads) {
    const name = lead.assignedName?.trim();
    if (!name) continue;
    const list = byName.get(name) ?? [];
    list.push(lead);
    byName.set(name, list);
  }

  return [...byName.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, assigned]) => {
      const booked = assigned.filter((lead) => lead.booked).length;
      const held = assigned.filter((lead) => lead.held).length;
      return {
        name,
        assigned: assigned.length,
        contactedWithinFourHours: assigned.filter(
          (lead) => lead.hoursToFirstHuman !== null && lead.hoursToFirstHuman <= 4
        ).length,
        neverContacted: assigned.filter((lead) => !lead.contacted).length,
        averageTouches: average(assigned.map((lead) => lead.humanTouches)) ?? 0,
        booked,
        showRatePercent: percentOf(held, booked),
      };
    });
}
