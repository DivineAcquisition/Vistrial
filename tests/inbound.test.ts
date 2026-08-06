import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  processStoredEvent,
  receiveInboundEvent,
  type LedgerDb,
} from "@/lib/ingest/pipeline";
import {
  computeResponseTimes,
  formatDuration,
  formatResponse,
} from "@/lib/response-time";
import { FakeDb, type Row } from "@/tests/support/fake-db";

const SECRET = "secret-northgate";

type Context = { db: FakeDb; ledger: LedgerDb; client: Row };

function setup(client: Row = {}): Context {
  const db = new FakeDb();
  const seeded = db.seed("clients", {
    name: "Northgate Roofing",
    webhook_secret: SECRET,
    ...client,
  });

  return { db, ledger: db as unknown as LedgerDb, client: seeded };
}

async function post(
  context: Context,
  payload: unknown,
  options: { secret?: string | null; receivedAt?: string; rawBody?: string } = {}
) {
  const receipt = await receiveInboundEvent(
    {
      secret: options.secret === undefined ? SECRET : options.secret,
      rawBody: options.rawBody ?? JSON.stringify(payload),
      receivedAt: options.receivedAt,
    },
    context.ledger
  );

  // The endpoint acknowledges first and processes afterwards; the tests drive
  // the deferred work the route hands to `after()`.
  if (receipt.process) await receipt.process();

  return receipt;
}

const lead = (extra: Record<string, unknown> = {}) => ({
  event_type: "lead.received",
  event_id: "evt-lead-1",
  occurred_at: "2026-03-01T09:00:00.000Z",
  name: "Dana Whitfield",
  phone: "+1 (555) 010-4477",
  email: "Dana@Example.com",
  job_type: "Roof replacement",
  ...extra,
});

const touch = (type: "touch.system" | "touch.human", at: string, extra = {}) => ({
  event_type: type,
  event_id: `evt-${type}-${at}`,
  occurred_at: at,
  phone: "+1 (555) 010-4477",
  channel: type === "touch.human" ? "call" : "sms",
  ...extra,
});

const MINUTE = 60 * 1000;

describe("authentication", () => {
  it("rejects a missing secret before parsing and records nothing", async () => {
    const context = setup();

    const receipt = await post(context, lead(), { secret: null });

    assert.equal(receipt.status, 401);
    assert.equal(receipt.process, null);
    assert.equal(context.db.rows("inbound_events").length, 0);
    assert.equal(context.db.rows("leads").length, 0);
  });

  it("rejects an unmatched secret before parsing and records nothing", async () => {
    const context = setup();

    const receipt = await post(context, lead(), { secret: "not-the-secret" });

    assert.equal(receipt.status, 401);
    assert.equal(context.db.rows("inbound_events").length, 0);
    assert.equal(context.db.rows("leads").length, 0);
  });
});

describe("logging before processing", () => {
  it("stores a payload that cannot be parsed and still returns success", async () => {
    const context = setup();

    const receipt = await post(context, null, { rawBody: "{not json" });

    assert.equal(receipt.status, 200);

    const [event] = context.db.rows("inbound_events");
    assert.equal(context.db.rows("inbound_events").length, 1);
    assert.equal(event.status, "unknown");
    assert.deepEqual(event.payload, { unparsed: "{not json" });
    assert.match(String(event.error), /not valid JSON/);
    assert.equal(context.db.rows("leads").length, 0);
  });

  it("stores the payload verbatim alongside the lead it creates", async () => {
    const context = setup();

    await post(context, lead());

    const [event] = context.db.rows("inbound_events");
    assert.equal((event.payload as Record<string, unknown>).event_id, "evt-lead-1");
    assert.equal(event.status, "processed");
    assert.equal(event.canonical_type, "lead_received");
  });
});

