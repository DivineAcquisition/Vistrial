import { NextResponse } from "next/server";

import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { decryptSecret } from "@/lib/ghl/crypto";
import {
  findOrgByCommasPublicToken,
  ingestProcessorEvent,
  verifyHmacSha256Hex,
} from "@/lib/sources/processor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Enums } from "@/types/database";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const db = getSupabaseAdmin();
  const limited = await rateLimitWebhook(db, request, "commas");
  if (!limited.allowed) {
    await recordHttpSample(db, "/api/sources/webhooks/commas", true);
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await context.params;
  const orgId = await findOrgByCommasPublicToken(db, token);
  if (!orgId) {
    await recordHttpSample(db, "/api/sources/webhooks/commas", true);
    return NextResponse.json({ error: "Unknown endpoint" }, { status: 401 });
  }

  const rawBody = await request.text();
  const { data: conn } = await db
    .from("source_connections")
    .select("secret_encrypted")
    .eq("org_id", orgId)
    .eq("kind", "commas")
    .maybeSingle();
  const secret = conn?.secret_encrypted ? decryptSecret(conn.secret_encrypted) : null;
  const signature =
    request.headers.get("x-commas-signature") ?? request.headers.get("x-webhook-signature") ?? "";
  if (secret && signature && !verifyHmacSha256Hex(rawBody, signature, secret)) {
    await recordHttpSample(db, "/api/sources/webhooks/commas", true);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = asRecord(JSON.parse(rawBody || "{}") as unknown) ?? {};
  const event = asString(payload.event) ?? asString(payload.type) ?? asString(payload.kind) ?? "sale";
  const kindRaw = event.toLowerCase();
  const kind: Enums<"revenue_kind"> =
    kindRaw.includes("refund")
      ? "refund"
      : kindRaw.includes("chargeback") || kindRaw.includes("dispute")
        ? "chargeback"
        : kindRaw.includes("fail")
          ? "failed"
          : "sale";
  const amount = Number(payload.amount_cents ?? payload.amountCents ?? 0);
  const ref = asString(payload.ref) ?? asString(payload.id);
  if (!ref || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  await ingestProcessorEvent(db, {
    orgId,
    processor: "commas",
    kind,
    amountCents: amount,
    currency: asString(payload.currency) ?? "usd",
    processorRef: ref,
    occurredAt: asString(payload.occurred_at) ?? new Date().toISOString(),
    leadId: asString(payload.lead_id),
    email: asString(payload.email),
  });
  await recordHttpSample(db, "/api/sources/webhooks/commas", false);
  return NextResponse.json({ ok: true });
}
