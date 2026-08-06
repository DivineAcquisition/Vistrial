/**
 * What a client is told about their money.
 *
 * No client is ever charged for anything they have not seen itemised in
 * advance. The pre-charge notice carries the period, every appointment with its
 * date and rate, any minimum adjustment shown separately, any credit, the
 * total, and the exact time the charge will process. The record of it is what
 * the database checks before it will let a charge be marked paid.
 */

import { formatDateTime, formatDay, formatMoney } from "@/lib/format";
import { sendEmail } from "@/lib/notifications/email";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type {
  Charge,
  ChargeLine,
  ChargeNotification,
  ChargeNotificationKind,
  Client,
} from "@/types/database";

export type ChargeContext = {
  charge: Charge;
  client: Pick<Client, "id" | "name" | "contact_email" | "card_brand" | "card_last4">;
  lines: ChargeLine[];
};

function itemise(lines: ChargeLine[]): string {
  return lines
    .map((line) => `  ${line.description}    ${formatMoney(Number(line.amount))}`)
    .join("\n");
}

function period(charge: Charge): string {
  return `${formatDay(charge.period_start)} to ${formatDay(charge.period_end)}`;
}

export function composePreCharge(context: ChargeContext): {
  subject: string;
  body: string;
} {
  const { charge, client, lines } = context;

  const appointments = lines.filter((line) => line.kind === "appointment");
  const adjustments = lines.filter((line) => line.kind !== "appointment");

  const when =
    charge.scheduled_for === null
      ? "at least twenty-four hours from now"
      : formatDateTime(charge.scheduled_for);

  const card =
    client.card_brand && client.card_last4
      ? `${client.card_brand} ending ${client.card_last4}`
      : "the payment method on file";

  const body = [
    `This is the charge for ${client.name} covering ${period(charge)}.`,
    "",
    `Appointments (${appointments.length})`,
    appointments.length === 0 ? "  None in this period." : itemise(appointments),
    ...(adjustments.length > 0 ? ["", "Adjustments", itemise(adjustments)] : []),
    "",
    `Total    ${formatMoney(Number(charge.total))}`,
    "",
    `This will be taken from ${card} on ${when}. Nothing is taken before then.`,
    "",
    "Every appointment listed here has already been through its own review window, so this is a statement of what is about to be collected rather than a request for approval. If something looks wrong, reply to this email before the time above.",
  ].join("\n");

  return {
    subject: `${client.name} — ${formatMoney(Number(charge.total))} for ${period(charge)}`,
    body,
  };
}

export function composeReceipt(context: ChargeContext): {
  subject: string;
  body: string;
} {
  const { charge, client, lines } = context;

  const body = [
    `Payment received for ${client.name}, covering ${period(charge)}.`,
    "",
    itemise(lines),
    "",
    `Total paid    ${formatMoney(Number(charge.total))}`,
    charge.stripe_payment_intent_id
      ? `Processor reference: ${charge.stripe_payment_intent_id}`
      : "",
    "",
    "Thank you.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    subject: `Receipt — ${formatMoney(Number(charge.total))} for ${period(charge)}`,
    body,
  };
}

export function composeFailure(
  context: ChargeContext,
  input: { reason: string; cardProblem: boolean; final: boolean; nextAttempt: string | null }
): { subject: string; body: string } {
  const { charge, client } = context;

  const body = [
    `The payment of ${formatMoney(Number(charge.total))} for ${client.name}, covering ${period(
      charge
    )}, did not go through.`,
    "",
    input.reason,
    "",
    input.cardProblem
      ? "The card on file needs attention. Ask us for a secure link and you can replace it in a couple of minutes; nothing sensitive passes through us."
      : "Nothing needs doing at your end yet.",
    "",
    input.final
      ? "That was the last automatic attempt. The amount stays outstanding and will be collected with your next charge once a working payment method is in place. Nothing has been written off."
      : input.nextAttempt !== null
        ? `We will try again on ${formatDateTime(input.nextAttempt)}.`
        : "We will try again shortly.",
    "",
    "Appointments already delivered are unaffected and work continues.",
  ].join("\n");

  return {
    subject: input.final
      ? `Final attempt failed — ${formatMoney(Number(charge.total))} outstanding`
      : `Payment failed — ${formatMoney(Number(charge.total))}`,
    body,
  };
}

/**
 * Records the notification before attempting it, then records what happened.
 * A charge whose notification did not deliver never processes, so this record
 * is load bearing rather than a log line.
 */
export async function notifyCharge(
  db: LedgerDb,
  context: ChargeContext,
  kind: ChargeNotificationKind,
  composed: { subject: string; body: string }
): Promise<ChargeNotification> {
  const recipient = context.client.contact_email;

  const { data: created, error } = await db
    .from("charge_notifications")
    .insert({
      charge_id: context.charge.id,
      client_id: context.client.id,
      kind,
      channel: "email",
      recipient,
      subject: composed.subject,
      body: composed.body,
      status: "pending",
    })
    .select("*")
    .returns<ChargeNotification[]>()
    .single();

  if (error || !created) {
    throw new Error(
      `Could not record the ${kind} notification: ${error?.message ?? "no row returned"}`
    );
  }

  const result = await sendEmail(recipient, composed.subject, composed.body);

  const { data: settled } = await db
    .from("charge_notifications")
    .update({
      status: result.status,
      error: result.error,
      attempts: created.attempts + 1,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", created.id)
    .select("*")
    .returns<ChargeNotification[]>()
    .maybeSingle();

  return settled ?? { ...created, status: result.status, error: result.error };
}

/** Re-attempts a notification that has already been composed and recorded. */
export async function retryNotification(
  db: LedgerDb,
  notification: ChargeNotification
): Promise<ChargeNotification> {
  const result = await sendEmail(
    notification.recipient,
    notification.subject ?? "",
    notification.body ?? ""
  );

  const { data } = await db
    .from("charge_notifications")
    .update({
      status: result.status,
      error: result.error,
      attempts: notification.attempts + 1,
      sent_at: result.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", notification.id)
    .select("*")
    .returns<ChargeNotification[]>()
    .maybeSingle();

  return data ?? { ...notification, status: result.status, error: result.error };
}
