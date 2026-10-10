"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { canExport, canSeePeople } from "@/lib/auth/portal-access";
import { getAuthContext } from "@/lib/auth/session";
import { portalDb } from "@/lib/metrics/load";
import { filtersToJson, parseResultsFilters, resolveResultsRange } from "@/lib/metrics/range";
import { buildResultsExport } from "@/lib/portal/export";

export type ExportResult = { ok: true; message: string } | { ok: false; error: string };

const RECENT_LIMIT = 5;

/** Queues an export of what this person sees on Results, then builds it after the response is sent. */
export async function requestResultsExport(params: Record<string, string>): Promise<ExportResult> {
  const ctx = await getAuthContext();
  if (!canExport(ctx)) return { ok: false, error: "Exports are not turned on for you. An owner can turn them on." };
  const range = resolveResultsRange(params, { timeZone: ctx.org.timezone });
  const filters = parseResultsFilters(params);
  if (filters.person && !canSeePeople(ctx)) delete filters.person;
  const db = await portalDb();

  const { count } = await db
    .from("results_exports")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.org.id)
    .in("status", ["queued", "running"]);
  if ((count ?? 0) >= RECENT_LIMIT) {
    return { ok: false, error: "A few exports are still being built. Try again once they are ready." };
  }

  const { data: exportId, error } = await db.rpc("results_export_create", {
    p_org_id: ctx.org.id,
    p_params: { ...range.params, from: range.from, to: range.to, label: range.label, filters: filtersToJson(filters) },
  });
  if (error || typeof exportId !== "string") return { ok: false, error: "Could not start the export." };

  after(() =>
    buildResultsExport(db, {
      exportId,
      orgId: ctx.org.id,
      memberId: ctx.member.id ?? null,
      userId: ctx.user.id,
      label: `${ctx.org.name}, ${range.label}`,
      range: { from: range.from, to: range.to },
      previous: range.previous,
      filters,
    })
  );
  revalidatePath("/app/results");
  return { ok: true, message: "Building your export. It appears below when it is ready, and we email you." };
}
