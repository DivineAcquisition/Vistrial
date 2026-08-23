import "server-only";

import { nextAttemptAt, shouldMarkDead } from "@/lib/ghl/retry";
import { scoreLeadFromCall } from "@/lib/scoring/call";
import { createAnthropicMessage } from "@/lib/extraction/anthropic";
import { extractJsonObject, parseExtraction, presentSignalText } from "@/lib/extraction/parse";
import { EXTRACTION_SYSTEM_PROMPT, extractionUserPrompt } from "@/lib/extraction/prompt";
import {
  EXTRACTION_MAX_ATTEMPTS,
  TRANSCRIPT_HEAD_CHARS,
  TRANSCRIPT_TAIL_CHARS,
} from "@/lib/transcripts/constants";
import { transcriptError, transcriptLog, transcriptWarn } from "@/lib/transcripts/log";
import { sanitizeError } from "@/lib/transcripts/process";
import { clipTranscriptWindow } from "@/lib/transcripts/quotes";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { Json } from "@/types/database";

export async function processExtractionQueue(db: GhlDb, max = 10): Promise<{
  jobs: number;
  failed: number;
}> {
  let jobs = 0;
  let failed = 0;
  for (let i = 0; i < max; i += 1) {
    const { data: id, error } = await db.rpc("claim_extraction_job");
    if (error) {
      transcriptError("extraction.claim_failed", { code: error.code });
      break;
    }
    if (!id) break;
    try {
      await runExtractionJob(db, id);
      jobs += 1;
    } catch (cause) {
      failed += 1;
      await failExtractionJob(db, id, cause);
    }
  }
  return { jobs, failed };
}

