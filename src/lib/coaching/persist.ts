import "server-only";

import { createHash } from "node:crypto";

import { analyzeCall, type AnalyzeCallInput } from "@/lib/coaching/analyze";
import { ANALYZER_VERSION, TYPICAL_DURATION_MIN_N } from "@/lib/coaching/constants";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { Enums } from "@/types/database";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

type StoredCall = {
  id: string;
  org_id: string;
  lead_id: string;
  type: Enums<"call_type">;
  ran_by_member_id: string;
  occurred_at: string | null;
  duration_seconds: number | null;
  raw_transcript: string;
};

async function typicalDuration(
  db: GhlDb,
  orgId: string,
  callType: Enums<"call_type">,
  exceptCallId: string
): Promise<number | null> {
  const { data, error } = await db
    .from("calls")
    .select("duration_seconds")
    .eq("org_id", orgId)
    .eq("type", callType)
    .not("raw_transcript", "is", null)
    .not("duration_seconds", "is", null)
    .neq("id", exceptCallId);
  if (error || !data) return null;
  const values = data
    .map((row) => row.duration_seconds)
    .filter((value): value is number => typeof value === "number" && value > 0)
    .sort((a, b) => a - b);
  if (values.length < TYPICAL_DURATION_MIN_N) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? Math.round((values[mid - 1]! + values[mid]!) / 2) : values[mid]!;
}

