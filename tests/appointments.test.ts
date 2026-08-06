import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideCapture, type LiveAppointment } from "@/lib/appointments/capture";
import {
  billability,
  describeWindow,
  reviewWindow,
} from "@/lib/appointments/review-window";
import {
  canTransition,
  composeReason,
  isTerminal,
  REJECTION_REASONS,
  requiresNote,
} from "@/lib/appointments/status";
import { classifyEvent, normaliseEvent } from "@/lib/ingest/normalise";
import { receiveInboundEvent, type LedgerDb } from "@/lib/ingest/pipeline";
import { FakeDb, type Row } from "@/tests/support/fake-db";
import type { AppointmentStatus } from "@/types/database";

const SECRET = "secret-northgate";
const HOUR = 60 * 60 * 1000;

type Context = { db: FakeDb; ledger: LedgerDb; client: Row };

function setup(client: Row = {}): Context {
  const db = new FakeDb();
  const seeded = db.seed("clients", {
    name: "Northgate Roofing",
    webhook_secret: SECRET,
    ...client,
  });

  db.seed("appointment_definitions", {
    client_id: seeded.id,
    version: 1,
    criteria: "Homeowner inside the metro with a roof over fifteen years old.",
    service_area: "Greater Columbus",
    accepted_job_types: ["roofing"],
    effective_from: "2026-01-01T00:00:00.000Z",
  });

  return { db, ledger: db as unknown as LedgerDb, client: seeded };
}

async function post(context: Context, payload: unknown) {
  const receipt = await receiveInboundEvent(
    { secret: SECRET, rawBody: JSON.stringify(payload) },
    context.ledger
  );

  if (receipt.process) await receipt.process();
  return receipt;
}

const booking = (extra: Record<string, unknown> = {}) => ({
  event_type: "appointment.booked",
  event_id: `evt-booking-${Math.random()}`,
  appointment_id: "appt-8842",
  start_time: "2026-04-02T14:00:00.000Z",
  calendar_name: "Roof inspection",
  phone: "+1 (555) 010-4477",
  email: "Dana@Example.com",
  name: "Dana Whitfield",
  ...extra,
});

const appointments = (context: Context) => context.db.rows("appointments");

/* -------------------------------------------------------------------------- */
/* Classification                                                              */
/* -------------------------------------------------------------------------- */

describe("booking payloads", () => {
  it("recognises the booking, show, and no-show vocabularies", () => {
    const cases: [string, string][] = [
      ["appointment.booked", "appointment_booked"],
      ["AppointmentCreate", "appointment_booked"],
      ["booking.created", "appointment_booked"],
      ["appointment.showed", "appointment_showed"],
      ["appointment.no_show", "appointment_no_show"],
    ];

    for (const [declared, canonical] of cases) {
      const result = classifyEvent({ event_type: declared });
      assert.deepEqual(result.classification, { kind: "recognised", canonical });
    }
  });

  it("reads what changed from the provider's own appointment status", () => {
    const showed = classifyEvent({ event_type: "AppointmentUpdate", status: "showed" });
    const missed = classifyEvent({ event_type: "AppointmentUpdate", status: "noshow" });
    const moved = classifyEvent({ event_type: "AppointmentUpdate", status: "confirmed" });

    assert.deepEqual(showed.classification, {
      kind: "recognised",
      canonical: "appointment_showed",
    });
    assert.deepEqual(missed.classification, {
      kind: "recognised",
      canonical: "appointment_no_show",
    });
    assert.deepEqual(moved.classification, {
      kind: "recognised",
      canonical: "appointment_booked",
    });
  });

  it("never guesses at an appointment status it has no rule for", () => {
    const cancelled = classifyEvent({
      event_type: "appointment.updated",
      status: "cancelled",
    });

    assert.deepEqual(cancelled.classification, { kind: "unknown" });
  });

  it("reads the scheduled time from whichever field the provider used", () => {
    const nested = normaliseEvent({
      event_type: "appointment.booked",
      appointment: { id: "a-1", startTime: "2026-04-02T14:00:00Z", title: "Roof" },
    });

    assert.equal(nested.booking.scheduledFor, "2026-04-02T14:00:00.000Z");
    assert.equal(nested.booking.providerAppointmentId, "a-1");
    assert.equal(nested.booking.appointmentType, "Roof");
  });
});

