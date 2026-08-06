/**
 * Combined cost per appointment.
 *
 * The figure is (ad spend + DA fees) / confirmed appointments. A day with no
 * spend row is unknown, not zero: missing spend makes the whole figure
 * unavailable rather than flattering. An admin who spent nothing records a
 * zero deliberately.
 */

import { addDays, type Day } from "@/lib/billing/cycle";
import { round2 } from "@/lib/billing/minimum";

export type SpendDay = {
  spend_date: Day;
  amount: number;
};

export type FeeCharge = {
  period_start: Day;
  period_end: Day;
  total: number;
  status: string;
};

export type ConfirmedAppointment = {
  /** The day the appointment was confirmed, in UTC `yyyy-mm-dd`. */
  confirmed_on: Day;
};

export type CostBreakdown = {
  period: { start: Day; end: Day };
  adSpend: number;
  daFees: number;
  combined: number;
  confirmedCount: number;
  /** Null when spend is incomplete or there were no confirmed appointments. */
  costPerAppointment: number | null;
  unavailableReason: string | null;
  /** Calendar days in the period with no spend row at all. */
  missingSpendDays: Day[];
};

const FEE_STATUSES = new Set(["notified", "processing", "paid", "failed", "credited"]);

/** Inclusive list of calendar days from start through end. */
export function daysInPeriod(start: Day, end: Day): Day[] {
  if (start > end) return [];

  const days: Day[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * Days in the period that have no spend row. A zero-amount row counts as
 * complete; an absent row does not.
 */
export function missingSpendDays(
  period: { start: Day; end: Day },
  spend: SpendDay[]
): Day[] {
  const covered = new Set(spend.map((row) => row.spend_date));
  return daysInPeriod(period.start, period.end).filter((day) => !covered.has(day));
}

export function sumAdSpend(spend: SpendDay[]): number {
  return round2(spend.reduce((total, row) => total + Number(row.amount), 0));
}

/**
 * DA fees attributed to the period. Charges whose period overlaps the window
 * contribute their full total once they have left draft — a draft is still
 * being assembled and is not yet a fee the client has been told about.
 */
export function sumDaFees(
  period: { start: Day; end: Day },
  charges: FeeCharge[]
): number {
  let total = 0;
  for (const charge of charges) {
    if (!FEE_STATUSES.has(charge.status)) continue;
    if (charge.period_end < period.start || charge.period_start > period.end) continue;
    total += Number(charge.total);
  }
  return round2(total);
}

export function countConfirmed(
  period: { start: Day; end: Day },
  appointments: ConfirmedAppointment[]
): number {
  return appointments.filter(
    (appointment) =>
      appointment.confirmed_on >= period.start && appointment.confirmed_on <= period.end
  ).length;
}

export function combinedCost(input: {
  period: { start: Day; end: Day };
  spend: SpendDay[];
  charges: FeeCharge[];
  appointments: ConfirmedAppointment[];
}): CostBreakdown {
  const missing = missingSpendDays(input.period, input.spend);
  const adSpend = sumAdSpend(
    input.spend.filter(
      (row) => row.spend_date >= input.period.start && row.spend_date <= input.period.end
    )
  );
  const daFees = sumDaFees(input.period, input.charges);
  const confirmedCount = countConfirmed(input.period, input.appointments);
  const combined = round2(adSpend + daFees);

  if (missing.length > 0) {
    return {
      period: input.period,
      adSpend,
      daFees,
      combined,
      confirmedCount,
      costPerAppointment: null,
      unavailableReason:
        missing.length === 1
          ? `Ad spend for ${missing[0]} has not been entered.`
          : `Ad spend is missing for ${missing.length} days in this period.`,
      missingSpendDays: missing,
    };
  }

  if (confirmedCount === 0) {
    return {
      period: input.period,
      adSpend,
      daFees,
      combined,
      confirmedCount,
      costPerAppointment: null,
      unavailableReason: "No confirmed appointments in this period.",
      missingSpendDays: [],
    };
  }

  return {
    period: input.period,
    adSpend,
    daFees,
    combined,
    confirmedCount,
    costPerAppointment: round2(combined / confirmedCount),
    unavailableReason: null,
    missingSpendDays: [],
  };
}

/**
 * The last complete calendar week, Monday–Sunday UTC. A week that is still in
 * progress never contributes to a summary or a default dashboard window.
 */
export function lastCompleteWeek(now: Date | number = Date.now()): {
  start: Day;
  end: Day;
} {
  const date = new Date(now);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const dow = new Date(today).getUTCDay(); // 0 Sun … 6 Sat
  // Most recent Sunday that has fully elapsed. If today is Sunday, take the
  // previous one — today's week is still open until midnight.
  const daysBackToSunday = dow === 0 ? 7 : dow;
  const endMs = today - daysBackToSunday * 24 * 60 * 60 * 1000;
  const startMs = endMs - 6 * 24 * 60 * 60 * 1000;
  return {
    start: new Date(startMs).toISOString().slice(0, 10),
    end: new Date(endMs).toISOString().slice(0, 10),
  };
}
