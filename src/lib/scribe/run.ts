import "server-only";

import { requireConfig } from "@/lib/config/server";
import { presentSignalText, parseExtraction } from "@/lib/extraction/parse";
import { nextAttemptAt, shouldMarkDead } from "@/lib/ghl/retry";
import type { GhlDb } from "@/lib/ghl/tokens";
import { automationAllowed } from "@/lib/inbound/holds";
import { agentMayRun, startRun, type RunRecorder, type StepHandle } from "@/lib/live/record";
import { notifyDaAlert } from "@/lib/ops/alerts";
import { scoreLeadFromCall } from "@/lib/scoring/call";
import { analyzeCase, type Analysis } from "@/lib/scribe/analyze";
import { bandForScore, readBands } from "@/lib/scribe/bands";
import { extractCall, type ExtractCallResult } from "@/lib/scribe/extract";
import { planFieldWrites, type ExistingField, type ExtractedFact } from "@/lib/scribe/merge";
import { findSpokenOptOut } from "@/lib/scribe/optout";
import { passagesForPrompt, splitPassages, type Passage } from "@/lib/scribe/passages";
import { parseFacts, parseOpenQuestions, parseSensitive, quoteGrounding, readCaseFacts } from "@/lib/scribe/prompt";
import { ProviderUnavailable } from "@/lib/scribe/provider";
import { SENSITIVE_LABELS, findSensitive, type SensitiveCategory } from "@/lib/scribe/safety";
import { embedPassages, retrieveEarlier, scribeDb, storePassages, type Untyped } from "@/lib/scribe/store";
import { EXTRACTION_MAX_ATTEMPTS, TRANSCRIPT_HEAD_CHARS, TRANSCRIPT_TAIL_CHARS } from "@/lib/transcripts/constants";
import { transcriptError, transcriptLog, transcriptWarn } from "@/lib/transcripts/log";
import { sanitizeError } from "@/lib/transcripts/process";
import { EXTRACTION_VERIFIER_SYSTEM, checkExtractionDeterministic, extractionVerifierUser } from "@/lib/verification/extraction-det";
import { runBoundedVerification } from "@/lib/verification/engine";
import { formatFaultsForRetry } from "@/lib/verification/faults";
import { runModelVerifier, skippedVerifier } from "@/lib/verification/model";
import { persistBoundedVerification, taskVerificationEnabled } from "@/lib/verification/record";
import { extractionJsonForVerifier, rawQuotesFromModelJson } from "@/lib/verification/serialize";
import { logWorkspaceActivity } from "@/lib/workspaces/activity";
import type { Json } from "@/types/database";
import type { ParsedExtraction } from "@/lib/transcripts/types";

/**
 * Scribe: reads a call and keeps the lead's case file. Takes over extraction
 * jobs (the call_extractions row, objections, and score are still written for
 * everything that reads them) and records every stage on the shared record.
 *
 * Scribe never contacts a lead and never writes to the CRM. Transcript text
 * stays out of step labels, events, logs, and errors.
 */

export const SCRIBE_PLAN = [
  "Reading the call transcript",
  "Checking for an opt-out or a sensitive situation",
  "Pulling out the facts this business tracks",
  "Checking every quote against the transcript",
  "Scoring readiness",
  "Looking back at earlier calls",
  "Writing the case file",
  "Handing off to Relay and coaching",
];

const WORKSPACE_RECHECK_MS = 6 * 60 * 60_000;
const PAUSED_RECHECK_MS = 30 * 60_000;
const PROVIDER_RECHECK_MS = 15 * 60_000;

