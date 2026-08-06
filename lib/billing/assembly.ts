/**
 * Charge assembly.
 *
 * At cycle close the system gathers every appointment for that client that is
 * confirmed, whose review window has fully elapsed, and which is not already
 * attached to a charge. Appointments still inside their window do not enter the
 * charge; they carry into the next one. An appointment confirmed the day before
 * a cycle closes has not had its window, and charging for it is the precise
 * scenario that produces a chargeback.
 *
 * Disputed appointments cannot appear here at all: only `confirmed` qualifies,
 * and a dispute moves an appointment out of that status the moment it is raised.
 */

import {
  advanceClose,
  dueClose,
  periodFor,
  type CyclePeriod,
  type Day,
} from "@/lib/billing/cycle";
import {
  describeMinimum,
  monthEnd,
  monthStart,
  monthToAssess,
  round2,
  shortfall,
  MINIMUM_LINE_LABEL,
} from "@/lib/billing/minimum";
import { formatDay } from "@/lib/format";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type { Charge, Client, Credit } from "@/types/database";

export type AssemblyResult =
  | {
      kind: "assembled";
      charge: Charge;
      appointments: number;
      period: CyclePeriod;
    }
  | { kind: "skipped"; reason: string };

type Candidate = {
  id: string;
  scheduled_for: string;
  appointment_type: string | null;
  lead: { name: string | null } | null;
  notifications: { status: string }[] | null;
};

type Qualifying = {
  billable: Candidate[];
  /** Held back because the client was never told the window had opened. */
  unnotified: number;
};

const EXCLUSION_VIOLATION = "23P01";

function skipped(reason: string): AssemblyResult {
  return { kind: "skipped", reason };
}

async function qualifyingAppointments(
  db: LedgerDb,
  clientId: string,
  nowIso: string
): Promise<Qualifying> {
  const { data, error } = await db
    .from("appointments")
    .select(
      "id, scheduled_for, appointment_type, lead:leads(name), notifications:appointment_notifications(status)"
    )
    .eq("client_id", clientId)
    .eq("status", "confirmed")
    .is("charge_id", null)
    .lte("review_window_ends_at", nowIso)
    .order("scheduled_for", { ascending: true })
    .returns<Candidate[]>();

  if (error) {
    throw new Error(`Could not read the appointments due to be charged: ${error.message}`);
  }

  const rows = data ?? [];

  // An appointment whose confirmation never reached the client cannot be
  // charged for. It carries forward rather than being dropped, and the
  // undelivered notice is what the attention view is pointing at.
  const billable = rows.filter((row) =>
    (row.notifications ?? []).some((notice) => notice.status === "sent")
  );

  return { billable, unnotified: rows.length - billable.length };
}

/** What this client has already been billed for appointments held in a month. */
async function billedInMonth(
  db: LedgerDb,
  clientId: string,
  month: Day
): Promise<number> {
  const { data, error } = await db
    .from("appointments")
    .select("rate_applied")
    .eq("client_id", clientId)
    .gte("scheduled_for", `${month}T00:00:00Z`)
    .lte("scheduled_for", `${monthEnd(month)}T23:59:59Z`)
    .not("charge_id", "is", null)
    .returns<{ rate_applied: number | null }[]>();

  if (error) {
    throw new Error(`Could not total what has been billed this month: ${error.message}`);
  }

  return round2(
    (data ?? []).reduce((total, row) => total + Number(row.rate_applied ?? 0), 0)
  );
}

async function minimumAlreadySettled(
  db: LedgerDb,
  clientId: string,
  month: Day
): Promise<boolean> {
  const { data } = await db
    .from("charges")
    .select("id")
    .eq("client_id", clientId)
    .eq("minimum_month", month)
    .limit(1)
    .returns<{ id: string }[]>()
    .maybeSingle();

  return data !== null && data !== undefined;
}

async function advanceCycle(
  db: LedgerDb,
  client: Client,
  close: Day,
  on: Day
): Promise<void> {
  await db
    .from("clients")
    .update({
      last_cycle_close: close,
      next_cycle_close: advanceClose(close, client.billing_cycle_days, on),
    })
    .eq("id", client.id);
}

/**
 * Credits reduce the next charge. A credit larger than the charge is applied as
 * far as it goes and the remainder is written back as a fresh credit, so
 * nothing is quietly forgiven in either direction.
 */
async function applyCredits(
  db: LedgerDb,
  clientId: string,
  chargeId: string,
  payable: number,
  startSort: number
): Promise<number> {
  if (payable <= 0) return 0;

  const { data } = await db
    .from("credits")
    .select("*")
    .eq("client_id", clientId)
    .is("applied_charge_id", null)
    .order("created_at", { ascending: true })
    .returns<Credit[]>();

  let remaining = payable;
  let applied = 0;
  let sort = startSort;

  for (const credit of data ?? []) {
    if (remaining <= 0) break;

    const amount = round2(Math.min(Number(credit.amount), remaining));
    const leftover = round2(Number(credit.amount) - amount);

    await db.from("charge_lines").insert({
      charge_id: chargeId,
      kind: "credit",
      credit_id: credit.id,
      description: `Credit — ${credit.reason}`,
      amount: -amount,
      sort: (sort += 1),
    });

    await db
      .from("credits")
      .update({ applied_charge_id: chargeId, applied_at: new Date().toISOString() })
      .eq("id", credit.id);

    if (leftover > 0) {
      await db.from("credits").insert({
        client_id: clientId,
        amount: leftover,
        reason: `${credit.reason} (carried forward from a credit larger than that charge)`,
        appointment_id: credit.appointment_id,
        created_by: credit.created_by,
        created_by_label: credit.created_by_label,
      });
    }

    remaining = round2(remaining - amount);
    applied = round2(applied + amount);
  }

  return applied;
}

