import "server-only";

import { NextResponse } from "next/server";

import { holdInboundEvent, type InboundSource } from "@/lib/inbound/holds";
import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Larger than any Telnyx or Stripe event; anything bigger is refused unread. */
export const UNPLUGGED_MAX_BODY_BYTES = 256 * 1024;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
}

/** Telnyx wraps events as { data: { id, event_type } }; Stripe sends { id, type }. */
export function describeUnpluggedEvent(body: unknown): { externalRef: string | null; eventType: string | null } {
  const root = asRecord(body);
  const data = asRecord(root?.data);
  return {
    externalRef: asString(data?.id) ?? asString(root?.id),
    eventType: asString(data?.event_type) ?? asString(root?.type) ?? asString(root?.event_type),
  };
}

/**
 * A source we cannot verify or act on yet. The request is size-capped and
 * rate-limited, stored in the holding area with reason source_not_enabled, and
 * nothing else happens: no workspace lookup, no writes elsewhere, no replies.
 * Answering 200 stops the sender retrying into the void.
 */
export async function holdUnpluggedSource(request: Request, source: InboundSource, route: string) {
  const db = getSupabaseAdmin();
  const limited = await rateLimitWebhook(db, request, source);
  if (!limited.allowed) {
    await recordHttpSample(db, route, true);
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > UNPLUGGED_MAX_BODY_BYTES) {
    await recordHttpSample(db, route, true);
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > UNPLUGGED_MAX_BODY_BYTES) {
    await recordHttpSample(db, route, true);
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    body = { unparsed: raw };
  }
  const { externalRef, eventType } = describeUnpluggedEvent(body);
  await holdInboundEvent(db, {
    source,
    reason: "source_not_enabled",
    eventType,
    externalRef,
    payload: body,
  });
  await recordHttpSample(db, route, false);
  return NextResponse.json({ ok: true, held: true, enabled: false });
}
