import type { Enums } from "@/types/database";

import {
  asIso,
  asJsonRecord,
  asSeconds,
  collectEmails,
  flattenTranscript,
  nested,
  pickString,
} from "@/lib/transcripts/shape";
import type { NormalizedTranscript, TranscriptSource } from "@/lib/transcripts/types";

export type NormalizeResult =
  | { ok: true; value: NormalizedTranscript }
  | { ok: false; reason: "empty_transcript" | "unsupported_source" };

type SourceNormalizer = (payload: Record<string, unknown>) => Omit<NormalizedTranscript, "source">;

function baseFromUnknown(payload: Record<string, unknown>): Omit<NormalizedTranscript, "source"> {
  const data = nested(payload, "data") ?? nested(payload, "meeting") ?? nested(payload, "recording") ?? payload;
  const transcript =
    flattenTranscript(payload.transcript) ??
    flattenTranscript(data.transcript) ??
    flattenTranscript(payload.sentences) ??
    flattenTranscript(data.sentences) ??
    flattenTranscript(payload.text) ??
    flattenTranscript(payload.content);

  return {
    providerEventId:
      pickString(payload, ["id", "event_id", "eventId", "webhook_id", "webhookId"]) ??
      pickString(data, ["id", "event_id", "eventId"]),
    providerCallId:
      pickString(payload, [
        "call_id",
        "callId",
        "meeting_id",
        "meetingId",
        "recording_id",
        "recordingId",
        "appointment_id",
        "appointmentId",
        "conference_id",
        "uuid",
      ]) ??
      pickString(data, [
        "call_id",
        "callId",
        "meeting_id",
        "meetingId",
        "recording_id",
        "recordingId",
        "appointment_id",
        "appointmentId",
        "uuid",
      ]),
    occurredAt:
      asIso(pickString(payload, ["occurred_at", "occurredAt", "started_at", "start_time", "startTime", "date"])) ??
      asIso(pickString(data, ["occurred_at", "started_at", "start_time", "startTime", "date"])),
    scheduledAt:
      asIso(pickString(payload, ["scheduled_at", "scheduledAt", "scheduled_start", "calendar_start"])) ??
      asIso(pickString(data, ["scheduled_at", "scheduledAt"])),
    durationSeconds:
      asSeconds(payload.duration_seconds ?? payload.durationSeconds ?? payload.duration) ??
      asSeconds(data.duration_seconds ?? data.durationSeconds ?? data.duration),
    participantEmails: collectEmails(payload),
    title: pickString(payload, ["title", "meeting_title", "topic"]) ?? pickString(data, ["title", "topic"]),
    transcript: transcript ?? "",
  };
}

function fathom(payload: Record<string, unknown>): Omit<NormalizedTranscript, "source"> {
  const recording = nested(payload, "recording") ?? nested(payload, "data") ?? payload;
  const calendar = nested(recording, "calendar_invite") ?? nested(recording, "calendar");
  const transcript =
    flattenTranscript(recording.transcript) ??
    flattenTranscript(payload.transcript) ??
    flattenTranscript(nested(recording, "transcript")?.plain_text);
  return {
    ...baseFromUnknown(payload),
    providerEventId: pickString(payload, ["id", "webhook_id"]) ?? pickString(recording, ["id"]),
    providerCallId:
      pickString(recording, ["id", "recording_id", "call_id"]) ?? pickString(payload, ["recording_id", "call_id"]),
    occurredAt:
      asIso(pickString(recording, ["started_at", "created_at", "recorded_at"])) ??
      asIso(pickString(payload, ["created_at", "started_at"])),
    scheduledAt: asIso(pickString(calendar, ["start_time", "startTime", "scheduled_at"])),
    durationSeconds: asSeconds(recording.duration_in_seconds ?? recording.duration ?? payload.duration),
    participantEmails: collectEmails(recording.calendar_invitees ?? recording.attendees ?? payload),
    title: pickString(recording, ["title", "meeting_title"]) ?? pickString(payload, ["title"]),
    transcript: transcript ?? "",
  };
}

