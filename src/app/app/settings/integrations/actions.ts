"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import type { SettingsSaveResult } from "@/app/app/settings/types";
import { canManageOrgSettings, canWorkOperatorApp } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { isLeadId } from "@/lib/cases/filters";
import { fetchLocationName } from "@/lib/ghl/client";
import { completeLocationSelection, disconnectGhl } from "@/lib/ghl/connect";
import { encryptSecret } from "@/lib/ghl/crypto";
import { loadConnection } from "@/lib/ghl/tokens";
import { retryDeadEvent, processGhlWebhookQueue } from "@/lib/ghl/process";
import { processExtractionQueue } from "@/lib/extraction/run";
import { RECORDER_SOURCES } from "@/lib/transcripts/constants";
import { attachTranscriptToCall } from "@/lib/transcripts/process";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/types/database";

function forbidden(): SettingsSaveResult {
  return { status: "error", error: "You do not have permission to change CRM settings." };
}

async function requireManager() {
  const ctx = await getAuthContext();
  if (!canWorkOperatorApp(ctx.role, ctx.member.surfaceAccess, ctx.isPlatformAdmin)) return null;
  if (!canManageOrgSettings(ctx.role, ctx.isPlatformAdmin)) return null;
  return ctx;
}

export async function disconnectCrm(
  _prev: SettingsSaveResult,
  _formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  void _formData;
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  await disconnectGhl(getSupabaseAdmin(), ctx.org.id);
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export async function testCrmConnection(
  _prev: SettingsSaveResult,
  _formData: FormData
): Promise<SettingsSaveResult> {
  void _prev;
  void _formData;
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const db = getSupabaseAdmin();
  const ghl = await loadConnection(db, ctx.org.id);
  if (!ghl?.location_id) return { status: "error", error: "LeadConnector is not connected." };
  const name = await fetchLocationName(db, ctx.org.id, ghl.location_id);
  if (!name) return { status: "error", error: "Could not read the linked location." };
  await db
    .from("ghl_connections")
    .update({ last_verified_at: new Date().toISOString(), last_refresh_error: null })
    .eq("org_id", ctx.org.id);
  revalidatePath("/app/settings/integrations");
  revalidatePath("/portal");
  return { status: "saved" };
}

export async function selectGhlLocation(
  _prev: SettingsSaveResult,
  formData: FormData
): Promise<SettingsSaveResult> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const locationId = String(formData.get("location_id") ?? "").trim();
  if (!locationId) return { status: "error", error: "Choose a location to link." };
  const result = await completeLocationSelection(getSupabaseAdmin(), {
    orgId: ctx.org.id,
    memberId: ctx.member.id,
    locationId,
  });
  if (!result.ok) return { status: "error", error: result.error };
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export async function retryWebhookEvent(eventId: string): Promise<SettingsSaveResult> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const ok = await retryDeadEvent(getSupabaseAdmin(), ctx.org.id, eventId);
  if (!ok) return { status: "error", error: "That event could not be queued for retry." };
  await processGhlWebhookQueue(getSupabaseAdmin(), 5);
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export type FieldMapPayload = {
  ghlFieldId: string;
  ghlFieldKey: string;
  answerKey: string;
};

export async function saveGhlFieldMaps(maps: FieldMapPayload[]): Promise<SettingsSaveResult> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();

  const cleaned = maps
    .map((map) => ({
      ghlFieldId: map.ghlFieldId.trim() || null,
      ghlFieldKey: map.ghlFieldKey.trim() || null,
      answerKey: map.answerKey.trim(),
    }))
    .filter((map) => map.answerKey && (map.ghlFieldId || map.ghlFieldKey));

  const supabase = await createClient();
  const { error: delError } = await supabase.from("ghl_field_maps").delete().eq("org_id", ctx.org.id);
  if (delError) return { status: "error", error: "Could not update field mapping." };

  if (cleaned.length > 0) {
    const { error } = await supabase.from("ghl_field_maps").insert(
      cleaned.map((map) => ({
        org_id: ctx.org.id,
        ghl_field_id: map.ghlFieldId,
        ghl_field_key: map.ghlFieldKey,
        answer_key: map.answerKey,
      }))
    );
    if (error) return { status: "error", error: "Could not save field mapping." };
  }

  revalidatePath("/app/settings/integrations");
  revalidatePath("/app/settings/scoring");
  return { status: "saved" };
}

function randomToken(): string {
  return randomBytes(18).toString("hex");
}

