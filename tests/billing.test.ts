import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

import { assembleCharge } from "@/lib/billing/assembly";
import { addDays, advanceClose, dueClose, periodFor } from "@/lib/billing/cycle";
import { runCycleJob } from "@/lib/billing/job";
import {
  monthEnd,
  monthStart,
  monthToAssess,
  shortfall,
} from "@/lib/billing/minimum";
import { MAX_ATTEMPTS, RETRY_DELAY_HOURS } from "@/lib/billing/processing";
import type { PaymentPort } from "@/lib/billing/processing";
import type { LedgerDb } from "@/lib/supabase/ledger";
import { FakeDb, type Row } from "@/tests/support/fake-db";
import type { Client } from "@/types/database";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Every email in these tests "arrives" unless a case says otherwise. */
let deliverEmail = true;

before(() => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.NOTIFICATION_FROM = "Vistrial <ledger@example.test>";

  globalThis.fetch = (async () =>
    deliverEmail
      ? new Response(JSON.stringify({ id: "email_1" }), { status: 200 })
      : new Response("mailbox full", { status: 422 })) as typeof fetch;
});

beforeEach(() => {
  deliverEmail = true;
});

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const NOW = new Date("2026-04-15T09:00:00.000Z");

type Context = { db: FakeDb; ledger: LedgerDb; client: Client };

function setup(overrides: Row = {}): Context {
  const db = new FakeDb();

  const client = db.seed("clients", {
    name: "Northgate Roofing",
    contact_email: "ops@northgate.test",
    status: "Active",
    rate_per_appointment: 150,
    monthly_minimum: 0,
    billing_cycle_days: 14,
    review_window_hours: 72,
    stripe_customer_id: "cus_test",
    stripe_payment_method_id: "pm_test",
    card_brand: "visa",
    card_last4: "4242",
    activated_at: "2026-04-01T00:00:00.000Z",
    last_cycle_close: "2026-04-01",
    next_cycle_close: "2026-04-15",
    ...overrides,
  }) as unknown as Client;

  db.seed("leads", { client_id: client.id, name: "Dana Whitfield" });

  return { db, ledger: db as unknown as LedgerDb, client };
}

/**
 * The fake returns whole rows, so the embedded lead and notification records
 * that PostgREST would nest are seeded in the shape the query asks for.
 */
function appointment(
  context: Context,
  overrides: Row & { notified?: boolean } = {}
): Row {
  const { notified = true, ...rest } = overrides;

  return context.db.seed("appointments", {
    client_id: context.client.id,
    lead_id: context.db.rows("leads")[0].id,
    definition_version: 1,
    status: "confirmed",
    scheduled_for: "2026-04-08T14:00:00.000Z",
    review_window_ends_at: "2026-04-11T14:00:00.000Z",
    charge_id: null,
    rate_applied: null,
    last_actor: "admin",
    lead: { name: "Dana Whitfield" },
    notifications: notified ? [{ status: "sent" }] : [{ status: "failed" }],
    ...rest,
  });
}

const charges = (context: Context) => context.db.rows("charges");
const lines = (context: Context) => context.db.rows("charge_lines");

async function assemble(context: Context, now: Date = NOW) {
  return assembleCharge(
    context.ledger,
    context.client,
    now.toISOString().slice(0, 10),
    now.toISOString()
  );
}

/* -------------------------------------------------------------------------- */
/* Cycle arithmetic                                                            */
/* -------------------------------------------------------------------------- */

