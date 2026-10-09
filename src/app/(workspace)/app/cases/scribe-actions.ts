"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import { isLeadId } from "@/lib/cases/filters";
import { processExtractionQueue } from "@/lib/extraction/run";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const FIELD_KEY = /^[a-z0-9_]{1,60}$/;
const REPROCESS_MAX_CALLS = 25;
const REPROCESS_BATCHES_PER_DAY = 3;

function admin(): SupabaseClient {
  return getSupabaseAdmin() as unknown as SupabaseClient;
}

/**
 * The person's own client decides whether they can see this case file (RLS
 * covers workspace and operator lead scope). Writes then go through the
 * service role, because people never write case-file rows directly.
 */
async function visibleCaseFile(leadId: string): Promise<Result<{ caseFileId: string; orgId: string; memberId: string; userId: string }>> {
  if (!isLeadId(leadId)) return { ok: false, error: "That lead is not in this workspace." };
  const ctx = await getAuthContext();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data } = await db.from("case_files").select("id").eq("org_id", ctx.org.id).eq("lead_id", leadId).maybeSingle();
  if (!data) return { ok: false, error: "This case file is not open to you." };
  return { ok: true, data: { caseFileId: String(data.id), orgId: ctx.org.id, memberId: ctx.member.id, userId: ctx.user.id } };
}

async function log(userId: string, orgId: string, action: string, targetId: string, detail: Record<string, unknown>) {
  await admin().rpc("log_workspace_activity", {
    p_actor_user_id: userId,
    p_org_id: orgId,
    p_action: action,
    p_target_table: "case_file_fields",
    p_target_id: targetId,
    p_detail: detail,
  });
}

/** A person's value wins from now on; Scribe only suggests beside it. */
export async function editCaseFieldAction(input: { leadId: string; fieldKey: string; value: string | number | boolean | null }): Promise<Result> {
  if (!FIELD_KEY.test(input.fieldKey)) return { ok: false, error: "Unknown field." };
  const access = await visibleCaseFile(input.leadId);
  if (!access.ok) return access;
  const value = typeof input.value === "string" ? input.value.trim().slice(0, 500) || null : input.value;
  const { data, error } = await admin()
    .from("case_file_fields")
    .update({
      value,
      state: value == null ? "absent" : "present",
      source: "person",
      edited_by_member_id: access.data.memberId,
      edited_at: new Date().toISOString(),
      scribe_value: null,
      review_note: null,
    })
    .eq("case_file_id", access.data.caseFileId)
    .eq("org_id", access.data.orgId)
    .eq("field_key", input.fieldKey)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not save that. Try again." };
  await log(access.data.userId, access.data.orgId, "case_file.field_edited", String(data.id), { field: input.fieldKey });
  revalidatePath(`/app/cases/${input.leadId}`);
  return { ok: true, data: null };
}

/** Take Scribe's suggestion. It becomes the person's value. */
export async function acceptScribeSuggestionAction(input: { leadId: string; fieldKey: string }): Promise<Result> {
  if (!FIELD_KEY.test(input.fieldKey)) return { ok: false, error: "Unknown field." };
  const access = await visibleCaseFile(input.leadId);
  if (!access.ok) return access;
  const db = admin();
  const { data: field } = await db
    .from("case_file_fields")
    .select("id, scribe_value")
    .eq("case_file_id", access.data.caseFileId)
    .eq("field_key", input.fieldKey)
    .maybeSingle();
  if (!field || field.scribe_value == null) return { ok: false, error: "There is no suggestion to take." };
  const { error } = await db
    .from("case_file_fields")
    .update({
      value: field.scribe_value,
      state: "present",
      source: "person",
      edited_by_member_id: access.data.memberId,
      edited_at: new Date().toISOString(),
      scribe_value: null,
      review_note: null,
    })
    .eq("id", field.id);
  if (error) return { ok: false, error: "Could not save that. Try again." };
  await log(access.data.userId, access.data.orgId, "case_file.suggestion_accepted", String(field.id), { field: input.fieldKey });
  revalidatePath(`/app/cases/${input.leadId}`);
  return { ok: true, data: null };
}

