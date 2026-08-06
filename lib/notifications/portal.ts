/**
 * Portal notices: invitations, weekly summaries, and the alert an administrator
 * gets when a client disputes from the portal.
 */

import { formatDay, formatMoney } from "@/lib/format";
import { sendEmail, type DeliveryResult } from "@/lib/notifications/email";
import type { CostBreakdown } from "@/lib/portal/cpa";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type { Client, ClientUser } from "@/types/database";

export type { DeliveryResult };

function adminRecipient(): string | null {
  return process.env.ADMIN_NOTIFY_EMAIL?.trim() || null;
}

async function recordAndSend(
  db: LedgerDb,
  row: {
    client_id: string;
    client_user_id?: string | null;
    audience: "client" | "admin";
    kind: "invitation" | "weekly_summary" | "dispute_alert";
    recipient: string | null;
    subject: string;
    body: string;
    period_start?: string | null;
    period_end?: string | null;
  }
): Promise<DeliveryResult> {
  const { data, error } = await db
    .from("client_notifications")
    .insert({
      client_id: row.client_id,
      client_user_id: row.client_user_id ?? null,
      audience: row.audience,
      kind: row.kind,
      channel: "email",
      recipient: row.recipient,
      subject: row.subject,
      body: row.body,
      status: "pending",
      period_start: row.period_start ?? null,
      period_end: row.period_end ?? null,
      attempts: 0,
    })
    .select("id")
    .single();

  if (error) {
    return { status: "failed", error: error.message };
  }

  const delivery = await sendEmail(row.recipient, row.subject, row.body);

  await db
    .from("client_notifications")
    .update({
      status: delivery.status,
      error: delivery.error,
      attempts: 1,
      sent_at: delivery.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", data.id);

  return delivery;
}

export async function deliverInvitation(
  db: LedgerDb,
  input: {
    client: Pick<Client, "id" | "name">;
    membership: Pick<ClientUser, "id" | "name" | "email">;
    inviteUrl: string;
    expiresAt: string;
  }
): Promise<DeliveryResult> {
  const subject = `Your ${input.client.name} portal invitation — Vistrial`;
  const body = [
    `Hello ${input.membership.name},`,
    "",
    `${input.client.name} has been invited to the Vistrial client portal.`,
    "There is no public signup — this link is the only way in.",
    "",
    `Accept the invitation: ${input.inviteUrl}`,
    `This link expires at ${input.expiresAt}.`,
    "",
    "Appointment confirmations and billing notices will always be sent to this",
    "address. The weekly summary can be turned off from the portal once you are in.",
  ].join("\n");

  return recordAndSend(db, {
    client_id: input.client.id,
    client_user_id: input.membership.id,
    audience: "client",
    kind: "invitation",
    recipient: input.membership.email,
    subject,
    body,
  });
}

export async function deliverDisputeAlert(
  db: LedgerDb,
  input: {
    client: Pick<Client, "id" | "name">;
    membership: Pick<ClientUser, "id" | "name" | "email">;
    appointmentId: string;
    reason: string;
    queueUrl: string;
  }
): Promise<DeliveryResult> {
  const subject = `Dispute raised — ${input.client.name}`;
  const body = [
    `${input.membership.name} (${input.membership.email}) disputed an appointment for ${input.client.name}.`,
    "",
    `Appointment: ${input.appointmentId}`,
    `Reason: ${input.reason}`,
    "",
    `Open the confirmation queue: ${input.queueUrl}`,
    "",
    "Billing is held on this appointment until the dispute is settled.",
  ].join("\n");

  return recordAndSend(db, {
    client_id: input.client.id,
    client_user_id: input.membership.id,
    audience: "admin",
    kind: "dispute_alert",
    recipient: adminRecipient(),
    subject,
    body,
  });
}

export function composeWeeklySummary(input: {
  client: Pick<Client, "name">;
  membership: Pick<ClientUser, "name">;
  cost: CostBreakdown;
  portalUrl: string;
}): { subject: string; body: string } {
  const { cost } = input;
  const period = `${formatDay(cost.period.start)} – ${formatDay(cost.period.end)}`;
  const cpa =
    cost.costPerAppointment === null
      ? `Unavailable — ${cost.unavailableReason}`
      : formatMoney(cost.costPerAppointment);

  const subject = `Weekly summary for ${input.client.name} — ${period}`;
  const body = [
    `Hello ${input.membership.name},`,
    "",
    `Here is the week of ${period} for ${input.client.name}.`,
    "",
    `Combined cost per appointment: ${cpa}`,
    `Ad spend: ${formatMoney(cost.adSpend)}`,
    `Divine Acquisition fees: ${formatMoney(cost.daFees)}`,
    `Confirmed appointments: ${cost.confirmedCount}`,
    "",
    `Open the portal: ${input.portalUrl}`,
    "",
    "You can turn off the weekly summary from the portal. Appointment",
    "confirmations and billing notices cannot be turned off.",
  ].join("\n");

  return { subject, body };
}

export async function deliverWeeklySummary(
  db: LedgerDb,
  input: {
    client: Pick<Client, "id" | "name">;
    membership: Pick<ClientUser, "id" | "name" | "email">;
    cost: CostBreakdown;
    portalUrl: string;
  }
): Promise<DeliveryResult> {
  const { subject, body } = composeWeeklySummary(input);

  return recordAndSend(db, {
    client_id: input.client.id,
    client_user_id: input.membership.id,
    audience: "client",
    kind: "weekly_summary",
    recipient: input.membership.email,
    subject,
    body,
    period_start: input.cost.period.start,
    period_end: input.cost.period.end,
  });
}
