"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ORG_COOKIE_NAME, orgCookieOptions } from "@/lib/auth/cookies";
import { safeInternalPath } from "@/lib/auth/paths";
import { getAuthContext } from "@/lib/auth/session";
import { landingPath } from "@/lib/navigation";
import { assertRecentAuth } from "@/lib/staff/mfa-check";
import { dbMessage, staffDb } from "@/lib/staff/db";
import { LIVE_AGENT_IDS } from "@/lib/agents/roster";

export type StaffResult = { ok: true; message?: string } | { ok: false; error: string };

function staffPaths() {
  revalidatePath("/app/team", "layout");
  revalidatePath("/app", "layout");
}

async function gate(): Promise<{ ok: true; userId: string; admin: boolean } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can do this." };
  return { ok: true, userId: ctx.user.id, admin: ctx.isPlatformAdmin };
}

/** Opens a customer workspace and records the visit. A lapsed visit starts a new one. */
export async function enterWorkspace(orgId: string, nextPath: string): Promise<StaffResult> {
  const ctx = await getAuthContext();
  const target = ctx.memberships.find((membership) => membership.orgId === orgId);
  if (!target) return { ok: false, error: "That workspace is not available to you." };
  await assertRecentAuth(`/app/team/enter?org=${orgId}&next=${encodeURIComponent(safeInternalPath(nextPath, "/app/home"))}`);
  const db = await staffDb();
  const { error } = await db.rpc("staff_session_enter", { p_org_id: orgId });
  if (error) return { ok: false, error: dbMessage(error, "Could not open that workspace.") };
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE_NAME, orgId, orgCookieOptions);
  staffPaths();
  redirect(safeInternalPath(nextPath, landingPath(target.surfaceAccess, target.role)));
}

export async function exitWorkspace(): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.isStaff) {
    const db = await staffDb();
    await db.rpc("staff_session_exit");
  }
  staffPaths();
  redirect("/app/team");
}

export async function addStaffNote(orgId: string, body: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.rpc("staff_note_add", { p_org_id: orgId, p_body: body });
  if (error) return { ok: false, error: dbMessage(error, "Could not save the note.") };
  revalidatePath(`/app/team/workspaces/${orgId}`);
  return { ok: true };
}

export async function archiveStaffNote(noteId: string, orgId: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.rpc("staff_note_archive", { p_note_id: noteId });
  if (error) return { ok: false, error: dbMessage(error, "Could not archive the note.") };
  revalidatePath(`/app/team/workspaces/${orgId}`);
  return { ok: true };
}

export async function saveRosterView(name: string, params: Record<string, string>): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.from("staff_saved_views").upsert(
    { user_id: allowed.userId, page: "roster", name: name.trim().slice(0, 60), params },
    { onConflict: "user_id,page,name" }
  );
  if (error) return { ok: false, error: "Could not save that view." };
  revalidatePath("/app/team/roster");
  return { ok: true, message: "View saved." };
}

export async function deleteRosterView(id: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.from("staff_saved_views").delete().eq("id", id).eq("user_id", allowed.userId);
  if (error) return { ok: false, error: "Could not delete that view." };
  revalidatePath("/app/team/roster");
  return { ok: true };
}

export async function saveRosterColumns(columns: string[]): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.rpc("staff_save_columns", { p_columns: columns });
  if (error) return { ok: false, error: dbMessage(error, "Could not save the columns.") };
  revalidatePath("/app/team/roster");
  return { ok: true };
}

export async function actOnEscalation(input: {
  id: string;
  action: string;
  note?: string;
  userId?: string;
  until?: string;
  expected?: string;
}): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.rpc("staff_escalation_act", {
    p_id: input.id,
    p_action: input.action,
    p_note: input.note ?? null,
    p_user_id: input.userId || null,
    p_until: input.until || null,
    p_expected: input.expected || null,
  });
  if (error) return { ok: false, error: dbMessage(error, "Could not update that escalation.") };
  revalidatePath("/app/team/queue");
  revalidatePath(`/app/team/queue/${input.id}`);
  return { ok: true };
}

export async function assignHelpRequest(requestId: string, userId: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.rpc("help_request_assign", { p_request_id: requestId, p_user_id: userId });
  if (error) return { ok: false, error: dbMessage(error, "Could not assign that request.") };
  revalidatePath(`/app/team/requests/${requestId}`);
  return { ok: true };
}

export async function actOnDataRequest(input: {
  id: string;
  action: string;
  note?: string;
  userId?: string;
  expected?: string;
}): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  if (input.action === "approve") await assertRecentAuth(`/app/team/data-requests/${input.id}`);
  const db = await staffDb();
  const { error } = await db.rpc("data_request_act", {
    p_request_id: input.id,
    p_action: input.action,
    p_note: input.note ?? null,
    p_user_id: input.userId || null,
    p_expected: input.expected || null,
  });
  if (error) return { ok: false, error: dbMessage(error, "Could not update that request.") };
  revalidatePath("/app/team/data-requests");
  revalidatePath(`/app/team/data-requests/${input.id}`);
  revalidatePath("/app/settings/privacy");
  return { ok: true };
}

export async function createStaffDataRequest(orgId: string, kind: string, ownerMemberId: string, note: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { data, error } = await db.rpc("data_request_staff_create", {
    p_org_id: orgId,
    p_kind: kind,
    p_owner_member_id: ownerMemberId,
    p_note: note,
  });
  if (error) return { ok: false, error: dbMessage(error, "Could not record that request.") };
  revalidatePath("/app/team/data-requests");
  return { ok: true, message: typeof data === "string" ? data : "Request recorded." };
}