describe("idempotency", () => {
  it("produces one lead when the same event is delivered twice", async () => {
    const context = setup();

    const first = await post(context, lead());
    const second = await post(context, lead());

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicate, true);
    assert.equal(context.db.rows("leads").length, 1);
    assert.equal(context.db.rows("inbound_events").length, 1);
  });

  it("falls back to client, contact, and timestamp when no event id is supplied", async () => {
    const context = setup();
    const payload = lead();
    delete (payload as Record<string, unknown>).event_id;

    await post(context, payload);
    const second = await post(context, payload);

    assert.equal(second.body.duplicate, true);
    assert.equal(context.db.rows("leads").length, 1);
  });
});

describe("client resolution", () => {
  it("stores a location mismatch as unattributed rather than trusting it", async () => {
    const context = setup({ ghl_location_id: "loc-northgate" });

    const receipt = await post(context, lead({ location_id: "loc-somewhere-else" }));

    assert.equal(receipt.status, 200);

    const [event] = context.db.rows("inbound_events");
    assert.equal(event.status, "unattributed");
    assert.equal(event.client_id, null);
    assert.equal(event.location_mismatch, true);
    assert.equal(context.db.rows("leads").length, 0);
  });

  it("processes an unattributed event once an admin assigns it to a client", async () => {
    const context = setup({ ghl_location_id: "loc-northgate" });
    await post(context, lead({ location_id: "loc-somewhere-else" }));

    const [event] = context.db.rows("inbound_events");
    const result = await processStoredEvent(context.ledger, String(event.id), {
      clientId: String(context.client.id),
      note: "Attributed by an admin.",
    });

    assert.equal(result.ok, true);
    assert.equal(context.db.rows("leads").length, 1);
    assert.equal(context.db.rows("inbound_events")[0].status, "processed");
  });
});

describe("unrecognised events", () => {
  it("returns success, stores the event as unknown, and stamps nothing", async () => {
    const context = setup();

    const receipt = await post(context, {
      event_type: "widget.exploded",
      phone: "+1 (555) 010-4477",
    });

    assert.equal(receipt.status, 200);

    const [event] = context.db.rows("inbound_events");
    assert.equal(event.status, "unknown");
    assert.equal(event.event_type, "widget.exploded");
    assert.equal(context.db.rows("leads").length, 0);
    assert.equal(context.db.rows("touches").length, 0);
  });

  it("records the failure on the stored event when a recognised event cannot be processed", async () => {
    const context = setup();

    const receipt = await post(context, touch("touch.system", "2026-03-01T09:02:00.000Z"));

    assert.equal(receipt.status, 200);

    const [event] = context.db.rows("inbound_events");
    assert.equal(event.status, "failed");
    assert.match(String(event.error), /No lead matches/);
    assert.equal(context.db.rows("touches").length, 0);
  });
});

describe("duplicate resolution", () => {
  it("links a second submission to the original and keeps its clock and touches", async () => {
    const context = setup();

    await post(context, lead());
    await post(context, touch("touch.system", "2026-03-01T09:02:00.000Z"));

    await post(
      context,
      lead({
        event_id: "evt-lead-2",
        occurred_at: "2026-03-03T18:00:00.000Z",
        email: "dana@example.com",
      })
    );

    const leads = context.db.rows("leads");
    assert.equal(leads.length, 1);
    assert.equal(leads[0].arrived_at, "2026-03-01T09:00:00.000Z");
    assert.equal(context.db.rows("touches").length, 1);

    const submissions = context.db.rows("lead_submissions");
    assert.equal(submissions.length, 2);
    assert.equal(submissions[0].is_original, true);
    assert.equal(submissions[1].is_original, false);
    assert.equal(submissions[1].submitted_at, "2026-03-03T18:00:00.000Z");
  });

  it("treats a submission outside the window as a genuinely new lead", async () => {
    const context = setup();

    await post(context, lead());
    await post(
      context,
      lead({ event_id: "evt-lead-late", occurred_at: "2026-11-01T09:00:00.000Z" })
    );

    assert.equal(context.db.rows("leads").length, 2);
  });

  it("honours a per-client window", async () => {
    const context = setup({ duplicate_window_days: 1 });

    await post(context, lead());
    await post(
      context,
      lead({ event_id: "evt-lead-3", occurred_at: "2026-03-04T09:00:00.000Z" })
    );

    assert.equal(context.db.rows("leads").length, 2);
  });
});

