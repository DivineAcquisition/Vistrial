/**
 * Recording whether an appointment was kept.
 *
 * Show outcomes arrive from the client's calendar where their system reports
 * them and are set by hand otherwise, and both paths land here so the two can
 * never drift apart.
 */

import { NO_SHOW_REASON } from "@/lib/appointments/status";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type { Appointment, AppointmentActor } from "@/types/database";

export type ShowActor = {
  actor: AppointmentActor;
  actorId?: string | null;
  actorLabel?: string | null;
};

export type ShowResult = { rejected: boolean };

/**
 * A no-show on an appointment still awaiting review is rejected outright and is
 * never billable. One already confirmed keeps its status — a client billing on
 * booked has been charged for the booking, not for the outcome — but the
 * outcome is recorded either way, because booked-but-not-shown is tracked
 * regardless of billing basis.
 */
export async function recordShow(
  db: LedgerDb,
  appointment: Pick<Appointment, "id" | "status">,
  showed: boolean,
  by: ShowActor
): Promise<ShowResult> {
  const rejects = !showed && appointment.status === "pending";

  const { error } = await db
    .from("appointments")
    .update({
      showed,
      last_actor: by.actor,
      last_actor_id: by.actorId ?? null,
      last_actor_label: by.actorLabel ?? null,
      ...(rejects
        ? { status: "rejected", last_reason_code: "no_show", last_reason: NO_SHOW_REASON }
        : { last_reason_code: null, last_reason: null }),
    })
    .eq("id", appointment.id);

  if (error) {
    throw new Error(`Could not record the appointment outcome: ${error.message}`);
  }

  return { rejected: rejects };
}
