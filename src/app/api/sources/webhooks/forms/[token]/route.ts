import { NextResponse } from "next/server";

import { decryptSecret } from "@/lib/ghl/crypto";
import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { findOrgByFormToken, verifyHmacSha256Hex } from "@/lib/sources/processor";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const KINDS = new Set(["started", "answered", "completed", "abandoned"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const db = getSupabaseAdmin();
  const limited = await rateLimitWebhook(db, request, "forms");
  if (!limited.allowed) {
    await recordHttpSample(db, "/api/sources/webhooks/forms", true);
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { token } = await context.params;
  const orgId = await findOrgByFormToken(db, token);
  if (!orgId) {
    await recordHttpSample(db, "/api/sources/webhooks/forms", true);
    return NextResponse.json({ error: "Unknown endpoint" }, { status: 401 });
  }
  const rawBody = await request.text();
  const { data: conn } = await db
    .from("source_connections")
    .select("secret_encrypted")
    .eq("org_id", orgId)
    .eq("kind", "form_platform")
    .maybeSingle();
  const secret = conn?.secret_encrypted ? decryptSecret(conn.secret_encrypted) : null;
  const signature = request.headers.get("x-vistrial-signature") ?? "";
  if (secret && !verifyHmacSha256Hex(rawBody, signature, secret)) {
    await recordHttpSample(db, "/api/sources/webhooks/forms", true);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = asRecord(JSON.parse(rawBody || "{}") as unknown) ?? {};
  const sessionId = asString(payload.session_id) ?? asString(payload.sessionId);
  const eventKind = (asString(payload.event) ?? asString(payload.event_kind) ?? "").toLowerCase();
  if (!sessionId || !KINDS.has(eventKind)) {
    return NextResponse.json({ error: "session_id and event are required." }, { status: 400 });
  }
  const { error } = await db.from("form_events").upsert(
    {
      org_id: orgId,
      session_id: sessionId,
      event_kind: eventKind,
      question_key: asString(payload.question_key) ?? asString(payload.questionKey) ?? "",
      occurred_at: asString(payload.occurred_at) ?? new Date().toISOString(),
    },
    { onConflict: "org_id,session_id,event_kind,question_key" }
  );
  if (error) {
    await recordHttpSample(db, "/api/sources/webhooks/forms", true);
    return NextResponse.json({ error: "Could not store the event." }, { status: 500 });
  }
  await recordHttpSample(db, "/api/sources/webhooks/forms", false);
  return NextResponse.json({ ok: true });
}
