/**
 * What Stripe tells us after the fact.
 *
 * With a test key the synchronous response to a payment request is the whole
 * story. With a live one it is not: a bank can accept after our request has
 * timed out, a payment can fail asynchronously, a card can be reissued by the
 * network, and a cardholder can reverse a payment weeks later. Each of those
 * arrives here as a webhook, and each of them changes a number that a client
 * can see.
 *
 * The shape mirrors the inbound lead webhook deliberately: authenticate, store
 * the raw payload before interpreting it, acknowledge, then process. Stripe
 * retries a failed delivery for three days, so the unique index on the event id
 * is what stops a retried success from settling the same charge twice.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { settlePaid } from "@/lib/billing/processing";
import { explainFailure, readPaymentMethod } from "@/lib/billing/stripe";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type { Charge, Client, Json } from "@/types/database";

export type Verification = { ok: true } | { ok: false; reason: string };

/** Stripe rejects anything older than this, and so do we. */
const TOLERANCE_SECONDS = 300;

/**
 * Verifies the `Stripe-Signature` header against the raw body.
 *
 * The comparison is constant time and the timestamp is checked, because a
 * signature that is merely correct is still a replay if it is old enough.
 */
export function verifySignature(input: {
  payload: string;
  header: string | null;
  secret: string;
  now?: number;
  toleranceSeconds?: number;
}): Verification {
  if (!input.header) return { ok: false, reason: "No signature was presented." };

  const parts = new Map<string, string[]>();
  for (const piece of input.header.split(",")) {
    const [key, value] = piece.split("=", 2);
    if (key === undefined || value === undefined) continue;
    parts.set(key.trim(), [...(parts.get(key.trim()) ?? []), value.trim()]);
  }

  const timestamp = parts.get("t")?.[0];
  const signatures = parts.get("v1") ?? [];

  if (timestamp === undefined || signatures.length === 0) {
    return { ok: false, reason: "The signature header was not in the expected shape." };
  }

  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) {
    return { ok: false, reason: "The signature carried no usable timestamp." };
  }

  const now = Math.floor((input.now ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? TOLERANCE_SECONDS;

  if (Math.abs(now - seconds) > tolerance) {
    return { ok: false, reason: "The signature is outside the tolerated time window." };
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${timestamp}.${input.payload}`)
    .digest();

  const matched = signatures.some((candidate) => {
    let presented: Buffer;
    try {
      presented = Buffer.from(candidate, "hex");
    } catch {
      return false;
    }

    return presented.length === expected.length && timingSafeEqual(presented, expected);
  });

  return matched ? { ok: true } : { ok: false, reason: "The signature did not match." };
}

/* -------------------------------------------------------------------------- */
/* Receiving                                                                   */
/* -------------------------------------------------------------------------- */

export type EventReceipt = {
  status: number;
  body: Record<string, Json>;
  /** Deferred until after Stripe has been acknowledged. */
  process: (() => Promise<void>) | null;
};

type StripeEvent = {
  id: string;
  type: string;
  livemode?: boolean;
  data?: { object?: Record<string, unknown> };
};

const UNIQUE_VIOLATION = "23505";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function receiveStripeEvent(
  db: LedgerDb,
  input: { rawBody: string; signature: string | null; now?: Date }
): Promise<EventReceipt> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return {
      status: 503,
      body: { ok: false, error: "STRIPE_WEBHOOK_SECRET is not configured." },
      process: null,
    };
  }

  const verified = verifySignature({
    payload: input.rawBody,
    header: input.signature,
    secret,
    now: input.now?.getTime(),
  });

  if (!verified.ok) {
    // Nothing is written for an unverified request, so an attacker cannot fill
    // the event log with payloads we would then look at.
    return { status: 400, body: { ok: false, error: verified.reason }, process: null };
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(input.rawBody) as StripeEvent;
  } catch {
    return {
      status: 400,
      body: { ok: false, error: "The body was signed but is not valid JSON." },
      process: null,
    };
  }

  if (!event.id || !event.type) {
    return {
      status: 400,
      body: { ok: false, error: "The event carried no id or type." },
      process: null,
    };
  }

  const { data: stored, error } = await db
    .from("stripe_events")
    .insert({
      stripe_event_id: event.id,
      type: event.type,
      livemode: event.livemode ?? false,
      payload: JSON.parse(input.rawBody) as Json,
    })
    .select("id")
    .returns<{ id: string }[]>()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return {
        status: 200,
        body: { ok: true, duplicate: true, message: "Event already received." },
        process: null,
      };
    }

    return { status: 503, body: { ok: false, error: error.message }, process: null };
  }

  return {
    status: 200,
    body: { ok: true, event_id: stored.id },
    process: () => runEvent(db, stored.id, event, input.now ?? new Date()),
  };
}

type Outcome = {
  status: "processed" | "ignored" | "failed";
  note?: string;
  chargeId?: string | null;
  clientId?: string | null;
  error?: string;
};

async function runEvent(
  db: LedgerDb,
  storedId: string,
  event: StripeEvent,
  now: Date
): Promise<void> {
  let outcome: Outcome;

  try {
    outcome = await handle(db, event, now);
  } catch (thrown) {
    outcome = { status: "failed", error: message(thrown) };
  }

  await db
    .from("stripe_events")
    .update({
      status: outcome.status,
      note: outcome.note ?? null,
      error: outcome.error ?? null,
      charge_id: outcome.chargeId ?? null,
      client_id: outcome.clientId ?? null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", storedId);
}

/* -------------------------------------------------------------------------- */
/* Finding what an event is about                                              */
/* -------------------------------------------------------------------------- */

function object(event: StripeEvent): Record<string, unknown> {
  return event.data?.object ?? {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

async function chargeForIntent(
  db: LedgerDb,
  intentId: string | null,
  metadataChargeId: string | null
): Promise<Charge | null> {
  if (metadataChargeId) {
    const { data } = await db
      .from("charges")
      .select("*")
      .eq("id", metadataChargeId)
      .returns<Charge[]>()
      .maybeSingle();

    if (data) return data;
  }

  if (intentId) {
    const { data } = await db
      .from("charges")
      .select("*")
      .eq("stripe_payment_intent_id", intentId)
      .returns<Charge[]>()
      .maybeSingle();

    if (data) return data;
  }

  return null;
}

async function clientForCustomer(
  db: LedgerDb,
  customerId: string | null
): Promise<Client | null> {
  if (!customerId) return null;

  const { data } = await db
    .from("clients")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .returns<Client[]>()
    .maybeSingle();

  return data ?? null;
}

/** Stripe's dispute vocabulary, reduced to the five states worth acting on. */
function chargebackStatus(status: string | null): string {
  switch (status) {
    case "warning_needs_response":
    case "warning_under_review":
    case "warning_closed":
      return "warning";
    case "needs_response":
      return "open";
    case "under_review":
      return "under_review";
    case "won":
      return "won";
    case "lost":
      return "lost";
    default:
      return "open";
  }
}

/* -------------------------------------------------------------------------- */
/* Handling                                                                    */
/* -------------------------------------------------------------------------- */

async function handle(db: LedgerDb, event: StripeEvent, now: Date): Promise<Outcome> {
  switch (event.type) {
    case "payment_intent.succeeded":
      return lateSuccess(db, event, now);
    case "payment_intent.payment_failed":
      return lateFailure(db, event);
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
      return chargeback(db, event, now);
    case "setup_intent.succeeded":
    case "payment_method.attached":
      return methodAttached(db, event, now);
    case "payment_method.automatically_updated":
      return methodUpdated(db, event, now);
    default:
      return { status: "ignored", note: `Nothing in this system reacts to ${event.type}.` };
  }
}

/**
 * The bank accepted after our request had already given up. Without this the
 * money is taken and the appointments never lock, which is the worst of both.
 */
async function lateSuccess(
  db: LedgerDb,
  event: StripeEvent,
  now: Date
): Promise<Outcome> {
  const intent = object(event);
  const metadata = (intent.metadata ?? {}) as Record<string, unknown>;

  const charge = await chargeForIntent(
    db,
    text(intent.id),
    text(metadata.vistrial_charge_id)
  );

  if (!charge) {
    return {
      status: "ignored",
      note: "No charge in this ledger matches that payment.",
    };
  }

  if (charge.status === "paid") {
    return { status: "ignored", chargeId: charge.id, note: "Already settled." };
  }

  const result = await settlePaid(db, charge.id, text(intent.id) ?? "unknown", now, {
    mode: event.livemode ? "live" : "test",
  });

  return {
    status: "processed",
    chargeId: charge.id,
    clientId: charge.client_id,
    note:
      result.kind === "paid"
        ? "Settled from Stripe's own report, after the request had already returned."
        : result.reason,
  };
}

async function lateFailure(db: LedgerDb, event: StripeEvent): Promise<Outcome> {
  const intent = object(event);
  const metadata = (intent.metadata ?? {}) as Record<string, unknown>;
  const failure = (intent.last_payment_error ?? {}) as Record<string, unknown>;

  const charge = await chargeForIntent(
    db,
    text(intent.id),
    text(metadata.vistrial_charge_id)
  );

  if (!charge) {
    return { status: "ignored", note: "No charge in this ledger matches that payment." };
  }

  if (charge.status !== "processing") {
    // The synchronous path already recorded an outcome; this is the same news
    // arriving twice.
    return {
      status: "ignored",
      chargeId: charge.id,
      note: `The charge is already ${charge.status}, so nothing was changed.`,
    };
  }

  const code =
    text(failure.decline_code) ?? text(failure.code) ?? "processor_reported_failure";
  const reason = explainFailure(code, text(failure.message) ?? "Stripe reported a failure.");

  await db
    .from("charges")
    .update({
      status: "failed",
      attempts: charge.attempts + 1,
      failure_code: code,
      failure_reason: reason,
    })
    .eq("id", charge.id)
    .eq("status", "processing");

  return {
    status: "processed",
    chargeId: charge.id,
    clientId: charge.client_id,
    note: `Recorded a failure Stripe reported after the request returned: ${reason}`,
  };
}

/**
 * A chargeback. The charge stays paid, because it was — the reversal is its own
 * fact, recorded beside it and raised to the attention view immediately.
 */
async function chargeback(
  db: LedgerDb,
  event: StripeEvent,
  now: Date
): Promise<Outcome> {
  const dispute = object(event);

  const charge = await chargeForIntent(db, text(dispute.payment_intent), null);

  if (!charge) {
    return { status: "ignored", note: "No charge in this ledger matches that dispute." };
  }

  const status = chargebackStatus(text(dispute.status));

  await db
    .from("charges")
    .update({
      chargeback_at: charge.chargeback_at ?? now.toISOString(),
      chargeback_status: status,
      chargeback_reason: text(dispute.reason),
      chargeback_amount:
        typeof dispute.amount === "number" ? dispute.amount / 100 : charge.chargeback_amount,
      chargeback_reference: text(dispute.id),
    })
    .eq("id", charge.id);

  return {
    status: "processed",
    chargeId: charge.id,
    clientId: charge.client_id,
    note: `Chargeback ${status}${dispute.reason ? `: ${String(dispute.reason)}` : ""}.`,
  };
}

async function methodAttached(
  db: LedgerDb,
  event: StripeEvent,
  now: Date
): Promise<Outcome> {
  const source = object(event);
  const paymentMethodId =
    text(source.payment_method) ?? (event.type === "payment_method.attached" ? text(source.id) : null);

  const client = await clientForCustomer(db, text(source.customer));

  if (!client || !paymentMethodId) {
    return {
      status: "ignored",
      note: "No client in this ledger matches that Stripe customer.",
    };
  }

  const method = await readPaymentMethod(paymentMethodId);
  if (!method.ok) {
    return { status: "failed", clientId: client.id, error: method.message };
  }

  await db
    .from("clients")
    .update({
      stripe_payment_method_id: paymentMethodId,
      card_brand: method.card.brand,
      card_last4: method.card.last4,
      card_exp_month: method.card.expMonth,
      card_exp_year: method.card.expYear,
      payment_method_added_at: now.toISOString(),
    })
    .eq("id", client.id);

  return {
    status: "processed",
    clientId: client.id,
    note: `Payment method recorded from Stripe: ${method.card.brand ?? "card"} ending ${
      method.card.last4 ?? "????"
    }.`,
  };
}

/**
 * The card network reissued the card. Stripe follows it automatically; without
 * this the billing screen keeps showing the old expiry and the attention view
 * nags about a card that is already fine.
 */
async function methodUpdated(
  db: LedgerDb,
  event: StripeEvent,
  now: Date
): Promise<Outcome> {
  const method = object(event);
  const card = (method.card ?? {}) as Record<string, unknown>;

  const client = await clientForCustomer(db, text(method.customer));
  if (!client) {
    return {
      status: "ignored",
      note: "No client in this ledger matches that Stripe customer.",
    };
  }

  await db
    .from("clients")
    .update({
      stripe_payment_method_id: text(method.id) ?? client.stripe_payment_method_id,
      card_brand: text(card.brand) ?? client.card_brand,
      card_last4: text(card.last4) ?? client.card_last4,
      card_exp_month:
        typeof card.exp_month === "number" ? card.exp_month : client.card_exp_month,
      card_exp_year:
        typeof card.exp_year === "number" ? card.exp_year : client.card_exp_year,
      payment_method_added_at: now.toISOString(),
    })
    .eq("id", client.id);

  return {
    status: "processed",
    clientId: client.id,
    note: "The card network reissued this card and Stripe followed it.",
  };
}
