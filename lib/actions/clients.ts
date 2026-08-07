"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { createDefinitionVersion } from "@/lib/db/appointment-definitions";
import { createClientWithDefinition, updateClient } from "@/lib/db/clients";
import {
  createClientSchema,
  newDefinitionVersionSchema,
  updateClientSchema,
} from "@/lib/schemas/client";

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

export async function createClientAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("manage_commercial");

  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.error) };
  }

  const {
    criteria,
    service_area,
    accepted_job_types,
    ...clientFields
  } = parsed.data;

  try {
    const client = await createClientWithDefinition({
      ...clientFields,
      criteria,
      service_area,
      accepted_job_types,
    });

    revalidatePath("/clients");
    return { ok: true, data: { id: client.id } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function updateClientAction(
  id: string,
  input: unknown
): Promise<ActionResult> {
  await requirePermission("manage_commercial");

  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.error) };
  }

  try {
    await updateClient(id, parsed.data);
    revalidatePath("/clients");
    revalidatePath(`/clients/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function createDefinitionVersionAction(
  input: unknown
): Promise<ActionResult<{ version: number }>> {
  await requirePermission("manage_definitions");

  const parsed = newDefinitionVersionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.error) };
  }

  try {
    const definition = await createDefinitionVersion({
      clientId: parsed.data.client_id,
      criteria: parsed.data.criteria,
      serviceArea: parsed.data.service_area,
      acceptedJobTypes: parsed.data.accepted_job_types,
    });

    revalidatePath(`/clients/${parsed.data.client_id}`);
    return { ok: true, data: { version: definition.version } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}
