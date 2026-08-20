"use server";

import { revalidatePath } from "next/cache";

import { getAuthContext } from "@/lib/auth/session";
import { isLeadId } from "@/lib/cases/filters";
import { EXTRACTION_CORRECTABLE_FIELDS, type ExtractionCorrectableField } from "@/lib/transcripts/constants";
import { enqueueExtraction, attachTranscriptToCall } from "@/lib/transcripts/process";
import { processExtractionQueue } from "@/lib/extraction/run";
import { keepVerbatimQuotes } from "@/lib/transcripts/quotes";
import { presentSignalText } from "@/lib/extraction/parse";
import { scoreLeadFromCall } from "@/lib/scoring/call";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";
import { loadOrgCallDetail, loadOrgCallList } from "@/lib/calls/load";
import type { CallDetailPayload, CallListPayload } from "@/lib/calls/types";

export type CallActionResult = { ok: true } | { ok: false; error: string };

function isUuid(value: string): boolean {
  return isLeadId(value);
}

function revalidateCallSurfaces(leadId: string, callId: string) {
  revalidatePath("/app/calls");
  revalidatePath(`/app/calls/${callId}`);
  revalidatePath("/app/cases");
  revalidatePath(`/app/cases/${leadId}`);
  revalidatePath(`/app/cases/${leadId}/brief`);
  revalidatePath("/app/queue");
  revalidatePath("/app/settings/integrations");
}

export async function refreshCallList(opts?: {
  cursor?: { at: string; id: string } | null;
}): Promise<CallListPayload> {
  return loadOrgCallList(opts);
}

export async function refreshCallDetail(callId: string): Promise<CallDetailPayload | null> {
  if (!isUuid(callId)) return null;
  return loadOrgCallDetail(callId);
}

export async function pasteCallTranscript(input: {
  callId: string;
  transcript: string;
}): Promise<CallActionResult> {
  if (!isUuid(input.callId)) return { ok: false, error: "That call is not in this workspace." };
  const text = input.transcript.trim();
  if (!text) return { ok: false, error: "Paste the transcript before saving." };

  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data: call } = await supabase
    .from("calls")
    .select("id, lead_id")
    .eq("id", input.callId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!call) return { ok: false, error: "That call is not in this workspace." };

  const admin = getSupabaseAdmin();
  await attachTranscriptToCall(admin, {
    orgId: ctx.org.id,
    callId: call.id,
    replace: true,
    transcript: {
      source: "manual",
      providerEventId: null,
      providerCallId: null,
      occurredAt: null,
      scheduledAt: null,
      durationSeconds: null,
      participantEmails: [],
      title: null,
      transcript: text,
    },
  });
  await processExtractionQueue(admin, 1);
  revalidateCallSurfaces(call.lead_id, call.id);
  return { ok: true };
}

export async function reextractCall(callId: string): Promise<CallActionResult> {
  if (!isUuid(callId)) return { ok: false, error: "That call is not in this workspace." };
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data: call } = await supabase
    .from("calls")
    .select("id, lead_id, raw_transcript")
    .eq("id", callId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!call) return { ok: false, error: "That call is not in this workspace." };
  if (!call.raw_transcript) return { ok: false, error: "This call has no transcript to extract." };

  const admin = getSupabaseAdmin();
  await enqueueExtraction(admin, ctx.org.id, call.id, ctx.member.id);
  await processExtractionQueue(admin, 1);
  revalidateCallSurfaces(call.lead_id, call.id);
  return { ok: true };
}

export async function retryDeadExtraction(callId: string): Promise<CallActionResult> {
  if (!isUuid(callId)) return { ok: false, error: "That call is not in this workspace." };
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data: call } = await supabase
    .from("calls")
    .select("id, lead_id")
    .eq("id", callId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!call) return { ok: false, error: "That call is not in this workspace." };

  const admin = getSupabaseAdmin();
  const { data: job } = await admin
    .from("extraction_jobs")
    .select("id, status")
    .eq("call_id", call.id)
    .eq("org_id", ctx.org.id)
    .eq("status", "dead")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!job) return { ok: false, error: "There is no failed extraction to retry." };

  await admin
    .from("extraction_jobs")
    .update({ status: "pending", next_attempt_at: new Date().toISOString(), last_error: null })
    .eq("id", job.id);
  await processExtractionQueue(admin, 1);
  revalidateCallSurfaces(call.lead_id, call.id);
  return { ok: true };
}

type ExtractionUpdate = Database["public"]["Tables"]["call_extractions"]["Update"];
type SignalState = Database["public"]["Enums"]["extraction_signal_state"];

function isSignalState(value: string): value is SignalState {
  return value === "absent" || value === "unclear" || value === "present";
}

