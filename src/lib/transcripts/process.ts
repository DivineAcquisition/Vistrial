import "server-only";

import { nextAttemptAt, shouldMarkDead } from "@/lib/ghl/retry";
import { EXTRACTION_MAX_ATTEMPTS, TRANSCRIPT_MATCH_WINDOW_MS } from "@/lib/transcripts/constants";
import { transcriptError, transcriptLog, transcriptWarn } from "@/lib/transcripts/log";
import { matchTranscriptToCall, type MatchableCall, type MatchableLead } from "@/lib/transcripts/match";
import { normalizeTranscript } from "@/lib/transcripts/normalize";
import type { NormalizedTranscript, TranscriptSource } from "@/lib/transcripts/types";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { Database } from "@/types/database";

type WebhookRow = Database["public"]["Tables"]["webhook_events"]["Row"];

export async function processTranscriptWebhookQueue(db: GhlDb, max = 20): Promise<{
  events: number;
  failed: number;
}> {
  let events = 0;
  let failed = 0;
  for (let i = 0; i < max; i += 1) {
    const { data: id, error } = await db.rpc("claim_transcript_webhook");
    if (error) {
      transcriptError("transcript.process.claim_failed", { code: error.code });
      break;
    }
    if (!id) break;
    const { data: event } = await db.from("webhook_events").select("*").eq("id", id).maybeSingle();
    if (!event) continue;
    try {
      await processOneTranscriptEvent(db, event);
      events += 1;
    } catch (cause) {
      failed += 1;
      await markEventFailure(db, event, cause);
    }
  }
  return { events, failed };
}

export async function processOneTranscriptEvent(db: GhlDb, event: WebhookRow): Promise<void> {
  const source = sourceFromEventType(event.event_type);
  if (!source) throw new Error("unsupported_source");
  if (!event.org_id) throw new Error("unresolved_org");

  const normalized = normalizeTranscript(source, event.payload);
  if (!normalized.ok) {
    await markProcessed(db, event.id, `normalize_${normalized.reason}`);
    transcriptLog("transcript.process.skipped", { reason: normalized.reason, eventId: event.id });
    return;
  }

  const { calls, leads } = await loadMatchCandidates(db, event.org_id, normalized.value);

  const match = matchTranscriptToCall({
    transcript: normalized.value,
    calls,
    leads,
  });

  if (match.kind === "unmatched") {
    await insertUnmatched(db, event, normalized.value);
    await markProcessed(db, event.id, null);
    transcriptLog("transcript.process.unmatched", { eventId: event.id, orgId: event.org_id });
    return;
  }

  await attachTranscriptToCall(db, {
    orgId: event.org_id,
    callId: match.callId,
    transcript: normalized.value,
  });
  await markProcessed(db, event.id, null);
  transcriptLog("transcript.process.matched", {
    eventId: event.id,
    method: match.method,
    callId: match.callId,
  });
}

export async function attachTranscriptToCall(
  db: GhlDb,
  args: {
    orgId: string;
    callId: string;
    transcript: NormalizedTranscript;
    replace?: boolean;
  }
): Promise<{ attached: boolean }> {
  const { data: existing } = await db
    .from("calls")
    .select("id, raw_transcript, lead_id, occurred_at, duration_seconds")
    .eq("id", args.callId)
    .eq("org_id", args.orgId)
    .maybeSingle();

  if (!existing) return { attached: false };

  if (existing.raw_transcript && !args.replace) {
    return { attached: false };
  }

  const { error } = await db
    .from("calls")
    .update({
      raw_transcript: args.transcript.transcript,
      transcript_source: args.transcript.source,
      transcript_arrived_at: new Date().toISOString(),
      transcript_provider_id: args.transcript.providerCallId,
      duration_seconds: existing.duration_seconds ?? args.transcript.durationSeconds,
      occurred_at: existing.occurred_at ?? args.transcript.occurredAt,
      recording_url: null,
    })
    .eq("id", args.callId)
    .eq("org_id", args.orgId);

  if (error) throw new Error("transcript_attach_failed");

  await enqueueExtraction(db, args.orgId, args.callId);
  return { attached: true };
}

export async function enqueueExtraction(
  db: GhlDb,
  orgId: string,
  callId: string,
  requestedByMemberId?: string | null
): Promise<void> {
  const { error } = await db.from("extraction_jobs").insert({
    org_id: orgId,
    call_id: callId,
    status: "pending",
    requested_by_member_id: requestedByMemberId ?? null,
  });
  if (error?.code === "23505") return;
  if (error) throw new Error("extraction_enqueue_failed");
}

const CALL_MATCH_COLS = "id, lead_id, scheduled_at, occurred_at, transcript_provider_id, ghl_appointment_id, raw_transcript";

function toMatchableCall(row: {
  id: string;
  lead_id: string;
  scheduled_at: string | null;
  occurred_at: string | null;
  transcript_provider_id: string | null;
  ghl_appointment_id: string | null;
  raw_transcript: string | null;
}): MatchableCall {
  return {
    id: row.id,
    leadId: row.lead_id,
    scheduledAt: row.scheduled_at,
    occurredAt: row.occurred_at,
    transcriptProviderId: row.transcript_provider_id,
    ghlAppointmentId: row.ghl_appointment_id,
    hasTranscript: Boolean(row.raw_transcript),
  };
}