export async function processScribeQueue(db: GhlDb, max = 10): Promise<{ jobs: number; failed: number; waiting: number }> {
  const raw = db as unknown as Untyped;
  let jobs = 0;
  let failed = 0;
  let waiting = 0;
  for (let i = 0; i < max; i += 1) {
    const { data: id, error } = await raw.rpc("scribe_claim_job");
    if (error) {
      transcriptError("scribe.claim_failed", { code: error.code });
      break;
    }
    if (!id) break;
    try {
      const outcome = await runScribeJob(db, String(id));
      if (outcome === "waiting_provider") {
        waiting += 1;
        // Every other job would hit the same outside service; stop for this pass.
        break;
      }
      jobs += 1;
    } catch (cause) {
      failed += 1;
      await failJob(db, String(id), cause);
    }
  }
  return { jobs, failed, waiting };
}

type Outcome = "done" | "deferred" | "waiting_provider" | "held" | "opted_out";

async function defer(db: GhlDb, jobId: string, ms: number, lastError?: string) {
  await db
    .from("extraction_jobs")
    .update({
      status: "pending",
      next_attempt_at: new Date(Date.now() + ms).toISOString(),
      ...(lastError ? { last_error: lastError } : {}),
    })
    .eq("id", jobId);
}

export async function runScribeJob(db: GhlDb, jobId: string): Promise<Outcome> {
  const { data: job } = await db
    .from("extraction_jobs")
    .select("id, org_id, call_id, attempt_count, requested_by_member_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return "deferred";

  if (!(await automationAllowed(db, job.org_id))) {
    await defer(db, job.id, WORKSPACE_RECHECK_MS);
    return "deferred";
  }
  const may = await agentMayRun(job.org_id, "scribe");
  if (!may.ok) {
    await defer(db, job.id, may.reason === "paused" ? PAUSED_RECHECK_MS : WORKSPACE_RECHECK_MS, may.reason === "paused" ? "scribe_paused" : undefined);
    return "deferred";
  }
  const gate = await requireConfig(db, job.org_id, "extraction");
  if (!gate.ok) {
    await defer(db, job.id, WORKSPACE_RECHECK_MS, `config_incomplete: ${gate.reason}`);
    return "deferred";
  }
  const values = gate.config.values as Record<string, unknown>;

  await db.from("extraction_jobs").update({ attempt_count: job.attempt_count + 1, config_version: gate.config.version }).eq("id", job.id);

  const { data: call } = await db
    .from("calls")
    .select("id, org_id, lead_id, raw_transcript, type, occurred_at, scheduled_at")
    .eq("id", job.call_id)
    .eq("org_id", job.org_id)
    .maybeSingle();
  if (!call?.raw_transcript) throw new Error("empty_transcript");
  const transcript = call.raw_transcript;

  const raw = scribeDb();
  const [{ data: lead }, { data: members }, { data: org }] = await Promise.all([
    db.from("leads").select("id, first_name, last_name").eq("id", call.lead_id).eq("org_id", call.org_id).maybeSingle(),
    db.from("org_members").select("display_name").eq("org_id", call.org_id).eq("active", true),
    db.from("organizations").select("name").eq("id", call.org_id).maybeSingle(),
  ]);
  const leadName = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ").trim() || "a lead";

  const recorder = await startRun({
    orgId: call.org_id,
    agentId: "scribe",
    triggerKey: `call:${call.id}:job:${job.id}`,
    subjectLabel: `Call with ${leadName}`,
    subjectHref: `/app/cases/${call.lead_id}`,
    leadId: call.lead_id,
    actorMemberId: job.requested_by_member_id ?? null,
    plan: SCRIBE_PLAN,
    configVersion: gate.config.version,
    sources: [
      { kind: "call", label: "The call transcript", href: `/app/calls/${call.id}` },
      { kind: "configuration", label: "Case-file facts and score bands" },
    ],
  });
  await recorder.begin();

  let current: StepHandle | null = null;
  try {
    return await scribeStages({
      db,
      raw,
      recorder,
      job,
      call: { ...call, raw_transcript: transcript },
      values,
      configVersion: gate.config.version,
      leadName,
      hints: {
        prospectNames: [lead?.first_name, lead?.last_name, leadName].filter((v): v is string => !!v),
        teamNames: [
          org?.name,
          values["identity.display_name"],
          values["identity.business_name"],
          ...((members ?? []) as Array<{ display_name: string }>).map((m) => m.display_name),
        ].filter((v): v is string => typeof v === "string" && v.length > 1),
      },
      onStep: (step) => {
        current = step;
      },
    });
  } catch (cause) {
    const open = current as StepHandle | null;
    if (cause instanceof ProviderUnavailable) {
      await open?.wait("Waiting on an outside service. Scribe will continue on its own.");
      await recorder.waitingOnProvider(cause.message);
      await db
        .from("extraction_jobs")
        .update({
          status: "pending",
          attempt_count: job.attempt_count,
          last_error: "provider_unavailable",
          next_attempt_at: new Date(Date.now() + PROVIDER_RECHECK_MS).toISOString(),
        })
        .eq("id", job.id);
      transcriptWarn("scribe.waiting_provider", { jobId: job.id, provider: cause.provider, status: cause.status });
      return "waiting_provider";
    }
    await open?.fail("This step did not finish.");
    await recorder.fail(
      "Scribe could not finish reading this call. It will try again; nothing about the lead was changed by this attempt.",
      cause instanceof Error ? cause.message.slice(0, 400) : "unknown"
    );
    throw cause;
  }
}

type StageInput = {
  db: GhlDb;
  raw: Untyped;
  recorder: RunRecorder;
  job: { id: string; org_id: string; call_id: string; attempt_count: number };
  call: { id: string; org_id: string; lead_id: string; raw_transcript: string; type: string | null; occurred_at: string | null; scheduled_at: string | null };
  values: Record<string, unknown>;
  configVersion: string;
  leadName: string;
  hints: { prospectNames: string[]; teamNames: string[] };
  onStep: (step: StepHandle) => void;
};

async function scribeStages(input: StageInput): Promise<Outcome> {
  const { db, raw, recorder, call, values, configVersion } = input;
  const transcript = call.raw_transcript;
  const step = async (index: number, detail?: string) => {
    const handle = await recorder.step(SCRIBE_PLAN[index], { detail: detail ?? null });
    input.onStep(handle);
    return handle;
  };

  // 1. Passages
  let s = await step(0);
  const passages = splitPassages(transcript, input.hints);
  if (passages.length === 0) throw new Error("empty_transcript");
  const passageIds = await storePassages(raw, { orgId: call.org_id, callId: call.id, leadId: call.lead_id, passages });
  const caseFile = await ensureCaseFile(raw, call.org_id, call.lead_id);
  const count = (who: Passage["speaker"]) => passages.filter((p) => p.speaker === who).length;
  const unknownShare = count("unknown") / passages.length;
  await s.done({
    detail: `${passages.length} passages: ${count("prospect")} from the lead, ${count("team")} from the team${count("unknown") ? `, ${count("unknown")} unclear` : ""}.`,
  });

  // 2. Opt-out and safety (before any model sees the call)
  s = await step(1);
  const optOut = findSpokenOptOut(passages, (values["compliance.opt_out_words"] as string[] | undefined) ?? []);
  const sensitive = findSensitive(passages);
  if (optOut) await applySpokenOptOut(db, raw, { orgId: call.org_id, leadId: call.lead_id, word: optOut.word, configVersion });
  await s.done({
    detail: optOut
      ? `The lead asked on this call not to be contacted (passage ${optOut.seq}). Recorded the opt-out and discarded pending drafts.`
      : sensitive.length
        ? "Found something a person should review first. The case file will be held."
        : "No opt-out and nothing sensitive.",
  });

  // 3. Extraction
  s = await step(2);
  const facts = readCaseFacts(values["industry.case_facts"]);
  const objectionLabels = Array.isArray(values["industry.objections"])
    ? (values["industry.objections"] as Array<Record<string, unknown>>).map((o) => String(o.label ?? "")).filter(Boolean)
    : [];
  const window = passagesForPrompt(passages, TRANSCRIPT_HEAD_CHARS, TRANSCRIPT_TAIL_CHARS);
  const businessDescription = String(values["industry.business_description"] ?? "a business");
  const modelVerify = await taskVerificationEnabled("extraction");
  type Attempt = { parsed: ParsedExtraction; result: ExtractCallResult; rawQuotes: Array<{ text: string; topic: string }> };
  let inputTokens = 0;
  let outputTokens = 0;
  let lastJson: unknown = null;
  const bounded = await runBoundedVerification<Attempt>({
    generate: async (_attempt, previousFaults) => {
      const result = await extractCall({
        businessDescription,
        facts,
        objectionLabels,
        passagesText: window.text,
        truncated: window.truncated,
        constraints: previousFaults.length
          ? `\n\nA previous reading had these faults. Fix them. Do not explain how you read.\n${formatFaultsForRetry(previousFaults)}`
          : "",
      });
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      lastJson = result.json;
      return { parsed: parseExtraction(result.json, transcript), result, rawQuotes: rawQuotesFromModelJson(result.json) };
    },
    deterministic: (output) => checkExtractionDeterministic({ extraction: output.parsed, transcript, rawQuotes: output.rawQuotes }),
    modelVerify: async (output) => {
      if (!modelVerify) return skippedVerifier("disabled");
      return runModelVerifier({
        system: EXTRACTION_VERIFIER_SYSTEM,
        user: extractionVerifierUser(transcript, extractionJsonForVerifier(output.parsed)),
        includeEmbarrassment: false,
      });
    },
  });
  const parsed = bounded.output.parsed;
  const extraction = bounded.output.result;
  const json = lastJson ?? extraction.json;
  const extractedFacts = parseFacts(json, facts, passages, passageIds);
  const openFromCall = parseOpenQuestions(json);
  const modelSensitive = parseSensitive(json);
  recorder.noteStaff("extraction", {
    provider: extraction.provider,
    model: extraction.model,
    fallback: extraction.fallbackReason,
    attempts: bounded.attempt,
    inputTokens,
    outputTokens,
  });
  const present = extractedFacts.filter((f) => f.state === "present").length;
  await s.done({
    detail: `${present} of ${extractedFacts.length} facts found, ${parsed.objections.length} objection${parsed.objections.length === 1 ? "" : "s"}.`,
    sources: [{ kind: "transcript", label: "The call transcript", href: `/app/calls/${call.id}` }],
  });

  // 4. Grounding
  s = await step(3);
  const grounding = quoteGrounding(extractedFacts, transcript);
  const verificationStatus = bounded.finalState === "passed" ? "passed" : "needs_review";
  const extractionId = await writeExtraction(db, {
    call,
    parsed,
    model: extraction.model,
    inputTokens,
    outputTokens,
    verificationStatus,
    faults: bounded.faults,
    attempt: bounded.attempt,
  });
  if (extractionId) {
    await persistBoundedVerification({ orgId: call.org_id, task: "extraction", subjectType: "call_extraction", subjectId: extractionId, result: bounded });
  }
  await s.done({
    detail: `${grounding.grounded} of ${grounding.quoted} quotes found word for word.${verificationStatus === "needs_review" ? " Some parts need a person to check." : ""}`,
  });

  // 5. Score and band
  s = await step(4);
  const scored = await scoreLeadFromCall(db, {
    orgId: call.org_id,
    leadId: call.lead_id,
    callId: call.id,
    extractionId,
    callType: call.type as never,
    callAt: call.occurred_at ?? call.scheduled_at,
    signals: {
      timeline_signal: presentSignalText(parsed.timelineSignal),
      budget_signal: presentSignalText(parsed.budgetSignal),
      decision_process: presentSignalText(parsed.decisionProcess),
    },
  });
  if (scored.written === false && scored.reason === "db") throw new Error("score_write_failed");
  const { data: latest } = await db
    .from("readiness_scores")
    .select("total")
    .eq("org_id", call.org_id)
    .eq("lead_id", call.lead_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const score = latest?.total == null ? null : Math.round(Number(latest.total));
  const band = bandForScore(score, readBands(values["qualification.scoring_bands"]));
  await s.done({ detail: score == null ? "Not enough to score yet." : `Readiness ${score}${band ? `, ${band.name}` : ""}.` });

  // 6. Earlier calls (retrieval stays inside this workspace and this lead)
  s = await step(5);
  let embedded = false;
  try {
    const rows = [...passageIds.entries()].map(([seq, id]) => ({
      id,
      org_id: call.org_id,
      call_id: call.id,
      lead_id: call.lead_id,
      body: passages[seq - 1]?.body ?? "",
    }));
    await embedPassages(raw, rows.filter((r) => r.body));
    embedded = true;
  } catch (cause) {
    recorder.noteStaff("embeddings", cause instanceof Error ? cause.message.slice(0, 200) : "failed");
  }
  const earlier = await retrieveEarlier(raw, {
    orgId: call.org_id,
    leadId: call.lead_id,
    callId: call.id,
    query: [parsed.summary, ...openFromCall].filter(Boolean).join(" "),
  });
  await s.done({
    detail:
      earlier.method === "none"
        ? "This is the first call on record for this lead."
        : `Used ${earlier.passages.length} passages from earlier calls with this lead.${embedded ? "" : " Search will improve once indexing catches up."}`,
  });

  // 7. Case file
  s = await step(6);
  let analysis: Analysis | null = null;
  try {
    analysis = await analyzeCase({
      businessDescription,
      values,
      facts: extractedFacts,
      callSummary: parsed.summary,
      agreedNextStep: presentSignalText(parsed.nextStepAgreed),
      score,
      band,
      earlier: earlier.passages,
      extractedQuestions: openFromCall,
    });
    recorder.noteStaff("analysis", { model: analysis.model, inputTokens: analysis.inputTokens, outputTokens: analysis.outputTokens });
  } catch (cause) {
    recorder.noteStaff("analysis_error", cause instanceof Error ? cause.message.slice(0, 200) : "failed");
  }
  const heldFor: SensitiveCategory | null = sensitive[0]?.category ?? modelSensitive;
  const reviewReasons: string[] = [];
  if (verificationStatus === "needs_review") reviewReasons.push("Some quotes or facts could not be checked against the transcript.");
  if (unknownShare > 0.5) reviewReasons.push("Scribe could not tell who was speaking for much of the call.");
  if (!analysis) reviewReasons.push("The summary is from this call only; the full write-up will follow.");
  const missingRequired = facts.filter((f) => f.required && extractedFacts.find((e) => e.key === f.key)?.state !== "present").map((f) => f.label);

  const written = await writeCaseFile(raw, {
    caseFileId: caseFile.id,
    previousStatus: caseFile.status,
    orgId: call.org_id,
    leadId: call.lead_id,
    callId: call.id,
    runId: recorder.id,
    configVersion,
    facts: extractedFacts,
    summary: analysis?.summary ?? parsed.summary,
    nextStep: analysis?.nextStep ?? presentSignalText(parsed.nextStepAgreed) ?? band?.next_step ?? null,
    readinessReason:
      analysis?.readinessReason ??
      (band ? `${band.meaning}${missingRequired.length ? ` Still missing: ${missingRequired.slice(0, 4).join(", ")}.` : ""}` : null),
    openQuestions: analysis?.openQuestions.length ? analysis.openQuestions : openFromCall,
    score,
    band,
    reviewReasons,
    heldReason: heldFor ? SENSITIVE_LABELS[heldFor] : null,
  });
  await recorder.output({
    kind: "summary",
    title: written.held ? "Case file held for review" : `Case file updated (version ${written.version})`,
    body: written.held ? "A person needs to look at this call before anything else happens." : (analysis?.summary ?? parsed.summary ?? null),
  });
  await s.done({
    detail: `${written.updated} field${written.updated === 1 ? "" : "s"} updated${written.review ? `, ${written.review} left as a person set ${written.review === 1 ? "it" : "them"}` : ""}.`,
    sources: [{ kind: "case_file", label: "Case file", href: `/app/cases/${call.lead_id}` }],
  });

  await db.from("extraction_jobs").update({ status: "processed", processed_at: new Date().toISOString(), last_error: null }).eq("id", input.job.id);

  // 8. Hand-offs
  s = await step(7);
  try {
    const { analyzeAndStoreCall } = await import("@/lib/coaching/persist");
    await analyzeAndStoreCall(db, call.id);
  } catch (cause) {
    transcriptError("call_quality.analyze_failed", { callId: call.id, reason: cause instanceof Error ? cause.message.slice(0, 80) : "analyze_failed" });
  }

  const { data: contactFlag } = await db.from("leads").select("do_not_contact").eq("id", call.lead_id).eq("org_id", call.org_id).maybeSingle();
  if (optOut || contactFlag?.do_not_contact) {
    await s.skip(
      optOut
        ? "The lead opted out on this call, so Relay will not draft a follow-up."
        : "This lead is marked do not contact, so Relay will not draft a follow-up."
    );
    await recorder.finish({
      reason: optOut
        ? `Case file updated. ${input.leadName} asked not to be contacted; no follow-up will be drafted.`
        : `Case file updated. ${input.leadName} is marked do not contact; no follow-up will be drafted.`,
    });
    logDone(input, extraction);
    return "opted_out";
  }
  if (written.held && heldFor) {
    await s.skip("Held for a person to review. No follow-up until it is released.");
    await holdForReview(raw, recorder, { orgId: call.org_id, leadId: call.lead_id, leadName: input.leadName, category: heldFor });
    logDone(input, extraction);
    return "held";
  }
  try {
    const { enqueueFollowUpAfterExtraction } = await import("@/lib/follow-up/generate");
    await enqueueFollowUpAfterExtraction(db, { orgId: call.org_id, leadId: call.lead_id, callId: call.id, extractionId });
    await s.done({ detail: "Relay can now draft a follow-up. Every draft waits for approval." });
  } catch (cause) {
    transcriptError("follow_up.enqueue_failed", { callId: call.id, reason: cause instanceof Error ? cause.message.slice(0, 80) : "enqueue_failed" });
    await s.done({ detail: "Coaching is updated. Relay will pick this up on its next pass." });
  }
  await recorder.finish({
    reason: `Case file for ${input.leadName} updated${band ? `: ${band.name}` : ""}.${written.review ? " Some changes are waiting for a person." : ""}`,
  });
  logDone(input, extraction);
  return "done";
}

function logDone(input: StageInput, extraction: ExtractCallResult) {
  transcriptLog("scribe.processed", { jobId: input.job.id, callId: input.call.id, provider: extraction.provider, model: extraction.model });
}

async function ensureCaseFile(raw: Untyped, orgId: string, leadId: string): Promise<{ id: string; status: string; version: number }> {
  await raw.from("case_files").upsert({ org_id: orgId, lead_id: leadId }, { onConflict: "org_id,lead_id", ignoreDuplicates: true });
  const { data, error } = await raw.from("case_files").select("id, status, version").eq("org_id", orgId).eq("lead_id", leadId).single();
  if (error || !data) throw new Error("process_failed");
  if (data.status !== "held") {
    await raw.from("case_files").update({ status: "building", updated_at: new Date().toISOString() }).eq("id", data.id);
  }
  return data as { id: string; status: string; version: number };
}

async function writeExtraction(
  db: GhlDb,
  args: {
    call: StageInput["call"];
    parsed: ParsedExtraction;
    model: string;
    inputTokens: number;
    outputTokens: number;
    verificationStatus: string;
    faults: unknown;
    attempt: number;
  }
): Promise<string | null> {
  const { call, parsed } = args;
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
    model_version: args.model,
    extracted_at: new Date().toISOString(),
    input_tokens: args.inputTokens,
    output_tokens: args.outputTokens,
    verification_status: args.verificationStatus,
    verification_faults: args.faults as Json,
    verification_attempt: args.attempt,
  };
  const { data: existing } = await db.from("call_extractions").select("id").eq("call_id", call.id).maybeSingle();
  let extractionId = existing?.id ?? null;
  if (existing) {
    const { error } = await db.from("call_extractions").update(row).eq("id", existing.id);
    if (error) throw new Error("process_failed");
  } else {
    const { data: inserted, error } = await db.from("call_extractions").insert(row).select("id").maybeSingle();
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
    model_version: args.model,
    input_tokens: args.inputTokens,
    output_tokens: args.outputTokens,
  });
  return extractionId;
}

