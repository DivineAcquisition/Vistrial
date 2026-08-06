import { z } from "zod";

const day = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a calendar date (yyyy-mm-dd).");

export const inviteSchema = z.object({
  client_id: z.uuid("Choose a client."),
  name: z.string().trim().min(1, "Name the person.").max(160),
  email: z.email("Enter a valid email.").transform((value) => value.toLowerCase()),
});

export const acceptInviteSchema = z
  .object({
    token: z.string().trim().min(20, "That invitation link is incomplete."),
    password: z
      .string()
      .min(10, "Choose a password of at least ten characters.")
      .max(200),
    confirm: z.string().min(1, "Confirm the password."),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "The passwords do not match.",
  });

export const adSpendSchema = z.object({
  client_id: z.uuid(),
  spend_date: day,
  amount: z.coerce.number().min(0, "Spend cannot be negative."),
  campaign_id: z.uuid().optional().nullable(),
  note: z.string().trim().max(400).optional().or(z.literal("")),
});

export const adSpendRangeSchema = z
  .object({
    client_id: z.uuid(),
    start: day,
    end: day,
    total: z.coerce.number().min(0, "Spend cannot be negative."),
    campaign_id: z.uuid().optional().nullable(),
    note: z.string().trim().max(400).optional().or(z.literal("")),
  })
  .refine((value) => value.start <= value.end, {
    path: ["end"],
    message: "The end date must be on or after the start.",
  });

export const shareLinkSchema = z.object({
  client_id: z.uuid(),
  label: z.string().trim().max(120).optional().or(z.literal("")),
  /** Days until expiry. */
  days: z.coerce.number().int().min(1).max(90).default(14),
});

export const revokeShareSchema = z.object({
  id: z.uuid(),
});

export const portalDisputeSchema = z.object({
  id: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "Say why this appointment does not meet the definition.")
    .max(1000),
});

export const weeklySummarySchema = z.object({
  weekly_summary: z.boolean(),
});

export const closePortalUserSchema = z.object({
  id: z.uuid(),
});
