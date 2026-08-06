import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { AppointmentDefinition } from "@/types/database";

/** Newest version first. */
export async function listDefinitions(
  clientId: string
): Promise<AppointmentDefinition[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("appointment_definitions")
    .select("*")
    .eq("client_id", clientId)
    .order("version", { ascending: false })
    .returns<AppointmentDefinition[]>();

  if (error) {
    throw new Error(
      `Failed to list appointment definitions for client ${clientId}: ${error.message}`
    );
  }

  return data ?? [];
}

/**
 * Adds the next version. Never updates an existing row: an appointment is judged
 * against the version in effect when it was created, so history has to stay
 * intact. Version numbering happens inside the database function.
 */
export async function createDefinitionVersion(input: {
  clientId: string;
  criteria: string;
  serviceArea: string | null;
  acceptedJobTypes: string[];
}): Promise<AppointmentDefinition> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .rpc("create_appointment_definition_version", {
      p_client_id: input.clientId,
      p_criteria: input.criteria,
      p_service_area: input.serviceArea,
      p_accepted_job_types: input.acceptedJobTypes,
    });

  if (error) {
    throw new Error(`Failed to create definition version: ${error.message}`);
  }

  if (!data) {
    throw new Error(
      "Failed to create definition version: the database returned no row."
    );
  }

  return data as AppointmentDefinition;
}
