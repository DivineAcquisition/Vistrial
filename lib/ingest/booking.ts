/**
 * Bookings and show outcomes arriving from the client's calendar.
 *
 * A booking is the moment a lead becomes a billable thing, so the two rules
 * that protect it are absolute: it is always attached to a lead, and it is
 * never counted twice. Where the booking carries someone this system has never
 * seen, a lead is created from whatever identity it carries rather than leaving
 * the appointment unexplainable.
 */

import { captureAppointment, LIVE_STATUSES } from "@/lib/appointments/capture";
import { recordShow } from "@/lib/appointments/show";
import { findLeadForContact, resolveCampaign } from "@/lib/ingest/leads";
import { leadSource, type NormalisedEvent } from "@/lib/ingest/normalise";
import type { LedgerDb, ProcessOutcome } from "@/lib/ingest/types";
import type { Appointment, Client, InboundEvent, Lead } from "@/types/database";

const CALENDAR = "Reported by the client's calendar";

/**
 * A booking for someone with no phone and no email cannot be matched to a lead
 * now or later, so it waits for an admin rather than becoming an appointment
 * nobody can explain.
 */
async function createLeadFromBooking(
  db: LedgerDb,
  stored: InboundEvent,
  client: Client,
  event: NormalisedEvent
): Promise<Lead> {
  const arrivedAt = event.occurredAt ?? stored.received_at;
  const campaignId = await resolveCampaign(db, client.id, event);

  const { data, error } = await db
    .from("leads")
    .insert({
      client_id: client.id,
      campaign_id: campaignId,
      name: event.contact.name,
      phone: event.contact.phone,
      email: event.contact.email,
      source: leadSource(event, campaignId !== null),
      utm_source: event.utm.source,
      utm_medium: event.utm.medium,
      utm_campaign: event.utm.campaign,
      utm_content: event.utm.content,
      job_type: event.jobType ?? event.booking.appointmentType,
      raw_payload: stored.payload,
      arrived_at: arrivedAt,
      arrival_source: event.occurredAt !== null ? "payload" : "received",
      // Response times on this lead measure from the booking, not from an
      // enquiry it never made.
      origin: "booking",
    })
    .select("*")
    .returns<Lead[]>()
    .single();

  if (error || !data) {
    throw new Error(
      `Could not create a lead for the booking: ${error?.message ?? "no row returned"}`
    );
  }

  return data;
}

export async function handleAppointmentBooked(
  db: LedgerDb,
  stored: InboundEvent,
  client: Client,
  event: NormalisedEvent
): Promise<ProcessOutcome> {
  const scheduledFor = event.booking.scheduledFor;

  if (scheduledFor === null) {
    return {
      status: "failed",
      error: "The booking declared no scheduled time, so no appointment was recorded.",
    };
  }

  let lead = await findLeadForContact(db, client.id, event);

  if (lead === null) {
    if (event.contact.phone === null && event.contact.email === null) {
      return {
        status: "failed",
        error:
          "The booking carried no phone or email, so it could not be attached to a lead.",
      };
    }

    lead = await createLeadFromBooking(db, stored, client, event);
  }

  const result = await captureAppointment(db, {
    clientId: client.id,
    leadId: lead.id,
    scheduledFor,
    appointmentType: event.booking.appointmentType,
    providerAppointmentId: event.booking.providerAppointmentId,
    bookingSource: "webhook",
    actor: "system",
    actorLabel: CALENDAR,
  });

  return {
    status: "processed",
    leadId: lead.id,
    appointmentId: result.appointment.id,
  };
}

async function findAppointmentForOutcome(
  db: LedgerDb,
  clientId: string,
  leadId: string,
  providerAppointmentId: string | null
): Promise<Appointment | null> {
  if (providerAppointmentId !== null) {
    const { data } = await db
      .from("appointments")
      .select("*")
      .eq("client_id", clientId)
      .eq("provider_appointment_id", providerAppointmentId)
      .in("status", LIVE_STATUSES)
      .limit(1)
      .returns<Appointment[]>()
      .maybeSingle();

    if (data) return data;
  }

  const { data } = await db
    .from("appointments")
    .select("*")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .in("status", LIVE_STATUSES)
    .order("scheduled_for", { ascending: false })
    .limit(1)
    .returns<Appointment[]>()
    .maybeSingle();

  return data ?? null;
}

export async function handleAppointmentOutcome(
  db: LedgerDb,
  client: Client,
  event: NormalisedEvent,
  showed: boolean
): Promise<ProcessOutcome> {
  const lead = await findLeadForContact(db, client.id, event);

  if (lead === null) {
    return {
      status: "failed",
      error: "No lead matches this contact, so the outcome was not recorded.",
    };
  }

  const appointment = await findAppointmentForOutcome(
    db,
    client.id,
    lead.id,
    event.booking.providerAppointmentId
  );

  if (appointment === null) {
    return {
      status: "failed",
      leadId: lead.id,
      error: "This lead has no live appointment for the outcome to apply to.",
    };
  }

  await recordShow(db, appointment, showed, { actor: "system", actorLabel: CALENDAR });

  return {
    status: "processed",
    leadId: lead.id,
    appointmentId: appointment.id,
  };
}
