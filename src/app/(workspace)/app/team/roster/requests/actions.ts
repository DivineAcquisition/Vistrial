"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { renderRequestEmail } from "@/lib/access-requests/email-template";
import { parseFitRules } from "@/lib/access-requests/fit";
import { getAuthContext } from "@/lib/auth/session";
import { sendPortalMail } from "@/lib/portal/notices";
import { staffDb } from "@/lib/staff/db";

export type QueueResult = { ok: true; message?: string } | { ok: false; error: string };

function dbMessage(error: { message?: string } | null, fallback: string): string {
  const message = error?.message?.trim();
  if (!message) return fallback;
  return /^[A-Z][^\n]{3,200}\.$/.test(message) ? message : fallback;
}

async function adminDb(): Promise<{ db: SupabaseClient } | { error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { error: "Only a Platform Admin can do that." };
  return { db: await staffDb() };
}

function refresh(id?: string) {
  revalidatePath("/app/team/roster/requests");
  if (id) revalidatePath(`/app/team/roster/requests/${id}`);
}

export async function setRequestStatus(id: string, status: string, version: number): Promise<QueueResult> {
  const gate = await adminDb();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { error } = await gate.db.rpc("set_access_request_status", { p_id: id, p_status: status, p_version: version });
  if (error) return { ok: false, error: dbMessage(error, "Could not update that request.") };
  refresh(id);
  return { ok: true, message: "Status saved." };
}

export async function assignRequest(id: string, ownerId: string, version: number): Promise<QueueResult> {
  const gate = await adminDb();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { error } = await gate.db.rpc("assign_access_request", {
    p_id: id,
    p_owner: ownerId || null,
    p_version: version,
  });
  if (error) return { ok: false, error: dbMessage(error, "Could not assign that request.") };
  refresh(id);
  return { ok: true, message: "Owner saved." };
}

export async function addRequestNote(id: string, note: string): Promise<QueueResult> {
  const gate = await adminDb();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { error } = await gate.db.rpc("add_access_request_note", { p_id: id, p_note: note });
  if (error) return { ok: false, error: dbMessage(error, "Could not save the note.") };
  refresh(id);
  return { ok: true, message: "Note saved." };
}

export async function bulkRequestStatus(ids: string[], status: string): Promise<QueueResult> {
  const gate = await adminDb();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { data, error } = await gate.db.rpc("bulk_set_access_request_status", { p_ids: ids, p_status: status });
  if (error) return { ok: false, error: dbMessage(error, "Could not update those requests.") };
  refresh();
  const updated = (data as { updated?: number } | null)?.updated ?? 0;
  return { ok: true, message: `Updated ${updated} requests.` };
}

export async function deleteRequest(id: string, reason: string): Promise<QueueResult> {
  const gate = await adminDb();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { error } = await gate.db.rpc("delete_access_request", { p_id: id, p_reason: reason });
  if (error) return { ok: false, error: dbMessage(error, "Could not delete that request.") };
  refresh();
  redirect("/app/team/roster/requests");
}

export async function sendRequestReply(id: string, templateId: string): Promise<QueueResult> {
  const gate = await adminDb();
  if ("error" in gate) return { ok: false, error: gate.error };
  const [{ data: request }, { data: template }] = await Promise.all([
    gate.db.from("access_requests").select("email, full_name").eq("id", id).maybeSingle(),
    gate.db.from("access_request_templates").select("subject, body").eq("id", templateId).maybeSingle(),
  ]);
  if (!request || !template) return { ok: false, error: "That request is not available." };
  const subject = renderRequestEmail(String(template.subject), String(request.full_name));
  const body = renderRequestEmail(String(template.body), String(request.full_name));
  if (!subject || !body) return { ok: false, error: "That template has a placeholder other than the name." };
  const mail = await sendPortalMail({
    to: String(request.email),
    subject,
    lines: body.split("\n").filter((line) => line.length > 0),
    idempotencyKey: `access-reply:${id}:${templateId}:${new Date().toISOString().slice(0, 16)}`,
  });
  if (!mail.ok) return { ok: false, error: "The email did not send. The request was not changed." };
  const { error } = await gate.db.rpc("log_access_request_reply", { p_id: id, p_template: templateId });
  if (error) return { ok: false, error: dbMessage(error, "The email sent, but the log did not save.") };
  refresh(id);
  return { ok: true, message: "Reply sent." };
}

export async function saveRequestSettings(formData: FormData): Promise<QueueResult> {
  const gate = await adminDb();
  if ("error" in gate) return { ok: false, error: gate.error };
  let fitRules: unknown = undefined;
  const rawRules = String(formData.get("fit_rules") ?? "").trim();
  if (rawRules) {
    try {
      fitRules = parseFitRules(JSON.parse(rawRules));
    } catch {
      fitRules = null;
    }
    if (!fitRules) return { ok: false, error: "The fit rules are not valid. Each rule needs an id, a field, a list, a pass line, and a fail line." };
  }
  const { error } = await gate.db.rpc("update_access_request_settings", {
    p_settings: {
      onboard_intent: Number(formData.get("onboard_intent")),
      retention_months: Number(formData.get("retention_months")),
      stale_business_days: Number(formData.get("stale_business_days")),
      staff_timezone: String(formData.get("staff_timezone") ?? ""),
      ...(fitRules ? { fit_rules: fitRules } : {}),
    },
  });
  if (error) return { ok: false, error: dbMessage(error, "Could not save the settings.") };
  revalidatePath("/app/team/roster/requests/settings");
  return { ok: true, message: "Settings saved." };
}

export async function saveRequestTemplate(id: string, subject: string, body: string): Promise<QueueResult> {
  const gate = await adminDb();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { error } = await gate.db.rpc("upsert_access_request_template", { p_id: id, p_subject: subject, p_body: body });
  if (error) return { ok: false, error: dbMessage(error, "Could not save the template.") };
  revalidatePath("/app/team/roster/requests/settings");
  return { ok: true, message: "Template saved." };
}

export async function setRequestViewer(userId: string, allowed: boolean): Promise<QueueResult> {
  const gate = await adminDb();
  if ("error" in gate) return { ok: false, error: gate.error };
  const { error } = await gate.db.rpc("set_access_request_viewer", { p_user: userId, p_allowed: allowed });
  if (error) return { ok: false, error: dbMessage(error, "Could not update that grant.") };
  revalidatePath("/app/team/roster/requests/settings");
  return { ok: true, message: allowed ? "View granted." : "View removed." };
}

export async function saveRequestViewForm(formData: FormData): Promise<void> {
  await saveRequestView(String(formData.get("name") ?? ""), String(formData.get("query") ?? ""));
}

export async function saveRequestView(name: string, query: string): Promise<QueueResult> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can do that." };
  const db = await staffDb();
  const { error } = await db.from("access_request_views").insert({
    user_id: ctx.user.id,
    name: name.slice(0, 80),
    query: { q: query.slice(0, 500) },
  });
  if (error) return { ok: false, error: "Could not save that view." };
  refresh();
  return { ok: true, message: "View saved." };
}

export async function deleteRequestView(id: string): Promise<QueueResult> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can do that." };
  const db = await staffDb();
  const { error } = await db.from("access_request_views").delete().eq("id", id).eq("user_id", ctx.user.id);
  if (error) return { ok: false, error: "Could not delete that view." };
  refresh();
  return { ok: true };
}