describe("touch stamping", () => {
  it("stamps a system touch on the first occurrence only", async () => {
    const context = setup();

    await post(context, lead());
    await post(context, touch("touch.system", "2026-03-01T09:02:00.000Z"));
    await post(context, touch("touch.system", "2026-03-01T09:40:00.000Z"));

    const touches = context.db.rows("touches");
    assert.equal(touches.length, 2);
    assert.equal(touches[0].is_first_of_type, true);
    assert.equal(touches[1].is_first_of_type, false);

    const times = computeResponseTimes(
      String(context.db.rows("leads")[0].arrived_at),
      touches.map(asTouch)
    );
    assert.equal(times.systemMs, 2 * MINUTE);
  });

  it("stamps a human touch on the first occurrence only", async () => {
    const context = setup();

    await post(context, lead());
    await post(context, touch("touch.human", "2026-03-01T09:10:00.000Z"));
    await post(context, touch("touch.human", "2026-03-01T10:30:00.000Z"));

    const touches = context.db.rows("touches");
    assert.equal(touches.length, 2);
    assert.equal(touches.filter((row) => row.is_first_of_type === true).length, 1);

    const times = computeResponseTimes(
      String(context.db.rows("leads")[0].arrived_at),
      touches.map(asTouch)
    );
    assert.equal(times.humanMs, 10 * MINUTE);
  });

  it("stamps nothing when the payload does not declare system or human", async () => {
    const context = setup();
    await post(context, lead());

    await post(context, {
      event_type: "message.sent",
      event_id: "evt-ambiguous",
      occurred_at: "2026-03-01T09:05:00.000Z",
      phone: "+1 (555) 010-4477",
      channel: "sms",
    });

    const event = context.db
      .rows("inbound_events")
      .find((row) => row.event_type === "message.sent");

    assert.equal(event?.status, "unclassified");
    assert.equal(context.db.rows("touches").length, 0);

    const result = await processStoredEvent(context.ledger, String(event?.id), {
      canonicalType: "human_touch",
      note: "Classified by an admin.",
    });

    assert.equal(result.ok, true);
    assert.equal(context.db.rows("touches").length, 1);
    assert.equal(context.db.rows("touches")[0].touch_type, "human");
  });

  it("reads a declared actor rather than inferring one", async () => {
    const context = setup();
    await post(context, lead());

    await post(context, {
      event_type: "message.sent",
      event_id: "evt-declared",
      occurred_at: "2026-03-01T09:03:00.000Z",
      phone: "+1 (555) 010-4477",
      actor: "workflow",
      channel: "sms",
    });

    const touches = context.db.rows("touches");
    assert.equal(touches.length, 1);
    assert.equal(touches[0].touch_type, "system");
  });
});

