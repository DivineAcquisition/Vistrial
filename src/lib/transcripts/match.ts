import { TRANSCRIPT_MATCH_WINDOW_MS } from "@/lib/transcripts/constants";
import type { NormalizedTranscript, TranscriptMatch } from "@/lib/transcripts/types";

export type MatchableCall = {
  id: string;
  leadId: string;
  scheduledAt: string | null;
  occurredAt: string | null;
  transcriptProviderId: string | null;
  ghlAppointmentId: string | null;
  hasTranscript: boolean;
};

export type MatchableLead = {
  id: string;
  email: string | null;
};

export type MatchInput = {
  transcript: NormalizedTranscript;
  calls: MatchableCall[];
  leads: MatchableLead[];
  now?: number;
  windowMs?: number;
};

function unique<T extends { id: string }>(rows: T[]): T[] | null {
  if (rows.length === 1) return rows;
  return null;
}

function inWindow(call: MatchableCall, at: string, windowMs: number): boolean {
  const target = Date.parse(at);
  if (!Number.isFinite(target)) return false;
  const points = [call.scheduledAt, call.occurredAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((ms) => Number.isFinite(ms));
  return points.some((ms) => Math.abs(ms - target) <= windowMs);
}

function meetingTime(transcript: NormalizedTranscript): string | null {
  return transcript.occurredAt ?? transcript.scheduledAt;
}

/**
 * Match in order: explicit recorder id, then time window, then participant email.
 * Multiple candidates at a step never pick a winner. Zero matches fall through.
 * Email never attaches when the lead has more than one eligible call.
 */
export function matchTranscriptToCall(input: MatchInput): TranscriptMatch {
  const windowMs = input.windowMs ?? TRANSCRIPT_MATCH_WINDOW_MS;
  const { transcript, calls, leads } = input;

  if (transcript.providerCallId) {
    const byId = calls.filter(
      (call) =>
        call.transcriptProviderId === transcript.providerCallId ||
        call.ghlAppointmentId === transcript.providerCallId
    );
    const uniqueId = unique(byId);
    if (uniqueId) return { kind: "matched", callId: uniqueId[0].id, method: "provider_id" };
    if (byId.length > 1) return { kind: "unmatched", reason: "no_unique_call" };
  }

  const at = meetingTime(transcript);
  const timeMatches = at ? calls.filter((call) => inWindow(call, at, windowMs)) : [];
  const uniqueTime = unique(timeMatches);
  if (uniqueTime) return { kind: "matched", callId: uniqueTime[0].id, method: "time" };
  if (timeMatches.length > 1 && transcript.participantEmails.length === 0) {
    return { kind: "unmatched", reason: "no_unique_call" };
  }

  if (transcript.participantEmails.length > 0) {
    const emailSet = new Set(transcript.participantEmails.map((email) => email.toLowerCase()));
    const matchingLeads = leads.filter((lead) => lead.email && emailSet.has(lead.email.toLowerCase()));
    const uniqueLead = unique(matchingLeads);
    if (!uniqueLead) return { kind: "unmatched", reason: "no_unique_call" };

    const leadId = uniqueLead[0].id;
    const pool = (timeMatches.length > 1 ? timeMatches : calls).filter((call) => call.leadId === leadId);
    const withoutTranscript = pool.filter((call) => !call.hasTranscript);
    const eligible = withoutTranscript.length === 1 ? withoutTranscript : unique(pool);
    if (eligible) return { kind: "matched", callId: eligible[0].id, method: "email" };
  }

  return { kind: "unmatched", reason: "no_unique_call" };
}
