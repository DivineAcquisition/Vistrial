/**
 * Taking the money, and what happens when it does not arrive.
 *
 * Two things make this safe to run from a job that may run more than once a
 * day. The claim is a conditional update, so only one runner can move a charge
 * out of the state it was in; and the request to the processor carries an
 * idempotency key derived from the charge and the attempt number, so a
 * duplicated request replays the original result rather than taking the money
 * a second time.
 */

import {
  chargeCustomer,
  explainFailure,
  isCardProblem,
  stripeConfigured,
  type PaymentResult,
} from "@/lib/billing/stripe";
import { formatMoney } from "@/lib/format";
import {
  composeFailure,
  composePreCharge,
  composeReceipt,
  notifyCharge,
  type ChargeContext,
} from "@/lib/notifications/charge";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type { Charge, ChargeLine, ChargeStatus, Client } from "@/types/database";

/** A client always gets at least a day between being told and being charged. */
export const NOTICE_HOURS = 24;

export const MAX_ATTEMPTS = 3;

/** Three attempts across roughly a week: day zero, day three, day seven. */
export const RETRY_DELAY_HOURS = [72, 96];

const HOUR_MS = 60 * 60 * 1000;

export type NoticeResult =
  | { kind: "notified"; scheduledFor: string }
  | { kind: "undelivered"; reason: string }
  | { kind: "skipped"; reason: string };

export type PaymentResultSummary =
  | { kind: "paid"; reference: string; total: number }
  | { kind: "failed"; reason: string; final: boolean; nextAttempt: string | null }
  | { kind: "skipped"; reason: string };

/**
 * The call to the processor, passed in rather than imported, so the whole of
 * this path — the claim, the retry schedule, the notifications, the locking of
 * appointments — can be exercised without a live Stripe account.
 */
export type PaymentPort = (input: {
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  currency: string;
  description: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}) => Promise<PaymentResult>;

type Loaded = ChargeContext & { client: Client };

async function load(db: LedgerDb, chargeId: string): Promise<Loaded | null> {
  const { data: charge } = await db
    .from("charges")
    .select("*")
    .eq("id", chargeId)
    .returns<Charge[]>()
    .maybeSingle();

  if (!charge) return null;

  const [{ data: client }, { data: lines }] = await Promise.all([
    db.from("clients").select("*").eq("id", charge.client_id).returns<Client[]>().maybeSingle(),
    db
      .from("charge_lines")
      .select("*")
      .eq("charge_id", chargeId)
      .order("sort", { ascending: true })
      .returns<ChargeLine[]>(),
  ]);

  if (!client) return null;

  return { charge, client, lines: lines ?? [] };
}

/* -------------------------------------------------------------------------- */
/* The notice                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Sends the itemisation and, only if it actually arrives, schedules the charge.
 * A charge whose notification failed to deliver holds in draft and shows up in
 * the attention view: charging a client who was never told is the fastest way
 * to lose one.
 */
export async function sendPreChargeNotice(
  db: LedgerDb,
  chargeId: string,
  now: Date
): Promise<NoticeResult> {
  const loaded = await load(db, chargeId);
  if (!loaded) return { kind: "skipped", reason: "That charge no longer exists." };

  if (loaded.charge.status !== "draft") {
    return { kind: "skipped", reason: `The charge is already ${loaded.charge.status}.` };
  }

  if (Number(loaded.charge.total) <= 0 && loaded.charge.appointment_count === 0) {
    return { kind: "skipped", reason: "There is nothing on this charge to notify about." };
  }

  // The notice states the exact time, so the time is fixed before it is written.
  const scheduledFor = new Date(now.getTime() + NOTICE_HOURS * HOUR_MS).toISOString();

  const { data: scheduled } = await db
    .from("charges")
    .update({ scheduled_for: scheduledFor })
    .eq("id", chargeId)
    .eq("status", "draft")
    .select("*")
    .returns<Charge[]>()
    .maybeSingle();

  const context: ChargeContext = {
    charge: scheduled ?? { ...loaded.charge, scheduled_for: scheduledFor },
    client: loaded.client,
    lines: loaded.lines,
  };

  const notification = await notifyCharge(
    db,
    context,
    "pre_charge",
    composePreCharge(context)
  );

  if (notification.status !== "sent") {
    return {
      kind: "undelivered",
      reason:
        notification.error ??
        "The itemisation could not be delivered, so the charge is holding.",
    };
  }

  await db
    .from("charges")
    .update({ status: "notified", notified_at: now.toISOString() })
    .eq("id", chargeId)
    .eq("status", "draft");

  return { kind: "notified", scheduledFor };
}