describe("response time", () => {
  it("is derived on read and stored on no record", async () => {
    const context = setup();

    await post(context, lead());
    await post(context, touch("touch.system", "2026-03-01T09:02:00.000Z"));

    const stored = context.db.rows("leads")[0];
    const columns = Object.keys(stored).join(" ");
    assert.doesNotMatch(columns, /response/i);

    const times = computeResponseTimes(
      String(stored.arrived_at),
      context.db.rows("touches").map(asTouch)
    );

    assert.equal(times.systemMs, 2 * MINUTE);
    assert.equal(times.humanMs, null);
    assert.equal(times.gapMs, null);
  });

  it("renders an unanswered lead as awaiting rather than zero", () => {
    const times = computeResponseTimes("2026-03-01T09:00:00.000Z", []);

    assert.equal(times.humanMs, null);
    assert.equal(formatResponse(times.humanMs), "Awaiting");
    assert.notEqual(formatResponse(times.humanMs), "0s");
  });

  it("measures raw clock time with no business-hours adjustment", async () => {
    const context = setup();

    await post(context, lead({ occurred_at: "2026-03-01T21:00:00.000Z" }));
    await post(context, touch("touch.human", "2026-03-02T09:00:00.000Z"));

    const times = computeResponseTimes(
      String(context.db.rows("leads")[0].arrived_at),
      context.db.rows("touches").map(asTouch)
    );

    assert.equal(times.humanMs, 12 * 60 * MINUTE);
    assert.equal(formatDuration(times.humanMs ?? 0), "12h");
  });

  it("reports the gap between the automated and the human answer", async () => {
    const context = setup();

    await post(context, lead());
    await post(context, touch("touch.system", "2026-03-01T09:02:00.000Z"));
    await post(context, touch("touch.human", "2026-03-01T09:20:00.000Z"));

    const times = computeResponseTimes(
      String(context.db.rows("leads")[0].arrived_at),
      context.db.rows("touches").map(asTouch)
    );

    assert.equal(times.gapMs, 18 * MINUTE);
  });
});

describe("attribution", () => {
  it("creates a campaign that does not exist yet rather than dropping it", async () => {
    const context = setup();

    await post(context, lead({ utm_campaign: "fall-roofing", utm_medium: "cpc" }));
    await post(
      context,
      lead({
        event_id: "evt-other-person",
        utm_campaign: "fall-roofing",
        utm_medium: "cpc",
        phone: "+1 (555) 010-9911",
        email: "sam@example.com",
      })
    );

    const campaigns = context.db.rows("campaigns");
    assert.equal(campaigns.length, 1);
    assert.equal(campaigns[0].utm_campaign, "fall-roofing");

    const leads = context.db.rows("leads");
    assert.equal(leads.length, 2);
    assert.equal(leads[0].campaign_id, campaigns[0].id);
    assert.equal(leads[0].source, "Paid");
  });

  it("marks a lead with no resolvable campaign as direct and still keeps it", async () => {
    const context = setup();

    await post(context, lead());

    const [stored] = context.db.rows("leads");
    assert.equal(stored.campaign_id, null);
    assert.equal(stored.source, "Direct");
  });
});

describe("arrival timestamp", () => {
  it("uses the provider timestamp and records that it did", async () => {
    const context = setup();

    await post(context, lead(), { receivedAt: "2026-03-01T09:00:30.000Z" });

    const [stored] = context.db.rows("leads");
    assert.equal(stored.arrived_at, "2026-03-01T09:00:00.000Z");
    assert.equal(stored.arrival_source, "payload");
  });

  it("falls back to the moment of receipt and records that too", async () => {
    const context = setup();
    const payload = lead();
    delete (payload as Record<string, unknown>).occurred_at;

    await post(context, payload, { receivedAt: "2026-03-01T09:00:30.000Z" });

    const [stored] = context.db.rows("leads");
    assert.equal(stored.arrived_at, "2026-03-01T09:00:30.000Z");
    assert.equal(stored.arrival_source, "received");
  });
});

describe("contact updates", () => {
  it("revises the lead without creating anything or moving its clock", async () => {
    const context = setup();
    await post(context, lead());

    await post(context, {
      event_type: "contact.updated",
      event_id: "evt-update",
      occurred_at: "2026-03-01T11:00:00.000Z",
      phone: "+1 (555) 010-4477",
      email: "dana.whitfield@example.com",
      name: "Dana Whitfield-Reyes",
    });

    const leads = context.db.rows("leads");
    assert.equal(leads.length, 1);
    assert.equal(leads[0].name, "Dana Whitfield-Reyes");
    assert.equal(leads[0].email, "dana.whitfield@example.com");
    assert.equal(leads[0].arrived_at, "2026-03-01T09:00:00.000Z");
  });
});

function asTouch(row: Row) {
  return {
    touch_type: row.touch_type as "system" | "human",
    occurred_at: String(row.occurred_at),
    is_first_of_type: row.is_first_of_type === true,
  };
}