describe("cycle arithmetic", () => {
  it("anchors to the activation date rather than the calendar", () => {
    // Activated on the ninth, fourteen day cycle: closes on the twenty-third
    // and the sixth thereafter.
    assert.equal(addDays("2026-04-09", 14), "2026-04-23");
    assert.equal(addDays("2026-04-23", 14), "2026-05-07");
  });

  it("is not due before its close", () => {
    assert.equal(dueClose("2026-04-23", 14, "2026-04-22"), null);
    assert.equal(dueClose(null, 14, "2026-04-22"), null);
  });

  it("closes one period when several closes have been missed", () => {
    assert.equal(dueClose("2026-04-09", 14, "2026-05-20"), "2026-05-07");
    assert.equal(advanceClose("2026-05-07", 14, "2026-05-20"), "2026-05-21");
  });

  it("leaves no day in two periods and no day in none", () => {
    const first = periodFor({
      lastClose: null,
      activatedOn: "2026-04-01",
      close: "2026-04-15",
    });
    const second = periodFor({
      lastClose: "2026-04-15",
      activatedOn: "2026-04-01",
      close: "2026-04-29",
    });

    assert.deepEqual(first, { start: "2026-04-01", end: "2026-04-15" });
    assert.deepEqual(second, { start: "2026-04-16", end: "2026-04-29" });
  });
});

describe("the monthly minimum", () => {
  it("settles the month before the one the cycle closes in", () => {
    assert.equal(monthToAssess("2026-04-06"), "2026-03-01");
    assert.equal(monthToAssess("2026-01-02"), "2025-12-01");
  });

  it("knows where a month ends, including February", () => {
    assert.equal(monthEnd("2026-04-01"), "2026-04-30");
    assert.equal(monthEnd("2024-02-01"), "2024-02-29");
    assert.equal(monthStart("2026-04-17"), "2026-04-01");
  });

  it("is the difference, and never negative", () => {
    assert.equal(shortfall(1000, 450), 550);
    assert.equal(shortfall(1000, 1200), 0);
    assert.equal(shortfall(0, 0), 0);
  });
});

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

describe("charge assembly", () => {
  it("takes appointments whose review window has fully elapsed", async () => {
    const context = setup();
    appointment(context);
    appointment(context, { scheduled_for: "2026-04-09T14:00:00.000Z" });

    const result = await assemble(context);

    assert.equal(result.kind, "assembled");
    assert.equal(charges(context).length, 1);
    assert.equal(charges(context)[0].appointment_count, 2);
    assert.equal(charges(context)[0].total, 300);
  });

  it("leaves an appointment still inside its window for the next cycle", async () => {
    const context = setup();
    appointment(context);
    const waiting = appointment(context, {
      scheduled_for: "2026-04-20T14:00:00.000Z",
      review_window_ends_at: "2026-04-18T14:00:00.000Z",
    });

    await assemble(context);

    assert.equal(charges(context)[0].appointment_count, 1);
    assert.equal(waiting.charge_id, null);
  });

  it("never puts a disputed appointment on a charge", async () => {
    const context = setup();
    appointment(context);
    appointment(context, {
      status: "disputed",
      scheduled_for: "2026-04-09T14:00:00.000Z",
    });

    await assemble(context);

    assert.equal(charges(context)[0].appointment_count, 1);
  });

  it("holds back an appointment the client was never told about", async () => {
    const context = setup();
    appointment(context, { notified: false });

    const result = await assemble(context);

    assert.equal(result.kind, "skipped");
    assert.match(
      result.kind === "skipped" ? result.reason : "",
      /held back because the confirmation never reached the client/
    );
    assert.equal(charges(context).length, 0);
  });

  it("stamps the rate at assembly, unaffected by a later change", async () => {
    const context = setup();
    const booked = appointment(context);

    await assemble(context);
    assert.equal(booked.rate_applied, 150);

    // The client's rate goes up afterwards. The charge does not move.
    await context.ledger.from("clients").update({ rate_per_appointment: 250 }).eq("id", context.client.id);

    assert.equal(booked.rate_applied, 150);
    assert.equal(charges(context)[0].total, 150);
    assert.equal(lines(context)[0].amount, 150);
  });

  it("produces no charge at all for an empty cycle", async () => {
    const context = setup();

    const result = await assemble(context);

    assert.equal(result.kind, "skipped");
    assert.equal(charges(context).length, 0);

    // The cycle still moves on, so the next close is not permanently overdue.
    const client = context.db.rows("clients")[0];
    assert.equal(client.last_cycle_close, "2026-04-15");
    assert.equal(client.next_cycle_close, "2026-04-29");
  });

  it("never produces two charges for overlapping periods", async () => {
    const context = setup();
    appointment(context);

    await assemble(context);
    // A second run with the cycle wound back, as a duplicated job would.
    context.client.next_cycle_close = "2026-04-15";
    context.client.last_cycle_close = "2026-04-01";
    const second = await assemble(context);

    assert.equal(second.kind, "skipped");
    assert.equal(charges(context).length, 1);
  });
});

