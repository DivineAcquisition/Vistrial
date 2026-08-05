import "server-only";

import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import type { Client, ClientInsert, ClientUpdate } from "@/types/database";

/**
 * `webhook_secret` is intentionally not part of this schema. The column default
 * generates it, and a strict object rejects it if a caller tries to send one.
 */
export const clientInsertSchema = z.strictObject({
  name: z.string().min(2, "Client name must be at least 2 characters."),
  contact_name: z.string().nullish(),
  contact_email: z.string().email("Contact email must be a valid email.").nullish(),
  contact_phone: z.string().nullish(),
  status: z.enum(["Onboarding", "Active", "Paused", "Churned"]).optional(),

  rate_per_appointment: z
    .number()
    .positive("Rate per appointment must be greater than 0.")
    .optional(),
  monthly_minimum: z
    .number()
    .min(0, "Monthly minimum cannot be negative.")
    .optional(),
  billing_cycle_days: z
    .number()
    .int("Billing cycle must be a whole number of days.")
    .positive("Billing cycle must be greater than 0 days.")
    .optional(),
  review_window_hours: z
    .number()
    .int("Review window must be a whole number of hours.")
    .positive("Review window must be greater than 0 hours.")
    .optional(),
  bill_on: z.enum(["booked", "showed"]).optional(),

  service_area: z.string().nullish(),
  accepted_job_types: z.array(z.string()).nullish(),

  ghl_location_id: z.string().nullish(),
  stripe_customer_id: z.string().nullish(),
  stripe_payment_method_id: z.string().nullish(),
});

export const clientUpdateSchema = clientInsertSchema.partial();

function describe(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}

export async function listClients(): Promise<Client[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Client[]>();

  if (error) {
    throw new Error(`Failed to list clients: ${error.message}`);
  }

  return data ?? [];
}

export async function getClient(id: string): Promise<Client | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .returns<Client[]>()
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load client ${id}: ${error.message}`);
  }

  return data ?? null;
}

/**
 * Webhook lookup: an unknown location is a normal outcome, not an error.
 */
export async function getClientByLocation(
  ghlLocationId: string
): Promise<Client | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("ghl_location_id", ghlLocationId)
    .returns<Client[]>()
    .maybeSingle();

  if (error) {
    return null;
  }

  return data ?? null;
}

export async function createClient(input: ClientInsert): Promise<Client> {
  const parsed = clientInsertSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid client: ${describe(parsed.error)}`);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clients")
    .insert(parsed.data)
    .select("*")
    .returns<Client[]>()
    .single();

  if (error) {
    throw new Error(`Failed to create client: ${error.message}`);
  }

  return data;
}

export async function updateClient(
  id: string,
  input: ClientUpdate
): Promise<Client> {
  const parsed = clientUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid client update: ${describe(parsed.error)}`);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clients")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .returns<Client[]>()
    .single();

  if (error) {
    throw new Error(`Failed to update client ${id}: ${error.message}`);
  }

  return data;
}
