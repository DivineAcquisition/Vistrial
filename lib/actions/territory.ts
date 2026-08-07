"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin, requirePermission } from "@/lib/auth";
import {
  createServiceCategory,
  listActiveExclusivityPeers,
  listClientCategoryIds,
  listOverridesForClient,
  listServiceCategories,
  listTerritories,
  replaceClientCategories,
  setCategoryActive,
  setExclusivityStatus,
} from "@/lib/db/territory";
import {
  findConflicts,
  orderedPair,
  type TerritoryInput,
} from "@/lib/territory/conflict";
import {
  acknowledgeMatchSchema,
  categoryCreateSchema,
  crossClientWindowSchema,
  deleteTerritorySchema,
  overrideConflictSchema,
  setCategoriesSchema,
  territorySchema,
} from "@/lib/schemas/territory";
import { createServiceClient } from "@/lib/supabase/server";
import type { Territory } from "@/types/database";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; error: string; conflicts?: ReturnType<typeof findConflicts> };

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

function refresh(clientId?: string): void {
  revalidatePath("/attention");
  revalidatePath("/territories");
  revalidatePath("/clients");
  revalidatePath("/settings");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

function toInput(territory: Territory): TerritoryInput {
  return {
    id: territory.id,
    kind: territory.kind,
    label: territory.label,
    centerLat: territory.center_lat,
    centerLng: territory.center_lng,
    radiusMiles: territory.radius_miles === null ? null : Number(territory.radius_miles),
    postalCodes: territory.postal_codes ?? [],
    regionNames: territory.region_names ?? [],
  };
}

async function conflictsFor(
  clientId: string,
  categoryIds: string[],
  territories: TerritoryInput[]
) {
  const [categories, peers, overrides] = await Promise.all([
    listServiceCategories(),
    listActiveExclusivityPeers(clientId),
    listOverridesForClient(clientId),
  ]);

  const overridden = new Set(
    overrides.map((row) =>
      row.client_a_id === clientId ? row.client_b_id : row.client_a_id
    )
  );

  const names = new Map(categories.map((category) => [category.id, category.name]));

  return findConflicts({
    clientId,
    categoryIds,
    categoryNamesById: names,
    territories,
    others: peers.map((peer) => ({
      id: peer.client.id,
      name: peer.client.name,
      categoryIds: peer.categoryIds,
      territories: peer.territories.map(toInput),
      overridden: overridden.has(peer.client.id),
    })),
  });
}

export async function createCategoryAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  await requirePermission("manage_commercial");
  const parsed = categoryCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  try {
    const category = await createServiceCategory(parsed.data);
    refresh();
    return { ok: true, data: { id: category.id } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function setCategoryActiveAction(
  input: unknown
): Promise<ActionResult> {
  await requirePermission("manage_commercial");
  const parsed = z
    .object({ id: z.uuid(), active: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  try {
    await setCategoryActive(parsed.data.id, parsed.data.active);
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/**
 * Save categories and exclusivity status. Blocks on conflict unless an override
 * already covers the pair, or the status is not_offered / overridden with reason
 * handled via overrideConflictAction.
 */
export async function saveClientCategoriesAction(
  input: unknown
): Promise<ActionResult> {
  await requirePermission("manage_commercial");
  const parsed = setCategoriesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const territories = (await listTerritories(parsed.data.client_id)).map(toInput);

    if (
      parsed.data.exclusivity_status === "active" &&
      parsed.data.category_ids.length > 0 &&
      territories.length > 0
    ) {
      const conflicts = await conflictsFor(
        parsed.data.client_id,
        parsed.data.category_ids,
        territories
      );
      if (conflicts.length > 0) {
        return {
          ok: false,
          error:
            "This change conflicts with another active client. Override with a written reason, or change the categories/territories.",
          conflicts,
        };
      }
    }

    await replaceClientCategories(db, parsed.data.client_id, parsed.data.category_ids);
    await setExclusivityStatus(
      db,
      parsed.data.client_id,
      parsed.data.exclusivity_status
    );

    refresh(parsed.data.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function addTerritoryAction(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const user = await requirePermission("manage_commercial");
  const parsed = territorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const categoryIds = await listClientCategoryIds(parsed.data.client_id);
    const existing = (await listTerritories(parsed.data.client_id)).map(toInput);

    const draft: TerritoryInput =
      parsed.data.kind === "radius"
        ? {
            kind: "radius",
            centerLat: parsed.data.center_lat,
            centerLng: parsed.data.center_lng,
            radiusMiles: parsed.data.radius_miles,
          }
        : parsed.data.kind === "postal_codes"
          ? { kind: "postal_codes", postalCodes: parsed.data.postal_codes }
          : { kind: "named_regions", regionNames: parsed.data.region_names };

    const { data: client } = await db
      .from("clients")
      .select("exclusivity_status")
      .eq("id", parsed.data.client_id)
      .maybeSingle();

    if (client?.exclusivity_status === "active") {
      const conflicts = await conflictsFor(parsed.data.client_id, categoryIds, [
        ...existing,
        draft,
      ]);
      if (conflicts.length > 0) {
        return {
          ok: false,
          error:
            "This territory conflicts with another active client. Record an override with a reason first, or adjust the territory.",
          conflicts,
        };
      }
    }

    void user;

    // Single insert shape — Supabase RejectExcessProperties rejects a
    // discriminated union of kind-specific partials.
    const row = {
      client_id: parsed.data.client_id,
      kind: parsed.data.kind,
      label: parsed.data.label || null,
      center_lat: parsed.data.kind === "radius" ? parsed.data.center_lat : null,
      center_lng: parsed.data.kind === "radius" ? parsed.data.center_lng : null,
      center_address:
        parsed.data.kind === "radius"
          ? parsed.data.center_address || null
          : null,
      radius_miles:
        parsed.data.kind === "radius" ? parsed.data.radius_miles : null,
      postal_codes:
        parsed.data.kind === "postal_codes" ? parsed.data.postal_codes : [],
      region_names:
        parsed.data.kind === "named_regions" ? parsed.data.region_names : [],
    };

    const { data, error } = await db
      .from("territories")
      .insert(row)
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    refresh(parsed.data.client_id);
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function deleteTerritoryAction(
  input: unknown
): Promise<ActionResult> {
  await requirePermission("delete");
  const parsed = deleteTerritorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const { error } = await db
      .from("territories")
      .delete()
      .eq("id", parsed.data.id)
      .eq("client_id", parsed.data.client_id);
    if (error) throw new Error(error.message);
    refresh(parsed.data.client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function overrideConflictAction(
  input: unknown
): Promise<ActionResult> {
  const user = await requirePermission("territory_override");
  const parsed = overrideConflictSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();
  const [a, b] = orderedPair(parsed.data.client_id, parsed.data.other_client_id);

  try {
    const { error } = await db.from("exclusivity_overrides").upsert(
      {
        client_a_id: a,
        client_b_id: b,
        shared_category_ids: parsed.data.shared_category_ids,
        overlap_summary: parsed.data.overlap_summary,
        reason: parsed.data.reason,
        overridden_by: user.id,
        overridden_by_label: user.email,
      },
      { onConflict: "client_a_id,client_b_id" }
    );

    if (error) throw new Error(error.message);

    // Mark both clients so the promise that was not made is visible on either record.
    await db
      .from("clients")
      .update({ exclusivity_status: "overridden" })
      .in("id", [a, b]);

    refresh(parsed.data.client_id);
    refresh(parsed.data.other_client_id);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function acknowledgeCrossClientMatchAction(
  input: unknown
): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = acknowledgeMatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const { error } = await db
      .from("cross_client_matches")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: user.id,
        acknowledged_by_label: user.email,
      })
      .eq("id", parsed.data.id)
      .is("acknowledged_at", null);

    if (error) throw new Error(error.message);
    revalidatePath("/attention");
    revalidatePath("/leads");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

export async function setCrossClientWindowAction(
  input: unknown
): Promise<ActionResult> {
  await requirePermission("manage_commercial");
  const parsed = crossClientWindowSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  const db = createServiceClient();

  try {
    const { error } = await db.from("app_settings").upsert({
      key: "cross_client_window_days",
      value: String(parsed.data.days),
    });
    if (error) throw new Error(error.message);
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}

/** Preview conflicts without saving — used by the exclusivity UI. */
export async function previewConflictsAction(
  input: unknown
): Promise<ActionResult<{ conflicts: ReturnType<typeof findConflicts> }>> {
  await requirePermission("manage_commercial");
  const parsed = z
    .object({
      client_id: z.uuid(),
      category_ids: z.array(z.uuid()),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };

  try {
    const territories = (await listTerritories(parsed.data.client_id)).map(toInput);
    const conflicts = await conflictsFor(
      parsed.data.client_id,
      parsed.data.category_ids,
      territories
    );
    return { ok: true, data: { conflicts } };
  } catch (error) {
    return { ok: false, error: failureMessage(error) };
  }
}