describe("the monthly minimum on a charge", () => {
  it("adds the shortfall as its own line rather than folding it in", async () => {
    const context = setup({
      monthly_minimum: 1000,
      activated_at: "2026-03-01T00:00:00.000Z",
      last_cycle_close: "2026-03-25",
      next_cycle_close: "2026-04-08",
    });

    // One appointment held in March, worth 150 against a 1000 minimum.
    appointment(context, {
      scheduled_for: "2026-03-20T14:00:00.000Z",
      review_window_ends_at: "2026-03-23T14:00:00.000Z",
    });

    await assemble(context, new Date("2026-04-08T09:00:00.000Z"));

    const charge = charges(context)[0];
    assert.equal(charge.appointments_subtotal, 150);
    assert.equal(charge.minimum_adjustment, 850);
    assert.equal(charge.total, 1000);
    assert.equal(charge.minimum_month, "2026-03-01");

    const minimumLine = lines(context).find(
      (line) => line.kind === "minimum_adjustment"
    );
    assert.ok(minimumLine, "the shortfall has a line of its own");
    assert.equal(minimumLine.amount, 850);
    assert.match(String(minimumLine.description), /Monthly minimum adjustment for March 2026/);

    // The per-appointment line is untouched by the adjustment.
    const appointmentLine = lines(context).find((line) => line.kind === "appointment");
    assert.equal(appointmentLine?.amount, 150);
  });

  it("settles a month once and never again", async () => {
    const context = setup({
      monthly_minimum: 1000,
      activated_at: "2026-03-01T00:00:00.000Z",
      last_cycle_close: "2026-03-25",
      next_cycle_close: "2026-04-08",
    });
    appointment(context, {
      scheduled_for: "2026-03-20T14:00:00.000Z",
      review_window_ends_at: "2026-03-23T14:00:00.000Z",
    });

    await assemble(context, new Date("2026-04-08T09:00:00.000Z"));

    // The next close in the same month must not top March up a second time.
    Object.assign(context.client, {
      last_cycle_close: "2026-04-08",
      next_cycle_close: "2026-04-22",
    });
    appointment(context, {
      scheduled_for: "2026-04-15T14:00:00.000Z",
      review_window_ends_at: "2026-04-18T14:00:00.000Z",
    });

    await assemble(context, new Date("2026-04-22T09:00:00.000Z"));

    const second = charges(context)[1];
    assert.equal(second.minimum_adjustment, 0);
    assert.equal(second.total, 150);
  });
});

describe("credits", () => {
  it("come off the next charge as their own line", async () => {
    const context = setup();
    appointment(context);
    appointment(context, { scheduled_for: "2026-04-09T14:00:00.000Z" });

    context.db.seed("credits", {
      client_id: context.client.id,
      amount: 100,
      reason: "Two appointments on the March charge were the same homeowner.",
    });

    await assemble(context);

    const charge = charges(context)[0];
    assert.equal(charge.appointments_subtotal, 300);
    assert.equal(charge.credits_applied, 100);
    assert.equal(charge.total, 200);

    const creditLine = lines(context).find((line) => line.kind === "credit");
    assert.equal(creditLine?.amount, -100);
    assert.equal(context.db.rows("credits")[0].applied_charge_id, charge.id);
  });

  it("carries the remainder forward when it is larger than the charge", async () => {
    const context = setup();
    appointment(context);

    context.db.seed("credits", {
      client_id: context.client.id,
      amount: 400,
      reason: "Billed in error last cycle.",
    });

    await assemble(context);

    assert.equal(charges(context)[0].total, 0);

    const remainder = context.db
      .rows("credits")
      .find((credit) => credit.applied_charge_id === null);
    assert.equal(remainder?.amount, 250);
    assert.match(String(remainder?.reason), /carried forward/);
  });
});

