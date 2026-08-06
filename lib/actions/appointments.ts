"use server";

import { revalidatePath } from "next/cache";

import { captureAppointment } from "@/lib/appointments/capture";
import { reviewWindow } from "@/lib/appointments/review-window";
import { recordShow } from "@/lib/appointments/show";
import { composeReason } from "@/lib/appointments/status";
import { requireAdmin, type AdminUser } from "@/lib/auth";
import { deliverConfirmation } from "@/lib/notifications/appointment";
import {
  appointmentIdSchema,
  confirmSchema,
  disputeSchema,
  recordAppointmentSchema,
  rejectSchema,
  settleDisputeSchema,
  showSchema,
} from "@/lib/schemas/appointment";
import { createServiceClient } from "@/lib/supabase/server";
import type { LedgerDb } from "@/lib/supabase/ledger";
import type { Appointment, BillOn } from "@/types/database";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; error: string };

function describeIssues(error: {
  issues: { path: (string | number | symbol)[]; message: string }[];
}): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function refresh(clientId?: string | null): void {
  revalidatePath("/appointments");
  revalidatePath("/queue");
  revalidatePath("/leads");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/**
 * Who a change is attributed to. The columns travel in the same statement as
 * the change, which is what lets the audit trigger record an attributed history.
 */
function byAdmin(user: AdminUser) {
  return {
    last_actor: "admin" as const,
    last_actor_id: user.id,
    last_actor_label: user.email,
  };
}

type CandidateRow = Pick<
  Appointment,
  "id" | "client_id" | "status" | "showed" | "review_window_ends_at"
> & { client: { bill_on: BillOn } | null };

async function loadCandidates(db: LedgerDb, ids: string[]): Promise<CandidateRow[]> {
  const { data, error } = await db
    .from("appointments")
    .select("id, client_id, status, showed, review_window_ends_at, client:clients(bill_on)")
    .in("id", ids)
    .returns<CandidateRow[]>();

  if (error) {
    throw new Error(`Could not load those appointments: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Confirming in bulk is permitted; rejecting in bulk is not. A rejection needs a
 * reason attached to the specific appointment, and bulk rejection produces
 * sloppy reasons that fail the moment a client asks.
 */
export async function confirmAppointmentsAction(
  input: unknown
): Promise<ActionResult<{ confirmed: number; skipped: string[] }>> {
  const user = await requireAdmin();

  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const candidates = await loadCandidates(db, parsed.data.ids);

    const skipped: string[] = [];
    const eligible = candidates.filter((row) => {
      if (row.status === "disputed") {
        skipped.push("A disputed appointment is settled from the queue, not confirmed.");
        return false;
      }
      if (row.status !== "pending") {
        skipped.push(`One appointment is already ${row.status}.`);
        return false;
      }
      if (row.client?.bill_on === "showed" && row.showed !== true) {
        skipped.push(
          "One client bills on showed, so its appointment stays pending until a show is recorded."
        );
        return false;
      }
      return true;
    });

    if (eligible.length === 0) {
      return {
        ok: false,
        error: skipped[0] ?? "Nothing in that selection could be confirmed.",
      };
    }

    const ids = eligible.map((row) => row.id);

    const { error } = await db
      .from("appointments")
      .update({
        status: "confirmed",
        ...byAdmin(user),
        last_reason_code: null,
        last_reason: null,
      })
      .in("id", ids)
      .eq("status", "pending");

    if (error) throw new Error(error.message);

    // The record of the notification already exists; this is the attempt to
    // deliver it. A failure is recorded rather than thrown, because the
    // confirmation itself stands either way.
    await Promise.all(ids.map((id) => deliverConfirmation(db, id)));

    refresh(eligible[0]?.client_id);
    return { ok: true, data: { confirmed: ids.length, skipped } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function rejectAppointmentAction(input: unknown): Promise<ActionResult> {
  const user = await requireAdmin();

  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const { id, reason_code, note } = parsed.data;
  const db = createServiceClient();

  try {
    const { data, error } = await db
      .from("appointments")
      .update({
        status: "rejected",
        ...byAdmin(user),
        last_reason_code: reason_code,
        last_reason: composeReason(reason_code, note ?? ""),
      })
      .eq("id", id)
      .in("status", ["pending", "disputed"])
      .select("client_id")
      .returns<{ client_id: string }[]>()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return {
        ok: false,
        error: "That appointment is no longer awaiting review, so it was not rejected.",
      };
    }

    refresh(data.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/**
 * Raising a dispute removes the appointment from the pending charge
 * immediately: it does not sit in limbo accruing toward a bill while under
 * discussion. When an admin records it on the client's behalf the history is
 * attributed to the client and labelled with the admin who typed it.
 */
export async function raiseDisputeAction(input: unknown): Promise<ActionResult> {
  const user = await requireAdmin();

  const parsed = disputeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const { id, reason_code, reason } = parsed.data;
  const db = createServiceClient();

  try {
    const [candidate] = await loadCandidates(db, [id]);

    if (!candidate) return { ok: false, error: "That appointment no longer exists." };

    const window = reviewWindow(candidate);
    if (window.state !== "open") {
      return {
        ok: false,
        error:
          window.state === "closed"
            ? "The review window has closed and the appointment is locked for billing. A late objection is handled as a credit against the charge."
            : `Only a confirmed appointment inside its review window can be disputed. This one is ${candidate.status}.`,
      };
    }

    const { error } = await db
      .from("appointments")
      .update({
        status: "disputed",
        // Attributed to the client, labelled with the admin who recorded it.
        last_actor: "client",
        last_actor_id: null,
        last_actor_label: `Recorded by ${user.email}`,
        last_reason_code: reason_code ?? null,
        last_reason: reason,
      })
      .eq("id", id)
      .eq("status", "confirmed");

    if (error) throw new Error(error.message);

    refresh(candidate.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/**
 * Upholding moves the appointment to rejected; resolving returns it to
 * confirmed with a fresh review window, which the database opens.
 */
export async function settleDisputeAction(input: unknown): Promise<ActionResult> {
  const user = await requireAdmin();

  const parsed = settleDisputeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const { id, outcome, reason } = parsed.data;
  const db = createServiceClient();

  try {
    const { data, error } = await db
      .from("appointments")
      .update({
        status: outcome === "upheld" ? "rejected" : "confirmed",
        ...byAdmin(user),
        last_reason_code: outcome === "upheld" ? "dispute_upheld" : "dispute_resolved",
        last_reason: reason,
      })
      .eq("id", id)
      .eq("status", "disputed")
      .select("client_id")
      .returns<{ client_id: string }[]>()
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { ok: false, error: "That dispute has already been settled." };

    if (outcome === "resolved") {
      await deliverConfirmation(db, id);
    }

    refresh(data.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function recordShowAction(
  input: unknown
): Promise<ActionResult<{ rejected: boolean }>> {
  const user = await requireAdmin();

  const parsed = showSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const [candidate] = await loadCandidates(db, [parsed.data.id]);
    if (!candidate) return { ok: false, error: "That appointment no longer exists." };

    if (candidate.status === "billed") {
      return { ok: false, error: "A billed appointment is immutable." };
    }

    const result = await recordShow(db, candidate, parsed.data.showed, {
      actor: "admin",
      actorId: user.id,
      actorLabel: user.email,
    });

    refresh(candidate.client_id);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/**
 * Bookings happen by phone and outside the tracked path, and a system that
 * cannot record reality gets worked around.
 */
export async function recordAppointmentAction(
  input: unknown
): Promise<ActionResult<{ id: string; outcome: "created" | "duplicate" | "rescheduled" }>> {
  const user = await requireAdmin();

  const parsed = recordAppointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const { client_id, lead_id, scheduled_for, appointment_type } = parsed.data;
  const db = createServiceClient();

  try {
    const { data: lead } = await db
      .from("leads")
      .select("id, client_id")
      .eq("id", lead_id)
      .returns<{ id: string; client_id: string }[]>()
      .maybeSingle();

    if (!lead || lead.client_id !== client_id) {
      return { ok: false, error: "That lead does not belong to the chosen client." };
    }

    const result = await captureAppointment(db, {
      clientId: client_id,
      leadId: lead_id,
      scheduledFor: new Date(scheduled_for).toISOString(),
      appointmentType: appointment_type?.trim() || null,
      bookingSource: "manual",
      actor: "admin",
      actorId: user.id,
      actorLabel: user.email,
    });

    refresh(client_id);

    const outcome =
      result.kind === "created"
        ? "created"
        : result.kind === "duplicate"
          ? "duplicate"
          : "rescheduled";

    return { ok: true, data: { id: result.appointment.id, outcome } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function resendConfirmationAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = appointmentIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const result = await deliverConfirmation(db, parsed.data.id);
    refresh();

    return result.status === "sent"
      ? { ok: true }
      : { ok: false, error: result.error ?? "The notification could not be delivered." };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}
