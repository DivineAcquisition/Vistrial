import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import type { GhlDb } from "@/lib/ghl/tokens";
import { decryptSecret, encryptSecret } from "@/lib/ghl/crypto";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { API_LIMITS } from "@/lib/api/v1/limits";
import { postOutbound, OutboundUrlError } from "@/lib/security/outbound-url";
import type { SupabaseClient } from "@supabase/supabase-js";

const RETRY_MINUTES = [1, 5, 30, 120, 480, 1440];
const FAILURES_BEFORE_DISABLE = 20;

export function signWebhook(secret: string, timestamp: number, body: string): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export function newWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function sealWebhookSecret(secret: string): string {
  return encryptSecret(secret);
}

type Endpoint = {
  id: string;
  org_id: string;
  url: string;
  events: string[];
  secret_encrypted: string;
  previous_secret_encrypted: string | null;
  previous_secret_until: string | null;
  include_data: boolean;
  enabled: boolean;
  failure_count: number;
};

type OutboundEvent = {
  id: string;
  org_id: string;
  event_type: string;
  occurred_at: string;
  sequence: number;
  record_ids: string[];
  changed_fields: string[];
  source_label: string | null;
  historic: boolean;
  data: Record<string, unknown> | null;
};

function loose(db: GhlDb): SupabaseClient {
  return db as unknown as SupabaseClient;
}

export async function emitWebhookEvent(
  db: GhlDb,
  args: {
    orgId: string;
    type: string;
    recordIds?: string[];
    changedFields?: string[];
    sourceLabel?: string | null;
    historic?: boolean;
    practice?: boolean;
    data?: Record<string, unknown> | null;
  }
): Promise<void> {
  if (args.practice || args.historic) return;
  const client = loose(db);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await client
    .from("webhook_outbound_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", args.orgId)
    .gte("created_at", monthStart.toISOString());
  if ((count ?? 0) >= API_LIMITS.eventsPerMonth) return;
  const { data: endpoints } = await client
    .from("webhook_endpoints")
    .select("id, events, include_data, enabled")
    .eq("org_id", args.orgId)
    .eq("enabled", true);
  const interested = ((endpoints ?? []) as Array<{ id: string; events: string[]; include_data: boolean; enabled: boolean }>).filter(
    (endpoint) => endpoint.events.includes(args.type) || endpoint.events.includes("*")
  );
  if (interested.length === 0) return;
  const { data: event, error } = await client
    .from("webhook_outbound_events")
    .insert({
      org_id: args.orgId,
      event_type: args.type,
      sequence: Date.now(),
      record_ids: args.recordIds ?? [],
      changed_fields: args.changedFields ?? [],
      source_label: args.sourceLabel ?? null,
      historic: false,
      data: interested.some((endpoint) => endpoint.include_data) ? args.data ?? null : null,
    })
    .select("id")
    .maybeSingle();
  if (error || !event) return;
  await client.from("webhook_deliveries").insert(
    interested.map((endpoint) => ({
      org_id: args.orgId,
      endpoint_id: endpoint.id,
      event_id: (event as { id: string }).id,
      status: "pending",
    }))
  );
}

export async function deliverDueWebhooks(db: GhlDb): Promise<{ delivered: number; failed: number }> {
  const client = loose(db);
  const { data: due } = await client
    .from("webhook_deliveries")
    .select("id, org_id, endpoint_id, event_id, attempts")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(25);
  let delivered = 0;
  let failed = 0;
  for (const row of (due ?? []) as Array<{ id: string; org_id: string; endpoint_id: string; event_id: string; attempts: number }>) {
    const ok = await deliverOne(db, row);
    if (ok) delivered += 1;
    else failed += 1;
  }
  return { delivered, failed };
}