function correctionPatch(
  fieldName: ExtractionCorrectableField,
  nextValue: string,
  quotes?: Json
): ExtractionUpdate | { error: string } {
  switch (fieldName) {
    case "quotes":
      return { quotes };
    case "budget_signal_state":
      if (!isSignalState(nextValue)) return { error: "State must be absent, unclear, or present." };
      return { budget_signal_state: nextValue };
    case "timeline_signal_state":
      if (!isSignalState(nextValue)) return { error: "State must be absent, unclear, or present." };
      return { timeline_signal_state: nextValue };
    case "decision_process_state":
      if (!isSignalState(nextValue)) return { error: "State must be absent, unclear, or present." };
      return { decision_process_state: nextValue };
    case "stated_objection_state":
      if (!isSignalState(nextValue)) return { error: "State must be absent, unclear, or present." };
      return { stated_objection_state: nextValue };
    case "next_step_state":
      if (!isSignalState(nextValue)) return { error: "State must be absent, unclear, or present." };
      return { next_step_state: nextValue };
    case "summary":
      return { summary: nextValue || null };
    case "stated_objection":
      return { stated_objection: nextValue || null };
    case "budget_signal":
      return { budget_signal: nextValue || null };
    case "timeline_signal":
      return { timeline_signal: nextValue || null };
    case "decision_process":
      return { decision_process: nextValue || null };
    case "next_step_agreed":
      return { next_step_agreed: nextValue || null };
  }
}

export async function correctExtractionField(input: {
  callId: string;
  fieldName: string;
  value: string;
}): Promise<CallActionResult> {
  if (!isUuid(input.callId)) return { ok: false, error: "That call is not in this workspace." };
  if (!(EXTRACTION_CORRECTABLE_FIELDS as readonly string[]).includes(input.fieldName)) {
    return { ok: false, error: "That field cannot be corrected." };
  }
  const fieldName = input.fieldName as ExtractionCorrectableField;
  const ctx = await getAuthContext();
  const supabase = await createClient();
  const { data: call } = await supabase
    .from("calls")
    .select("id, lead_id, type, occurred_at, scheduled_at, raw_transcript")
    .eq("id", input.callId)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!call) return { ok: false, error: "That call is not in this workspace." };

  const { data: extraction } = await supabase
    .from("call_extractions")
    .select("*")
    .eq("call_id", call.id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!extraction) return { ok: false, error: "This call has no extraction to correct." };

  const previous = previousValue(extraction as Record<string, unknown>, fieldName);
  let nextValue = input.value.trim();
  let quotesJson: Json | undefined;

  if (fieldName === "quotes") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.value);
    } catch {
      return { ok: false, error: "Quotes must be a list of verbatim lines from the transcript." };
    }
    if (!Array.isArray(parsed)) return { ok: false, error: "Quotes must be a list." };
    const quotes = keepVerbatimQuotes(
      parsed.map((item) => {
        const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          text: typeof row.text === "string" ? row.text : "",
          topic: typeof row.topic === "string" ? row.topic : "situation",
        };
      }),
      call.raw_transcript ?? ""
    );
    quotesJson = quotes as unknown as Json;
    nextValue = JSON.stringify(quotes);
  }

  const patch = correctionPatch(fieldName, nextValue, quotesJson);
  if ("error" in patch) return { ok: false, error: patch.error };

  const { error: correctionError } = await supabase.from("extraction_corrections").insert({
    org_id: ctx.org.id,
    extraction_id: extraction.id,
    call_id: call.id,
    field_name: fieldName,
    previous_value: previous,
    new_value: nextValue || null,
    actor_member_id: ctx.member.id,
  });
  if (correctionError) return { ok: false, error: "The correction could not be recorded." };

  const { error: updateError } = await supabase.from("call_extractions").update(patch).eq("id", extraction.id);
  if (updateError) return { ok: false, error: "The extraction could not be updated." };

  if (fieldName === "budget_signal" || fieldName === "timeline_signal" || fieldName === "decision_process") {
    const { data: latest } = await supabase
      .from("call_extractions")
      .select("budget_signal, budget_signal_state, timeline_signal, timeline_signal_state, decision_process, decision_process_state")
      .eq("id", extraction.id)
      .maybeSingle();
    if (latest) {
      await scoreLeadFromCall(getSupabaseAdmin(), {
        orgId: ctx.org.id,
        leadId: call.lead_id,
        callId: call.id,
        extractionId: `${extraction.id}:${Date.now()}`,
        callType: call.type,
        callAt: call.occurred_at ?? call.scheduled_at,
        signals: {
          timeline_signal: presentSignalText({
            state: latest.timeline_signal_state,
            text: latest.timeline_signal,
          }),
          budget_signal: presentSignalText({
            state: latest.budget_signal_state,
            text: latest.budget_signal,
          }),
          decision_process: presentSignalText({
            state: latest.decision_process_state,
            text: latest.decision_process,
          }),
        },
      });
    }
  }

  revalidateCallSurfaces(call.lead_id, call.id);
  return { ok: true };
}

function previousValue(
  extraction: Record<string, unknown>,
  fieldName: ExtractionCorrectableField
): string | null {
  const value = extraction[fieldName];
  if (value == null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

