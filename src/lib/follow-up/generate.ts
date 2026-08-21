import "server-only";

import { anthropicDraftModel, createAnthropicMessage } from "@/lib/extraction/anthropic";
import { FOLLOW_UP_MAX_ATTEMPTS } from "@/lib/follow-up/constants";
import { followUpError, followUpLog, followUpWarn } from "@/lib/follow-up/log";
import { parseDraftModelOutput } from "@/lib/follow-up/parse";
import { DRAFT_SYSTEM_PROMPT, draftUserPrompt } from "@/lib/follow-up/prompt";
import { checkDraftQuality } from "@/lib/follow-up/quality";
import { boundedSequenceSteps, parseRoutingRule, routeFollowUp } from "@/lib/follow-up/routing";
import type {
  FollowUpBranch,
  FollowUpChannel,
  QualityFailure,
  RoutingRule,
  VoiceProfile,
} from "@/lib/follow-up/types";
import { parseVoiceProfile } from "@/lib/follow-up/voice";
import { nextAttemptAt, shouldMarkDead } from "@/lib/ghl/retry";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { Enums, Json } from "@/types/database";

function assertFrontierDraftModel(model: string) {
  if (/haiku/i.test(model)) throw new Error("draft_model_too_cheap");
}

function asQuotes(value: Json): Array<{ text: string; topic: string }> {
  if (!Array.isArray(value)) return [];
  const quotes: Array<{ text: string; topic: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    const topic = typeof item.topic === "string" ? item.topic : "situation";
    if (text) quotes.push({ text, topic });
  }
  return quotes;
}

async function loadRules(db: GhlDb, orgId: string): Promise<RoutingRule[]> {
  const { data } = await db
    .from("follow_up_routing_rules")
    .select("id, priority, branch, enabled, match, channel, sequence_steps")
    .eq("org_id", orgId)
    .order("priority", { ascending: true });
  return (data ?? [])
    .map((row) =>
      parseRoutingRule({
        id: row.id,
        priority: row.priority,
        branch: row.branch,
        enabled: row.enabled,
        match: row.match,
        channel: row.channel,
        sequence_steps: row.sequence_steps,
      })
    )
    .filter((item): item is RoutingRule => item !== null);
}

async function loadVoice(db: GhlDb, orgId: string): Promise<VoiceProfile> {
  const { data } = await db.from("org_voice_profiles").select("*").eq("org_id", orgId).maybeSingle();
  if (!data) {
    return parseVoiceProfile({
      formality: "casual",
      use_contractions: true,
      use_greeting: false,
      use_signoff: false,
      greeting_text: null,
      signoff_text: null,
      sms_max_chars: 240,
      email_max_chars: 900,
      emoji_usage: "never",
      banned_words: [],
      examples: [],
    });
  }
  return parseVoiceProfile(data);
}

async function logFailures(
  db: GhlDb,
  args: {
    orgId: string;
    branch: FollowUpBranch;
    attempt: number;
    failures: QualityFailure[];
    draftId?: string | null;
    jobId?: string | null;
  }
) {
  if (!args.failures.length) return;
  const { error } = await db.from("follow_up_quality_check_failures").insert(
    args.failures.map((failure) => ({
      org_id: args.orgId,
      draft_id: args.draftId ?? null,
      job_id: args.jobId ?? null,
      branch: args.branch,
      failure_type: failure.type,
      attempt: args.attempt,
      detail: failure.detail,
    }))
  );
  if (error) {
    followUpError("follow_up.quality_log_failed", {
      jobId: args.jobId ?? null,
      draftId: args.draftId ?? null,
      error: error.message,
    });
  }
}

async function recordEvent(
  db: GhlDb,
  args: {
    orgId: string;
    draftId: string | null;
    sequenceRunId: string | null;
    kind: Enums<"follow_up_event_kind">;
    actorMemberId?: string | null;
    payload?: Record<string, unknown>;
  }
) {
  await db.from("follow_up_events").insert({
    org_id: args.orgId,
    draft_id: args.draftId,
    sequence_run_id: args.sequenceRunId,
    kind: args.kind,
    actor_member_id: args.actorMemberId ?? null,
    payload: (args.payload ?? {}) as Json,
  });
}

async function recordEnqueueFailed(
  db: GhlDb,
  args: { orgId: string; callId: string },
  reason: string
) {
  const { error } = await db.from("follow_up_events").insert({
    org_id: args.orgId,
    draft_id: null,
    sequence_run_id: null,
    kind: "enqueue_failed",
    payload: { reason, callId: args.callId } as Json,
  });
  if (error) {
    followUpError("follow_up.enqueue_failed_log", {
      callId: args.callId,
      error: error.message,
    });
  }
}