async function writeCaseFile(
  raw: Untyped,
  args: {
    caseFileId: string;
    previousStatus: string;
    orgId: string;
    leadId: string;
    callId: string;
    runId: string;
    configVersion: string;
    facts: ExtractedFact[];
    summary: string | null;
    nextStep: string | null;
    readinessReason: string | null;
    openQuestions: string[];
    score: number | null;
    band: { name: string; meaning: string } | null;
    reviewReasons: string[];
    heldReason: string | null;
  }
): Promise<{ version: number; updated: number; review: number; held: boolean }> {
  const { data: existingRows } = await raw
    .from("case_file_fields")
    .select("field_key, value, state, source, locked")
    .eq("case_file_id", args.caseFileId)
    .eq("org_id", args.orgId);
  const plan = planFieldWrites((existingRows ?? []) as ExistingField[], args.facts);
  let updated = 0;
  let review = 0;
  for (const write of plan) {
    if (write.kind === "keep") continue;
    if (write.kind === "scribe") {
      const { error } = await raw.from("case_file_fields").upsert(
        {
          org_id: args.orgId,
          case_file_id: args.caseFileId,
          lead_id: args.leadId,
          field_key: write.fact.key,
          label: write.fact.label,
          value: write.fact.value,
          state: write.fact.state,
          quote: write.fact.quote,
          passage_ids: write.fact.passageIds,
          source: "scribe",
          scribe_value: null,
          review_note: null,
        },
        { onConflict: "case_file_id,field_key" }
      );
      if (error) throw new Error("process_failed");
      updated += 1;
    } else {
      await raw
        .from("case_file_fields")
        .update({ scribe_value: write.fact.value, review_note: write.note, label: write.fact.label })
        .eq("case_file_id", args.caseFileId)
        .eq("field_key", write.fact.key);
      review += 1;
    }
  }

  const held = args.previousStatus === "held" || !!args.heldReason;
  const status = held ? "held" : args.reviewReasons.length || review ? "needs_review" : "ready";
  const { data: current } = await raw.from("case_files").select("version").eq("id", args.caseFileId).single();
  const version = Number((current as { version?: number } | null)?.version ?? 0) + 1;
  const content = {
    summary: args.summary,
    next_step: args.nextStep,
    readiness_reason: args.readinessReason,
    score: args.score,
    band: args.band?.name ?? null,
    open_questions: args.openQuestions,
    facts: args.facts.map((f) => ({ key: f.key, state: f.state, value: f.value })),
  };
  const { error } = await raw
    .from("case_files")
    .update({
      status,
      summary: args.summary,
      next_step: args.nextStep,
      readiness_reason: args.readinessReason,
      score: args.score,
      band: args.band?.name ?? null,
      band_meaning: args.band?.meaning ?? null,
      open_questions: args.openQuestions,
      review_reasons: args.reviewReasons,
      ...(args.heldReason ? { held_reason: args.heldReason } : {}),
      version,
      last_call_id: args.callId,
      last_run_id: args.runId,
      config_version: args.configVersion,
      built_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.caseFileId)
    .eq("org_id", args.orgId);
  if (error) throw new Error("process_failed");
  await raw.from("case_file_versions").insert({
    org_id: args.orgId,
    case_file_id: args.caseFileId,
    lead_id: args.leadId,
    version,
    run_id: args.runId,
    call_id: args.callId,
    content,
  });
  return { version, updated, review, held };
}

/**
 * The lead said on the call they want no more contact. Same record as a texted
 * STOP: every channel stops, pending drafts are discarded, and pending
 * requests about the lead are dismissed.
 */
async function applySpokenOptOut(
  db: GhlDb,
  raw: Untyped,
  args: { orgId: string; leadId: string; word: string; configVersion: string }
): Promise<void> {
  const { error } = await db
    .from("lead_opt_outs")
    .upsert(
      { lead_id: args.leadId, org_id: args.orgId, word: args.word, channel: "call", config_version: args.configVersion },
      { onConflict: "lead_id", ignoreDuplicates: true }
    );
  if (error) throw new Error("opt_out_record_failed");
  await db
    .from("follow_up_drafts")
    .update({ status: "discarded", discarded_reason: "lead_opted_out" })
    .eq("org_id", args.orgId)
    .eq("lead_id", args.leadId)
    .eq("status", "pending");
  await raw
    .from("approval_items")
    .update({ status: "dismissed", dismiss_reason: "The lead asked on a call not to be contacted.", decided_at: new Date().toISOString() })
    .eq("org_id", args.orgId)
    .eq("status", "pending")
    .contains("lead_ids", [args.leadId]);
  await logWorkspaceActivity({
    actorUserId: null,
    orgId: args.orgId,
    action: "lead.opted_out",
    targetTable: "lead_opt_outs",
    targetId: args.leadId,
    detail: { channel: "call", agent: "scribe", config_version: args.configVersion },
  });
}

async function holdForReview(
  raw: Untyped,
  recorder: RunRecorder,
  args: { orgId: string; leadId: string; leadName: string; category: SensitiveCategory }
): Promise<void> {
  const prompt = `Review ${args.leadName}'s call before anything else happens`;
  const { data: item } = await raw
    .from("approval_items")
    .insert({
      org_id: args.orgId,
      kind: "scribe_hold",
      action_type: "agent_question",
      title: prompt,
      reason: `${SENSITIVE_LABELS[args.category]} Scribe held the case file. Approve to release it, or reject to keep it held.`,
      lead_ids: [args.leadId],
      run_id: recorder.id,
      agent_id: "scribe",
      urgency: 90,
      dedupe_key: `scribe_hold:${recorder.id}`,
    })
    .select("id")
    .maybeSingle();
  await notifyDaAlert({
    kind: "scribe_sensitive_hold",
    title: "Scribe held a case file for review",
    checkFirst: "Open the run from Agent Health. The transcript is not included here.",
    severity: "high",
    orgId: args.orgId,
    detail: { runId: recorder.id, category: args.category },
  });
  const itemId = (item as { id?: string } | null)?.id ?? null;
  if (!itemId) {
    await recorder.finish({ status: "needs_person", reason: "Held for a person to review. No follow-up until it is released." });
    return;
  }
  await recorder.needPerson({
    kind: "approval",
    prompt,
    approvalItemId: itemId,
    whoCanAct: "Owners, approvers, and the Vistrial team",
  });
}

async function failJob(db: GhlDb, jobId: string, cause: unknown) {
  const { data: job } = await db.from("extraction_jobs").select("id, attempt_count").eq("id", jobId).maybeSingle();
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
  transcriptWarn("scribe.failed", { jobId, dead, reason });
}
