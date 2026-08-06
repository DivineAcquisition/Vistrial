import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { before, describe, it } from "node:test";

import { maximumCharge, stripeMode } from "@/lib/billing/stripe";
import { receiveStripeEvent, verifySignature } from "@/lib/billing/stripe-events";
import type { LedgerDb } from "@/lib/supabase/ledger";
import { FakeDb, type Row } from "@/tests/support/fake-db";

const SECRET = "whsec_test_secret";
const NOW = new Date("2026-08-06T12:00:00.000Z");

before(() => {
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  process.env.RESEND_API_KEY = "test-key";
  process.env.NOTIFICATION_FROM = "Vistrial <ledger@example.test>";

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ id: "email_1" }), { status: 200 })) as typeof fetch;
});

function sign(payload: string, at: Date = NOW, secret = SECRET): string {
  const timestamp = Math.floor(at.getTime() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

/* -------------------------------------------------------------------------- */
/* Signatures                                                                  */
/* -------------------------------------------------------------------------- */

describe("the Stripe signature", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "ping" });

  it("accepts a signature over the exact bytes that were sent", () => {
    assert.deepEqual(
      verifySignature({
        payload,
        header: sign(payload),
        secret: SECRET,
        now: NOW.getTime(),
      }),
      { ok: true }
    );
  });

  it("refuses a body that has been altered by a byte", () => {
    const result = verifySignature({
      payload: `${payload} `,
      header: sign(payload),
      secret: SECRET,
      now: NOW.getTime(),
    });

    assert.equal(result.ok, false);
  });

  it("refuses a signature made with another secret", () => {
    const result = verifySignature({
      payload,
      header: sign(payload, NOW, "whsec_someone_else"),
      secret: SECRET,
      now: NOW.getTime(),
    });

    assert.equal(result.ok, false);
  });

  it("refuses a replay from outside the tolerated window", () => {
    const old = new Date(NOW.getTime() - 20 * 60 * 1000);

    const result = verifySignature({
      payload,
      header: sign(payload, old),
      secret: SECRET,
      now: NOW.getTime(),
    });

    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.reason, /time window/);
  });

  it("refuses a request with no signature at all", () => {
    const result = verifySignature({ payload, header: null, secret: SECRET });
    assert.equal(result.ok, false);
  });

  it("accepts when one of several signatures matches, as during a secret roll", () => {
    const timestamp = Math.floor(NOW.getTime() / 1000);
    const good = createHmac("sha256", SECRET)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    const result = verifySignature({
      payload,
      header: `t=${timestamp},v1=${"0".repeat(64)},v1=${good}`,
      secret: SECRET,
      now: NOW.getTime(),
    });

    assert.deepEqual(result, { ok: true });
  });
});

/* -------------------------------------------------------------------------- */
/* Receiving                                                                   */
/* -------------------------------------------------------------------------- */

type Context = { db: FakeDb; ledger: LedgerDb; client: Row; charge: Row };

function setup(chargeOverrides: Row = {}): Context {
  const db = new FakeDb();

  const client = db.seed("clients", {
    name: "Northgate Roofing",
    contact_email: "ops@northgate.test",
    status: "Active",
    stripe_customer_id: "cus_northgate",
    stripe_payment_method_id: "pm_old",
  });

  const charge = db.seed("charges", {
    client_id: client.id,
    period_start: "2026-07-01",
    period_end: "2026-07-14",
    appointment_count: 2,
    appointments_subtotal: 300,
    total: 300,
    status: "processing",
    attempts: 0,
    stripe_payment_intent_id: "pi_northgate",
    ...chargeOverrides,
  });

  db.seed("charge_notifications", {
    charge_id: charge.id,
    client_id: client.id,
    kind: "pre_charge",
    status: "sent",
  });

  return { db, ledger: db as unknown as LedgerDb, client, charge };
}