export async function enqueueFollowUpAfterExtraction(
  db: GhlDb,
  args: { orgId: string; leadId: string; callId: string; extractionId: string | null }
): Promise<void> {
  try {
    await enqueueFollowUpAfterExtractionInner(db, args);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.slice(0, 80) : "enqueue_failed";
    await recordEnqueueFailed(db, args, reason);
    throw cause;
  }
}

async function enqueueFollowUpAfterExtractionInner(
  db: GhlDb,
  args: { orgId: string; leadId: string; callId: string; extractionId: string | null }
): Promise<void> {
  const { data: existing } = await db
    .from("follow_up_jobs")
    .select("id")
    .eq("call_id", args.callId)
    .eq("sequence_position", 1)
    .in("status", ["pending", "processed"])
    .maybeSingle();
  if (existing) {
    followUpLog("follow_up.enqueue_skipped", { callId: args.callId, reason: "already_queued" });
    return;
  }

  const routed = await resolveRoute(db, args);
  if (!routed) {
    followUpLog("follow_up.no_route", { callId: args.callId });
    await recordEnqueueFailed(db, args, "no_route");
    return;
  }

  await db.rpc("halt_follow_up_sequences_for_lead", {
    p_org_id: args.orgId,
    p_lead_id: args.leadId,
    p_reason: "new_call",
    p_actor: null,
  });

  const { data: settings } = await db
    .from("follow_up_settings")
    .select("sequences_halted, max_sequence_length, max_sequence_duration_days, draft_stale_days")
    .eq("org_id", args.orgId)
    .maybeSingle();

  const steps = boundedSequenceSteps(routed.rule.sequenceSteps, settings?.max_sequence_length ?? 3);
  const startSequence = steps.length > 1 && settings?.sequences_halted !== true;
  let sequenceRunId: string | null = null;

  if (startSequence) {
    const durationDays = settings?.max_sequence_duration_days ?? 21;
    const maxUntil = new Date(Date.now() + durationDays * 86_400_000).toISOString();
    const { data: run, error } = await db
      .from("follow_up_sequence_runs")
      .insert({
        org_id: args.orgId,
        lead_id: args.leadId,
        call_id: args.callId,
        branch: routed.rule.branch,
        max_steps: steps.length,
        max_until: maxUntil,
        next_position: 2,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error("sequence_insert_failed");
    sequenceRunId = run?.id ?? null;
  }

  const channel = steps[0]?.channel ?? routed.rule.channel;
  const { data: job, error } = await db
    .from("follow_up_jobs")
    .insert({
      org_id: args.orgId,
      lead_id: args.leadId,
      call_id: args.callId,
      extraction_id: args.extractionId,
      sequence_run_id: sequenceRunId,
      sequence_position: 1,
      branch: routed.rule.branch,
      channel,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (error || !job) throw new Error("follow_up_job_insert_failed");

  await runFollowUpJob(db, job.id);
}

async function resolveRoute(
  db: GhlDb,
  args: { orgId: string; leadId: string; callId: string }
) {
  const { data: call } = await db
    .from("calls")
    .select("id, outcome, occurred_at")
    .eq("id", args.callId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  const { data: lead } = await db
    .from("leads")
    .select("status")
    .eq("id", args.leadId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  const { data: extraction } = await db
    .from("call_extractions")
    .select("next_step_agreed, next_step_state, stated_objection_state")
    .eq("call_id", args.callId)
    .maybeSingle();
  if (!call || !lead || !extraction) return null;

  const { count } = await db
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("org_id", args.orgId)
    .eq("lead_id", args.leadId)
    .eq("outcome", "no_show");

  const rules = await loadRules(db, args.orgId);
  const rule = routeFollowUp(
    {
      callOutcome: call.outcome,
      nextStepState: extraction.next_step_state,
      nextStepText: extraction.next_step_agreed,
      statedObjectionState: extraction.stated_objection_state,
      leadStatus: lead.status,
      noShowCount: count ?? 0,
    },
    rules
  );
  if (!rule) return null;
  return { rule, call, lead, extraction };
}

export async function processFollowUpQueue(db: GhlDb, max = 8): Promise<{
  jobs: number;
  failed: number;
  expired: number;
}> {
  const { data: expired } = await db.rpc("expire_stale_follow_up_drafts");
  let jobs = 0;
  let failed = 0;
  for (let i = 0; i < max; i += 1) {
    const { data: id, error } = await db.rpc("claim_follow_up_job");
    if (error) {
      followUpError("follow_up.claim_failed", { code: error.code });
      break;
    }
    if (!id) break;
    try {
      await runFollowUpJob(db, id);
      jobs += 1;
    } catch (cause) {
      failed += 1;
      await failFollowUpJob(db, id, cause);
    }
  }
  return { jobs, failed, expired: typeof expired === "number" ? expired : 0 };
}

export async function runFollowUpJob(db: GhlDb, jobId: string): Promise<void> {
  const { data: job } = await db.from("follow_up_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return;

  await db
    .from("follow_up_jobs")
    .update({ attempt_count: job.attempt_count + 1 })
    .eq("id", job.id);

  if (job.sequence_position > 1) {
    const { data: settings } = await db
      .from("follow_up_settings")
      .select("sequences_halted")
      .eq("org_id", job.org_id)
      .maybeSingle();
    if (settings?.sequences_halted) {
      await db
        .from("follow_up_jobs")
        .update({ status: "dead", last_error: "sequence_halted:org_stop", processed_at: new Date().toISOString() })
        .eq("id", job.id);
      return;
    }
    if (job.sequence_run_id) {
      const { data: run } = await db
        .from("follow_up_sequence_runs")
        .select("id, status, max_until, max_steps")
        .eq("id", job.sequence_run_id)
        .maybeSingle();
      if (!run || run.status !== "active") {
        await db
          .from("follow_up_jobs")
          .update({ status: "dead", last_error: "sequence_inactive", processed_at: new Date().toISOString() })
          .eq("id", job.id);
        return;
      }
      if (new Date(run.max_until).getTime() <= Date.now()) {
        await db
          .from("follow_up_sequence_runs")
          .update({
            status: "halted",
            halt_reason: "max_duration",
            halted_at: new Date().toISOString(),
          })
          .eq("id", run.id)
          .eq("status", "active");
        await db
          .from("follow_up_jobs")
          .update({ status: "dead", last_error: "sequence_halted:max_duration", processed_at: new Date().toISOString() })
          .eq("id", job.id);
        return;
      }
      if (job.sequence_position > run.max_steps) {
        await db
          .from("follow_up_sequence_runs")
          .update({
            status: "halted",
            halt_reason: "max_length",
            halted_at: new Date().toISOString(),
          })
          .eq("id", run.id)
          .eq("status", "active");
        await db
          .from("follow_up_jobs")
          .update({ status: "dead", last_error: "sequence_halted:max_length", processed_at: new Date().toISOString() })
          .eq("id", job.id);
        return;
      }
    }
  }

  const generated = await generateDraft(db, job);

  await db
    .from("follow_up_jobs")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
      draft_id: generated.draftId,
    })
    .eq("id", job.id);

  followUpLog("follow_up.generated", {
    jobId: job.id,
    draftId: generated.draftId,
    branch: job.branch,
    channel: job.channel,
    model: generated.model,
    lowConfidence: generated.lowConfidence,
    attempt: generated.attempt,
  });
}

async function generateDraft(
  db: GhlDb,
  job: {
    id: string;
    org_id: string;
    lead_id: string;
    call_id: string;
    extraction_id: string | null;
    sequence_run_id: string | null;
    sequence_position: number;
    branch: FollowUpBranch;
    channel: FollowUpChannel | Enums<"touch_channel">;
    operator_instruction: string | null;
    requested_by_member_id: string | null;
    draft_id: string | null;
  }
): Promise<{ draftId: string; model: string; lowConfidence: boolean; attempt: number }> {
  const channel: FollowUpChannel = job.channel === "email" ? "email" : "sms";
  const { data: call } = await db
    .from("calls")
    .select("id, outcome, occurred_at, scheduled_at, raw_transcript")
    .eq("id", job.call_id)
    .eq("org_id", job.org_id)
    .maybeSingle();
  const { data: lead } = await db
    .from("leads")
    .select("id, first_name, source, offer_name, status")
    .eq("id", job.lead_id)
    .eq("org_id", job.org_id)
    .maybeSingle();
  const { data: extraction } = await db
    .from("call_extractions")
    .select("*")
    .eq("call_id", job.call_id)
    .maybeSingle();
  const { data: settings } = await db
    .from("follow_up_settings")
    .select("draft_stale_days")
    .eq("org_id", job.org_id)
    .maybeSingle();
  if (!call?.raw_transcript || !lead || !extraction) throw new Error("missing_extraction");

  const voice = await loadVoice(db, job.org_id);
  const quotes = asQuotes(extraction.quotes);
  const { count: noShowCount } = await db
    .from("calls")
    .select("id", { count: "exact", head: true })
    .eq("org_id", job.org_id)
    .eq("lead_id", job.lead_id)
    .eq("outcome", "no_show");

  const { data: objections } = await db
    .from("objections")
    .select("verbatim, resolved, call_id")
    .eq("org_id", job.org_id)
    .eq("lead_id", job.lead_id)
    .eq("resolved", false)
    .neq("call_id", job.call_id);

  const { data: touches } = await db
    .from("touches")
    .select("occurred_at, channel, direction, type")
    .eq("org_id", job.org_id)
    .eq("lead_id", job.lead_id)
    .order("occurred_at", { ascending: false })
    .limit(8);

  const { data: score } = await db
    .from("readiness_scores")
    .select("total, reasoning")
    .eq("org_id", job.org_id)
    .eq("lead_id", job.lead_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const model = anthropicDraftModel();
  assertFrontierDraftModel(model);

  const promptInput = {
    branch: job.branch,
    channel,
    voice,
    noShowCount: noShowCount ?? 0,
    sequencePosition: job.sequence_position,
    operatorInstruction: job.operator_instruction,
    previousFailure: null as string | null,
    lead: {
      firstName: lead.first_name,
      source: lead.source,
      offerName: lead.offer_name,
    },
    extraction: {
      summary: extraction.summary,
      statedObjection: extraction.stated_objection,
      statedObjectionState: extraction.stated_objection_state,
      budgetSignal: extraction.budget_signal,
      budgetState: extraction.budget_signal_state,
      timelineSignal: extraction.timeline_signal,
      timelineState: extraction.timeline_signal_state,
      decisionProcess: extraction.decision_process,
      decisionState: extraction.decision_process_state,
      nextStep: extraction.next_step_agreed,
      nextStepState: extraction.next_step_state,
      quotes,
    },
    priorOpenObjections: (objections ?? []).map((item) => item.verbatim).filter(Boolean),
    readiness: { total: score?.total ?? null, reasoning: score?.reasoning ?? null },
    priorTouches: (touches ?? []).map((item) => ({
      at: item.occurred_at,
      channel: item.channel,
      direction: item.direction,
      type: item.type,
    })),
  };

  let attempt = 1;
  let lowConfidence = false;
  let lowConfidenceReason: string | null = null;
  let failures: QualityFailure[] = [];
  let parsed = { body: "", subject: null as string | null, quotesUsed: [] as string[] };
  let usedModel = model;

  while (attempt <= 2) {
    const message = await createAnthropicMessage({
      system: DRAFT_SYSTEM_PROMPT,
      user: draftUserPrompt({ ...promptInput, previousFailure: promptInput.previousFailure }),
      model,
      maxTokens: channel === "sms" ? 800 : 1600,
      timeoutMs: 90_000,
    });
    usedModel = message.model;
    parsed = parseDraftModelOutput(message.text, channel);
    const checked = checkDraftQuality({
      body: parsed.body,
      subject: parsed.subject,
      channel,
      transcript: call.raw_transcript,
      quotes: quotes.map((item) => item.text),
      statedObjection: extraction.stated_objection,
      nextStep: extraction.next_step_agreed,
      nextStepState: extraction.next_step_state,
      budgetState: extraction.budget_signal_state,
      timelineState: extraction.timeline_signal_state,
      decisionState: extraction.decision_process_state,
      voice,
    });
    if (checked.ok) {
      failures = [];
      lowConfidence = false;
      lowConfidenceReason = null;
      break;
    }
    failures = checked.failures;
    await logFailures(db, {
      orgId: job.org_id,
      branch: job.branch,
      attempt,
      failures,
      jobId: job.id,
      draftId: job.draft_id,
    });
    await recordEvent(db, {
      orgId: job.org_id,
      draftId: job.draft_id,
      sequenceRunId: job.sequence_run_id,
      kind: "quality_failed",
      payload: { attempt, types: failures.map((item) => item.type) },
    });
    if (attempt === 1) {
      promptInput.previousFailure = failures.map((item) => `${item.type}: ${item.detail}`).join("; ");
      attempt += 1;
      continue;
    }
    lowConfidence = true;
    lowConfidenceReason = failures.map((item) => `${item.type}: ${item.detail}`).join("; ");
    break;
  }

  const staleDays = settings?.draft_stale_days ?? 5;
  const expiresAt = new Date(Date.now() + staleDays * 86_400_000).toISOString();
  const quotesUsed = parsed.quotesUsed.filter((quote) =>
    quotes.some((item) => item.text === quote)
  );

  const row = {
    org_id: job.org_id,
    lead_id: job.lead_id,
    call_id: job.call_id,
    extraction_id: extraction.id,
    sequence_run_id: job.sequence_run_id,
    sequence_position: job.sequence_position,
    branch: job.branch,
    channel,
    status: "pending" as const,
    generated_body: parsed.body,
    generated_subject: parsed.subject,
    edited_body: parsed.body,
    edited_subject: parsed.subject,
    model_version: usedModel,
    generation_attempt: attempt,
    low_confidence: lowConfidence,
    low_confidence_reason: lowConfidenceReason,
    quality_failures: failures as unknown as Json,
    quotes_used: quotesUsed as unknown as Json,
    expires_at: expiresAt,
    operator_instruction: job.operator_instruction,
    approved_at: null,
    approved_by_member_id: null,
    dispatch_id: null,
    touch_id: null,
    sent_at: null,
    sent_body: null,
    failure_reason: null,
  };

  let draftId = job.draft_id;
  if (draftId) {
    const { error } = await db.from("follow_up_drafts").update(row).eq("id", draftId).eq("org_id", job.org_id);
    if (error) throw new Error("draft_update_failed");
  } else {
    const { data: inserted, error } = await db.from("follow_up_drafts").insert(row).select("id").maybeSingle();
    if (error || !inserted) throw new Error("draft_insert_failed");
    draftId = inserted.id;
  }

  await recordEvent(db, {
    orgId: job.org_id,
    draftId,
    sequenceRunId: job.sequence_run_id,
    kind: job.operator_instruction ? "regenerated" : "generated",
    actorMemberId: job.requested_by_member_id,
    payload: { model: usedModel, attempt, lowConfidence, branch: job.branch, channel },
  });

  return { draftId, model: usedModel, lowConfidence, attempt };
}

async function failFollowUpJob(db: GhlDb, jobId: string, cause: unknown) {
  const { data: job } = await db
    .from("follow_up_jobs")
    .select("id, attempt_count")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;
  const reason = cause instanceof Error ? cause.message : "process_failed";
  const safe = reason.slice(0, 120);
  const dead = shouldMarkDead(job.attempt_count, FOLLOW_UP_MAX_ATTEMPTS);
  await db
    .from("follow_up_jobs")
    .update({
      status: dead ? "dead" : "pending",
      last_error: safe,
      next_attempt_at: dead ? new Date().toISOString() : nextAttemptAt(job.attempt_count),
    })
    .eq("id", jobId);
  followUpWarn("follow_up.failed", { jobId, dead, reason: safe });
}

export async function enqueueSequenceStep(
  db: GhlDb,
  args: {
    orgId: string;
    leadId: string;
    callId: string;
    extractionId: string | null;
    sequenceRunId: string;
    position: number;
    branch: FollowUpBranch;
    channel: FollowUpChannel;
    delayHours: number;
    callAt: string | null;
  }
): Promise<void> {
  const { data: settings } = await db
    .from("follow_up_settings")
    .select("sequences_halted, max_sequence_length")
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (settings?.sequences_halted) return;
  if (args.position > (settings?.max_sequence_length ?? 3)) {
    await db
      .from("follow_up_sequence_runs")
      .update({
        status: "halted",
        halt_reason: "max_length",
        halted_at: new Date().toISOString(),
      })
      .eq("id", args.sequenceRunId)
      .eq("status", "active");
    return;
  }

  const { data: run } = await db
    .from("follow_up_sequence_runs")
    .select("status, max_until, max_steps")
    .eq("id", args.sequenceRunId)
    .maybeSingle();
  if (!run || run.status !== "active") return;
  if (args.position > run.max_steps) return;
  if (new Date(run.max_until).getTime() <= Date.now()) {
    await db
      .from("follow_up_sequence_runs")
      .update({
        status: "halted",
        halt_reason: "max_duration",
        halted_at: new Date().toISOString(),
      })
      .eq("id", args.sequenceRunId)
      .eq("status", "active");
    return;
  }

  const base = args.callAt ? Date.parse(args.callAt) : Date.now();
  const nextAttempt = new Date(base + args.delayHours * 3_600_000);
  const when = nextAttempt.getTime() < Date.now() ? new Date() : nextAttempt;

  await db.from("follow_up_jobs").insert({
    org_id: args.orgId,
    lead_id: args.leadId,
    call_id: args.callId,
    extraction_id: args.extractionId,
    sequence_run_id: args.sequenceRunId,
    sequence_position: args.position,
    branch: args.branch,
    channel: args.channel,
    status: "pending",
    next_attempt_at: when.toISOString(),
  });
}