/* -------------------------------------------------------------------------- */
/* Payment                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Moves the charge into processing, but only from the state the caller expected
 * it to be in. A second runner finds nothing to claim and does nothing.
 */
async function claim(
  db: LedgerDb,
  chargeId: string,
  from: ChargeStatus,
  now: Date
): Promise<Charge | null> {
  const { data } = await db
    .from("charges")
    .update({ status: "processing", last_attempt_at: now.toISOString() })
    .eq("id", chargeId)
    .eq("status", from)
    .select("*")
    .returns<Charge[]>()
    .maybeSingle();

  return data ?? null;
}

async function release(
  db: LedgerDb,
  chargeId: string,
  to: ChargeStatus
): Promise<void> {
  await db.from("charges").update({ status: to }).eq("id", chargeId).eq("status", "processing");
}

async function notificationDelivered(db: LedgerDb, chargeId: string): Promise<boolean> {
  const { data } = await db
    .from("charge_notifications")
    .select("id")
    .eq("charge_id", chargeId)
    .eq("kind", "pre_charge")
    .eq("status", "sent")
    .limit(1)
    .returns<{ id: string }[]>()
    .maybeSingle();

  return Boolean(data);
}

function nextAttemptAt(attemptNo: number, now: Date): string | null {
  const delay = RETRY_DELAY_HOURS[attemptNo - 1];
  if (delay === undefined) return null;
  return new Date(now.getTime() + delay * HOUR_MS).toISOString();
}

async function markAppointmentsBilled(
  db: LedgerDb,
  charge: Charge
): Promise<void> {
  const { error } = await db
    .from("appointments")
    .update({
      status: "billed",
      last_actor: "system",
      last_actor_label: `Paid on the charge for ${charge.period_start} to ${charge.period_end}`,
      last_reason_code: null,
      last_reason: null,
    })
    .eq("charge_id", charge.id)
    .eq("status", "confirmed");

  if (error) {
    throw new Error(`Payment succeeded but the appointments did not lock: ${error.message}`);
  }
}

async function recordAttempt(
  db: LedgerDb,
  input: {
    chargeId: string;
    attemptNo: number;
    outcome: "succeeded" | "failed";
    reference?: string | null;
    code?: string | null;
    message?: string | null;
    at: Date;
  }
): Promise<void> {
  await db.from("charge_attempts").insert({
    charge_id: input.chargeId,
    attempt_no: input.attemptNo,
    attempted_at: input.at.toISOString(),
    outcome: input.outcome,
    processor_reference: input.reference ?? null,
    failure_code: input.code ?? null,
    failure_message: input.message ?? null,
  });
}

/**
 * `from` is `notified` for a first attempt and `failed` for a retry, which is
 * what stops a retry running against a charge that is already being processed.
 */
