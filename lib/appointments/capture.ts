/**
 * Appointment capture.
 *
 * Every appointment belongs to a lead, arrives at most once, and carries the
 * definition version that governed it. Three things can happen when a booking
 * lands: it is new, it is the same booking delivered twice, or it is a
 * reschedule of one already held. Getting the third one wrong is what produces
 * a duplicate charge, so the decision is a pure function that can be argued
 * with in a test, and the write that follows is the only side effect.
 *
 * Matching only ever considers appointments that are still live. A rejected
 * appointment is a judgement that has been made, and a billed one is immutable;
 * a booking that matches neither is a genuinely new appointment.
 */

import type { LedgerDb } from "@/lib/supabase/ledger";
import { isUniqueViolation } from "@/lib/ingest/types";
import type {
  Appointment,
  AppointmentActor,
  AppointmentStatus,
  BookingSource,
} from "@/types/database";

/** The statuses an appointment can still be matched against or moved out of. */
export const LIVE_STATUSES: AppointmentStatus[] = ["pending", "confirmed", "disputed"];

export type LiveAppointment = Pick<
  Appointment,
  "id" | "scheduled_for" | "provider_appointment_id"
>;

export type IncomingBooking = {
  scheduledFor: string;
  providerAppointmentId: string | null;
};

export type CaptureDecision =
  | { kind: "create" }
  | { kind: "duplicate"; appointmentId: string }
  | { kind: "reschedule"; appointmentId: string; from: string };

function sameMoment(left: string, right: string): boolean {
  return Date.parse(left) === Date.parse(right);
}

/**
 * `live` is the lead's live appointments, newest first.
 *
 * The provider's own identifier wins where it supplied one: the same booking
 * moved to a new time keeps that identifier, which is exactly how a reschedule
 * is told apart from a second booking.
 */
export function decideCapture(
  live: readonly LiveAppointment[],
  incoming: IncomingBooking
): CaptureDecision {
  if (incoming.providerAppointmentId !== null) {
    const known = live.find(
      (appointment) =>
        appointment.provider_appointment_id === incoming.providerAppointmentId
    );

    if (known) {
      return sameMoment(known.scheduled_for, incoming.scheduledFor)
        ? { kind: "duplicate", appointmentId: known.id }
        : { kind: "reschedule", appointmentId: known.id, from: known.scheduled_for };
    }
  }

  const sameSlot = live.find((appointment) =>
    sameMoment(appointment.scheduled_for, incoming.scheduledFor)
  );
  if (sameSlot) return { kind: "duplicate", appointmentId: sameSlot.id };

  const [existing] = live;
  if (existing) {
    return { kind: "reschedule", appointmentId: existing.id, from: existing.scheduled_for };
  }

  return { kind: "create" };
}

export type CaptureInput = {
  clientId: string;
  leadId: string;
  scheduledFor: string;
  appointmentType?: string | null;
  providerAppointmentId?: string | null;
  bookingSource?: BookingSource;
  actor: AppointmentActor;
  actorId?: string | null;
  actorLabel?: string | null;
  showed?: boolean | null;
};

export type CaptureResult =
  | { kind: "created"; appointment: Appointment }
  | { kind: "duplicate"; appointment: Appointment }
  | { kind: "rescheduled"; appointment: Appointment; from: string };

async function liveAppointments(
  db: LedgerDb,
  clientId: string,
  leadId: string
): Promise<LiveAppointment[]> {
  const { data, error } = await db
    .from("appointments")
    .select("id, scheduled_for, provider_appointment_id")
    .eq("client_id", clientId)
    .eq("lead_id", leadId)
    .in("status", LIVE_STATUSES)
    .order("created_at", { ascending: false })
    .returns<LiveAppointment[]>();

  if (error) {
    throw new Error(`Could not read the lead's appointments: ${error.message}`);
  }

  return data ?? [];
}

async function readAppointment(db: LedgerDb, id: string): Promise<Appointment> {
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("id", id)
    .returns<Appointment[]>()
    .single();

  if (error || !data) {
    throw new Error(`Could not read appointment ${id}: ${error?.message ?? "no row"}`);
  }

  return data;
}

export async function captureAppointment(
  db: LedgerDb,
  input: CaptureInput
): Promise<CaptureResult> {
  const live = await liveAppointments(db, input.clientId, input.leadId);

  const decision = decideCapture(live, {
    scheduledFor: input.scheduledFor,
    providerAppointmentId: input.providerAppointmentId ?? null,
  });

  if (decision.kind === "duplicate") {
    return { kind: "duplicate", appointment: await readAppointment(db, decision.appointmentId) };
  }

  if (decision.kind === "reschedule") {
    // The previous time is retained by the database, not by this update. A
    // reschedule must never create a second billable appointment.
    const update: Record<string, unknown> = {
      scheduled_for: input.scheduledFor,
      last_actor: input.actor,
      last_actor_id: input.actorId ?? null,
      last_actor_label: input.actorLabel ?? null,
      last_reason_code: null,
      last_reason: null,
    };

    if (input.appointmentType) update.appointment_type = input.appointmentType;
    if (input.providerAppointmentId) {
      update.provider_appointment_id = input.providerAppointmentId;
    }

    const { data, error } = await db
      .from("appointments")
      .update(update)
      .eq("id", decision.appointmentId)
      .select("*")
      .returns<Appointment[]>()
      .single();

    if (error || !data) {
      throw new Error(
        `Could not reschedule the appointment: ${error?.message ?? "no row returned"}`
      );
    }

    return { kind: "rescheduled", appointment: data, from: decision.from };
  }

  const { data, error } = await db.rpc("capture_appointment", {
    p_client_id: input.clientId,
    p_lead_id: input.leadId,
    p_scheduled_for: input.scheduledFor,
    p_actor: input.actor,
    p_appointment_type: input.appointmentType ?? null,
    p_provider_appointment_id: input.providerAppointmentId ?? null,
    p_booking_source: input.bookingSource ?? "webhook",
    p_actor_id: input.actorId ?? null,
    p_actor_label: input.actorLabel ?? null,
    p_showed: input.showed ?? null,
  });

  if (error) {
    // Two deliveries of the same booking racing each other. The unique indexes
    // decide, and the loser reports the appointment the winner created.
    if (isUniqueViolation(error)) {
      const after = await liveAppointments(db, input.clientId, input.leadId);
      const settled = decideCapture(after, {
        scheduledFor: input.scheduledFor,
        providerAppointmentId: input.providerAppointmentId ?? null,
      });

      if (settled.kind !== "create") {
        return {
          kind: "duplicate",
          appointment: await readAppointment(db, settled.appointmentId),
        };
      }
    }

    throw new Error(`Could not record the appointment: ${error.message}`);
  }

  return { kind: "created", appointment: data as Appointment };
}
