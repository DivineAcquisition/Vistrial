"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { MAX_VOICE_EXAMPLES } from "@/lib/follow-up/constants";
import { parseRoutingRule } from "@/lib/follow-up/routing";
import { suggestionsFromEdits } from "@/lib/follow-up/suggestions";
import { examplesToJson, parseVoiceExamples } from "@/lib/follow-up/voice";
import { logSettingsActivity } from "@/lib/settings/activity";
import { canWriteAdvancedSettings } from "@/lib/settings/managed";
import { loadOrgManaged } from "@/lib/settings/org";
import { revalidateSettings } from "@/lib/settings/revalidate";
import { voiceSampleToJson } from "@/lib/settings/sample";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

function deny(): SettingsSaveResult {
  return { status: "error", error: "You do not have permission to change follow-up settings." };
}

async function requireAdvancedFollowUp() {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return { ok: false as const, error: deny(), ctx };
  const managed = await loadOrgManaged(ctx.org.id);
  if (!canWriteAdvancedSettings(ctx, managed.managed)) {
    return {
      ok: false as const,
      error: {
        status: "error" as const,
        error: "These settings are managed by your install team. Take over management, or ask them to make the change.",
      },
      ctx,
    };
  }
  return { ok: true as const, ctx };
}

async function refreshVoiceSample(orgId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("follow_up_drafts")
    .select("generated_body, lead_id, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.generated_body) return;
  const { data: lead } = await admin
    .from("leads")
    .select("first_name, last_name, email")
    .eq("id", data.lead_id)
    .maybeSingle();
  const leadName =
    [lead?.first_name, lead?.last_name].filter(Boolean).join(" ").trim() || lead?.email || "Unnamed lead";
  await admin
    .from("org_voice_profiles")
    .update({
      sample_preview: voiceSampleToJson({
        leadName,
        body: data.generated_body,
        generatedAt: new Date().toISOString(),
      }),
    })
    .eq("org_id", orgId);
}

function parseIntField(value: FormDataEntryValue | null, label: string, min: number, max: number): number | string {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return `${label} must be an integer from ${min} to ${max}.`;
  }
  return parsed;
}

export async function updateFollowUpPolicy(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const gate = await requireAdvancedFollowUp();
  if (!gate.ok) return gate.error;

  const maxLength = parseIntField(formData.get("max_sequence_length"), "Maximum sequence length", 1, 8);
  const maxDays = parseIntField(formData.get("max_sequence_duration_days"), "Maximum sequence duration", 1, 90);
  const staleDays = parseIntField(formData.get("draft_stale_days"), "Draft stale days", 1, 14);
  for (const value of [maxLength, maxDays, staleDays]) {
    if (typeof value === "string") return { status: "error", error: value };
  }

  const quietEnabled = formData.get("quiet_hours_enabled") === "on";
  const quietStart = String(formData.get("quiet_hours_start") ?? "21:00").slice(0, 5);
  const quietEnd = String(formData.get("quiet_hours_end") ?? "08:00").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(quietStart) || !/^\d{2}:\d{2}$/.test(quietEnd)) {
    return { status: "error", error: "Quiet hours must be HH:MM." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("follow_up_settings")
    .update({
      max_sequence_length: maxLength as number,
      max_sequence_duration_days: maxDays as number,
      draft_stale_days: staleDays as number,
      quiet_hours_enabled: quietEnabled,
      quiet_hours_start: quietStart,
      quiet_hours_end: quietEnd,
    })
    .eq("org_id", gate.ctx.org.id);
  if (error) return { status: "error", error: "Could not save follow-up policy." };
  await logSettingsActivity({
    ctx: gate.ctx,
    section: "follow_up",
    action: "Updated follow-up policy",
    to: { maxLength, maxDays, staleDays, quietEnabled, quietStart, quietEnd },
  });
  revalidatePath("/app/settings/follow-up");
  revalidateSettings();
  return { status: "saved" };
}

export async function setOrgSequenceHalt(halted: boolean): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return deny();
  const admin = getSupabaseAdmin();
  if (halted) {
    const { error } = await admin.rpc("halt_org_follow_up_sequences", {
      p_org_id: ctx.org.id,
      p_actor: ctx.member.id,
    });
    if (error) return { status: "error", error: "Could not stop sequences." };
  } else {
    const { error } = await admin
      .from("follow_up_settings")
      .update({
        sequences_halted: false,
        sequences_halted_at: null,
        sequences_halted_by: null,
      })
      .eq("org_id", ctx.org.id);
    if (error) return { status: "error", error: "Could not resume sequences." };
  }
  await logSettingsActivity({
    ctx,
    section: "follow_up",
    action: halted ? "Stopped all sequences and dispatch" : "Resumed sequences and dispatch",
    to: { halted },
  });
  revalidatePath("/app/settings/follow-up");
  revalidatePath("/app/queue");
  revalidateSettings();
  return { status: "saved" };
}

