import "server-only";

import { decryptSecret } from "@/lib/ghl/crypto";
import { hashRawBody } from "@/lib/ghl/payload";
import { transcriptLog, transcriptWarn } from "@/lib/transcripts/log";
import { normalizeTranscript } from "@/lib/transcripts/normalize";
import { processOneTranscriptEvent } from "@/lib/transcripts/process";
import { payloadWithoutAudio } from "@/lib/transcripts/shape";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { TranscriptSource } from "@/lib/transcripts/types";
import type { Json } from "@/types/database";

const PULLABLE: TranscriptSource[] = ["fathom", "fireflies", "zoom"];

export async function pullRecorderTranscripts(db: GhlDb): Promise<{ pulled: number; stored: number }> {
  const { data: connections } = await db
    .from("transcript_connections")
    .select("id, org_id, source, api_key_encrypted, last_pull_at")
    .not("api_key_encrypted", "is", null);

  let pulled = 0;
  let stored = 0;
  for (const connection of connections ?? []) {
    if (!PULLABLE.includes(connection.source)) continue;
    if (!connection.api_key_encrypted) continue;
    let apiKey: string;
    try {
      apiKey = decryptSecret(connection.api_key_encrypted);
    } catch {
      await db
        .from("transcript_connections")
        .update({ last_pull_error: "secret_unreadable", updated_at: new Date().toISOString() })
        .eq("id", connection.id);
      continue;
    }

    try {
      const payloads = await pullSource(connection.source, apiKey, connection.last_pull_at);
      pulled += payloads.length;
      for (const payload of payloads) {
        const inserted = await storePulledEvent(db, connection.org_id, connection.source, payload);
        if (inserted) stored += 1;
      }
      await db
        .from("transcript_connections")
        .update({
          last_pull_at: new Date().toISOString(),
          last_pull_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
    } catch {
      await db
        .from("transcript_connections")
        .update({ last_pull_error: "pull_failed", updated_at: new Date().toISOString() })
        .eq("id", connection.id);
      transcriptWarn("transcript.pull.failed", { connectionId: connection.id, source: connection.source });
    }
  }
  return { pulled, stored };
}

async function storePulledEvent(
  db: GhlDb,
  orgId: string,
  source: TranscriptSource,
  payload: Record<string, unknown>
): Promise<boolean> {
  const normalized = normalizeTranscript(source, payload);
  if (!normalized.ok) return false;
  const providerEventId = normalized.value.providerEventId ?? hashRawBody(JSON.stringify(payload));
  const { data, error } = await db
    .from("webhook_events")
    .insert({
      org_id: orgId,
      source: "transcript",
      event_type: `transcript.${source}`,
      payload: payloadWithoutAudio(payload) as Json,
      provider_event_id: providerEventId,
      processed: false,
      status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") return false;
  if (error) throw new Error("webhook_insert_failed");
  if (data) {
    const { data: event } = await db.from("webhook_events").select("*").eq("id", data.id).maybeSingle();
    if (event) await processOneTranscriptEvent(db, event);
  }
  transcriptLog("transcript.pull.stored", { source, orgId });
  return true;
}

async function pullSource(
  source: TranscriptSource,
  apiKey: string,
  since: string | null
): Promise<Record<string, unknown>[]> {
  if (source === "fireflies") return pullFireflies(apiKey, since);
  if (source === "fathom") return pullFathom(apiKey, since);
  if (source === "zoom") return pullZoom(apiKey, since);
  return [];
}

async function pullFireflies(apiKey: string, since: string | null): Promise<Record<string, unknown>[]> {
  const fromDate = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const response = await fetch("https://api.fireflies.ai/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: `query Transcripts($fromDate: DateTime) {
        transcripts(fromDate: $fromDate, limit: 20) {
          id title date duration
          attendees { email }
          sentences { speaker_name text }
        }
      }`,
      variables: { fromDate },
    }),
  });
  if (!response.ok) throw new Error("pull_failed");
  const body = (await response.json()) as {
    data?: { transcripts?: Record<string, unknown>[] };
  };
  return body.data?.transcripts ?? [];
}

async function pullFathom(apiKey: string, since: string | null): Promise<Record<string, unknown>[]> {
  const createdAfter = since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = new URL("https://api.fathom.ai/external/v1/meetings");
  url.searchParams.set("created_after", createdAfter);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error("pull_failed");
  const body = (await response.json()) as { items?: Record<string, unknown>[]; meetings?: Record<string, unknown>[] };
  return body.items ?? body.meetings ?? [];
}

async function pullZoom(apiKey: string, since: string | null): Promise<Record<string, unknown>[]> {
  const from = (since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).slice(0, 10);
  const url = new URL("https://api.zoom.us/v2/users/me/recordings");
  url.searchParams.set("from", from);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error("pull_failed");
  const body = (await response.json()) as { meetings?: Record<string, unknown>[] };
  return body.meetings ?? [];
}
