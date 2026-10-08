"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { PRODUCTION_ADMIN_ORIGIN } from "@/lib/constants";
import { requeueHeldWebhookEvent, webhookEventIdFromHoldRef } from "@/lib/inbound/holds";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { PlatformRole, WorkspaceStatus } from "@/types/database";

export type TeamActionResult = { ok: true; message?: string } | { ok: false; error: string };

const WORKSPACE_STATUSES: WorkspaceStatus[] = ["onboarding", "active", "paused", "closed"];
const PLATFORM_ROLES: PlatformRole[] = ["platform_admin", "service_team"];

/**
 * Every action here runs under the admin's own session, so the database
 * checks the permission again and records who did it. The page gate is a
 * courtesy; the database is the rule.
 */
async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) return { ok: false, error: "Only a Platform Admin can do this." };
  return { ok: true, userId: ctx.user.id };
}

function dbMessage(error: { message?: string } | null, fallback: string): string {
  const message = error?.message?.trim();
  if (!message) return fallback;
  // Our own RAISE messages are written for people; anything else is not shown.
  return /^[A-Z][^\n]{3,200}\.$/.test(message) ? message : fallback;
}

function revalidateTeam() {
  revalidatePath("/app/team", "layout");
  revalidatePath("/app", "layout");
}

export async function createWorkspace(_prev: TeamActionResult, formData: FormData): Promise<TeamActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim() || "America/New_York";
  const ownerEmail = String(formData.get("owner_email") ?? "").trim();
  const templateId = String(formData.get("template_id") ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Enter the business name." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_workspace", {
    p_name: name,
    p_timezone: timezone,
    p_owner_email: ownerEmail || null,
    p_template_id: templateId || null,
  });
  if (error) return { ok: false, error: dbMessage(error, "Could not create the workspace.") };
  const slug = (data as { slug?: string } | null)?.slug;
  revalidateTeam();
  return {
    ok: true,
    message: ownerEmail
      ? `Created ${slug}. The owner invite is in that workspace's People page.`
      : `Created ${slug}. Invite an owner from that workspace's People page.`,
  };
}

export async function setWorkspaceStatus(orgId: string, status: string, reason: string): Promise<TeamActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!WORKSPACE_STATUSES.includes(status as WorkspaceStatus)) return { ok: false, error: "Choose a status." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_workspace_status", {
    p_org_id: orgId,
    p_status: status as WorkspaceStatus,
    p_reason: reason.trim() || null,
  });
  if (error) return { ok: false, error: dbMessage(error, "Could not change the status.") };
  revalidateTeam();
  return { ok: true };
}

export async function assignStaff(orgId: string, userId: string): Promise<TeamActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!userId) return { ok: false, error: "Choose someone to assign." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_staff_to_workspace", { p_org_id: orgId, p_user_id: userId });
  if (error) return { ok: false, error: dbMessage(error, "Could not assign them.") };
  revalidateTeam();
  return { ok: true };
}

export async function unassignStaff(orgId: string, userId: string): Promise<TeamActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_staff_assignment", { p_org_id: orgId, p_user_id: userId });
  if (error) return { ok: false, error: dbMessage(error, "Could not end the assignment.") };
  revalidateTeam();
  return { ok: true };
}

/** The auth account for an email: invited when new, found when it already exists. */
async function authUserForEmail(email: string, displayName: string): Promise<{ id: string } | { error: string }> {
  const admin = getSupabaseAdmin();
  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${PRODUCTION_ADMIN_ORIGIN}/auth/callback`,
    data: { display_name: displayName },
  });
  if (invited.data?.user?.id) return { id: invited.data.user.id };

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return { id: match.id };
    if (data.users.length < 200) break;
  }
  return { error: "Could not invite that email address." };
}

export async function addStaff(_prev: TeamActionResult, formData: FormData): Promise<TeamActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = String(formData.get("role") ?? "service_team") as PlatformRole;
  const templateAccess = formData.get("template_access") === "on";
  if (!email.includes("@")) return { ok: false, error: "Enter a valid email." };
  if (!PLATFORM_ROLES.includes(role)) return { ok: false, error: "Choose a role." };

  const account = await authUserForEmail(email, displayName);
  if ("error" in account) return { ok: false, error: account.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_platform_staff", {
    p_user_id: account.id,
    p_role: role,
    p_active: true,
    p_template_access: templateAccess,
    p_display_name: displayName || null,
  });
  if (error) return { ok: false, error: dbMessage(error, "Could not add them to the team.") };
  revalidateTeam();
  return {
    ok: true,
    message: `${email} is on the team. They sign in at admin.vistrial.io and see only the workspaces you assign.`,
  };
}

export async function updateStaff(
  userId: string,
  patch: { role: PlatformRole; templateAccess: boolean }
): Promise<TeamActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!PLATFORM_ROLES.includes(patch.role)) return { ok: false, error: "Choose a role." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("upsert_platform_staff", {
    p_user_id: userId,
    p_role: patch.role,
    p_active: true,
    p_template_access: patch.templateAccess,
  });
  if (error) return { ok: false, error: dbMessage(error, "Could not update them.") };
  revalidateTeam();
  return { ok: true };
}

/**
 * Ends someone's access everywhere: staff role, assignments, every workspace
 * seat, and the sign-in itself. Their history stays under their name.
 */
export async function deactivatePerson(userId: string): Promise<TeamActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { error } = await supabase.rpc("deactivate_user_everywhere", { p_user_id: userId });
  if (error) return { ok: false, error: dbMessage(error, "Could not deactivate them.") };
  const { error: banError } = await getSupabaseAdmin().auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  revalidateTeam();
  if (banError) {
    return { ok: true, message: "Access removed from every workspace. Their sign-in could not be blocked; try again." };
  }
  return { ok: true };
}

export async function reviewHold(holdId: string, decision: "released" | "discarded", note: string): Promise<TeamActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const supabase = await createClient();
  const { data: hold } = await supabase
    .from("inbound_event_holds")
    .select("id, source, external_ref, review_status")
    .eq("id", holdId)
    .maybeSingle();
  if (!hold || hold.review_status !== "open") return { ok: false, error: "That event was already reviewed." };

  const { error } = await supabase.rpc("review_inbound_event_hold", {
    p_id: holdId,
    p_status: decision,
    p_note: note.trim() || null,
  });
  if (error) return { ok: false, error: dbMessage(error, "Could not record the review.") };

  revalidatePath("/app/team/holds");
  if (decision === "discarded") return { ok: true };

  // CRM and transcript events wait in their queue and run again on release,
  // through the same workspace check. Other sources are not replayable here.
  const eventId = webhookEventIdFromHoldRef(hold.external_ref);
  if (eventId && (hold.source === "crm" || hold.source === "transcripts")) {
    const requeued = await requeueHeldWebhookEvent(getSupabaseAdmin(), eventId);
    return {
      ok: true,
      message: requeued
        ? "Released. The event runs again on the next pass, and is held again if its workspace is still not open."
        : "Released. The original event is no longer queued, so nothing was re-run.",
    };
  }
  return { ok: true, message: "Marked released. Ask the sender to resend it once the workspace is ready." };
}
