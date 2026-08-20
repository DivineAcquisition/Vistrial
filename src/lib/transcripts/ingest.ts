import "server-only";

import type { Json } from "@/types/database";

import { decryptSecret } from "@/lib/ghl/crypto";
import { hashRawBody } from "@/lib/ghl/payload";
import { transcriptLog, transcriptWarn } from "@/lib/transcripts/log";
import { payloadWithoutAudio } from "@/lib/transcripts/shape";
import { isTranscriptSource } from "@/lib/transcripts/normalize";
import { signatureHeader, signaturesMatch } from "@/lib/transcripts/signature";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { TranscriptSource } from "@/lib/transcripts/types";

export type TranscriptIngestResult =
  | { httpStatus: 401; reason: "missing" | "invalid" | "unknown_connection" }
  | { httpStatus: 200; duplicate: boolean; insertedId: string | null; orgId: string };

export async function ingestTranscriptWebhook(
  db: GhlDb,
  args: {
    source: string;
    publicToken: string;
    rawBody: string;
    headers: Headers;
  }
): Promise<TranscriptIngestResult> {
  if (!isTranscriptSource(args.source) || args.source === "manual") {
    return { httpStatus: 401, reason: "unknown_connection" };
  }

  const { data: connection } = await db
    .from("transcript_connections")
    .select("id, org_id, source, webhook_secret_encrypted")
    .eq("public_token", args.publicToken)
    .eq("source", args.source)
    .maybeSingle();

  if (!connection?.webhook_secret_encrypted) {
    transcriptWarn("transcript.webhook.unknown", { source: args.source });
    return { httpStatus: 401, reason: "unknown_connection" };
  }

  let secret: string;
  try {
    secret = decryptSecret(connection.webhook_secret_encrypted);
  } catch {
    transcriptWarn("transcript.webhook.secret_unreadable", { connectionId: connection.id });
    return { httpStatus: 401, reason: "invalid" };
  }

  const provided = signatureHeader(args.headers);
  if (!signaturesMatch(secret, args.rawBody, provided)) {
    transcriptWarn("transcript.webhook.rejected", {
      reason: provided ? "invalid" : "missing",
      bytes: args.rawBody.length,
      source: args.source,
    });
    return { httpStatus: 401, reason: provided ? "invalid" : "missing" };
  }

  let payload: Json;
  try {
    payload = JSON.parse(args.rawBody) as Json;
  } catch {
    payload = { _unparsed: true, bytes: args.rawBody.length };
  }

  const providerEventId = providerIdFromPayload(payload) ?? hashRawBody(args.rawBody);

  const { data, error } = await db
    .from("webhook_events")
    .insert({
      org_id: connection.org_id,
      source: "transcript",
      event_type: `transcript.${args.source}`,
      payload: payloadWithoutAudio(payload) as Json,
      provider_event_id: providerEventId,
      processed: false,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    transcriptLog("transcript.webhook.received", {
      source: args.source,
      duplicate: true,
      orgResolved: true,
    });
    return { httpStatus: 200, duplicate: true, insertedId: null, orgId: connection.org_id };
  }

  if (error) {
    transcriptWarn("transcript.webhook.insert_failed", { code: error.code });
    throw new Error("webhook_insert_failed");
  }

  transcriptLog("transcript.webhook.received", {
    source: args.source as TranscriptSource,
    duplicate: false,
    eventId: data?.id ?? null,
  });

  return {
    httpStatus: 200,
    duplicate: false,
    insertedId: data?.id ?? null,
    orgId: connection.org_id,
  };
}

function providerIdFromPayload(payload: Json): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const keys = ["id", "webhookId", "webhook_id", "event_id", "eventId", "recording_id", "meetingId"];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
