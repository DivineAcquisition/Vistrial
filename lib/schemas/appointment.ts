import { z } from "zod";

import { REJECTION_REASONS } from "@/lib/appointments/status";

const REASON_CODES = REJECTION_REASONS.map((reason) => reason.code) as [
  string,
  ...string[],
];

const isoDateTime = z
  .string()
  .trim()
  .min(1, "Choose when the appointment is scheduled for.")
  .refine((value) => !Number.isNaN(Date.parse(value)), "That is not a valid date and time.");

export const recordAppointmentSchema = z.object({
  client_id: z.uuid("Choose a client."),
  lead_id: z.uuid("Choose the lead this appointment belongs to."),
  scheduled_for: isoDateTime,
  appointment_type: z.string().trim().max(160).optional().or(z.literal("")),
});

export const confirmSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Choose at least one appointment."),
});

/**
 * A rejection is visible to the client, so the reason is never optional. Free
 * text is required when the reason is not one of the listed ones, because
 * "other" on its own answers nothing.
 */
export const rejectSchema = z
  .object({
    id: z.uuid(),
    reason_code: z.enum(REASON_CODES),
    note: z.string().trim().max(600).optional().or(z.literal("")),
  })
  .refine(
    (value) => value.reason_code !== "other" || (value.note ?? "").trim().length > 0,
    { path: ["note"], message: "Say why this appointment does not meet the definition." }
  );

export const disputeSchema = z.object({
  id: z.uuid(),
  reason_code: z.enum(REASON_CODES).optional(),
  reason: z
    .string()
    .trim()
    .min(1, "Record the reason the client gave.")
    .max(1000),
});

export const settleDisputeSchema = z.object({
  id: z.uuid(),
  outcome: z.enum(["upheld", "resolved"]),
  reason: z
    .string()
    .trim()
    .min(1, "Record the reasoning behind the outcome.")
    .max(1000),
});

export const showSchema = z.object({
  id: z.uuid(),
  showed: z.boolean(),
});

export const appointmentIdSchema = z.object({ id: z.uuid() });
