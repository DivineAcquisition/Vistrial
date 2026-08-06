/**
 * Telling the client an appointment has entered their review window.
 *
 * The record is created by a database trigger at the moment of confirmation,
 * before anything is sent, and this module only ever moves that record forward.
 * Delivery can fail — a missing channel, a bounced address — and when it does
 * the failure stays visible rather than being swallowed, because an appointment
 * the client never heard about must never turn into a charge.
 */

import { describeWindow, reviewWindow } from "@/lib/appointments/review-window";
import { formatDateTime, formatMoney } from "@/lib/format";
import { sendEmail, type DeliveryResult } from "@/lib/notifications/email";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type {
  Appointment,
  AppointmentNotification,
  Client,
  Lead,
} from "@/types/database";

export type { DeliveryResult };

type Context = {
  appointment: Appointment;
  client: Pick<Client, "id" | "name" | "contact_email" | "review_window_hours">;
  lead: Pick<Lead, "name" | "phone" | "email" | "job_type"> | null;
};

const DASH = "\u2014";

export function composeConfirmation(context: Context): {
  subject: string;
  body: string;
} {
  const { appointment, client, lead } = context;
  const window = reviewWindow(appointment);
  const who = lead?.name ?? "an unnamed lead";

  const subject = `Appointment confirmed for ${client.name} — ${formatDateTime(
    appointment.scheduled_for
  )}`;

  const deadline =
    appointment.review_window_ends_at === null
      ? "once the review window opens"
      : `by ${formatDateTime(appointment.review_window_ends_at)}`;

  const body = [
    `An appointment with ${who} has been confirmed against version ${appointment.definition_version} of your appointment definition and has entered your review window.`,
    "",
    `Lead: ${lead?.name ?? DASH}`,
    `Phone: ${lead?.phone ?? DASH}`,
    `Email: ${lead?.email ?? DASH}`,
    `Job type: ${appointment.appointment_type ?? lead?.job_type ?? DASH}`,
    `Scheduled for: ${formatDateTime(appointment.scheduled_for)}`,
    appointment.rate_applied === null
      ? null
      : `Rate: ${formatMoney(appointment.rate_applied)}`,
    "",
    `You have ${client.review_window_hours} hours to raise a dispute — ${deadline} (${describeWindow(
      window
    )}). If nothing is raised in that time the appointment locks for billing.`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject, body };
}

type AppointmentContext = Appointment & {
  client: Context["client"] | null;
  lead: Context["lead"] | null;
};

/**
 * Attempts the notification recorded against an appointment. Safe to call
 * again: a delivery that failed can be retried, and one already sent is left
 * exactly as it is.
 */
export async function deliverConfirmation(
  db: LedgerDb,
  appointmentId: string
): Promise<DeliveryResult> {
  const { data: notification } = await db
    .from("appointment_notifications")
    .select("*")
    .eq("appointment_id", appointmentId)
    .eq("kind", "confirmation")
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<AppointmentNotification[]>()
    .maybeSingle();

  if (!notification) {
    return {
      status: "failed",
      error: "There is no confirmation notification recorded for this appointment.",
    };
  }

  if (notification.status === "sent") {
    return { status: "sent", error: null };
  }

  const { data: appointment } = await db
    .from("appointments")
    .select(
      "*, client:clients(id, name, contact_email, review_window_hours), lead:leads(name, phone, email, job_type)"
    )
    .eq("id", appointmentId)
    .returns<AppointmentContext[]>()
    .maybeSingle();

  if (!appointment || !appointment.client) {
    return { status: "failed", error: "That appointment could not be loaded." };
  }

  const { subject, body } = composeConfirmation({
    appointment,
    client: appointment.client,
    lead: appointment.lead,
  });

  const recipient = notification.recipient ?? appointment.client.contact_email;
  const result = await sendEmail(recipient, subject, body);
  const sentAt = new Date().toISOString();

  await db
    .from("appointment_notifications")
    .update({
      channel: "email",
      recipient,
      subject,
      body,
      status: result.status,
      error: result.error,
      attempts: notification.attempts + 1,
      sent_at: result.status === "sent" ? sentAt : null,
    })
    .eq("id", notification.id);

  if (result.status === "sent") {
    await db
      .from("appointments")
      .update({ notified_at: sentAt })
      .eq("id", appointmentId)
      .eq("status", "confirmed");
  }

  return result;
}
