import { ghlError } from "@/lib/ghl/log";
import type { GhlDb } from "@/lib/ghl/tokens";
import type { Json } from "@/types/database";

export const WEBHOOK_DEAD_LETTER_REASONS = [
  "missing_signature",
  "invalid_signature",
  "malformed_json",
  "insert_failed",
  "process_dead",
  "unsupported_event_type",
] as const;

export type WebhookDeadLetterReason = (typeof WEBHOOK_DEAD_LETTER_REASONS)[number];

export function signatureDeadLetterReason(
  reason: "missing" | "invalid"
): Extract<WebhookDeadLetterReason, "missing_signature" | "invalid_signature"> {
  return reason === "missing" ? "missing_signature" : "invalid_signature";
}

export async function writeWebhookDeadLetter(
  db: GhlDb,
  row: {
    orgId?: string | null;
    webhookEventId?: string | null;
    source?: "ghl";
    reason: WebhookDeadLetterReason;
    eventType?: string | null;
    providerEventId?: string | null;
    rawBody: string;
    payload?: Json | null;
  },
  options?: { required?: boolean }
): Promise<{ stored: boolean; duplicate: boolean }> {
  const { error } = await db.from("webhook_dead_letters").insert({
    org_id: row.orgId ?? null,
    webhook_event_id: row.webhookEventId ?? null,
    source: row.source ?? "ghl",
    reason: row.reason,
    event_type: row.eventType ?? null,
    provider_event_id: row.providerEventId ?? null,
    raw_body: row.rawBody,
    payload: row.payload ?? null,
  });

  if (error?.code === "23505") {
    return { stored: false, duplicate: true };
  }

  if (error) {
    ghlError("ghl.webhook.dead_letter_failed", {
      code: error.code,
      reason: row.reason,
    });
    if (options?.required) {
      throw new Error("dead_letter_failed");
    }
    return { stored: false, duplicate: false };
  }

  return { stored: true, duplicate: false };
}

export function rawBodyFromEvent(event: {
  raw_body: string | null;
  payload: Json;
}): string {
  if (event.raw_body != null && event.raw_body !== "") {
    return event.raw_body;
  }
  try {
    return JSON.stringify(event.payload);
  } catch {
    return "";
  }
}