async function loadMatchCandidates(
  db: GhlDb,
  orgId: string,
  transcript: NormalizedTranscript
): Promise<{ calls: MatchableCall[]; leads: MatchableLead[] }> {
  const calls = new Map<string, MatchableCall>();
  const add = (rows: Array<Parameters<typeof toMatchableCall>[0]> | null | undefined) => {
    for (const row of rows ?? []) calls.set(row.id, toMatchableCall(row));
  };

  if (transcript.providerCallId) {
    const id = transcript.providerCallId;
    const [byProvider, byGhl] = await Promise.all([
      db.from("calls").select(CALL_MATCH_COLS).eq("org_id", orgId).eq("transcript_provider_id", id),
      db.from("calls").select(CALL_MATCH_COLS).eq("org_id", orgId).eq("ghl_appointment_id", id),
    ]);
    add(byProvider.data);
    add(byGhl.data);
  }

  const at = transcript.occurredAt ?? transcript.scheduledAt;
  const target = at ? Date.parse(at) : Number.NaN;
  if (Number.isFinite(target)) {
    const from = new Date(target - TRANSCRIPT_MATCH_WINDOW_MS).toISOString();
    const to = new Date(target + TRANSCRIPT_MATCH_WINDOW_MS).toISOString();
    const [scheduled, occurred] = await Promise.all([
      db.from("calls").select(CALL_MATCH_COLS).eq("org_id", orgId).gte("scheduled_at", from).lte("scheduled_at", to),
      db.from("calls").select(CALL_MATCH_COLS).eq("org_id", orgId).gte("occurred_at", from).lte("occurred_at", to),
    ]);
    add(scheduled.data);
    add(occurred.data);
  }

  let leads: MatchableLead[] = [];
  if (transcript.participantEmails.length > 0) {
    const emails = [...new Set(transcript.participantEmails.map((email) => email.toLowerCase()))];
    const found: MatchableLead[] = [];
    for (const email of emails) {
      const { data } = await db
        .from("leads")
        .select("id, email")
        .eq("org_id", orgId)
        .ilike("email", email)
        .limit(5);
      for (const row of data ?? []) found.push({ id: row.id, email: row.email });
    }
    leads = found.filter((lead, index, all) => all.findIndex((other) => other.id === lead.id) === index);
    if (leads.length > 0) {
      const { data } = await db
        .from("calls")
        .select(CALL_MATCH_COLS)
        .eq("org_id", orgId)
        .in(
          "lead_id",
          leads.map((lead) => lead.id)
        );
      add(data);
    }
  }

  return { calls: [...calls.values()], leads };
}

async function insertUnmatched(db: GhlDb, event: WebhookRow, transcript: NormalizedTranscript) {
  const { error } = await db.from("unmatched_transcripts").insert({
    org_id: event.org_id as string,
    source: transcript.source,
    provider_event_id: transcript.providerEventId ?? event.provider_event_id,
    provider_call_id: transcript.providerCallId,
    occurred_at: transcript.occurredAt,
    scheduled_at: transcript.scheduledAt,
    duration_seconds: transcript.durationSeconds,
    participant_emails: transcript.participantEmails,
    title: transcript.title,
    raw_transcript: transcript.transcript,
    webhook_event_id: event.id,
    status: "open",
    received_at: event.received_at,
  });
  if (error?.code === "23505") return;
  if (error) throw new Error("unmatched_insert_failed");
}

function sourceFromEventType(eventType: string): TranscriptSource | null {
  const prefix = "transcript.";
  if (!eventType.startsWith(prefix)) return null;
  const source = eventType.slice(prefix.length);
  if (
    source === "fathom" ||
    source === "fireflies" ||
    source === "zoom" ||
    source === "ghl" ||
    source === "manual"
  ) {
    return source;
  }
  return null;
}

async function markProcessed(db: GhlDb, id: string, errorText: string | null) {
  await db
    .from("webhook_events")
    .update({
      processed: true,
      status: "processed",
      processed_at: new Date().toISOString(),
      error_text: errorText,
    })
    .eq("id", id);
}

async function markEventFailure(db: GhlDb, event: WebhookRow, cause: unknown) {
  const reason = cause instanceof Error ? cause.message : "process_failed";
  const attempts = event.attempt_count;
  const dead = shouldMarkDead(attempts, EXTRACTION_MAX_ATTEMPTS);
  await db
    .from("webhook_events")
    .update({
      status: dead ? "dead" : "pending",
      processed: dead,
      processed_at: dead ? new Date().toISOString() : null,
      error_text: sanitizeError(reason),
      next_attempt_at: dead ? event.next_attempt_at : nextAttemptAt(attempts),
    })
    .eq("id", event.id);
  transcriptWarn("transcript.process.failed", { eventId: event.id, dead, reason: sanitizeError(reason) });
}

export function sanitizeError(reason: string): string {
  const allowed = new Set([
    "unsupported_source",
    "unresolved_org",
    "empty_transcript",
    "normalize_empty_transcript",
    "normalize_unsupported_source",
    "transcript_attach_failed",
    "unmatched_insert_failed",
    "extraction_enqueue_failed",
    "missing_api_key",
    "invalid_json",
    "anthropic_http",
    "anthropic_timeout",
    "process_failed",
    "score_write_failed",
  ]);
  if (allowed.has(reason)) return reason;
  if (reason.startsWith("anthropic_")) return "anthropic_http";
  return "process_failed";
}
