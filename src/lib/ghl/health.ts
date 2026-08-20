import {
  INGEST_ALERT_COOLDOWN_MS,
  INGEST_BACKLOG_ALERT_THRESHOLD,
  INGEST_STALE_PENDING_MS,
  INGEST_STALE_SUCCESS_MS,
} from "@/lib/ghl/constants";
import { ingestionAlertWebhookUrl } from "@/lib/ghl/env";
import { ghlError, ghlLog } from "@/lib/ghl/log";
import type { GhlDb } from "@/lib/ghl/tokens";

export type OrgIngestionHealth = {
  orgId: string;
  connected: boolean;
  connectionStatus: "active" | "broken" | "inactive" | "missing";
  locationName: string | null;
  lastVerifiedAt: string | null;
  receivedLast24h: Record<string, number>;
  unprocessed: number;
  oldestUnprocessedAt: string | null;
  oldestUnprocessedAgeMs: number | null;
  dead: Array<{ id: string; eventType: string; errorText: string | null; receivedAt: string }>;
  lastProcessedAt: string | null;
  lastProcessedAgeMs: number | null;
  stale: boolean;
  staleReason: string | null;
};

export type GlobalIngestionHealth = {
  unprocessed: number;
  oldestUnprocessedAgeSeconds: number | null;
  dead: number;
  lastProcessedAt: string | null;
  orgs: Array<{
    orgId: string;
    unprocessed: number;
    oldestUnprocessedAgeSeconds: number | null;
    stale: boolean;
  }>;
};

export function isIngestionStale(args: {
  connected: boolean;
  unprocessed: number;
  oldestUnprocessedAgeMs: number | null;
  lastProcessedAgeMs: number | null;
  receivedLast24hCount: number;
}): { stale: boolean; reason: string | null } {
  if (!args.connected) return { stale: false, reason: null };
  if (args.unprocessed > 0 && (args.oldestUnprocessedAgeMs ?? 0) >= INGEST_STALE_PENDING_MS) {
    return {
      stale: true,
      reason: "Events are sitting unprocessed. Ingestion is stalled.",
    };
  }
  if (
    args.receivedLast24hCount > 0 &&
    args.lastProcessedAgeMs !== null &&
    args.lastProcessedAgeMs >= INGEST_STALE_SUCCESS_MS
  ) {
    return {
      stale: true,
      reason: "No event has been processed in the expected window for this workspace.",
    };
  }
  return { stale: false, reason: null };
}