async function deliverOne(
  db: GhlDb,
  row: { id: string; org_id: string; endpoint_id: string; event_id: string; attempts: number }
): Promise<boolean> {
  const client = loose(db);
  const { data: endpoint } = await client.from("webhook_endpoints").select("*").eq("id", row.endpoint_id).maybeSingle();
  const { data: event } = await client.from("webhook_outbound_events").select("*").eq("id", row.event_id).maybeSingle();
  const hook = endpoint as Endpoint | null;
  const payloadEvent = event as OutboundEvent | null;
  if (!hook || !payloadEvent || !hook.enabled) {
    await client.from("webhook_deliveries").update({ status: "gave_up", last_error: "Endpoint is off." }).eq("id", row.id);
    return false;
  }
  const body = JSON.stringify({
    id: payloadEvent.id,
    type: payloadEvent.event_type,
    created: payloadEvent.occurred_at,
    workspace_id: payloadEvent.org_id,
    sequence: payloadEvent.sequence,
    record_ids: payloadEvent.record_ids,
    changed_fields: payloadEvent.changed_fields,
    source: payloadEvent.source_label,
    historic: payloadEvent.historic,
    ...(hook.include_data && payloadEvent.data ? { data: payloadEvent.data } : {}),
  });
  const timestamp = Math.floor(Date.now() / 1000);
  let secret = "";
  try {
    secret = decryptSecret(hook.secret_encrypted);
  } catch {
    await client.from("webhook_deliveries").update({ status: "gave_up", last_error: "Signing secret could not be read." }).eq("id", row.id);
    return false;
  }
  try {
    const response = await postOutbound({
      url: hook.url,
      body,
      headers: {
        "Vistrial-Signature": signWebhook(secret, timestamp, body),
        "Vistrial-Event": payloadEvent.event_type,
        "Vistrial-Delivery": row.id,
      },
    });
    const ok = response.status >= 200 && response.status < 300;
    if (ok) {
      await client
        .from("webhook_deliveries")
        .update({ status: "succeeded", attempts: row.attempts + 1, response_code: response.status, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      await client.from("webhook_endpoints").update({ failure_count: 0 }).eq("id", hook.id);
      return true;
    }
    await markFailure(db, row, hook, response.status, `HTTP ${response.status}`);
    return false;
  } catch (error) {
    const message = error instanceof OutboundUrlError ? error.message : "Delivery failed.";
    await markFailure(db, row, hook, null, message);
    return false;
  }
}

async function markFailure(
  db: GhlDb,
  row: { id: string; org_id: string; attempts: number },
  hook: Endpoint,
  code: number | null,
  message: string
): Promise<void> {
  const client = loose(db);
  const attempts = row.attempts + 1;
  const gaveUp = attempts >= RETRY_MINUTES.length;
  const next = new Date(Date.now() + (RETRY_MINUTES[Math.min(attempts, RETRY_MINUTES.length - 1)] ?? 1440) * 60_000);
  await client
    .from("webhook_deliveries")
    .update({
      status: gaveUp ? "gave_up" : "failed",
      attempts,
      response_code: code,
      last_error: message.slice(0, 200),
      next_attempt_at: next.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  const failures = hook.failure_count + 1;
  const disable = failures >= FAILURES_BEFORE_DISABLE;
  await client
    .from("webhook_endpoints")
    .update({
      failure_count: failures,
      enabled: disable ? false : hook.enabled,
      disabled_reason: disable ? "Turned off after repeated delivery failures. You can turn it back on and replay." : null,
    })
    .eq("id", hook.id);
  if (disable) {
    const { data: owners } = await client
      .from("org_members")
      .select("id, user_id")
      .eq("org_id", row.org_id)
      .eq("role", "owner")
      .eq("active", true)
      .limit(1);
    const owner = (owners ?? [])[0] as { id: string; user_id: string } | undefined;
    if (owner) {
      await enqueueNotification(db, {
        orgId: row.org_id,
        eventType: "webhook_notice",
        channel: "email",
        recipientUserId: owner.user_id,
        recipientMemberId: owner.id,
        subjectIds: [hook.id],
        title: "A webhook was turned off",
        body: `${hook.url} stopped accepting events. Open Developers to turn it back on and replay what is still waiting.`,
        href: "/app/settings/developers",
        dedupeKey: `webhook-disabled:${hook.id}`,
      });
    }
  }
}

export async function replayEndpoint(db: GhlDb, orgId: string, endpointId: string): Promise<number> {
  const client = loose(db);
  const { data } = await client
    .from("webhook_deliveries")
    .update({ status: "pending", next_attempt_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("endpoint_id", endpointId)
    .in("status", ["failed", "gave_up"])
    .select("id");
  return (data ?? []).length;
}