export async function runExtractionJob(db: GhlDb, jobId: string): Promise<void> {
  const { data: job } = await db
    .from("extraction_jobs")
    .select("id, org_id, call_id, attempt_count")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;

  await db
    .from("extraction_jobs")
    .update({ attempt_count: job.attempt_count + 1 })
    .eq("id", job.id);

  const { data: call } = await db
    .from("calls")
    .select("id, org_id, lead_id, raw_transcript, type, occurred_at, scheduled_at")
    .eq("id", job.call_id)
    .eq("org_id", job.org_id)
    .maybeSingle();

  if (!call?.raw_transcript) {
    throw new Error("empty_transcript");
  }

  const window = clipTranscriptWindow(call.raw_transcript, TRANSCRIPT_HEAD_CHARS, TRANSCRIPT_TAIL_CHARS);
  const { data: profile } = await db
    .from("business_profiles")
    .select(
      "offer_type, offer_type_other, qualification_signals, qualification_signals_other, lead_channels, lead_channels_other"
    )
    .eq("org_id", job.org_id)
    .maybeSingle();
  const { data: vocabulary } = await db
    .from("objection_vocabulary")
    .select("type, phrasing")
    .eq("org_id", job.org_id)
    .order("rank", { ascending: true });
  const message = await createAnthropicMessage({
    system: EXTRACTION_SYSTEM_PROMPT,
    user: extractionUserPrompt(window.text, window.truncated, {
      offerType: profile?.offer_type,
      offerTypeOther: profile?.offer_type_other,
      qualificationSignals: profile?.qualification_signals,
      qualificationSignalsOther: profile?.qualification_signals_other,
      leadChannels: profile?.lead_channels,
      leadChannelsOther: profile?.lead_channels_other,
      topObjections: (vocabulary ?? []).map((item) => ({ type: item.type, phrasing: item.phrasing })),
    }),
  });

  const parsed = parseExtraction(extractJsonObject(message.text), call.raw_transcript);
  const extractedAt = new Date().toISOString();

  const { data: existing } = await db
    .from("call_extractions")
    .select("id")
    .eq("call_id", call.id)
    .maybeSingle();

  const row = {
    org_id: call.org_id,
    call_id: call.id,
    summary: parsed.summary,
    stated_objection: parsed.statedObjection.text,
    stated_objection_state: parsed.statedObjection.state,
    budget_signal: parsed.budgetSignal.text,
    budget_signal_state: parsed.budgetSignal.state,
    timeline_signal: parsed.timelineSignal.text,
    timeline_signal_state: parsed.timelineSignal.state,
    decision_process: parsed.decisionProcess.text,
    decision_process_state: parsed.decisionProcess.state,
    next_step_agreed: parsed.nextStepAgreed.text,
    next_step_state: parsed.nextStepAgreed.state,
    quotes: parsed.quotes as unknown as Json,
    model_version: message.model,
    extracted_at: extractedAt,
    input_tokens: message.inputTokens,
    output_tokens: message.outputTokens,
  };

  let extractionId = existing?.id ?? null;
  if (existing) {
    const { error } = await db.from("call_extractions").update(row).eq("id", existing.id);
    if (error) throw new Error("process_failed");
  } else {
    const { data: inserted, error } = await db
      .from("call_extractions")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (error || !inserted) throw new Error("process_failed");
    extractionId = inserted.id;
  }

  for (const objection of parsed.objections) {
    const { error } = await db.from("objections").insert({
      org_id: call.org_id,
      lead_id: call.lead_id,
      type: objection.type,
      verbatim: objection.verbatim,
      call_id: call.id,
    });
    if (error && error.code !== "23505") throw new Error("process_failed");
  }

  await db.from("extraction_usage").insert({
    org_id: call.org_id,
    call_id: call.id,
    extraction_id: extractionId,
    model_version: message.model,
    input_tokens: message.inputTokens,
    output_tokens: message.outputTokens,
  });

  const score = await scoreLeadFromCall(db, {
    orgId: call.org_id,
    leadId: call.lead_id,
    callId: call.id,
    extractionId,
    callType: call.type,
    callAt: call.occurred_at ?? call.scheduled_at,
    signals: {
      timeline_signal: presentSignalText(parsed.timelineSignal),
      budget_signal: presentSignalText(parsed.budgetSignal),
      decision_process: presentSignalText(parsed.decisionProcess),
    },
  });
  if (score.written === false && score.reason === "db") {
    throw new Error("score_write_failed");
  }

  await db
    .from("extraction_jobs")
    .update({
      status: "processed",
      processed_at: extractedAt,
      last_error: null,
    })
    .eq("id", job.id);

  try {
    const { enqueueFollowUpAfterExtraction } = await import("@/lib/follow-up/generate");
    await enqueueFollowUpAfterExtraction(db, {
      orgId: call.org_id,
      leadId: call.lead_id,
      callId: call.id,
      extractionId,
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.slice(0, 80) : "enqueue_failed";
    transcriptError("follow_up.enqueue_failed", {
      callId: call.id,
      reason,
    });
    await db
      .from("extraction_jobs")
      .update({ last_error: `follow_up_enqueue:${reason}` })
      .eq("id", job.id);
  }

  transcriptLog("extraction.processed", {
    jobId: job.id,
    callId: call.id,
    model: message.model,
    inputTokens: message.inputTokens,
    outputTokens: message.outputTokens,
    truncated: window.truncated,
  });
}

async function failExtractionJob(db: GhlDb, jobId: string, cause: unknown) {
  const { data: job } = await db
    .from("extraction_jobs")
    .select("id, attempt_count")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;
  const reason = sanitizeError(cause instanceof Error ? cause.message : "process_failed");
  const dead = shouldMarkDead(job.attempt_count, EXTRACTION_MAX_ATTEMPTS);
  await db
    .from("extraction_jobs")
    .update({
      status: dead ? "dead" : "pending",
      last_error: reason,
      next_attempt_at: dead ? new Date().toISOString() : nextAttemptAt(job.attempt_count),
    })
    .eq("id", jobId);
  transcriptWarn("extraction.failed", { jobId, dead, reason });
}