export async function analyzeAndStoreCall(db: GhlDb, callId: string): Promise<{ stored: boolean; reason?: string; orgId?: string }> {
  const { data: call, error } = await db
    .from("calls")
    .select("id, org_id, lead_id, type, ran_by_member_id, occurred_at, duration_seconds, raw_transcript")
    .eq("id", callId)
    .maybeSingle();
  if (error) throw error;
  if (!call?.raw_transcript || !call.ran_by_member_id) {
    return { stored: false, reason: "missing_transcript_or_rep", orgId: call?.org_id };
  }
  const row = call as StoredCall;

  const { data: member } = await db
    .from("org_members")
    .select("call_coaching_acknowledged_at")
    .eq("id", row.ran_by_member_id)
    .maybeSingle();
  if (!member?.call_coaching_acknowledged_at) {
    return { stored: false, reason: "rep_not_told", orgId: row.org_id };
  }

  const hash = sha256(row.raw_transcript);
  const { data: existing } = await db
    .from("call_quality_measures")
    .select("id, transcript_sha256")
    .eq("call_id", row.id)
    .maybeSingle();
  if (existing?.transcript_sha256 === hash) {
    return { stored: false, reason: "unchanged", orgId: row.org_id };
  }

  const [{ data: extraction }, { data: objections }, { data: prior }, { data: views }, { data: painScore }] =
    await Promise.all([
      db
        .from("call_extractions")
        .select(
          "timeline_signal_state, budget_signal_state, decision_process_state, next_step_state, next_step_agreed"
        )
        .eq("call_id", row.id)
        .maybeSingle(),
      db.from("objections").select("id, type, verbatim").eq("call_id", row.id),
      db
        .from("objections")
        .select("id, type, verbatim, created_at, resolved")
        .eq("lead_id", row.lead_id)
        .eq("org_id", row.org_id),
      db
        .from("brief_views")
        .select("viewed_at")
        .eq("lead_id", row.lead_id)
        .eq("member_id", row.ran_by_member_id)
        .order("viewed_at", { ascending: false })
        .limit(20),
      db
        .from("readiness_scores")
        .select("pain_severity_raw, triggered_by")
        .eq("call_id", row.id)
        .maybeSingle(),
    ]);

  const occurredAt = row.occurred_at;
  const priorOpen = (prior ?? []).filter((item) => {
    if (item.resolved) return false;
    if (!occurredAt || !item.created_at) return item.id !== undefined;
    return item.created_at < occurredAt;
  });

  const briefOpenedBeforeCall = Boolean(
    occurredAt && (views ?? []).some((view) => view.viewed_at && view.viewed_at < occurredAt)
  );

  const typical = await typicalDuration(db, row.org_id, row.type, row.id);

  const input: AnalyzeCallInput = {
    transcript: row.raw_transcript,
    durationSeconds: row.duration_seconds,
    typicalDurationSeconds: typical,
    extraction: extraction
      ? {
          timelineState: extraction.timeline_signal_state,
          budgetState: extraction.budget_signal_state,
          decisionState: extraction.decision_process_state,
          nextStepState: extraction.next_step_state,
          nextStepAgreed: extraction.next_step_agreed,
        }
      : null,
    objections: (objections ?? []).map((item) => ({
      id: item.id,
      type: item.type,
      verbatim: item.verbatim,
    })),
    priorOpenObjections: priorOpen.map((item) => ({
      id: item.id,
      type: item.type,
      verbatim: item.verbatim,
    })),
    briefOpenedBeforeCall,
    painScoredOnThisCall:
      painScore?.triggered_by === "call" && typeof painScore.pain_severity_raw === "number"
        ? painScore.pain_severity_raw > 0
        : false,
  };

  const analyzed = analyzeCall(input);
  const payload = {
    org_id: row.org_id,
    call_id: row.id,
    lead_id: row.lead_id,
    member_id: row.ran_by_member_id,
    occurred_at: row.occurred_at ?? new Date().toISOString(),
    call_type: row.type,
    duration_seconds: analyzed.durationSeconds,
    transcript_sha256: hash,
    speakers_attributed: analyzed.speakersAttributed,
    talk_ratio_rep: analyzed.talkRatioRep,
    talk_ratio_prospect: analyzed.talkRatioProspect,
    word_count_rep: analyzed.wordCountRep,
    word_count_prospect: analyzed.wordCountProspect,
    word_count_unknown: analyzed.wordCountUnknown,
    question_count: analyzed.questionCount,
    open_question_count: analyzed.openQuestionCount,
    closed_question_count: analyzed.closedQuestionCount,
    longest_rep_monologue_words: analyzed.longestRepMonologueWords,
    typical_duration_seconds: analyzed.typicalDurationSeconds,
    duration_vs_typical_seconds: analyzed.durationVsTypicalSeconds,
    next_step_stated: analyzed.nextStepStated,
    next_step_agreed: analyzed.nextStepAgreed,
    commitment_clarity: analyzed.commitmentClarity,
    discovery_pain: analyzed.discoveryPain,
    discovery_timeline: analyzed.discoveryTimeline,
    discovery_budget: analyzed.discoveryBudget,
    discovery_authority: analyzed.discoveryAuthority,
    open_objections_prior_n: analyzed.openObjectionsPriorN,
    open_objections_addressed_n: analyzed.openObjectionsAddressedN,
    brief_opened_before_call: analyzed.briefOpenedBeforeCall,
    analyzer_version: ANALYZER_VERSION,
    analyzed_at: new Date().toISOString(),
  };

  const { data: saved, error: saveError } = await db
    .from("call_quality_measures")
    .upsert(payload, { onConflict: "call_id" })
    .select("id")
    .maybeSingle();
  if (saveError || !saved) throw new Error(saveError?.message ?? "call_quality_store_failed");

  await db.from("call_objection_handlings").delete().eq("call_id", row.id);
  if (analyzed.objections.length > 0) {
    const { error: objError } = await db.from("call_objection_handlings").insert(
      analyzed.objections.map((item) => ({
        org_id: row.org_id,
        call_id: row.id,
        measure_id: saved.id,
        objection_id: item.objectionId,
        objection_type: item.objectionType,
        verbatim: item.verbatim,
        handling: item.handling,
        evidence_span: item.evidenceSpan,
      }))
    );
    if (objError) throw new Error(objError.message);
  }

  return { stored: true, orgId: row.org_id };
}

export async function analyzePendingCalls(db: GhlDb, max = 40): Promise<{ processed: number; skipped: number; orgIds: string[] }> {
  const { data, error } = await db.rpc("list_call_quality_pending", { p_limit: max });
  if (error) throw error;

  const orgIds = new Set<string>();
  let processed = 0;
  let skipped = 0;
  for (const row of data ?? []) {
    const result = await analyzeAndStoreCall(db, row.call_id);
    if (result.orgId) orgIds.add(result.orgId);
    if (result.stored) processed += 1;
    else skipped += 1;
  }
  return { processed, skipped, orgIds: [...orgIds] };
}
