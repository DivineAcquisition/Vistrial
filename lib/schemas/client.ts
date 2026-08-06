import { z } from "zod";

/**
 * Form-shaped schemas. Kept out of the data layer so client components can
 * import them without pulling `server-only` modules into the browser bundle.
 */

export const BILLING_CYCLE_DAYS = [7, 14, 30] as const;
export const REVIEW_WINDOW_HOURS = [24, 48, 72] as const;
export const CLIENT_STATUSES = [
  "Onboarding",
  "Active",
  "Paused",
  "Churned",
] as const;
export const BILL_ON = ["booked", "showed"] as const;

export const DEFAULT_CRITERIA_PLACEHOLDER =
  "A new prospect, not already in the client's pipeline, booked through Vistrial, within the service area, for an accepted job type.";

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => (value ? value : null));

/** The appointment definition half of the create form. */
export const definitionFieldsSchema = z.object({
  criteria: z
    .string()
    .trim()
    .min(10, "Describe what makes an appointment billable."),
  service_area: optionalText,
  /** Comma separated in the form; split on the way to the database. */
  accepted_job_types: z
    .string()
    .trim()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    ),
});

export const clientFieldsSchema = z.object({
  name: z.string().trim().min(2, "Business name must be at least 2 characters."),
  contact_name: optionalText,
  contact_email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .refine(
      (value) => value === null || z.email().safeParse(value).success,
      "Contact email must be a valid email."
    ),
  contact_phone: optionalText,
  status: z.enum(CLIENT_STATUSES).default("Onboarding"),

  rate_per_appointment: z.coerce
    .number()
    .positive("Rate per appointment must be greater than 0."),
  monthly_minimum: z.coerce
    .number()
    .min(0, "Monthly minimum cannot be negative."),
  billing_cycle_days: z.coerce
    .number()
    .refine(
      (value): value is (typeof BILLING_CYCLE_DAYS)[number] =>
        (BILLING_CYCLE_DAYS as readonly number[]).includes(value),
      "Billing cycle must be 7, 14, or 30 days."
    ),
  review_window_hours: z.coerce
    .number()
    .refine(
      (value): value is (typeof REVIEW_WINDOW_HOURS)[number] =>
        (REVIEW_WINDOW_HOURS as readonly number[]).includes(value),
      "Review window must be 24, 48, or 72 hours."
    ),
  bill_on: z.enum(BILL_ON).default("booked"),

  ghl_location_id: optionalText,
});

/** Creating a client always creates version one of its definition with it. */
export const createClientSchema = clientFieldsSchema.extend(
  definitionFieldsSchema.shape
);

export const updateClientSchema = clientFieldsSchema;

export const newDefinitionVersionSchema = definitionFieldsSchema.extend({
  client_id: z.uuid(),
});

export type CreateClientInput = z.input<typeof createClientSchema>;
export type UpdateClientInput = z.input<typeof updateClientSchema>;
export type NewDefinitionVersionInput = z.input<
  typeof newDefinitionVersionSchema
>;

/** Form state before validation: every control is a string in the DOM. */
export type ClientFormValues = {
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  status: (typeof CLIENT_STATUSES)[number];
  rate_per_appointment: string;
  monthly_minimum: string;
  billing_cycle_days: string;
  review_window_hours: string;
  bill_on: (typeof BILL_ON)[number];
  ghl_location_id: string;
  criteria: string;
  service_area: string;
  accepted_job_types: string;
};