export async function lockCaseFieldAction(input: { leadId: string; fieldKey: string; locked: boolean }): Promise<Result> {
  if (!FIELD_KEY.test(input.fieldKey)) return { ok: false, error: "Unknown field." };
  const access = await visibleCaseFile(input.leadId);
  if (!access.ok) return access;
  const { data, error } = await admin()
    .from("case_file_fields")
    .update({ locked: input.locked, locked_by_member_id: input.locked ? access.data.memberId : null })
    .eq("case_file_id", access.data.caseFileId)
    .eq("field_key", input.fieldKey)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Could not change that. Try again." };
  await log(access.data.userId, access.data.orgId, input.locked ? "case_file.field_locked" : "case_file.field_unlocked", String(data.id), {
    field: input.fieldKey,
  });
  revalidatePath(`/app/cases/${input.leadId}`);
  return { ok: true, data: null };
}

export async function scribeFeedbackAction(input: {
  leadId: string;
  fieldKey?: string | null;
  verdict: "right" | "wrong" | "missing";
  note?: string | null;
}): Promise<Result> {
  if (!["right", "wrong", "missing"].includes(input.verdict)) return { ok: false, error: "Pick right, wrong, or missing." };
  if (input.fieldKey && !FIELD_KEY.test(input.fieldKey)) return { ok: false, error: "Unknown field." };
  const access = await visibleCaseFile(input.leadId);
  if (!access.ok) return access;
  const { error } = await admin().from("scribe_feedback").insert({
    org_id: access.data.orgId,
    case_file_id: access.data.caseFileId,
    lead_id: input.leadId,
    field_key: input.fieldKey ?? null,
    member_id: access.data.memberId,
    verdict: input.verdict,
    note: input.note?.trim().slice(0, 1000) || null,
  });
  if (error) return { ok: false, error: "Could not save that. Try again." };
  return { ok: true, data: null };
}

/**
 * Read calls again with the current settings. Owners and the Vistrial team
 * only, a capped number of calls, a few batches a day, and only after the
 * person confirms. Fields a person edited or locked stay as they are.
 */
export async function reprocessCallsAction(input: { leadId?: string | null; days?: number; reason: string; confirmed: boolean }): Promise<Result<{ queued: number }>> {
  const ctx = await getAuthContext();
  if (!(ctx.isStaff || ctx.workspaceRole === "owner")) return { ok: false, error: "Only an owner or the Vistrial team can do this." };
  if (!input.confirmed) return { ok: false, error: "Confirm first." };
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, error: "Say why, in a few words." };
  if (input.leadId && !isLeadId(input.leadId)) return { ok: false, error: "That lead is not in this workspace." };
  const db = admin();
  const orgId = ctx.org.id;

  const { count } = await db
    .from("scribe_reprocess_batches")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= REPROCESS_BATCHES_PER_DAY) return { ok: false, error: "This workspace has re-read calls enough for today. Try again tomorrow." };

  const days = Math.min(Math.max(Math.round(input.days ?? 30), 1), 90);
  let query = db
    .from("calls")
    .select("id")
    .eq("org_id", orgId)
    .not("raw_transcript", "is", null)
    .gte("created_at", new Date(Date.now() - days * 86_400_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(REPROCESS_MAX_CALLS);
  if (input.leadId) query = query.eq("lead_id", input.leadId);
  const { data: calls } = await query;
  const ids = ((calls ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (ids.length === 0) return { ok: false, error: "No calls with transcripts to read again." };

  const { data: batch, error: batchError } = await db
    .from("scribe_reprocess_batches")
    .insert({
      org_id: orgId,
      requested_by_member_id: ctx.member.id,
      reason: reason.slice(0, 500),
      scope: { lead_id: input.leadId ?? null, days },
      total: ids.length,
      status: "running",
    })
    .select("id")
    .single();
  if (batchError || !batch) return { ok: false, error: "Could not start that. Try again." };

  let queued = 0;
  for (const callId of ids) {
    const { error } = await db.from("extraction_jobs").insert({
      org_id: orgId,
      call_id: callId,
      status: "pending",
      requested_by_member_id: ctx.member.id,
    });
    if (!error) queued += 1;
  }
  await db
    .from("scribe_reprocess_batches")
    .update({ total: queued, status: "done", finished_at: new Date().toISOString() })
    .eq("id", batch.id);
  await db.rpc("log_workspace_activity", {
    p_actor_user_id: ctx.user.id,
    p_org_id: orgId,
    p_action: "scribe.reprocess_requested",
    p_target_table: "scribe_reprocess_batches",
    p_target_id: batch.id,
    p_detail: { queued, lead_id: input.leadId ?? null, days },
  });
  after(() => processExtractionQueue(getSupabaseAdmin(), 3));
  revalidatePath("/app/agents/scribe");
  return { ok: true, data: { queued } };
}
