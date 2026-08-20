import "server-only";

import type { GhlDb } from "@/lib/ghl/tokens";

export type UnmatchedHealth = {
  count: number;
  oldestAt: string | null;
  oldestAgeMs: number | null;
};

export type ExtractionDeadHealth = {
  count: number;
  oldestAt: string | null;
};

export type TranscriptHealth = {
  unmatched: UnmatchedHealth;
  deadExtractions: ExtractionDeadHealth;
  connections: Array<{
    source: string;
    publicToken: string;
    lastPullAt: string | null;
    lastPullError: string | null;
    hasWebhookSecret: boolean;
    hasApiKey: boolean;
  }>;
};

export async function loadTranscriptHealth(db: GhlDb, orgId: string): Promise<TranscriptHealth> {
  const now = Date.now();
  const [unmatchedCount, oldestUnmatched, deadCount, oldestDead, connections] = await Promise.all([
    db
      .from("unmatched_transcripts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "open"),
    db
      .from("unmatched_transcripts")
      .select("received_at")
      .eq("org_id", orgId)
      .eq("status", "open")
      .order("received_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from("extraction_jobs")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "dead"),
    db
      .from("extraction_jobs")
      .select("created_at")
      .eq("org_id", orgId)
      .eq("status", "dead")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from("transcript_connections")
      .select("source, public_token, last_pull_at, last_pull_error, webhook_secret_encrypted, api_key_encrypted")
      .eq("org_id", orgId),
  ]);

  const oldestAt = oldestUnmatched.data?.received_at ?? null;
  const deadOldest = oldestDead.data?.created_at ?? null;

  return {
    unmatched: {
      count: unmatchedCount.count ?? 0,
      oldestAt,
      oldestAgeMs: oldestAt ? now - Date.parse(oldestAt) : null,
    },
    deadExtractions: {
      count: deadCount.count ?? 0,
      oldestAt: deadOldest,
    },
    connections: (connections.data ?? []).map((row) => ({
      source: row.source,
      publicToken: row.public_token,
      lastPullAt: row.last_pull_at,
      lastPullError: row.last_pull_error,
      hasWebhookSecret: Boolean(row.webhook_secret_encrypted),
      hasApiKey: Boolean(row.api_key_encrypted),
    })),
  };
}

export async function loadOpenUnmatched(
  db: GhlDb,
  orgId: string,
  limit = 50
): Promise<
  Array<{
    id: string;
    source: string;
    title: string | null;
    occurredAt: string | null;
    receivedAt: string;
    participantEmails: string[];
    providerCallId: string | null;
  }>
> {
  const { data } = await db
    .from("unmatched_transcripts")
    .select("id, source, title, occurred_at, received_at, participant_emails, provider_call_id")
    .eq("org_id", orgId)
    .eq("status", "open")
    .order("received_at", { ascending: true })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    source: row.source,
    title: row.title,
    occurredAt: row.occurred_at,
    receivedAt: row.received_at,
    participantEmails: row.participant_emails ?? [],
    providerCallId: row.provider_call_id,
  }));
}
