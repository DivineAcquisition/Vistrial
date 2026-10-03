import type { MonthlyMetrics, ReportOmission } from "@/lib/forsight/report/types";

/**
 * The month, reduced to the facts a source has to produce.
 *
 * An adapter maps its own rows onto this shape, and `monthlyFromFacts` is
 * then the only place the report's numbers are derived. A workspace moved
 * from one source to another cannot see the arithmetic change meaning.
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
