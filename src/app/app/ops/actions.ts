"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformAdmin } from "@/lib/auth/gates";
import { getAuthContext } from "@/lib/auth/session";
import { deleteOrganizationData, offboardOrganization } from "@/lib/ops/lifecycle";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type OpsActionResult = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; error: string };

export async function haltOrgDispatch(orgId: string): Promise<OpsActionResult> {
  await requirePlatformAdmin();
  const ctx = await getAuthContext();
  const { error } = await getSupabaseAdmin().rpc("halt_org_follow_up_sequences", {
    p_org_id: orgId,
    // sequences_halted_by FKs to org_members of that workspace. A DA operator
    // is usually in a different org; passing their member id would fail the halt.
    p_actor: ctx.member.orgId === orgId ? ctx.member.id : null,
  });
  if (error) return { status: "error", error: "Could not halt dispatch." };
  revalidatePath("/app/ops");
  return { status: "ok", message: "Dispatch halted for that workspace." };
}

export async function offboardOrg(formData: FormData): Promise<OpsActionResult> {
  await requirePlatformAdmin();
  const ctx = await getAuthContext();
  const orgId = String(formData.get("orgId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!orgId || !reason) return { status: "error", error: "Workspace and reason are required." };
  try {
    const result = await offboardOrganization(getSupabaseAdmin(), {
      orgId,
      reason,
      actorUserId: ctx.user.id,
      actorEmail: ctx.user.email ?? ctx.member.email,
    });
    revalidatePath("/app/ops");
    return {
      status: "ok",
      message: `Offboarded. Data retained until ${result.deleteAfter ?? "the grace date"}. Download the export before deleting.`,
    };
  } catch (error) {
    return { status: "error", error: error instanceof Error ? error.message : "Offboard failed." };
  }
}

export async function deleteOrg(formData: FormData): Promise<OpsActionResult> {
  await requirePlatformAdmin();
  const ctx = await getAuthContext();
  const orgId = String(formData.get("orgId") ?? "").trim();
  const confirmationName = String(formData.get("confirmationName") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!orgId || !confirmationName || !reason) {
    return { status: "error", error: "Workspace, exact name, and reason are required." };
  }
  try {
    await deleteOrganizationData(getSupabaseAdmin(), {
      orgId,
      confirmationName,
      reason,
      actorUserId: ctx.user.id,
      actorEmail: ctx.user.email ?? ctx.member.email,
    });
    revalidatePath("/app/ops");
    return { status: "ok", message: "Workspace data deleted. A deletion record remains." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed.";
    if (message.includes("confirmation_mismatch")) {
      return { status: "error", error: "The name did not match. Deletion refused." };
    }
    return { status: "error", error: message };
  }
}

export async function recordRestoreDrill(formData: FormData): Promise<OpsActionResult> {
  await requirePlatformAdmin();
  const durationMs = Number(formData.get("durationMs"));
  const verified = formData.get("verified") === "on";
  const notes = String(formData.get("notes") ?? "").trim();
  const sourceLabel = String(formData.get("sourceLabel") ?? "local-pg-restore").trim();
  if (!Number.isInteger(durationMs) || durationMs < 1) {
    return { status: "error", error: "Duration must be a positive integer in milliseconds." };
  }
  const finished = new Date();
  const started = new Date(finished.getTime() - durationMs);
  const { error } = await getSupabaseAdmin().from("ops_restore_drills").insert({
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_ms: durationMs,
    source_label: sourceLabel,
    verified,
    rpo_minutes: 1440,
    notes: notes || null,
    integrity: { recordedFrom: "ops-console" },
  });
  if (error) return { status: "error", error: "Could not record the drill." };
  revalidatePath("/app/ops");
  return { status: "ok", message: "Restore drill recorded." };
}

export async function recordIncident(formData: FormData): Promise<OpsActionResult> {
  await requirePlatformAdmin();
  const ctx = await getAuthContext();
  const kind = String(formData.get("kind") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const cause = String(formData.get("cause") ?? "").trim();
  const impact = String(formData.get("impact") ?? "").trim();
  const prevention = String(formData.get("prevention") ?? "").trim();
  const orgId = String(formData.get("orgId") ?? "").trim() || null;
  const clientNotified = formData.get("clientNotified") === "on";
  if (!kind || !title || !cause || !impact || !prevention) {
    return { status: "error", error: "Kind, title, cause, impact, and prevention are required." };
  }
  const { error } = await getSupabaseAdmin().from("ops_incidents").insert({
    kind,
    title,
    cause,
    impact,
    prevention,
    org_id: orgId,
    status: "open",
    timeline: [{ at: new Date().toISOString(), event: "Recorded from Operator console" }],
    client_notified_at: clientNotified ? new Date().toISOString() : null,
    client_notified_by: clientNotified ? (ctx.user.email ?? ctx.member.email) : null,
    created_by_user_id: ctx.user.id,
  });
  if (error) return { status: "error", error: "Could not record the incident." };
  revalidatePath("/app/ops");
  return { status: "ok", message: "Incident recorded." };
}

export async function runRetentionNow(dryRun: boolean): Promise<OpsActionResult> {
  await requirePlatformAdmin();
  const { data, error } = await getSupabaseAdmin().rpc("run_data_retention", { p_dry_run: dryRun });
  if (error) return { status: "error", error: "Retention job failed." };
  revalidatePath("/app/ops");
  return {
    status: "ok",
    message: dryRun ? `Dry-run: ${JSON.stringify(data)}` : `Purged: ${JSON.stringify(data)}`,
  };
}

export async function setVerificationTaskEnabled(formData: FormData): Promise<OpsActionResult> {
  await requirePlatformAdmin();
  const task = String(formData.get("task") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim();
  if (!task) return { status: "error", error: "Task is required." };
  if (!enabled && !reason) {
    return { status: "error", error: "Say why this task is being turned off." };
  }
  const { error } = await getSupabaseAdmin().rpc("set_verification_task_enabled", {
    p_task: task,
    p_enabled: enabled,
    p_reason: enabled ? null : reason,
  });
  if (error) return { status: "error", error: "Could not update that verification task." };
  revalidatePath("/app/ops");
  return {
    status: "ok",
    message: enabled ? `${task} verification is on.` : `${task} verification is off.`,
  };
}

export async function submitVerificationSampleAudit(formData: FormData): Promise<OpsActionResult> {
  await requirePlatformAdmin();
  const id = String(formData.get("id") ?? "").trim();
  const missed = Number(formData.get("missedFaultCount"));
  const notes = String(formData.get("notes") ?? "").trim();
  if (!id || !Number.isInteger(missed) || missed < 0) {
    return { status: "error", error: "Audit id and a non-negative missed-fault count are required." };
  }
  const { error } = await getSupabaseAdmin().rpc("submit_verification_sample_audit", {
    p_id: id,
    p_missed_fault_count: missed,
    p_notes: notes || null,
  });
  if (error) return { status: "error", error: "Could not record that sample audit." };
  revalidatePath("/app/ops");
  return { status: "ok", message: "Sample audit recorded." };
}
