import { NextResponse } from "next/server";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

import { leadSuppressionFromEvent, type ResendWebhookEvent } from "@/lib/compliance/email-suppression";
import { resendConfigured, resendWebhookSecret } from "@/lib/notifications/env";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
  let event: ResendWebhookEvent;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get("svix-id") ?? request.headers.get("webhook-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? request.headers.get("webhook-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? request.headers.get("webhook-signature") ?? "",
      },
      webhookSecret: secret,
    }) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  // An email to a lead that bounced for good, or that the lead marked as
  // spam: nothing is emailed to them again. The lead is matched only inside
  // the workspace named on the email itself.
  const suppression = leadSuppressionFromEvent(event);
  if (suppression) {
    const loose = db as unknown as SupabaseClient;
    const { data: lead } = await loose
      .from("leads")
      .select("id")
      .eq("id", suppression.leadId)
      .eq("org_id", suppression.orgId)
      .maybeSingle();
    if (lead) {
      await loose.from("lead_email_suppressions").upsert(
        {
          org_id: suppression.orgId,
          lead_id: suppression.leadId,
          reason: suppression.reason,
          provider: "resend",
          provider_id: suppression.providerId,
        },
        { onConflict: "org_id,lead_id", ignoreDuplicates: true }
      );
    }
  }

  const providerId = event.data?.email_id;
  if (!providerId) return NextResponse.json({ ok: true });

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
  if (event.type === "email.bounced" || event.type === "email.failed" || event.type === "email.complained") {
    await db
      .from("notifications")
      .update({ status: "dead", error_text: event.type, updated_at: now })
      .eq("provider_id", providerId)
      .eq("channel", "email");
  }

  return NextResponse.json({ ok: true });
}
