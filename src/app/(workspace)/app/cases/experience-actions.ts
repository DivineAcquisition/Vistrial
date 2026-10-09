"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { isLeadId } from "@/lib/cases/filters";
import { loadExperiencePage } from "@/lib/cases/experience-load";
import { toRpcFilter, type ExperienceFilter, type ExperienceRow } from "@/lib/cases/experience";
import { geminiEmbed, toVectorLiteral } from "@/lib/scribe/gemini";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Loose = SupabaseClient;

function db(): Promise<Loose> {
  return createClient().then((client) => client as unknown as Loose);
}

export async function fetchExperiencePage(filter: ExperienceFilter, offset: number): Promise<Result<{ rows: ExperienceRow[]; hasMore: boolean }>> {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return { ok: false, error: "Signed out." };
  const page = await loadExperiencePage(filter, offset);
  return { ok: true, data: { rows: page.rows, hasMore: page.hasMore } };
}

export async function saveLeadViewAction(input: { name: string; filters: ExperienceFilter; shared: boolean }): Promise<Result<null>> {
  const ctx = await getAuthContext();
  const name = input.name.trim().slice(0, 80);
  if (name.length < 1) return { ok: false, error: "Name the view." };
  if (input.shared && !(ctx.isStaff || ctx.workspaceRole === "owner")) {
    return { ok: false, error: "Only an owner can share a view." };
  }
  const client = await db();
  const { error } = await client.from("lead_saved_views").insert({
    org_id: ctx.org.id,
    member_id: ctx.member.id,
    name,
    filters: input.filters,
    shared: input.shared,
  });
  if (error) return { ok: false, error: error.message.includes("duplicate") ? "You already have a view with that name." : "Could not save that view." };
  revalidatePath("/app/cases");
  return { ok: true, data: null };
}

export async function deleteLeadViewAction(id: string): Promise<Result<null>> {
  const ctx = await getAuthContext();
  const client = await db();
  const { error } = await client.from("lead_saved_views").delete().eq("id", id).eq("org_id", ctx.org.id);
  if (error) return { ok: false, error: "Could not delete that view." };
  revalidatePath("/app/cases");
  return { ok: true, data: null };
}