/* -------------------------------------------------------------------------- */
/* The capture decision                                                        */
/* -------------------------------------------------------------------------- */

const live = (extra: Partial<LiveAppointment> = {}): LiveAppointment => ({
  id: "appt-1",
  scheduled_for: "2026-04-02T14:00:00.000Z",
  provider_appointment_id: null,
  ...extra,
});

describe("the capture decision", () => {
  it("creates when the lead holds nothing live", () => {
    assert.deepEqual(
      decideCapture([], {
        scheduledFor: "2026-04-02T14:00:00.000Z",
        providerAppointmentId: "appt-8842",
      }),
      { kind: "create" }
    );
  });

  it("treats the same provider booking at the same time as one appointment", () => {
    const decision = decideCapture([live({ provider_appointment_id: "appt-8842" })], {
      scheduledFor: "2026-04-02T14:00:00.000Z",
      providerAppointmentId: "appt-8842",
    });

    assert.deepEqual(decision, { kind: "duplicate", appointmentId: "appt-1" });
  });

  it("treats the same provider booking at a new time as a reschedule", () => {
    const decision = decideCapture([live({ provider_appointment_id: "appt-8842" })], {
      scheduledFor: "2026-04-09T14:00:00.000Z",
      providerAppointmentId: "appt-8842",
    });

    assert.deepEqual(decision, {
      kind: "reschedule",
      appointmentId: "appt-1",
      from: "2026-04-02T14:00:00.000Z",
    });
  });

  it("deduplicates on the slot when the provider supplied no identifier", () => {
    const decision = decideCapture([live()], {
      scheduledFor: "2026-04-02T14:00:00.000Z",
      providerAppointmentId: null,
    });

    assert.deepEqual(decision, { kind: "duplicate", appointmentId: "appt-1" });
  });

  it("reschedules the newest live appointment rather than adding a second", () => {
    const decision = decideCapture(
      [live({ id: "newest" }), live({ id: "older", scheduled_for: "2026-03-01T09:00:00Z" })],
      { scheduledFor: "2026-05-01T10:00:00.000Z", providerAppointmentId: null }
    );

    assert.deepEqual(decision, {
      kind: "reschedule",
      appointmentId: "newest",
      from: "2026-04-02T14:00:00.000Z",
    });
  });

  it("ignores the format a time arrived in", () => {
    const decision = decideCapture([live({ scheduled_for: "2026-04-02T14:00:00+00:00" })], {
      scheduledFor: "2026-04-02T14:00:00.000Z",
      providerAppointmentId: null,
    });

    assert.equal(decision.kind, "duplicate");
  });
});

/* -------------------------------------------------------------------------- */
/* Capture through the endpoint                                                */
/* -------------------------------------------------------------------------- */