/* -------------------------------------------------------------------------- */
/* The job                                                                     */
/* -------------------------------------------------------------------------- */

function countingPort(result: "succeed" | "fail"): PaymentPort & { calls: string[] } {
  const calls: string[] = [];

  const port = (async (input) => {
    calls.push(input.idempotencyKey);

    return result === "succeed"
      ? { ok: true as const, reference: `pi_${calls.length}` }
      : {
          ok: false as const,
          code: "card_declined",
          message: "Your card was declined.",
          retryable: false,
        };
  }) as PaymentPort & { calls: string[] };

  port.calls = calls;
  return port;
}

describe("the cycle job", () => {
  it("assembles and notifies, but does not charge on the same run", async () => {
    const context = setup();
    appointment(context);
    const pay = countingPort("succeed");

    const summary = await runCycleJob(context.ledger, { now: NOW, pay });

    assert.equal(summary.assembled, 1);
    assert.equal(summary.notified, 1);
    assert.equal(summary.processed, 0);
    assert.equal(pay.calls.length, 0);

    const charge = charges(context)[0];
    assert.equal(charge.status, "notified");
    // At least twenty-four hours between being told and being charged.
    assert.ok(
      Date.parse(String(charge.scheduled_for)) - NOW.getTime() >= 24 * HOUR,
      "the client gets a day's notice"
    );

    const notice = context.db.rows("charge_notifications")[0];
    assert.equal(notice.kind, "pre_charge");
    assert.equal(notice.status, "sent");
    assert.match(String(notice.body), /Dana Whitfield/);
    assert.match(String(notice.body), /Total/);
  });

  it("holds a charge whose itemisation never reached the client", async () => {
    const context = setup();
    appointment(context);
    deliverEmail = false;

    await runCycleJob(context.ledger, { now: NOW });

    const charge = charges(context)[0];
    assert.equal(charge.status, "draft");
    assert.equal(charge.notified_at, null);

    // And it still does not process a day later.
    const pay = countingPort("succeed");
    await runCycleJob(context.ledger, { now: new Date(NOW.getTime() + 2 * DAY), pay });

    assert.equal(pay.calls.length, 0);
    assert.equal(charges(context)[0].status, "draft");
  });

  it("charges once the notice period has passed, and locks the appointments", async () => {
    const context = setup();
    const booked = appointment(context);
    const pay = countingPort("succeed");

    await runCycleJob(context.ledger, { now: NOW, pay });
    await runCycleJob(context.ledger, { now: new Date(NOW.getTime() + 25 * HOUR), pay });

    const charge = charges(context)[0];
    assert.equal(charge.status, "paid");
    assert.equal(charge.stripe_payment_intent_id, "pi_1");
    assert.equal(booked.status, "billed");

    const receipt = context.db
      .rows("charge_notifications")
      .find((row) => row.kind === "receipt");
    assert.equal(receipt?.status, "sent");
  });

  it("never charges the same period twice, however often it runs", async () => {
    const context = setup();
    appointment(context);
    const pay = countingPort("succeed");

    await runCycleJob(context.ledger, { now: NOW, pay });
    await runCycleJob(context.ledger, { now: NOW, pay });
    await runCycleJob(context.ledger, { now: new Date(NOW.getTime() + 25 * HOUR), pay });
    await runCycleJob(context.ledger, { now: new Date(NOW.getTime() + 26 * HOUR), pay });
    await runCycleJob(context.ledger, { now: new Date(NOW.getTime() + 40 * HOUR), pay });

    assert.equal(charges(context).length, 1);
    assert.equal(pay.calls.length, 1);
    assert.equal(context.db.rows("charge_attempts").length, 1);
  });

  it("records every run, including the ones with nothing to do", async () => {
    const context = setup({ next_cycle_close: "2026-05-30" });

    await runCycleJob(context.ledger, { now: NOW });

    const runs = context.db.rows("job_runs");
    assert.equal(runs.length, 1);
    assert.equal(runs[0].assembled, 0);
    assert.ok(runs[0].finished_at, "the run is closed off");
  });

  it("says which client it skipped and why", async () => {
    const context = setup();

    await runCycleJob(context.ledger, { now: NOW });

    const [entry] = context.db.rows("job_run_entries");
    assert.equal(entry.action, "skipped");
    assert.equal(entry.client_id, context.client.id);
    assert.match(String(entry.detail), /no appointment had come out of its review window/);
  });
});

