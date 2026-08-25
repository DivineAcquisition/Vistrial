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