export async function setCarrierStatus(orgId: string, status: string, note: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.rpc("set_carrier_registration", { p_org_id: orgId, p_status: status, p_note: note || null });
  if (error) return { ok: false, error: dbMessage(error, "Could not update the carrier status.") };
  revalidatePath("/app/team/connections");
  return { ok: true };
}

export async function setAgentHalt(agentId: string, halted: boolean, reason: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  if (!allowed.admin) return { ok: false, error: "Only a Platform Admin can halt an agent everywhere." };
  if (!LIVE_AGENT_IDS.includes(agentId as (typeof LIVE_AGENT_IDS)[number])) return { ok: false, error: "Unknown agent." };
  await assertRecentAuth("/app/team/agents");
  const db = await staffDb();
  const { error } = await db.rpc("set_platform_agent_halt", { p_agent_id: agentId, p_halted: halted, p_reason: reason });
  if (error) return { ok: false, error: dbMessage(error, "Could not change that halt.") };
  revalidatePath("/app/team/agents");
  return { ok: true };
}

export async function reviewAgentRun(runId: string, note: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.rpc("staff_run_review", { p_run_id: runId, p_outcome: "reviewed", p_note: note || null });
  if (error) return { ok: false, error: dbMessage(error, "Could not mark that run reviewed.") };
  revalidatePath("/app/team/agents");
  return { ok: true, message: "Marked reviewed. The run is not started again from here." };
}

export async function saveHealthRules(patch: Record<string, unknown>, description: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  if (!allowed.admin) return { ok: false, error: "Only a Platform Admin can change health rules." };
  await assertRecentAuth("/app/team/health-rules");
  const db = await staffDb();
  const { error } = await db.rpc("staff_health_rules_save", { p_rules: patch, p_description: description });
  if (error) return { ok: false, error: dbMessage(error, "Could not save the health rules.") };
  revalidatePath("/app/team/health-rules");
  return { ok: true, message: "Saved as a new version." };
}

export async function saveSupportSettings(patch: Record<string, unknown>): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  if (!allowed.admin) return { ok: false, error: "Only a Platform Admin can change support settings." };
  const db = await staffDb();
  const { error } = await db.rpc("staff_support_settings_save", { p_patch: patch });
  if (error) return { ok: false, error: dbMessage(error, "Could not save support settings.") };
  revalidatePath("/app/team/support");
  return { ok: true, message: "Support settings saved." };
}

export async function setMfaEnforced(on: boolean): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  if (!allowed.admin) return { ok: false, error: "Only a Platform Admin can change this." };
  const db = await staffDb();
  const { error } = await db.rpc("staff_mfa_set_enforced", { p_on: on });
  if (error) return { ok: false, error: dbMessage(error, "Could not change authenticator enforcement.") };
  revalidatePath("/app/team/security");
  return { ok: true, message: on ? "Authenticator apps are now required for the team." : "Authenticator apps are no longer required." };
}

export async function setBillingAccess(userId: string, allowed: boolean): Promise<StaffResult> {
  const gateResult = await gate();
  if (!gateResult.ok) return gateResult;
  const db = await staffDb();
  const { error } = await db.rpc("set_staff_billing_access", { p_user_id: userId, p_allowed: allowed });
  if (error) return { ok: false, error: dbMessage(error, "Could not change billing access.") };
  revalidatePath("/app/team/staff");
  return { ok: true };
}

export async function bulkAssign(orgIds: string[], userId: string, unassign: boolean): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { data, error } = await db.rpc("staff_bulk_assign", { p_org_ids: orgIds, p_user_id: userId, p_unassign: unassign });
  if (error) return { ok: false, error: dbMessage(error, "Could not update those assignments.") };
  revalidatePath("/app/team/roster");
  return { ok: true, message: `${Number(data ?? 0)} workspace${Number(data) === 1 ? "" : "s"} updated.` };
}

export async function deactivateWithHandover(userId: string, handover: Record<string, string>): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.rpc("staff_deactivate_with_handover", { p_user_id: userId, p_handover: handover });
  if (error) return { ok: false, error: dbMessage(error, "Could not deactivate them.") };
  const { error: banError } = await (await import("@/lib/supabase/admin")).getSupabaseAdmin().auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });
  revalidatePath("/app/team/staff");
  if (banError) return { ok: true, message: "Their work was handed over. Their sign-in could not be blocked; try again." };
  return { ok: true, message: "Handed over and deactivated." };
}

export async function setOperatorSummaries(orgId: string, enabled: boolean, note: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  if (!allowed.admin) return { ok: false, error: "Only a Platform Admin can change Operator summaries." };
  const db = await staffDb();
  const { error } = await db.rpc("set_operator_summaries", { p_org_id: orgId, p_enabled: enabled, p_note: note || null });
  if (error) return { ok: false, error: dbMessage(error, "Could not change Operator summaries.") };
  revalidatePath(`/app/team/workspaces/${orgId}/operators`);
  return { ok: true };
}

export async function saveCannedReply(title: string, body: string, shared: boolean): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  if (shared && !allowed.admin) return { ok: false, error: "Only a Platform Admin can add a shared reply." };
  const db = await staffDb();
  const { error } = await db.from("staff_canned_replies").insert({
    title: title.trim().slice(0, 80),
    body: body.trim().slice(0, 4000),
    shared,
    owner_user_id: allowed.userId,
  });
  if (error) return { ok: false, error: "Could not save that reply." };
  revalidatePath("/app/team/support");
  return { ok: true };
}
