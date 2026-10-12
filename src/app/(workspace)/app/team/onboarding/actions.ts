"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthContext } from "@/lib/auth/session";
import type { GhlDb } from "@/lib/ghl/tokens";
import { loadCheckinFacts } from "@/lib/onboarding/checkins";
import { startSampleRun } from "@/lib/onboarding/sample";
import { isRejectionCode } from "@/lib/onboarding/registration";
import { isStageKey } from "@/lib/onboarding/stages";
import { sendOwnerInvite } from "@/lib/onboarding/invite-email";
import { queuePortalNotice } from "@/lib/portal/notices";
import { dbMessage, staffDb } from "@/lib/staff/db";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Staff actions on a workspace's onboarding. Every one runs as the staff
 * member, so the database checks again that they are staff of that workspace
 * (Service Team: assigned only) and logs who did it. The service-role client
 * is used only after that check, for sending (the sample test, the Owner's
 * notices) and never to widen what the person can see.
 */

export type StaffResult = { ok: true; message?: string } | { ok: false; error: string };

async function gate(): Promise<{ ok: true; userId: string; admin: boolean; label: string } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.isStaff) return { ok: false, error: "Only the Vistrial team can do this." };
  return { ok: true, userId: ctx.user.id, admin: ctx.isPlatformAdmin, label: ctx.member.displayName };
}

function refresh(orgId?: string) {
  revalidatePath("/app/team/onboarding");
  if (orgId) revalidatePath(`/app/team/onboarding/${orgId}`);
  revalidatePath("/app/team", "layout");
}

async function call(orgId: string | null, fn: string, args: Record<string, unknown>, fallback: string, success?: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.rpc(fn, args);
  if (error) return { ok: false, error: error.code === "40001" ? "Someone else changed this a moment ago. Reload and try again." : dbMessage(error, fallback) };
  refresh(orgId ?? undefined);
  return { ok: true, message: success };
}

/** Confirms the person may act on this workspace before the service role sends anything. */
async function confirmStaffOf(orgId: string): Promise<boolean> {
  const db = await staffDb();
  const { error } = await db.rpc("onboarding_refresh", { p_org_id: orgId });
  return !error;
}

export const skipStage = async (orgId: string, key: string, reason: string, version: number) =>
  isStageKey(key)
    ? call(orgId, "onboarding_stage_skip", { p_org_id: orgId, p_key: key, p_reason: reason, p_expected_version: version }, "Could not skip that stage.", "Skipped.")
    : ({ ok: false, error: "Unknown stage." } as StaffResult);

export const reopenStage = async (orgId: string, key: string, reason: string, version: number) =>
  isStageKey(key)
    ? call(orgId, "onboarding_stage_reopen", { p_org_id: orgId, p_key: key, p_reason: reason, p_expected_version: version }, "Could not reopen that stage.", "Reopened.")
    : ({ ok: false, error: "Unknown stage." } as StaffResult);

export const saveStageNote = async (orgId: string, key: string, note: string, staffNote: string, eta: string, version: number) =>
  isStageKey(key)
    ? call(
        orgId,
        "onboarding_stage_note",
        { p_org_id: orgId, p_key: key, p_note: note, p_staff_note: staffNote, p_eta: eta, p_expected_version: version },
        "Could not save the note.",
        "Saved."
      )
    : ({ ok: false, error: "Unknown stage." } as StaffResult);

export const signOffReview = async (orgId: string, note: string) =>
  call(orgId, "onboarding_config_review_signoff", { p_org_id: orgId, p_note: note || null }, "Could not sign off the review.", "Review signed off.");

export const acceptWarning = async (orgId: string, key: string, reason: string) =>
  call(orgId, "onboarding_accept_warning", { p_org_id: orgId, p_check_key: key, p_reason: reason }, "Could not accept the warning.", "Accepted, with your reason recorded.");

