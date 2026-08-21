"use server";

import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { fetchContact, getValidAccessToken } from "@/lib/ghl/client";
import { persistGhlWebhookEvent } from "@/lib/ghl/ingest";
import { parseWebhookPayload } from "@/lib/ghl/payload";
import { processGhlWebhookQueue } from "@/lib/ghl/process";
import { searchContactsPage } from "@/lib/ghl/history";
import { generateVoiceSampleDraft, type DraftPreviewResult } from "@/lib/follow-up/preview";
import type { SetupStepId } from "@/lib/onboarding/constants";
import { isSetupStepId } from "@/lib/onboarding/steps";
import { runGoLiveCheck } from "@/lib/onboarding/golive";
import { revalidateOnboardingPaths } from "@/lib/onboarding/revalidate";
import type { GoliveRunResult } from "@/lib/onboarding/types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function forbidden(): SettingsSaveResult {
  return { status: "error", error: "You do not have permission to change setup." };
}

async function requireManager() {
  const ctx = await getAuthContext();
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return null;
  return ctx;
}

export async function markSetupStepVisited(step: SetupStepId): Promise<void> {
  const ctx = await requireManager();
  if (!ctx || !isSetupStepId(step)) return;
  const supabase = await createClient();
  await supabase.from("org_onboarding").update({ last_visited_step: step }).eq("org_id", ctx.org.id);
}

export async function chooseManualTranscripts(
  _prev: SettingsSaveResult,
  _formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  void _formData;
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_onboarding")
    .update({ transcript_choice: "manual" })
    .eq("org_id", ctx.org.id);
  if (error) return { status: "error", error: "Could not record the manual transcript choice." };
  revalidateOnboardingPaths();
  return { status: "saved" };
}

export async function acknowledgeEmptyVoice(
  _prev: SettingsSaveResult,
  _formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  void _formData;
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const supabase = await createClient();
  const { error } = await supabase
    .from("org_onboarding")
    .update({ voice_acknowledged_empty: true })
    .eq("org_id", ctx.org.id);
  if (error) return { status: "error", error: "Could not record that acknowledgment." };
  revalidateOnboardingPaths();
  return { status: "saved" };
}

export async function ingestRecentCrmContact(): Promise<SettingsSaveResult & { leadName?: string }> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const locationId = ctx.org.ghlLocationId;
  if (!locationId) return { status: "error", error: "Connect the CRM first." };

  const admin = getSupabaseAdmin();
  const page = await searchContactsPage(admin, ctx.org.id, locationId, 1);
  const candidate = page.contacts[0];
  if (!candidate) {
    return { status: "error", error: "GoHighLevel returned no contacts to ingest." };
  }

  const fetched = await fetchContact(admin, ctx.org.id, candidate.id);
  const contact = fetched.json?.contact ?? { id: candidate.id };
  const payload = {
    type: "ContactCreate",
    locationId,
    webhookId: `setup-preview-${candidate.id}`,
    contactId: candidate.id,
    contact,
  };
  const ingested = await persistGhlWebhookEvent(admin, {
    parsed: parseWebhookPayload(JSON.stringify(payload)),
    orgId: ctx.org.id,
  });
  if (ingested.httpStatus !== 200 || (!ingested.insertedId && !ingested.duplicate)) {
    return { status: "error", error: "The contact could not be stored through the webhook path." };
  }
  await processGhlWebhookQueue(admin, 5);

  const { data: lead } = await admin
    .from("leads")
    .select("first_name, last_name, email, current_score")
    .eq("org_id", ctx.org.id)
    .eq("ghl_contact_id", candidate.id)
    .maybeSingle();
  if (!lead) {
    return { status: "error", error: "The contact did not become a lead. Check field mapping and try again." };
  }
  revalidateOnboardingPaths();
  const leadName =
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email || "Ingested contact";
  return { status: "saved", leadName };
}

export async function previewVoiceDraft(): Promise<
  SettingsSaveResult & { preview?: DraftPreviewResult }
> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const admin = getSupabaseAdmin();
  const { data: lead } = await admin
    .from("leads")
    .select("first_name, source, campaign")
    .eq("org_id", ctx.org.id)
    .eq("is_test", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  try {
    const preview = await generateVoiceSampleDraft(admin, {
      orgId: ctx.org.id,
      lead: {
        firstName: lead?.first_name ?? "Maya",
        source: lead?.source ?? "inbound",
        offerName: lead?.campaign ?? null,
      },
    });
    return { status: "saved", preview };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "draft_failed";
    if (message === "missing_api_key") {
      return { status: "error", error: "Draft generation needs an Anthropic key on this deployment." };
    }
    return { status: "error", error: "Could not generate a sample draft from this voice profile." };
  }
}

export type ActivateResult =
  | { status: "idle" }
  | { status: "saved"; activatedAt: string; golive: GoliveRunResult }
  | { status: "error"; error: string };

export async function activateWorkspace(
  _prev: ActivateResult,
  formData: FormData
): Promise<ActivateResult> {
  void _prev;
  const ctx = await requireManager();
  if (!ctx) return { status: "error", error: "You do not have permission to activate this workspace." };

  const override = formData.get("override") === "on";
  const overridePhrase = String(formData.get("override_phrase") ?? "").trim();
  const overrideReason = String(formData.get("override_reason") ?? "").trim();
  const acknowledged = formData.getAll("ack").map((value) => String(value));

  const admin = getSupabaseAdmin();
  const verified = await getValidAccessToken(admin, ctx.org.id);
  if (!verified.ok && !override) {
    return {
      status: "error",
      error: "The CRM token could not be verified in the last hour. Reconnect, then try again.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("activate_org", {
    p_org_id: ctx.org.id,
    p_member_id: ctx.member.id,
    p_ack_warnings: acknowledged,
    p_override: override,
    p_override_phrase: override ? overridePhrase : null,
    p_override_reason: override ? overrideReason : null,
  });

  if (error) {
    return { status: "error", error: error.message || "Activation was refused." };
  }

  const row = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const activatedAt = typeof row.activated_at === "string" ? row.activated_at : new Date().toISOString();

  const golive = await runGoLiveCheck({
    orgId: ctx.org.id,
    memberId: ctx.member.id,
    userId: ctx.user.id,
  });

  revalidateOnboardingPaths();
  revalidatePath("/", "layout");
  return { status: "saved", activatedAt, golive };
}

export async function rerunGoLiveCheck(): Promise<SettingsSaveResult & { golive?: GoliveRunResult }> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const golive = await runGoLiveCheck({
    orgId: ctx.org.id,
    memberId: ctx.member.id,
    userId: ctx.user.id,
  });
  revalidateOnboardingPaths();
  return { status: "saved", golive };
}

export async function changeActivationTimestamp(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const slug = String(formData.get("slug") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const nextAt = String(formData.get("next_at") ?? "").trim();
  if (!slug || !reason || !nextAt) {
    return { status: "error", error: "Type the organization slug, a new timestamp, and a reason." };
  }
  const parsed = new Date(nextAt);
  if (Number.isNaN(parsed.getTime())) {
    return { status: "error", error: "That timestamp is not usable." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_activation_timestamp", {
    p_org_id: ctx.org.id,
    p_member_id: ctx.member.id,
    p_confirm_slug: slug,
    p_next_at: parsed.toISOString(),
    p_reason: reason,
  });
  if (error) return { status: "error", error: error.message };
  revalidateOnboardingPaths();
  revalidatePath("/app/reporting");
  return { status: "saved" };
}