describe("failed payments", () => {
  async function toFirstFailure() {
    const context = setup();
    const booked = appointment(context);
    const pay = countingPort("fail");

    await runCycleJob(context.ledger, { now: NOW, pay });
    await runCycleJob(context.ledger, { now: new Date(NOW.getTime() + 25 * HOUR), pay });

    return { context, booked, pay };
  }

  it("records the reason, schedules a retry, and tells the client once", async () => {
    const { context, booked } = await toFirstFailure();

    const charge = charges(context)[0];
    assert.equal(charge.status, "failed");
    assert.equal(charge.attempts, 1);
    assert.equal(charge.failure_code, "card_declined");
    assert.match(String(charge.failure_reason), /declined by the bank/);
    assert.ok(charge.next_attempt_at, "a retry is scheduled");

    // Appointment production does not stop, and nothing is silently forgiven.
    assert.equal(booked.status, "confirmed");
    assert.equal(booked.charge_id, charge.id);

    const notices = context.db
      .rows("charge_notifications")
      .filter((row) => row.kind === "payment_failed");
    assert.equal(notices.length, 1);
    assert.match(String(notices[0].body), /card on file needs attention/);
  });

  it("retries on the schedule and stops after the last attempt", async () => {
    const { context, pay } = await toFirstFailure();

    // Not due yet.
    await runCycleJob(context.ledger, { now: new Date(NOW.getTime() + 30 * HOUR), pay });
    assert.equal(pay.calls.length, 1);

    let elapsed = 25 * HOUR;
    for (const delay of RETRY_DELAY_HOURS) {
      elapsed += delay * HOUR + HOUR;
      await runCycleJob(context.ledger, { now: new Date(NOW.getTime() + elapsed), pay });
    }

    assert.equal(pay.calls.length, MAX_ATTEMPTS);
    // Each attempt carries its own idempotency key, so none of them replays.
    assert.equal(new Set(pay.calls).size, MAX_ATTEMPTS);

    const charge = charges(context)[0];
    assert.equal(charge.attempts, MAX_ATTEMPTS);
    assert.equal(charge.next_attempt_at, null);

    const final = context.db
      .rows("charge_notifications")
      .filter((row) => row.kind === "payment_failed_final");
    assert.equal(final.length, 1);
    assert.match(String(final[0].body), /last automatic attempt/);

    // And it stops: a later run does not attempt a fourth time.
    await runCycleJob(context.ledger, { now: new Date(NOW.getTime() + 30 * DAY), pay });
    assert.equal(pay.calls.length, MAX_ATTEMPTS);
  });

  it("leaves the appointments for the next successful charge", async () => {
    const { context, booked } = await toFirstFailure();

    assert.equal(booked.status, "confirmed");
    assert.notEqual(booked.charge_id, null);
    assert.equal(charges(context)[0].status, "failed");
  });
});
