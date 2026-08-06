import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { Client, ClientUpdate } from "@/types/database";

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

export type NewClient = {
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: Client["status"];
  rate_per_appointment: number;
  monthly_minimum: number;
  billing_cycle_days: number;
  review_window_hours: number;
  bill_on: Client["bill_on"];
  duplicate_window_days: number;
  ghl_location_id: string | null;
  criteria: string;
  service_area: string | null;
  accepted_job_types: string[];
};

/**
 * Creates the client and version one of its appointment definition in a single
 * transaction. `webhook_secret` is never passed: the column default generates it.
 */
export async function createClientWithDefinition(
  input: NewClient
): Promise<Client> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .rpc("create_client_with_definition", {
      p_name: input.name,
      p_criteria: input.criteria,
      p_contact_name: input.contact_name,
      p_contact_email: input.contact_email,
      p_contact_phone: input.contact_phone,
      p_status: input.status,
      p_rate_per_appointment: input.rate_per_appointment,
      p_monthly_minimum: input.monthly_minimum,
      p_billing_cycle_days: input.billing_cycle_days,
      p_review_window_hours: input.review_window_hours,
      p_bill_on: input.bill_on,
      p_duplicate_window_days: input.duplicate_window_days,
      p_service_area: input.service_area,
      p_accepted_job_types: input.accepted_job_types,
      p_ghl_location_id: input.ghl_location_id,
    });

  if (error) {
    throw new Error(`Failed to create client: ${error.message}`);
  }

  if (!data) {
    throw new Error("Failed to create client: the database returned no row.");
  }

  return data as Client;
}

export async function updateClient(
  id: string,
  input: ClientUpdate
): Promise<Client> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clients")
    .update(input)
    .eq("id", id)
    .select("*")
    .returns<Client[]>()
    .single();

  if (error) {
    throw new Error(`Failed to update client ${id}: ${error.message}`);
  }

  return data;
}
