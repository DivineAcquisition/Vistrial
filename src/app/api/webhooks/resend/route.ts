import { NextResponse } from "next/server";
import { Resend } from "resend";

import { resendConfigured, resendWebhookSecret } from "@/lib/notifications/env";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type ResendEvent = {
  type?: string;
  data?: { email_id?: string };
};

export async function POST(request: Request) {
  const secret = resendWebhookSecret();
  const cfg = resendConfigured();
  if (!secret || !cfg) {
    return NextResponse.json({ error: "Resend webhooks are not configured." }, { status: 503 });
  }

  try {
    const db = getSupabaseAdmin();
    const limited = await rateLimitWebhook(db, request, "resend");
    if (!limited.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  } catch {
    /* configuration gap must not drop a verified event later */
  }

  const payload = await request.text();
  const resend = new Resend(cfg.apiKey);
  let event: ResendEvent;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? request.headers.get("webhook-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? request.headers.get("webhook-signature") ?? "",
      },
      webhookSecret: secret,
    }) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const providerId = event.data?.email_id;
  if (!providerId) return NextResponse.json({ ok: true });

  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  if (event.type === "email.delivered") {
    await db
      .from("notifications")
      .update({ status: "delivered", delivered_at: now, updated_at: now })
      .eq("provider_id", providerId)
      .eq("channel", "email")
      .in("status", ["sent", "queued"]);
  }
  if (event.type === "email.opened" || event.type === "email.clicked") {
    await db
      .from("notifications")
      .update({
        status: event.type === "email.clicked" ? "acted" : "opened",
        opened_at: now,
        acted_at: event.type === "email.clicked" ? now : null,
        updated_at: now,
      })
      .eq("provider_id", providerId)
      .eq("channel", "email");
  }
  if (event.type === "email.bounced" || event.type === "email.failed") {
    await db
      .from("notifications")
      .update({ status: "dead", error_text: event.type, updated_at: now })
      .eq("provider_id", providerId)
      .eq("channel", "email");
  }

  return NextResponse.json({ ok: true });
}