export async function saveTranscriptConnection(input: {
  source: string;
  webhookSecret: string;
  apiKey: string;
}): Promise<SettingsSaveResult> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  if (!(RECORDER_SOURCES as readonly string[]).includes(input.source)) {
    return { status: "error", error: "That recorder is not supported." };
  }
  const source = input.source as Enums<"transcript_source">;
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from("transcript_connections")
    .select("id, public_token")
    .eq("org_id", ctx.org.id)
    .eq("source", source)
    .maybeSingle();

  const webhookSecret = input.webhookSecret.trim();
  const apiKey = input.apiKey.trim();
  const patch = {
    updated_at: new Date().toISOString(),
    ...(webhookSecret ? { webhook_secret_encrypted: encryptSecret(webhookSecret) } : {}),
    ...(apiKey ? { api_key_encrypted: encryptSecret(apiKey) } : {}),
  };

  if (existing) {
    const { error } = await admin.from("transcript_connections").update(patch).eq("id", existing.id);
    if (error) return { status: "error", error: "Could not save that recorder connection." };
  } else {
    const { error } = await admin.from("transcript_connections").insert({
      org_id: ctx.org.id,
      source,
      public_token: randomToken(),
      ...patch,
    });
    if (error) return { status: "error", error: "Could not save that recorder connection." };
  }

  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export async function rotateTranscriptWebhookToken(source: string): Promise<SettingsSaveResult> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  if (!(RECORDER_SOURCES as readonly string[]).includes(source)) {
    return { status: "error", error: "That recorder is not supported." };
  }
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("transcript_connections")
    .update({ public_token: randomToken(), updated_at: new Date().toISOString() })
    .eq("org_id", ctx.org.id)
    .eq("source", source as Enums<"transcript_source">);
  if (error) return { status: "error", error: "Could not rotate that webhook URL." };
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export async function pasteUnmatchedTranscript(transcript: string): Promise<SettingsSaveResult> {
  const ctx = await requireManager();
  if (!ctx) return forbidden();
  const text = transcript.trim();
  if (!text) return { status: "error", error: "Paste a transcript first." };
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("unmatched_transcripts").insert({
    org_id: ctx.org.id,
    source: "manual",
    raw_transcript: text,
    status: "open",
  });
  if (error) return { status: "error", error: "The transcript could not be stored." };
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

export async function assignUnmatchedTranscript(input: {
  unmatchedId: string;
  callId: string;
}): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!isLeadId(input.unmatchedId) || !isLeadId(input.callId)) {
    return { status: "error", error: "Choose a transcript and a call." };
  }
  const supabase = await createClient();
  const { data: unmatched } = await supabase
    .from("unmatched_transcripts")
    .select("id, raw_transcript, source, provider_call_id, occurred_at, scheduled_at, duration_seconds, participant_emails, status")
    .eq("id", input.unmatchedId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!unmatched || unmatched.status !== "open") {
    return { status: "error", error: "That unmatched transcript is not available." };
  }
  const { data: call } = await supabase
    .from("calls")
    .select("id, lead_id, raw_transcript")
    .eq("id", input.callId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!call) return { status: "error", error: "That call is not in this workspace." };
  if (call.raw_transcript) {
    return { status: "error", error: "That call already has a transcript. Pick a different call." };
  }

  const admin = getSupabaseAdmin();
  const attached = await attachTranscriptToCall(admin, {
    orgId: ctx.org.id,
    callId: call.id,
    transcript: {
      source: unmatched.source,
      providerEventId: null,
      providerCallId: unmatched.provider_call_id,
      occurredAt: unmatched.occurred_at,
      scheduledAt: unmatched.scheduled_at,
      durationSeconds: unmatched.duration_seconds,
      participantEmails: unmatched.participant_emails ?? [],
      title: null,
      transcript: unmatched.raw_transcript,
    },
  });
  if (!attached.attached) {
    return { status: "error", error: "The transcript could not be attached." };
  }

  await admin
    .from("unmatched_transcripts")
    .update({
      status: "assigned",
      assigned_call_id: call.id,
      assigned_by_member_id: ctx.member.id,
      assigned_at: new Date().toISOString(),
      raw_transcript: "",
    })
    .eq("id", unmatched.id)
    .eq("org_id", ctx.org.id);

  await processExtractionQueue(admin, 1);
  revalidatePath("/app/settings/integrations");
  revalidatePath(`/app/calls/${call.id}`);
  revalidatePath(`/app/cases/${call.lead_id}`);
  revalidatePath(`/app/cases/${call.lead_id}/brief`);
  return { status: "saved" };
}

export async function discardUnmatchedTranscript(unmatchedId: string): Promise<SettingsSaveResult> {
  const ctx = await getAuthContext();
  if (!isLeadId(unmatchedId)) return { status: "error", error: "That transcript is not in this workspace." };
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("unmatched_transcripts")
    .select("id, status")
    .eq("id", unmatchedId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!data || data.status !== "open") {
    return { status: "error", error: "That unmatched transcript is not available." };
  }
  await admin
    .from("unmatched_transcripts")
    .update({
      status: "discarded",
      discarded_by_member_id: ctx.member.id,
      discarded_at: new Date().toISOString(),
      raw_transcript: "",
    })
    .eq("id", data.id);
  revalidatePath("/app/settings/integrations");
  return { status: "saved" };
}