export const revokeAcceptance = async (orgId: string, key: string) =>
  call(orgId, "onboarding_revoke_acceptance", { p_org_id: orgId, p_check_key: key }, "Could not change that.");

export const approveGoLive = async (orgId: string, note: string) =>
  call(orgId, "onboarding_approve_go_live", { p_org_id: orgId, p_note: note || null }, "Could not approve going live.", "Approved. Switch the agents on one at a time.");

export const activateStep = async (orgId: string, agent: string, note: string) =>
  call(orgId, "onboarding_activate_step", { p_org_id: orgId, p_agent_id: agent, p_note: note || null }, "Could not switch that agent on.", "Done.");

export const sentryAlertsOn = async (orgId: string, note: string) =>
  call(orgId, "onboarding_sentry_full_on", { p_org_id: orgId, p_note: note || null }, "Could not switch the alerts on.", "Sentry's alerts are on.");

export const pauseActivation = async (orgId: string, paused: boolean, reason: string) =>
  call(orgId, "onboarding_activation_pause", { p_org_id: orgId, p_paused: paused, p_reason: reason || null }, "Could not change that.", paused ? "Paused." : "Resumed.");

export const moveBack = async (orgId: string, target: "onboarding" | "paused" | "cancelled", reason: string) =>
  call(orgId, "onboarding_move_back", { p_org_id: orgId, p_target: target, p_reason: reason }, "Could not change the workspace.", "Done. The customer has been told.");

export const resumeWorkspace = async (orgId: string, reason: string) =>
  call(orgId, "onboarding_resume", { p_org_id: orgId, p_reason: reason || null }, "Could not resume the workspace.", "Resumed. The customer has been told.");

export const saveStaffDetails = async (orgId: string, patch: Record<string, unknown>) =>
  call(orgId, "onboarding_staff_details_save", { p_org_id: orgId, p_patch: patch }, "Could not save that.", "Saved.");

export const setRegistrationStatus = async (orgId: string, status: string, code: string, note: string, reference: string) =>
  ["not_registered", "pending", "approved", "rejected"].includes(status)
    ? call(
        orgId,
        "messaging_registration_set_status",
        {
          p_org_id: orgId,
          p_status: status,
          p_rejection_code: status === "rejected" && isRejectionCode(code) ? code : null,
          p_note: note || null,
          p_external_reference: reference || null,
        },
        "Could not update the registration.",
        "Updated. The Owner has been told."
      )
    : ({ ok: false, error: "Choose a status." } as StaffResult);

export const setEinHandled = async (orgId: string, done: boolean) =>
  call(orgId, "messaging_registration_ein", { p_org_id: orgId, p_done: done }, "Could not save that.");

export const confirmSender = async (orgId: string, confirmed: boolean) =>
  call(orgId, "set_messaging_readiness", { p_org_id: orgId, p_item: "sender_number", p_confirmed: confirmed }, "Could not save that.");

export const confirmDomain = async (orgId: string, confirmed: boolean) =>
  call(orgId, "set_messaging_readiness", { p_org_id: orgId, p_item: "sending_domain", p_confirmed: confirmed }, "Could not save that.");

export async function prepareEmailRecords(orgId: string, domain: string, recordsText: string): Promise<StaffResult> {
  // One record per line: TYPE host value (purpose optional after a "#").
  const records = recordsText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [main, purpose] = line.split("#");
      const [type, host, ...rest] = (main ?? "").trim().split(/\s+/);
      return { type: (type ?? "").toUpperCase(), host: host ?? "", value: rest.join(" "), purpose: purpose?.trim() || null };
    });
  return call(orgId, "email_domain_prepare", { p_org_id: orgId, p_domain: domain, p_records: records }, "Could not save the records.", "Saved. The Owner has been told.");
}

export const controlImport = async (orgId: string, action: "pause" | "resume" | "retry" | "cancel") =>
  call(orgId, "onboarding_import_control", { p_org_id: orgId, p_action: action }, "Could not change the import.", "Done.");

