"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { addVoiceExample, removeVoiceExample } from "@/app/app/settings/follow-up/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { assertProfileAccess } from "@/lib/profile/load";
import { rescoreOrgLeads } from "@/lib/profile/rescore";
import { isProfileStage, type ProfileStage } from "@/lib/profile/stages";
import {
  DISQUALIFIERS,
  LEAD_CHANNELS,
  OBJECTION_TYPES,
  QUALIFICATION_SIGNALS,
  SETTER_FACTS,
} from "@/lib/profile/vocabulary";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type OnboardingResult =
  | { status: "idle" }
  | { status: "saved"; applied: string[] }
  | { status: "error"; error: string };

function text(form: FormData, name: string): string | null {
  const value = String(form.get(name) ?? "").trim();
  return value ? value : null;
}

function integer(form: FormData, name: string): number | null {
  const raw = text(form, name);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function decimal(form: FormData, name: string): number | null {
  const raw = text(form, name);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Money is entered in whole currency units and stored in cents. */
function cents(form: FormData, name: string): number | null {
  const value = decimal(form, name);
  return value === null ? null : Math.round(value * 100);
}

function choices(form: FormData, name: string, allowed: readonly string[]): string[] {
  return form
    .getAll(name)
    .map((item) => String(item))
    .filter((item) => allowed.includes(item));
}

function lines(form: FormData, name: string): string[] {
  const raw = String(form.get(name) ?? "");
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rows(form: FormData, name: string): Array<Record<string, unknown>> {
  const raw = String(form.get(name) ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      : [];
  } catch {
    return [];
  }
}

function buildPatch(stage: ProfileStage, form: FormData): Record<string, Json> | string {
  switch (stage) {
    case "connect":
      return {};

    case "business": {
      const price = cents(form, "price_point");
      if (price !== null && price <= 0) return "A price point has to be more than nothing.";
      const closeRate = decimal(form, "stated_close_rate_pct");
      if (closeRate !== null && (closeRate < 0 || closeRate > 100)) {
        return "A close rate is a percentage between 0 and 100.";
      }
      const cycle = integer(form, "sales_cycle_days");
      if (cycle !== null && (cycle < 1 || cycle > 365)) {
        return "A sales cycle has to be between 1 and 365 days.";
      }
      return {
        offer_name: text(form, "offer_name"),
        offer_type: text(form, "offer_type"),
        offer_type_other: text(form, "offer_type_other"),
        price_point_cents: price,
        payment_structure: text(form, "payment_structure"),
        payment_structure_other: text(form, "payment_structure_other"),
        sales_cycle_days: cycle,
        touches_to_close: integer(form, "touches_to_close"),
        close_motion: text(form, "close_motion"),
        team_structure: text(form, "team_structure"),
        monthly_lead_volume: integer(form, "monthly_lead_volume"),
        monthly_lead_target: integer(form, "monthly_lead_target"),
        stated_close_rate_pct: closeRate,
      };
    }

    case "funnel": {
      const channels = choices(form, "lead_channels", LEAD_CHANNELS.map((item) => item.value));
      const spend: Record<string, number> = {};
      for (const channel of channels) {
        const value = cents(form, `spend_${channel}`);
        if (value !== null && value > 0) spend[channel] = value;
      }
      const fieldRows = rows(form, "application_fields").map((row) => ({
        answer_key: String(row.answer_key ?? "").trim(),
        factor: String(row.factor ?? "").trim() || null,
      }));
      if (fieldRows.some((row) => !row.answer_key && row.factor)) {
        return "One application question has a factor but no answer key. Fill it in or remove the row.";
      }
      const fields = fieldRows.filter((row) => row.answer_key.length > 0);
      return {
        lead_channels: channels,
        lead_channels_other: text(form, "lead_channels_other"),
        channel_spend_cents: spend,
        application_fields: fields,
      };
    }

    case "qualification": {
      let bandError: string | null = null;
      const bands = (name: string, label: string) => {
        const parsed = rows(form, name).map((row) => ({
          answer: String(row.answer ?? "").trim(),
          score: Math.max(0, Math.min(100, Math.round(Number(row.score ?? 0)))),
          scoreRaw: String(row.score ?? "").trim(),
        }));
        if (parsed.some((row) => !row.answer && row.scoreRaw)) {
          bandError = `One ${label} band has a score but no answer. Fill it in or remove the row.`;
        }
        return parsed
          .filter((row) => row.answer.length > 0)
          .map((row) => ({ answer: row.answer, score: row.score }));
      };
      const priceBands = bands("price_bands", "investment");
      const timelineBands = bands("timeline_bands", "timeline");
      if (bandError) return bandError;
      return {
        qualification_signals: choices(
          form,
          "qualification_signals",
          QUALIFICATION_SIGNALS.map((item) => item.value)
        ),
        qualification_signals_other: text(form, "qualification_signals_other"),
        disqualifiers: choices(form, "disqualifiers", DISQUALIFIERS.map((item) => item.value)),
        disqualifiers_other: text(form, "disqualifiers_other"),
        price_bands: priceBands,
        timeline_bands: timelineBands,
      };
    }

    case "process": {
      const minutes = integer(form, "speed_to_lead_intent_minutes");
      if (minutes !== null && (minutes < 1 || minutes > 1440)) {
        return "The response window has to be between 1 minute and 24 hours.";
      }
      const stageRows = rows(form, "pipeline_stage_meanings").map((row) => ({
        crm_stage: String(row.crm_stage ?? "").trim(),
        means: String(row.means ?? "").trim() || null,
      }));
      if (stageRows.some((row) => !row.crm_stage && row.means)) {
        return "One pipeline stage has a meaning but no stage name. Fill it in or remove the row.";
      }
      const stages = stageRows.filter((row) => row.crm_stage.length > 0);
      return {
        speed_to_lead_intent_minutes: minutes,
        setter_establishes: choices(form, "setter_establishes", SETTER_FACTS.map((item) => item.value)),
        setter_establishes_other: text(form, "setter_establishes_other"),
        pipeline_stage_meanings: stages,
        after_no_show: text(form, "after_no_show"),
        after_call: text(form, "after_call"),
        after_silence: text(form, "after_silence"),
      };
    }

    case "objections": {
      const allowed: string[] = OBJECTION_TYPES.map((item) => item.value);
      const objectionRows = rows(form, "top_objections").map((row) => ({
        type: String(row.type ?? "").trim(),
        phrasing: String(row.phrasing ?? "").trim(),
        response: String(row.response ?? "").trim() || null,
      }));
      const orphan = objectionRows.find((row) => row.phrasing && !allowed.includes(row.type));
      if (orphan) {
        return `"${orphan.phrasing}" has no objection type against it. Pick one or remove the row.`;
      }
      const objections = objectionRows.filter(
        (row) => allowed.includes(row.type) && row.phrasing.length > 0
      );
      const seen = new Set<string>();
      for (const row of objections) {
        if (seen.has(row.type)) {
          return "Two objections share the same type. Only the first of each type is kept, so merge them.";
        }
        seen.add(row.type);
      }
      return { top_objections: objections };
    }

    case "voice":
      return {
        voice_formality: text(form, "voice_formality"),
        channel_preference: text(form, "channel_preference"),
        never_say: lines(form, "never_say"),
      };

    case "goals": {
      const value = decimal(form, "goal_value");
      if (value !== null && value <= 0) return "A target has to be a number above zero.";
      return {
        goal_metric: text(form, "goal_metric"),
        goal_value: value,
        aggregate_opt_out: form.get("aggregate_opt_out") === "on",
      };
    }
  }
}

export async function saveOnboardingStage(
  _prev: OnboardingResult,
  form: FormData
): Promise<OnboardingResult> {
  const access = await assertProfileAccess();
  if (!access.ok) return { status: "error", error: access.error };

  const stageRaw = String(form.get("stage") ?? "");
  if (!isProfileStage(stageRaw)) return { status: "error", error: "That onboarding stage does not exist." };
  const stage = stageRaw;

  const patch = buildPatch(stage, form);
  if (typeof patch === "string") return { status: "error", error: patch };

  const supabase = await createClient();
  const { error: saveError } = await supabase.rpc("save_business_profile", {
    p_org_id: access.ctx.org.id,
    p_member_id: access.ctx.member.id,
    p_patch: patch as Json,
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
