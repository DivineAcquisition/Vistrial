"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { addVoiceExample, removeVoiceExample } from "@/app/app/settings/follow-up/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { assertProfileAccess } from "@/lib/profile/load";
import { rescoreOrgLeads } from "@/lib/profile/rescore";
import { buildStagePatch } from "@/lib/profile/stage-patch";
import { isProfileStage } from "@/lib/profile/stages";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type OnboardingResult =
  | { status: "idle" }
  | { status: "saved"; applied: string[] }
  | { status: "error"; error: string };

export async function saveOnboardingStage(
  _prev: OnboardingResult,
  form: FormData
): Promise<OnboardingResult> {
  const access = await assertProfileAccess();
  if (!access.ok) return { status: "error", error: access.error };

  const stageRaw = String(form.get("stage") ?? "");
  if (!isProfileStage(stageRaw)) {
    return { status: "error", error: "That onboarding stage does not exist." };
  }
  const stage = stageRaw;

  const parsed = buildStagePatch(stage, form);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const supabase = await createClient();
  const { error: saveError } = await supabase.rpc("save_business_profile", {
    p_org_id: access.ctx.org.id,
    p_member_id: access.ctx.member.id,
    p_patch: parsed.patch as Json,
    p_stage: stage,
  });
  if (saveError) {
    return { status: "error", error: "Could not save that. Nothing was changed." };
  }

  const { error: applyError } = await supabase.rpc("apply_business_profile_configuration", {
    p_org_id: access.ctx.org.id,
    p_member_id: access.ctx.member.id,
    p_stage: stage,
  });
  if (applyError) {
    return {
      status: "error",
      error: "Your answers were saved but the configuration behind them did not update. Try again.",
    };
  }

  // Mapping a field or moving a weight only means something once the leads
  // already in the workspace are scored under it. The payoff for these two
  // stages is exactly that, so it cannot be left for someone to find later.
  if (stage === "funnel" || stage === "qualification") {
    await rescoreOrgLeads(supabase, {
      orgId: access.ctx.org.id,
      memberId: access.ctx.member.id,
      reason: `Re-scored when ${access.ctx.member.displayName} saved the ${stage} stage of onboarding.`,
    });
    revalidatePath("/app/queue");
    revalidatePath("/app/cases");
  }

  revalidatePath("/app/onboarding", "layout");
  revalidatePath("/app/settings/business-profile");
  redirect(`/app/onboarding/${stage}?done=1`);
}

export async function addOnboardingVoiceExample(
  _prev: SettingsSaveResult,
  form: FormData
): Promise<SettingsSaveResult> {
  const channel = String(form.get("channel") ?? "sms");
  const result = await addVoiceExample({
    body: String(form.get("body") ?? ""),
    channel: channel === "email" ? "email" : "sms",
  });
  revalidatePath("/app/onboarding/voice");
  return result;
}

export async function removeOnboardingVoiceExample(
  _prev: SettingsSaveResult,
  form: FormData
): Promise<SettingsSaveResult> {
  const index = Number(form.get("index") ?? -1);
  const result = await removeVoiceExample(Number.isInteger(index) ? index : -1);
  revalidatePath("/app/onboarding/voice");
  return result;
}

export async function generateLeakReport(): Promise<OnboardingResult> {
  const access = await assertProfileAccess();
  if (!access.ok) return { status: "error", error: access.error };

  const supabase = await createClient();
  const { error } = await supabase.rpc("leak_report_generate", {
    p_org_id: access.ctx.org.id,
    p_member_id: access.ctx.member.id,
  });
  if (error) return { status: "error", error: "Could not generate the report." };

  revalidatePath("/app/onboarding/report");
  revalidatePath("/app/settings/business-profile");
  return { status: "saved", applied: [] };
}