describe("capturing a booking", () => {
  it("creates the lead the booking belongs to when none matches", async () => {
    const context = setup();

    await post(context, booking());

    const leads = context.db.rows("leads");
    assert.equal(leads.length, 1);
    assert.equal(leads[0].origin, "booking");
    assert.equal(appointments(context).length, 1);
    assert.equal(appointments(context)[0].lead_id, leads[0].id);
  });

  it("attaches the booking to the lead that already enquired", async () => {
    const context = setup();

    await post(context, {
      event_type: "lead.received",
      event_id: "evt-lead-1",
      occurred_at: "2026-03-28T09:00:00.000Z",
      name: "Dana Whitfield",
      phone: "+1 (555) 010-4477",
    });

    await post(context, booking());

    const leads = context.db.rows("leads");
    assert.equal(leads.length, 1);
    assert.equal(leads[0].origin, "inquiry");
    assert.equal(appointments(context)[0].lead_id, leads[0].id);
  });

  it("stamps the definition version in effect when it was created", async () => {
    const context = setup();

    context.db.seed("appointment_definitions", {
      client_id: context.client.id,
      version: 2,
      criteria: "Tightened in March.",
      effective_from: "2026-03-01T00:00:00.000Z",
    });

    await post(context, booking());

    assert.equal(appointments(context)[0].definition_version, 2);
  });

  it("produces one appointment when the same booking is delivered twice", async () => {
    const context = setup();

    await post(context, booking());
    await post(context, booking());

    assert.equal(appointments(context).length, 1);
  });

  it("reschedules rather than creating a second billable appointment", async () => {
    const context = setup();

    await post(context, booking());
    await post(context, booking({ start_time: "2026-04-09T14:00:00.000Z" }));

    const rows = appointments(context);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scheduled_for, "2026-04-09T14:00:00.000Z");
    assert.equal(rows[0].previous_scheduled_for, "2026-04-02T14:00:00.000Z");
    assert.equal(rows[0].reschedule_count, 1);

    const kinds = context.db.rows("appointment_events").map((event) => event.kind);
    assert.deepEqual(kinds, ["created", "rescheduled"]);
  });

  it("records a booking with no scheduled time as failed rather than guessing", async () => {
    const context = setup();

    await post(context, booking({ start_time: undefined }));

    const [event] = context.db.rows("inbound_events");
    assert.equal(event.status, "failed");
    assert.match(String(event.error), /no scheduled time/);
    assert.equal(appointments(context).length, 0);
  });

  it("refuses a booking that carries no way of identifying anyone", async () => {
    const context = setup();

    await post(context, booking({ phone: undefined, email: undefined }));

    const [event] = context.db.rows("inbound_events");
    assert.equal(event.status, "failed");
    assert.match(String(event.error), /no phone or email/);
    assert.equal(context.db.rows("leads").length, 0);
    assert.equal(appointments(context).length, 0);
  });
});

describe("show outcomes", () => {
  it("rejects an appointment still awaiting review when the lead did not show", async () => {
    const context = setup();
    await post(context, booking());

    await post(context, {
      event_type: "appointment.no_show",
      event_id: "evt-noshow-1",
      appointment_id: "appt-8842",
      phone: "+1 (555) 010-4477",
    });

    const [appointment] = appointments(context);
    assert.equal(appointment.status, "rejected");
    assert.equal(appointment.showed, false);
    assert.match(String(appointment.rejected_reason), /no-show/i);
  });

  it("records a show without changing the status", async () => {
    const context = setup({ bill_on: "showed" });
    await post(context, booking());

    await post(context, {
      event_type: "appointment.showed",
      event_id: "evt-showed-1",
      appointment_id: "appt-8842",
      phone: "+1 (555) 010-4477",
    });

    const [appointment] = appointments(context);
    assert.equal(appointment.showed, true);
    assert.equal(appointment.status, "pending");
  });

  it("records an outcome with no live appointment as failed", async () => {
    const context = setup();

    await post(context, {
      event_type: "appointment.showed",
      event_id: "evt-showed-2",
      phone: "+1 (555) 010-4477",
    });

    const [event] = context.db.rows("inbound_events");
    assert.equal(event.status, "failed");
  });
});

/* -------------------------------------------------------------------------- */
/* The lifecycle                                                               */
/* -------------------------------------------------------------------------- */