async function deliver(context: Context, event: Record<string, unknown>) {
  const rawBody = JSON.stringify(event);

  const receipt = await receiveStripeEvent(context.ledger, {
    rawBody,
    signature: sign(rawBody),
    now: NOW,
  });

  if (receipt.process) await receipt.process();
  return receipt;
}

const events = (context: Context) => context.db.rows("stripe_events");
const charge = (context: Context) => context.db.rows("charges")[0];

describe("receiving a Stripe event", () => {
  it("stores the payload before interpreting it", async () => {
    const context = setup();

    await deliver(context, {
      id: "evt_ping",
      type: "invoice.created",
      livemode: true,
      data: { object: {} },
    });

    const [stored] = events(context);
    assert.equal(stored.stripe_event_id, "evt_ping");
    assert.equal(stored.livemode, true);
    assert.equal(stored.status, "ignored");
  });

  it("refuses an unsigned request without recording anything", async () => {
    const context = setup();
    const rawBody = JSON.stringify({ id: "evt_forged", type: "payment_intent.succeeded" });

    const receipt = await receiveStripeEvent(context.ledger, {
      rawBody,
      signature: null,
      now: NOW,
    });

    assert.equal(receipt.status, 400);
    assert.equal(events(context).length, 0);
  });

  it("acknowledges a redelivery without acting on it twice", async () => {
    const context = setup();

    const event = {
      id: "evt_paid",
      type: "payment_intent.succeeded",
      livemode: true,
      data: { object: { id: "pi_northgate", metadata: {} } },
    };

    await deliver(context, event);
    const second = await deliver(context, event);

    assert.equal(second.body.duplicate, true);
    assert.equal(events(context).length, 1);
    assert.equal(context.db.rows("charge_attempts").length, 1);
  });
});

describe("an outcome that arrives after the request returned", () => {
  it("settles a charge the bank accepted late", async () => {
    const context = setup();
    const appointment = context.db.seed("appointments", {
      client_id: context.client.id,
      charge_id: context.charge.id,
      status: "confirmed",
      definition_version: 1,
      scheduled_for: "2026-07-08T14:00:00.000Z",
      review_window_ends_at: "2026-07-11T14:00:00.000Z",
      last_actor: "admin",
    });

    await deliver(context, {
      id: "evt_late_success",
      type: "payment_intent.succeeded",
      livemode: true,
      data: {
        object: { id: "pi_northgate", metadata: { vistrial_charge_id: context.charge.id } },
      },
    });

    assert.equal(charge(context).status, "paid");
    assert.equal(charge(context).processor_mode, "live");
    assert.equal(appointment.status, "billed");

    const receipt = context.db
      .rows("charge_notifications")
      .find((row) => row.kind === "receipt");
    assert.equal(receipt?.status, "sent");
    assert.equal(events(context)[0].status, "processed");
  });

  it("leaves a charge that was already paid exactly as it is", async () => {
    const context = setup({ status: "paid", processed_at: NOW.toISOString() });

    await deliver(context, {
      id: "evt_repeat",
      type: "payment_intent.succeeded",
      livemode: true,
      data: { object: { id: "pi_northgate", metadata: {} } },
    });

    assert.equal(context.db.rows("charge_attempts").length, 0);
    assert.equal(events(context)[0].status, "ignored");
  });

  it("records a failure Stripe reported after the fact", async () => {
    const context = setup();

    await deliver(context, {
      id: "evt_late_failure",
      type: "payment_intent.payment_failed",
      livemode: true,
      data: {
        object: {
          id: "pi_northgate",
          metadata: {},
          last_payment_error: { code: "card_declined", message: "Your card was declined." },
        },
      },
    });

    assert.equal(charge(context).status, "failed");
    assert.equal(charge(context).failure_code, "card_declined");
    assert.match(String(charge(context).failure_reason), /declined by the bank/);
  });

  it("does not touch a charge whose outcome was already recorded", async () => {
    const context = setup({ status: "failed", attempts: 1, failure_code: "expired_card" });

    await deliver(context, {
      id: "evt_duplicate_failure",
      type: "payment_intent.payment_failed",
      livemode: true,
      data: { object: { id: "pi_northgate", metadata: {}, last_payment_error: {} } },
    });

    assert.equal(charge(context).failure_code, "expired_card");
    assert.equal(charge(context).attempts, 1);
    assert.equal(events(context)[0].status, "ignored");
  });
});