export const startImportForCustomer = async (orgId: string, days: number) =>
  call(orgId, "onboarding_import_start", { p_org_id: orgId, p_lookback_days: Math.round(days) }, "Could not start the import.", "Started.");

export const decideProblem = async (orgId: string, problemId: string, decision: "keep" | "skip") =>
  call(orgId, "onboarding_import_problem_decide", { p_problem_id: problemId, p_decision: decision }, "Could not save that.");

export async function runSampleForCustomer(orgId: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  if (!(await confirmStaffOf(orgId))) return { ok: false, error: "Not found." };
  try {
    await startSampleRun(getSupabaseAdmin() as unknown as SupabaseClient, { orgId, actorUserId: allowed.userId, actorLabel: allowed.label, from: "staff" });
  } catch {
    return { ok: false, error: "The test could not start. Check the agent health page." };
  }
  refresh(orgId);
  return { ok: true, message: "The sample test is running." };
}

export const cleanUpSample = async (orgId: string, runId: string) =>
  call(orgId, "onboarding_sample_cleanup", { p_run_id: runId }, "Could not clean up the sample lead.", "Cleaned up and checked.");

export const confirmSampleAsStaff = async (orgId: string, runId: string) =>
  call(orgId, "onboarding_sample_confirm", { p_run_id: runId, p_worked: true, p_help_request_id: null }, "Could not confirm the test.", "Confirmed.");

export async function completeCheckin(orgId: string, checkinId: string, note: string, followUpAt: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { data: header } = await db.from("workspace_onboarding_status").select("go_live_approved_at").eq("org_id", orgId).maybeSingle();
  const since = String((header as { go_live_approved_at?: string } | null)?.go_live_approved_at ?? new Date(Date.now() - 7 * 86_400_000).toISOString());
  const facts = await loadCheckinFacts(db, orgId, since);
  const follow = followUpAt && !Number.isNaN(Date.parse(followUpAt)) ? new Date(followUpAt).toISOString() : null;
  const { error } = await db.rpc("onboarding_checkin_complete", { p_checkin_id: checkinId, p_note: note, p_facts: facts, p_follow_up_at: follow });
  if (error) return { ok: false, error: dbMessage(error, "Could not complete the check-in.") };
  refresh(orgId);
  return { ok: true, message: "Check-in done." };
}

/**
 * A gentle prompt to the Owner about one step. It goes through the normal
 * notification route (their instant or daily choice), carries no lead
 * content, and at most once a day per step.
 */
export async function nudgeOwner(orgId: string, stageKey: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  if (!isStageKey(stageKey)) return { ok: false, error: "Unknown stage." };
  const db = await staffDb();
  const [{ data: stage }, { data: def }, { data: recent }] = await Promise.all([
    db.from("workspace_onboarding_stages").select("status").eq("org_id", orgId).eq("stage_key", stageKey).maybeSingle(),
    db.from("onboarding_stage_definitions").select("customer_label").eq("key", stageKey).maybeSingle(),
    db
      .from("onboarding_reminders")
      .select("id")
      .eq("org_id", orgId)
      .eq("kind", "nudge_manual")
      .contains("stage_keys", [stageKey])
      .gte("sent_at", new Date(Date.now() - 86_400_000).toISOString())
      .limit(1),
  ]);
  if (!stage) return { ok: false, error: "Not found." };
  if ((stage as { status: string }).status !== "waiting_on_customer" && (stage as { status: string }).status !== "blocked") {
    return { ok: false, error: "This step is not waiting on the customer." };
  }
  if ((recent ?? []).length) return { ok: false, error: "They were reminded about this in the last day." };
  const label = (def as { customer_label?: string } | null)?.customer_label ?? "A setup step";
  const admin = getSupabaseAdmin() as unknown as SupabaseClient;
  const { data: owners } = await admin.from("org_members").select("id").eq("org_id", orgId).eq("seat", "customer").eq("role", "owner").eq("active", true);
  for (const owner of (owners ?? []) as Array<{ id: string }>) {
    await queuePortalNotice({
      db: admin as unknown as GhlDb,
      orgId,
      memberId: owner.id,
      eventType: "onboarding",
      title: "Your Vistrial setup",
      body: `${label} is ready when you are.`,
      path: "/app/onboarding",
      dedupeKey: `onboarding-nudge-manual:${orgId}:${stageKey}:${owner.id}:${new Date().toISOString().slice(0, 10)}`,
      actorUserId: allowed.userId,
    });
  }
  // Staff read reminders; only the system writes them.
  await admin.from("onboarding_reminders").insert({ org_id: orgId, audience: "owner", kind: "nudge_manual", stage_keys: [stageKey], sent_by: allowed.userId });
  return { ok: true, message: "Reminder sent." };
}