export async function loadOrgIngestionHealth(db: GhlDb, orgId: string): Promise<OrgIngestionHealth> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now = Date.now();

  const [connection, received, unprocessed, dead, lastProcessed] = await Promise.all([
    db.from("ghl_connections").select("status, location_name, last_verified_at").eq("org_id", orgId).maybeSingle(),
    db
      .from("webhook_events")
      .select("event_type")
      .eq("org_id", orgId)
      .eq("source", "ghl")
      .gte("received_at", since24h),
    db
      .from("webhook_events")
      .select("id, received_at")
      .eq("org_id", orgId)
      .eq("processed", false)
      .eq("status", "pending")
      .order("received_at", { ascending: true }),
    db
      .from("webhook_events")
      .select("id, event_type, error_text, received_at")
      .eq("org_id", orgId)
      .eq("status", "dead")
      .order("received_at", { ascending: false })
      .limit(50),
    db
      .from("webhook_events")
      .select("processed_at")
      .eq("org_id", orgId)
      .eq("status", "processed")
      .not("processed_at", "is", null)
      .order("processed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const receivedLast24h: Record<string, number> = {};
  for (const row of received.data ?? []) {
    receivedLast24h[row.event_type] = (receivedLast24h[row.event_type] ?? 0) + 1;
  }
  const unprocessedRows = unprocessed.data ?? [];
  const oldestUnprocessedAt = unprocessedRows[0]?.received_at ?? null;
  const oldestUnprocessedAgeMs = oldestUnprocessedAt ? now - Date.parse(oldestUnprocessedAt) : null;
  const lastProcessedAt = lastProcessed.data?.processed_at ?? null;
  const lastProcessedAgeMs = lastProcessedAt ? now - Date.parse(lastProcessedAt) : null;
  const status = connection.data?.status ?? "missing";
  const connected = status === "active" || status === "broken";
  const receivedCount = Object.values(receivedLast24h).reduce((sum, count) => sum + count, 0);
  const stale = isIngestionStale({
    connected: status === "active",
    unprocessed: unprocessedRows.length,
    oldestUnprocessedAgeMs,
    lastProcessedAgeMs,
    receivedLast24hCount: receivedCount,
  });

  return {
    orgId,
    connected,
    connectionStatus: status,
    locationName: connection.data?.location_name ?? null,
    lastVerifiedAt: connection.data?.last_verified_at ?? null,
    receivedLast24h,
    unprocessed: unprocessedRows.length,
    oldestUnprocessedAt,
    oldestUnprocessedAgeMs,
    dead: (dead.data ?? []).map((row) => ({
      id: row.id,
      eventType: row.event_type,
      errorText: row.error_text,
      receivedAt: row.received_at,
    })),
    lastProcessedAt,
    lastProcessedAgeMs,
    stale: stale.stale,
    staleReason: stale.reason,
  };
}

export async function loadGlobalIngestionHealth(db: GhlDb): Promise<GlobalIngestionHealth> {
  const now = Date.now();
  const { data: pending } = await db
    .from("webhook_events")
    .select("org_id, received_at")
    .eq("source", "ghl")
    .eq("processed", false)
    .eq("status", "pending")
    .order("received_at", { ascending: true });

  const { count: deadCount } = await db
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("source", "ghl")
    .eq("status", "dead");

  const { data: last } = await db
    .from("webhook_events")
    .select("processed_at")
    .eq("source", "ghl")
    .eq("status", "processed")
    .not("processed_at", "is", null)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rows = pending ?? [];
  const oldest = rows[0]?.received_at ?? null;
  const byOrg = new Map<string, { unprocessed: number; oldest: string }>();
  for (const row of rows) {
    const orgId = row.org_id ?? "unresolved";
    const current = byOrg.get(orgId);
    if (!current) byOrg.set(orgId, { unprocessed: 1, oldest: row.received_at });
    else current.unprocessed += 1;
  }

  const orgs = [...byOrg.entries()].map(([orgId, value]) => {
    const age = now - Date.parse(value.oldest);
    return {
      orgId,
      unprocessed: value.unprocessed,
      oldestUnprocessedAgeSeconds: Math.round(age / 1000),
      stale: age >= INGEST_STALE_PENDING_MS || value.unprocessed >= INGEST_BACKLOG_ALERT_THRESHOLD,
    };
  });

  return {
    unprocessed: rows.length,
    oldestUnprocessedAgeSeconds: oldest ? Math.round((now - Date.parse(oldest)) / 1000) : null,
    dead: deadCount ?? 0,
    lastProcessedAt: last?.processed_at ?? null,
    orgs,
  };
}

export async function emitIngestionAlerts(db: GhlDb): Promise<number> {
  const { data: connections } = await db
    .from("ghl_connections")
    .select("org_id")
    .eq("status", "active");

  let sent = 0;
  for (const row of connections ?? []) {
    const health = await loadOrgIngestionHealth(db, row.org_id);
    const kinds: Array<{ kind: string; detail: string }> = [];
    if (health.unprocessed >= INGEST_BACKLOG_ALERT_THRESHOLD) {
      kinds.push({
        kind: "backlog",
        detail: `Unprocessed backlog is ${health.unprocessed}.`,
      });
    }
    if (health.stale && health.staleReason) {
      kinds.push({ kind: "stale", detail: health.staleReason });
    }
    for (const alert of kinds) {
      if (await maybeSendAlert(db, row.org_id, alert.kind, alert.detail, health)) sent += 1;
    }
  }
  return sent;
}

async function maybeSendAlert(
  db: GhlDb,
  orgId: string,
  kind: string,
  detail: string,
  health: OrgIngestionHealth
): Promise<boolean> {
  const { data: existing } = await db
    .from("ingestion_alerts")
    .select("id, last_sent_at")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .maybeSingle();

  if (existing && Date.now() - Date.parse(existing.last_sent_at) < INGEST_ALERT_COOLDOWN_MS) {
    return false;
  }

  const payload = {
    kind,
    orgId,
    backlog: health.unprocessed,
    oldestUnprocessedAgeSeconds: health.oldestUnprocessedAgeMs
      ? Math.round(health.oldestUnprocessedAgeMs / 1000)
      : null,
    detail,
  };

  ghlError("ingestion.alert", payload);

  const url = ingestionAlertWebhookUrl();
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      ghlError("ingestion.alert.webhook_failed", { orgId, kind });
    }
  }

  if (existing) {
    await db
      .from("ingestion_alerts")
      .update({ detail, last_sent_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await db.from("ingestion_alerts").insert({ org_id: orgId, kind, detail });
  }
  ghlLog("ingestion.alert.recorded", { orgId, kind });
  return true;
}