export async function setOrgSequenceHaltForm(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  return setOrgSequenceHalt(String(formData.get("halted") ?? "") === "true");
}

export async function updateVoiceProfile(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const gate = await requireAdvancedFollowUp();
  if (!gate.ok) return gate.error;

  const formality = String(formData.get("formality") ?? "casual");
  if (formality !== "casual" && formality !== "professional") {
    return { status: "error", error: "Formality must be casual or professional." };
  }
  const emoji = String(formData.get("emoji_usage") ?? "never");
  if (emoji !== "never" && emoji !== "sparing" && emoji !== "natural") {
    return { status: "error", error: "Pick an emoji setting." };
  }
  const smsMax = parseIntField(formData.get("sms_max_chars"), "SMS length", 40, 480);
  const emailMax = parseIntField(formData.get("email_max_chars"), "Email length", 120, 4000);
  if (typeof smsMax === "string") return { status: "error", error: smsMax };
  if (typeof emailMax === "string") return { status: "error", error: emailMax };

  const banned = String(formData.get("banned_words") ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const supabase = await createClient();
  const { error } = await supabase
    .from("org_voice_profiles")
    .update({
      formality,
      use_contractions: formData.get("use_contractions") === "on",
      use_greeting: formData.get("use_greeting") === "on",
      use_signoff: formData.get("use_signoff") === "on",
      greeting_text: String(formData.get("greeting_text") ?? "").trim() || null,
      signoff_text: String(formData.get("signoff_text") ?? "").trim() || null,
      sms_max_chars: smsMax,
      email_max_chars: emailMax,
      emoji_usage: emoji,
      banned_words: banned,
    })
    .eq("org_id", gate.ctx.org.id);
  if (error) return { status: "error", error: "Could not save the voice profile." };
  await refreshVoiceSample(gate.ctx.org.id);
  await logSettingsActivity({
    ctx: gate.ctx,
    section: "follow_up",
    action: "Updated voice profile mechanics",
  });
  revalidatePath("/app/settings/follow-up");
  revalidateSettings();
  return { status: "saved" };
}

export async function addVoiceExample(input: {
  body: string;
  channel: "sms" | "email";
  sourceDraftId?: string | null;
}): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return deny();
  const body = input.body.trim();
  if (!body) return { status: "error", error: "Paste a real message this business has sent." };
  if (body.length > 4000) return { status: "error", error: "Keep examples under 4,000 characters." };
  const supabase = await createClient();
  const { data } = await supabase.from("org_voice_profiles").select("examples").eq("org_id", ctx.org.id).maybeSingle();
  const examples = parseVoiceExamples(data?.examples);
  if (examples.length >= MAX_VOICE_EXAMPLES) {
    return { status: "error", error: "Voice examples are capped at five." };
  }
  const next = examplesToJson([
    ...examples,
    { body, channel: input.channel, addedAt: new Date().toISOString(), sourceDraftId: input.sourceDraftId ?? null },
  ]);
  const { error } = await supabase
    .from("org_voice_profiles")
    .update({ examples: next as Json })
    .eq("org_id", ctx.org.id);
  if (error) return { status: "error", error: "Could not add that example." };
  await refreshVoiceSample(ctx.org.id);
  await logSettingsActivity({ ctx, section: "follow_up", action: "Added a voice example" });
  revalidatePath("/app/settings/follow-up");
  revalidateSettings();
  return { status: "saved" };
}

export async function removeVoiceExample(index: number): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return deny();
  const supabase = await createClient();
  const { data } = await supabase.from("org_voice_profiles").select("examples").eq("org_id", ctx.org.id).maybeSingle();
  const examples = parseVoiceExamples(data?.examples);
  if (index < 0 || index >= examples.length) return { status: "error", error: "That example is gone." };
  const next = examplesToJson(examples.filter((_, i) => i !== index));
  const { error } = await supabase
    .from("org_voice_profiles")
    .update({ examples: next as Json })
    .eq("org_id", ctx.org.id);
  if (error) return { status: "error", error: "Could not remove that example." };
  await refreshVoiceSample(ctx.org.id);
  await logSettingsActivity({ ctx, section: "follow_up", action: "Removed a voice example" });
  revalidatePath("/app/settings/follow-up");
  revalidateSettings();
  return { status: "saved" };
}

export async function promoteSentDraft(draftId: string): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return deny();
  const supabase = await createClient();
  const { data: draft } = await supabase
    .from("follow_up_drafts")
    .select("id, sent_body, channel")
    .eq("id", draftId)
    .eq("org_id", ctx.org.id)
    .eq("status", "sent")
    .maybeSingle();
  if (!draft?.sent_body) return { status: "error", error: "That sent message is not available." };
  const channel = draft.channel === "email" ? "email" : "sms";
  const result = await addVoiceExample({
    body: draft.sent_body,
    channel,
    sourceDraftId: draft.id,
  });
  return result;
}