export async function setListDensityAction(density: "comfortable" | "dense"): Promise<Result<null>> {
  const ctx = await getAuthContext();
  const client = await db();
  const { error } = await client.from("user_preferences").upsert(
    { user_id: ctx.user.id, list_density: density, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) return { ok: false, error: "Could not save that." };
  return { ok: true, data: null };
}

export async function addLeadNoteAction(input: { leadId: string; body: string; visibility: "shared" | "internal" }): Promise<Result<null>> {
  if (!isLeadId(input.leadId)) return { ok: false, error: "That lead is not in this workspace." };
  const ctx = await getAuthContext();
  const visibility = input.visibility === "internal" && (ctx.isStaff || ctx.isPlatformAdmin) ? "internal" : "shared";
  const body = input.body.trim().slice(0, 2000);
  if (!body) return { ok: false, error: "Write the note first." };
  const client = await db();
  const { error } = await client.from("lead_notes").insert({
    org_id: ctx.org.id,
    lead_id: input.leadId,
    body,
    visibility,
    author_member_id: ctx.member.id,
  });
  if (error) return { ok: false, error: "Could not save that note." };
  revalidatePath(`/app/cases/${input.leadId}`);
  return { ok: true, data: null };
}

export async function setDoNotContactAction(input: { leadId: string; on: boolean; reason?: string }): Promise<Result<null>> {
  if (!isLeadId(input.leadId)) return { ok: false, error: "That lead is not in this workspace." };
  const client = await db();
  const { error } = await client.rpc("set_lead_do_not_contact", {
    p_lead_id: input.leadId,
    p_on: input.on,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: error.message.includes("owner") || error.message.includes("reason") ? error.message : "Could not change that." };
  revalidatePath(`/app/cases/${input.leadId}`);
  return { ok: true, data: null };
}

export async function savePlanAction(input: { leadId: string; body?: string; status?: "open" | "done" | "snoozed"; snoozedUntil?: string | null }): Promise<Result<null>> {
  if (!isLeadId(input.leadId)) return { ok: false, error: "That lead is not in this workspace." };
  const ctx = await getAuthContext();
  const client = await db();
  if (input.status && input.status !== "open") {
    const { error } = await client
      .from("lead_plan_actions")
      .update({ status: input.status, snoozed_until: input.snoozedUntil ?? null, updated_at: new Date().toISOString() })
      .eq("org_id", ctx.org.id)
      .eq("lead_id", input.leadId)
      .eq("status", "open");
    if (error) return { ok: false, error: "Could not update that action." };
  }
  if (input.body?.trim()) {
    await client
      .from("lead_plan_actions")
      .update({ status: "replaced", updated_at: new Date().toISOString() })
      .eq("org_id", ctx.org.id)
      .eq("lead_id", input.leadId)
      .eq("status", "open");
    const { error } = await client.from("lead_plan_actions").insert({
      org_id: ctx.org.id,
      lead_id: input.leadId,
      body: input.body.trim().slice(0, 300),
      status: "open",
      source: "person",
      created_by_member_id: ctx.member.id,
    });
    if (error) return { ok: false, error: "Could not save that action." };
  }
  revalidatePath(`/app/cases/${input.leadId}`);
  return { ok: true, data: null };
}

export async function mergeLeadsAction(input: { survivorId: string; mergedId: string; reason: string; confirmed: boolean }): Promise<Result<null>> {
  if (!input.confirmed) return { ok: false, error: "Confirm the merge first." };
  if (!isLeadId(input.survivorId) || !isLeadId(input.mergedId)) return { ok: false, error: "That lead is not in this workspace." };
  const client = await db();
  const { error } = await client.rpc("merge_leads", { p_survivor: input.survivorId, p_merged: input.mergedId, p_reason: input.reason });
  if (error) return { ok: false, error: error.message.includes("owner") || error.message.includes("already") || error.message.includes("why") ? error.message : "Could not merge those leads." };
  revalidatePath("/app/cases");
  return { ok: true, data: null };
}

export async function unmergeLeadAction(input: { mergeId: string; reason: string }): Promise<Result<null>> {
  const client = await db();
  const { error } = await client.rpc("unmerge_lead", { p_merge_id: input.mergeId, p_reason: input.reason });
  if (error) return { ok: false, error: error.message.includes("owner") || error.message.includes("why") || error.message.includes("already") ? error.message : "Could not undo that merge." };
  revalidatePath("/app/cases");
  return { ok: true, data: null };
}

export async function exportCasesAction(filter: ExperienceFilter): Promise<Result<{ csv: string }>> {
  const ctx = await getAuthContext();
  if (!(ctx.isStaff || ctx.workspaceRole === "owner" || ctx.isPlatformAdmin)) return { ok: false, error: "You cannot export." };
  const client = await db();
  const { error } = await client.rpc("case_record_export", { p_org_id: ctx.org.id, p_what: "list", p_target: null });
  if (error) return { ok: false, error: "You cannot export." };
  const listed = await client.rpc("load_case_experience", {
    p_org_id: ctx.org.id,
    p_filter: toRpcFilter(filter, 15, ctx.member.id, 0),
    p_limit: 100,
  });
  const rows = (((listed.data ?? {}) as { rows?: Array<Record<string, unknown>> }).rows ?? []).map(mapRowCsv);
  const header = "name,email,phone,status,source,band,response,next";
  return { ok: true, data: { csv: [header, ...rows].join("\n") } };
}

function mapRowCsv(raw: Record<string, unknown>): string {
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [raw.name, raw.email, raw.phone, raw.status, raw.source, raw.band, raw.response_state, raw.person_action || raw.next_step].map(cell).join(",");
}

export async function meaningSearchAction(query: string): Promise<Result<Array<{ leadId: string; excerpt: string | null; similarity: number }>>> {
  const text = query.trim();
  if (text.length < 3) return { ok: false, error: "Type a little more." };
  const ctx = await getAuthContext();
  let vector: number[];
  try {
    [vector] = await geminiEmbed([text.slice(0, 500)], "RETRIEVAL_QUERY");
  } catch {
    return { ok: false, error: "Search by meaning is waiting on an outside service. Exact search still works." };
  }
  const client = await db();
  const { data, error } = await client.rpc("case_meaning_search", {
    p_org_id: ctx.org.id,
    p_embedding: toVectorLiteral(vector),
    p_limit: 12,
  });
  if (error) return { ok: false, error: "Could not search just now." };
  const rows = (data ?? []) as Array<{ lead_id: string; excerpt: string | null; similarity: number }>;
  return { ok: true, data: rows.map((row) => ({ leadId: row.lead_id, excerpt: row.excerpt, similarity: Number(row.similarity) })) };
}