function fireflies(payload: Record<string, unknown>): Omit<NormalizedTranscript, "source"> {
  const meeting = nested(payload, "meeting") ?? nested(payload, "transcript") ?? nested(payload, "data") ?? payload;
  const sentences = meeting.sentences ?? payload.sentences;
  const transcript = flattenTranscript(sentences) ?? flattenTranscript(meeting.transcript) ?? flattenTranscript(payload);
  return {
    ...baseFromUnknown(payload),
    providerEventId: pickString(payload, ["event_id", "id"]) ?? pickString(meeting, ["id"]),
    providerCallId: pickString(meeting, ["id", "meetingId", "meeting_id"]) ?? pickString(payload, ["meetingId"]),
    occurredAt: asIso(pickString(meeting, ["date", "startTime", "start_time", "createdAt"])),
    scheduledAt: asIso(pickString(meeting, ["scheduledStart", "scheduled_at"])),
    durationSeconds: asSeconds(meeting.duration ?? payload.duration),
    participantEmails: collectEmails(meeting.attendees ?? meeting.participants ?? payload.attendees),
    title: pickString(meeting, ["title", "meeting_title"]),
    transcript: transcript ?? "",
  };
}

function zoom(payload: Record<string, unknown>): Omit<NormalizedTranscript, "source"> {
  const object = nested(payload, "object") ?? nested(nested(payload, "payload"), "object") ?? payload;
  const transcript = flattenTranscript(object.transcript) ?? flattenTranscript(payload.transcript);
  return {
    ...baseFromUnknown(payload),
    providerEventId: pickString(payload, ["event_ts", "event"]) ?? pickString(object, ["uuid", "id"]),
    providerCallId: pickString(object, ["uuid", "id", "meeting_id"]) ?? pickString(payload, ["meeting_id"]),
    occurredAt: asIso(pickString(object, ["start_time", "startTime"])),
    scheduledAt: asIso(pickString(object, ["scheduled_start", "start_time"])),
    durationSeconds: asSeconds(object.duration ?? payload.duration),
    participantEmails: collectEmails(object.participant ?? object.participants ?? payload),
    title: pickString(object, ["topic", "title"]),
    transcript: transcript ?? "",
  };
}

function ghl(payload: Record<string, unknown>): Omit<NormalizedTranscript, "source"> {
  const appointment = nested(payload, "appointment") ?? nested(payload, "calendar") ?? payload;
  const transcript =
    flattenTranscript(payload.transcript) ??
    flattenTranscript(appointment.transcript) ??
    flattenTranscript(payload.recordingTranscript);
  return {
    ...baseFromUnknown(payload),
    providerEventId: pickString(payload, ["webhookId", "webhook_id", "id"]),
    providerCallId:
      pickString(appointment, ["id", "appointmentId", "appointment_id"]) ??
      pickString(payload, ["appointmentId", "appointment_id", "callId"]),
    occurredAt: asIso(pickString(appointment, ["startTime", "start_time", "appoinmentStartTime"])),
    scheduledAt: asIso(pickString(appointment, ["startTime", "start_time", "scheduledAt"])),
    durationSeconds: asSeconds(appointment.duration ?? payload.duration),
    participantEmails: collectEmails(payload),
    title: pickString(appointment, ["title", "calendarName"]),
    transcript: transcript ?? "",
  };
}

function manual(payload: Record<string, unknown>): Omit<NormalizedTranscript, "source"> {
  return {
    ...baseFromUnknown(payload),
    providerCallId: pickString(payload, ["call_id", "callId"]),
    transcript: flattenTranscript(payload.transcript) ?? flattenTranscript(payload.text) ?? "",
  };
}

const NORMALIZERS: Record<Exclude<TranscriptSource, never>, SourceNormalizer> = {
  fathom,
  fireflies,
  zoom,
  ghl,
  manual,
};

export function isTranscriptSource(value: string): value is TranscriptSource {
  return value in NORMALIZERS;
}

export function normalizeTranscript(
  source: TranscriptSource | string,
  payload: unknown
): NormalizeResult {
  if (!isTranscriptSource(source)) return { ok: false, reason: "unsupported_source" };
  const record = asJsonRecord(payload);
  const normalized = NORMALIZERS[source](record);
  const transcript = normalized.transcript.trim();
  if (!transcript) return { ok: false, reason: "empty_transcript" };
  return {
    ok: true,
    value: {
      source,
      providerEventId: normalized.providerEventId,
      providerCallId: normalized.providerCallId,
      occurredAt: normalized.occurredAt,
      scheduledAt: normalized.scheduledAt,
      durationSeconds: normalized.durationSeconds,
      participantEmails: normalized.participantEmails,
      title: normalized.title,
      transcript,
    },
  };
}

export function sourceFromEnum(value: Enums<"transcript_source">): TranscriptSource {
  return value;
}