/** Resend, change the email, or cancel the Owner's invitation. Logged in the database. */
export async function manageOwnerInvite(orgId: string, action: "resend" | "change" | "new" | "cancel", email = ""): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { data, error } = await db.rpc("onboarding_owner_invite", { p_org_id: orgId, p_action: action, p_email: email || null });
  if (error) return { ok: false, error: dbMessage(error, "Could not change the invitation.") };
  refresh(orgId);
  if (action === "cancel") return { ok: true, message: "Invitation cancelled." };
  const result = data as { email: string; token: string } | null;
  if (!result?.token) return { ok: false, error: "Could not change the invitation." };
  const { data: org } = await db.from("organizations").select("name").eq("id", orgId).maybeSingle();
  const name = (org as { name?: string } | null)?.name ?? "your business";
  const mail = await sendOwnerInvite({ to: result.email, orgName: name, token: result.token, key: `owner-invite:${result.token}:${Date.now()}` });
  return mail.ok ? { ok: true, message: `Invitation sent to ${result.email}.` } : { ok: false, error: `The invitation is ready, but the email did not send: ${mail.error}` };
}

// ---------------------------------------------------------------------------
// Platform Admin settings
// ---------------------------------------------------------------------------

export const saveStageDefinition = async (key: string, patch: Record<string, unknown>) =>
  call(null, "onboarding_stage_definition_save", { p_key: key, p_patch: patch }, "Could not save the stage.", "Saved.");

export const saveOnboardingSettings = async (patch: Record<string, unknown>) =>
  call(null, "onboarding_settings_save", { p_patch: patch }, "Could not save the settings.", "Saved.");

export const saveTemplateDefaults = async (templateId: string, lookback: number, watchDays: number) =>
  call(null, "onboarding_template_defaults_save", { p_template_id: templateId, p_lookback_days: lookback, p_watch_days: watchDays }, "Could not save the template defaults.", "Saved.");

export const setCreatePermission = async (userId: string, allowed: boolean) =>
  call(null, "set_staff_create_permission", { p_user_id: userId, p_allowed: allowed }, "Could not change the permission.", allowed ? "They can now create workspaces." : "Permission removed.");

export async function saveOnboardingView(name: string, params: Record<string, string>): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  if (!name.trim()) return { ok: false, error: "Give the view a name." };
  const db = await staffDb();
  const { error } = await db
    .from("staff_saved_views")
    .upsert({ user_id: allowed.userId, page: "onboarding", name: name.trim().slice(0, 60), params }, { onConflict: "user_id,page,name" });
  if (error) return { ok: false, error: "Could not save that view." };
  refresh();
  return { ok: true, message: "View saved." };
}

export async function deleteOnboardingView(id: string): Promise<StaffResult> {
  const allowed = await gate();
  if (!allowed.ok) return allowed;
  const db = await staffDb();
  const { error } = await db.from("staff_saved_views").delete().eq("id", id).eq("user_id", allowed.userId);
  if (error) return { ok: false, error: "Could not delete that view." };
  refresh();
  return { ok: true };
}
