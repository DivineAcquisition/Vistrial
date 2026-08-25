"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { assertProfileAccess } from "@/lib/profile/load";
import { ACTIVATION_WARNING_LABELS } from "@/lib/profile/vocabulary";
import { logSettingsActivity } from "@/lib/settings/activity";
import { revalidateSettings } from "@/lib/settings/revalidate";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

function revalidateProfileSurfaces() {
  revalidatePath("/app/settings/business-profile");
  revalidatePath("/app/onboarding", "layout");
  revalidatePath("/app/reporting");
}

/**
 * Server-side errors from these RPCs are the gate speaking. They are written
 * for the person reading them, so they are surfaced rather than swallowed.
 */
function rpcMessage(message: string, fallback: string): string {
  const cleaned = message.replace(/^.*?:\s*/, "").trim();
  return cleaned || fallback;
}

export async function activateWorkspace(
  _prev: SettingsSaveResult,
  form: FormData
): Promise<SettingsSaveResult> {
  const access = await assertProfileAccess();
  if (!access.ok) return { status: "error", error: access.error };

  const allowed = Object.keys(ACTIVATION_WARNING_LABELS);
  const acknowledged = form
    .getAll("acknowledge")
    .map((item) => String(item))
    .filter((item) => allowed.includes(item)) as Enums<"activation_warning">[];

  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_org", {
    p_org_id: access.ctx.org.id,
    p_member_id: access.ctx.member.id,
    p_acknowledged: acknowledged,
  });
  if (error) {
    return { status: "error", error: rpcMessage(error.message, "Activation was refused.") };
  }

  revalidateProfileSurfaces();
  return { status: "saved" };
}

export async function moveActivationTimestamp(
  _prev: SettingsSaveResult,
  form: FormData
): Promise<SettingsSaveResult> {
  const access = await assertProfileAccess();
  if (!access.ok) return { status: "error", error: access.error };

  const confirmation = String(form.get("confirmation_name") ?? "").trim();
  if (confirmation !== access.ctx.org.name) {
    return { status: "error", error: "Type the workspace name exactly to move the activation timestamp." };
  }

  const raw = String(form.get("new_at") ?? "").trim();
  const reason = String(form.get("reason") ?? "").trim();
  if (!raw) return { status: "error", error: "Pick the date and time to move it to." };
  if (reason.length < 20) {
    return {
      status: "error",
      error: "Moving activation shifts every historical figure. Say why, in at least twenty characters.",
    };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { status: "error", error: "That is not a date we can read." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_activation_timestamp", {
    p_org_id: access.ctx.org.id,
    p_member_id: access.ctx.member.id,
    p_new_at: parsed.toISOString(),
    p_reason: reason,
  });
  if (error) {
    return { status: "error", error: rpcMessage(error.message, "The timestamp was not moved.") };
  }

  await logSettingsActivity({
    ctx: access.ctx,
    section: "activation",
    action: "Moved the activation timestamp",
    to: { newAt: parsed.toISOString(), reason },
  });

  revalidateProfileSurfaces();
  revalidateSettings();
  return { status: "saved" };
}

export async function declineStatedBaseline(
  _prev: SettingsSaveResult,
  form: FormData
): Promise<SettingsSaveResult> {
  const access = await assertProfileAccess();
  if (!access.ok) return { status: "error", error: access.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_baseline_fallback", {
    p_org_id: access.ctx.org.id,
    p_member_id: access.ctx.member.id,
    p_note: String(form.get("note") ?? "").trim() || null,
  });
  if (error) return { status: "error", error: "Could not record that." };

  revalidateProfileSurfaces();
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export async function resolveReviewPrompt(
  _prev: SettingsSaveResult,
  form: FormData
): Promise<SettingsSaveResult> {
  const access = await assertProfileAccess();
  if (!access.ok) return { status: "error", error: access.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_profile_review_prompt", {
    p_org_id: access.ctx.org.id,
    p_id: String(form.get("id") ?? ""),
    p_member_id: access.ctx.member.id,
  });
  if (error) return { status: "error", error: "Could not clear that prompt." };

  revalidateProfileSurfaces();
  return { status: "saved" };
}

export async function dismissContradiction(
  _prev: SettingsSaveResult,
  form: FormData
): Promise<SettingsSaveResult> {
  const access = await assertProfileAccess();
  if (!access.ok) return { status: "error", error: access.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("dismiss_profile_contradiction", {
    p_org_id: access.ctx.org.id,
    p_id: String(form.get("id") ?? ""),
    p_member_id: access.ctx.member.id,
  });
  if (error) return { status: "error", error: "Could not dismiss that." };

  revalidateProfileSurfaces();
  return { status: "saved" };
}
