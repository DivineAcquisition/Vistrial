import type { Json } from "@/types/database";

import { parseWebhookPayload } from "@/lib/ghl/payload";
import { ghlLog, ghlWarn } from "@/lib/ghl/log";
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
  }
): Promise<IngestResult> {
  const verified: SignatureResult = verifyGhlWebhookSignature({
    rawBody: args.rawBody,
    ghlSignature: args.ghlSignature,
    legacySignature: args.legacySignature,
  });

  if (!verified.ok) {
    await recordRejection(db, verified.reason, args.rawBody.length);
    ghlWarn("ghl.webhook.rejected", { reason: verified.reason, bytes: args.rawBody.length });
    return { httpStatus: 401, reason: verified.reason };
  }

  const parsed = parseWebhookPayload(args.rawBody);
  return persistGhlWebhookEvent(db, {
    parsed,
    orgId: parsed.locationId ? await orgIdForLocation(db, parsed.locationId) : null,
  });
}

/** Persist after signature verification. Go-live uses this path; it cannot mint GHL signatures. */
export async function persistGhlWebhookEvent(
  db: GhlDb,
  args: {
    parsed: ReturnType<typeof parseWebhookPayload>;
    orgId: string | null;
  }
): Promise<IngestResult> {
  const { parsed, orgId } = args;
  const { data, error } = await db
    .from("webhook_events")
    .insert({
      org_id: orgId,
      source: "ghl",
      event_type: parsed.eventType,
      payload: parsed.payload,
      provider_event_id: parsed.providerEventId,
      contact_key: parsed.contactKey,
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
