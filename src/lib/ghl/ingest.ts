import type { Json } from "@/types/database";

import { parseWebhookPayload } from "@/lib/ghl/payload";
import { ghlLog, ghlWarn } from "@/lib/ghl/log";
import { AWAITING_LINK_ERROR } from "@/lib/ghl/retry";
import { verifyGhlWebhookSignature, type SignatureResult } from "@/lib/ghl/signature";
import type { GhlDb } from "@/lib/ghl/tokens";

export type IngestResult =
  | { httpStatus: 401; reason: "missing" | "invalid" }
  | { httpStatus: 200; duplicate: boolean; insertedId: string | null; orgId: string | null };

export async function ingestGhlWebhook(
  db: GhlDb,
  args: {
    rawBody: string;
    ghlSignature: string | null;
    legacySignature: string | null;
    /**
     * Throttle for the rejection record only. Forged traffic must not be able
     * to fill the table, but a signed event is from GHL: dropping one loses a
     * lead nobody will ever know to look for.
     */
    allowRejectionRecord?: () => Promise<boolean>;
  }
): Promise<IngestResult> {
  const verified: SignatureResult = verifyGhlWebhookSignature({
    rawBody: args.rawBody,
    ghlSignature: args.ghlSignature,
    legacySignature: args.legacySignature,
  });

  if (!verified.ok) {
    const record = args.allowRejectionRecord ? await args.allowRejectionRecord() : true;
    if (record) await recordRejection(db, verified.reason, args.rawBody.length);
    ghlWarn("ghl.webhook.rejected", {
      reason: verified.reason,
      bytes: args.rawBody.length,
      recorded: record,
    });
    return { httpStatus: 401, reason: verified.reason };
  }

  const parsed = parseWebhookPayload(args.rawBody);
  const orgId = parsed.locationId ? await orgIdForLocation(db, parsed.locationId) : null;

  const { data, error } = await db
    .from("webhook_events")
    .insert({
      org_id: orgId,
      source: "ghl",
      event_type: parsed.eventType,
      payload: parsed.payload,
      provider_event_id: parsed.providerEventId,
      contact_key: parsed.contactKey,
      location_id: parsed.locationId,
      processed: false,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") {
    ghlLog("ghl.webhook.received", {
      eventType: parsed.eventType,
      providerEventId: parsed.providerEventId,
      orgResolved: Boolean(orgId),
      duplicate: true,
    });
    return { httpStatus: 200, duplicate: true, insertedId: null, orgId };
  }

  if (error) {
    ghlWarn("ghl.webhook.insert_failed", { code: error.code });
    throw new Error("webhook_insert_failed");
  }

  ghlLog("ghl.webhook.received", {
    eventType: parsed.eventType,
    providerEventId: parsed.providerEventId,
    orgResolved: Boolean(orgId),
    duplicate: false,
    eventId: data?.id ?? null,
  });

  return { httpStatus: 200, duplicate: false, insertedId: data?.id ?? null, orgId };
}

/**
 * Linking a location claims the events that arrived while it belonged to
 * nobody, including any that already gave up waiting. Without this, a client
 * who connects the morning after their funnel went live starts with a hole
 * where that night's leads should be, and nothing on screen says so.
 */
export async function adoptEventsForLocation(
  db: GhlDb,
  orgId: string,
  locationId: string
): Promise<number> {
  const { data } = await db
    .from("webhook_events")
    .update({
      org_id: orgId,
      status: "pending",
      processed: false,
      processed_at: null,
      attempt_count: 0,
      error_text: null,
      next_attempt_at: new Date().toISOString(),
    })
    .is("org_id", null)
    .eq("location_id", locationId)
    .or(`status.eq.pending,and(status.eq.dead,error_text.eq.${AWAITING_LINK_ERROR})`)
    .select("id");

  const adopted = data?.length ?? 0;
  if (adopted > 0) ghlLog("ghl.webhook.adopted", { orgId, adopted });
  return adopted;
}

async function orgIdForLocation(db: GhlDb, locationId: string): Promise<string | null> {
  const { data } = await db
    .from("organizations")
    .select("id")
    .eq("ghl_location_id", locationId)
    .maybeSingle();
  return data?.id ?? null;
}

async function recordRejection(
  db: GhlDb,
  reason: string,
  byteLength: number,
  payload?: Json
) {
  await db.from("webhook_events").insert({
    org_id: null,
    source: "ghl",
    event_type: `rejected.${reason}`,
    payload: payload ?? { rejected: true, reason, byte_length: byteLength },
    processed: true,
    status: "rejected",
    processed_at: new Date().toISOString(),
    error_text: reason,
  });
}
