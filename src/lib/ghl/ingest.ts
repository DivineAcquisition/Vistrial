import {
  signatureDeadLetterReason,
  writeWebhookDeadLetter,
} from "@/lib/ghl/dead-letter";
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
    if (record) await persistRejection(db, verified.reason, args.rawBody);
    ghlWarn("ghl.webhook.rejected", {
      reason: verified.reason,
      bytes: args.rawBody.length,
      recorded: record,
    });
    return { httpStatus: 401, reason: verified.reason };
  }

  const parsed = parseWebhookPayload(args.rawBody);
  const orgId = parsed.locationId ? await orgIdForLocation(db, parsed.locationId) : null;
  const malformed = !parsed.parsed;
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("webhook_events")
    .insert({
      org_id: orgId,
      source: "ghl",
      event_type: parsed.eventType,
      payload: parsed.payload,
      raw_body: args.rawBody,
      provider_event_id: parsed.providerEventId,
      contact_key: parsed.contactKey,
      location_id: parsed.locationId,
      processed: malformed,
      status: malformed ? "dead" : "pending",
      processed_at: malformed ? now : null,
      error_text: malformed ? "malformed_json" : null,
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
    await writeWebhookDeadLetter(
      db,
      {
        orgId,
        reason: "insert_failed",
        eventType: parsed.eventType,
        providerEventId: parsed.providerEventId,
        rawBody: args.rawBody,
        payload: parsed.payload,
      },
      { required: true }
    );
    throw new Error("webhook_insert_failed");
  }

  if (malformed) {
    await writeWebhookDeadLetter(db, {
      orgId,
      webhookEventId: data?.id ?? null,
      reason: "malformed_json",
      eventType: parsed.eventType,
      providerEventId: parsed.providerEventId,
      rawBody: args.rawBody,
      payload: parsed.payload,
    });
  }

  ghlLog("ghl.webhook.received", {
    eventType: parsed.eventType,
    providerEventId: parsed.providerEventId,
    orgResolved: Boolean(orgId),
    duplicate: false,
    eventId: data?.id ?? null,
    malformed,
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

async function persistRejection(db: GhlDb, reason: "missing" | "invalid", rawBody: string) {
  // Do not parse or copy the forged body onto webhook_events. The dead-letter
  // row keeps the bytes so a real event is not lost; the events table must not
  // treat an unsigned blob as a payload.
  const { data, error } = await db
    .from("webhook_events")
    .insert({
      org_id: null,
      source: "ghl",
      event_type: `rejected.${reason}`,
      payload: {},
      processed: true,
      status: "rejected",
      processed_at: new Date().toISOString(),
      error_text: reason,
    })
    .select("id")
    .maybeSingle();

  await writeWebhookDeadLetter(
    db,
    {
      orgId: null,
      webhookEventId: data?.id ?? null,
      reason: signatureDeadLetterReason(reason),
      eventType: `rejected.${reason}`,
      providerEventId: null,
      rawBody,
      payload: null,
    },
    { required: Boolean(error) || !data }
  );
}