export async function processCharge(
  db: LedgerDb,
  chargeId: string,
  now: Date,
  from: ChargeStatus = "notified",
  pay: PaymentPort = chargeCustomer
): Promise<PaymentResultSummary> {
  const before = await load(db, chargeId);
  if (!before) return { kind: "skipped", reason: "That charge no longer exists." };

  if (before.charge.status === "paid") {
    return { kind: "skipped", reason: "Already paid. Nothing was attempted." };
  }

  if (!(await notificationDelivered(db, chargeId))) {
    return {
      kind: "skipped",
      reason:
        "The client was never sent the itemisation, so the charge is holding rather than processing.",
    };
  }

  const claimed = await claim(db, chargeId, from, now);
  if (!claimed) {
    return {
      kind: "skipped",
      reason: `The charge was not ${from} when the run reached it, so another run has it.`,
    };
  }

  const client = before.client;
  const attemptNo = claimed.attempts + 1;
  const total = Number(claimed.total);

  const settleFailure = async (
    code: string,
    message: string
  ): Promise<PaymentResultSummary> => {
    const next = nextAttemptAt(attemptNo, now);
    const final = next === null || attemptNo >= MAX_ATTEMPTS;
    const reason = explainFailure(code, message);

    await recordAttempt(db, {
      chargeId,
      attemptNo,
      outcome: "failed",
      code,
      message,
      at: now,
    });

    await db
      .from("charges")
      .update({
        status: "failed",
        attempts: attemptNo,
        failure_code: code,
        failure_reason: reason,
        next_attempt_at: final ? null : next,
      })
      .eq("id", chargeId)
      .eq("status", "processing");

    // The client hears on the first failure and on the last one, not on every
    // one in between.
    if (attemptNo === 1 || final) {
      const context: ChargeContext = { charge: claimed, client, lines: before.lines };
      await notifyCharge(
        db,
        context,
        final ? "payment_failed_final" : "payment_failed",
        composeFailure(context, {
          reason,
          cardProblem: isCardProblem(code),
          final,
          nextAttempt: next,
        })
      );
    }

    return { kind: "failed", reason, final, nextAttempt: final ? null : next };
  };

  const settleSuccess = async (reference: string): Promise<PaymentResultSummary> => {
    await recordAttempt(db, {
      chargeId,
      attemptNo,
      outcome: "succeeded",
      reference,
      at: now,
    });

    // Every appointment in the charge locks permanently.
    await markAppointmentsBilled(db, claimed);

    const { data: paid } = await db
      .from("charges")
      .update({
        status: "paid",
        attempts: attemptNo,
        processed_at: now.toISOString(),
        stripe_payment_intent_id: reference,
        failure_code: null,
        failure_reason: null,
        next_attempt_at: null,
      })
      .eq("id", chargeId)
      .eq("status", "processing")
      .select("*")
      .returns<Charge[]>()
      .maybeSingle();

    const context: ChargeContext = {
      charge: paid ?? claimed,
      client,
      lines: before.lines,
    };
    await notifyCharge(db, context, "receipt", composeReceipt(context));

    return { kind: "paid", reference, total };
  };

  try {
    // A charge credited down to nothing still needs its appointments locked and
    // its receipt sent, but there is nothing to take.
    if (total <= 0) {
      return await settleSuccess("none — nothing to collect");
    }

    if (!client.stripe_customer_id || !client.stripe_payment_method_id) {
      return await settleFailure(
        "no_payment_method",
        "There is no payment method on file for this client."
      );
    }

    if (pay === chargeCustomer && !stripeConfigured()) {
      return await settleFailure(
        "processor_not_configured",
        "No payment processor is configured. Set STRIPE_SECRET_KEY before a client can be charged."
      );
    }

    const result = await pay({
      customerId: client.stripe_customer_id,
      paymentMethodId: client.stripe_payment_method_id,
      amountCents: Math.round(total * 100),
      currency: claimed.currency,
      description: `${client.name} — ${formatMoney(total)} for ${claimed.period_start} to ${claimed.period_end}`,
      // Derived, not random: the same attempt replayed is the same request.
      idempotencyKey: `vistrial:charge:${chargeId}:attempt:${attemptNo}`,
      metadata: { vistrial_charge_id: chargeId, vistrial_client_id: client.id },
    });

    return result.ok
      ? await settleSuccess(result.reference)
      : await settleFailure(result.code, result.message);
  } catch (thrown) {
    // Never leave a charge stuck in processing: the next run has to be able to
    // pick it up.
    await release(db, chargeId, from);
    throw thrown;
  }
}
