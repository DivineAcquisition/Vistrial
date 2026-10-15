import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import {
  inboundTextCommand,
  phoneDigits,
  samePhone,
  sendTelnyxText,
  telnyxNotificationFrom,
  TEXT_HELP_REPLY,
  TEXT_STOP_REPLY,
  verifyTelnyxSignature,
} from "@/lib/notifications/text";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** STOP and HELP for the Vistrial notification number. Lead numbers do not use this route. */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (rawBody.length > 64 * 1024) return new Response("Too large.", { status: 413 });

  const accepted = verifyTelnyxSignature({
    rawBody,
    signature: request.headers.get("telnyx-signature-ed25519"),
    timestamp: request.headers.get("telnyx-timestamp"),
    publicKeyBase64: process.env.TELNYX_PUBLIC_KEY?.trim() ?? "",
  });
  if (!accepted) return new Response("Signature was not accepted.", { status: 401 });

  const notificationFrom = telnyxNotificationFrom();
  if (!notificationFrom) return new Response("Notification number is not configured.", { status: 503 });

  const db = getSupabaseAdmin();
  const limited = await rateLimitWebhook(db, request, "telnyx-notifications");
  if (!limited.allowed) return new Response("Slow down.", { status: 429 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new Response("Unreadable body.", { status: 400 });
  }

  const data = asRecord(asRecord(parsed)?.data);
  if (data?.event_type !== "message.received") return new Response("ok");
  const payload = asRecord(data.payload);
  const toList = Array.isArray(payload?.to) ? payload.to : [];
  const addressed = toList.some((item) => {
    const number = asRecord(item)?.phone_number;
    return typeof number === "string" && samePhone(number, notificationFrom);
  });
  if (!addressed) return new Response("ok");

  const sender = asRecord(payload?.from)?.phone_number;
  const text = typeof payload?.text === "string" ? payload.text : "";
  const command = typeof sender === "string" ? inboundTextCommand(text) : null;
  if (!command || typeof sender !== "string") return new Response("ok");

  if (command === "stop") {
    const last10 = phoneDigits(sender).slice(-10);
    if (last10.length === 10) {
      const { data: members } = await db.from("org_members").select("id, phone").ilike("phone", `%${last10}`);
      const ids = (members ?? [])
        .filter((row) => row.phone && samePhone(row.phone, sender))
        .map((row) => row.id);
      if (ids.length > 0) {
        await db.from("org_members").update({ text_opted_out_at: new Date().toISOString() }).in("id", ids);
      }
    }
    await sendTelnyxText({ to: sender, body: TEXT_STOP_REPLY });
  } else {
    await sendTelnyxText({ to: sender, body: TEXT_HELP_REPLY });
  }

  return new Response("ok");
}