describe("the status lifecycle", () => {
  it("permits only the defined transitions", () => {
    const allowed: [AppointmentStatus, AppointmentStatus][] = [
      ["pending", "confirmed"],
      ["pending", "rejected"],
      ["confirmed", "disputed"],
      ["confirmed", "billed"],
      ["disputed", "confirmed"],
      ["disputed", "rejected"],
    ];

    for (const [from, to] of allowed) {
      assert.equal(canTransition(from, to), true, `${from} to ${to}`);
    }

    const refused: [AppointmentStatus, AppointmentStatus][] = [
      ["pending", "billed"],
      ["pending", "disputed"],
      ["confirmed", "rejected"],
      ["rejected", "confirmed"],
      ["rejected", "pending"],
    ];

    for (const [from, to] of refused) {
      assert.equal(canTransition(from, to), false, `${from} to ${to}`);
    }
  });

  it("never moves anything out of billed", () => {
    for (const status of ["pending", "confirmed", "rejected", "disputed", "billed"] as const) {
      assert.equal(canTransition("billed", status), false);
    }
    assert.equal(isTerminal("billed"), true);
  });

  it("requires free text only where the listed reason says nothing on its own", () => {
    assert.equal(requiresNote("other"), true);
    assert.equal(requiresNote("outside_service_area"), false);
    assert.equal(
      composeReason("outside_service_area", "40 miles out"),
      "Outside the service area — 40 miles out"
    );
    assert.equal(composeReason("other", "The homeowner is a competitor."), "The homeowner is a competitor.");
  });

  it("covers every reason the queue offers", () => {
    const codes = REJECTION_REASONS.map((reason) => reason.code);

    for (const expected of [
      "outside_service_area",
      "job_type_not_accepted",
      "existing_customer",
      "duplicate",
      "invalid_contact",
      "other",
    ]) {
      assert.ok(codes.includes(expected), expected);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The review window                                                           */
/* -------------------------------------------------------------------------- */

describe("the review window", () => {
  const now = Date.parse("2026-04-01T12:00:00.000Z");

  it("is not open until the appointment is confirmed", () => {
    assert.deepEqual(
      reviewWindow({ status: "pending", review_window_ends_at: null }, now),
      { state: "not_opened" }
    );
  });

  it("counts down in raw clock time", () => {
    const window = reviewWindow(
      { status: "confirmed", review_window_ends_at: "2026-04-02T12:00:00.000Z" },
      now
    );

    assert.deepEqual(window, {
      state: "open",
      endsAt: "2026-04-02T12:00:00.000Z",
      remainingMs: 24 * HOUR,
    });
    assert.equal(describeWindow(window), "1d left");
  });

  it("locks for billing once it has elapsed", () => {
    const window = reviewWindow(
      { status: "confirmed", review_window_ends_at: "2026-04-01T11:59:00.000Z" },
      now
    );

    assert.equal(window.state, "closed");
    assert.equal(describeWindow(window), "Closed — locked for billing");
  });

  it("holds while a dispute is open", () => {
    assert.deepEqual(
      reviewWindow(
        { status: "disputed", review_window_ends_at: "2026-04-02T12:00:00.000Z" },
        now
      ),
      { state: "held" }
    );
  });

  it("does not adjust for a weekend", () => {
    // Confirmed on a Friday evening, closing on a Monday evening: seventy-two
    // hours of clock time, not of working time.
    const friday = Date.parse("2026-04-03T18:00:00.000Z");
    const window = reviewWindow(
      { status: "confirmed", review_window_ends_at: "2026-04-06T18:00:00.000Z" },
      friday
    );

    assert.deepEqual(window, {
      state: "open",
      endsAt: "2026-04-06T18:00:00.000Z",
      remainingMs: 72 * HOUR,
    });
  });
});

describe("billability", () => {
  const now = Date.parse("2026-04-01T12:00:00.000Z");
  const closed = "2026-04-01T11:00:00.000Z";

  it("refuses anything that is not confirmed", () => {
    const result = billability(
      { status: "pending", review_window_ends_at: null, notificationStatus: "sent" },
      now
    );

    assert.equal(result.billable, false);
  });

  it("refuses while the client can still object", () => {
    const result = billability(
      {
        status: "confirmed",
        review_window_ends_at: "2026-04-02T12:00:00.000Z",
        notificationStatus: "sent",
      },
      now
    );

    assert.deepEqual(result, {
      billable: false,
      reason: "The client still has 1d to dispute.",
    });
  });

  it("refuses an appointment the client was never told about", () => {
    const result = billability(
      { status: "confirmed", review_window_ends_at: closed, notificationStatus: "failed" },
      now
    );

    assert.equal(result.billable, false);
    assert.match(
      result.billable ? "" : result.reason,
      /never told this appointment entered their review window/
    );
  });

  it("allows a notified appointment whose window has genuinely elapsed", () => {
    assert.deepEqual(
      billability(
        { status: "confirmed", review_window_ends_at: closed, notificationStatus: "sent" },
        now
      ),
      { billable: true }
    );
  });
});
