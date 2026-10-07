import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { boundedPayload, decideInbound, type InboundDecision } from "@/lib/inbound/decide";
import type { Database, InboundHoldReason, Json, WorkspaceStatus } from "@/types/database";

type Db = SupabaseClient<Database>;

export type InboundSource =
  | "crm"
  | "stripe_connect"
  | "transcripts"
  | "forms"
  | "commas"
  | "telnyx"
  | "stripe_billing";

/** Store an event in the holding area. Idempotent per (source, external_ref). Never acts. */
export async function holdInboundEvent(
  db: Db,
  args: {
    source: InboundSource;
    reason: InboundHoldReason;
    eventType?: string | null;
    externalRef?: string | null;
    routingKey?: string | null;
    orgId?: string | null;
    candidateOrgIds?: string[];
    payload: unknown;
  }
): Promise<void> {
  const row = {
    source: args.source,
    reason: args.reason,
    event_type: args.eventType ?? null,
    external_ref: args.externalRef ?? null,
    routing_key: args.routingKey ?? null,
    org_id: args.orgId ?? null,
    candidate_org_ids: args.candidateOrgIds ?? [],
    payload: boundedPayload(args.payload) as Json,
  };
  // The unique index on (source, external_ref) is partial, so ON CONFLICT cannot
  // infer it. A duplicate delivery is a no-op: the first copy is already held.
  const { error } = await db.from("inbound_event_holds").insert(row);
  if (error && error.code !== "23505") console.error("[inbound-hold] could not store", args.source, args.reason, error.message);
}

/**
 * Resolve candidate workspaces to exactly one open one, or hold the event.
 * `candidateOrgIds` comes from the source's own routing (location id, Stripe
 * account, webhook token). Statuses are read here, never trusted from the caller.
 */
export async function resolveInboundWorkspace(
  db: Db,
  args: {
    source: InboundSource;
    candidateOrgIds: string[];
    sourceEnabled?: boolean;
    eventType?: string | null;
    externalRef?: string | null;
    routingKey?: string | null;
    payload: unknown;
  }
): Promise<InboundDecision> {
  const ids = [...new Set(args.candidateOrgIds.filter(Boolean))];
  let candidates: Array<{ id: string; status: WorkspaceStatus }> = [];
  if (ids.length > 0) {
    const { data } = await db.from("organizations").select("id, status").in("id", ids);
    candidates = (data ?? []).map((row) => ({ id: row.id, status: row.status }));
  }
  const decision = decideInbound({ candidates, sourceEnabled: args.sourceEnabled });
  if (decision.action === "hold") {
    await holdInboundEvent(db, {
      source: args.source,
      reason: decision.reason,
      eventType: args.eventType,
      externalRef: args.externalRef,
      routingKey: args.routingKey,
      orgId: decision.orgId,
      candidateOrgIds: ids,
      payload: args.payload,
    });
  }
  return decision;
}

/** Whether automation may run for a workspace: onboarding or active only. */
export async function automationAllowed(db: Db, orgId: string): Promise<boolean> {
  const { data } = await db.from("organizations").select("status").eq("id", orgId).maybeSingle();
  return data?.status === "onboarding" || data?.status === "active";
}

/** Workspaces automation may run for, out of a list. One query. */
export async function automationAllowedOrgIds(db: Db, orgIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(orgIds)];
  if (ids.length === 0) return new Set();
  const { data } = await db.from("organizations").select("id").in("id", ids).in("status", ["onboarding", "active"]);
  return new Set((data ?? []).map((row) => row.id));
}

/**
 * CRM and transcript events are queued in webhook_events. A held one is parked
 * as rejected; one hold per event, so retries never stack copies.
 */
export function webhookHoldRef(webhookEventId: string): string {
  return `webhook_event:${webhookEventId}`;
}

export function webhookEventIdFromHoldRef(ref: string | null): string | null {
  const match = ref?.match(/^webhook_event:([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

/** Park a queued event: processed, nothing applied, reason recorded. */
export async function parkHeldWebhookEvent(db: Db, eventId: string, orgId: string | null, reason: InboundHoldReason) {
  await db
    .from("webhook_events")
    .update({
      ...(orgId ? { org_id: orgId } : {}),
      processed: true,
      status: "rejected",
      processed_at: new Date().toISOString(),
      error_text: reason,
    })
    .eq("id", eventId);
}

/** A released hold puts its queued event back for another pass. */
export async function requeueHeldWebhookEvent(db: Db, eventId: string): Promise<boolean> {
  const { data } = await db
    .from("webhook_events")
    .update({
      status: "pending",
      processed: false,
      processed_at: null,
      attempt_count: 0,
      error_text: null,
      next_attempt_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .in("status", ["rejected", "pending"])
    .select("id")
    .maybeSingle();
  return Boolean(data);
}