describe("chargebacks", () => {
  it("records the reversal beside a paid charge without altering it", async () => {
    const context = setup({ status: "paid", processed_at: NOW.toISOString() });

    await deliver(context, {
      id: "evt_dispute",
      type: "charge.dispute.created",
      livemode: true,
      data: {
        object: {
          id: "dp_1",
          payment_intent: "pi_northgate",
          amount: 30000,
          reason: "product_not_received",
          status: "needs_response",
        },
      },
    });

    const row = charge(context);
    assert.equal(row.status, "paid", "the charge is still paid, because it was");
    assert.equal(row.total, 300, "the total is untouched");
    assert.equal(row.chargeback_status, "open");
    assert.equal(row.chargeback_amount, 300);
    assert.equal(row.chargeback_reason, "product_not_received");
    assert.equal(row.chargeback_reference, "dp_1");
  });

  it("follows the dispute to its outcome", async () => {
    const context = setup({ status: "paid", processed_at: NOW.toISOString() });

    await deliver(context, {
      id: "evt_dispute_open",
      type: "charge.dispute.created",
      livemode: true,
      data: {
        object: { id: "dp_2", payment_intent: "pi_northgate", status: "needs_response" },
      },
    });

    await deliver(context, {
      id: "evt_dispute_closed",
      type: "charge.dispute.closed",
      livemode: true,
      data: { object: { id: "dp_2", payment_intent: "pi_northgate", status: "lost" } },
    });

    assert.equal(charge(context).chargeback_status, "lost");
  });
});

describe("payment methods Stripe tells us about", () => {
  it("follows a card the network reissued", async () => {
    const context = setup();

    await deliver(context, {
      id: "evt_card_updated",
      type: "payment_method.automatically_updated",
      livemode: true,
      data: {
        object: {
          id: "pm_new",
          customer: "cus_northgate",
          card: { brand: "visa", last4: "9991", exp_month: 4, exp_year: 2031 },
        },
      },
    });

    const client = context.db.rows("clients")[0];
    assert.equal(client.stripe_payment_method_id, "pm_new");
    assert.equal(client.card_last4, "9991");
    assert.equal(client.card_exp_year, 2031);
  });

  it("ignores a customer this ledger has never heard of", async () => {
    const context = setup();

    await deliver(context, {
      id: "evt_unknown_customer",
      type: "payment_method.automatically_updated",
      livemode: true,
      data: { object: { id: "pm_x", customer: "cus_someone_else", card: {} } },
    });

    assert.equal(events(context)[0].status, "ignored");
    assert.equal(context.db.rows("clients")[0].stripe_payment_method_id, "pm_old");
  });
});

/* -------------------------------------------------------------------------- */
/* Live mode                                                                   */
/* -------------------------------------------------------------------------- */

describe("live mode", () => {
  it("tells a live key from a test one", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    assert.equal(stripeMode(), "test");

    process.env.STRIPE_SECRET_KEY = "sk_live_abc";
    assert.equal(stripeMode(), "live");

    delete process.env.STRIPE_SECRET_KEY;
    assert.equal(stripeMode(), null);
  });

  it("has a ceiling, and lets it be raised deliberately", () => {
    delete process.env.STRIPE_MAX_CHARGE;
    assert.equal(maximumCharge(), 10_000);

    process.env.STRIPE_MAX_CHARGE = "25000";
    assert.equal(maximumCharge(), 25_000);

    process.env.STRIPE_MAX_CHARGE = "nonsense";
    assert.equal(maximumCharge(), 10_000);
    delete process.env.STRIPE_MAX_CHARGE;
  });
});
