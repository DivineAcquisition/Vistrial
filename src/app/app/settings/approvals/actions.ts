"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/auth/session";
import {
  actionType,
  canEditApprovalGate,
  isApprovalMode,
  isApprover,
  needsAutoRunConfirmation,
} from "@/lib/home/catalog";
import { loadGateState } from "@/lib/home/gate";
import { applyGateToOpenItems } from "@/lib/home/scan";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ApprovalSaveResult =
  | { ok: true }
  | { ok: false; error: string; needsConfirmation?: boolean };

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function revalidateApprovals() {
  revalidatePath("/app/settings/approvals");
  revalidatePath("/app/onboarding/approvals");
  revalidatePath("/app/home");
}

function rpcError(error: { code?: string; message: string }): string {
  if (error.code === "42501") return error.message || "Only an owner can change approval settings.";
  return "Could not save that. Nothing was changed.";
}

export async function saveApprovalAction(input: {
  actionType: string;
  mode: string;
  approver: string;
  confirmed: boolean;
}): Promise<ApprovalSaveResult> {
  const ctx = await getAuthContext();
  if (!canEditApprovalGate(ctx.role, ctx.isPlatformAdmin)) {
    return { ok: false, error: "Only an owner can change approval settings." };
  }
  const definition = actionType(input.actionType);
  if (!definition) return { ok: false, error: "That action does not exist." };
  if (!isApprovalMode(input.mode) || !isApprover(input.approver)) {
    return { ok: false, error: "Pick a mode and who can approve." };
  }

  const supabase = await createClient();
  const before = (await loadGateState(supabase, ctx.org.id)).choice(definition.id);
  if (needsAutoRunConfirmation(definition.reachesPeople, before.mode, input.mode) && !input.confirmed) {
    return {
      ok: false,
      needsConfirmation: true,
      error: "These messages will send without review. Confirm to turn on auto-run.",
    };
  }

  const { error } = await supabase.rpc("set_approval_gate_action", {
    p_org_id: ctx.org.id,
    p_action_type: definition.id,
    p_mode: input.mode,
    p_approver: input.approver,
  });
  if (error) return { ok: false, error: rpcError(error) };

  // Takes effect now: items of this type already waiting leave the queue if
  // the action is off, or run if it may now run on its own.
  if (before.mode !== input.mode) {
    const admin = getSupabaseAdmin();
    const { data: org } = await admin
      .from("organizations")
      .select("id, name, timezone, agents_halted, agent_crm_writes_halted")
      .eq("id", ctx.org.id)
      .maybeSingle();
    if (org) {
      await applyGateToOpenItems(
        admin,
        {
          id: org.id,
          name: org.name,
          timezone: org.timezone,
          halted: org.agents_halted,
          crmHalted: org.agent_crm_writes_halted,
        },
        await loadGateState(admin, ctx.org.id),
        definition.id
      );
    }
  }
  revalidateApprovals();
  return { ok: true };
}

export async function saveApprovalLimits(input: {
  quietHoursStart: string;
  quietHoursEnd: string;
  dailySendLimitPerLead: number;
  queueWaitLimitHours: number;
}): Promise<ApprovalSaveResult> {
  const ctx = await getAuthContext();
  if (!canEditApprovalGate(ctx.role, ctx.isPlatformAdmin)) {
    return { ok: false, error: "Only an owner can change approval settings." };
  }
  if (!HM.test(input.quietHoursStart) || !HM.test(input.quietHoursEnd)) {
    return { ok: false, error: "Quiet hours need a start and end time." };
  }
  const limit = Math.round(input.dailySendLimitPerLead);
  if (!Number.isFinite(limit) || limit < 1 || limit > 20) {
    return { ok: false, error: "The daily limit has to be between 1 and 20 messages." };
  }
  const minutes = Math.round(input.queueWaitLimitHours * 60);
  if (!Number.isFinite(minutes) || minutes < 15 || minutes > 10080) {
    return { ok: false, error: "The wait limit has to be between 15 minutes and 7 days." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_approval_gate_limits", {
    p_org_id: ctx.org.id,
    p_quiet_hours_start: input.quietHoursStart,
    p_quiet_hours_end: input.quietHoursEnd,
    p_daily_send_limit_per_lead: limit,
    p_queue_wait_limit_minutes: minutes,
  });
  if (error) return { ok: false, error: rpcError(error) };
  revalidateApprovals();
  return { ok: true };
}

/** The onboarding step. Saving and skipping both leave the defaults in place unless changed. */
export async function finishApprovalStep(skipped: boolean): Promise<void> {
  const ctx = await getAuthContext();
  const supabase = await createClient();
  await supabase.rpc("mark_approval_gate_reviewed", { p_org_id: ctx.org.id, p_skipped: skipped });
  revalidateApprovals();
  redirect("/app/onboarding/report");
}