export async function assembleCharge(
  db: LedgerDb,
  client: Client,
  on: Day,
  nowIso: string
): Promise<AssemblyResult> {
  const close = dueClose(client.next_cycle_close, client.billing_cycle_days, on);

  if (close === null) {
    return skipped(
      client.next_cycle_close === null
        ? "No cycle is running: the client has never been activated."
        : `Cycle is not due until ${formatDay(client.next_cycle_close)}.`
    );
  }

  const activatedOn = (client.activated_at ?? client.created_at).slice(0, 10);
  const period = periodFor({ lastClose: client.last_cycle_close, activatedOn, close });

  const { billable: candidates, unnotified } = await qualifyingAppointments(
    db,
    client.id,
    nowIso
  );
  const heldBack =
    unnotified === 0
      ? ""
      : ` ${unnotified} appointment${unnotified === 1 ? " is" : "s are"} held back because the confirmation never reached the client.`;
  const rate = round2(Number(client.rate_per_appointment));
  const subtotal = round2(candidates.length * rate);

  // The minimum is assessed on the first close after the month ends, against
  // everything billed for appointments held in that month — including the ones
  // about to be attached here.
  const month = monthToAssess(close);
  let minimum = 0;

  const activeInMonth =
    client.activated_at !== null && client.activated_at.slice(0, 10) <= monthEnd(month);

  if (
    Number(client.monthly_minimum) > 0 &&
    activeInMonth &&
    !(await minimumAlreadySettled(db, client.id, month))
  ) {
    const already = await billedInMonth(db, client.id, month);
    const inThisCharge = round2(
      candidates.filter((row) => monthStart(row.scheduled_for.slice(0, 10)) === month).length *
        rate
    );

    minimum = shortfall(Number(client.monthly_minimum), round2(already + inThisCharge));
  }

  if (candidates.length === 0 && minimum === 0) {
    await advanceCycle(db, client, close, on);
    return skipped(
      `Nothing to bill for ${period.start} to ${period.end}: no appointment had come out of its review window, and no minimum was due.${heldBack}`
    );
  }

  const { data: charge, error } = await db
    .from("charges")
    .insert({
      client_id: client.id,
      period_start: period.start,
      period_end: period.end,
      appointment_count: candidates.length,
      appointments_subtotal: subtotal,
      minimum_adjustment: minimum,
      minimum_month: minimum > 0 ? month : null,
      total: round2(subtotal + minimum),
      status: "draft",
    })
    .select("*")
    .returns<Charge[]>()
    .single();

  if (error || !charge) {
    if (error?.code === EXCLUSION_VIOLATION) {
      // Another run got there first. Never two charges for overlapping periods.
      await advanceCycle(db, client, close, on);
      return skipped(
        `A charge already covers ${period.start} to ${period.end}, so nothing was assembled.`
      );
    }

    throw new Error(`Could not open the charge: ${error?.message ?? "no row returned"}`);
  }

  // The rate is written onto the appointment here, at assembly, so a later rate
  // change never alters what a past appointment was billed at.
  if (candidates.length > 0) {
    const { error: attachError } = await db
      .from("appointments")
      .update({ charge_id: charge.id, rate_applied: rate })
      .in(
        "id",
        candidates.map((row) => row.id)
      )
      .eq("status", "confirmed");

    if (attachError) {
      throw new Error(`Could not attach the appointments: ${attachError.message}`);
    }
  }

  let sort = 0;
  for (const candidate of candidates) {
    await db.from("charge_lines").insert({
      charge_id: charge.id,
      kind: "appointment",
      appointment_id: candidate.id,
      description: `${formatDay(candidate.scheduled_for)} — ${
        candidate.lead?.name ?? "Unnamed lead"
      }${candidate.appointment_type ? ` · ${candidate.appointment_type}` : ""}`,
      amount: rate,
      sort: (sort += 1),
    });
  }

  if (minimum > 0) {
    // Its own labelled line. Never absorbed into the per-appointment figure.
    // The appointments above are attached by now, so this total is the one the
    // client will count on their own invoice.
    const billed = await billedInMonth(db, client.id, month);

    await db.from("charge_lines").insert({
      charge_id: charge.id,
      kind: "minimum_adjustment",
      description: describeMinimum(month, Number(client.monthly_minimum), billed),
      amount: minimum,
      sort: (sort += 1),
    });
  }

  const credits = await applyCredits(
    db,
    client.id,
    charge.id,
    round2(subtotal + minimum),
    sort
  );

  const { data: settled } = await db
    .from("charges")
    .update({
      credits_applied: credits,
      total: round2(subtotal + minimum - credits),
    })
    .eq("id", charge.id)
    .select("*")
    .returns<Charge[]>()
    .maybeSingle();

  await advanceCycle(db, client, close, on);

  return {
    kind: "assembled",
    charge: settled ?? charge,
    appointments: candidates.length,
    period,
  };
}

export { MINIMUM_LINE_LABEL };