export async function saveRoutingRules(raw: string): Promise<SettingsSaveResult> {
  const gate = await requireAdvancedFollowUp();
  if (!gate.ok) return gate.error;
  const ctx = gate.ctx;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "error", error: "Routing rules must be valid JSON." };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { status: "error", error: "Provide at least one routing rule." };
  }
  const rules = parsed.map((item, index) => parseRoutingRule({ ...((item as object) ?? {}), priority: (item as { priority?: number }).priority ?? (index + 1) * 10 }));
  if (rules.some((item) => item === null)) {
    return { status: "error", error: "A routing rule is missing a match, branch, or channel." };
  }
  const admin = getSupabaseAdmin();
  await admin.from("follow_up_routing_rules").delete().eq("org_id", ctx.org.id);
  const { error } = await admin.from("follow_up_routing_rules").insert(
    rules.map((rule) => ({
      org_id: ctx.org.id,
      priority: rule!.priority,
      branch: rule!.branch,
      enabled: rule!.enabled,
      match: rule!.match as unknown as Json,
      channel: rule!.channel,
      sequence_steps: rule!.sequenceSteps as unknown as Json,
    }))
  );
  if (error) return { status: "error", error: "Could not save routing rules." };
  await logSettingsActivity({ ctx, section: "follow_up", action: "Updated follow-up routing" });
  revalidatePath("/app/settings/follow-up");
  revalidateSettings();
  return { status: "saved" };
}

export async function refreshVoiceSuggestions(): Promise<SettingsSaveResult> {
  const gate = await requireAdvancedFollowUp();
  if (!gate.ok) return gate.error;
  const ctx = gate.ctx;
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("follow_up_drafts")
    .select("generated_body, sent_body")
    .eq("org_id", ctx.org.id)
    .eq("status", "sent")
    .not("sent_body", "is", null)
    .order("sent_at", { ascending: false })
    .limit(40);
  const pairs = (data ?? [])
    .filter((row) => row.sent_body)
    .map((row) => ({ generated: row.generated_body, sent: row.sent_body as string }));
  const drafts = suggestionsFromEdits(pairs);
  for (const draft of drafts) {
    await admin.from("voice_profile_suggestions").upsert(
      {
        org_id: ctx.org.id,
        kind: draft.kind,
        phrase: draft.phrase ?? draft.kind,
        evidence: { sampleSize: draft.sampleSize, text: draft.evidence } as Json,
        status: "pending",
      },
      { onConflict: "org_id,kind,phrase" }
    );
  }
  revalidatePath("/app/settings/follow-up");
  return { status: "saved" };
}

export async function resolveVoiceSuggestion(input: {
  id: string;
  accept: boolean;
}): Promise<SettingsSaveResult> {
  const gate = await requireAdvancedFollowUp();
  if (!gate.ok) return gate.error;
  const ctx = gate.ctx;
  const supabase = await createClient();
  const { data: suggestion } = await supabase
    .from("voice_profile_suggestions")
    .select("*")
    .eq("id", input.id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!suggestion) return { status: "error", error: "That suggestion is gone." };

  if (input.accept) {
    const { data: profile } = await supabase
      .from("org_voice_profiles")
      .select("*")
      .eq("org_id", ctx.org.id)
      .maybeSingle();
    if (profile) {
      if (suggestion.kind === "shorter") {
        await supabase
          .from("org_voice_profiles")
          .update({
            sms_max_chars: Math.max(40, Math.round(profile.sms_max_chars * 0.8)),
            email_max_chars: Math.max(120, Math.round(profile.email_max_chars * 0.8)),
          })
          .eq("org_id", ctx.org.id);
      } else if (suggestion.kind === "less_formal") {
        await supabase
          .from("org_voice_profiles")
          .update({ formality: "casual", use_contractions: true })
          .eq("org_id", ctx.org.id);
      } else if (suggestion.kind === "drop_phrase" && suggestion.phrase) {
        const words = Array.from(new Set([...(profile.banned_words ?? []), suggestion.phrase]));
        await supabase.from("org_voice_profiles").update({ banned_words: words }).eq("org_id", ctx.org.id);
      }
    }
  }

  const { error } = await supabase
    .from("voice_profile_suggestions")
    .update({
      status: input.accept ? "accepted" : "dismissed",
      resolved_at: new Date().toISOString(),
      resolved_by_member_id: ctx.member.id,
    })
    .eq("id", input.id)
    .eq("org_id", ctx.org.id);
  if (error) return { status: "error", error: "Could not update that suggestion." };
  revalidatePath("/app/settings/follow-up");
  revalidateSettings();
  return { status: "saved" };
}
